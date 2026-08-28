import { Hono } from "hono";
import { createAuth } from "./auth";
import { createWaitlist } from "./waitlist";
import { createRules } from "./rules";
import { createMembers } from "./members";
import { createStamps } from "./stamps";
import { createMealsCanon, createMealsWeeks } from "./meals";
import { createSettings } from "./settings";
import { handleMe } from "./me";
import { requireSameOrigin } from "./origin";
import { requireParent, requireKioskAllowlist } from "./middleware";
import type { SessionEnv } from "./session";

const app = new Hono<{ Bindings: Env }>();

app.use("/api/*", requireSameOrigin);

app.get("/api/v1/health", (c) => c.json({ ok: true }));
app.route("/api/v1/waitlist", createWaitlist());

// Magic-link issue + consume + logout. No session required. No AUTH=off.
app.route("/api/v1/auth", createAuth());

// Parent APIs. HMAC session. Deny-by-default kiosk allowlist when sessions.kiosk=1.
const authed = new Hono<SessionEnv>();
authed.use("*", requireParent);
authed.use("*", requireKioskAllowlist);

authed.get("/me", handleMe);
authed.route("/household/members", createMembers());
authed.route("/rules", createRules());
authed.route("/stamps", createStamps());
authed.route("/meals/canon", createMealsCanon());
authed.route("/meals/weeks", createMealsWeeks());
authed.route("/settings", createSettings());

app.route("/api/v1", authed);

app.all("/api/*", (c) => c.json({ error: "not_found" }, 404));

export default app;
