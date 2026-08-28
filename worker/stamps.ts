/**
 * Stamp records (homework gate).
 *
 * POST /api/v1/stamps
 * GET  /api/v1/stamps/:id
 * PUT  /api/v1/stamps/:id   { paragraph?, notes?, due? }
 *
 * Session household only. Never read household_id from the client body.
 * No AUTH=off. No Accept / request-changes / textbook / inbox list (PR-8).
 * Kiosk enter/exit/PIN is PR-8. Until then, parent selects member_id on
 * a non-kiosk POST (child is a label, never a login).
 *
 * PR-8 will deny kiosk sessions on PUT (and inbox/Accept). Comment only
 * in this PR — do not implement kiosk deny yet.
 */

import { Hono } from "hono";
import { householdIdFromSession, scopedFirst, scopedRun } from "./db";
import { writeStampMd, writeStampYaml } from "./files";
import { requireParent, type SessionEnv } from "./session";

const PRIVATE = { "Cache-Control": "private, no-store" } as const;
const TITLE_MAX = 200;
const CHECKED_MAX = 2048;
const NOTES_MAX = 8 * 1024;
const DUE_MAX = 64;
const PARAGRAPH_MAX = 32 * 1024;
const USED_AI = ["outline", "wording", "image", "none"] as const;

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

type MemberRow = { id: string; role: string };

function errorJson(error: string, message: string) {
	return { error, message };
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

function stampJson(row: StampRow) {
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

const STAMP_SELECT = `SELECT id, household_id, member_id, title, due, used_ai_for,
	checked_against, notes, status, parent_id, paragraph, created_at, decided_at
	FROM stamps WHERE household_id = ?1 AND id = ?2`;

export function createStamps() {
	const app = new Hono<SessionEnv>();
	app.use("*", requireParent);

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
		// household_id from the session only — ignore any body field of that name.

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

		// Non-kiosk (all sessions today): parent must pick which child.
		// After PR-8 kiosk enter, member_id comes from sessions.kiosk_member_id.
		const memberId = typeof rec.member_id === "string" ? rec.member_id.trim() : "";
		if (!memberId) {
			return c.json(errorJson("validation", "member_id is required until kiosk enter."), 400);
		}

		const dueOpt = optionalText(rec, "due", DUE_MAX);
		if (!dueOpt.ok) {
			return c.json(errorJson("validation", "due is invalid."), 400);
		}
		const notesOpt = optionalText(rec, "notes", NOTES_MAX);
		if (!notesOpt.ok) {
			return c.json(errorJson("validation", "notes is invalid."), 400);
		}

		const hid = householdIdFromSession(c.get("session"));
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
					[id, memberId, title, dueOpt.value, usedJson, checked, notesOpt.value],
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

		console.log(
			JSON.stringify({
				evt: "stamp.create",
				household_id: hid,
				stamp_id: created.id,
			}),
		);
		await writeThrough(c.env, hid, created);
		return c.json(stampJson(created), 200, PRIVATE);
	});

	app.get("/:id", async (c) => {
		const id = c.req.param("id");
		if (!id || id.length > 128) {
			return c.json(errorJson("not_found", "Stamp not found."), 404);
		}
		const hid = householdIdFromSession(c.get("session"));
		const row = await scopedFirst<StampRow>(c.env.DB, hid, STAMP_SELECT, [id]);
		if (!row) {
			return c.json(errorJson("not_found", "Stamp not found."), 404);
		}
		return c.json(stampJson(row), 200, PRIVATE);
	});

	app.put("/:id", async (c) => {
		// PR-8: kiosk sessions will be denied here (deny-by-default allowlist).
		// This PR does not implement kiosk enter/exit; all sessions today are non-kiosk.
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

	// Inbox list, Accept, request-changes, textbook, kiosk enter/exit are PR-8.
	app.all("*", (c) => c.json(errorJson("not_found", "Not found."), 404));

	return app;
}
