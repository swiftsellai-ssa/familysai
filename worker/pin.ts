/**
 * Kiosk PIN helpers. 4 digits, SHA-256(salt+pin) hex.
 * Not a child password. Never log the PIN.
 */

import { randomHex, timingSafeEqual, toHex } from "./hmac";

const encoder = new TextEncoder();

export const PIN_RE = /^\d{4}$/;
export const PIN_FAILURES = 5;
export const PIN_WINDOW_SEC = 15 * 60;

export function isFourDigitPin(pin: unknown): pin is string {
	return typeof pin === "string" && PIN_RE.test(pin);
}

export async function sha256Hex(message: string): Promise<string> {
	const buf = await crypto.subtle.digest("SHA-256", encoder.encode(message));
	return toHex(buf);
}

/** Hash = SHA-256(utf8(salt || pin)) hex. Local seed salt playwright_kiosk_v1 + 0000. */
export async function hashKioskPin(salt: string, pin: string): Promise<string> {
	return sha256Hex(salt + pin);
}

export function newKioskPinSalt(): string {
	return randomHex(16);
}

export async function pinMatches(
	salt: string,
	pin: string,
	expectedHash: string,
): Promise<boolean> {
	const got = await hashKioskPin(salt, pin);
	if (got.length !== expectedHash.length) return false;
	return timingSafeEqual(got.toLowerCase(), expectedHash.toLowerCase());
}

export function pinWindowStart(nowMs = Date.now()): number {
	const sec = Math.floor(nowMs / 1000);
	return Math.floor(sec / PIN_WINDOW_SEC) * PIN_WINDOW_SEC;
}

export function pinRateKey(householdId: string): string {
	return `kiosk_pin:${householdId}`;
}
