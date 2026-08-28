import { Hono } from "hono";
import { createWaitlist } from "./waitlist";

const app = new Hono<{ Bindings: Env }>();

app.get("/api/v1/health", (c) => c.json({ ok: true }));
app.route("/api/v1/waitlist", createWaitlist());

app.all("/api/*", (c) => c.json({ error: "not_found" }, 404));

export default app;
