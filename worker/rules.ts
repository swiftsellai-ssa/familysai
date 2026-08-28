/**
 * Parent house-rules APIs.
 *
 * GET/PUT /api/v1/rules  { body_md }
 * GET     /api/v1/rules/print  HTML card for print
 *
 * Session household only. Never read household_id from the client body.
 * Kiosk allowlist is PR-8 — these are parent APIs; no AUTH=off.
 */

import { Hono } from "hono";
import { householdIdFromSession, scopedFirst, scopedRun } from "./db";
import { writeRulesMd } from "./files";
import { DEFAULT_HOUSE_MD } from "./house-default";
import { requireParent, type SessionEnv } from "./session";

const BODY_MAX = 64 * 1024;
const PRIVATE = { "Cache-Control": "private, no-store" } as const;

type RulesRow = { body_md: string };

function errorJson(error: string, message: string) {
	return { error, message };
}

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

function inlineMd(s: string): string {
	return s
		.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
		.replace(/\*(.+?)\*/g, "<em>$1</em>");
}

/** Conservative markdown → HTML for the print card. Escape first. */
export function houseMdToHtml(md: string): string {
	const lines = escapeHtml(md.replace(/\r\n/g, "\n")).split("\n");
	const out: string[] = [];
	let inOl = false;
	let para: string[] = [];

	const flushPara = () => {
		if (para.length) {
			out.push(`<p>${inlineMd(para.join(" "))}</p>`);
			para = [];
		}
	};
	const closeOl = () => {
		if (inOl) {
			out.push("</ol>");
			inOl = false;
		}
	};

	for (const line of lines) {
		const heading = line.match(/^(#{1,3})\s+(.+)$/);
		if (heading) {
			flushPara();
			closeOl();
			const n = heading[1].length;
			out.push(`<h${n}>${inlineMd(heading[2])}</h${n}>`);
			continue;
		}
		const li = line.match(/^\d+\.\s+(.+)$/);
		if (li) {
			flushPara();
			if (!inOl) {
				out.push("<ol>");
				inOl = true;
			}
			out.push(`<li>${inlineMd(li[1])}</li>`);
			continue;
		}
		if (line.trim() === "") {
			flushPara();
			closeOl();
			continue;
		}
		closeOl();
		para.push(line);
	}
	flushPara();
	closeOl();
	return out.join("\n");
}

async function readOrSeedBody(
	env: Env,
	householdId: string,
): Promise<string> {
	const existing = await scopedFirst<RulesRow>(
		env.DB,
		householdId,
		`SELECT body_md FROM rules WHERE household_id = ?1`,
	);
	if (existing && typeof existing.body_md === "string") {
		return existing.body_md;
	}

	try {
		await scopedRun(
			env.DB,
			householdId,
			`INSERT INTO rules (household_id, body_md) VALUES (?1, ?2)`,
			[DEFAULT_HOUSE_MD],
		);
		await writeRulesMd(env, householdId, DEFAULT_HOUSE_MD);
	} catch {
		const raced = await scopedFirst<RulesRow>(
			env.DB,
			householdId,
			`SELECT body_md FROM rules WHERE household_id = ?1`,
		);
		if (raced && typeof raced.body_md === "string") return raced.body_md;
		return DEFAULT_HOUSE_MD;
	}
	return DEFAULT_HOUSE_MD;
}

function printDocument(bodyMd: string): string {
	const article = houseMdToHtml(bodyMd);
	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>House rules</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,600;0,9..144,700;1,9..144,500&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;1,8..60,400&display=swap" rel="stylesheet" />
<style>
  :root {
    --ink: #1c1612;
    --rule: #2a241c;
  }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    background: #fff;
    color: var(--ink);
    font-family: "Source Serif 4", "Iowan Old Style", Palatino, "Palatino Linotype", "Times New Roman", serif;
  }
  @page {
    size: auto;
    margin: 12mm;
  }
  .sheet {
    max-width: 180mm;
    margin: 0 auto;
    padding: 18mm 16mm 16mm;
    border: 1.6pt solid var(--ink);
    position: relative;
  }
  .sheet::before {
    content: "";
    position: absolute;
    inset: 3.5mm;
    border: 0.4pt solid var(--ink);
    pointer-events: none;
  }
  .clip {
    position: absolute;
    top: -7mm;
    left: 50%;
    width: 22mm;
    height: 14mm;
    transform: translateX(-50%);
    border: 1.4pt solid var(--ink);
    border-radius: 3mm 3mm 2mm 2mm;
    background: #fff;
  }
  .clip::after {
    content: "";
    position: absolute;
    left: 50%;
    top: 5mm;
    width: 8mm;
    height: 10mm;
    transform: translateX(-50%);
    border: 1.4pt solid var(--ink);
    border-top: none;
    border-radius: 0 0 2mm 2mm;
    background: #fff;
  }
  .stamp {
    position: absolute;
    top: 10mm;
    right: 12mm;
    width: 28mm;
    height: 28mm;
    border: 1.5pt solid var(--ink);
    border-radius: 50%;
    transform: rotate(-14deg);
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    font-family: "Fraunces", Palatino, serif;
    font-size: 7.5pt;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    line-height: 1.15;
    padding: 3mm;
  }
  article { position: relative; z-index: 1; padding-right: 8mm; }
  h1 {
    font-family: "Fraunces", Palatino, serif;
    font-optical-sizing: auto;
    font-weight: 700;
    font-size: 28pt;
    letter-spacing: -0.02em;
    margin: 4mm 0 3mm;
    line-height: 1.05;
  }
  h2, h3 {
    font-family: "Fraunces", Palatino, serif;
    font-weight: 600;
    margin: 4mm 0 2mm;
  }
  p {
    font-size: 12pt;
    line-height: 1.45;
    font-style: italic;
    margin: 0 0 8mm;
    max-width: 140mm;
  }
  ol {
    margin: 0;
    padding: 0;
    list-style: none;
    counter-reset: rule;
  }
  ol li {
    counter-increment: rule;
    position: relative;
    padding: 3.2mm 0 3.2mm 14mm;
    font-size: 12.5pt;
    line-height: 1.4;
    border-top: 0.4pt solid var(--ink);
    break-inside: avoid;
    page-break-inside: avoid;
  }
  ol li:last-child { border-bottom: 0.4pt solid var(--ink); }
  ol li::before {
    content: counter(rule);
    position: absolute;
    left: 0;
    top: 3.2mm;
    font-family: "Fraunces", Palatino, serif;
    font-weight: 700;
    font-size: 12.5pt;
    font-variant-numeric: oldstyle-nums;
  }
  .foot {
    margin-top: 10mm;
    font-size: 9pt;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    font-family: "Fraunces", Palatino, serif;
  }
  @media print {
    html, body { background: #fff; }
    .sheet {
      border-color: #000;
      max-width: none;
      page-break-inside: avoid;
    }
    .stamp, .clip, .sheet::before, article, h1, li, .foot { color: #000; border-color: #000; }
  }
</style>
</head>
<body>
  <main class="sheet">
    <div class="clip" aria-hidden="true"></div>
    <div class="stamp">Adult stays<br/>in the room</div>
    <article>
      ${article}
    </article>
    <p class="foot">Kitchen / study notice · print and pin</p>
  </main>
</body>
</html>
`;
}

export function createRules() {
	const app = new Hono<SessionEnv>();
	app.use("*", requireParent);

	app.get("/", async (c) => {
		const hid = householdIdFromSession(c.get("session"));
		const body_md = await readOrSeedBody(c.env, hid);
		return c.json({ body_md }, 200, PRIVATE);
	});

	app.put("/", async (c) => {
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
		const bodyMd = rec.body_md;
		if (typeof bodyMd !== "string") {
			return c.json(errorJson("validation", "body_md must be a string."), 400);
		}
		if (bodyMd.length > BODY_MAX) {
			return c.json(errorJson("validation", "body_md is too long."), 400);
		}

		const hid = householdIdFromSession(c.get("session"));
		await scopedRun(
			c.env.DB,
			hid,
			`INSERT INTO rules (household_id, body_md, updated_at)
			 VALUES (?1, ?2, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
			 ON CONFLICT (household_id) DO UPDATE SET
			   body_md = excluded.body_md,
			   updated_at = excluded.updated_at`,
			[bodyMd],
		);
		await writeRulesMd(c.env, hid, bodyMd);
		return c.json({ body_md: bodyMd }, 200, PRIVATE);
	});

	app.get("/print", async (c) => {
		const hid = householdIdFromSession(c.get("session"));
		const body_md = await readOrSeedBody(c.env, hid);
		return c.html(printDocument(body_md), 200, PRIVATE);
	});

	return app;
}
