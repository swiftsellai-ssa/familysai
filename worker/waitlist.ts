import { Hono } from "hono";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_MAX = 254;
const MESSAGE_MAX = 2000;
const TOKEN_MAX = 2048;
const RATE_LIMIT_PER_HOUR = 10;
const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

type JsonError = { error: string; message: string };

function errorJson(error: string, message: string): JsonError {
	return { error, message };
}

function clientIp(headers: Headers): string {
	const cf = headers.get("CF-Connecting-IP");
	if (cf && cf.trim()) return cf.trim();
	const xff = headers.get("X-Forwarded-For");
	if (xff) {
		const first = xff.split(",")[0]?.trim();
		if (first) return first;
	}
	return "unknown";
}

function waitlistId(): string {
	const bytes = new Uint8Array(16);
	crypto.getRandomValues(bytes);
	let hex = "";
	for (const b of bytes) hex += b.toString(16).padStart(2, "0");
	return `wl_${hex}`;
}

function isValidEmail(email: string): boolean {
	if (email.length === 0 || email.length > EMAIL_MAX) return false;
	return EMAIL_RE.test(email);
}

function isUniqueConflict(err: unknown): boolean {
	const msg = err instanceof Error ? err.message : String(err);
	return /UNIQUE constraint failed/i.test(msg);
}

export function createWaitlist() {
	const app = new Hono<{ Bindings: Env }>();

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
		const emailRaw = typeof rec.email === "string" ? rec.email.trim().toLowerCase() : "";
		const messageRaw = typeof rec.message === "string" ? rec.message.trim() : "";
		const tokenFromBody =
			(typeof rec.turnstileToken === "string" && rec.turnstileToken) ||
			(typeof rec["cf-turnstile-response"] === "string" && rec["cf-turnstile-response"]) ||
			"";
		const turnstileToken = tokenFromBody.trim();

		if (!isValidEmail(emailRaw)) {
			return c.json(errorJson("validation", "A valid email is required."), 400);
		}
		if (messageRaw.length > MESSAGE_MAX) {
			return c.json(errorJson("validation", "Message is too long."), 400);
		}
		if (!turnstileToken || turnstileToken.length > TOKEN_MAX) {
			return c.json(errorJson("validation", "Verification is required."), 400);
		}

		const ip = clientIp(c.req.raw.headers);
		const windowStart = Math.floor(Date.now() / 1000 / 3600);
		const rateKey = `ip:waitlist:${ip}`;

		let rateCount = 0;
		try {
			const rateRow = await c.env.DB.prepare(
				`INSERT INTO rate_limits (key, window_start, count)
				 VALUES (?1, ?2, 1)
				 ON CONFLICT (key, window_start) DO UPDATE SET count = count + 1
				 RETURNING count`,
			)
				.bind(rateKey, windowStart)
				.first<{ count: number }>();
			rateCount = rateRow?.count ?? 1;
		} catch (err) {
			const detail = err instanceof Error ? err.message : String(err);
			console.log(JSON.stringify({ evt: "waitlist.rate_limit", ok: false, detail }));
			return c.json(errorJson("validation", "Waitlist is unavailable."), 503);
		}

		if (rateCount > RATE_LIMIT_PER_HOUR) {
			return c.json(errorJson("rate_limited", "Too many requests. Try again later."), 429);
		}

		const secret = c.env.TURNSTILE_SECRET_KEY;
		if (!secret) {
			console.log(JSON.stringify({ evt: "waitlist.turnstile", ok: false, reason: "missing_secret" }));
			return c.json(errorJson("validation", "Waitlist is unavailable."), 503);
		}

		let action: string | null = null;
		try {
			const verifyRes = await fetch(SITEVERIFY_URL, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					secret,
					response: turnstileToken,
					remoteip: ip === "unknown" ? undefined : ip,
				}),
			});
			const verify = (await verifyRes.json()) as {
				success?: boolean;
				action?: string;
				"error-codes"?: string[];
			};
			if (!verify.success) {
				console.log(
					JSON.stringify({
						evt: "waitlist.turnstile",
						ok: false,
						codes: verify["error-codes"] ?? [],
					}),
				);
				return c.json(errorJson("validation", "Verification failed. Please try again."), 400);
			}
			if (typeof verify.action === "string" && verify.action) {
				action = verify.action;
			}
		} catch {
			console.log(JSON.stringify({ evt: "waitlist.turnstile", ok: false, reason: "siteverify_error" }));
			return c.json(errorJson("validation", "Verification failed. Please try again."), 400);
		}

		const id = waitlistId();
		const message = messageRaw.length > 0 ? messageRaw : null;

		try {
			await c.env.DB.prepare(
				`INSERT INTO waitlist (id, email, message, turnstile_action) VALUES (?1, ?2, ?3, ?4)`,
			)
				.bind(id, emailRaw, message, action)
				.run();
		} catch (err) {
			if (isUniqueConflict(err)) {
				console.log(JSON.stringify({ evt: "waitlist.insert", ok: true }));
				return c.json({ ok: true });
			}
			const detail = err instanceof Error ? err.message : String(err);
			console.log(JSON.stringify({ evt: "waitlist.insert", ok: false, detail }));
			return c.json(errorJson("validation", "Waitlist is unavailable."), 503);
		}

		console.log(JSON.stringify({ evt: "waitlist.insert", ok: true }));
		return c.json({ ok: true });
	});

	return app;
}
