import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	aggregateIngredients,
	listText,
	titledListText,
} from "../worker/aggregate.ts";

describe("aggregateIngredients", () => {
	it("sums chicken thigh 800 g × 2 = 1600 g from both meals", () => {
		const items = aggregateIngredients([
			{
				item: "chicken thigh",
				qty: 800,
				unit: "g",
				meal_id: "butter-chicken",
			},
			{
				item: "chicken thigh",
				qty: 800,
				unit: "g",
				meal_id: "sheet-pan-thighs",
			},
		]);
		assert.equal(items.length, 1);
		assert.equal(items[0].item, "chicken thigh");
		assert.equal(items[0].qty, 1600);
		assert.equal(items[0].unit, "g");
		assert.deepEqual(items[0].from, ["butter-chicken", "sheet-pan-thighs"]);
	});

	it("matches item+unit case-fold and never invents items", () => {
		const items = aggregateIngredients([
			{ item: "Chicken Thigh", qty: 800, unit: "G", meal_id: "a" },
			{ item: "chicken thigh", qty: 800, unit: "g", meal_id: "b" },
			{ item: "  ", qty: 1, unit: "g", meal_id: "ghost" },
		]);
		assert.equal(items.length, 1);
		assert.equal(items[0].qty, 1600);
		assert.equal(items[0].item, "Chicken Thigh");
		assert.deepEqual(aggregateIngredients([]), []);
	});

	it("does not merge the same item with a different unit", () => {
		const items = aggregateIngredients([
			{ item: "yogurt", qty: 200, unit: "g", meal_id: "a" },
			{ item: "yogurt", qty: 1, unit: "tub", meal_id: "b" },
		]);
		assert.equal(items.length, 2);
	});
});

describe("named list text", () => {
	const items = aggregateIngredients([
		{
			item: "chicken thigh",
			qty: 800,
			unit: "g",
			meal_id: "butter-chicken",
		},
		{
			item: "chicken thigh",
			qty: 800,
			unit: "g",
			meal_id: "sheet-pan-thighs",
		},
	]);
	const listName = "Week 4 — chicken/rice";

	it("names format=text exactly list_name", () => {
		assert.equal(
			listText(listName, items),
			"Week 4 — chicken/rice\n- chicken thigh — 1600 g\n",
		);
	});

	it("prepends Woolworths — to line 1 for format=woolworths", () => {
		const text = titledListText(listName, items, "woolworths");
		assert.equal(text.startsWith("Woolworths — "), true);
		assert.equal(text.split("\n")[0], "Woolworths — Week 4 — chicken/rice");
		assert.equal(text.includes("- chicken thigh — 1600 g"), true);
	});

	it("keeps the same body for Coles / Bring / Notes", () => {
		const body = listText(listName, items).split("\n").slice(1).join("\n");
		for (const format of ["coles", "bring", "notes"] as const) {
			const text = titledListText(listName, items, format);
			assert.equal(text.split("\n").slice(1).join("\n"), body);
		}
	});
});
