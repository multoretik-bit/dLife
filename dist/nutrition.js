import { icon } from "./icons.js";
import { dateKey } from "./schedule.js";
import { escapeHTML as esc } from "./development.js";
import { ACTIVITY, PACES, targets, entriesOf, dayTotals, portion, weightStatus, logStreak, frequentFoods, changeNutrition } from "./nutrition-model.js";
import { CALORIE_GOAL } from "./health.js";
import { newWatchToken, pullWatch } from "./watch.js";
import { FOODS, FOOD_GROUPS, searchFoods, findFood } from "./foods.js";

const fmt = (n, digits = 0) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: digits }).format(n);
const shift = (key, days) => { const d = new Date(key + "T12:00:00"); d.setDate(d.getDate() + days); return dateKey(d); };
const dayName = (key) => new Date(key + "T12:00:00").toLocaleDateString("ru-RU", { weekday: "short" }).replace(".", "");
const longDate = (key) => new Date(key + "T12:00:00").toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" });
const ring = (r, value, max) => { const c = 2 * Math.PI * r; return `stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - Math.max(0, Math.min(1, max ? value / max : 0)))}"`; };

/** «Питание» на странице здоровья: круг «съедено из нормы», круг «сожжено», список еды за день и общая неделя. */
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
  let burnForm = false, weekOffset = 0;
  // Apple Watch: панель подключения и последний ответ сервера ({ data } или { error }).
  let watchOpen = false, watchInfo = null, watchBusy = false, copied = "";
  const STEP_GOAL = 10000;
  const mealNow = () => { const h = new Date().getHours(); return h < 11 ? "b" : h < 16 ? "l" : h < 21 ? "d" : "s"; };
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
    const t = targets(profile, weightStatus(data, today()).current || profile.weight);
    const tot = dayTotals(data, day), left = t.kcal - tot.k, over = left < 0;
    const burned = getState().calories?.[day] || 0, steps = getState().steps?.[day] || 0, streak = logStreak(data, today()), isToday = day === today();
    const list = entriesOf(data, day);
    root.innerHTML = `
      <div class="nt-head">
        <div><h2 id="nutrition-title">Калории</h2><p>${streak ? `${icon("flame", "is-streak")} ${streak} ${streak % 10 === 1 && streak % 100 !== 11 ? "день" : streak % 10 >= 2 && streak % 10 <= 4 && (streak % 100 < 10 || streak % 100 >= 20) ? "дня" : "дней"} подряд с записями` : "Записывай еду — так проще видеть, что работает"}</p></div>
        <button type="button" class="nt-watch-btn${getState().healthSync ? " is-on" : ""}" data-watch-toggle aria-expanded="${watchOpen}">${icon("watch")} Apple Watch</button>
        <div class="nt-day"><button type="button" data-day="-1" aria-label="Предыдущий день">‹</button><span>${isToday ? "Сегодня" : longDate(day)}</span><button type="button" data-day="1" aria-label="Следующий день" ${isToday ? "disabled" : ""}>›</button></div>
      </div>

      <div class="nt-rings">
        <section class="nt-big${over ? " is-over" : ""}">
          <div class="nt-ring">
            <svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="52" class="nt-ring-track"/><circle cx="60" cy="60" r="52" class="nt-ring-fill" ${ring(52, tot.k, t.kcal)}/></svg>
            <div><b>${fmt(tot.k)}</b><span>из ${fmt(t.kcal)} ккал</span></div>
          </div>
          <h3>Съедено</h3>
          <p>${over ? `Сверх нормы на <b>${fmt(-left)}</b> ккал` : `Осталось <b>${fmt(left)}</b> ккал`}</p>
          <button type="button" class="nt-cta" data-add>＋ Добавить еду</button>
        </section>
        <section class="nt-big is-burn${burned >= CALORIE_GOAL ? " is-full" : ""}">
          <div class="nt-ring">
            <svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="52" class="nt-ring-track"/><circle cx="60" cy="60" r="52" class="nt-ring-fill" ${ring(52, burned, CALORIE_GOAL)}/></svg>
            <div><b>${fmt(burned)}</b><span>ккал</span></div>
          </div>
          <h3>Сожжено</h3>
          <p>${burned >= CALORIE_GOAL ? "Минимум закрыт" : `Цель — минимум <b>${CALORIE_GOAL}</b> ккал`}</p>
          ${burnForm ? `<form class="nt-burn-form" data-burn><input name="amount" type="number" inputmode="numeric" min="0" max="20000" required placeholder="ккал" aria-label="Сколько калорий сожжено"><button class="nt-cta" name="mode" value="add">Добавить</button><button class="nt-cta is-quiet" name="mode" value="set" title="Заменить итог за день этим числом">Итог</button><button type="button" class="nt-x" data-burn-cancel aria-label="Отмена">×</button></form>`
            : `<button type="button" class="nt-cta is-burn" data-burn-open>＋ Добавить калории</button>`}
        </section>
        <section class="nt-big is-steps${steps >= STEP_GOAL ? " is-full" : ""}">
          <div class="nt-ring">
            <svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="52" class="nt-ring-track"/><circle cx="60" cy="60" r="52" class="nt-ring-fill" ${ring(52, steps, STEP_GOAL)}/></svg>
            <div><b>${fmt(steps)}</b><span>шагов</span></div>
          </div>
          <h3>Шаги</h3>
          <p>${steps >= STEP_GOAL ? "Цель дня выполнена" : `Цель — <b>${fmt(STEP_GOAL)}</b>`}</p>
          ${getState().healthSync ? `<span class="nt-sync-note">${icon("watch")} с Apple Watch</span>` : `<button type="button" class="nt-cta is-steps" data-watch-toggle>${icon("watch")} Подключить часы</button>`}
        </section>
      </div>

      ${watchOpen ? watchPanel() : ""}
      <section class="nt-box nt-eaten">
        <header><h3>Еда за ${isToday ? "сегодня" : "день"}</h3>${list.length ? `<b>${fmt(tot.k)} ккал</b>` : ""}</header>
        ${list.length ? `<ul>${list.map((e) => `<li><div><strong>${esc(e.name)}</strong><small>${e.g ? `${fmt(e.g)} ${findFood(e.food, data.foods)?.unit || "г"} · ` : ""}Б ${fmt(e.p, 1)} · Ж ${fmt(e.f, 1)} · У ${fmt(e.c, 1)}</small></div><b>${fmt(e.k)}</b><button type="button" class="nt-x" data-remove="${esc(e.id)}" aria-label="Удалить ${esc(e.name)}">×</button></li>`).join("")}</ul>`
          : `<p class="nt-hint">Пока ничего не записано. Нажми «Добавить еду» — можно просто сфотографировать тарелку.</p>`}
      </section>

      ${weekBox(data, t)}

      <footer class="nt-foot"><span>Норма: ${fmt(t.kcal)} ккал в день · Б ${t.p} · Ж ${t.f} · У ${t.c} г</span><button type="button" class="nt-link" data-setup>Изменить цель и данные</button></footer>
      ${adding ? addDialog(data) : ""}`;
    if (burnForm) root.querySelector("[data-burn] input")?.focus();
    // На телефоне клавиатура не выскакивает сама — поиск фокусируется только на компьютере.
    else if (adding && matchMedia("(hover: hover)").matches) (root.querySelector("#nt-grams") || root.querySelector("#nt-search"))?.focus();
  }

  function addDialog(data) {
    if (ai) return aiDialog();
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
          <button class="sp-primary nt-wide">Добавить</button>
        </form>
      </div></div>`;
    }
    return `<div class="nt-sheet" role="dialog" aria-label="Добавить еду"><div class="nt-sheet-card">
      <header><h3>${icon("food")} Добавить еду</h3><button type="button" class="nt-x" data-close aria-label="Закрыть">×</button></header>
      <div class="nt-photo-row">
        <label class="nt-photo-btn"><input type="file" accept="image/*" capture="environment" data-photo hidden><span>${icon("camera")}</span><b>Сфотографировать</b><small>нейросеть посчитает калории</small></label>
        <label class="nt-photo-btn is-light"><input type="file" accept="image/*" data-photo hidden><span>${icon("image")}</span><b>Из галереи</b></label>
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

  const watchLink = (token) => `${location.origin}/api/health-sync/?token=${encodeURIComponent(token)}`;

  /** Панель Apple Watch: подключение, токен и адрес для «Команд», пошаговая инструкция. */
  function watchPanel() {
    const sync = getState().healthSync, url = sync ? watchLink(sync.token) : "";
    if (!sync) return `<section class="nt-box nt-watch">
      <header><h3>${icon("watch")} Шаги и калории с Apple Watch</h3></header>
      <p class="nt-hint">Часы записывают шаги и активные калории в «Здоровье» на iPhone. Команда на iPhone будет сама отправлять их в dLife несколько раз в день — вручную вводить не нужно.</p>
      <button type="button" class="nt-cta" data-watch-connect>Подключить</button>
    </section>`;
    const last = sync.lastAt ? new Date(sync.lastAt).toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) : "";
    const field = (name, value, label) => `<label class="nt-copy"><span>${label}</span><input readonly value="${esc(value)}" aria-label="${label}"><button type="button" class="nt-cta is-quiet" data-copy="${name}">${copied === name ? `${icon("check")} Скопировано` : `${icon("copy")} Копировать`}</button></label>`;
    return `<section class="nt-box nt-watch">
      <header><h3>${icon("watch")} Apple Watch</h3><b class="${last ? "is-ok" : ""}">${last ? `данные от ${last}` : "данных ещё не было"}</b></header>
      ${watchInfo?.error ? `<p class="nt-ai-error">${esc(watchInfo.error)}</p>` : ""}
      ${field("url", url, "Ссылка для команды")}
      <p class="nt-hint">Токен уже внутри ссылки — заголовки в команде не нужны. Ссылку никому не показывай.</p>
      <ol class="nt-steps">
        <li>На iPhone: <b>«Команды»</b> → <b>＋</b> (новая команда).</li>
        <li><b>«Добавить действие»</b> → найди <b>«Найти образцы здоровья»</b> (Find Health Samples). Нажми на синее слово типа и выбери <b>«Шаги»</b>. Ниже: <b>«Дата начала» — «Сегодня»</b> (Start Date is Today) и обязательно <b>Group By: Day</b> («Группировать по: День»), <b>Sort by: Start Date</b> → <b>Latest First</b> и <b>Limit</b> → включить, <b>1</b>. Тогда iOS отдаст один итог за сегодня без дублей с iPhone и часов — как в «Здоровье».</li>
        <li>Ещё одно действие <b>«Найти образцы здоровья»</b>: тип — <b>«Активная энергия»</b> (Active Energy), «Дата начала» — <b>«Сегодня»</b>, и так же: <b>Group By: Day</b>, <b>Sort by: Start Date → Latest First</b>, <b>Limit: 1</b>.</li>
        <li>Добавь действие <b>«Получить содержимое URL»</b> (Get Contents of URL). Нажми на синее слово <b>«URL»</b> и <b>вставь ссылку</b> из поля выше (кнопка «Копировать» рядом).</li>
        <li>В этом же действии нажми стрелку <b>«›»</b> (Show More):<br>• <b>Метод / Method</b> → <b>POST</b><br>• <b>Тело запроса / Request Body</b> → <b>JSON</b><br>• <b>«Добавить новое поле» / Add new field</b> → <b>«Текст» / Text</b>. В <b>левое</b> серое поле <b>«Ключ» / Key</b> впиши <code>steps</code>. В <b>правое</b> поле ничего не печатай — нажми на него и выбери переменную <b>«Образцы здоровья» / Health Samples</b> из действия с шагами.<br>• Ещё одно поле «Текст»: слева <code>kcal</code>, справа — переменная <b>Health Samples</b> из действия с активной энергией.<br>«Заголовки» / Headers не трогай.</li>
        <li>Нажми кнопку запуска (треугольник внизу справа) — команда ответит «dLife: …». Здесь нажми <b>«Проверить»</b>.</li>
        <li><b>«Автоматизация»</b> → <b>＋</b> → <b>«Время суток»</b> (например 12:00, 18:00, 23:30) → <b>«Запускать сразу»</b> → выбери эту команду.</li>
      </ol>
      <p class="nt-hint">Пока iPhone заблокирован, iOS не даёт читать «Здоровье» — такой запуск пропустится, данные догонит следующий. Каждая отправка ставит итог дня, а не прибавляет.</p>
      <div class="nt-watch-actions"><button type="button" class="nt-cta" data-watch-check ${watchBusy ? "disabled" : ""}>${icon("refresh")} ${watchBusy ? "Проверяю…" : "Проверить"}</button><button type="button" class="nt-cta is-quiet" data-watch-off>Отключить</button></div>
    </section>`;
  }

  async function syncWatch() {
    watchBusy = true; render();
    watchInfo = await pullWatch(getState, save);
    watchBusy = false; render();
  }

  /** Общая неделя: сколько съедено (против нормы) и сколько сожжено по дням. */
  function weekBox(data, t) {
    const end = shift(today(), weekOffset * 7), days = Array.from({ length: 7 }, (_, i) => shift(end, i - 6)), calories = getState().calories || {};
    const eaten = days.map((d) => dayTotals(data, d).k), burned = days.map((d) => calories[d] || 0);
    const logged = eaten.filter((k) => k > 0), avg = logged.length ? logged.reduce((a, b) => a + b, 0) / logged.length : 0;
    const burnTotal = burned.reduce((a, b) => a + b, 0), top = Math.max(t.kcal * 1.25, ...eaten, ...burned, 1);
    const stepsDays = days.map((d) => getState().steps?.[d] || 0).filter(Boolean);
    const range = `${new Date(days[0] + "T12:00:00").toLocaleDateString("ru-RU", { day: "numeric", month: "short" })} – ${new Date(days[6] + "T12:00:00").toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}`.replace(/\./g, "");
    return `<section class="nt-box nt-week">
      <header><h3>Неделя</h3><div class="nt-day nt-week-nav"><button type="button" data-week="-1" aria-label="Прошлая неделя">‹</button><span>${weekOffset ? range : "последние 7 дней"}</span><button type="button" data-week="1" aria-label="Следующая неделя" ${weekOffset ? "" : "disabled"}>›</button></div></header>
      <div class="nt-week-stats">
        <div><span>Съедено в среднем</span><b>${logged.length ? fmt(avg) : "—"}<small> / ${fmt(t.kcal)} ккал</small></b></div>
        <div><span>Сожжено за неделю</span><b>${fmt(burnTotal)}<small> ккал</small></b></div>
        <div><span>Дней в норме еды</span><b>${eaten.filter((k) => k && k <= t.kcal * 1.05).length}<small> из ${logged.length}</small></b></div>
        <div><span>Тренировок от ${CALORIE_GOAL} ккал</span><b>${burned.filter((k) => k >= CALORIE_GOAL).length}<small> из 7</small></b></div>
        <div><span>Шагов в среднем</span><b>${stepsDays.length ? fmt(stepsDays.reduce((a, b) => a + b, 0) / stepsDays.length) : "—"}<small> в день</small></b></div>
      </div>
      <div class="nt-bars nt-bars2" style="--g:${t.kcal / top}"><b class="nt-goal-line" aria-hidden="true"></b>${days.map((d, i) => `<button type="button" data-goto="${d}" class="${d === day ? "is-on" : ""}" aria-label="${longDate(d)}: съедено ${fmt(eaten[i])}, сожжено ${fmt(burned[i])} ккал"><em><i class="eat${eaten[i] > t.kcal * 1.05 ? " is-over" : ""}" style="height:${Math.max(eaten[i] ? 4 : 1.5, (eaten[i] / top) * 100)}%"></i><i class="burn" style="height:${Math.max(burned[i] ? 4 : 1.5, (burned[i] / top) * 100)}%"></i></em><span>${d === today() ? "сег" : dayName(d)}</span></button>`).join("")}</div>
      <p class="nt-legend"><span class="eat">съедено</span><span class="burn">сожжено</span><span class="line">норма еды</span></p>
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

  function aiDialog() {
    const head = `<header><button type="button" class="nt-link" data-ai-close>← Назад</button><h3>${icon("camera")} Еда по фото</h3><button type="button" class="nt-x" data-close aria-label="Закрыть">×</button></header>`;
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
        ${ai.note ? `<p class="nt-hint nt-ai-note">${icon("bulb")} ${esc(ai.note)}</p>` : ""}
        <p class="nt-hint">Это оценка по фото — поправь граммы, если знаешь точнее.</p>
        <button type="button" class="sp-primary nt-wide" data-ai-add ${on.length ? "" : "disabled"}>Добавить · <span data-ai-total>${fmt(total)}</span> ккал</button>`
        : `<p class="nt-ai-error">${esc(ai.note || "Еды на фото не нашлось.")}</p>`;
      body += `<form class="nt-ai-hint" data-ai-hint><input name="hint" maxlength="300" value="${esc(ai.hint || "")}" placeholder="Уточнить: «без масла», «это 2 котлеты»…" aria-label="Уточнение для нейросети"><button class="sp-ghost">Пересчитать</button></form>
        <label class="nt-link nt-ai-again"><input type="file" accept="image/*" capture="environment" data-photo hidden>${icon("camera")} Другое фото</label>`;
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
    const meal = mealNow();
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
    else if (d.add !== undefined) { adding = true; picked = null; query = ""; burnForm = false; render(); }
    else if (d.week) { weekOffset = Math.min(0, weekOffset + Number(d.week)); render(); }
    else if (d.burnOpen !== undefined) { burnForm = true; render(); }
    else if (d.watchToggle !== undefined) { watchOpen = !watchOpen || !b.classList.contains("nt-watch-btn"); render(); if (watchOpen) root.querySelector(".nt-watch")?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }
    else if (d.watchConnect !== undefined) { busy = true; try { await save({ ...structuredClone(getState()), healthSync: { token: newWatchToken() } }); } finally { busy = false; render(); } }
    else if (d.watchCheck !== undefined) await syncWatch();
    else if (d.watchOff !== undefined) {
      if (!confirm("Отключить Apple Watch? Команда на iPhone перестанет работать, уже записанные шаги и калории останутся.")) return;
      const next = structuredClone(getState()); delete next.healthSync;
      busy = true; try { await save(next); } finally { busy = false; watchInfo = null; render(); }
    }
    else if (d.copy) {
      const value = watchLink(getState().healthSync?.token || "");
      try { await navigator.clipboard.writeText(value); } catch { b.previousElementSibling?.select(); }
      copied = d.copy; render(); setTimeout(() => { copied = ""; render(); }, 1600);
    }
    else if (d.burnCancel !== undefined) { burnForm = false; render(); }
    else if (d.close !== undefined) { adding = null; picked = null; ai = null; render(); }
    else if (d.aiClose !== undefined) { ai = null; render(); }
    else if (d.aiRetry !== undefined) await recognize();
    else if (d.aiAdd !== undefined) {
      const meal = mealNow(), list = ai.items.filter((it) => it.on && it.g > 0);
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
    else if (d.remove) await change((data) => { data.log[day] = (data.log[day] || []).filter((x) => x.id !== d.remove); });
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
    if (f.dataset.burn !== undefined) {
      const value = Math.round(num(v.amount)), mode = e.submitter?.value || "add";
      if (!(value >= 0) || (mode === "add" && !value)) return;
      const next = structuredClone(getState()), cur = next.calories?.[day] || 0, total = Math.min(20000, mode === "set" ? value : cur + value);
      next.calories = { ...next.calories, [day]: total };
      if (!total) delete next.calories[day];
      burnForm = false;
      busy = true;
      try { await save(next); } finally { busy = false; render(); }
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
  if (getState().healthSync) syncWatch();
  return { render };
}
