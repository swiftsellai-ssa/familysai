import { Hono } from "hono";
import { createWaitlist } from "./waitlist";
import { createRules } from "./rules";
import { createMembers } from "./members";
import { createStamps } from "./stamps";

const app = new Hono<{ Bindings: Env }>();

app.get("/api/v1/health", (c) => c.json({ ok: true }));
app.route("/api/v1/waitlist", createWaitlist());

// Parent rules APIs. Mount before the /api/* 404. Session cookie is the
// raw sessions.id until HMAC wrapping in PR-7. No AUTH=off.
app.route("/api/v1/rules", createRules());

// Parent picks a child label on the study-PC stamp form until PR-8 kiosk enter.
app.route("/api/v1/household/members", createMembers());

// Stamp create / get / put. No Accept, no inbox list, no kiosk (PR-8).
app.route("/api/v1/stamps", createStamps());

app.all("/api/*", (c) => c.json({ error: "not_found" }, 404));

export default app;
