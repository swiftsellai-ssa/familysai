#!/usr/bin/env node
import { createHmac } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const SESSION_ID = process.argv[2] || "sess_dogfood_local";

function parseDevVars(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    let v = t.slice(eq + 1).trim();
    const q = v[0];
    if ((q === '"' || q === "'") && v[v.length - 1] === q) v = v.slice(1, -1);
    out[t.slice(0, eq).trim()] = v;
  }
  return out;
}

function loadSecret() {
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.trim()) {
    return process.env.SESSION_SECRET.trim();
  }
  const file = resolve(".dev.vars");
  if (!existsSync(file)) {
    console.error("SESSION_SECRET missing. Copy .dev.vars.example to .dev.vars.");
    process.exit(1);
  }
  const vars = parseDevVars(readFileSync(file, "utf8"));
  const s = typeof vars.SESSION_SECRET === "string" ? vars.SESSION_SECRET.trim() : "";
  if (!s) {
    console.error("SESSION_SECRET missing in .dev.vars");
    process.exit(1);
  }
  return s;
}

const secret = loadSecret();
if (Buffer.byteLength(secret, "utf8") < 32) {
  console.error("SESSION_SECRET must be 32+ bytes");
  process.exit(1);
}
const hmac = createHmac("sha256", secret).update(SESSION_ID).digest("hex");
process.stdout.write("fk_session=" + SESSION_ID + "." + hmac + "\n");
