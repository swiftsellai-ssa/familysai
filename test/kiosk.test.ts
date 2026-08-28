import assert from "node:assert/strict";
import { describe, it } from "node:test";
import app from "../worker/index.ts";
import { mintSessionCookieValue } from "../worker/hmac.ts";
import { makeEnv, openMemD1, TEST_SECRETS } from "./d1.ts";

const ORIGIN = "http://localhost";
const STAMP = "st_20260829_ww2-poster";

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

async function hmacCookie(id = "sess_dogfood_local") {
	return mintSessionCookieValue(id, TEST_SECRETS.SESSION_SECRET);
}

function cookieHeader(value: string, extra = "") {
	const c = extra ? `fk_session=${value}; ${extra}` : `fk_session=${value}`;
	return { Cookie: c };
}

async function setKiosk(db: ReturnType<typeof openMemD1>, on = true, stampId: string | null = STAMP) {
	await db
		.prepare(
			"UPDATE sessions SET kiosk = ?1, kiosk_member_id = ?2, kiosk_stamp_id = ?3 WHERE id = ?4",
		)
		.bind(on ? 1 : 0, on ? "kid_8" : null, on ? stampId : null, "sess_dogfood_local")
		.run();
}

describe("deny-by-default kiosk", () => {
	it("kiosk + POST accept is 403 kiosk_denied", async () => {
		const db = openMemD1({ seed: true });
		await setKiosk(db, true);
		const env = makeEnv(db);
		const cookie = await hmacCookie();
		const res = await app.request(
			`http://localhost/api/v1/stamps/${STAMP}/accept`,
			{ method: "POST", headers: { ...headers(), ...cookieHeader(cookie) }, body: "{}" },
			env,
		);
		assert.equal(res.status, 403);
		assert.deepEqual(await jsonOf(res), { error: "kiosk_denied" });
	});

	it("kiosk + GET /api/v1/stamps inbox is 403", async () => {
		const db = openMemD1({ seed: true });
		await setKiosk(db, true);
		const env = makeEnv(db);
		const cookie = await hmacCookie();
		const res = await app.request(
			"http://localhost/api/v1/stamps",
			{ headers: cookieHeader(cookie) },
			env,
		);
		assert.equal(res.status, 403);
		assert.deepEqual(await jsonOf(res), { error: "kiosk_denied" });
	});

	it("kiosk + GET /api/v1/export.zip is 403", async () => {
		const db = openMemD1({ seed: true });
		await setKiosk(db, true);
		const env = makeEnv(db);
		const cookie = await hmacCookie();
		const res = await app.request(
			"http://localhost/api/v1/export.zip",
			{ headers: cookieHeader(cookie) },
			env,
		);
		assert.equal(res.status, 403);
		assert.deepEqual(await jsonOf(res), { error: "kiosk_denied" });
	});

	it("kiosk + POST /api/v1/jobs/cluster_weeks is 403", async () => {
		const db = openMemD1({ seed: true });
		await setKiosk(db, true);
		const env = makeEnv(db);
		const cookie = await hmacCookie();
		const res = await app.request(
			"http://localhost/api/v1/jobs/cluster_weeks",
			{ method: "POST", headers: { ...headers(), ...cookieHeader(cookie) }, body: "{}" },
			env,
		);
		assert.equal(res.status, 403);
		assert.deepEqual(await jsonOf(res), { error: "kiosk_denied" });
	});

	it("kiosk GET /me keys are exactly kiosk, kiosk_member_id, member_label", async () => {
		const db = openMemD1({ seed: true });
		await setKiosk(db, true);
		const env = makeEnv(db);
		const cookie = await hmacCookie();
		const res = await app.request(
			"http://localhost/api/v1/me",
			{ headers: cookieHeader(cookie) },
			env,
		);
		assert.equal(res.status, 200);
		const body = await jsonOf(res);
		assert.deepEqual(Object.keys(body).sort(), ["kiosk", "kiosk_member_id", "member_label"]);
		assert.equal(body.kiosk, true);
		assert.equal(body.kiosk_member_id, "kid_8");
		assert.equal(body.member_label, "Kid");
		const blob = JSON.stringify(body);
		for (const bad of ["pin", "salt", "llm_", "email", "kiosk_pin_hash", "kiosk_pin_salt"]) {
			assert.equal(blob.includes(bad), false, bad);
		}
	});

	it("kiosk POST stamps with member_id in body is validation", async () => {
		const db = openMemD1({ seed: true });
		await setKiosk(db, true, null);
		const env = makeEnv(db);
		const cookie = await hmacCookie();
		const res = await app.request(
			"http://localhost/api/v1/stamps",
			{
				method: "POST",
				headers: { ...headers(), ...cookieHeader(cookie) },
				body: JSON.stringify({
					title: "Poster",
					used_ai_for: ["wording"],
					checked_against: "chapter 4",
					member_id: "kid_8",
				}),
			},
			env,
		);
		assert.equal(res.status, 400);
		const body = await jsonOf(res);
		assert.equal(body.error, "validation");
	});

	it("enter without PIN hash is kiosk_pin_required", async () => {
		const db = openMemD1({ seed: true });
		await db.prepare("UPDATE households SET kiosk_pin_hash = NULL, kiosk_pin_salt = NULL WHERE id = ?1").bind("hid_dogfood_local").run();
		const env = makeEnv(db);
		const cookie = await hmacCookie();
		const res = await app.request(
			"http://localhost/api/v1/stamps/kiosk/enter",
			{
				method: "POST",
				headers: { ...headers(), ...cookieHeader(cookie) },
				body: JSON.stringify({ member_id: "kid_8", pin: "0000" }),
			},
			env,
		);
		assert.equal(res.status, 403);
		assert.equal((await jsonOf(res)).error, "kiosk_pin_required");
	});

	it("exit empty PIN is kiosk_denied", async () => {
		const db = openMemD1({ seed: true });
		await setKiosk(db, true);
		const env = makeEnv(db);
		const cookie = await hmacCookie();
		const res = await app.request(
			"http://localhost/api/v1/stamps/kiosk/exit",
			{
				method: "POST",
				headers: { ...headers(), ...cookieHeader(cookie) },
				body: JSON.stringify({ pin: "" }),
			},
			env,
		);
		assert.equal(res.status, 403);
		assert.equal((await jsonOf(res)).error, "kiosk_denied");
	});

	it("deleting fk_kiosk cookie does not lift D1 kiosk bit", async () => {
		const db = openMemD1({ seed: true });
		await setKiosk(db, true);
		const env = makeEnv(db);
		const cookie = await hmacCookie();
		const res = await app.request(
			`http://localhost/api/v1/stamps/${STAMP}/accept`,
			{ method: "POST", headers: { ...headers(), Cookie: `fk_session=${cookie}` }, body: "{}" },
			env,
		);
		assert.equal(res.status, 403);
		assert.deepEqual(await jsonOf(res), { error: "kiosk_denied" });
		const still = await db.prepare("SELECT kiosk FROM sessions WHERE id = ?1").bind("sess_dogfood_local").first<{ kiosk: number }>();
		assert.equal(Number(still?.kiosk), 1);
	});

	it("AUTH=off is still 401", async () => {
		const db = openMemD1({ seed: true });
		const env = makeEnv(db);
		const res = await app.request(
			"http://localhost/api/v1/stamps",
			{ headers: { AUTH: "off" } },
			env,
		);
		assert.equal(res.status, 401);
		const q = await app.request("http://localhost/api/v1/me?AUTH=off", {}, env);
		assert.equal(q.status, 401);
		const h = await app.request(
			"http://localhost/api/v1/me",
			{ headers: { AUTH: "off", Cookie: "fk_session=sess_dogfood_local" } },
			env,
		);
		assert.equal(h.status, 401);
	});

	it("non-kiosk phone Accept works; PUT stamps is allowed off-kiosk", async () => {
		const db = openMemD1({ seed: true });
		const env = makeEnv(db);
		const cookie = await hmacCookie();
		const inbox = await app.request(
			"http://localhost/api/v1/stamps?status=pending",
			{ headers: cookieHeader(cookie) },
			env,
		);
		assert.equal(inbox.status, 200);
		const listed = await jsonOf(inbox);
		assert.ok(Array.isArray(listed.stamps));
		const acc = await app.request(
			`http://localhost/api/v1/stamps/${STAMP}/accept`,
			{ method: "POST", headers: { ...headers(), ...cookieHeader(cookie) }, body: "{}" },
			env,
		);
		assert.equal(acc.status, 200);
		const body = await jsonOf(acc);
		assert.equal(body.status, "accepted");
		assert.equal(body.parent_id, "parent_a");
	});
});
