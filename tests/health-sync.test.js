import test from "node:test";
import assert from "node:assert/strict";
import handler, { number, parseDay, mergeDay, blobPath } from "../api/health-sync.js";
import { applyWatch } from "../dist/watch.js";
import { validateState, emptyState } from "../dist/schedule.js";

const TOKEN = "abcdefghijklmnopqrstuvwxyz012345";
const fakeBlob = () => {
  const files = new Map();
  return {
    files,
    get: async (path) => (files.has(path) ? { statusCode: 200, stream: new Response(files.get(path)).body } : null),
    put: async (path, body) => { files.set(path, body); return { pathname: path }; },
  };
};
const fakeRes = () => {
  const r = { code: 0, body: null, setHeader() {} };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
};
const env = { BLOB_READ_WRITE_TOKEN: "x" };
const call = async (blob, method, body, token = TOKEN) => { const res = fakeRes(); await handler({ method, headers: token ? { "x-health-token": token } : {}, body }, res, { env, blob }); return res; };

test("numbers from Shortcuts are read in any common shape", () => {
  assert.equal(number("8 432"), 8432);
  assert.equal(number("8 432"), 8432);
  assert.equal(number("245,7 ккал"), 245.7);
  assert.equal(number("1200\n3400\n800"), 5400);
  assert.equal(number([100, "50,5"]), 150.5);
  assert.ok(Number.isNaN(number("")));
});

test("a day is validated and merged without losing the other value", () => {
  assert.deepEqual(parseDay({ date: "2026-10-26", steps: "8 432", kcal: 245.7 }), { date: "2026-10-26", steps: 8432, kcal: 246 });
  assert.match(parseDay({ steps: -1 }), /Шаги/);
  assert.match(parseDay({ date: "26.10.2026", steps: 1 }), /ГГГГ/);
  assert.match(parseDay({}), /steps/);
  const a = mergeDay({ days: {} }, { date: "2026-10-26", steps: 8000 }, "t1");
  const b = mergeDay(a, { date: "2026-10-26", kcal: 300 }, "t2");
  assert.deepEqual(b.days["2026-10-26"], { steps: 8000, kcal: 300, at: "t2" });
  let many = { days: {} };
  for (let i = 0; i < 130; i++) many = mergeDay(many, { date: `2026-0${1 + Math.floor(i / 28)}-${String((i % 28) + 1).padStart(2, "0")}`, steps: i }, "t");
  assert.equal(Object.keys(many.days).length, 120);
});

test("the endpoint stores per token and refuses without one", async () => {
  const blob = fakeBlob();
  assert.equal((await call(blob, "POST", { steps: 1 }, "")).code, 401);
  assert.equal((await call(blob, "POST", { steps: 1 }, "short")).code, 401);
  assert.equal((await call(blob, "POST", { date: "2026-10-26", steps: "9 100", kcal: "310,2" })).code, 200);
  assert.ok(blob.files.has(blobPath(TOKEN)));
  assert.ok(!blobPath(TOKEN).includes(TOKEN), "в имени файла — хеш, а не сам токен");
  const got = await call(blob, "GET");
  assert.deepEqual({ steps: got.body.days["2026-10-26"].steps, kcal: got.body.days["2026-10-26"].kcal }, { steps: 9100, kcal: 310 });
  assert.equal((await call(blob, "GET", undefined, "zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz")).body.days["2026-10-26"], undefined, "другой токен — другие данные");
  assert.equal((await call(blob, "PUT", {})).code, 405);
  const res = fakeRes();
  await handler({ method: "GET", headers: { "x-health-token": TOKEN } }, res, { env: {}, blob });
  assert.equal(res.code, 503);
});

test("watch data is merged into steps and burned calories only when something changed", () => {
  const state = { ...emptyState(), healthSync: { token: TOKEN }, steps: { "2026-10-25": 5000 }, calories: { "2026-10-26": 100 } };
  const data = { days: { "2026-10-25": { steps: 5000 }, "2026-10-26": { steps: 8432, kcal: 310 } }, updatedAt: "2026-10-26T10:00:00.000Z" };
  const next = applyWatch(state, data);
  assert.equal(next.steps["2026-10-26"], 8432);
  assert.equal(next.calories["2026-10-26"], 310);
  assert.equal(next.healthSync.lastAt, data.updatedAt);
  assert.ok(validateState(next));
  assert.equal(applyWatch(next, data), null, "повторно — без лишнего сохранения");
  assert.equal(state.calories["2026-10-26"], 100, "исходное состояние не меняется");
});

test("the sync token in state is validated", () => {
  assert.ok(validateState({ ...emptyState(), healthSync: { token: TOKEN, lastAt: "2026-10-26T10:00:00.000Z" } }));
  assert.equal(validateState({ ...emptyState(), healthSync: { token: "bad token" } }), false);
  assert.equal(validateState({ ...emptyState(), healthSync: [] }), false);
});

test("the token can sit right in the link, so a Shortcut needs no headers", async () => {
  const blob = fakeBlob(), res = fakeRes();
  await handler({ method: "POST", url: `/api/health-sync/?token=${TOKEN}`, headers: {}, body: { date: "2026-10-26", steps: "1200\n3400", kcal: "" } }, res, { env, blob });
  assert.equal(res.code, 200, JSON.stringify(res.body));
  assert.equal(res.body.steps, 4600);
  assert.equal(res.body.kcal, undefined, "пустое поле калорий просто пропускается");
  const res2 = fakeRes();
  await handler({ method: "POST", url: `/api/health-sync/?token=${TOKEN}&date=2026-10-27&steps=500&kcal=120`, headers: {} }, res2, { env, blob });
  assert.deepEqual([res2.code, res2.body.steps, res2.body.kcal], [200, 500, 120]);
});
