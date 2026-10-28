import test from "node:test";
import assert from "node:assert/strict";
import { applySeeds, STUDY_SEED } from "../dist/seeds.js";
import { validateState, emptyState } from "../dist/schedule.js";

test("evening study is added once: 2-hour block, three subject habits and study norms", () => {
  const state = { ...emptyState(), practices: [{ id: "p-en", sphereId: "10", name: "Английский", target: 30, coinRate: 1 }, { id: "p-read", sphereId: "10", name: "Чтение", target: 50 }] };
  const next = applySeeds(state);
  assert.ok(validateState(next));
  assert.deepEqual(next.blocks.map((b) => `${b.name} ${b.start}-${b.end}`), ["Учёба 20:00-22:00"]);
  assert.deepEqual(next.items.filter((i) => i.sphereId === "10").map((i) => `${i.time} ${i.name} ${i.blockId}`), ["20:00 История — 30 минут study-evening", "20:30 Испанский — 30 минут study-evening", "21:00 Английский — 30 минут study-evening"]); // с 28.10 норма английского — 30 минут; отжимания — отдельная привычка со шкалой
  const norms = Object.fromEntries(next.practices.filter((p) => p.sphereId === "10").map((p) => [p.name, p.target]));
  assert.deepEqual(norms, { "Английский": 30, "Чтение": 50, "История": 30, "Испанский": 30 });
  assert.equal(next.practices.filter((p) => /англ/i.test(p.name)).length, 1, "английский не задваивается");
  assert.ok(next.applied.includes(STUDY_SEED));
  assert.equal(applySeeds(next), null, "второй раз ничего не добавляет");
  const afterDelete = { ...next, items: [] };
  assert.equal(applySeeds(afterDelete), null, "удалённое не возвращается");
  assert.equal(state.practices[0].target, 30, "исходное состояние не меняется");
});

test("if 20:00–22:00 is taken, the subjects become all-day habits with their times", () => {
  const busy = { ...emptyState(), blocks: [{ id: "b1", name: "Спорт", start: "19:30", end: "21:00", sphereId: "2" }] };
  const next = applySeeds(busy);
  assert.ok(validateState(next));
  assert.equal(next.blocks.length, 1);
  assert.ok(next.items.filter((i) => i.sphereId === "10").every((i) => i.blockId === "" && /^\d\d:\d\d$/.test(i.time)));
});

test("subjects that landed on the whole day move into Denis's study block, which grows to 20:00–22:00", async () => {
  const { STUDY_MOVE_SEED } = await import("../dist/seeds.js");
  // Как у Дениса: учебный блок уже стоял вечером, поэтому предметы встали «на весь день».
  const base = { ...emptyState(), blocks: [{ id: "u1", name: "Учебный блок", start: "19:00", end: "21:00", sphereId: "10" }, { id: "u2", name: "Сон", start: "23:00", end: "07:00", sphereId: "6" }] };
  const next = applySeeds(base);
  assert.ok(validateState(next));
  assert.ok(next.applied.includes(STUDY_MOVE_SEED));
  assert.deepEqual(next.items.filter((i) => i.sphereId === "10").map((i) => `${i.time} ${i.blockId}`), ["20:00 u1", "20:30 u1", "21:00 u1"]);
  assert.deepEqual([next.blocks[0].start, next.blocks[0].end], ["19:00", "22:00"], "блок дорос до 22:00");
  assert.equal(applySeeds(next), null);
  // Если расширение задело бы соседний блок — блок не трогаем, предметы всё равно внутри.
  const tight = { ...emptyState(), blocks: [{ id: "u1", name: "Учёба", start: "19:00", end: "21:00", sphereId: "10" }, { id: "u3", name: "Ужин", start: "21:00", end: "22:00", sphereId: "4" }] };
  const t = applySeeds(tight);
  assert.ok(validateState(t));
  assert.ok(t.items.filter((i) => i.sphereId === "10").every((i) => i.blockId === "u1"));
  assert.equal(t.blocks[0].end, "21:00");
});
