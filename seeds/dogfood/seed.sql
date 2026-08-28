-- Local dogfood fixture ONLY.
-- Apply with:
--   npx wrangler d1 execute family-kit --local --file=seeds/dogfood/seed.sql
-- Never run this against remote D1. AUTH=off is forbidden; Playwright uses this
-- seed (the sessions row below), not an HTTP bypass.
--
-- Fake mailbox dogfood.local@localhost is local-only. Do not put a real operator
-- email in git. DOFOOD_EMAIL is a PR-7 ops fill-in.
--
-- Kiosk PIN 0000 is Playwright-only.
-- Hash = SHA-256(utf8(salt || pin)) hex.
--   salt = playwright_kiosk_v1
--   pin  = 0000
--   hash = 4c1f655eed21c1ed2bcda027b2464ae7a70678a9a749b81514baefdd5d1c4a02

INSERT INTO households (
  id, name, dogfood, onboarded, dinners_per_week, store,
  quiet_tz, kiosk_pin_hash, kiosk_pin_salt
) VALUES (
  'hid_dogfood_local',
  'Home',
  1,
  1,
  5,
  'woolworths',
  'Australia/Adelaide',
  '4c1f655eed21c1ed2bcda027b2464ae7a70678a9a749b81514baefdd5d1c4a02',
  'playwright_kiosk_v1'
);

INSERT INTO parents (household_id, id, email, display_name)
VALUES ('hid_dogfood_local', 'parent_a', 'dogfood.local@localhost', 'Parent');

INSERT INTO members (household_id, id, role, label)
VALUES
  ('hid_dogfood_local', 'parent_a', 'parent', 'Parent'),
  ('hid_dogfood_local', 'kid_8', 'child', 'Kid');

INSERT INTO rules (household_id, body_md)
VALUES (
  'hid_dogfood_local',
  '# House rules

Software is the clipboard. The adult stays in the room.

1. Homework at the kitchen table / family study. Not the bedroom.
2. Nothing is submitted until a parent has seen the final file.
3. If a model was used: stamp (used for / checked against).
4. History, politics, maths: model off unless a parent approves one narrow question.
5. Bones first. AI may refine wording. AI does not write the outline.
6. No private companion / character chats on family devices.
7. Night: devices charge outside the room, radios off.
'
);

-- Tiny meal/week fixture so later Sunday-list PRs have a row to query.
INSERT INTO meals (household_id, id, title, serves, leftovers, time_min, tags)
VALUES (
  'hid_dogfood_local',
  'butter-chicken',
  'Butter chicken',
  4,
  1,
  40,
  '["chicken"]'
);

INSERT INTO ingredients (household_id, meal_id, item, qty, unit, sort_order)
VALUES ('hid_dogfood_local', 'butter-chicken', 'chicken thigh', 800, 'g', 0);

INSERT INTO weeks (household_id, id, title, flex, list_name, origin, applied)
VALUES (
  'hid_dogfood_local',
  'week-01',
  'Week 1 — chicken',
  'leftover',
  'Week 1 — chicken',
  'human',
  1
);

INSERT INTO week_dinners (household_id, week_id, position, meal_id)
VALUES ('hid_dogfood_local', 'week-01', 0, 'butter-chicken');

-- Seeded parent session for wrangler dev / Playwright.
-- Cookie HMAC (fk_session=<id>.<hmac>) lands in PR-7. This PR stores the row
-- only. There is no AUTH=off header or query bypass.
INSERT INTO sessions (
  id, household_id, parent_id, expires_at, kiosk
) VALUES (
  'sess_dogfood_local',
  'hid_dogfood_local',
  'parent_a',
  '2099-01-01T00:00:00.000Z',
  0
);
