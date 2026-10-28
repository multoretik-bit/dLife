import test from "node:test";
import assert from "node:assert/strict";
import { addCount, setCount, setProgress, removeProgress, progressValue, startTimer, pauseTimer, stopTimer, barsIntoHabits } from "../dist/habit-progress.js";
import { validateState, dateKey } from "../dist/schedule.js";
import { completionKey, itemDate } from "../dist/development.js";

const base = () => ({
  blocks: [],
  items: [
    { id: "push", type: "habit", name: "Отжимания — 50 раз", sphereId: "2", blockId: "", coins: 0 },
    { id: "hist", type: "habit", name: "История — 30 минут", sphereId: "10", blockId: "", coins: 0 },
  ],
  done: {},
  practices: [{ id: "p-hist", sphereId: "10", name: "История", target: 30, coinRate: 1 }],
  logs: [],
});
const isDone = (s, id) => { const h = s.items.find((i) => i.id === id); return !!s.done[completionKey(h, itemDate(h, s.blocks))]; };

test("отжимания: шкала по количеству, полная отмечает привычку", () => {
  let s = setProgress(base(), "push", { kind: "count", target: 50, unit: "раз" });
  s = addCount(addCount(s, "push", 10), "push", 5);
  const h = s.items.find((i) => i.id === "push");
  assert.equal(progressValue(s, h), 15);
  assert.equal(isDone(s, "push"), false);
  s = addCount(s, "push", 35);
  assert.equal(isDone(s, "push"), true);
  s = setCount(s, "push", 20);
  assert.equal(progressValue(s, s.items[0]), 20);
});

test("учёба: шкала по минутам из таймера, стоп записывает минуты в занятие", () => {
  let s = setProgress(base(), "hist", { kind: "minutes", target: 30 });
  const h = s.items.find((i) => i.id === "hist");
  assert.deepEqual(h.progress, { kind: "minutes", practiceId: "p-hist" });
  const t0 = Date.now();
  s = startTimer(s, "p-hist", t0);
  s = pauseTimer(s, t0 + 10 * 60000);
  assert.ok(Math.abs(progressValue(s, h, { live: true }) - 10) < 0.01);
  s = startTimer(s, "p-hist", t0 + 20 * 60000);
  const { next, minutes } = stopTimer(s, t0 + 40 * 60000);
  assert.equal(minutes, 30);
  assert.equal(next.timer, null);
  assert.equal(progressValue(next, h, { date: dateKey(new Date(t0 + 40 * 60000)) }), 30);
  assert.throws(() => startTimer(startTimer(next, "p-hist"), "other"));
});

test("шкала проходит validateState и снимается", () => {
  const s = setProgress(setProgress(base(), "push", { kind: "count", target: 50, unit: "раз" }), "hist", { kind: "minutes", target: 30 });
  assert.equal(validateState(s), true);
  assert.equal(removeProgress(s, "push").items[0].progress, undefined);
  assert.equal(validateState({ ...s, items: [{ ...s.items[0], progress: { kind: "count", target: 0, unit: "раз" } }] }), false);
});

test("старые отдельные бары переезжают в привычки вместе с количеством", () => {
  const today = dateKey(new Date());
  const s = { ...base(), bars: [{ id: "bar-pushups", kind: "count", name: "Отжимания", target: 50, unit: "раз", sphereId: "2" }, { id: "bar-history", kind: "minutes", name: "История", sphereId: "10", practiceId: "p-hist" }], counts: { [today]: { "bar-pushups": 12 } } };
  const next = barsIntoHabits(s);
  assert.equal(next.bars, undefined);
  assert.deepEqual(next.items[0].progress, { kind: "count", target: 50, unit: "раз" });
  assert.deepEqual(next.items[1].progress, { kind: "minutes", practiceId: "p-hist" });
  assert.equal(next.counts[today].push, 12);
  assert.equal(barsIntoHabits(next), null);
});
