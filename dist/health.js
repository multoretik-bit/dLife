import { dateKey } from "./schedule.js";

// Сожжённые калории за день: минимум 250 ккал закрывает круг, всё сверху — «золотая зона».
export const CALORIE_GOAL = 250;
const GOLD_MAX = 1000; // к этой отметке золотое свечение достигает максимума
const R = 86, C = 2 * Math.PI * R, R2 = 68, C2 = 2 * Math.PI * R2;
const DAYS = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];

export function calorieLevel(kcal) {
  if (kcal >= CALORIE_GOAL) return "gold";
  return kcal > 0 ? "progress" : "empty";
}

/** Блок калорий на странице «Здоровье». */
export function mountCalories({ before, getState, save }) {
  const root = document.createElement("section");
  root.className = "sp-card hp";
  root.dataset.section = "calories";
  root.setAttribute("aria-labelledby", "calories-title");
  before.before(root);

  const today = () => dateKey();
  const value = (key = today()) => getState().calories?.[key] ?? 0;

  async function setToday(kcal) {
    const next = structuredClone(getState()), key = today();
    next.calories = { ...next.calories, [key]: Math.max(0, Math.min(20000, Math.round(kcal))) };
    if (!next.calories[key]) delete next.calories[key];
    if (await save(next)) render();
  }

  function week() {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      const kcal = value(dateKey(d)), pct = Math.min(1, kcal / CALORIE_GOAL);
      return `<li class="hp-day is-${calorieLevel(kcal)}${i === 6 ? " is-today" : ""}" title="${dateKey(d)}: ${kcal} ккал">
        <svg viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="14" class="hp-day-track"/><circle cx="18" cy="18" r="14" class="hp-day-fill" stroke-dasharray="${2 * Math.PI * 14}" stroke-dashoffset="${2 * Math.PI * 14 * (1 - pct)}"/></svg>
        <span>${i === 6 ? "сегодня" : DAYS[d.getDay()]}</span></li>`;
    }).join("");
  }

  function render() {
    const kcal = value(), gold = kcal >= CALORIE_GOAL;
    const pct = Math.min(1, kcal / CALORIE_GOAL);
    const extra = Math.max(0, kcal - CALORIE_GOAL), extraPct = Math.min(1, extra / (GOLD_MAX - CALORIE_GOAL));
    root.className = `sp-card hp${gold ? " is-gold" : ""}`;
    root.style.setProperty("--glow", extraPct.toFixed(3));
    root.innerHTML = `
      <div class="sp-card-head"><h2 id="calories-title">Калории за день</h2><p class="sp-summary">${gold ? "Минимум закрыт — дальше только лучше" : `Цель — минимум ${CALORIE_GOAL} ккал`}</p></div>
      <div class="hp-body">
        <div class="hp-ring" role="progressbar" aria-label="Сожжено калорий сегодня" aria-valuenow="${kcal}" aria-valuemin="0" aria-valuemax="${CALORIE_GOAL}">
          <svg viewBox="0 0 200 200" aria-hidden="true">
            <defs>
              <linearGradient id="hp-blue" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3a9bff"/><stop offset="1" stop-color="#1101ff"/></linearGradient>
              <linearGradient id="hp-gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe27a"/><stop offset=".55" stop-color="#f5b90b"/><stop offset="1" stop-color="#e08a00"/></linearGradient>
            </defs>
            <circle cx="100" cy="100" r="${R}" class="hp-track"/>
            <circle cx="100" cy="100" r="${R}" class="hp-fill" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - pct)}"/>
            ${gold ? `<circle cx="100" cy="100" r="${R2}" class="hp-track hp-track-inner"/><circle cx="100" cy="100" r="${R2}" class="hp-bonus" stroke-dasharray="${C2}" stroke-dashoffset="${C2 * (1 - extraPct)}"/>` : ""}
          </svg>
          <div class="hp-center">
            <b>${kcal}</b>
            <span>${gold ? (extra ? `+${extra} сверх нормы` : "норма закрыта") : `из ${CALORIE_GOAL} ккал`}</span>
            ${gold ? '<i class="hp-crown" aria-hidden="true">★</i>' : ""}
          </div>
        </div>
        <div class="hp-side">
          <p class="hp-left">${gold ? `<strong>Золото!</strong> Каждая следующая калория делает круг ярче.` : kcal ? `Осталось <strong>${CALORIE_GOAL - kcal} ккал</strong> до минимума.` : "Запиши, сколько калорий сжёг сегодня."}</p>
          <div class="hp-chips" role="group" aria-label="Быстро добавить">${[50, 100, 200, 300].map((n) => `<button type="button" class="hp-chip" data-add="${n}">+${n}</button>`).join("")}</div>
          <form class="hp-form">
            <label class="sp-sr" for="hp-input">Калории</label>
            <input id="hp-input" name="kcal" type="number" min="1" max="20000" step="1" placeholder="ккал" required>
            <button class="sp-primary" data-mode="add">Добавить</button>
            <button class="sp-ghost" data-mode="set" title="Заменить итог за сегодня">Итог</button>
          </form>
          <ul class="hp-week" aria-label="Последние 7 дней">${week()}</ul>
        </div>
      </div>`;
  }

  root.addEventListener("click", (e) => {
    const add = e.target.closest("[data-add]")?.dataset.add;
    if (add) setToday(value() + Number(add));
  });
  root.addEventListener("submit", (e) => {
    e.preventDefault();
    const n = Number(new FormData(e.target).get("kcal"));
    if (!Number.isFinite(n) || n <= 0) return;
    setToday(e.submitter?.dataset.mode === "set" ? n : value() + n);
  });
  // Новый день начинается с нуля: перерисовываем при возвращении на вкладку.
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && render());

  render();
  return { render };
}
