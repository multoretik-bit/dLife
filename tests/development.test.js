import test from "node:test";
import assert from "node:assert/strict";
import {
  occurs,
  completionKey,
  streak,
  shiftDate,
  progressMinutes,
  normalize,
} from "../dist/development.js";
import { validateState, emptyState } from "../dist/schedule.js";
test("21 consecutive days, missed day resets, today can still be completed", () => {
  const item = { id: "h", type: "habit" },
    done = {};
  for (let n = 0; n < 21; n++)
    done[completionKey(item, shiftDate("2026-09-21", -n))] = true;
  assert.equal(streak(item, done, "2026-09-21"), 21);
  assert.equal(streak(item, done, "2026-09-22"), 21);
  assert.equal(streak(item, done, "2026-09-23"), 0);
  delete done["2026-09-20:h"];
  assert.equal(streak(item, done, "2026-09-21"), 1);
});
test("weekly occurrences start on selected date and each has independent completion", () => {
  const t = { id: "t", type: "task", date: "2026-09-21", weekly: true };
  assert.equal(occurs(t, "2026-09-14"), false);
  assert.equal(occurs(t, "2026-09-28"), true);
  assert.equal(occurs(t, "2026-09-29"), false);
  assert.notEqual(
    completionKey(t, "2026-09-21"),
    completionKey(t, "2026-09-28"),
  );
  assert.equal(occurs({ ...t, weekly: false }, "2026-09-28"), false);
});
test("daily items and development data accepted; malformed dates and targets rejected", () => {
  const s = normalize(emptyState());
  s.items.push({
    id: "t",
    type: "task",
    blockId: "",
    name: "Test",
    sphereId: "10",
    date: "2026-09-21",
    time: "14:00",
    weekly: true,
  });
  s.practices.push({ id: "p", name: "Reading", sphereId: "10", target: 30 });
  s.logs.push({
    id: "l",
    sphereId: "10",
    practiceId: "p",
    date: "2026-09-21",
    note: "Book",
    minutes: 15,
  });
  s.spherePlans["10"] = {
    vision: "Read",
    deadline: "2026-12-31",
    tools: "Book",
    results: "",
  };
  s.timer = { startedAt: Date.now() };
  assert.equal(validateState(s), true);
  s.items[0].date = "2026-02-31";
  assert.equal(validateState(s), false);
  s.items[0].date = "2026-09-21";
  s.practices[0].target = 0;
  assert.equal(validateState(s), false);
});
test("reading and history accumulate separately and reset with date", () => {
  const s = normalize(emptyState());
  s.logs = [
    { practiceId: "reading", date: "2026-09-21", minutes: 15 },
    { practiceId: "history", date: "2026-09-21", minutes: 10 },
    { practiceId: "reading", date: "2026-09-20", minutes: 30 },
  ];
  assert.equal(progressMinutes(s, "reading", "2026-09-21"), 15);
  assert.equal(progressMinutes(s, "history", "2026-09-21"), 10);
  assert.equal(progressMinutes(s, "reading", "2026-09-22"), 0);
});
