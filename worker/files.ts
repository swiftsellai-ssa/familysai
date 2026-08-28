/**
 * R2 write-through file layer (binding FILES).
 *
 * Prefix: households/{hid}/… as in family-kit-architecture.md §5.2.
 * Best-effort: on failure log `r2_sync_failed` and do not throw (D1 stays).
 * Private bucket only — never emit r2.dev or public URLs.
 *
 * FILES may be unbound in a unit test: helpers no-op instead of throwing.
 */

import { stringify, parse } from "yaml";

export type FilesEnv = { FILES?: R2Bucket | null };

const YAML_TYPE = "text/yaml; charset=utf-8";
const MD_TYPE = "text/markdown; charset=utf-8";
const PNG_TYPE = "image/png";
const JPEG_TYPE = "image/jpeg";
const ZIP_TYPE = "application/zip";

export function prefix(householdId: string): string {
	return `households/${householdId}/`;
}

export const r2Key = {
	household: (hid: string) => `${prefix(hid)}household.yaml`,
	mealCanon: (hid: string, slug: string) => `${prefix(hid)}meals/canon/${slug}.yaml`,
	week: (hid: string, id: string) => `${prefix(hid)}meals/weeks/${id}.yaml`,
	rules: (hid: string) => `${prefix(hid)}rules/house.md`,
	hallucinationMd: (hid: string, id: string) =>
		`${prefix(hid)}rules/hallucinations/${id}.md`,
	hallucinationPng: (hid: string, id: string) =>
		`${prefix(hid)}rules/hallucinations/${id}.png`,
	stampYaml: (hid: string, id: string) => `${prefix(hid)}stamps/${id}.yaml`,
	stampMd: (hid: string, id: string) => `${prefix(hid)}stamps/${id}.md`,
	textbook: (hid: string, stampId: string) =>
		`${prefix(hid)}uploads/textbooks/${stampId}.jpg`,
	exportZip: (hid: string, ts: string) => `${prefix(hid)}exports/${ts}.zip`,
};

function filesBucket(env: FilesEnv): R2Bucket | null {
	const b = env.FILES;
	if (!b || typeof b.put !== "function") return null;
	return b;
}

function logSyncFailed(key: string, reason?: string): void {
	const rec: Record<string, string> = { evt: "r2_sync_failed", key };
	if (reason) rec.reason = reason;
	console.log(JSON.stringify(rec));
}

export type PutBody = string | ArrayBuffer | ArrayBufferView | Blob | ReadableStream;

/** Best-effort put. Unbound FILES → no-op. Failure → log, no throw. */
export async function putObject(
	env: FilesEnv,
	key: string,
	body: PutBody,
	contentType: string,
): Promise<void> {
	const files = filesBucket(env);
	if (!files) return;
	try {
		await files.put(key, body, { httpMetadata: { contentType } });
	} catch {
		logSyncFailed(key);
	}
}

/** SQL leftovers 0/1 ↔ YAML boolean. */
export function leftoversToYaml(sql: number | null | undefined): boolean {
	return sql === 1;
}

export function leftoversFromYaml(value: unknown): 0 | 1 {
	if (value === true || value === 1 || value === "true" || value === "1") return 1;
	return 0;
}

const stringifyOpts = { lineWidth: 88 } as const;

export function toYaml(doc: unknown): string {
	return stringify(doc, stringifyOpts);
}

export function fromYaml<T = unknown>(text: string): T {
	return parse(text) as T;
}

export type MealCanonYaml = {
	id: string;
	title: string;
	serves: number;
	leftovers: boolean;
	time_min?: number | null;
	tags?: string[];
	notes?: string | null;
	ingredients?: Array<{ item: string; qty?: number | null; unit?: string | null }>;
};

/** Map a D1 meals row (+ ingredients) to the sketch YAML shape. */
export function serializeMealCanon(row: {
	id: string;
	title: string;
	serves: number;
	leftovers: number;
	time_min?: number | null;
	tags?: string;
	notes?: string | null;
	ingredients?: Array<{ item: string; qty?: number | null; unit?: string | null }>;
}): MealCanonYaml {
	let tags: string[] = [];
	if (typeof row.tags === "string" && row.tags.length > 0) {
		try {
			const parsed = JSON.parse(row.tags) as unknown;
			if (Array.isArray(parsed)) tags = parsed.map((t) => String(t));
		} catch {
			tags = [];
		}
	}
	return {
		id: row.id,
		title: row.title,
		serves: row.serves,
		leftovers: leftoversToYaml(row.leftovers),
		time_min: row.time_min ?? null,
		tags,
		notes: row.notes ?? null,
		ingredients: row.ingredients ?? [],
	};
}

export function deserializeMealCanon(doc: MealCanonYaml): {
	id: string;
	title: string;
	serves: number;
	leftovers: 0 | 1;
	time_min: number | null;
	tags: string;
	notes: string | null;
	ingredients: Array<{ item: string; qty?: number | null; unit?: string | null }>;
} {
	return {
		id: doc.id,
		title: doc.title,
		serves: doc.serves,
		leftovers: leftoversFromYaml(doc.leftovers),
		time_min: doc.time_min ?? null,
		tags: JSON.stringify(doc.tags ?? []),
		notes: doc.notes ?? null,
		ingredients: doc.ingredients ?? [],
	};
}

export async function writeHouseholdYaml(
	env: FilesEnv,
	householdId: string,
	doc: unknown,
): Promise<void> {
	await putObject(env, r2Key.household(householdId), toYaml(doc), YAML_TYPE);
}

export async function writeMealCanonYaml(
	env: FilesEnv,
	householdId: string,
	slug: string,
	doc: MealCanonYaml | unknown,
): Promise<void> {
	const body =
		doc && typeof doc === "object" && "leftovers" in doc && typeof (doc as MealCanonYaml).leftovers === "boolean"
			? toYaml(doc)
			: toYaml(doc);
	await putObject(env, r2Key.mealCanon(householdId, slug), body, YAML_TYPE);
}

export async function writeWeekYaml(
	env: FilesEnv,
	householdId: string,
	weekId: string,
	doc: unknown,
): Promise<void> {
	await putObject(env, r2Key.week(householdId, weekId), toYaml(doc), YAML_TYPE);
}

export async function writeRulesMd(
	env: FilesEnv,
	householdId: string,
	bodyMd: string,
): Promise<void> {
	await putObject(env, r2Key.rules(householdId), bodyMd, MD_TYPE);
}

export async function writeHallucinationMd(
	env: FilesEnv,
	householdId: string,
	id: string,
	bodyMd: string,
): Promise<void> {
	await putObject(env, r2Key.hallucinationMd(householdId, id), bodyMd, MD_TYPE);
}

export async function writeHallucinationPng(
	env: FilesEnv,
	householdId: string,
	id: string,
	body: ArrayBuffer | ArrayBufferView,
): Promise<void> {
	await putObject(env, r2Key.hallucinationPng(householdId, id), body, PNG_TYPE);
}

export async function writeStampYaml(
	env: FilesEnv,
	householdId: string,
	stampId: string,
	doc: unknown,
): Promise<void> {
	await putObject(env, r2Key.stampYaml(householdId, stampId), toYaml(doc), YAML_TYPE);
}

export async function writeStampMd(
	env: FilesEnv,
	householdId: string,
	stampId: string,
	bodyMd: string,
): Promise<void> {
	await putObject(env, r2Key.stampMd(householdId, stampId), bodyMd, MD_TYPE);
}

export async function writeTextbook(
	env: FilesEnv,
	householdId: string,
	stampId: string,
	body: ArrayBuffer | ArrayBufferView,
): Promise<void> {
	await putObject(env, r2Key.textbook(householdId, stampId), body, JPEG_TYPE);
}

export async function writeExportZip(
	env: FilesEnv,
	householdId: string,
	ts: string,
	body: ArrayBuffer | ArrayBufferView,
): Promise<void> {
	await putObject(env, r2Key.exportZip(householdId, ts), body, ZIP_TYPE);
}

export { YAML_TYPE, MD_TYPE, PNG_TYPE, JPEG_TYPE, ZIP_TYPE };
