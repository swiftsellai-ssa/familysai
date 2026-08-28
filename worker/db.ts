/**
 * D1 data layer for household-owned rows.
 *
 * Isolation: every helper that touches household data takes `household_id`
 * from a trusted session (or an equally trusted caller), never from a client
 * request body. Do not add a helper that reads `household_id` out of JSON.
 *
 * This module is a data layer, not the HTTP API. Routes land in later PRs.
 */

export type HouseholdId = string;

export class MissingHouseholdIdError extends Error {
	constructor() {
		super("household_id is required");
		this.name = "MissingHouseholdIdError";
	}
}

/** Session-shaped input. Callers pass the D1 session row, not request JSON. */
export type SessionHousehold = { household_id: string };

/**
 * Reject empty household_id. Use this at the boundary so SQL never runs
 * unscoped. Pass `session.household_id`, not a body field.
 */
export function requireHouseholdId(
	householdId: string | null | undefined,
): HouseholdId {
	if (typeof householdId !== "string" || householdId.length === 0) {
		throw new MissingHouseholdIdError();
	}
	return householdId;
}

/** Pull household_id from a session record. Never from a client body. */
export function householdIdFromSession(session: SessionHousehold): HouseholdId {
	return requireHouseholdId(session.household_id);
}

export function prepare(
	db: D1Database,
	sql: string,
	binds: unknown[] = [],
): D1PreparedStatement {
	return db.prepare(sql).bind(...binds);
}

export async function run(
	db: D1Database,
	sql: string,
	binds: unknown[] = [],
): Promise<D1Result> {
	return prepare(db, sql, binds).run();
}

export async function first<T = Record<string, unknown>>(
	db: D1Database,
	sql: string,
	binds: unknown[] = [],
): Promise<T | null> {
	return prepare(db, sql, binds).first<T>();
}

export async function all<T = Record<string, unknown>>(
	db: D1Database,
	sql: string,
	binds: unknown[] = [],
): Promise<T[]> {
	const res = await prepare(db, sql, binds).all<T>();
	return res.results ?? [];
}

export async function batch(
	db: D1Database,
	statements: D1PreparedStatement[],
): Promise<D1Result[]> {
	return db.batch(statements);
}

/**
 * Household-scoped statement. `householdId` (from the session) is bound as
 * `?1`. SQL must mention `household_id` so a missing isolation predicate
 * fails closed at the helper, not at review time.
 */
export function scoped(
	db: D1Database,
	householdId: HouseholdId,
	sql: string,
	extraBinds: unknown[] = [],
): D1PreparedStatement {
	const hid = requireHouseholdId(householdId);
	if (!/\bhousehold_id\b/.test(sql)) {
		throw new Error("household-scoped SQL must mention household_id");
	}
	return db.prepare(sql).bind(hid, ...extraBinds);
}

export async function scopedRun(
	db: D1Database,
	householdId: HouseholdId,
	sql: string,
	extraBinds: unknown[] = [],
): Promise<D1Result> {
	return scoped(db, householdId, sql, extraBinds).run();
}

export async function scopedFirst<T = Record<string, unknown>>(
	db: D1Database,
	householdId: HouseholdId,
	sql: string,
	extraBinds: unknown[] = [],
): Promise<T | null> {
	return scoped(db, householdId, sql, extraBinds).first<T>();
}

export async function scopedAll<T = Record<string, unknown>>(
	db: D1Database,
	householdId: HouseholdId,
	sql: string,
	extraBinds: unknown[] = [],
): Promise<T[]> {
	const res = await scoped(db, householdId, sql, extraBinds).all<T>();
	return res.results ?? [];
}
