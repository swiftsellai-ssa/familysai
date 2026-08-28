/**
 * Parent-only magic link: issue, consume, logout.
 *
 * POST /api/v1/auth/magic-link          { email } → always { ok: true }
 * POST /api/v1/auth/magic-link/consume  { token } → { ok: true } + fk_session
 * POST /api/v1/auth/logout              → 204
 *
 * No GET consume. Child never has an identity. No AUTH=off.
 * Waitlist mode never auto-bootstraps a household.
 */

import { Hono, type Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { first, run } from "./db";
import {
	MAGIC_TTL_MS,
	SESSION_MAX_AGE_SEC,
	hmacSha256Hex,
	mintSessionCookieValue,
	randomHex,
	secretLongEnough,
	verifySessionCookie,
} from "./hmac";
import { canSendMagicLink, mailerRejectedAtBoot, sendMagicLinkEmail } from "./mailer";
import { clientIp, requestOrigin } from "./origin";
import { SESSION_COOKIE } from "./session";

const EMAIL_RE = /^[^\s@]+@[^\s@]+$/;
const EMAIL_MAX = 254;
const TOKEN_HEX_RE = /^[0-9a-f]{64}$/i;
const RATE_EMAIL_PER_HOUR = 5;
const RATE_IP_PER_HOUR = 20;

type JsonError = { error: string; message: string };

function errorJson(error: string, message: string): JsonError {
	return { error, message };
}

function isValidEmail(email: string): boolean {
	if (email.length === 0 || email.length > EMAIL_MAX) return false;
	return EMAIL_RE.test(email);
}

function nowIso(ms = Date.now()): string {
	return new Date(ms).toISOString();
}

function dogfoodMailbox(env: Env): string | null {
	const raw = typeof env.DOFOOD_EMAIL === "string" ? env.DOFOOD_EMAIL.trim() : "";
	if (!raw) return null;
	return raw.toLowerCase();
}

type ParentRow = { household_id: string; id: string; email: string };

async function findParentByEmail(db: D1Database, email: string): Promise<ParentRow | null> {
	return first<ParentRow>(
		db,
		`SELECT household_id, id, email FROM parents WHERE lower(email) = ?1`,
		[email],
	);
}

async function bumpRate(
	db: D1Database,
	key: string,
	windowStart: number,
): Promise<number> {
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

async function bootstrapDogfoodParent(
	db: D1Database,
	email: string,
): Promise<ParentRow> {
	const hid = `hid_${randomHex(16)}`;
	const parentId = "parent_a";
	await db.batch([
		db.prepare(
			`INSERT INTO households (id, name, dogfood, onboarded)
			 VALUES (?1, 'Home', 1, 0)`,
		).bind(hid),
		db.prepare(
			`INSERT INTO parents (household_id, id, email, display_name)
			 VALUES (?1, ?2, ?3, 'Parent')`,
		).bind(hid, parentId, email),
		db.prepare(
			`INSERT INTO members (household_id, id, role, label)
			 VALUES (?1, ?2, 'parent', 'Parent')`,
		).bind(hid, parentId),
	]);
	return { household_id: hid, id: parentId, email };
}

function setSessionCookie(c: Context, value: string) {
	setCookie(c, SESSION_COOKIE, value, {
		path: "/",
		httpOnly: true,
		secure: true,
		sameSite: "Lax",
		maxAge: SESSION_MAX_AGE_SEC,
	});
}

function clearSessionCookie(c: Context) {
	deleteCookie(c, SESSION_COOKIE, {
		path: "/",
		secure: true,
		sameSite: "Lax",
		httpOnly: true,
	});
}

export function createAuth() {
	const app = new Hono<{ Bindings: Env }>();

	app.post("/magic-link", async (c) => {
		if (mailerRejectedAtBoot(c.env)) {
			console.log(JSON.stringify({ evt: "auth.mailer_rejected" }));
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
		const email =
			typeof rec.email === "string" ? rec.email.trim().toLowerCase() : "";
		if (!isValidEmail(email)) {
			return c.json(errorJson("validation", "A valid email is required."), 400);
		}

		const ip = clientIp(c.req.raw.headers);
		const windowStart = Math.floor(Date.now() / 1000 / 3600);
		let emailCount = 0;
		let ipCount = 0;
		try {
			emailCount = await bumpRate(c.env.DB, `email:magic:${email}`, windowStart);
			ipCount = await bumpRate(c.env.DB, `ip:magic:${ip}`, windowStart);
		} catch {
			console.log(JSON.stringify({ evt: "auth.rate_limit", ok: false }));
			return c.json({ ok: true });
		}
		if (emailCount > RATE_EMAIL_PER_HOUR || ipCount > RATE_IP_PER_HOUR) {
			return c.json(errorJson("rate_limited", "Too many requests. Try again later."), 429);
		}

		const signups = String(c.env.SIGNUPS_OPEN ?? "");
		const dogfood = dogfoodMailbox(c.env);
		let parent = await findParentByEmail(c.env.DB, email);
		let issue = false;
		let bootstrap = false;

		if (signups === "dogfood") {
			if (dogfood && email === dogfood) {
				if (parent) issue = true;
				else {
					bootstrap = true;
					issue = true;
				}
			}
		} else if (signups === "waitlist") {
			if (parent) issue = true;
		}

		const signingKey = c.env.MAGIC_LINK_SIGNING_KEY;
		if (
			!issue ||
			typeof signingKey !== "string" ||
			signingKey.length === 0 ||
			!canSendMagicLink(c.env)
		) {
			return c.json({ ok: true });
		}

		if (bootstrap && !parent) {
			try {
				parent = await bootstrapDogfoodParent(c.env.DB, email);
			} catch {
				console.log(JSON.stringify({ evt: "auth.bootstrap_failed" }));
				return c.json({ ok: true });
			}
		}
		if (!parent) return c.json({ ok: true });

		const token = randomHex(32);
		const tokenHash = await hmacSha256Hex(signingKey, token);
		const expiresAt = nowIso(Date.now() + MAGIC_TTL_MS);
		try {
			await run(
				c.env.DB,
				`INSERT INTO magic_link_tokens
				 (token_hash, household_id, parent_id, expires_at, consumed_at)
				 VALUES (?1, ?2, ?3, ?4, NULL)`,
				[tokenHash, parent.household_id, parent.id, expiresAt],
			);
		} catch {
			console.log(JSON.stringify({ evt: "auth.token_insert_failed" }));
			return c.json({ ok: true });
		}

		const url = `${requestOrigin(c.req.raw)}/auth/callback?token=${token}`;
		const sent = await sendMagicLinkEmail(c.env, {
			to: email,
			url,
			parentId: parent.id,
		});
		if (sent && String(c.env.MAILER) !== "log") {
			console.log(JSON.stringify({ evt: "auth.magic_issued" }));
		}
		return c.json({ ok: true });
	});

	app.post("/magic-link/consume", async (c) => {
		const signingKey = c.env.MAGIC_LINK_SIGNING_KEY;
		const sessionSecret = c.env.SESSION_SECRET;
		if (
			typeof signingKey !== "string" ||
			signingKey.length === 0 ||
			!secretLongEnough(sessionSecret)
		) {
			return c.json({ error: "unauthenticated" }, 401);
		}

		let body: unknown;
		try {
			body = await c.req.json();
		} catch {
			return c.json({ error: "unauthenticated" }, 401);
		}
		if (body === null || typeof body !== "object" || Array.isArray(body)) {
			return c.json({ error: "unauthenticated" }, 401);
		}
		const token =
			typeof (body as Record<string, unknown>).token === "string"
				? ((body as Record<string, unknown>).token as string).trim()
				: "";
		if (!TOKEN_HEX_RE.test(token)) {
			return c.json({ error: "unauthenticated" }, 401);
		}

		const tokenHash = await hmacSha256Hex(signingKey, token);
		const now = nowIso();
		const consumed = await first<{ parent_id: string; household_id: string }>(
			c.env.DB,
			`UPDATE magic_link_tokens
			 SET consumed_at = ?1
			 WHERE token_hash = ?2 AND consumed_at IS NULL AND expires_at > ?1
			 RETURNING parent_id, household_id`,
			[now, tokenHash],
		);
		if (!consumed) {
			return c.json({ error: "unauthenticated" }, 401);
		}

		const sessionId = `sess_${randomHex(16)}`;
		const expiresAt = nowIso(Date.now() + SESSION_MAX_AGE_SEC * 1000);
		try {
			await run(
				c.env.DB,
				`INSERT INTO sessions (id, household_id, parent_id, expires_at, kiosk)
				 VALUES (?1, ?2, ?3, ?4, 0)`,
				[sessionId, consumed.household_id, consumed.parent_id, expiresAt],
			);
		} catch {
			return c.json({ error: "unauthenticated" }, 401);
		}

		const cookieVal = await mintSessionCookieValue(sessionId, sessionSecret);
		setSessionCookie(c, cookieVal);

		const household = await first<{ onboarded: number }>(
			c.env.DB,
			`SELECT onboarded FROM households WHERE id = ?1`,
			[consumed.household_id],
		);
		console.log(JSON.stringify({ evt: "auth.magic_consumed" }));
		return c.json({
			ok: true,
			onboarded: household?.onboarded ?? 0,
		});
	});

	app.post("/logout", async (c) => {
		const secret = c.env.SESSION_SECRET;
		const raw = getCookie(c, SESSION_COOKIE);
		const id = await verifySessionCookie(raw, secret);
		if (id) {
			try {
				await run(c.env.DB, `DELETE FROM sessions WHERE id = ?1`, [id]);
			} catch {
				// still 204
			}
		}
		clearSessionCookie(c);
		return c.body(null, 204);
	});

	return app;
}
