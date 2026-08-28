import { Hono } from "hono";

const app = new Hono<{ Bindings: Env }>();

app.get("/api/v1/health", (c) => c.json({ ok: true }));

app.all("/api/*", (c) => c.json({ error: "not_found" }, 404));

export default app;
