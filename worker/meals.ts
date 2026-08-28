/**
 * Meal canon + labelled weeks + named plain-text list export.
 *
 * Sunday success test (LLM unconfigured): pick a week → aggregate → copy text.
 * Session cookie fk_session = raw sessions.id. household_id from session only.
 * No AUTH=off. No Grocy. No cluster_weeks (PR-10). No fake Woolworths deep link.
 *
 * GET/POST /api/v1/meals/canon
 * GET/PUT/DELETE /api/v1/meals/canon/:id
 * GET/POST /api/v1/meals/weeks
 * GET/PUT /api/v1/meals/weeks/:id
 * GET /api/v1/meals/weeks/:id/list
 * GET /api/v1/meals/weeks/:id/export?format=text|woolworths|coles|bring|notes
 */

import { Hono } from "hono";
import {
	aggregateIngredients,
	isStoreFormat,
	listText,
	titledListText,
	type IngredientRow,
	type StoreFormat,
} from "./aggregate";
import {
	first,
	householdIdFromSession,
	scopedAll,
	scopedFirst,
	scopedRun,
} from "./db";
import {
	serializeMealCanon,
	serializeWeek,
	writeMealCanonYaml,
	writeWeekYaml,
	deleteObject,
	r2Key,
} from "./files";
import { requireParent, type SessionEnv } from "./session";

const PRIVATE = { "Cache-Control": "private, no-store" } as const;
const TEXT_PLAIN = {
	...PRIVATE,
	"Content-Type": "text/plain; charset=utf-8",
} as const;

const TITLE_MAX = 200;
const NOTES_MAX = 8 * 1024;
const SLUG_MAX = 64;
const ITEM_MAX = 200;
const UNIT_MAX = 24;
const FLEX_MAX = 64;
const LIST_NAME_MAX = 200;
const TAG_MAX = 48;
const MAX_TAGS = 16;
const MAX_INGS = 64;
const MAX_DINNERS = 5;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type MealRow = {
	id: string;
	title: string;
	serves: number;
	leftovers: number;
	time_min: number | null;
	tags: string;
	notes: string | null;
};

type IngRow = {
	meal_id: string;
	item: string;
	qty: number | null;
	unit: string | null;
	sort_order: number;
};

type WeekRow = {
	id: string;
	title: string;
	flex: string;
	list_name: string;
	origin: string;
	applied: number;
};

type DinnerRow = { week_id: string; position: number; meal_id: string };

function errorJson(error: string, message: string) {
	return { error, message };
}

function isUniqueConflict(err: unknown): boolean {
	const msg = err instanceof Error ? err.message : String(err);
	return /UNIQUE constraint failed/i.test(msg);
}

function isFkConflict(err: unknown): boolean {
	const msg = err instanceof Error ? err.message : String(err);
	return /FOREIGN KEY constraint failed/i.test(msg);
}

function slugify(title: string): string {
	const s = title
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, SLUG_MAX);
	return s || "meal";
}

function validSlug(id: string): boolean {
	return id.length > 0 && id.length <= SLUG_MAX && SLUG_RE.test(id);
}

function parseTagsJson(raw: string): string[] {
	try {
		const parsed = JSON.parse(raw) as unknown;
		if (!Array.isArray(parsed)) return [];
		return parsed.map((t) => String(t));
	} catch {
		return [];
	}
}

function leftoversToBool(sql: number): boolean {
	return sql === 1;
}

function parseLeftovers(v: unknown): 0 | 1 {
	if (v === true || v === 1 || v === "true" || v === "1") return 1;
	return 0;
}

function parseQty(v: unknown): { ok: true; value: number | null } | { ok: false } {
	if (v === undefined || v === null || v === "") return { ok: true, value: null };
	if (typeof v === "number" && Number.isFinite(v)) return { ok: true, value: v };
	if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) {
		return { ok: true, value: Number(v) };
	}
	return { ok: false };
}

type ParsedIng = { item: string; qty: number | null; unit: string | null };

function parseIngredients(raw: unknown): { ok: true; value: ParsedIng[] } | { ok: false; message: string } {
	if (raw === undefined || raw === null) return { ok: true, value: [] };
	if (!Array.isArray(raw)) {
		return { ok: false, message: "ingredients must be an array." };
	}
	if (raw.length > MAX_INGS) {
		return { ok: false, message: "too many ingredients." };
	}
	const out: ParsedIng[] = [];
	for (const row of raw) {
		if (row === null || typeof row !== "object" || Array.isArray(row)) {
			return { ok: false, message: "ingredient must be an object." };
		}
		const rec = row as Record<string, unknown>;
		const item = typeof rec.item === "string" ? rec.item.trim() : "";
		if (!item || item.length > ITEM_MAX) {
			return { ok: false, message: "ingredient item is required." };
		}
		const qty = parseQty(rec.qty);
		if (!qty.ok) return { ok: false, message: "ingredient qty is invalid." };
		let unit: string | null = null;
		if (rec.unit !== undefined && rec.unit !== null && rec.unit !== "") {
			if (typeof rec.unit !== "string" || rec.unit.length > UNIT_MAX) {
				return { ok: false, message: "ingredient unit is invalid." };
			}
			const t = rec.unit.trim();
			unit = t.length === 0 ? null : t;
		}
		out.push({ item, qty: qty.value, unit });
	}
	return { ok: true, value: out };
}

function parseTags(raw: unknown): { ok: true; value: string[] } | { ok: false } {
	if (raw === undefined || raw === null) return { ok: true, value: [] };
	if (!Array.isArray(raw)) return { ok: false };
	if (raw.length > MAX_TAGS) return { ok: false };
	const out: string[] = [];
	for (const t of raw) {
		if (typeof t !== "string" || t.trim().length === 0 || t.length > TAG_MAX) {
			return { ok: false };
		}
		out.push(t.trim());
	}
	return { ok: true, value: out };
}

function mealJson(row: MealRow, ingredients: ParsedIng[]) {
	return {
		id: row.id,
		title: row.title,
		serves: row.serves,
		leftovers: leftoversToBool(row.leftovers),
		time_min: row.time_min,
		tags: parseTagsJson(row.tags),
		notes: row.notes,
		ingredients,
	};
}

function weekJson(row: WeekRow, dinners: string[]) {
	return {
		id: row.id,
		title: row.title,
		flex: row.flex,
		list_name: row.list_name,
		origin: row.origin,
		applied: row.applied,
		dinners,
	};
}

const MEAL_SELECT = `SELECT id, title, serves, leftovers, time_min, tags, notes
	 FROM meals WHERE household_id = ?1 AND id = ?2`;

const WEEK_SELECT = `SELECT id, title, flex, list_name, origin, applied
	 FROM weeks WHERE household_id = ?1 AND id = ?2`;

async function ingsForMeal(
	db: D1Database,
	hid: string,
	mealId: string,
): Promise<ParsedIng[]> {
	const rows = await scopedAll<IngRow>(
		db,
		hid,
		`SELECT meal_id, item, qty, unit, sort_order FROM ingredients
		 WHERE household_id = ?1 AND meal_id = ?2
		 ORDER BY sort_order ASC, id ASC`,
		[mealId],
	);
	return rows.map((r) => ({ item: r.item, qty: r.qty, unit: r.unit }));
}

async function replaceIngredients(
	db: D1Database,
	hid: string,
	mealId: string,
	ings: ParsedIng[],
): Promise<void> {
	await scopedRun(
		db,
		hid,
		`DELETE FROM ingredients WHERE household_id = ?1 AND meal_id = ?2`,
		[mealId],
	);
	for (let i = 0; i < ings.length; i++) {
		const ing = ings[i];
		await scopedRun(
			db,
			hid,
			`INSERT INTO ingredients (household_id, meal_id, item, qty, unit, sort_order)
			 VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
			[mealId, ing.item, ing.qty, ing.unit, i],
		);
	}
}

async function writeMealThrough(
	env: Env,
	hid: string,
	row: MealRow,
	ings: ParsedIng[],
): Promise<void> {
	await writeMealCanonYaml(
		env,
		hid,
		row.id,
		serializeMealCanon({
			id: row.id,
			title: row.title,
			serves: row.serves,
			leftovers: row.leftovers,
			time_min: row.time_min,
			tags: row.tags,
			notes: row.notes,
			ingredients: ings,
		}),
	);
}

async function dinnersForWeek(
	db: D1Database,
	hid: string,
	weekId: string,
): Promise<string[]> {
	const rows = await scopedAll<DinnerRow>(
		db,
		hid,
		`SELECT week_id, position, meal_id FROM week_dinners
		 WHERE household_id = ?1 AND week_id = ?2
		 ORDER BY position ASC`,
		[weekId],
	);
	return rows.map((r) => r.meal_id);
}

async function replaceDinners(
	db: D1Database,
	hid: string,
	weekId: string,
	dinners: string[],
): Promise<void> {
	await scopedRun(
		db,
		hid,
		`DELETE FROM week_dinners WHERE household_id = ?1 AND week_id = ?2`,
		[weekId],
	);
	for (let i = 0; i < dinners.length; i++) {
		await scopedRun(
			db,
			hid,
			`INSERT INTO week_dinners (household_id, week_id, position, meal_id)
			 VALUES (?1, ?2, ?3, ?4)`,
			[weekId, i, dinners[i]],
		);
	}
}

async function writeWeekThrough(
	env: Env,
	hid: string,
	row: WeekRow,
	dinners: string[],
): Promise<void> {
	await writeWeekYaml(
		env,
		hid,
		row.id,
		serializeWeek({
			id: row.id,
			title: row.title,
			flex: row.flex,
			list_name: row.list_name,
			origin: row.origin,
			dinners,
		}),
	);
}

async function parseDinners(
	db: D1Database,
	hid: string,
	raw: unknown,
): Promise<{ ok: true; value: string[] } | { ok: false; message: string }> {
	if (raw === undefined || raw === null) return { ok: true, value: [] };
	if (!Array.isArray(raw)) {
		return { ok: false, message: "dinners must be an array of meal ids." };
	}
	if (raw.length > MAX_DINNERS) {
		return { ok: false, message: "a week has at most 5 dinners." };
	}
	const ids: string[] = [];
	for (const d of raw) {
		if (typeof d !== "string" || !validSlug(d)) {
			return { ok: false, message: "dinner meal_id is invalid." };
		}
		ids.push(d);
	}
	for (const id of ids) {
		const meal = await scopedFirst<{ id: string }>(
			db,
			hid,
			`SELECT id FROM meals WHERE household_id = ?1 AND id = ?2`,
			[id],
		);
		if (!meal) {
			return { ok: false, message: `meal ${id} is not in this household canon.` };
		}
	}
	return { ok: true, value: ids };
}

async function householdStore(
	db: D1Database,
	hid: string,
): Promise<string> {
	const row = await first<{ store: string }>(
		db,
		`SELECT store FROM households WHERE id = ?1`,
		[hid],
	);
	return row?.store && isStoreFormat(row.store) ? row.store : "woolworths";
}

async function weekListPayload(
	env: Env,
	hid: string,
	week: WeekRow,
): Promise<{
	week_id: string;
	list_name: string;
	store: string;
	items: ReturnType<typeof aggregateIngredients>;
	text: string;
}> {
	const ingRows = await scopedAll<IngRow>(
		env.DB,
		hid,
		`SELECT i.meal_id, i.item, i.qty, i.unit, i.sort_order
		 FROM week_dinners d
		 JOIN ingredients i
		   ON i.household_id = d.household_id AND i.meal_id = d.meal_id
		 WHERE d.household_id = ?1 AND d.week_id = ?2
		 ORDER BY d.position ASC, i.sort_order ASC, i.id ASC`,
		[week.id],
	);
	const rows: IngredientRow[] = ingRows.map((r) => ({
		item: r.item,
		qty: r.qty,
		unit: r.unit,
		meal_id: r.meal_id,
	}));
	const items = aggregateIngredients(rows);
	const store = await householdStore(env.DB, hid);
	return {
		week_id: week.id,
		list_name: week.list_name,
		store,
		items,
		text: listText(week.list_name, items),
	};
}

function optionalString(
	rec: Record<string, unknown>,
	key: string,
	max: number,
): { ok: true; value: string | null } | { ok: false } {
	if (!(key in rec) || rec[key] === null || rec[key] === undefined) {
		return { ok: true, value: null };
	}
	if (typeof rec[key] !== "string") return { ok: false };
	if (rec[key].length > max) return { ok: false };
	const trimmed = rec[key].trim();
	return { ok: true, value: trimmed.length === 0 ? null : trimmed };
}

export function createMealsCanon() {
	const app = new Hono<SessionEnv>();
	app.use("*", requireParent);

	app.get("/", async (c) => {
		const hid = householdIdFromSession(c.get("session"));
		const meals = await scopedAll<MealRow>(
			c.env.DB,
			hid,
			`SELECT id, title, serves, leftovers, time_min, tags, notes
			 FROM meals WHERE household_id = ?1
			 ORDER BY title ASC, id ASC`,
		);
		const ings = await scopedAll<IngRow>(
			c.env.DB,
			hid,
			`SELECT meal_id, item, qty, unit, sort_order FROM ingredients
			 WHERE household_id = ?1
			 ORDER BY meal_id ASC, sort_order ASC, id ASC`,
		);
		const byMeal = new Map<string, ParsedIng[]>();
		for (const row of ings) {
			const list = byMeal.get(row.meal_id) ?? [];
			list.push({ item: row.item, qty: row.qty, unit: row.unit });
			byMeal.set(row.meal_id, list);
		}
		return c.json(
			{ meals: meals.map((m) => mealJson(m, byMeal.get(m.id) ?? [])) },
			200,
			PRIVATE,
		);
	});

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
		// household_id from the session only — ignore any body field of that name.

		const title = typeof rec.title === "string" ? rec.title.trim() : "";
		if (!title || title.length > TITLE_MAX) {
			return c.json(errorJson("validation", "title is required."), 400);
		}

		let id: string;
		if (rec.id === undefined || rec.id === null || rec.id === "") {
			id = slugify(title);
		} else if (typeof rec.id === "string" && validSlug(rec.id.trim())) {
			id = rec.id.trim();
		} else {
			return c.json(errorJson("validation", "id must be a per-household slug."), 400);
		}

		const serves =
			rec.serves === undefined || rec.serves === null
				? 4
				: typeof rec.serves === "number" &&
					  Number.isInteger(rec.serves) &&
					  rec.serves >= 1 &&
					  rec.serves <= 24
					? rec.serves
					: null;
		if (serves === null) {
			return c.json(errorJson("validation", "serves is invalid."), 400);
		}

		const leftovers = parseLeftovers(rec.leftovers);
		let timeMin: number | null = null;
		if (rec.time_min !== undefined && rec.time_min !== null && rec.time_min !== "") {
			if (
				typeof rec.time_min !== "number" ||
				!Number.isInteger(rec.time_min) ||
				rec.time_min < 0 ||
				rec.time_min > 24 * 60
			) {
				return c.json(errorJson("validation", "time_min is invalid."), 400);
			}
			timeMin = rec.time_min;
		}

		const tags = parseTags(rec.tags);
		if (!tags.ok) {
			return c.json(errorJson("validation", "tags are invalid."), 400);
		}
		const notesOpt = optionalString(rec, "notes", NOTES_MAX);
		if (!notesOpt.ok) {
			return c.json(errorJson("validation", "notes is invalid."), 400);
		}
		const ings = parseIngredients(rec.ingredients);
		if (!ings.ok) {
			return c.json(errorJson("validation", ings.message), 400);
		}

		const hid = householdIdFromSession(c.get("session"));
		try {
			await scopedRun(
				c.env.DB,
				hid,
				`INSERT INTO meals (household_id, id, title, serves, leftovers, time_min, tags, notes)
				 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
				[id, title, serves, leftovers, timeMin, JSON.stringify(tags.value), notesOpt.value],
			);
		} catch (err) {
			if (isUniqueConflict(err)) {
				return c.json(errorJson("validation", "a meal with that id already exists."), 400);
			}
			throw err;
		}
		await replaceIngredients(c.env.DB, hid, id, ings.value);
		const created = await scopedFirst<MealRow>(c.env.DB, hid, MEAL_SELECT, [id]);
		if (!created) {
			return c.json(errorJson("not_found", "Meal not found."), 404);
		}
		await writeMealThrough(c.env, hid, created, ings.value);
		return c.json(mealJson(created, ings.value), 200, PRIVATE);
	});

	app.get("/:id", async (c) => {
		const id = c.req.param("id");
		if (!id || !validSlug(id)) {
			return c.json(errorJson("not_found", "Meal not found."), 404);
		}
		const hid = householdIdFromSession(c.get("session"));
		const row = await scopedFirst<MealRow>(c.env.DB, hid, MEAL_SELECT, [id]);
		if (!row) {
			return c.json(errorJson("not_found", "Meal not found."), 404);
		}
		const ings = await ingsForMeal(c.env.DB, hid, id);
		return c.json(mealJson(row, ings), 200, PRIVATE);
	});

	app.put("/:id", async (c) => {
		const id = c.req.param("id");
		if (!id || !validSlug(id)) {
			return c.json(errorJson("not_found", "Meal not found."), 404);
		}
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
		const hid = householdIdFromSession(c.get("session"));
		const existing = await scopedFirst<MealRow>(c.env.DB, hid, MEAL_SELECT, [id]);
		if (!existing) {
			return c.json(errorJson("not_found", "Meal not found."), 404);
		}

		const title =
			typeof rec.title === "string" && rec.title.trim().length > 0
				? rec.title.trim()
				: existing.title;
		if (title.length > TITLE_MAX) {
			return c.json(errorJson("validation", "title is invalid."), 400);
		}

		let serves = existing.serves;
		if ("serves" in rec && rec.serves !== undefined && rec.serves !== null) {
			if (
				typeof rec.serves !== "number" ||
				!Number.isInteger(rec.serves) ||
				rec.serves < 1 ||
				rec.serves > 24
			) {
				return c.json(errorJson("validation", "serves is invalid."), 400);
			}
			serves = rec.serves;
		}

		const leftovers =
			"leftovers" in rec ? parseLeftovers(rec.leftovers) : (existing.leftovers as 0 | 1);

		let timeMin = existing.time_min;
		if ("time_min" in rec) {
			if (rec.time_min === null || rec.time_min === "") timeMin = null;
			else if (
				typeof rec.time_min === "number" &&
				Number.isInteger(rec.time_min) &&
				rec.time_min >= 0 &&
				rec.time_min <= 24 * 60
			) {
				timeMin = rec.time_min;
			} else {
				return c.json(errorJson("validation", "time_min is invalid."), 400);
			}
		}

		let tagsJson = existing.tags;
		if ("tags" in rec) {
			const tags = parseTags(rec.tags);
			if (!tags.ok) {
				return c.json(errorJson("validation", "tags are invalid."), 400);
			}
			tagsJson = JSON.stringify(tags.value);
		}

		const notesOpt = optionalString(rec, "notes", NOTES_MAX);
		if (!notesOpt.ok) {
			return c.json(errorJson("validation", "notes is invalid."), 400);
		}
		const notes = "notes" in rec ? notesOpt.value : existing.notes;

		let ings: ParsedIng[] | null = null;
		if ("ingredients" in rec) {
			const parsed = parseIngredients(rec.ingredients);
			if (!parsed.ok) {
				return c.json(errorJson("validation", parsed.message), 400);
			}
			ings = parsed.value;
		}

		await scopedRun(
			c.env.DB,
			hid,
			`UPDATE meals SET title = ?2, serves = ?3, leftovers = ?4, time_min = ?5,
			 tags = ?6, notes = ?7, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
			 WHERE household_id = ?1 AND id = ?8`,
			[title, serves, leftovers, timeMin, tagsJson, notes, id],
		);
		if (ings) {
			await replaceIngredients(c.env.DB, hid, id, ings);
		}
		const updated = await scopedFirst<MealRow>(c.env.DB, hid, MEAL_SELECT, [id]);
		if (!updated) {
			return c.json(errorJson("not_found", "Meal not found."), 404);
		}
		const finalIngs = ings ?? (await ingsForMeal(c.env.DB, hid, id));
		await writeMealThrough(c.env, hid, updated, finalIngs);
		return c.json(mealJson(updated, finalIngs), 200, PRIVATE);
	});

	app.delete("/:id", async (c) => {
		const id = c.req.param("id");
		if (!id || !validSlug(id)) {
			return c.json(errorJson("not_found", "Meal not found."), 404);
		}
		const hid = householdIdFromSession(c.get("session"));
		const existing = await scopedFirst<MealRow>(c.env.DB, hid, MEAL_SELECT, [id]);
		if (!existing) {
			return c.json(errorJson("not_found", "Meal not found."), 404);
		}
		try {
			await scopedRun(
				c.env.DB,
				hid,
				`DELETE FROM meals WHERE household_id = ?1 AND id = ?2`,
				[id],
			);
		} catch (err) {
			if (isFkConflict(err)) {
				return c.json(
					errorJson("validation", "meal is used in a labelled week."),
					400,
				);
			}
			throw err;
		}
		await deleteObject(c.env, r2Key.mealCanon(hid, id));
		return c.body(null, 204);
	});

	return app;
}

export function createMealsWeeks() {
	const app = new Hono<SessionEnv>();
	app.use("*", requireParent);

	app.get("/", async (c) => {
		const hid = householdIdFromSession(c.get("session"));
		const weeks = await scopedAll<WeekRow>(
			c.env.DB,
			hid,
			`SELECT id, title, flex, list_name, origin, applied
			 FROM weeks WHERE household_id = ?1
			 ORDER BY id ASC`,
		);
		const dinners = await scopedAll<DinnerRow>(
			c.env.DB,
			hid,
			`SELECT week_id, position, meal_id FROM week_dinners
			 WHERE household_id = ?1
			 ORDER BY week_id ASC, position ASC`,
		);
		const byWeek = new Map<string, string[]>();
		for (const d of dinners) {
			const list = byWeek.get(d.week_id) ?? [];
			list.push(d.meal_id);
			byWeek.set(d.week_id, list);
		}
		return c.json(
			{ weeks: weeks.map((w) => weekJson(w, byWeek.get(w.id) ?? [])) },
			200,
			PRIVATE,
		);
	});

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

		const title = typeof rec.title === "string" ? rec.title.trim() : "";
		if (!title || title.length > TITLE_MAX) {
			return c.json(errorJson("validation", "title is required."), 400);
		}

		const listName =
			typeof rec.list_name === "string" ? rec.list_name.trim() : "";
		if (!listName || listName.length > LIST_NAME_MAX) {
			return c.json(errorJson("validation", "list_name is required."), 400);
		}

		let id: string;
		if (rec.id === undefined || rec.id === null || rec.id === "") {
			id = slugify(title);
		} else if (typeof rec.id === "string" && validSlug(rec.id.trim())) {
			id = rec.id.trim();
		} else {
			return c.json(errorJson("validation", "id must be a per-household slug."), 400);
		}

		const flex =
			typeof rec.flex === "string" && rec.flex.trim().length > 0
				? rec.flex.trim()
				: "leftover";
		if (flex.length > FLEX_MAX) {
			return c.json(errorJson("validation", "flex is invalid."), 400);
		}

		// Never auto from LLM. This route always stores origin=human applied=1.
		const hid = householdIdFromSession(c.get("session"));
		const dinners = await parseDinners(c.env.DB, hid, rec.dinners);
		if (!dinners.ok) {
			return c.json(errorJson("validation", dinners.message), 400);
		}

		try {
			await scopedRun(
				c.env.DB,
				hid,
				`INSERT INTO weeks (household_id, id, title, flex, list_name, origin, applied)
				 VALUES (?1, ?2, ?3, ?4, ?5, 'human', 1)`,
				[id, title, flex, listName],
			);
		} catch (err) {
			if (isUniqueConflict(err)) {
				return c.json(errorJson("validation", "a week with that id already exists."), 400);
			}
			throw err;
		}
		try {
			await replaceDinners(c.env.DB, hid, id, dinners.value);
		} catch (err) {
			if (isFkConflict(err)) {
				return c.json(errorJson("validation", "dinner meal_id is not in this canon."), 400);
			}
			throw err;
		}
		const created = await scopedFirst<WeekRow>(c.env.DB, hid, WEEK_SELECT, [id]);
		if (!created) {
			return c.json(errorJson("not_found", "Week not found."), 404);
		}
		await writeWeekThrough(c.env, hid, created, dinners.value);
		return c.json(weekJson(created, dinners.value), 200, PRIVATE);
	});

	app.get("/:id/list", async (c) => {
		const id = c.req.param("id");
		if (!id || !validSlug(id)) {
			return c.json(errorJson("not_found", "Week not found."), 404);
		}
		const hid = householdIdFromSession(c.get("session"));
		const week = await scopedFirst<WeekRow>(c.env.DB, hid, WEEK_SELECT, [id]);
		if (!week) {
			return c.json(errorJson("not_found", "Week not found."), 404);
		}
		const payload = await weekListPayload(c.env, hid, week);
		return c.json(payload, 200, PRIVATE);
	});

	app.get("/:id/export", async (c) => {
		const id = c.req.param("id");
		if (!id || !validSlug(id)) {
			return c.json(errorJson("not_found", "Week not found."), 404);
		}
		const rawFormat = (c.req.query("format") ?? "text").trim().toLowerCase();
		if (!isStoreFormat(rawFormat)) {
			return c.json(
				errorJson("validation", "format must be text, woolworths, coles, bring, or notes."),
				400,
			);
		}
		const format: StoreFormat = rawFormat;
		const hid = householdIdFromSession(c.get("session"));
		const week = await scopedFirst<WeekRow>(c.env.DB, hid, WEEK_SELECT, [id]);
		if (!week) {
			return c.json(errorJson("not_found", "Week not found."), 404);
		}
		const payload = await weekListPayload(c.env, hid, week);
		const text = titledListText(payload.list_name, payload.items, format);
		console.log(
			JSON.stringify({
				evt: "week.export",
				household_id: hid,
				week_id: week.id,
				format,
			}),
		);
		return c.body(text, 200, TEXT_PLAIN);
	});

	app.get("/:id", async (c) => {
		const id = c.req.param("id");
		if (!id || !validSlug(id)) {
			return c.json(errorJson("not_found", "Week not found."), 404);
		}
		const hid = householdIdFromSession(c.get("session"));
		const row = await scopedFirst<WeekRow>(c.env.DB, hid, WEEK_SELECT, [id]);
		if (!row) {
			return c.json(errorJson("not_found", "Week not found."), 404);
		}
		const dinners = await dinnersForWeek(c.env.DB, hid, id);
		return c.json(weekJson(row, dinners), 200, PRIVATE);
	});

	app.put("/:id", async (c) => {
		const id = c.req.param("id");
		if (!id || !validSlug(id)) {
			return c.json(errorJson("not_found", "Week not found."), 404);
		}
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
		const hid = householdIdFromSession(c.get("session"));
		const existing = await scopedFirst<WeekRow>(c.env.DB, hid, WEEK_SELECT, [id]);
		if (!existing) {
			return c.json(errorJson("not_found", "Week not found."), 404);
		}

		const title =
			typeof rec.title === "string" && rec.title.trim().length > 0
				? rec.title.trim()
				: existing.title;
		if (title.length > TITLE_MAX) {
			return c.json(errorJson("validation", "title is invalid."), 400);
		}
		const listName =
			typeof rec.list_name === "string" && rec.list_name.trim().length > 0
				? rec.list_name.trim()
				: existing.list_name;
		if (listName.length > LIST_NAME_MAX) {
			return c.json(errorJson("validation", "list_name is invalid."), 400);
		}
		const flex =
			typeof rec.flex === "string" && rec.flex.trim().length > 0
				? rec.flex.trim()
				: existing.flex;
		if (flex.length > FLEX_MAX) {
			return c.json(errorJson("validation", "flex is invalid."), 400);
		}

		let dinners = await dinnersForWeek(c.env.DB, hid, id);
		if ("dinners" in rec) {
			const parsed = await parseDinners(c.env.DB, hid, rec.dinners);
			if (!parsed.ok) {
				return c.json(errorJson("validation", parsed.message), 400);
			}
			dinners = parsed.value;
		}

		await scopedRun(
			c.env.DB,
			hid,
			`UPDATE weeks SET title = ?2, flex = ?3, list_name = ?4
			 WHERE household_id = ?1 AND id = ?5`,
			[title, flex, listName, id],
		);
		if ("dinners" in rec) {
			try {
				await replaceDinners(c.env.DB, hid, id, dinners);
			} catch (err) {
				if (isFkConflict(err)) {
					return c.json(
						errorJson("validation", "dinner meal_id is not in this canon."),
						400,
					);
				}
				throw err;
			}
		}
		const updated = await scopedFirst<WeekRow>(c.env.DB, hid, WEEK_SELECT, [id]);
		if (!updated) {
			return c.json(errorJson("not_found", "Week not found."), 404);
		}
		await writeWeekThrough(c.env, hid, updated, dinners);
		return c.json(weekJson(updated, dinners), 200, PRIVATE);
	});

	return app;
}
