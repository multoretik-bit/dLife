// Питание: норма калорий и БЖУ, дневник еды, вода и вес с трендом.
// state.nutrition = { profile, log: {дата: [запись]}, days: {дата: итоги старых дней}, weights: {дата: кг}, water: {дата: мл}, foods: [свои продукты на 100 г] }
// Запись дневника: { id, meal: b|l|d|s, name, g, k, p, f, c, food? } — g граммов (0 — «быстрые калории»), k/p/f/c — уже посчитанные на порцию.

export const MEALS = [
  { id: "b", name: "Завтрак" },
  { id: "l", name: "Обед" },
  { id: "d", name: "Ужин" },
  { id: "s", name: "Перекусы" },
];
export const ACTIVITY = [
  { id: "sedentary", k: 1.2, name: "Сидячий", hint: "офис, почти без спорта" },
  { id: "light", k: 1.375, name: "Лёгкий", hint: "прогулки, 1–3 тренировки в неделю" },
  { id: "moderate", k: 1.55, name: "Средний", hint: "3–5 тренировок в неделю" },
  { id: "active", k: 1.725, name: "Высокий", hint: "тренировки почти каждый день" },
];
// Темп в кг в неделю: отрицательный — похудение, 0 — поддержание, положительный — набор.
export const PACES = [
  { v: -0.25, name: "Мягко", hint: "−0,25 кг/нед" },
  { v: -0.5, name: "Оптимально", hint: "−0,5 кг/нед" },
  { v: -0.75, name: "Быстро", hint: "−0,75 кг/нед" },
  { v: 0, name: "Держать вес", hint: "без дефицита" },
  { v: 0.25, name: "Набор", hint: "+0,25 кг/нед" },
];
export const WATER_GOAL = 2000, GLASS = 250, KCAL_PER_KG = 7700, DETAIL_DAYS = 180;

const round = (n, step = 1) => Math.round(n / step) * step;
const keyDays = (a, b) => Math.round((new Date(b + "T12:00:00") - new Date(a + "T12:00:00")) / 86400000);

/** Норма на день по формуле Миффлина — Сан-Жеора: калории и БЖУ. weight — текущий вес (тренд). */
export function targets(profile, weight = profile?.weight) {
  if (!profile || !weight) return null;
  const { sex, age, height, activity, pace = -0.5, goal } = profile;
  const bmr = 10 * weight + 6.25 * height - 5 * age + (sex === "f" ? -161 : 5);
  const tdee = bmr * (ACTIVITY.find((a) => a.id === activity)?.k || 1.375);
  const floor = sex === "f" ? 1200 : 1500;
  const kcal = round(Math.max(floor, tdee + (pace * KCAL_PER_KG) / 7), 10);
  // Белок — 1,8 г на кг (при похудении — на кг целевого веса, чтобы не завышать), жиры — около 27 % калорий, остальное — углеводы.
  const proteinBase = pace < 0 && goal ? Math.min(weight, Math.max(goal, weight * 0.8)) : weight;
  const p = round(proteinBase * 1.8), f = round((kcal * 0.27) / 9), c = Math.max(0, round((kcal - p * 4 - f * 9) / 4));
  return { kcal, p, f, c, bmr: round(bmr), tdee: round(tdee, 10), deficit: round(tdee - kcal, 10) };
}

export const entriesOf = (n, date) => n?.log?.[date] || [];

/** Итоги дня: из подробного дневника или из свёрнутых итогов старых дней. */
export function dayTotals(n, date) {
  const list = entriesOf(n, date);
  if (!list.length && n?.days?.[date]) return { ...n.days[date], count: 0 };
  const sum = (key) => list.reduce((s, e) => s + (e[key] || 0), 0);
  return { k: sum("k"), p: round(sum("p"), 0.1), f: round(sum("f"), 0.1), c: round(sum("c"), 0.1), count: list.length };
}

export const mealTotals = (n, date, meal) => entriesOf(n, date).filter((e) => e.meal === meal).reduce((s, e) => s + e.k, 0);

/** Порция продукта: значения на 100 г пересчитываются на граммы. */
export function portion(food, grams) {
  const x = grams / 100;
  return { k: round(food.k * x), p: round(food.p * x, 0.1), f: round(food.f * x, 0.1), c: round(food.c * x, 0.1) };
}

/** Сглаженный тренд веса (как в «Hacker's Diet»): дневные скачки воды не сбивают картину. */
export function weightTrend(weights) {
  const dates = Object.keys(weights || {}).sort();
  let ema = null, prev = null;
  return dates.map((date) => {
    const w = weights[date];
    if (ema === null) ema = w;
    else ema += (1 - Math.pow(0.9, Math.max(1, keyDays(prev, date)))) * (w - ema);
    prev = date;
    return { date, w, t: round(ema, 0.01) };
  });
}

/** Текущий вес (по тренду), скорость за последние 2–4 недели и прогноз даты цели. */
export function weightStatus(n, today) {
  const trend = weightTrend(n?.weights);
  const last = trend.at(-1);
  const current = last?.t ?? n?.profile?.weight ?? null;
  const goal = n?.profile?.goal;
  let rate = null, eta = null;
  if (trend.length >= 2) {
    const from = [...trend].reverse().find((r) => keyDays(r.date, last.date) >= 14) || trend[0];
    const days = keyDays(from.date, last.date);
    if (days >= 7) rate = round(((last.t - from.t) / days) * 7, 0.01);
  }
  if (goal && current && rate && Math.sign(goal - current) === Math.sign(rate) && Math.abs(goal - current) > 0.1) {
    const weeks = Math.abs(goal - current) / Math.abs(rate), d = new Date((today || last.date) + "T12:00:00");
    d.setDate(d.getDate() + Math.round(weeks * 7));
    if (weeks < 520) eta = d;
  }
  const start = n?.profile?.weight ?? trend[0]?.w ?? null;
  const progress = goal && start && current && start !== goal ? Math.max(0, Math.min(1, (start - current) / (start - goal))) : 0;
  return { trend, current, last: last?.w ?? null, lastDate: last?.date ?? null, rate, eta, goal, start, progress };
}

/** Сколько дней подряд (до сегодня или вчера) вёлся дневник. */
export function logStreak(n, today) {
  const has = (d) => entriesOf(n, d).length > 0 || !!n?.days?.[d];
  let d = new Date(today + "T12:00:00");
  if (!has(today)) d.setDate(d.getDate() - 1);
  let count = 0;
  while (count < 3650) {
    const key = d.toLocaleDateString("sv-SE");
    if (!has(key)) break;
    count++;
    d.setDate(d.getDate() - 1);
  }
  return count;
}

/** Частые продукты из дневника за последние недели — для быстрого добавления. */
export function frequentFoods(n, limit = 8) {
  const seen = new Map();
  for (const date of Object.keys(n?.log || {}).sort().reverse().slice(0, 30))
    for (const e of n.log[date]) {
      const key = e.food || `q:${e.name}`;
      const cur = seen.get(key) || { ...e, times: 0 };
      cur.times++;
      seen.set(key, cur);
    }
  return [...seen.values()].sort((a, b) => b.times - a.times).slice(0, limit);
}

/** Копия питания с изменением; подробный дневник старше DETAIL_DAYS сворачивается в дневные итоги (чтобы данные не росли бесконечно). */
export function changeNutrition(state, today, change) {
  const next = structuredClone(state);
  const n = (next.nutrition = { log: {}, weights: {}, water: {}, foods: [], days: {}, ...next.nutrition });
  change(n);
  for (const date of Object.keys(n.log)) {
    if (!n.log[date].length) delete n.log[date];
    else if (keyDays(date, today) > DETAIL_DAYS) {
      const t = dayTotals(n, date);
      n.days[date] = { k: t.k, p: t.p, f: t.f, c: t.c };
      delete n.log[date];
    }
  }
  for (const key of ["days", "weights", "water"]) if (!Object.keys(n[key]).length) delete n[key];
  if (!n.foods.length) delete n.foods;
  return next;
}

const isDate = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const num = (v, min, max) => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
const text = (v, max) => typeof v === "string" && v.trim().length > 0 && v.length <= max;
const obj = (v) => v && typeof v === "object" && !Array.isArray(v);
const macros = (e) => num(e.k, 0, 20000) && num(e.p, 0, 2000) && num(e.f, 0, 2000) && num(e.c, 0, 2000);

export function validateNutrition(n) {
  if (n === undefined) return true;
  if (!obj(n)) return false;
  if (n.profile !== undefined) {
    const p = n.profile;
    if (!obj(p) || !["m", "f"].includes(p.sex) || !num(p.age, 12, 100) || !num(p.height, 100, 250) || !num(p.weight, 30, 350)
      || !(p.goal === undefined || num(p.goal, 30, 350)) || !ACTIVITY.some((a) => a.id === p.activity) || !num(p.pace, -1, 0.5)) return false;
  }
  if (n.log !== undefined) {
    if (!obj(n.log) || Object.keys(n.log).length > 400) return false;
    for (const [date, list] of Object.entries(n.log)) {
      if (!isDate(date) || !Array.isArray(list) || list.length > 80) return false;
      if (new Set(list.map((e) => e?.id)).size !== list.length) return false;
      if (list.some((e) => !obj(e) || !text(e.id, 80) || !MEALS.some((m) => m.id === e.meal) || !text(e.name, 80) || !num(e.g, 0, 5000) || !macros(e) || (e.food !== undefined && !text(e.food, 80)))) return false;
    }
  }
  if (n.days !== undefined && (!obj(n.days) || Object.entries(n.days).some(([d, t]) => !isDate(d) || !obj(t) || !macros(t)))) return false;
  if (n.weights !== undefined && (!obj(n.weights) || Object.entries(n.weights).some(([d, w]) => !isDate(d) || !num(w, 30, 350)))) return false;
  if (n.water !== undefined && (!obj(n.water) || Object.entries(n.water).some(([d, ml]) => !isDate(d) || !Number.isInteger(ml) || ml < 0 || ml > 10000))) return false;
  if (n.foods !== undefined) {
    if (!Array.isArray(n.foods) || n.foods.length > 300 || new Set(n.foods.map((f) => f?.id)).size !== n.foods.length) return false;
    if (n.foods.some((f) => !obj(f) || !text(f.id, 80) || !text(f.name, 80) || !macros(f) || !num(f.portion, 1, 5000))) return false;
  }
  return true;
}
