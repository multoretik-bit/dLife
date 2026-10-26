import { dateKey } from "./schedule.js";

// Сожжённые калории за день: минимум 250 ккал закрывает круг, всё сверху — «золотая зона».
export const CALORIE_GOAL = 250;
const GOLD_MAX = 1000; // к этой отметке золотое свечение достигает максимума
const R = 86, C = 2 * Math.PI * R, R2 = 68, C2 = 2 * Math.PI * R2;
const DAYS = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];

const fmt = (n) => new Intl.NumberFormat("ru-RU").format(Math.round(n));
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const dayLabel = (d) => d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" }).replace(".", "");

/** Дни периода: неделя — с понедельника по воскресенье, месяц — календарный; offset — сдвиг назад/вперёд. */
export function periodDays(kind, offset = 0, now = new Date()) {
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  if (kind === "week") {
    const start = addDays(base, -((base.getDay() + 6) % 7) + offset * 7);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }
  const y = base.getFullYear(), m = base.getMonth() + offset, n = new Date(y, m + 1, 0).getDate();
  return Array.from({ length: n }, (_, i) => new Date(y, m, i + 1, 12));
}

/** Сумма сожжённых калорий за период; будущие дни в сумму и среднее не входят. */
export function periodSummary(calories, days, todayKey) {
  const rows = days.map((d) => { const key = dateKey(d); return { d, key, kcal: calories?.[key] ?? 0, future: key > todayKey }; });
  const past = rows.filter((r) => !r.future);
  const total = past.reduce((n, r) => n + r.kcal, 0), target = rows.length * CALORIE_GOAL;
  return {
    rows, total, target, gold: total >= target,
    goldDays: past.filter((r) => r.kcal >= CALORIE_GOAL).length,
    elapsed: past.length,
    best: Math.max(0, ...past.map((r) => r.kcal)),
    avg: past.length ? total / past.length : 0,
  };
}

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

  const offsets = { week: 0, month: 0 };
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

  function period(kind) {
    const days = periodDays(kind, offsets[kind]), todayKey = today(), sum = periodSummary(getState().calories, days, todayKey);
    const top = Math.max(CALORIE_GOAL * 1.6, sum.best);
    const title = kind === "week"
      ? `${dayLabel(days[0])} – ${dayLabel(days[6])}`
      : days[0].toLocaleDateString("ru-RU", { month: "long", year: "numeric" }).replace(/ г\.$/, "").replace(/^./, (c) => c.toUpperCase());
    const bars = sum.rows.map((r) => `<i class="is-${r.future ? "future" : calorieLevel(r.kcal)}${r.key === todayKey ? " is-today" : ""}" style="--h:${Math.max(r.kcal ? 7 : 3, Math.min(100, (r.kcal / top) * 100))}%" title="${dayLabel(r.d)}: ${fmt(r.kcal)} ккал"></i>`).join("");
    const nav = (dir, label, off) => `<button type="button" data-period="${kind}" data-dir="${dir}" aria-label="${label}"${off ? " disabled" : ""}>${dir < 0 ? "‹" : "›"}</button>`;
    return `<article class="hp-period${sum.gold ? " is-gold" : ""}">
      <header><span>${kind === "week" ? "Неделя" : "Месяц"}</span><div class="hp-nav">${nav(-1, "Предыдущий период")}<b>${title}</b>${nav(1, "Следующий период", offsets[kind] >= 0)}</div></header>
      <strong>${fmt(sum.total)} <small>ккал</small></strong>
      <div class="hp-meter"><i><em style="width:${Math.min(100, (sum.total / sum.target) * 100)}%"></em></i><span>${sum.gold ? "Минимум периода выполнен" : `минимум периода ${fmt(sum.target)}`}</span></div>
      <div class="hp-bars hp-bars-${kind}" style="--line:${(CALORIE_GOAL / top) * 100}%">${bars}</div>
      ${kind === "week" ? `<div class="hp-bar-labels">${days.map((d) => `<span>${DAYS[d.getDay()]}</span>`).join("")}</div>` : ""}
      <p>Норма закрыта: <b>${sum.goldDays}</b> из ${sum.elapsed} дн. · в среднем <b>${fmt(sum.avg)}</b> ккал в день${sum.best ? ` · лучший день ${fmt(sum.best)}` : ""}</p>
    </article>`;
  }

  function render() {
    const kcal = value(), gold = kcal >= CALORIE_GOAL;
    const pct = Math.min(1, kcal / CALORIE_GOAL);
    const extra = Math.max(0, kcal - CALORIE_GOAL), extraPct = Math.min(1, extra / (GOLD_MAX - CALORIE_GOAL));
    root.className = `sp-card hp${gold ? " is-gold" : ""}`;
    root.style.setProperty("--glow", extraPct.toFixed(3));
    root.innerHTML = `
      <div class="sp-card-head"><h2 id="calories-title">🔥 Сожжено за день</h2><p class="sp-summary">${gold ? "Минимум закрыт — дальше только лучше" : `Цель — минимум ${CALORIE_GOAL} ккал`}</p></div>
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
      </div>
      <div class="hp-periods">${period("week")}${period("month")}</div>`;
  }

  root.addEventListener("click", (e) => {
    const add = e.target.closest("[data-add]")?.dataset.add;
    if (add) setToday(value() + Number(add));
    const nav = e.target.closest("[data-period]");
    if (nav && !nav.disabled) {
      offsets[nav.dataset.period] = Math.min(0, offsets[nav.dataset.period] + Number(nav.dataset.dir));
      render();
    }
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
