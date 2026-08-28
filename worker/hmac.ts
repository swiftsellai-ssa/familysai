/**
 * HMAC helpers for magic-link tokens and fk_session cookies.
 *
 * token_hash = HMAC-SHA256(token, MAGIC_LINK_SIGNING_KEY)
 * cookie HMAC = HMAC-SHA256(session_id, SESSION_SECRET)
 * SESSION_SECRET must be 32+ bytes. There is no AUTH=off bypass.
 */

const encoder = new TextEncoder();

export const SESSION_SECRET_MIN_BYTES = 32;
export const SESSION_MAX_AGE_SEC = 1_209_600; // 14 days
export const MAGIC_TTL_MS = 15 * 60 * 1000;

export function utf8Bytes(s: string): number {
	return encoder.encode(s).byteLength;
}

export function secretLongEnough(secret: string | undefined | null): secret is string {
	return typeof secret === "string" && utf8Bytes(secret) >= SESSION_SECRET_MIN_BYTES;
}

export function randomHex(byteLen: number): string {
	const bytes = new Uint8Array(byteLen);
	crypto.getRandomValues(bytes);
	return toHex(bytes);
}

export function toHex(bytes: ArrayBuffer | Uint8Array): string {
	const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
	let out = "";
	for (const b of arr) out += b.toString(16).padStart(2, "0");
	return out;
}

export function timingSafeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let x = 0;
	for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return x === 0;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
	return crypto.subtle.importKey(
		"raw",
		encoder.encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
}

export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
	const key = await hmacKey(secret);
	const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
	return toHex(sig);
}

export type SessionCookieParts = { id: string; hmac: string };

/** Parse `id.hmac`. Raw session ids without a signature are rejected. */
export function parseSessionCookie(raw: string | undefined | null): SessionCookieParts | null {
	if (typeof raw !== "string") return null;
	const trimmed = raw.trim();
	if (trimmed.length === 0 || trimmed.length > 256) return null;
	const dot = trimmed.indexOf(".");
	if (dot <= 0) return null;
	const id = trimmed.slice(0, dot);
	const hmac = trimmed.slice(dot + 1);
	if (!id || !hmac) return null;
	if (id.length > 128 || hmac.length > 128) return null;
	if (!/^[A-Za-z0-9_-]+$/.test(id)) return null;
	if (!/^[0-9a-f]+$/i.test(hmac)) return null;
	return { id, hmac };
}

export async function mintSessionCookieValue(
	sessionId: string,
	secret: string,
): Promise<string> {
	const hmac = await hmacSha256Hex(secret, sessionId);
	return `${sessionId}.${hmac}`;
}

export async function verifySessionCookie(
	raw: string | undefined | null,
	secret: string | undefined | null,
): Promise<string | null> {
	if (!secretLongEnough(secret)) return null;
	const parts = parseSessionCookie(raw);
	if (!parts) return null;
	const expected = await hmacSha256Hex(secret, parts.id);
	if (!timingSafeEqual(parts.hmac.toLowerCase(), expected)) return null;
	return parts.id;
}
