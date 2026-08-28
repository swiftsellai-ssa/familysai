/**
 * Deny-by-default kiosk middleware (KD-6).
 *
 * sessions.kiosk in D1 is the source of truth. Cookie fk_kiosk is an
 * optional hint only — deleting it must not lift the restriction.
 * Only POST /api/v1/stamps/kiosk/exit with PIN clears sessions.kiosk.
 *
 * Copying a sketch without this allowlist is a failed review.
 */

import type { Context, Next } from "hono";
import { loadSession, type SessionEnv } from "./session";

const KIOSK_ALLOW: ReadonlyArray<{ method: string; pattern: RegExp }> = [
	{ method: "GET", pattern: /^\/api\/v1\/me$/ },
	{ method: "POST", pattern: /^\/api\/v1\/stamps$/ },
	{ method: "GET", pattern: /^\/api\/v1\/stamps\/[^/]+$/ }, // :id only; handler scopes to kiosk_stamp_id
	{ method: "POST", pattern: /^\/api\/v1\/stamps\/kiosk\/exit$/ },
];

export { KIOSK_ALLOW };

export function isPublicApi(path: string): boolean {
	if (path === "/api/v1/health") return true;
	if (path === "/api/v1/waitlist" || path.startsWith("/api/v1/waitlist/")) return true;
	if (path === "/api/v1/auth" || path.startsWith("/api/v1/auth/")) return true;
	return false;
}

export async function requireParent(c: Context<SessionEnv>, next: Next) {
	const path = new URL(c.req.url).pathname;
	if (isPublicApi(path)) return next();
	const session = await loadSession(c);
	if (!session) return c.json({ error: "unauthenticated" }, 401);
	c.set("session", session);
	return next();
}

export async function requireKioskAllowlist(c: Context<SessionEnv>, next: Next) {
	const path = new URL(c.req.url).pathname;
	if (isPublicApi(path)) return next();
	const session = c.get("session");
	if (!session || !session.kiosk) return next();
	const ok = KIOSK_ALLOW.some((r) => r.method === c.req.method && r.pattern.test(path));
	if (!ok) {
		console.log(JSON.stringify({ evt: "kiosk.denied", path }));
		return c.json({ error: "kiosk_denied" }, 403);
	}
	return next();
}
