import { d1Adapter } from "../src/local-db.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { scheduleApi } from "../src/api.js";
import { emptyState } from "../dist/schedule.js";
function database() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(
    "CREATE TABLE schedules (user_id TEXT PRIMARY KEY,payload TEXT NOT NULL,revision INTEGER NOT NULL)",
  );
  return { ...d1Adapter(sqlite), close: () => sqlite.close() };
}
const put = (revision, state = emptyState(), origin = "https://dlife.test") =>
  new Request("https://dlife.test/api/schedule", {
    method: "PUT",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify({ state, revision }),
  });
test("authorization, validation and cross-origin protection", async () => {
  const db = database();
  assert.equal((await scheduleApi(put(0), db, null)).status, 401);
  assert.equal(
    (await scheduleApi(put(0, emptyState(), "https://other.test"), db, "u"))
      .status,
    403,
  );
  assert.equal(
    (await scheduleApi(put(0, { ...emptyState(), blocks: [{}] }), db, "u"))
      .status,
    400,
  );
  db.close();
});
test("saved data survives reads; stale revisions fail; users isolated", async () => {
  const db = database();
  const state = {
    ...emptyState(),
    blocks: [
      { id: "a", name: "Спорт", start: "09:00", end: "10:00", sphereId: "2" },
    ],
  };
  assert.equal((await scheduleApi(put(0, state), db, "u")).status, 200);
  assert.equal((await scheduleApi(put(0), db, "u")).status, 409);
  const get = new Request("https://dlife.test/api/schedule");
  assert.deepEqual(
    (await (await scheduleApi(get, db, "u")).json()).state,
    state,
  );
  assert.deepEqual(
    (await (await scheduleApi(get, db, "v")).json()).state,
    emptyState(),
  );
  db.close();
});
