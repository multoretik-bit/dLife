import { dateKey } from "./schedule.js";
import { escapeHTML as esc } from "./development.js";
import { MEALS, ACTIVITY, PACES, WATER_GOAL, GLASS, targets, entriesOf, dayTotals, mealTotals, portion, weightStatus, logStreak, frequentFoods, changeNutrition } from "./nutrition-model.js";
import { FOODS, FOOD_GROUPS, searchFoods, findFood } from "./foods.js";

const fmt = (n, digits = 0) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: digits }).format(n);
const shift = (key, days) => { const d = new Date(key + "T12:00:00"); d.setDate(d.getDate() + days); return dateKey(d); };
const dayName = (key) => new Date(key + "T12:00:00").toLocaleDateString("ru-RU", { weekday: "short" }).replace(".", "");
const longDate = (key) => new Date(key + "T12:00:00").toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" });
const ring = (r, value, max) => { const c = 2 * Math.PI * r; return `stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - Math.max(0, Math.min(1, max ? value / max : 0)))}"`; };

/** Раздел «Питание» на странице здоровья: норма, дневник, вода, вес, неделя. */
export function mountNutrition({ before, getState, save }) {
  const root = document.createElement("section");
  root.className = "sp-card nt";
  root.id = "nutrition";
  root.dataset.section = "nutrition";
  root.setAttribute("aria-labelledby", "nutrition-title");
  before.before(root);

  let day = dateKey(), adding = null, query = "", picked = null, grams = 0, setup = false, busy = false;
  // Распознавание по фото: null или { status: loading|done|error|code, photo, items, note, error, hint }
  let ai = null;
  const n = () => getState().nutrition || {};
  const today = () => dateKey();
  const AI_CODE_KEY = "dlife-food-ai-code";
  const aiCode = () => { try { return localStorage.getItem(AI_CODE_KEY) || ""; } catch { return ""; } };

  async function change(fn) {
    if (busy) return false;
    busy = true;
    try { return await save(changeNutrition(getState(), today(), fn)); }
    finally { busy = false; render(); }
  }

  function render() {
    const data = n(), profile = data.profile;
    if (!profile || setup) return renderSetup(profile);
    const ws = weightStatus(data, today()), t = targets(profile, ws.current || profile.weight);
    const tot = dayTotals(data, day), left = t.kcal - tot.k, over = left < 0;
    const water = data.water?.[day] || 0, streak = logStreak(data, today());
    const isToday = day === today();
    root.innerHTML = `
      <div class="nt-head">
        <div><h2 id="nutrition-title">Питание</h2><p>${streak ? `🔥 ${streak} ${streak % 10 === 1 && streak % 100 !== 11 ? "день" : streak % 10 >= 2 && streak % 10 <= 4 && (streak % 100 < 10 || streak % 100 >= 20) ? "дня" : "дней"} подряд с записями` : "Записывай еду — так проще видеть, что работает"}</p></div>
        <div class="nt-day"><button type="button" data-day="-1" aria-label="Предыдущий день">‹</button><span>${isToday ? "Сегодня" : longDate(day)}</span><button type="button" data-day="1" aria-label="Следующий день" ${isToday ? "disabled" : ""}>›</button></div>
      </div>

      <div class="nt-summary">
        <div class="nt-ring${over ? " is-over" : ""}">
          <svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="52" class="nt-ring-track"/><circle cx="60" cy="60" r="52" class="nt-ring-fill" ${ring(52, tot.k, t.kcal)}/></svg>
          <div><b>${fmt(Math.abs(left))}</b><span>${over ? "ккал сверх нормы" : "ккал осталось"}</span></div>
        </div>
        <div class="nt-numbers">
          <div class="nt-kcal"><span><b>${fmt(tot.k)}</b> съедено</span><span><b>${fmt(t.kcal)}</b> норма</span></div>
          ${[["p", "Белки", "#3a7bd5"], ["f", "Жиры", "#f2a541"], ["c", "Углеводы", "#3fb68b"]].map(([k, name, color]) => `
            <div class="nt-macro" style="--c:${color}"><div><span>${name}</span><b>${fmt(tot[k])} / ${t[k]} г</b></div><i><em style="width:${Math.min(100, (tot[k] / t[k]) * 100)}%"></em></i></div>`).join("")}
          <p class="nt-note">${profile.pace < 0 ? `Дефицит ≈ ${fmt(t.deficit)} ккал/день → ${fmt(-profile.pace, 2)} кг в неделю.` : profile.pace > 0 ? "Небольшой профицит для набора." : "Норма для поддержания веса."} Белок — главный при похудении: держит мышцы и сытость.</p>
        </div>
      </div>

      <div class="nt-meals">${MEALS.map((m) => mealBlock(m, data)).join("")}</div>

      <div class="nt-grid">
        <section class="nt-box nt-water">
          <header><h3>💧 Вода</h3><b>${fmt(water / 1000, 2)} / ${WATER_GOAL / 1000} л</b></header>
          <div class="nt-glasses">${Array.from({ length: WATER_GOAL / GLASS }, (_, i) => `<button type="button" data-water="${(i + 1) * GLASS}" class="${water >= (i + 1) * GLASS ? "is-full" : ""}" aria-label="${(i + 1) * GLASS} мл"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12l-1.6 17.2a2 2 0 0 1-2 1.8H9.6a2 2 0 0 1-2-1.8z"/><path class="fill" d="M7 9h10l-1.1 11.1a1 1 0 0 1-1 .9H9.1a1 1 0 0 1-1-.9z"/></svg></button>`).join("")}</div>
          <div class="nt-water-actions"><button type="button" class="sp-ghost" data-water-add="${GLASS}">＋ стакан</button><button type="button" class="sp-ghost" data-water-add="500">＋ 0,5 л</button>${water ? `<button type="button" class="nt-link" data-water-add="-${GLASS}">убрать</button>` : ""}</div>
        </section>
        ${weightBox(ws, profile)}
      </div>

      ${weekBox(data, t)}

      <footer class="nt-foot"><span>Норма: ${fmt(t.kcal)} ккал · Б ${t.p} · Ж ${t.f} · У ${t.c} г · обмен в покое ${fmt(t.bmr)} ккал, с активностью ${fmt(t.tdee)} ккал</span><button type="button" class="nt-link" data-setup>Изменить цель и данные</button></footer>
      ${adding ? addDialog(data) : ""}`;
    // На телефоне клавиатура не выскакивает сама — поиск фокусируется только на компьютере.
    if (adding && matchMedia("(hover: hover)").matches) (root.querySelector("#nt-grams") || root.querySelector("#nt-search"))?.focus();
  }

  function mealBlock(m, data) {
    const list = entriesOf(data, day).filter((e) => e.meal === m.id), kcal = mealTotals(data, day, m.id);
    const yesterday = entriesOf(data, shift(day, -1)).filter((e) => e.meal === m.id);
    return `<section class="nt-meal">
      <header><span class="nt-meal-icon">${m.icon}</span><h3>${m.name}</h3><b>${kcal ? fmt(kcal) + " ккал" : ""}</b><button type="button" class="nt-add" data-add="${m.id}" aria-label="Добавить в «${m.name}»">＋</button></header>
      ${list.length ? `<ul>${list.map((e) => `<li><div><strong>${esc(e.name)}</strong><small>${e.g ? `${fmt(e.g)} ${findFood(e.food, data.foods)?.unit || "г"} · ` : ""}Б ${fmt(e.p, 1)} · Ж ${fmt(e.f, 1)} · У ${fmt(e.c, 1)}</small></div><b>${fmt(e.k)}</b><button type="button" class="nt-x" data-remove="${esc(e.id)}" aria-label="Удалить ${esc(e.name)}">×</button></li>`).join("")}</ul>`
        : yesterday.length ? `<button type="button" class="nt-repeat" data-repeat="${m.id}">↻ Как вчера: ${esc(yesterday.map((e) => e.name).slice(0, 3).join(", "))}${yesterday.length > 3 ? "…" : ""} · ${fmt(yesterday.reduce((s, e) => s + e.k, 0))} ккал</button>` : ""}
    </section>`;
  }

  function addDialog(data) {
    const meal = MEALS.find((m) => m.id === adding);
    if (ai) return aiDialog(meal);
    if (picked) {
      const f = picked, p = portion(f, grams || 0);
      const presets = [...new Set([f.portion, Math.round(f.portion / 2), f.portion * 2, 100].filter((g) => g > 0))].slice(0, 4);
      return `<div class="nt-sheet" role="dialog" aria-label="Добавить ${esc(f.name)}"><div class="nt-sheet-card">
        <header><button type="button" class="nt-link" data-back>← Назад</button><h3>${esc(f.name)}</h3><button type="button" class="nt-x" data-close aria-label="Закрыть">×</button></header>
        <p class="nt-per">На 100 ${f.unit || "г"}: ${fmt(f.k)} ккал · Б ${f.p} · Ж ${f.f} · У ${f.c}</p>
        <form class="nt-amount" data-amount>
          <label for="nt-grams">Сколько, ${f.unit || "г"}</label>
          <div class="nt-amount-row"><input id="nt-grams" name="g" type="number" inputmode="decimal" min="1" max="5000" step="1" value="${grams || ""}" required><span>= <b>${fmt(p.k)}</b> ккал</span></div>
          <div class="nt-chips">${presets.map((g) => `<button type="button" data-grams="${g}" class="${g === grams ? "is-on" : ""}">${g === f.portion ? `${f.label || "порция"} · ` : ""}${g} ${f.unit || "г"}</button>`).join("")}</div>
          <p class="nt-per">Б ${fmt(p.p, 1)} · Ж ${fmt(p.f, 1)} · У ${fmt(p.c, 1)}</p>
          <button class="sp-primary nt-wide">Добавить в «${meal.name}»</button>
        </form>
      </div></div>`;
    }
    return `<div class="nt-sheet" role="dialog" aria-label="Добавить в «${meal.name}»"><div class="nt-sheet-card">
      <header><h3>${meal.icon} ${meal.name}</h3><button type="button" class="nt-x" data-close aria-label="Закрыть">×</button></header>
      <div class="nt-photo-row">
        <label class="nt-photo-btn"><input type="file" accept="image/*" capture="environment" data-photo hidden><span>📷</span><b>Сфотографировать</b><small>нейросеть посчитает калории</small></label>
        <label class="nt-photo-btn is-light"><input type="file" accept="image/*" data-photo hidden><span>🖼️</span><b>Из галереи</b></label>
      </div>
      <div class="nt-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input id="nt-search" type="search" value="${esc(query)}" placeholder="Или найди в базе: гречка, яйцо…" autocomplete="off" aria-label="Поиск продукта"></div>
      <div class="nt-found">${found(data)}</div>
      <details class="nt-more"><summary>Быстро: только калории</summary>
        <form class="nt-quick-form" data-quick><input name="name" maxlength="80" placeholder="Что съел" aria-label="Название"><input name="k" type="number" inputmode="numeric" min="1" max="20000" placeholder="ккал" required aria-label="Калории"><input name="p" type="number" inputmode="decimal" min="0" max="2000" step="0.1" placeholder="белки, г" aria-label="Белки"><button class="sp-primary">Добавить</button></form>
      </details>
      <details class="nt-more"><summary>Свой продукт (на 100 г) — сохранится в базе</summary>
        <form class="nt-food-form" data-food><input name="name" maxlength="80" required placeholder="Название" aria-label="Название продукта"><input name="k" type="number" min="0" max="2000" step="0.1" required placeholder="ккал" aria-label="Калории на 100 г"><input name="p" type="number" min="0" max="100" step="0.1" placeholder="Б" aria-label="Белки на 100 г"><input name="f" type="number" min="0" max="100" step="0.1" placeholder="Ж" aria-label="Жиры на 100 г"><input name="c" type="number" min="0" max="100" step="0.1" placeholder="У" aria-label="Углеводы на 100 г"><input name="portion" type="number" min="1" max="5000" placeholder="порция, г" aria-label="Обычная порция в граммах"><button class="sp-primary">Сохранить и выбрать</button></form>
      </details>
      <details class="nt-more"><summary>Вся база (${FOODS.length})</summary>${FOOD_GROUPS.map((g) => `<h4>${esc(g)}</h4><ul class="nt-results">${FOODS.filter((f) => f.group === g).map(foodItem).join("")}</ul>`).join("")}</details>
    </div></div>`;
  }

  const foodItem = (f) => `<li><button type="button" data-pick="${esc(f.id)}"><span><strong>${esc(f.name)}</strong><small>${f.portion} ${f.unit || "г"} · ${fmt(portion(f, f.portion).k)} ккал</small></span><i>＋</i></button></li>`;

  /** Результаты поиска, а без запроса — «Часто ем» или популярное. Обновляется отдельно, чтобы поле поиска не теряло фокус. */
  function found(data) {
    if (query.trim()) {
      const results = searchFoods(query, data.foods || []);
      return results.length ? `<ul class="nt-results">${results.map(foodItem).join("")}</ul>` : `<p class="nt-empty">В базе нет «${esc(query)}» — запиши калории вручную ниже или сохрани свой продукт.</p>`;
    }
    const frequent = frequentFoods(data);
    if (frequent.length) return `<h4>Часто ем</h4><ul class="nt-quick">${frequent.map((e) => `<li><button type="button" data-again="${esc(e.id)}" data-date="${esc(Object.keys(data.log).find((d) => data.log[d].some((x) => x.id === e.id)) || "")}"><strong>${esc(e.name)}</strong><small>${e.g ? `${fmt(e.g)} г · ` : ""}${fmt(e.k)} ккал</small></button></li>`).join("")}</ul>`;
    return `<h4>Популярное</h4><ul class="nt-results">${["eg-egg", "gr-oat-water", "mt-chicken-boiled", "gr-buckwheat", "dy-cottage-5", "fr-banana", "dr-cappuccino", "vg-salad-oil"].map((id) => foodItem(findFood(id))).join("")}</ul>`;
  }

  function weightBox(ws, profile) {
    const pts = ws.trend.slice(-60);
    let chart = "";
    if (pts.length >= 2) {
      // Масштаб — по самим взвешиваниям, чтобы тренд был виден; линия цели — только если она в этом диапазоне.
      const vals = pts.flatMap((p) => [p.w, p.t]);
      const min = Math.min(...vals) - 0.5, max = Math.max(...vals) + 0.5, W = 300, H = 90;
      const x = (i) => (i / (pts.length - 1)) * W, y = (v) => H - ((v - min) / (max - min)) * H;
      chart = `<svg class="nt-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
        ${ws.goal && ws.goal >= min && ws.goal <= max ? `<line x1="0" x2="${W}" y1="${y(ws.goal)}" y2="${y(ws.goal)}" class="goal"/>` : ""}
        <polyline class="trend" points="${pts.map((p, i) => `${x(i)},${y(p.t)}`).join(" ")}"/>
        ${pts.map((p, i) => `<circle cx="${x(i)}" cy="${y(p.w)}" r="2.2"/>`).join("")}</svg>`;
    }
    const todayW = n().weights?.[today()];
    return `<section class="nt-box nt-weight">
      <header><h3>⚖️ Вес</h3>${ws.current ? `<b>${fmt(ws.current, 1)} кг</b>` : ""}</header>
      ${ws.goal ? `<div class="nt-goalbar"><i><em style="width:${ws.progress * 100}%"></em></i><span>${fmt(ws.start, 1)} → <b>${fmt(ws.goal, 1)} кг</b> · ${ws.current ? `осталось ${fmt(Math.abs(ws.current - ws.goal), 1)} кг` : ""}</span></div>` : ""}
      ${chart || '<p class="nt-hint">Взвешивайся утром, натощак — 2–3 раза в неделю или каждый день. Здесь появится сглаженный график: он не реагирует на скачки воды.</p>'}
      ${ws.rate !== null ? `<p class="nt-hint">${ws.rate < 0 ? "Худеешь" : ws.rate > 0 ? "Набираешь" : "Вес стоит"}${ws.rate ? ` на ${fmt(Math.abs(ws.rate), 2)} кг в неделю` : ""}${ws.eta ? ` · цель примерно ${ws.eta.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: ws.eta.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined }).replace(/ г\.$/, "")}` : ""}.</p>` : ""}
      <form class="nt-weight-form" data-weight><input name="w" type="number" inputmode="decimal" min="30" max="350" step="0.1" value="${todayW ?? ""}" placeholder="${ws.last ? fmt(ws.last, 1) : "кг"}" aria-label="Вес сегодня, кг"><button class="sp-primary">${todayW ? "Обновить" : "Записать вес"}</button></form>
    </section>`;
  }

  function weekBox(data, t) {
    const days = Array.from({ length: 7 }, (_, i) => shift(today(), i - 6));
    const totals = days.map((d) => dayTotals(data, d).k), logged = totals.filter((k) => k > 0);
    const avg = logged.length ? logged.reduce((a, b) => a + b, 0) / logged.length : 0, top = Math.max(t.kcal * 1.3, ...totals);
    return `<section class="nt-box nt-week">
      <header><h3>📊 Неделя</h3>${logged.length ? `<b>в среднем ${fmt(avg)} ккал</b>` : ""}</header>
      <div class="nt-bars" style="--g:${t.kcal / top}"><b class="nt-goal-line" aria-hidden="true"></b>${days.map((d, i) => `<button type="button" data-goto="${d}" class="${d === day ? "is-on" : ""}${totals[i] > t.kcal * 1.05 ? " is-over" : totals[i] ? " is-ok" : ""}" aria-label="${longDate(d)}: ${fmt(totals[i])} ккал"><em><i style="height:${Math.max(totals[i] ? 6 : 2, (totals[i] / top) * 100)}%"></i></em><span>${d === today() ? "сег" : dayName(d)}</span></button>`).join("")}</div>
      <p class="nt-hint">${logged.length ? `Дней в норме: ${totals.filter((k) => k && k <= t.kcal * 1.05).length} из ${logged.length}. ${avg && avg < t.kcal ? `Средний дефицит к норме поддержания ≈ ${fmt(t.tdee - avg)} ккал/день.` : ""}` : "Записывай хотя бы основные приёмы пищи — через неделю здесь будет видно среднее."} Пунктир — твоя норма.</p>
    </section>`;
  }

  function renderSetup(p) {
    const v = p || { sex: "m", age: "", height: "", weight: "", goal: "", activity: "light", pace: -0.5 };
    root.innerHTML = `
      <div class="nt-head"><div><h2 id="nutrition-title">Питание</h2><p>${p ? "Измени данные — норма пересчитается." : "Пара вопросов — и dLife посчитает твою норму калорий и белка."}</p></div></div>
      <form class="nt-setup" data-setup-form>
        <fieldset class="nt-seg"><legend>Пол</legend>${[["m", "Мужской"], ["f", "Женский"]].map(([id, name]) => `<label><input type="radio" name="sex" value="${id}" ${v.sex === id ? "checked" : ""}><span>${name}</span></label>`).join("")}</fieldset>
        <div class="nt-fields">
          <label>Возраст<input name="age" type="number" min="12" max="100" required value="${v.age}" inputmode="numeric"></label>
          <label>Рост, см<input name="height" type="number" min="100" max="250" required value="${v.height}" inputmode="numeric"></label>
          <label>Вес сейчас, кг<input name="weight" type="number" min="30" max="350" step="0.1" required value="${v.weight}" inputmode="decimal"></label>
          <label>Цель, кг<input name="goal" type="number" min="30" max="350" step="0.1" value="${v.goal ?? ""}" inputmode="decimal" placeholder="необязательно"></label>
        </div>
        <fieldset class="nt-cards"><legend>Активность</legend>${ACTIVITY.map((a) => `<label><input type="radio" name="activity" value="${a.id}" ${v.activity === a.id ? "checked" : ""}><span><b>${a.name}</b><small>${a.hint}</small></span></label>`).join("")}</fieldset>
        <fieldset class="nt-cards"><legend>Темп</legend>${PACES.map((x) => `<label><input type="radio" name="pace" value="${x.v}" ${v.pace === x.v ? "checked" : ""}><span><b>${x.name}</b><small>${x.hint}</small></span></label>`).join("")}</fieldset>
        <p class="nt-hint">Безопасный темп похудения — 0,5–1 % веса в неделю. Норма не опускается ниже 1500 ккал для мужчин и 1200 для женщин.</p>
        <div class="nt-setup-actions"><button class="sp-primary">${p ? "Сохранить" : "Посчитать норму"}</button>${p ? '<button type="button" class="sp-ghost" data-setup-cancel>Отмена</button>' : ""}</div>
      </form>`;
  }

  /* ---------- Распознавание еды по фото ---------- */
  const CONF = { high: "уверенно", medium: "примерно", low: "грубая оценка" };
  // Значения блюда для текущих граммов: всё пропорционально оценке нейросети.
  const scaled = (it) => { const x = it.g / it.grams; return { k: Math.round(it.kcal * x), p: Math.round(it.protein * x * 10) / 10, f: Math.round(it.fat * x * 10) / 10, c: Math.round(it.carbs * x * 10) / 10 }; };

  function aiDialog(meal) {
    const head = `<header><button type="button" class="nt-link" data-ai-close>← Назад</button><h3>📷 ${meal.name}</h3><button type="button" class="nt-x" data-close aria-label="Закрыть">×</button></header>`;
    const photo = ai.photo ? `<img class="nt-ai-photo" src="${ai.photo}" alt="Фото еды">` : "";
    let body = "";
    if (ai.status === "loading") body = `<div class="nt-ai-loading"><i></i><b>Распознаю еду…</b><span>Обычно 5–15 секунд</span></div>`;
    else if (ai.status === "code") body = `<form class="nt-ai-code" data-ai-code><p>Введи код доступа к распознаванию — тот, что задан в Vercel как <b>FOOD_AI_CODE</b>. Он запомнится на этом устройстве.</p><input name="code" type="password" required autocomplete="off" placeholder="Код доступа" aria-label="Код доступа"><button class="sp-primary">Продолжить</button>${ai.error ? `<p class="nt-ai-error">${esc(ai.error)}</p>` : ""}</form>`;
    else if (ai.status === "error") body = `<p class="nt-ai-error">${esc(ai.error)}</p><div class="nt-ai-actions"><button type="button" class="sp-ghost" data-ai-retry>Попробовать ещё раз</button><button type="button" class="sp-ghost" data-ai-close>Найти в базе вручную</button></div>`;
    else {
      const on = ai.items.filter((it) => it.on), total = on.reduce((s, it) => s + scaled(it).k, 0);
      body = ai.items.length ? `
        <ul class="nt-ai-list">${ai.items.map((it, i) => { const v = scaled(it); return `<li class="${it.on ? "" : "is-off"}">
          <label class="nt-ai-check"><input type="checkbox" data-ai-on="${i}" ${it.on ? "checked" : ""}><span></span></label>
          <div class="nt-ai-text"><strong>${esc(it.name)}</strong><small>${CONF[it.confidence]} · Б ${v.p} · Ж ${v.f} · У ${v.c}</small></div>
          <label class="nt-ai-grams"><input type="number" inputmode="numeric" min="1" max="5000" value="${it.g}" data-ai-g="${i}" aria-label="Граммы: ${esc(it.name)}"><span>г</span></label>
          <b data-ai-k="${i}">${fmt(v.k)}</b></li>`; }).join("")}</ul>
        ${ai.note ? `<p class="nt-hint">💡 ${esc(ai.note)}</p>` : ""}
        <p class="nt-hint">Это оценка по фото — поправь граммы, если знаешь точнее.</p>
        <button type="button" class="sp-primary nt-wide" data-ai-add ${on.length ? "" : "disabled"}>Добавить в «${meal.name}» · <span data-ai-total>${fmt(total)}</span> ккал</button>`
        : `<p class="nt-ai-error">${esc(ai.note || "Еды на фото не нашлось.")}</p>`;
      body += `<form class="nt-ai-hint" data-ai-hint><input name="hint" maxlength="300" value="${esc(ai.hint || "")}" placeholder="Уточнить: «без масла», «это 2 котлеты»…" aria-label="Уточнение для нейросети"><button class="sp-ghost">Пересчитать</button></form>
        <label class="nt-link nt-ai-again"><input type="file" accept="image/*" capture="environment" data-photo hidden>📷 Другое фото</label>`;
    }
    return `<div class="nt-sheet" role="dialog" aria-label="Распознавание еды"><div class="nt-sheet-card">${head}${photo}${body}</div></div>`;
  }

  /** Сжимает фото до 1280 px по длинной стороне (JPEG) — так быстрее и дешевле. */
  async function shrink(file) {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }).catch(async () => {
      const img = new Image();
      img.src = URL.createObjectURL(file);
      await img.decode();
      return img;
    });
    const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.82);
  }

  async function recognize() {
    ai.status = "loading"; ai.error = "";
    render();
    try {
      const r = await fetch("/api/food-photo/", { method: "POST", headers: { "Content-Type": "application/json", "X-Dlife-Ai-Code": encodeURIComponent(aiCode()) }, body: JSON.stringify({ image: ai.photo, hint: ai.hint || "" }) });
      const data = await r.json().catch(() => ({ error: r.status === 404 ? "Распознавание доступно только на сайте dlife-tau.vercel.app." : `Ошибка сервера (${r.status}).` }));
      if (!ai) return;
      if (r.status === 401 && data.needCode) { ai.status = "code"; ai.error = aiCode() ? "Код не подошёл." : ""; }
      else if (!r.ok) { ai.status = "error"; ai.error = data.error || `Ошибка ${r.status}.`; }
      else { ai.status = "done"; ai.note = data.note; ai.items = data.items.map((it) => ({ ...it, g: it.grams, on: true })); }
    } catch {
      if (ai) { ai.status = "error"; ai.error = "Нет связи с сервером — проверь интернет."; }
    }
    render();
  }

  async function addEntry(entry) {
    const meal = adding;
    adding = null; picked = null; query = ""; grams = 0;
    await change((d) => { (d.log[day] ||= []).push({ id: crypto.randomUUID(), meal, ...entry }); });
  }

  root.addEventListener("click", async (e) => {
    const b = e.target.closest("button");
    if (e.target.classList.contains("nt-sheet")) { adding = null; picked = null; ai = null; render(); return; }
    if (!b || busy) return;
    const d = b.dataset;
    if (d.day) { const next = shift(day, Number(d.day)); if (next <= today()) { day = next; render(); } }
    else if (d.goto) { day = d.goto; render(); }
    else if (d.add) { adding = d.add; picked = null; query = ""; render(); }
    else if (d.close !== undefined) { adding = null; picked = null; ai = null; render(); }
    else if (d.aiClose !== undefined) { ai = null; render(); }
    else if (d.aiRetry !== undefined) await recognize();
    else if (d.aiAdd !== undefined) {
      const meal = adding, list = ai.items.filter((it) => it.on && it.g > 0);
      if (!list.length) return;
      adding = null; ai = null;
      await change((data) => { for (const it of list) (data.log[day] ||= []).push({ id: crypto.randomUUID(), meal, name: it.name, g: it.g, ...scaled(it) }); });
    }
    else if (d.back !== undefined) { picked = null; render(); }
    else if (d.pick) { picked = findFood(d.pick, n().foods); grams = picked.portion; render(); }
    else if (d.grams) { grams = Number(d.grams); render(); }
    else if (d.again) {
      const e2 = n().log?.[d.date]?.find((x) => x.id === d.again);
      if (e2) { const { id, meal, ...rest } = e2; await addEntry(rest); }
    }
    else if (d.repeat) {
      const list = entriesOf(n(), shift(day, -1)).filter((x) => x.meal === d.repeat);
      await change((data) => { for (const { id, ...rest } of list) (data.log[day] ||= []).push({ ...rest, id: crypto.randomUUID() }); });
    }
    else if (d.remove) await change((data) => { data.log[day] = (data.log[day] || []).filter((x) => x.id !== d.remove); });
    else if (d.water) { const ml = Number(d.water), cur = n().water?.[day] || 0; await change((data) => { data.water[day] = cur === ml ? ml - GLASS : ml; if (!data.water[day]) delete data.water[day]; }); }
    else if (d.waterAdd) { const cur = n().water?.[day] || 0; await change((data) => { const v = Math.max(0, Math.min(10000, cur + Number(d.waterAdd))); if (v) data.water[day] = v; else delete data.water[day]; }); }
    else if (d.setup !== undefined) { setup = true; render(); }
    else if (d.setupCancel !== undefined) { setup = false; render(); }
  });

  root.addEventListener("input", (e) => {
    if (e.target.id === "nt-search") { query = e.target.value; root.querySelector(".nt-found").innerHTML = found(n()); }
    if (e.target.matches("[data-ai-g]")) {
      const i = Number(e.target.dataset.aiG), it = ai.items[i];
      it.g = Math.max(0, Math.min(5000, Math.round(Number(e.target.value) || 0)));
      root.querySelector(`[data-ai-k="${i}"]`).textContent = fmt(scaled(it).k);
      const total = root.querySelector("[data-ai-total]");
      if (total) total.textContent = fmt(ai.items.filter((x) => x.on).reduce((s, x) => s + scaled(x).k, 0));
    }
    if (e.target.id === "nt-grams") {
      grams = Number(e.target.value) || 0;
      const out = root.querySelector(".nt-amount-row b"), p = portion(picked, grams);
      if (out) out.textContent = fmt(p.k);
      const per = root.querySelectorAll(".nt-amount .nt-per");
      if (per[0]) per[0].textContent = `Б ${fmt(p.p, 1)} · Ж ${fmt(p.f, 1)} · У ${fmt(p.c, 1)}`;
    }
  });

  root.addEventListener("keydown", (e) => { if (e.key === "Escape" && adding) { adding = null; picked = null; ai = null; render(); } });

  // Фото выбрано → сжать и отправить; галочки у распознанных блюд.
  root.addEventListener("change", async (e) => {
    if (e.target.matches("[data-photo]")) {
      const file = e.target.files?.[0];
      if (!file) return;
      ai = { status: "loading", photo: "", items: [], hint: "" };
      render();
      try { ai.photo = await shrink(file); } catch { ai.status = "error"; ai.error = "Не получилось открыть фото."; render(); return; }
      await recognize();
    } else if (e.target.matches("[data-ai-on]")) {
      ai.items[Number(e.target.dataset.aiOn)].on = e.target.checked;
      render();
    }
  });

  root.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target, v = Object.fromEntries(new FormData(f)), num = (x) => (x === "" || x === undefined ? 0 : Number(x));
    if (f.dataset.aiCode !== undefined) {
      try { localStorage.setItem(AI_CODE_KEY, String(v.code || "").trim()); } catch {}
      await recognize();
      return;
    }
    if (f.dataset.aiHint !== undefined) { ai.hint = String(v.hint || "").trim(); await recognize(); return; }
    if (f.dataset.amount !== undefined) {
      const g = num(v.g);
      if (!(g > 0)) return;
      await addEntry({ name: picked.name, g, ...portion(picked, g), food: picked.id });
    } else if (f.dataset.quick !== undefined) {
      const k = Math.round(num(v.k));
      if (!(k > 0)) return;
      await addEntry({ name: (v.name || "").trim() || "Быстрая запись", g: 0, k, p: num(v.p), f: 0, c: 0 });
    } else if (f.dataset.food !== undefined) {
      const food = { id: `my-${crypto.randomUUID()}`, name: v.name.trim(), k: num(v.k), p: num(v.p), f: num(v.f), c: num(v.c), portion: num(v.portion) || 100 };
      if (!food.name) return;
      const meal = adding;
      if (await change((data) => data.foods.push(food))) { adding = meal; picked = food; grams = food.portion; render(); }
    } else if (f.dataset.weight !== undefined) {
      const w = Math.round(num(v.w) * 10) / 10;
      if (!(w >= 30 && w <= 350)) return;
      await change((data) => { data.weights[today()] = w; });
    } else if (f.dataset.setupForm !== undefined) {
      const profile = { sex: v.sex, age: num(v.age), height: num(v.height), weight: num(v.weight), activity: v.activity, pace: num(v.pace) };
      if (v.goal) profile.goal = num(v.goal);
      setup = false;
      await change((data) => {
        data.profile = profile;
        if (!Object.keys(data.weights).length) data.weights[today()] = profile.weight;
      });
    }
  });

  render();
  return { render };
}
