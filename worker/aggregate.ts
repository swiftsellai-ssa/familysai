/**
 * Ingredient aggregation for a labelled week (Sunday list).
 *
 * Sum qty where item+unit match case-fold. Never invent items.
 * Load-bearing fixture: chicken thigh 800 g × 2 = 1600 g.
 * No Grocy. No LLM.
 */

export type IngredientRow = {
	item: string;
	qty: number | null;
	unit: string | null;
	meal_id: string;
};

export type AggregatedItem = {
	item: string;
	qty: number | null;
	unit: string | null;
	from: string[];
};

export type StoreFormat = "text" | "woolworths" | "coles" | "bring" | "notes";

export const STORE_FORMATS = [
	"text",
	"woolworths",
	"coles",
	"bring",
	"notes",
] as const;

export const STORE_TITLE: Record<Exclude<StoreFormat, "text">, string> = {
	woolworths: "Woolworths",
	coles: "Coles",
	bring: "Bring",
	notes: "Notes",
};

export function isStoreFormat(v: string): v is StoreFormat {
	return (STORE_FORMATS as readonly string[]).includes(v);
}

function fold(s: string): string {
	return s.trim().toLowerCase();
}

function unitKey(unit: string | null | undefined): string {
	if (typeof unit !== "string") return "";
	return fold(unit);
}

function itemKey(item: string, unit: string | null | undefined): string {
	return `${fold(item)}\0${unitKey(unit)}`;
}

/** Sum qty where item+unit match case-fold. Empty item rows are skipped, not invented. */
export function aggregateIngredients(rows: IngredientRow[]): AggregatedItem[] {
	const map = new Map<string, AggregatedItem>();
	const order: string[] = [];

	for (const row of rows) {
		if (typeof row.item !== "string") continue;
		const item = row.item.trim();
		if (item.length === 0) continue;

		const unitRaw =
			typeof row.unit === "string" && row.unit.trim().length > 0
				? row.unit.trim()
				: null;
		const key = itemKey(item, unitRaw);
		const qty =
			typeof row.qty === "number" && Number.isFinite(row.qty) ? row.qty : null;
		const mealId =
			typeof row.meal_id === "string" && row.meal_id.length > 0
				? row.meal_id
				: "";

		const existing = map.get(key);
		if (!existing) {
			order.push(key);
			map.set(key, {
				item,
				qty,
				unit: unitRaw,
				from: mealId ? [mealId] : [],
			});
			continue;
		}

		if (qty !== null) {
			existing.qty = (existing.qty ?? 0) + qty;
		}
		if (mealId && !existing.from.includes(mealId)) {
			existing.from.push(mealId);
		}
	}

	return order.map((k) => map.get(k)!);
}

export function formatQty(qty: number | null): string | null {
	if (qty === null || !Number.isFinite(qty)) return null;
	if (Number.isInteger(qty)) return String(qty);
	const s = qty.toPrecision(12);
	return String(Number(s));
}

/** One list line: `- chicken thigh — 1600 g` */
export function itemLine(it: AggregatedItem): string {
	const qty = formatQty(it.qty);
	const unit = it.unit;
	if (qty && unit) return `- ${it.item} — ${qty} ${unit}`;
	if (qty) return `- ${it.item} — ${qty}`;
	return `- ${it.item}`;
}

/** Body of the named list. First line is list_name. Trailing newline. */
export function listText(listName: string, items: AggregatedItem[]): string {
	const lines = [listName, ...items.map(itemLine)];
	return `${lines.join("\n")}\n`;
}

/**
 * Store aliases = same text with a different first line.
 * text → list_name
 * woolworths → `Woolworths — {list_name}`
 * Never a Woolworths deep link.
 */
export function titledListText(
	listName: string,
	items: AggregatedItem[],
	format: StoreFormat,
): string {
	const body = listText(listName, items);
	if (format === "text") return body;
	const rest = body.slice(listName.length);
	return `${STORE_TITLE[format]} — ${listName}${rest}`;
}
