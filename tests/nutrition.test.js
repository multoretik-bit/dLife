import test from "node:test";
import assert from "node:assert/strict";
import { targets, dayTotals, portion, weightStatus, weightTrend, logStreak, changeNutrition, validateNutrition, frequentFoods } from "../dist/nutrition-model.js";
import { FOODS, searchFoods, findFood } from "../dist/foods.js";
import { validateState, emptyState } from "../dist/schedule.js";

const profile = { sex: "m", age: 22, height: 180, weight: 90, goal: 80, activity: "light", pace: -0.5 };

test("daily target follows Mifflin–St Jeor with a deficit for the chosen pace", () => {
  const t = targets(profile);
  // BMR = 10·90 + 6,25·180 − 5·22 + 5 = 1920; TDEE = 1920·1,375 = 2640; −0,5 кг/нед ≈ −550 ккал
  assert.equal(t.bmr, 1920);
  assert.equal(t.tdee, 2640);
  assert.equal(t.kcal, 2090);
  assert.ok(t.p >= 140 && t.p <= 165, "белок 1,8 г на кг");
  assert.ok(Math.abs(t.p * 4 + t.f * 9 + t.c * 4 - t.kcal) < 15);
  assert.equal(targets({ ...profile, sex: "f", weight: 50, height: 150, age: 60, pace: -0.75, activity: "sedentary" }).kcal, 1200, "не ниже безопасного минимума");
  assert.ok(targets({ ...profile, pace: 0.25 }).kcal > t.tdee - 10);
  assert.equal(targets(undefined), null);
});

test("portions, day totals and archived days", () => {
  const egg = findFood("eg-egg");
  assert.deepEqual(portion(egg, 110), { k: 173, p: 14, f: 12, c: 0.8 });
  const n = { log: { "2026-10-26": [{ id: "a", meal: "b", name: "Яйцо", g: 110, k: 173, p: 14, f: 12, c: 0.8 }, { id: "b", meal: "s", name: "Кофе", g: 0, k: 50, p: 1, f: 2, c: 3 }] }, days: { "2026-01-01": { k: 1800, p: 100, f: 60, c: 200 } } };
  assert.equal(dayTotals(n, "2026-10-26").k, 223);
  assert.equal(dayTotals(n, "2026-01-01").k, 1800);
  assert.equal(dayTotals(n, "2026-10-25").k, 0);
});

test("weight trend smooths noise and predicts the goal date", () => {
  const weights = {};
  for (let i = 0; i < 28; i++) {
    const d = new Date("2026-09-28T12:00:00");
    d.setDate(d.getDate() + i);
    weights[d.toLocaleDateString("sv-SE")] = 90 - i * 0.07 + (i % 2 ? 0.6 : -0.6);
  }
  const trend = weightTrend(weights);
  assert.ok(Math.abs(trend.at(-1).t - trend.at(-2).t) < 0.3, "тренд не прыгает вслед за водой");
  const s = weightStatus({ profile, weights }, "2026-10-26");
  assert.ok(s.rate < 0 && s.rate > -1, `скорость ${s.rate}`);
  assert.ok(s.eta instanceof Date && s.eta > new Date("2026-10-26"));
  assert.ok(s.progress > 0 && s.progress < 1);
});

test("logging streak and frequent foods", () => {
  const e = (id, name) => ({ id, meal: "b", name, g: 100, k: 100, p: 1, f: 1, c: 1, food: name });
  const n = { log: { "2026-10-24": [e("1", "овсянка")], "2026-10-25": [e("2", "овсянка"), e("3", "банан")], "2026-10-26": [e("4", "овсянка")] } };
  assert.equal(logStreak(n, "2026-10-26"), 3);
  assert.equal(logStreak(n, "2026-10-27"), 3, "сегодня ещё не записано — серия не сгорает");
  assert.equal(frequentFoods(n)[0].name, "овсянка");
});

test("old diary days fold into totals and empty parts disappear", () => {
  const state = { ...emptyState(), nutrition: { profile, log: { "2025-01-10": [{ id: "x", meal: "l", name: "Плов", g: 300, k: 540, p: 18, f: 21, c: 72 }] } } };
  const next = changeNutrition(state, "2026-10-26", (n) => { n.water["2026-10-26"] = 500; });
  assert.equal(next.nutrition.log["2025-01-10"], undefined);
  assert.equal(next.nutrition.days["2025-01-10"].k, 540);
  assert.equal(next.nutrition.water["2026-10-26"], 500);
  assert.equal(next.nutrition.weights, undefined);
  assert.ok(validateState(next));
  assert.equal(state.nutrition.log["2025-01-10"].length, 1, "исходное состояние не меняется");
});

test("nutrition data is validated with the rest of the state", () => {
  const ok = { profile, log: { "2026-10-26": [{ id: "a", meal: "d", name: "Гречка", g: 180, k: 198, p: 7.6, f: 2, c: 38.3, food: "gr-buckwheat" }] }, weights: { "2026-10-26": 89.4 }, water: { "2026-10-26": 750 }, foods: [{ id: "my", name: "Мой батончик", k: 400, p: 20, f: 15, c: 45, portion: 40 }] };
  assert.ok(validateState({ ...emptyState(), nutrition: ok }));
  const bad = (patch) => validateNutrition({ ...ok, ...patch });
  assert.equal(bad({ profile: { ...profile, sex: "x" } }), false);
  assert.equal(bad({ log: { "26.10": [] } }), false);
  assert.equal(bad({ log: { "2026-10-26": [{ ...ok.log["2026-10-26"][0], meal: "brunch" }] } }), false);
  assert.equal(bad({ weights: { "2026-10-26": 5 } }), false);
  assert.equal(bad({ water: { "2026-10-26": 1.5 } }), false);
  assert.equal(bad({ foods: [{ ...ok.foods[0], k: -1 }] }), false);
  assert.equal(validateState({ ...emptyState(), nutrition: [] }), false);
});

test("food base has unique ids and search ranks word starts first", () => {
  assert.equal(new Set(FOODS.map((f) => f.id)).size, FOODS.length);
  assert.ok(FOODS.length >= 120);
  // У алкоголя калории в основном от спирта (7 ккал/г), он в БЖУ не входит.
  assert.ok(FOODS.filter((f) => !["dr-wine", "dr-beer"].includes(f.id)).every((f) => f.k >= 0 && f.portion > 0 && Math.abs(f.p * 4 + f.f * 9 + f.c * 4 - f.k) < f.k * 0.25 + 15), "БЖУ примерно сходятся с калориями");
  assert.equal(searchFoods("греч")[0].id, "gr-buckwheat");
  assert.equal(searchFoods("ябл")[0].id, "fr-apple");
  assert.equal(searchFoods("мой", [{ id: "m", name: "Мой салат", k: 80, p: 2, f: 5, c: 6, portion: 200 }])[0].id, "m");
});
