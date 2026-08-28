import assert from "node:assert/strict";
import { describe, it } from "node:test";
import app from "../worker/index.ts";
import { mintSessionCookieValue } from "../worker/hmac.ts";
import { makeEnv, openMemD1, TEST_SECRETS } from "./d1.ts";

const ORIGIN = "http://localhost";
const DOFOOD = "ops@example.test";

function headers(extra: Record<string, string> = {}) {
	return { Origin: ORIGIN, "Content-Type": "application/json", ...extra };
}

async function jsonOf(res: Response) {
	const text = await res.text();
	try {
		return JSON.parse(text) as Record<string, unknown>;
	} catch {
		return { _text: text };
	}
}

function cookieHeader(value: string) {
	return { Cookie: `fk_session=${value}` };
}

async function hmacCookie() {
	return mintSessionCookieValue("sess_dogfood_local", TEST_SECRETS.SESSION_SECRET);
}

describe("parent magic-link + HMAC session", () => {
	it("GET /api/v1/health is 200 without origin", async () => {
		const env = makeEnv(openMemD1());
		const res = await app.request("http://localhost/api/v1/health", {}, env);
		assert.equal(res.status, 200);
		assert.deepEqual(await jsonOf(res), { ok: true });
	});

	it("POST mutating /api without Origin is 403", async () => {
		const env = makeEnv(openMemD1());
		const res = await app.request(
			"http://localhost/api/v1/auth/magic-link",
			{ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: DOFOOD }) },
			env,
		);
		assert.equal(res.status, 403);
	});

	it("there is no GET consume", async () => {
		const env = makeEnv(openMemD1());
		const res = await app.request(
			"http://localhost/api/v1/auth/magic-link/consume?token=abc",
			{ method: "GET" },
			env,
		);
		assert.equal(res.status, 404);
	});

	it("SIGNUPS_OPEN=dogfood + other email: { ok: true }, no token row", async () => {
		const db = openMemD1();
		const env = makeEnv(db, { DOFOOD_EMAIL: DOFOOD, MAILER: "log", SIGNUPS_OPEN: "dogfood" });
		const res = await app.request(
			"http://localhost/api/v1/auth/magic-link",
			{
				method: "POST",
				headers: headers(),
				body: JSON.stringify({ email: "stranger@example.test" }),
			},
			env,
		);
		assert.equal(res.status, 200);
		assert.deepEqual(await jsonOf(res), { ok: true });
		const n = await db.prepare("SELECT COUNT(*) AS n FROM magic_link_tokens").first<{ n: number }>();
		assert.equal(Number(n?.n ?? -1), 0);
		const h = await db.prepare("SELECT COUNT(*) AS n FROM households").first<{ n: number }>();
		assert.equal(Number(h?.n ?? -1), 0);
	});

	it("unset DOFOOD_EMAIL: { ok: true }, no token", async () => {
		const db = openMemD1();
		const env = makeEnv(db, { MAILER: "log", SIGNUPS_OPEN: "dogfood" });
		delete (env as { DOFOOD_EMAIL?: string }).DOFOOD_EMAIL;
		const res = await app.request(
			"http://localhost/api/v1/auth/magic-link",
			{
				method: "POST",
				headers: headers(),
				body: JSON.stringify({ email: DOFOOD }),
			},
			env,
		);
		assert.equal(res.status, 200);
		assert.deepEqual(await jsonOf(res), { ok: true });
		const n = await db.prepare("SELECT COUNT(*) AS n FROM magic_link_tokens").first<{ n: number }>();
		assert.equal(Number(n?.n ?? -1), 0);
	});

	it("waitlist never auto-bootstraps a household", async () => {
		const db = openMemD1();
		const env = makeEnv(db, { SIGNUPS_OPEN: "waitlist", MAILER: "resend", DOFOOD_EMAIL: DOFOOD });
		const res = await app.request(
			"http://localhost/api/v1/auth/magic-link",
			{
				method: "POST",
				headers: headers(),
				body: JSON.stringify({ email: DOFOOD }),
			},
			env,
		);
		assert.equal(res.status, 200);
		assert.deepEqual(await jsonOf(res), { ok: true });
		const h = await db.prepare("SELECT COUNT(*) AS n FROM households").first<{ n: number }>();
		assert.equal(Number(h?.n ?? -1), 0);
		const n = await db.prepare("SELECT COUNT(*) AS n FROM magic_link_tokens").first<{ n: number }>();
		assert.equal(Number(n?.n ?? -1), 0);
	});

	it("SIGNUPS_OPEN=off never issues", async () => {
		const db = openMemD1({ seed: true });
		const env = makeEnv(db, { SIGNUPS_OPEN: "off", MAILER: "log", DOFOOD_EMAIL: "dogfood.local@localhost" });
		const res = await app.request(
			"http://localhost/api/v1/auth/magic-link",
			{
				method: "POST",
				headers: headers(),
				body: JSON.stringify({ email: "someone@example.test" }),
			},
			env,
		);
		assert.equal(res.status, 200);
		const n = await db.prepare("SELECT COUNT(*) AS n FROM magic_link_tokens").first<{ n: number }>();
		assert.equal(Number(n?.n ?? -1), 0);
	});

	it("dogfood matching email bootstraps, issues, consume then replay 401", async () => {
		const db = openMemD1();
		const env = makeEnv(db, { DOFOOD_EMAIL: DOFOOD, MAILER: "log", SIGNUPS_OPEN: "dogfood" });
		const captured: string[] = [];
		const orig = console.log;
		console.log = (...args: unknown[]) => {
			captured.push(args.map(String).join(" "));
		};
		let res: Response;
		try {
			res = await app.request(
				"http://localhost/api/v1/auth/magic-link",
				{
					method: "POST",
					headers: headers(),
					body: JSON.stringify({ email: "OPS@example.test" }),
				},
				env,
			);
		} finally {
			console.log = orig;
		}
		assert.equal(res.status, 200);
		assert.deepEqual(await jsonOf(res), { ok: true });
		const urlLine = captured.find((l) => l.includes("/auth/callback?token="));
		assert.ok(urlLine, "log mode should print the URL");
		assert.ok(!captured.some((l) => l.includes("OPS@example.test") && l.includes("token_hash")));
		const token = new URL(urlLine.match(/https?:\/\/\S+/)?.[0] ?? urlLine).searchParams.get("token");
		assert.ok(token && token.length === 64);

		const households = await db.prepare("SELECT dogfood, onboarded FROM households").first<{ dogfood: number; onboarded: number }>();
		assert.equal(Number(households?.dogfood), 1);
		const parents = await db.prepare("SELECT email FROM parents").first<{ email: string }>();
		assert.equal(parents?.email, DOFOOD);
		const child = await db.prepare("SELECT COUNT(*) AS n FROM members WHERE role = 'child'").first<{ n: number }>();
		assert.equal(Number(child?.n ?? -1), 0);

		const first = await app.request(
			"http://localhost/api/v1/auth/magic-link/consume",
			{
				method: "POST",
				headers: headers(),
				body: JSON.stringify({ token }),
			},
			env,
		);
		assert.equal(first.status, 200);
		const body = await jsonOf(first);
		assert.equal(body.ok, true);
		const setCookie = first.headers.get("set-cookie") ?? "";
		assert.match(setCookie, /fk_session=sess_[0-9a-f]+\.[0-9a-f]+/);
		assert.match(setCookie, /HttpOnly/i);
		assert.match(setCookie, /Path=\//);
		assert.match(setCookie, /SameSite=Lax/i);
		assert.match(setCookie, /Max-Age=1209600/);

		const replay = await app.request(
			"http://localhost/api/v1/auth/magic-link/consume",
			{
				method: "POST",
				headers: headers(),
				body: JSON.stringify({ token }),
			},
			env,
		);
		assert.equal(replay.status, 401);
	});

	it("rate-limits 5 per email per hour", async () => {
		const db = openMemD1();
		const env = makeEnv(db, { SIGNUPS_OPEN: "off", MAILER: "log" });
		let last = 0;
		for (let i = 0; i < 6; i++) {
			const res = await app.request(
				"http://localhost/api/v1/auth/magic-link",
				{
					method: "POST",
					headers: headers(),
					body: JSON.stringify({ email: "rate@example.test" }),
				},
				env,
			);
			last = res.status;
		}
		assert.equal(last, 429);
	});

	it("bad HMAC cookie and AUTH=off header are 401; HMAC cookie works", async () => {
		const db = openMemD1({ seed: true });
		const env = makeEnv(db);
		const good = await hmacCookie();

		const noCookie = await app.request("http://localhost/api/v1/rules", { headers: { AUTH: "off" } }, env);
		assert.equal(noCookie.status, 401);

		const raw = await app.request(
			"http://localhost/api/v1/rules",
			{ headers: { AUTH: "off", Cookie: "fk_session=sess_dogfood_local" } },
			env,
		);
		assert.equal(raw.status, 401);

		const bad = await app.request(
			"http://localhost/api/v1/rules",
			{ headers: { Cookie: `fk_session=sess_dogfood_local.${"a".repeat(64)}` } },
			env,
		);
		assert.equal(bad.status, 401);

		const ok = await app.request(
			"http://localhost/api/v1/rules",
			{ headers: cookieHeader(good) },
			env,
		);
		assert.equal(ok.status, 200);
		const rules = await jsonOf(ok);
		assert.equal(typeof rules.body_md, "string");
	});

	it("stamps and meals still 401 without HMAC and work with sess_dogfood_local HMAC", async () => {
		const db = openMemD1({ seed: true });
		const env = makeEnv(db);
		const good = await hmacCookie();

		for (const path of [
			"/api/v1/stamps/st_20260829_ww2-poster",
			"/api/v1/meals/weeks",
			"/api/v1/meals/canon",
			"/api/v1/household/members",
		]) {
			const denied = await app.request(`http://localhost${path}`, {}, env);
			assert.equal(denied.status, 401, path);
			const allowed = await app.request(
				`http://localhost${path}`,
				{ headers: cookieHeader(good) },
				env,
			);
			assert.equal(allowed.status, 200, path);
		}
	});

	it("logout is 204, clears cookie, deletes D1 session", async () => {
		const db = openMemD1({ seed: true });
		const env = makeEnv(db);
		const good = await hmacCookie();
		const res = await app.request(
			"http://localhost/api/v1/auth/logout",
			{ method: "POST", headers: { ...headers(), ...cookieHeader(good) } },
			env,
		);
		assert.equal(res.status, 204);
		const setCookie = res.headers.get("set-cookie") ?? "";
		assert.match(setCookie, /fk_session=/);
		const row = await db.prepare("SELECT id FROM sessions WHERE id = ?1").bind("sess_dogfood_local").first();
		assert.equal(row, null);

		const after = await app.request(
			"http://localhost/api/v1/rules",
			{ headers: cookieHeader(good) },
			env,
		);
		assert.equal(after.status, 401);
	});

	it("MAILER=resend without from-address issues no token", async () => {
		const db = openMemD1();
		const env = makeEnv(db, {
			SIGNUPS_OPEN: "dogfood",
			MAILER: "resend",
			DOFOOD_EMAIL: DOFOOD,
			RESEND_API_KEY: "re_test_not_real",
		});
		const res = await app.request(
			"http://localhost/api/v1/auth/magic-link",
			{
				method: "POST",
				headers: headers(),
				body: JSON.stringify({ email: DOFOOD }),
			},
			env,
		);
		assert.equal(res.status, 200);
		const n = await db.prepare("SELECT COUNT(*) AS n FROM magic_link_tokens").first<{ n: number }>();
		assert.equal(Number(n?.n ?? -1), 0);
	});

	it("missing SESSION_SECRET fails consume closed", async () => {
		const db = openMemD1({ seed: true });
		const env = makeEnv(db, { SESSION_SECRET: "" });
		const res = await app.request(
			"http://localhost/api/v1/auth/magic-link/consume",
			{
				method: "POST",
				headers: headers(),
				body: JSON.stringify({ token: "a".repeat(64) }),
			},
			env,
		);
		assert.equal(res.status, 401);
		const rules = await app.request("http://localhost/api/v1/rules", {}, env);
		assert.equal(rules.status, 401);
	});
});
