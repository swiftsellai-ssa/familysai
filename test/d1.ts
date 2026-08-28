/**
 * In-memory SQLite that speaks the D1 prepare/bind/first/run/all/batch shape
 * used by the worker. Node 22 `node:sqlite` (experimental).
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

function namedBinds(binds: unknown[]): Record<string, unknown> | undefined {
	if (binds.length === 0) return undefined;
	const o: Record<string, unknown> = {};
	binds.forEach((v, i) => {
		o[String(i + 1)] = v;
	});
	return o;
}

export type MemD1 = D1Database & { _raw: DatabaseSync };

export function openMemD1(opts?: { seed?: boolean }): MemD1 {
	const raw = new DatabaseSync(":memory:");
	raw.exec("PRAGMA foreign_keys = ON;");
	raw.exec(readFileSync(resolve(root, "migrations/0001_waitlist.sql"), "utf8"));
	raw.exec(readFileSync(resolve(root, "migrations/0002_household.sql"), "utf8"));
	if (opts?.seed) {
		raw.exec(readFileSync(resolve(root, "seeds/dogfood/seed.sql"), "utf8"));
	}

	function prepare(sql: string) {
		const state = { binds: [] as unknown[] };
		const api = {
			bind(...args: unknown[]) {
				state.binds = args;
				return api;
			},
			async first<T = Record<string, unknown>>(): Promise<T | null> {
				const stmt = raw.prepare(sql);
				const n = namedBinds(state.binds);
				const row = (n ? stmt.get(n) : stmt.get()) as T | undefined;
				return row ?? null;
			},
			async run(): Promise<D1Result> {
				const stmt = raw.prepare(sql);
				const n = namedBinds(state.binds);
				const info = n ? stmt.run(n) : stmt.run();
				return {
					success: true,
					meta: {
						changes: Number(info.changes ?? 0),
						last_row_id: Number(info.lastInsertRowid ?? 0),
						duration: 0,
						size_after: 0,
						rows_read: 0,
						rows_written: Number(info.changes ?? 0),
						changed_db: Boolean(info.changes),
					},
					results: [],
				} as unknown as D1Result;
			},
			async all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
				const stmt = raw.prepare(sql);
				const n = namedBinds(state.binds);
				const results = (n ? stmt.all(n) : stmt.all()) as T[];
				return { success: true, meta: { duration: 0 } as D1Meta, results };
			},
		};
		return api;
	}

	const db = {
		_raw: raw,
		prepare,
		async batch(statements: { run: () => Promise<D1Result> }[]) {
			raw.exec("BEGIN");
			try {
				const out = [];
				for (const s of statements) out.push(await s.run());
				raw.exec("COMMIT");
				return out;
			} catch (err) {
				raw.exec("ROLLBACK");
				throw err;
			}
		},
		async exec(query: string) {
			raw.exec(query);
			return { count: 0, duration: 0 };
		},
		async dump() {
			return "";
		},
	};
	return db as unknown as MemD1;
}

const SECRET = "LOCAL_ONLY_NOT_FOR_PROD_session_secret_0001";
const SIGNING = "LOCAL_ONLY_NOT_FOR_PROD_magic_link_key_0001";

export const TEST_SECRETS = { SESSION_SECRET: SECRET, MAGIC_LINK_SIGNING_KEY: SIGNING };

export function stubFiles(): R2Bucket {
	return {
		put: async () => ({ key: "" }) as unknown as R2Object,
		get: async () => null,
		delete: async () => undefined,
		head: async () => null,
		list: async () => ({ objects: [], truncated: false } as unknown as R2Objects),
	} as unknown as R2Bucket;
}

export function makeEnv(
	db: D1Database,
	overrides: Partial<Env> & Record<string, unknown> = {},
): Env {
	return {
		FILES: stubFiles(),
		DB: db,
		ASSETS: { fetch: async () => new Response(null, { status: 404 }) } as unknown as Fetcher,
		SIGNUPS_OPEN: "dogfood",
		MAILER: "log",
		TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
		TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA",
		SESSION_SECRET: SECRET,
		MAGIC_LINK_SIGNING_KEY: SIGNING,
		...overrides,
	} as unknown as Env;
}
