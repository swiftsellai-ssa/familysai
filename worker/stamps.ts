/**
 * Stamp records (homework gate).
 *
 * POST /api/v1/stamps
 * GET  /api/v1/stamps              inbox (non-kiosk; default status=pending)
 * GET  /api/v1/stamps/:id
 * PUT  /api/v1/stamps/:id          { paragraph?, notes?, due? }  kiosk denied via middleware
 * POST /api/v1/stamps/:id/accept   kiosk denied via middleware
 * POST /api/v1/stamps/:id/request-changes
 * POST /api/v1/stamps/kiosk/enter  { member_id, pin }
 * POST /api/v1/stamps/kiosk/exit   { pin }
 *
 * Session household only. Never read household_id from the client body.
 * No AUTH=off. Child never has an identity. Parent selects member_id on
 * kiosk enter, not on kid submit.
 */

import { Hono, type Context } from "hono";
import { deleteCookie, setCookie } from "hono/cookie";
import { first, householdIdFromSession, scopedAll, scopedFirst, scopedRun } from "./db";
import { writeStampMd, writeStampYaml } from "./files";
import { requireParent, type SessionEnv, KIOSK_COOKIE } from "./session";
import {
	PIN_FAILURES,
	isFourDigitPin,
	pinMatches,
	pinRateKey,
	pinWindowStart,
} from "./pin";

const PRIVATE = { "Cache-Control": "private, no-store" } as const;
const TITLE_MAX = 200;
const CHECKED_MAX = 2048;
const NOTES_MAX = 8 * 1024;
const DUE_MAX = 64;
const PARAGRAPH_MAX = 32 * 1024;
const USED_AI = ["outline", "wording", "image", "none"] as const;
const KIOSK_COOKIE_MAX_AGE = 3600;
const STATUS_OK = ["pending", "accepted", "changes_requested"] as const;

type UsedAiFor = (typeof USED_AI)[number];

type StampRow = {
	id: string;
	household_id: string;
	member_id: string;
	title: string;
	due: string | null;
	used_ai_for: string;
	checked_against: string;
	notes: string | null;
	status: string;
	parent_id: string | null;
	paragraph: string | null;
	created_at: string;
	decided_at: string | null;
};

type MemberRow = { id: string; role: string; label?: string };
type PinCols = { kiosk_pin_hash: string | null; kiosk_pin_salt: string | null };

function errorJson(error: string, message?: string) {
	return message ? { error, message } : { error };
}

function isUsedAiFor(v: unknown): v is UsedAiFor {
	return typeof v === "string" && (USED_AI as readonly string[]).includes(v);
}

function parseUsedAiForJson(raw: string): UsedAiFor[] {
	try {
		const parsed = JSON.parse(raw) as unknown;
		if (!Array.isArray(parsed)) return [];
		return parsed.filter(isUsedAiFor);
	} catch {
		return [];
	}
}

function stampJson(row: StampRow, extra: Record<string, unknown> = {}) {
	return {
		id: row.id,
		member_id: row.member_id,
		title: row.title,
		due: row.due,
		used_ai_for: parseUsedAiForJson(row.used_ai_for),
		checked_against: row.checked_against,
		notes: row.notes,
		status: row.status,
		parent_id: row.parent_id,
		paragraph: row.paragraph,
		created_at: row.created_at,
		decided_at: row.decided_at,
		...extra,
	};
}

function inboxJson(
	row: StampRow & { member_label?: string | null },
) {
	return {
		id: row.id,
		member_id: row.member_id,
		member_label: row.member_label ?? null,
		title: row.title,
		due: row.due,
		used_ai_for: parseUsedAiForJson(row.used_ai_for),
		checked_against: row.checked_against,
		notes: row.notes,
		status: row.status,
		parent_id: row.parent_id,
		created_at: row.created_at,
		decided_at: row.decided_at,
	};
}

function stampYamlDoc(row: StampRow) {
	return {
		id: row.id,
		kid: row.member_id,
		title: row.title,
		due: row.due,
		used_ai_for: parseUsedAiForJson(row.used_ai_for),
		checked_against: row.checked_against,
		notes: row.notes,
		status: row.status,
		parent: row.parent_id,
	};
}

function stampMarkdown(row: StampRow): string {
	const used = parseUsedAiForJson(row.used_ai_for).join(", ") || "—";
	const due = row.due ? `\n- Due: ${row.due}` : "";
	const notes = row.notes ? `\n\n${row.notes}` : "";
	return `# ${row.title}

- Child: ${row.member_id}
- Used AI for: ${used}
- Checked against: ${row.checked_against}
- Status: ${row.status}${due}${notes}
`;
}

async function writeThrough(env: Env, hid: string, row: StampRow): Promise<void> {
	await writeStampYaml(env, hid, row.id, stampYamlDoc(row));
	await writeStampMd(env, hid, row.id, stampMarkdown(row));
}

function slugify(title: string): string {
	const s = title
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 40);
	return s || "stamp";
}

function utcDateCompact(d = new Date()): string {
	const y = d.getUTCFullYear();
	const m = String(d.getUTCMonth() + 1).padStart(2, "0");
	const day = String(d.getUTCDate()).padStart(2, "0");
	return `${y}${m}${day}`;
}

function stampId(title: string, n: number): string {
	const base = `st_${utcDateCompact()}_${slugify(title)}`;
	return n > 1 ? `${base}-${n}` : base;
}

function isUniqueConflict(err: unknown): boolean {
	const msg = err instanceof Error ? err.message : String(err);
	return /UNIQUE constraint failed/i.test(msg);
}

function optionalText(
	rec: Record<string, unknown>,
	key: string,
	max: number,
): { ok: true; value: string | null } | { ok: false } {
	if (!(key in rec) || rec[key] === null || rec[key] === undefined) {
		return { ok: true, value: null };
	}
	if (typeof rec[key] !== "string") return { ok: false };
	if (rec[key].length > max) return { ok: false };
	const trimmed = rec[key].trim();
	return { ok: true, value: trimmed.length === 0 ? null : trimmed };
}

function nowIso(ms = Date.now()): string {
	return new Date(ms).toISOString();
}

async function bumpPinFailures(db: D1Database, householdId: string): Promise<number> {
	const windowStart = pinWindowStart();
	const key = pinRateKey(householdId);
	const row = await first<{ count: number }>(
		db,
		`INSERT INTO rate_limits (key, window_start, count)
		 VALUES (?1, ?2, 1)
		 ON CONFLICT (key, window_start) DO UPDATE SET count = count + 1
		 RETURNING count`,
		[key, windowStart],
	);
	return row?.count ?? 1;
}

async function pinFailureCount(db: D1Database, householdId: string): Promise<number> {
	const windowStart = pinWindowStart();
	const key = pinRateKey(householdId);
	const row = await first<{ count: number }>(
		db,
		`SELECT count FROM rate_limits WHERE key = ?1 AND window_start = ?2`,
		[key, windowStart],
	);
	return row?.count ?? 0;
}

async function loadPinCols(db: D1Database, hid: string): Promise<PinCols | null> {
	return first<PinCols>(
		db,
		`SELECT kiosk_pin_hash, kiosk_pin_salt FROM households WHERE id = ?1`,
		[hid],
	);
}

function setKioskCookie(c: Parameters<typeof setCookie>[0]) {
	setCookie(c, KIOSK_COOKIE, "1", {
		path: "/",
		httpOnly: true,
		secure: true,
		sameSite: "Lax",
		maxAge: KIOSK_COOKIE_MAX_AGE,
	});
}

function clearKioskCookie(c: Parameters<typeof deleteCookie>[0]) {
	deleteCookie(c, KIOSK_COOKIE, {
		path: "/",
		secure: true,
		sameSite: "Lax",
		httpOnly: true,
	});
}

const STAMP_SELECT = `SELECT id, household_id, member_id, title, due, used_ai_for,
	checked_against, notes, status, parent_id, paragraph, created_at, decided_at
	FROM stamps WHERE household_id = ?1 AND id = ?2`;

const INBOX_SELECT = `SELECT s.id, s.household_id, s.member_id, s.title, s.due, s.used_ai_for,
	s.checked_against, s.notes, s.status, s.parent_id, s.paragraph, s.created_at, s.decided_at,
	m.label AS member_label
	FROM stamps s
	JOIN members m ON m.household_id = s.household_id AND m.id = s.member_id
	WHERE s.household_id = ?1 AND s.status = ?2
	ORDER BY s.created_at ASC`;

export function createStamps() {
	const app = new Hono<SessionEnv>();
	app.use("*", requireParent);

	app.post("/kiosk/enter", async (c) => {
		const session = c.get("session");
		if (session.kiosk) {
			return c.json(errorJson("kiosk_denied"), 403);
		}

		let body: unknown;
		try {
			body = await c.req.json();
		} catch {
			return c.json(errorJson("validation", "Request body must be JSON."), 400);
		}
		if (body === null || typeof body !== "object" || Array.isArray(body)) {
			return c.json(errorJson("validation", "Request body must be a JSON object."), 400);
		}
		const rec = body as Record<string, unknown>;
		const memberId = typeof rec.member_id === "string" ? rec.member_id.trim() : "";
		if (!memberId) {
			return c.json(errorJson("validation", "member_id is required."), 400);
		}

		const hid = householdIdFromSession(session);
		const member = await scopedFirst<MemberRow>(
			c.env.DB,
			hid,
			`SELECT id, role FROM members WHERE household_id = ?1 AND id = ?2`,
			[memberId],
		);
		if (!member || member.role !== "child") {
			return c.json(errorJson("validation", "member_id must be a child in this household."), 400);
		}

		const cols = await loadPinCols(c.env.DB, hid);
		if (!cols || cols.kiosk_pin_hash == null || cols.kiosk_pin_hash.length === 0) {
			return c.json(errorJson("kiosk_pin_required"), 403);
		}

		if (!isFourDigitPin(rec.pin)) {
			return c.json(errorJson("kiosk_denied"), 403);
		}

		const failures = await pinFailureCount(c.env.DB, hid);
		if (failures >= PIN_FAILURES) {
			return c.json(errorJson("rate_limited", "Too many PIN attempts. Try again later."), 429);
		}

		const salt = cols.kiosk_pin_salt ?? "";
		const ok = await pinMatches(salt, rec.pin, cols.kiosk_pin_hash);
		if (!ok) {
			const n = await bumpPinFailures(c.env.DB, hid);
			if (n >= PIN_FAILURES) {
				return c.json(errorJson("rate_limited", "Too many PIN attempts. Try again later."), 429);
			}
			return c.json(errorJson("kiosk_denied"), 403);
		}

		await scopedRun(
			c.env.DB,
			hid,
			`UPDATE sessions
			 SET kiosk = 1, kiosk_member_id = ?2, kiosk_stamp_id = NULL
			 WHERE household_id = ?1 AND id = ?3`,
			[memberId, session.id],
		);
		setKioskCookie(c);
		console.log(JSON.stringify({ evt: "kiosk.enter", household_id: hid }));
		return c.json({ ok: true, kiosk_member_id: memberId }, 200, PRIVATE);
	});

	app.post("/kiosk/exit", async (c) => {
		let body: unknown;
		try {
			body = await c.req.json();
		} catch {
			return c.json(errorJson("kiosk_denied"), 403);
		}
		if (body === null || typeof body !== "object" || Array.isArray(body)) {
			return c.json(errorJson("kiosk_denied"), 403);
		}
		const pin = (body as Record<string, unknown>).pin;
		if (typeof pin !== "string" || pin.length === 0) {
			return c.json(errorJson("kiosk_denied"), 403);
		}

		const session = c.get("session");
		const hid = householdIdFromSession(session);

		if (!isFourDigitPin(pin)) {
			return c.json(errorJson("kiosk_denied"), 403);
		}

		const cols = await loadPinCols(c.env.DB, hid);
		if (!cols || cols.kiosk_pin_hash == null || cols.kiosk_pin_hash.length === 0) {
			return c.json(errorJson("kiosk_denied"), 403);
		}

		const failures = await pinFailureCount(c.env.DB, hid);
		if (failures >= PIN_FAILURES) {
			return c.json(errorJson("rate_limited", "Too many PIN attempts. Try again later."), 429);
		}

		const salt = cols.kiosk_pin_salt ?? "";
		const ok = await pinMatches(salt, pin, cols.kiosk_pin_hash);
		if (!ok) {
			const n = await bumpPinFailures(c.env.DB, hid);
			if (n >= PIN_FAILURES) {
				return c.json(errorJson("rate_limited", "Too many PIN attempts. Try again later."), 429);
			}
			return c.json(errorJson("kiosk_denied"), 403);
		}

		await scopedRun(
			c.env.DB,
			hid,
			`UPDATE sessions
			 SET kiosk = 0, kiosk_member_id = NULL, kiosk_stamp_id = NULL
			 WHERE household_id = ?1 AND id = ?2`,
			[session.id],
		);
		clearKioskCookie(c);
		console.log(JSON.stringify({ evt: "kiosk.exit", household_id: hid }));
		return c.json({ ok: true }, 200, PRIVATE);
	});

	app.get("/", async (c) => {
		const hid = householdIdFromSession(c.get("session"));
		const raw = c.req.query("status");
		const status =
			raw == null || raw === ""
				? "pending"
				: STATUS_OK.includes(raw as (typeof STATUS_OK)[number])
					? raw
					: null;
		if (!status) {
			return c.json(errorJson("validation", "status is invalid."), 400);
		}
		const rows = await scopedAll<StampRow & { member_label: string }>(
			c.env.DB,
			hid,
			INBOX_SELECT,
			[status],
		);
		return c.json({ stamps: rows.map(inboxJson) }, 200, PRIVATE);
	});

	app.post("/", async (c) => {
		let body: unknown;
		try {
			body = await c.req.json();
		} catch {
			return c.json(errorJson("validation", "Request body must be JSON."), 400);
		}
		if (body === null || typeof body !== "object" || Array.isArray(body)) {
			return c.json(errorJson("validation", "Request body must be a JSON object."), 400);
		}
		const rec = body as Record<string, unknown>;
		const session = c.get("session");
		const kiosk = Boolean(session.kiosk);

		if (kiosk) {
			if ("member_id" in rec || "due" in rec || "notes" in rec || "paragraph" in rec) {
				return c.json(errorJson("validation", "Kiosk stamp accepts three fields only."), 400);
			}
		}

		const title = typeof rec.title === "string" ? rec.title.trim() : "";
		if (!title || title.length > TITLE_MAX) {
			return c.json(errorJson("validation", "title is required."), 400);
		}

		if (!Array.isArray(rec.used_ai_for) || rec.used_ai_for.length === 0) {
			return c.json(errorJson("validation", "used_ai_for is required."), 400);
		}
		const used: UsedAiFor[] = [];
		for (const item of rec.used_ai_for) {
			if (!isUsedAiFor(item)) {
				return c.json(errorJson("validation", "used_ai_for is invalid."), 400);
			}
			if (!used.includes(item)) used.push(item);
		}
		if (used.includes("none") && used.length !== 1) {
			return c.json(errorJson("validation", "none cannot combine with other used_ai_for values."), 400);
		}

		const checked =
			typeof rec.checked_against === "string" ? rec.checked_against.trim() : "";
		if (!checked || checked.length > CHECKED_MAX) {
			return c.json(errorJson("validation", "checked_against is required."), 400);
		}

		const hid = householdIdFromSession(session);
		let memberId: string;
		let dueVal: string | null = null;
		let notesVal: string | null = null;

		if (kiosk) {
			const fromSession = session.kiosk_member_id;
			if (typeof fromSession !== "string" || fromSession.length === 0) {
				return c.json(errorJson("validation", "kiosk member is not set."), 400);
			}
			memberId = fromSession;
		} else {
			memberId = typeof rec.member_id === "string" ? rec.member_id.trim() : "";
			if (!memberId) {
				return c.json(errorJson("validation", "member_id is required."), 400);
			}
			const dueOpt = optionalText(rec, "due", DUE_MAX);
			if (!dueOpt.ok) {
				return c.json(errorJson("validation", "due is invalid."), 400);
			}
			const notesOpt = optionalText(rec, "notes", NOTES_MAX);
			if (!notesOpt.ok) {
				return c.json(errorJson("validation", "notes is invalid."), 400);
			}
			dueVal = dueOpt.value;
			notesVal = notesOpt.value;
		}

		const member = await scopedFirst<MemberRow>(
			c.env.DB,
			hid,
			`SELECT id, role FROM members WHERE household_id = ?1 AND id = ?2`,
			[memberId],
		);
		if (!member || member.role !== "child") {
			return c.json(errorJson("validation", "member_id must be a child in this household."), 400);
		}

		const usedJson = JSON.stringify(used);
		let created: StampRow | null = null;
		for (let n = 1; n <= 32; n++) {
			const id = stampId(title, n);
			try {
				await scopedRun(
					c.env.DB,
					hid,
					`INSERT INTO stamps (
						household_id, id, member_id, title, due, used_ai_for,
						checked_against, notes, status
					) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'pending')`,
					[id, memberId, title, dueVal, usedJson, checked, notesVal],
				);
				created = await scopedFirst<StampRow>(c.env.DB, hid, STAMP_SELECT, [id]);
				break;
			} catch (err) {
				if (isUniqueConflict(err) && n < 32) continue;
				throw err;
			}
		}
		if (!created) {
			return c.json(errorJson("validation", "Could not allocate a stamp id."), 400);
		}

		if (kiosk) {
			await scopedRun(
				c.env.DB,
				hid,
				`UPDATE sessions SET kiosk_stamp_id = ?2 WHERE household_id = ?1 AND id = ?3`,
				[created.id, session.id],
			);
		}

		console.log(
			JSON.stringify({
				evt: "stamp.create",
				household_id: hid,
				stamp_id: created.id,
				kiosk,
			}),
		);
		await writeThrough(c.env, hid, created);
		return c.json(stampJson(created), 200, PRIVATE);
	});

	app.post("/:id/accept", async (c) => {
		return decideStamp(c, "accepted", "stamp.accept");
	});

	app.post("/:id/request-changes", async (c) => {
		return decideStamp(c, "changes_requested", "stamp.request_changes");
	});

	app.get("/:id", async (c) => {
		const id = c.req.param("id");
		if (!id || id.length > 128) {
			return c.json(errorJson("not_found", "Stamp not found."), 404);
		}
		const session = c.get("session");
		if (session.kiosk) {
			if (!session.kiosk_stamp_id || session.kiosk_stamp_id !== id) {
				return c.json(errorJson("kiosk_denied"), 403);
			}
		}
		const hid = householdIdFromSession(session);
		const row = await scopedFirst<StampRow>(c.env.DB, hid, STAMP_SELECT, [id]);
		if (!row) {
			return c.json(errorJson("not_found", "Stamp not found."), 404);
		}
		return c.json(stampJson(row), 200, PRIVATE);
	});

	app.put("/:id", async (c) => {
		const id = c.req.param("id");
		if (!id || id.length > 128) {
			return c.json(errorJson("not_found", "Stamp not found."), 404);
		}

		let body: unknown;
		try {
			body = await c.req.json();
		} catch {
			return c.json(errorJson("validation", "Request body must be JSON."), 400);
		}
		if (body === null || typeof body !== "object" || Array.isArray(body)) {
			return c.json(errorJson("validation", "Request body must be a JSON object."), 400);
		}
		const rec = body as Record<string, unknown>;

		if ("paragraph" in rec && rec.paragraph !== null && rec.paragraph !== undefined) {
			if (typeof rec.paragraph !== "string" || rec.paragraph.length > PARAGRAPH_MAX) {
				return c.json(errorJson("validation", "paragraph is too long."), 400);
			}
		}
		const notesOpt = optionalText(rec, "notes", NOTES_MAX);
		if (!notesOpt.ok) {
			return c.json(errorJson("validation", "notes is invalid."), 400);
		}
		const dueOpt = optionalText(rec, "due", DUE_MAX);
		if (!dueOpt.ok) {
			return c.json(errorJson("validation", "due is invalid."), 400);
		}

		const hid = householdIdFromSession(c.get("session"));
		const existing = await scopedFirst<StampRow>(c.env.DB, hid, STAMP_SELECT, [id]);
		if (!existing) {
			return c.json(errorJson("not_found", "Stamp not found."), 404);
		}

		const paragraph = !("paragraph" in rec)
			? existing.paragraph
			: typeof rec.paragraph === "string"
				? rec.paragraph
				: rec.paragraph === null
					? null
					: existing.paragraph;
		const notes = "notes" in rec ? notesOpt.value : existing.notes;
		const due = "due" in rec ? dueOpt.value : existing.due;

		await scopedRun(
			c.env.DB,
			hid,
			`UPDATE stamps SET paragraph = ?2, notes = ?3, due = ?4
			 WHERE household_id = ?1 AND id = ?5`,
			[paragraph, notes, due, id],
		);
		const updated = await scopedFirst<StampRow>(c.env.DB, hid, STAMP_SELECT, [id]);
		if (!updated) {
			return c.json(errorJson("not_found", "Stamp not found."), 404);
		}
		await writeThrough(c.env, hid, updated);
		return c.json(stampJson(updated), 200, PRIVATE);
	});

	app.all("*", (c) => c.json(errorJson("not_found", "Not found."), 404));

	return app;
}

async function decideStamp(
	c: Context<SessionEnv>,
	status: "accepted" | "changes_requested",
	evt: string,
) {
	const id = c.req.param("id");
	if (!id || id.length > 128) {
		return c.json(errorJson("not_found", "Stamp not found."), 404);
	}
	const session = c.get("session");
	const hid = householdIdFromSession(session);
	const existing = await scopedFirst<StampRow>(c.env.DB, hid, STAMP_SELECT, [id]);
	if (!existing) {
		return c.json(errorJson("not_found", "Stamp not found."), 404);
	}
	const decidedAt = nowIso();
	await scopedRun(
		c.env.DB,
		hid,
		`UPDATE stamps SET status = ?2, decided_at = ?3, parent_id = ?4
		 WHERE household_id = ?1 AND id = ?5`,
		[status, decidedAt, session.parent_id, id],
	);
	const updated = await scopedFirst<StampRow>(c.env.DB, hid, STAMP_SELECT, [id]);
	if (!updated) {
		return c.json(errorJson("not_found", "Stamp not found."), 404);
	}
	console.log(
		JSON.stringify({
			evt,
			household_id: hid,
			stamp_id: updated.id,
			parent_id: session.parent_id,
		}),
	);
	await writeThrough(c.env, hid, updated);
	return c.json(stampJson(updated), 200, PRIVATE);
}
