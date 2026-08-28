import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	hmacSha256Hex,
	mintSessionCookieValue,
	parseSessionCookie,
	secretLongEnough,
	timingSafeEqual,
	verifySessionCookie,
} from "../worker/hmac.ts";
import {
	canSendMagicLink,
	mailerRejectedAtBoot,
	resendConfigured,
} from "../worker/mailer.ts";
import { originAllowed } from "../worker/origin.ts";

const SECRET = "LOCAL_ONLY_NOT_FOR_PROD_session_secret_0001";

describe("hmac session cookie", () => {
	it("rejects raw session ids without hmac", async () => {
		assert.equal(parseSessionCookie("sess_dogfood_local"), null);
		assert.equal(await verifySessionCookie("sess_dogfood_local", SECRET), null);
	});

	it("mints and verifies id.hmac", async () => {
		const value = await mintSessionCookieValue("sess_dogfood_local", SECRET);
		assert.match(value, /^sess_dogfood_local\.[0-9a-f]{64}$/);
		assert.equal(await verifySessionCookie(value, SECRET), "sess_dogfood_local");
	});

	it("rejects a bad hmac before any D1 lookup would run", async () => {
		const value = await mintSessionCookieValue("sess_dogfood_local", SECRET);
		const tampered = value.slice(0, -1) + (value.endsWith("a") ? "b" : "a");
		assert.equal(await verifySessionCookie(tampered, SECRET), null);
	});

	it("fails closed when SESSION_SECRET is missing or short", async () => {
		assert.equal(secretLongEnough(undefined), false);
		assert.equal(secretLongEnough("short"), false);
		assert.equal(await verifySessionCookie("sess_dogfood_local.abcd", undefined), null);
		const value = await mintSessionCookieValue("sess_dogfood_local", SECRET);
		assert.equal(await verifySessionCookie(value, "too-short-to-be-a-session-secret"), null);
	});

	it("timingSafeEqual is length-strict", () => {
		assert.equal(timingSafeEqual("aa", "aa"), true);
		assert.equal(timingSafeEqual("aa", "ab"), false);
		assert.equal(timingSafeEqual("aa", "aaa"), false);
	});

	it("hmac matches node createHmac for the session-cookie script", async () => {
		const { createHmac } = await import("node:crypto");
		const node = createHmac("sha256", SECRET).update("sess_dogfood_local").digest("hex");
		const web = await hmacSha256Hex(SECRET, "sess_dogfood_local");
		assert.equal(web, node);
	});
});

describe("origin", () => {
	it("allows same-host request origin and rejects others", () => {
		const req = new Request("http://localhost/api/v1/auth/magic-link", {
			method: "POST",
			headers: { Origin: "http://localhost" },
		});
		assert.equal(originAllowed(req), true);
		const bad = new Request("http://localhost/api/v1/auth/magic-link", {
			method: "POST",
			headers: { Origin: "https://evil.example" },
		});
		assert.equal(originAllowed(bad), false);
		const missing = new Request("http://localhost/api/v1/auth/magic-link", {
			method: "POST",
		});
		assert.equal(originAllowed(missing), false);
	});
});

describe("mailer", () => {
	it("rejects MAILER=log unless SIGNUPS_OPEN=dogfood", () => {
		assert.equal(mailerRejectedAtBoot({ MAILER: "log", SIGNUPS_OPEN: "waitlist" }), true);
		assert.equal(mailerRejectedAtBoot({ MAILER: "log", SIGNUPS_OPEN: "dogfood" }), false);
		assert.equal(canSendMagicLink({ MAILER: "log", SIGNUPS_OPEN: "dogfood" }), true);
		assert.equal(canSendMagicLink({ MAILER: "log", SIGNUPS_OPEN: "waitlist" }), false);
	});

	it("does not invent a Resend from-address", () => {
		assert.equal(
			resendConfigured({ MAILER: "resend", SIGNUPS_OPEN: "dogfood", RESEND_API_KEY: "re_x" }),
			false,
		);
		assert.equal(
			canSendMagicLink({
				MAILER: "resend",
				SIGNUPS_OPEN: "dogfood",
				RESEND_API_KEY: "re_x",
			}),
			false,
		);
		assert.equal(
			canSendMagicLink({
				MAILER: "resend",
				SIGNUPS_OPEN: "dogfood",
				RESEND_API_KEY: "re_x",
				RESEND_FROM: "ops@example.test",
			}),
			true,
		);
	});
});
