/**
 * GET /api/v1/me
 *
 * Kiosk body is exactly { kiosk: true, kiosk_member_id, member_label }.
 * No pin, salt, llm_*, email, kiosk_pin_hash, kiosk_pin_salt.
 *
 * Non-kiosk: parent display + household clipboard fields. Never hash/salt
 * or wrapped LLM key. Parent email is not on this endpoint.
 */

import type { Context } from "hono";
import { first, householdIdFromSession, scopedFirst } from "./db";
import type { SessionEnv } from "./session";

const PRIVATE = { "Cache-Control": "private, no-store" } as const;

type ParentRow = { id: string; display_name: string | null };
type HouseholdMe = {
	id: string;
	name: string;
	store: string;
	quiet_start: string;
	quiet_tz: string;
	place_homework: string;
	place_meals: string;
	home_ai: string;
	onboarded: number;
};
type MemberLabel = { label: string };

export async function handleMe(c: Context<SessionEnv>) {
	const session = c.get("session");
	const hid = householdIdFromSession(session);

	if (session.kiosk) {
		let memberLabel = "";
		if (session.kiosk_member_id) {
			const member = await scopedFirst<MemberLabel>(
				c.env.DB,
				hid,
				`SELECT label FROM members WHERE household_id = ?1 AND id = ?2`,
				[session.kiosk_member_id],
			);
			memberLabel = member?.label ?? "";
		}
		return c.json(
			{
				kiosk: true,
				kiosk_member_id: session.kiosk_member_id,
				member_label: memberLabel,
			},
			200,
			PRIVATE,
		);
	}

	const parent = await scopedFirst<ParentRow>(
		c.env.DB,
		hid,
		`SELECT id, display_name FROM parents WHERE household_id = ?1 AND id = ?2`,
		[session.parent_id],
	);
	const household = await first<HouseholdMe>(
		c.env.DB,
		`SELECT id, name, store, quiet_start, quiet_tz, place_homework, place_meals, home_ai, onboarded
		 FROM households WHERE id = ?1`,
		[hid],
	);
	if (!parent || !household) {
		return c.json({ error: "unauthenticated" }, 401);
	}

	return c.json(
		{
			kiosk: false,
			parent: {
				id: parent.id,
				display_name: parent.display_name,
			},
			household: {
				id: household.id,
				name: household.name,
				store: household.store,
				quiet_start: household.quiet_start,
				quiet_tz: household.quiet_tz,
				place_homework: household.place_homework,
				place_meals: household.place_meals,
				home_ai: household.home_ai,
				onboarded: household.onboarded,
			},
		},
		200,
		PRIVATE,
	);
}
