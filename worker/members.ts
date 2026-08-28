/**
 * Minimal household members list so a parent can pick a child label
 * on the non-kiosk stamp form (until PR-8 kiosk enter).
 *
 * GET /api/v1/household/members  { members: [{ id, role, label }] }
 *
 * Labels, not logins. Child never has an identity. Session household only.
 * No AUTH=off. Do not return pin, salt, email, or llm fields.
 */

import { Hono } from "hono";
import { householdIdFromSession, scopedAll } from "./db";
import { requireParent, type SessionEnv } from "./session";

const PRIVATE = { "Cache-Control": "private, no-store" } as const;

type MemberLabel = { id: string; role: string; label: string };

export function createMembers() {
	const app = new Hono<SessionEnv>();
	app.use("*", requireParent);

	app.get("/", async (c) => {
		const hid = householdIdFromSession(c.get("session"));
		const members = await scopedAll<MemberLabel>(
			c.env.DB,
			hid,
			`SELECT id, role, label FROM members
			 WHERE household_id = ?1
			 ORDER BY role ASC, id ASC`,
		);
		return c.json({ members }, 200, PRIVATE);
	});

	return app;
}
