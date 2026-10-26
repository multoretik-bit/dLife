import { dateKey } from "./schedule.js";
import { completionKey, itemDate } from "./development.js";
import { targets, dayTotals, weightStatus } from "./nutrition-model.js";
import { CALORIE_GOAL } from "./health.js";

// Плитки дня на главной: привычки, доход (капитал), время с пользой, еда, сожжённые калории.
// Сожжённые калории можно добавить прямо с плитки — числом через форму.
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
    // Через style: CSS-правило .tile-fill перебивает атрибуты SVG.
    fill.style.strokeDasharray = C;
    fill.style.strokeDashoffset = C * (1 - pct);
    tile.classList.toggle("is-full", pct >= 1);
  }
}

export function updateTiles(state) {
  const today = dateKey();
  const habits = state.items.filter((i) => i.type === "habit");
  const hDone = habits.filter((h) => state.done[completionKey(h, itemDate(h, state.blocks))]).length;
  setTile("habits", habits.length
    ? { value: `${hDone}<small>/${habits.length}</small>`, sub: hDone === habits.length ? "все отмечены" : `осталось ${habits.length - hDone}`, now: hDone, max: habits.length }
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

  const burned = state.calories?.[today] || 0, steps = state.steps?.[today];
  const burnSub = burned >= CALORIE_GOAL ? "минимум закрыт" : `сожжено · цель ${CALORIE_GOAL}`;
  setTile("burn", { value: `${fmt(burned)}<small> ккал</small>`, sub: steps ? `${burnSub} · ${fmt(steps)} шагов` : burnSub, now: burned, max: CALORIE_GOAL });
}

/** Форма на плитке: сколько добавить (или исправить итог за сегодня). */
export const TILE_FORMS = {
  burn: { unit: "ккал", max: 20000, placeholder: "например, 300", label: "Сколько калорий сожжено" },
};
export const tileForm = (kind) => {
  const f = TILE_FORMS[kind];
  return `<form class="tile-form" data-tile-form="${kind}"><input name="amount" type="number" inputmode="numeric" min="0" max="${f.max}" step="1" required placeholder="${f.placeholder}" aria-label="${f.label}"><span>${f.unit}</span>
    <div><button class="tile-btn" name="mode" value="add">Добавить</button><button class="tile-btn is-quiet" name="mode" value="set" title="Заменить сегодняшний итог этим числом">Сделать итогом</button><button type="button" class="tile-x" data-tile-cancel aria-label="Отмена">×</button></div></form>`;
};

/** Добавляет сожжённые калории за сегодня (mode "set" — исправляет итог). Возвращает новое состояние или null. */
export function tileChange(state, kind, amount, mode = "add") {
  const today = dateKey(), value = Math.round(Number(amount));
  if (!Number.isFinite(value) || value < 0 || (mode === "add" && value === 0)) return null;
  const total = (cur) => Math.min(TILE_FORMS[kind].max, mode === "set" ? value : cur + value);
  if (kind === "burn") {
    const next = structuredClone(state), v = total(next.calories?.[today] || 0);
    next.calories = { ...next.calories, [today]: v };
    if (!v) delete next.calories[today];
    return next;
  }
  return null;
}
