import test from "node:test";
import assert from "node:assert/strict";
import { addBar, addCount, setCount, startTimer, pauseTimer, stopTimer, barValue, barTarget, updateBar, removeBar } from "../dist/bars.js";
import { applySeeds, BARS_SEED } from "../dist/seeds.js";
import { validateState, emptyState, dateKey } from "../dist/schedule.js";

const base = () => ({ ...emptyState(), practices: [], logs: [], timer: null });

test("count bar: +1/+5/+10, custom amount and total, never below zero", () => {
  let s = addBar(base(), { name: "Отжимания", kind: "count", target: 50, unit: "раз" });
  const bar = s.bars[0];
  assert.equal(bar.sphereId, "2", "сфера по названию — Здоровье");
  s = addCount(s, bar.id, 10); s = addCount(s, bar.id, 5); s = addCount(s, bar.id, 1);
  assert.equal(barValue(s, bar), 16);
  s = setCount(s, bar.id, 48);
  assert.equal(barValue(s, bar), 48);
  s = addCount(s, bar.id, -100);
  assert.equal(barValue(s, bar), 0);
  assert.ok(validateState(s));
});

test("minutes bar: timer start/pause/stop writes minutes to the practice and fills the linked habit", () => {
  let s = { ...base(), items: [{ id: "h-hist", type: "habit", name: "История — 30 минут", sphereId: "10", blockId: "", coins: 0 }] };
  s = addBar(s, { name: "История", kind: "minutes", target: 30 });
  const bar = s.bars[0];
  assert.equal(bar.habitId, "h-hist", "бар связан с привычкой");
  assert.equal(barTarget(s, bar), 30);
  const t0 = Date.now();
  s = startTimer(s, bar.practiceId, t0);
  s = pauseTimer(s, t0 + 10 * 60000);
  assert.equal(Math.round(barValue(s, bar, { live: true })), 10, "пока идёт таймер — живые минуты");
  s = startTimer(s, bar.practiceId, t0 + 20 * 60000);
  const { next, minutes } = stopTimer(s, t0 + 40 * 60000);
  assert.equal(minutes, 30);
  assert.equal(next.timer, null);
  assert.equal(barValue(next, bar), 30);
  assert.equal(next.done[`${dateKey()}:h-hist`], true, "полный бар отметил привычку");
  assert.ok(validateState(next));
});

test("another practice's timer blocks start; under a minute is not logged", () => {
  let s = addBar(base(), { name: "Испанский", kind: "minutes", target: 30 });
  s = addBar(s, { name: "Английский", kind: "minutes", target: 30 });
  const [es, en] = s.bars;
  const t0 = Date.now();
  s = startTimer(s, es.practiceId, t0);
  assert.throws(() => startTimer(s, en.practiceId, t0), /другой таймер/);
  const { next, minutes } = stopTimer(s, t0 + 20000);
  assert.equal(minutes, 0);
  assert.equal(next.logs.length, 0);
});

test("minutes bar reuses an existing practice; edit changes the norm; remove keeps the minutes", () => {
  let s = { ...base(), practices: [{ id: "p-en", sphereId: "10", name: "Английский", target: 60, coinRate: 2 }], logs: [{ id: "l1", sphereId: "10", practiceId: "p-en", note: "англ", date: dateKey(), minutes: 12, coinRate: 2 }] };
  s = addBar(s, { name: "английский", kind: "minutes", target: 30, sphereId: "10" });
  assert.equal(s.practices.length, 1);
  assert.equal(s.practices[0].target, 30);
  assert.equal(barValue(s, s.bars[0]), 12);
  s = updateBar(s, s.bars[0].id, { name: "Английский", target: 45 });
  assert.equal(s.practices[0].target, 45);
  s = removeBar(s, s.bars[0].id);
  assert.equal(s.bars.length, 0);
  assert.equal(s.logs.length, 1);
});

test("seed: pushups 50 and 30-minute bars for history, Spanish and English, once", () => {
  const next = applySeeds(base());
  assert.ok(validateState(next));
  assert.deepEqual(next.bars.map((b) => `${b.name}:${b.kind}`), ["Отжимания:count", "История:minutes", "Испанский:minutes", "Английский:minutes"]);
  assert.equal(next.bars[0].target, 50);
  assert.ok(next.bars.slice(1).every((b) => barTarget(next, b) === 30));
  assert.ok(next.items.find((i) => /англ/i.test(i.name)).name.includes("30 минут"));
  assert.ok(next.applied.includes(BARS_SEED));
  assert.equal(applySeeds(next), null);
});
