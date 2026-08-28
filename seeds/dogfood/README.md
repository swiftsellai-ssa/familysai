# Local dogfood seed

Fixture household for `wrangler dev` and Playwright. **Local D1 only.**

Software is the clipboard. The adult stays in the room. The child (`kid_8`) is a
label on `members`, not a login.

## Apply 0002 + this seed (local)

From the repo root, after PR-2's `0001_waitlist.sql` is already applied locally:

```bash
npx wrangler d1 migrations apply family-kit --local
npx wrangler d1 execute family-kit --local --file=seeds/dogfood/seed.sql
```

First time on a fresh local D1: both `0001` and `0002` apply, then the seed.

Do **not** run the seed against remote D1. This PR does not apply remote
migrations and does not invent `database_id`.

## What the seed inserts

| Row | Value |
| --- | --- |
| household | `hid_dogfood_local`, `dogfood=1` |
| parent | `parent_a` + `parents` row, email `dogfood.local@localhost` (fake, local-only) |
| child | `kid_8` on `members` (`role=child`, label only). No child identity table. |
| kiosk PIN | `0000`, **Playwright-only**. SHA-256(`playwright_kiosk_v1` \|\| `0000`) hex. |
| session | `sess_dogfood_local`, expires 2099-01-01, `kiosk=0` |
| optional fixture | one meal `butter-chicken` (`leftovers` SQL `1`), one week `week-01`, one pending stamp `st_20260829_ww2-poster` (kid_8) |

`DOFOOD_EMAIL` is a PR-7 ops fill-in (operator mailbox). It is **not** this fake
address and is not written into git.

## Mint / use a session (Playwright, wrangler dev)

This PR: the `sessions` row is enough. Auth (magic link, cookie HMAC) is PR-7.
Playwright should use this seeded row, **not** an HTTP bypass.

**Forbidden:** `AUTH=off` header, `AUTH=off` query param, any Worker flag that
skips auth. Not on local, not on preview, not on production.

When PR-7 lands, the session cookie is:

```
fk_session=<session_id>.<hmac>
```

`HttpOnly; Secure; SameSite=Lax; Path=/`. HMAC is `HMAC-SHA256(session_id,
SESSION_SECRET)`. Reject a bad HMAC before the D1 lookup.

Until that HMAC exists, a test can:

1. Apply this seed (inserts `sess_dogfood_local`).
2. Read the row: `SELECT id, household_id, parent_id, expires_at, kiosk FROM sessions WHERE id = 'sess_dogfood_local';`
3. After PR-7: set `fk_session` to `sess_dogfood_local.<hmac>` using the local
   `SESSION_SECRET` from `.dev.vars`. Do not invent a production secret here.

Until PR-7 HMAC wrapping, wrangler dev uses the raw id: set cookie `fk_session=sess_dogfood_local` (`document.cookie = 'fk_session=sess_dogfood_local; Path=/'`) then open `/app/rules` or `/stamps/new` (alias `/app/stamps/new`). No `AUTH=off`.

To mint an extra local session later (still `--local` only):

```sql
INSERT INTO sessions (id, household_id, parent_id, expires_at, kiosk)
VALUES ('sess_…', 'hid_dogfood_local', 'parent_a', '2099-01-01T00:00:00.000Z', 0);
```

## R2

Local R2 is emulated. Binding `FILES` → bucket name `family-kit`. Private only;
no `r2.dev` public URLs.

Remote bucket is an ops leftover, not created by this PR:

```bash
npx wrangler r2 bucket create family-kit --location oc
```

Oceania hint (KD-12) is not AU residency. Do not invent an account ID.

## YAML sketches

Small examples matching the file-layer shapes live next to this README
(`household.yaml`, `meals/canon/butter-chicken.yaml`, `meals/weeks/week-01.yaml`,
`rules/house.md`, `stamps/st_20260829_ww2-poster.yaml`). Default printable card: [`../house.md`](../house.md).
