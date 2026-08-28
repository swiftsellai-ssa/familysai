/**
 * Parent session from cookie `fk_session`.
 *
 * Until PR-7, the cookie value is the raw D1 `sessions.id`
 * (local seed: `sess_dogfood_local`). HMAC wrapping (`id.hmac` +
 * SESSION_SECRET) is PR-7 — this helper does not verify a signature.
 *
 * There is no AUTH=off header, query, or env bypass. Missing or expired
 * sessions are unauthenticated. household_id comes from the D1 row, never
 * from the client body.
 *
 * Kiosk deny-by-default allowlist is PR-8. This module only loads the row.
 */

import type { Context, Next } from "hono";
import { getCookie } from "hono/cookie";
import { first } from "./db";

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

function cookieSessionId(c: Context<SessionEnv>): string | null {
	const raw = getCookie(c, SESSION_COOKIE);
	if (typeof raw !== "string") return null;
	const id = raw.trim();
	if (id.length === 0 || id.length > 128) return null;
	return id;
}

export async function loadSession(
	c: Context<SessionEnv>,
): Promise<SessionRow | null> {
	const id = cookieSessionId(c);
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
