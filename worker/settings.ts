/**
 * Kiosk PIN settings (PR-8 school-night). Full settings page is PR-9.
 *
 * GET  /api/v1/settings/kiosk-pin-status  { required: boolean }  (no hash)
 * PUT  /api/v1/settings/kiosk-pin         { pin } 4 digits
 *
 * Non-kiosk only (deny-by-default middleware). Never returns hash or salt.
 */

import { Hono } from "hono";
import { first, householdIdFromSession, run } from "./db";
import { hashKioskPin, isFourDigitPin, newKioskPinSalt } from "./pin";
import type { SessionEnv } from "./session";

const PRIVATE = { "Cache-Control": "private, no-store" } as const;

function errorJson(error: string, message: string) {
	return { error, message };
}

type PinCols = { kiosk_pin_hash: string | null };

export function createSettings() {
	const app = new Hono<SessionEnv>();

	app.get("/kiosk-pin-status", async (c) => {
		const hid = householdIdFromSession(c.get("session"));
		const row = await first<PinCols>(
			c.env.DB,
			`SELECT kiosk_pin_hash FROM households WHERE id = ?1`,
			[hid],
		);
		const required = !row || row.kiosk_pin_hash == null || row.kiosk_pin_hash.length === 0;
		return c.json({ required }, 200, PRIVATE);
	});

	app.put("/kiosk-pin", async (c) => {
		let body: unknown;
		try {
			body = await c.req.json();
		} catch {
			return c.json(errorJson("validation", "Request body must be JSON."), 400);
		}
		if (body === null || typeof body !== "object" || Array.isArray(body)) {
			return c.json(errorJson("validation", "Request body must be a JSON object."), 400);
		}
		const pin = (body as Record<string, unknown>).pin;
		if (!isFourDigitPin(pin)) {
			return c.json(errorJson("validation", "pin must be 4 digits."), 400);
		}

		const hid = householdIdFromSession(c.get("session"));
		const salt = newKioskPinSalt();
		const hash = await hashKioskPin(salt, pin);
		await run(
			c.env.DB,
			`UPDATE households SET kiosk_pin_hash = ?2, kiosk_pin_salt = ?3 WHERE id = ?1`,
			[hid, hash, salt],
		);
		console.log(JSON.stringify({ evt: "kiosk.pin_set", household_id: hid }));
		return c.json({ ok: true }, 200, PRIVATE);
	});

	return app;
}
