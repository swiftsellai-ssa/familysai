/**
 * CSRF origin check for mutating /api.
 *
 * Allow the request origin when it is the same host as this request.
 * Do not invent a custom-domain hostname allowlist — ops attach DNS later.
 */

import type { Context, Next } from "hono";

export function clientIp(headers: Headers): string {
	const cf = headers.get("CF-Connecting-IP");
	if (cf && cf.trim()) return cf.trim();
	const xff = headers.get("X-Forwarded-For");
	if (xff) {
		const first = xff.split(",")[0]?.trim();
		if (first) return first;
	}
	return "unknown";
}

export function originAllowed(request: Request): boolean {
	const origin = request.headers.get("Origin");
	if (!origin) return false;
	let o: URL;
	try {
		o = new URL(origin);
	} catch {
		return false;
	}
	const here = new URL(request.url);
	if (o.host !== here.host) return false;
	if (o.protocol !== here.protocol) return false;
	return o.protocol === "http:" || o.protocol === "https:";
}

/** Magic-link URL origin: incoming request, never an invented hostname. */
export function requestOrigin(request: Request): string {
	const here = new URL(request.url);
	return `${here.protocol}//${here.host}`;
}

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

export async function requireSameOrigin(c: Context, next: Next) {
	if (SAFE.has(c.req.method)) return next();
	if (!originAllowed(c.req.raw)) {
		return c.json({ error: "unauthenticated", message: "Origin not allowed." }, 403);
	}
	return next();
}
