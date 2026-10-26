import { dateKey } from "./schedule.js";
import { completionKey, itemDate } from "./development.js";
import { targets, dayTotals, weightStatus, changeNutrition, WATER_GOAL, GLASS } from "./nutrition-model.js";
import { CALORIE_GOAL } from "./health.js";

// Плитки дня на главной: привычки, доход (капитал), время с пользой, еда, вода, сожжённые калории.
// Разметка плиток статична (index.html), здесь только обновляются числа и кольца.
const fmt = (n) => new Intl.NumberFormat("ru-RU").format(Math.round(n));
const $ = (s) => document.querySelector(s);
const C = 2 * Math.PI * 26;

function setTile(id, { value, sub, now = 0, max = 0 }) {
  const tile = $(`#tile-${id}`);
  if (!tile) return;
  if (value !== undefined) tile.querySelector(".tile-value").innerHTML = value;
  if (sub !== undefined) tile.querySelector(".tile-sub").textContent = sub;
  const fill = tile.querySelector(".tile-fill");
  if (fill) {
    const pct = max ? Math.max(0, Math.min(1, now / max)) : 0;
    fill.setAttribute("stroke-dasharray", C);
    fill.setAttribute("stroke-dashoffset", C * (1 - pct));
    tile.classList.toggle("is-full", pct >= 1);
  }
}

export function updateTiles(state) {
  const today = dateKey();
  const habits = state.items.filter((i) => i.type === "habit");
  const hDone = habits.filter((h) => state.done[completionKey(h, itemDate(h, state.blocks))]).length;
  setTile("habits", habits.length
    ? { value: `${hDone}<small>/${habits.length}</small>`, sub: hDone === habits.length ? "все отмечены 🎉" : `осталось ${habits.length - hDone}`, now: hDone, max: habits.length }
    : { value: "—", sub: "добавь первую привычку" });

  const minutes = state.logs.filter((l) => l.date === today).reduce((n, l) => n + l.minutes, 0);
  const norm = (state.practices || []).reduce((n, p) => n + (p.target || 0), 0);
  setTile("time", { value: `${fmt(minutes)}<small> мин</small>`, sub: norm ? `из ${fmt(norm)} мин по нормам` : "по таймеру за сегодня", now: minutes, max: norm || 60 });

  const n = state.nutrition, eaten = dayTotals(n, today);
  if (n?.profile) {
    const t = targets(n.profile, weightStatus(n, today).current || n.profile.weight), left = t.kcal - eaten.k;
    setTile("food", { value: `${fmt(eaten.k)}<small> / ${fmt(t.kcal)}</small>`, sub: `${left >= 0 ? `осталось ${fmt(left)} ккал` : `сверх на ${fmt(-left)} ккал`} · белок ${Math.round(eaten.p)}/${t.p} г`, now: eaten.k, max: t.kcal });
    $("#tile-food")?.classList.toggle("is-over", left < -t.kcal * 0.05);
  } else setTile("food", { value: eaten.k ? `${fmt(eaten.k)}<small> ккал</small>` : "—", sub: "посчитай норму калорий", now: 0, max: 1 });

  const water = n?.water?.[today] || 0;
  setTile("water", { value: `${(water / 1000).toLocaleString("ru-RU")}<small> л</small>`, sub: `из ${WATER_GOAL / 1000} л · ${Math.round(water / GLASS)} ст.`, now: water, max: WATER_GOAL });

  const burned = state.calories?.[today] || 0;
  setTile("burn", { value: `${fmt(burned)}<small> ккал</small>`, sub: burned >= CALORIE_GOAL ? "минимум закрыт 🔥" : `сожжено · цель ${CALORIE_GOAL}`, now: burned, max: CALORIE_GOAL });
}

/** Быстрые кнопки на плитках: стакан воды и сожжённые калории. Возвращает новое состояние или null. */
export function quickChange(state, action) {
  const today = dateKey();
  if (action === "water") return changeNutrition(state, today, (n) => { n.water[today] = Math.min(10000, (n.water[today] || 0) + GLASS); });
  if (action === "burn") {
    const next = structuredClone(state);
    next.calories = { ...next.calories, [today]: Math.min(20000, (next.calories?.[today] || 0) + 100) };
    return next;
  }
  return null;
}
