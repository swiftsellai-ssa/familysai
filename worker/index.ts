import { Hono } from "hono";
import { createAuth } from "./auth";
import { createWaitlist } from "./waitlist";
import { createRules } from "./rules";
import { createMembers } from "./members";
import { createStamps } from "./stamps";
import { createMealsCanon, createMealsWeeks } from "./meals";
import { requireSameOrigin } from "./origin";

const app = new Hono<{ Bindings: Env }>();

app.use("/api/*", requireSameOrigin);

app.get("/api/v1/health", (c) => c.json({ ok: true }));
app.route("/api/v1/waitlist", createWaitlist());

// Magic-link issue + consume + logout. No session required. No AUTH=off.
app.route("/api/v1/auth", createAuth());

// Parent APIs. Session cookie is id.hmac (SESSION_SECRET). No AUTH=off.
app.route("/api/v1/rules", createRules());

// Parent picks a child label on the study-PC stamp form until PR-8 kiosk enter.
app.route("/api/v1/household/members", createMembers());

// Stamp create / get / put. No Accept, no inbox list, no kiosk (PR-8).
app.route("/api/v1/stamps", createStamps());

// Sunday list: meal canon + labelled weeks + named text export. No LLM.
app.route("/api/v1/meals/canon", createMealsCanon());
app.route("/api/v1/meals/weeks", createMealsWeeks());

app.all("/api/*", (c) => c.json({ error: "not_found" }, 404));

export default app;
