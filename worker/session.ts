/**
 * Parent session from cookie `fk_session=<session_id>.<hmac>`.
 *
 * HMAC is HMAC-SHA256(session_id, SESSION_SECRET). Reject a bad HMAC
 * before the D1 lookup. Raw `sess_dogfood_local` without HMAC is 401.
 *
 * There is no AUTH=off header, query, or env bypass. Missing secret,
 * missing cookie, invalid HMAC, or expired sessions are unauthenticated.
 * household_id comes from the D1 row, never from the client body.
 *
 * Do not write last_seen_at on every request. 14-day expiry from login.
 * Cookie Path=/. Kiosk deny-by-default allowlist is PR-8.
 */

import type { Context, Next } from "hono";
import { getCookie } from "hono/cookie";
import { first } from "./db";
import { secretLongEnough, verifySessionCookie } from "./hmac";

export const SESSION_COOKIE = "fk_session";

export type SessionRow = {
	id: string;
	household_id: string;
	parent_id: string;
	expires_at: string;
	kiosk: number;
};

export type SessionEnv = {
	Bindings: Env;
	Variables: { session: SessionRow };
};

export async function loadSession(
	c: Context<SessionEnv>,
): Promise<SessionRow | null> {
	const secret = c.env.SESSION_SECRET;
	if (!secretLongEnough(secret)) return null;

	const raw = getCookie(c, SESSION_COOKIE);
	const id = await verifySessionCookie(raw, secret);
	if (!id) return null;

	const row = await first<SessionRow>(
		c.env.DB,
		`SELECT id, household_id, parent_id, expires_at, kiosk
		 FROM sessions
		 WHERE id = ?1`,
		[id],
	);
	if (!row) return null;
	if (typeof row.household_id !== "string" || row.household_id.length === 0) {
		return null;
	}
	const exp = Date.parse(row.expires_at);
	if (!Number.isFinite(exp) || exp <= Date.now()) return null;
	return row;
}

/** Session gate for parent APIs. Returns 401 { error: "unauthenticated" }. */
export async function requireParent(c: Context<SessionEnv>, next: Next) {
	const session = await loadSession(c);
	if (!session) {
		return c.json({ error: "unauthenticated" }, 401);
	}
	c.set("session", session);
	return next();
}
