import { library, changeStudy, safeURL, VIDEO_URL, DLANG_URL, HISTORY_NOTION_URL } from './study-model.js';
import { ERA_HOW, AUTHOR_TIP } from './library-plan.js';
import { escapeHTML as esc } from './development.js';

const PALETTE = ['#e9a23b', '#4f7fe0', '#d9605a', '#8a63d2', '#2fa58c', '#c7843a', '#3a9fd0', '#e0679a', '#5aa652', '#7b8ccc', '#c4a03a'];
const PAGE = 12;
const CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';
const TRASH = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/></svg>';
const PEN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4Zm9-13 4 4"/></svg>';
const BOOK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5v-15ZM4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/></svg>';
const ARROW = '<svg class="tool-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M9 7h8v8"/></svg>';
const tone = (cats, c) => PALETTE[Math.max(0, cats.indexOf(c)) % PALETTE.length];
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const external = (href) => `href="${esc(href)}" target="_blank" rel="noopener noreferrer"`;

/** Блок «Инструменты» на странице сферы: библиотека, английский и история для учёбы, ссылки — для остальных сфер. */
export function mountStudy({ root, sphereId, getState, save, getBackend }) {
  const study = sphereId === '10';
  const tabs = study ? [['library', 'Библиотека'], ['english', 'Английский'], ['history', 'История']] : [];
  let view = study ? 'library' : 'resources', shelf = 'reading', linking = null, query = '', category = '', page = 0, pending = false, shelfOpen = false;

  root.className = 'sp-card study-hub';
  root.innerHTML = `<div class="sp-card-head"><h2>Инструменты</h2>${tabs.length ? `<div class="study-tabs" role="tablist">${tabs.map(([id, label]) => `<button role="tab" data-tab="${id}">${label}</button>`).join('')}</div>` : ''}</div>
    <p class="study-status" role="status" aria-live="polite"></p><div class="study-body"></div>`;
  const body = root.querySelector('.study-body'), status = root.querySelector('.study-status');

  async function commit(change) {
    if (pending) return false;
    if (getBackend() === 'local') {
      status.innerHTML = 'Для сохранения подключи <a href="/#open-cloud">синхронизацию на главной</a>.';
      return false;
    }
    pending = true;
    status.textContent = '';
    const controls = [...root.querySelectorAll('button,input,select,textarea')].map((el) => [el, el.disabled]);
    controls.forEach(([el]) => (el.disabled = true));
    try {
      return await save(changeStudy(getState(), change));
    } finally {
      pending = false;
      controls.forEach(([el, disabled]) => (el.disabled = disabled));
    }
  }

  function render() {
    root.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === view)));
    ({ library: renderLibrary, english: renderEnglish, history: renderHistory, resources: renderResources })[view]();
  }

  /* ---------- Библиотека: «Читаю сейчас» → «Осталось прочитать» ----------
     Если на сервере подключён Notion, книги и статусы берутся оттуда (только чтение),
     иначе — из локального каталога dLife. */
  const notion = { state: 'loading', books: [], title: '', url: '', fetchedAt: null, error: '' };
  const live = () => notion.state === 'ok';
  const allBooks = () => (live() ? notion.books : library(getState()));
  const bookCategories = (books) => [...new Set(books.map((b) => b.category || 'Мои книги'))];

  async function syncNotion() {
    if (!study) return;
    try {
      const response = await fetch('/api/notion-library/', { cache: 'no-store' });
      const data = response.headers.get('content-type')?.includes('json') ? await response.json() : { connected: false };
      if (!data.connected) Object.assign(notion, { state: 'off' });
      else if (data.error) Object.assign(notion, { state: notion.books.length ? 'ok' : 'error', error: data.error });
      else Object.assign(notion, { state: 'ok', books: data.books, title: data.title, url: data.url, fetchedAt: new Date(data.fetchedAt), error: '' });
    } catch {
      if (notion.state === 'loading') notion.state = 'off';
    }
    if (view !== 'library') return;
    if (shelf === 'queue' && body.querySelector('#book-search') === document.activeElement) drawBooks();
    else if (!linking) renderLibrary();
  }

  function renderLibrary() {
    if (shelf === 'queue') renderQueue(); else renderReading();
  }

  function progressPill(books) {
    const read = books.filter((b) => b.status === 'read').length, pct = books.length ? (read / books.length) * 100 : 0;
    return `<div class="lib-progress" role="progressbar" aria-label="Прочитанные книги" aria-valuenow="${read}" aria-valuemin="0" aria-valuemax="${books.length || 1}">
      <span>Прочитано <b>${read}</b> из ${books.length}</span><i><em style="width:${pct}%"></em></i></div>`;
  }

  function syncBadge() {
    if (notion.state === 'loading') return '<p class="lib-sync">Подключаюсь к Notion…</p>';
    if (notion.state === 'error') return `<p class="lib-sync is-error">Notion: ${esc(notion.error)} Показан локальный список.</p>`;
    if (!live()) return '';
    const time = notion.fetchedAt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    return `<p class="lib-sync"><span class="lib-live"></span>Синхронизировано с Notion в ${time}${notion.error ? ' · последнее обновление не удалось' : ''} <button class="lib-refresh" data-action="sync" aria-label="Обновить из Notion">↻</button></p>`;
  }

  function notionButton(b) {
    if (live()) return `<a class="lib-notion" ${external(b.url)}><span>N</span>Открыть конспект${ARROW}</a>`;
    if (linking === b.id) return `<form class="lib-link-form" data-link-form="${esc(b.id)}">
        <label class="sp-sr" for="link-${esc(b.id)}">Ссылка на конспект в Notion</label>
        <input id="link-${esc(b.id)}" name="url" type="url" value="${esc(b.notion || '')}" placeholder="Ссылка на страницу книги в Notion" maxlength="2000">
        <div><button class="sp-primary">Сохранить</button><button type="button" class="sp-ghost" data-link-cancel>Отмена</button></div>
      </form>`;
    return b.notion
      ? `<div class="lib-notion-row"><a class="lib-notion" ${external(b.notion)}><span>N</span>Открыть конспект${ARROW}</a><button class="lib-icon lib-edit" data-link="${esc(b.id)}" aria-label="Изменить ссылку на конспект" title="Изменить ссылку">${PEN}</button></div>`
      : `<button class="lib-notion is-empty" data-link="${esc(b.id)}"><span>N</span>Привязать конспект</button>`;
  }

  function renderReading() {
    const books = allBooks(), cats = bookCategories(books);
    const reading = books.filter((b) => b.status === 'reading'), left = books.filter((b) => b.status === 'planned').length;
    body.innerHTML = `
      ${syncBadge()}
      <div class="lib-head"><h3>Читаю сейчас${reading.length ? ` <span>${reading.length}</span>` : ''}</h3>${progressPill(books)}</div>
      <div class="lib-reading">${reading.map((b) => `
        <article class="lib-now" data-book="${esc(b.id)}" style="--tone:${tone(cats, b.category)}">
          ${b.category ? `<span class="study-category">${esc(b.category)}${b.era ? ' · ' + esc(shortEra(b.era)) : ''}</span>` : ''}
          <h4>${esc(b.title)}</h4>
          <p>${esc(b.author)}${b.year ? ' · ' + esc(b.year) : ''}</p>
          ${notionButton(b)}
          ${live() ? '' : `<div class="lib-now-actions">
            <button class="lib-done" data-mark-read="${esc(b.id)}">${CHECK}Прочитал</button>
            <button class="sp-ghost" data-set-status="${esc(b.id)}" data-value="planned">Отложить</button>
          </div>`}
        </article>`).join('') || `<div class="lib-empty"><strong>Сейчас ничего не читаешь</strong><p>${live() ? 'Поставь книге статус «Читаю» в Notion — она появится здесь.' : 'Выбери следующую книгу из списка «Осталось прочитать».'}</p></div>`}
      </div>
      ${live() && reading.length ? '<p class="lib-hint">Отметь книгу прочитанной в Notion — здесь она обновится сама.</p>' : ''}
      <button class="lib-next" data-shelf="queue"><span><small>Разделы · эпохи · авторы по порядку</small>План чтения — осталось</span><b>${left}</b>${ARROW}</button>
      <div class="lib-shelf"></div>`;
    drawShelf();
    body.querySelector('.lib-link-form input')?.focus();
  }

  // Эпохи, которые пользователь сам открыл или закрыл, запоминаются на устройстве; остальные — по умолчанию.
  const ERA_KEY = 'dlife-lib-eras';
  const eraToggles = (() => { try { return JSON.parse(localStorage.getItem(ERA_KEY) || '{}'); } catch { return {}; } })();
  const saveEras = () => { try { localStorage.setItem(ERA_KEY, JSON.stringify(eraToggles)); } catch {} };
  const sectionsOf = (books) => [...new Set(books.map((b) => b.category || 'Мои книги'))];
  const eraOf = (b) => b.era || (live() ? 'Книги' : 'Мои книги');
  const shortEra = (era) => String(era || '').split(' · ')[0];
  const done = (list) => list.filter((b) => b.status === 'read').length;

  /** Книги раздела: эпохи по порядку, внутри — авторы подряд, как в плане. */
  function plan(books, section) {
    const eras = [];
    for (const b of books.filter((x) => (x.category || 'Мои книги') === section)) {
      const name = eraOf(b);
      let era = eras.find((e) => e.name === name);
      if (!era) eras.push((era = { name, authors: [], books: [] }));
      era.books.push(b);
      const last = era.authors.at(-1);
      if (last && last.name === b.author) last.books.push(b); else era.authors.push({ name: b.author, books: [b] });
    }
    return eras;
  }

  function renderQueue() {
    const books = allBooks(), sections = sectionsOf(books), left = books.filter((b) => b.status === 'planned').length;
    if (!sections.includes(category)) category = sections.find((s) => books.some((b) => (b.category || 'Мои книги') === s && b.status === 'planned')) || sections[0] || '';
    body.innerHTML = `
      ${syncBadge()}
      <div class="lib-head"><button class="lib-back" data-shelf="reading">← Читаю сейчас</button><h3>План чтения <span>${left}</span></h3>
        ${live() ? `<a class="sp-primary" ${external(notion.url)}>＋ Добавить в Notion</a>` : '<button class="sp-primary" data-action="new-book">＋ Добавить книгу</button>'}</div>
      ${live() ? '' : `<form id="book-form" class="study-form" hidden>
        <div><label for="book-title">Название</label><input id="book-title" name="title" maxlength="250" required></div>
        <div><label for="book-author">Автор</label><input id="book-author" name="author" maxlength="250"></div>
        <div><label for="book-category">Раздел</label><input id="book-category" name="category" list="book-categories" value="${esc(category || 'Мои книги')}" maxlength="100" required>
          <datalist id="book-categories">${sections.map((c) => `<option value="${esc(c)}">`).join('')}</datalist></div>
        <div><label for="book-year">Год, если известен</label><input id="book-year" name="year" maxlength="60"></div>
        <div class="wide"><button class="sp-primary">Добавить в список</button> <button type="button" class="sp-ghost" data-action="cancel-book">Отмена</button></div>
      </form>`}
      <div class="lib-toolbar">
        <div class="lib-search"><label for="book-search" class="sp-sr">Поиск книги или автора</label>
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
          <input id="book-search" type="search" value="${esc(query)}" placeholder="Найти книгу или автора во всех разделах"></div>
      </div>
      <div class="lib-sections" role="tablist" aria-label="Разделы библиотеки"></div>
      <div class="study-books" data-books></div><div class="study-pager"></div>`;
    drawBooks();
    body.querySelector('#book-search').oninput = (e) => { query = e.target.value; page = 0; drawBooks(); };
    const form = body.querySelector('#book-form');
    if (form) form.onsubmit = async (e) => {
      e.preventDefault();
      const d = new FormData(e.target);
      const book = { id: crypto.randomUUID(), title: d.get('title').trim(), author: d.get('author').trim(), category: d.get('category').trim() || 'Мои книги', year: d.get('year').trim(), status: 'planned', notes: '' };
      if (book.title && await commit((s) => s.books.push(book))) { query = ''; category = book.category; page = 0; renderLibrary(); }
    };
  }

  const bookActions = (b) => live()
    ? `<a class="lib-start" ${external(b.url)}><span class="lib-n">N</span>Открыть в Notion</a>`
    : `<button class="lib-start" data-start="${esc(b.id)}">${BOOK}Начать читать</button>
       <button class="sp-ghost" data-mark-read="${esc(b.id)}" title="Уже прочитал" aria-label="Уже прочитал «${esc(b.title)}»">${CHECK}</button>
       <button class="lib-icon" data-remove-book="${esc(b.id)}" aria-label="Удалить ${esc(b.title)}" title="Удалить из списка">${TRASH}</button>`;

  function drawBooks() {
    const books = allBooks(), sections = sectionsOf(books), q = query.trim().toLocaleLowerCase('ru');
    const tabs = body.querySelector('.lib-sections'), list = body.querySelector('[data-books]'), pager = body.querySelector('.study-pager');
    tabs.hidden = !!q;
    tabs.innerHTML = sections.map((s, i) => {
      const own = books.filter((b) => (b.category || 'Мои книги') === s);
      return `<button role="tab" class="lib-section" data-section="${esc(s)}" aria-selected="${s === category}" style="--tone:${PALETTE[i % PALETTE.length]}"><span>${esc(s)}</span><small>${done(own)}/${own.length}</small></button>`;
    }).join('');

    // Поиск — плоский список по всем разделам.
    if (q) {
      const found = books.filter((b) => b.status === 'planned' && `${b.title} ${b.author}`.toLocaleLowerCase('ru').includes(q));
      const pages = Math.ceil(found.length / PAGE);
      page = Math.min(page, Math.max(0, pages - 1));
      list.className = 'study-books';
      list.innerHTML = found.length
        ? found.slice(page * PAGE, (page + 1) * PAGE).map((b) => `
          <article class="study-book" data-book="${esc(b.id)}" style="--tone:${PALETTE[Math.max(0, sections.indexOf(b.category)) % PALETTE.length]}">
            <span class="study-category">${esc(b.category)}${b.era ? ' · ' + esc(shortEra(b.era)) : ''}</span>
            <h3>${esc(b.title)}</h3>
            <p>${esc(b.author)}${b.year ? ' · ' + esc(b.year) : ''}</p>
            <div class="study-book-actions">${bookActions(b)}</div>
          </article>`).join('')
        : `<div class="lib-empty"><strong>Ничего не нашлось</strong><p>Измени запрос — поиск идёт по всем разделам.</p></div>`;
      pager.innerHTML = pages > 1
        ? `<button data-page="-1" ${page === 0 ? 'disabled' : ''} aria-label="Назад">←</button><span>${page + 1} / ${pages}</span><button data-page="1" ${page + 1 >= pages ? 'disabled' : ''} aria-label="Далее">→</button>`
        : '';
      return;
    }

    // План раздела: эпохи → авторы по порядку → книги по порядку.
    pager.innerHTML = '';
    list.className = 'lib-plan';
    const tone = PALETTE[Math.max(0, sections.indexOf(category)) % PALETTE.length];
    const eras = plan(books, category), firstOpen = eras.find((e) => e.books.some((b) => b.status !== 'read'))?.name;
    const row = (b, next) => `<li class="lib-work is-${b.status}${next ? ' is-next' : ''}" data-book="${esc(b.id)}">
        <span class="lib-mark" aria-hidden="true">${b.status === 'read' ? CHECK : b.status === 'reading' ? BOOK : ''}</span>
        <div class="lib-work-title"><strong>${esc(b.title)}</strong>${b.year ? `<small>${esc(b.year)}</small>` : ''}${next ? '<em>Следующая</em>' : ''}${b.status === 'reading' ? '<em class="is-reading">Читаю</em>' : ''}</div>
        ${b.status === 'planned' ? `<div class="lib-work-actions">${bookActions(b)}</div>` : ''}
      </li>`;
    list.innerHTML = `<p class="lib-plan-note" style="--tone:${tone}">${eras.length > 1 ? 'Эпохи и авторы идут в том порядке, в котором их удобнее читать. Внутри автора — книги по порядку.' : 'Авторы и книги идут в порядке чтения.'}</p>` + eras.map((era) => {
      const key = `${category}|${era.name}`, open = key in eraToggles ? eraToggles[key] : era.name === firstOpen;
      const next = era.books.find((b) => b.status === 'planned');
      const how = ERA_HOW.get(key);
      return `<details class="lib-era" data-era="${esc(key)}" style="--tone:${tone}" ${open ? 'open' : ''}>
        <summary><span class="lib-era-name">${esc(era.name)}</span><span class="lib-era-meta">${next ? `Дальше: «${esc(next.title)}»` : done(era.books) === era.books.length ? 'Всё прочитано ✓' : ''}</span><b>${done(era.books)}/${era.books.length}</b></summary>
        ${how ? `<p class="lib-how"><span>Как изучать</span>${esc(how)}</p>` : ''}
        <ol class="lib-authors">${era.authors.map((author) => {
          const tip = AUTHOR_TIP.get(`${key}|${author.name}`);
          return `<li class="lib-author"><header><h4>${esc(author.name || author.books[0].title)}</h4><small>${done(author.books)}/${author.books.length}</small></header>
            ${tip ? `<p class="lib-tip">${esc(tip)}</p>` : ''}
            <ol class="lib-works">${author.books.map((b) => row(b, b === next)).join('')}</ol></li>`;
        }).join('')}</ol>
      </details>`;
    }).join('');
    list.querySelectorAll('.lib-era').forEach((d) => d.addEventListener('toggle', () => { eraToggles[d.dataset.era] = d.open; saveEras(); }));
  }

  function drawShelf() {
    const done = allBooks().filter((b) => b.status === 'read'), el = body.querySelector('.lib-shelf');
    const link = (b) => (live() ? b.url : b.notion);
    el.innerHTML = done.length
      ? `<details ${shelfOpen ? 'open' : ''}><summary>${CHECK}Прочитанные книги <b>${done.length}</b></summary><ul>${done.map((b) => `<li><div><strong>${esc(b.title)}</strong><span>${esc(b.author)}</span></div>${link(b) ? `<a class="lib-mini-notion" ${external(link(b))} title="Конспект в Notion">N</a>` : ''}${live() ? '' : `<button class="sp-ghost" data-unread="${esc(b.id)}">Вернуть</button>`}</li>`).join('')}</ul></details>`
      : '';
    el.querySelector('details')?.addEventListener('toggle', (e) => (shelfOpen = e.target.open));
  }

  // Карточка уходит из списка с анимацией, затем сохраняется новый статус (только локальный режим).
  async function moveBook(id, card, value, flash, note) {
    const book = library(getState()).find((b) => b.id === id);
    if (!book) return;
    card.dataset.flash = flash;
    card.classList.add('is-closing');
    await new Promise((r) => setTimeout(r, reduced() ? 0 : 420));
    if (await commit((s) => (s.books.find((b) => b.id === id).status = value))) {
      renderLibrary();
      status.innerHTML = `«${esc(book.title)}» — ${note}. <button class="lib-undo" data-undo="${esc(id)}" data-prev="${book.status}">Вернуть</button>`;
    } else card.classList.remove('is-closing');
  }

  function cleanNotionURL(value) {
    const url = safeURL(String(value).trim());
    if (!url) return '';
    const u = new URL(url);
    u.searchParams.delete('source');
    return u.href;
  }

  /* ---------- Английский и история ---------- */
  function renderEnglish() {
    body.innerHTML = `<div class="tool-grid">
      <a class="tool-card tool-words" ${external(DLANG_URL)}>
        <span class="tool-badge">Aa</span><strong>Учить слова</strong><span>dLang — 10 000 английских слов</span>${ARROW}</a>
      <a class="tool-card tool-griffins" ${external(VIDEO_URL)}>
        <span class="tool-badge"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z"/></svg></span><strong>Язык через «Гриффинов»</strong><span>Смотреть серии на английском</span>${ARROW}</a>
    </div>`;
  }

  function renderHistory() {
    body.innerHTML = `<div class="tool-grid">
      <a class="tool-card tool-notion" ${external(HISTORY_NOTION_URL)}>
        <span class="tool-badge">N</span><strong>История в Notion</strong><span>Мои конспекты и заметки по истории</span>${ARROW}</a>
    </div>`;
  }

  /* ---------- Ссылки для остальных сфер ---------- */
  function renderResources() {
    const resources = (getState().study?.resources || []).filter((r) => r.sphereId === sphereId);
    body.innerHTML = `
      <div class="tool-grid">${resources.map((r) => `<div class="tool-card tool-link"><a ${external(safeURL(r.url))}><strong>${esc(r.title)}</strong><span>${esc(new URL(r.url).hostname)}</span></a><button class="lib-icon" data-remove-resource="${esc(r.id)}" aria-label="Удалить ${esc(r.title)}">${TRASH}</button></div>`).join('')}</div>
      ${resources.length ? '' : '<p class="sp-empty">Сохраняй здесь сервисы и страницы, которые помогают в этой сфере.</p>'}
      <form id="resource-form" class="sp-goal-form">
        <label for="resource-title" class="sp-sr">Название</label><input id="resource-title" name="title" required maxlength="150" placeholder="Название">
        <label for="resource-url" class="sp-sr">Ссылка</label><input id="resource-url" type="url" name="url" required maxlength="2000" placeholder="https://">
        <button class="sp-primary">Добавить</button>
      </form>`;
    body.querySelector('form').onsubmit = async (e) => {
      e.preventDefault();
      const d = new FormData(e.target), url = safeURL(d.get('url')), title = d.get('title').trim();
      if (!url || !title) { status.textContent = 'Укажи название и ссылку, начинающуюся с https://'; return; }
      if (await commit((s) => (s.resources ??= []).push({ id: crypto.randomUUID(), sphereId, title, url }))) renderResources();
    };
  }

  root.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b || pending) return;
    const d = b.dataset;
    if (d.tab) { view = d.tab; status.textContent = ''; render(); }
    else if (d.shelf) { shelf = d.shelf; linking = null; status.textContent = ''; renderLibrary(); root.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' }); }
    else if (d.section) { category = d.section; page = 0; drawBooks(); body.querySelector('.lib-sections').scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'nearest' }); }
    else if (d.page) { page += Number(d.page); drawBooks(); body.querySelector('.lib-toolbar').scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' }); }
    else if (d.markRead) await moveBook(d.markRead, b.closest('[data-book]'), 'read', '✓', 'прочитана');
    else if (d.start) await moveBook(d.start, b.closest('[data-book]'), 'reading', '📖', 'теперь в «Читаю сейчас»');
    else if (d.setStatus) { if (await commit((s) => (s.books.find((x) => x.id === d.setStatus).status = d.value))) renderLibrary(); }
    else if (d.undo) { if (await commit((s) => (s.books.find((x) => x.id === d.undo).status = d.prev))) { renderLibrary(); status.textContent = 'Вернул как было.'; } }
    else if (d.unread) { if (await commit((s) => (s.books.find((x) => x.id === d.unread).status = 'planned'))) { renderLibrary(); status.textContent = 'Книга вернулась в «Осталось прочитать».'; } }
    else if (d.link) { linking = d.link; renderLibrary(); }
    else if (d.linkCancel !== undefined) { linking = null; renderLibrary(); }
    else if (d.removeBook) {
      const book = library(getState()).find((x) => x.id === d.removeBook);
      if (confirm(`Убрать «${book.title}» из списка?`) && await commit((s) => (s.books = s.books.filter((x) => x.id !== book.id)))) renderLibrary();
    }
    else if (d.removeResource) { if (await commit((s) => (s.resources = s.resources.filter((x) => x.id !== d.removeResource)))) renderResources(); }
    else if (d.action === 'new-book') { body.querySelector('#book-form').hidden = false; body.querySelector('#book-title').focus(); }
    else if (d.action === 'cancel-book') body.querySelector('#book-form').hidden = true;
    else if (d.action === 'sync') { b.classList.add('is-spinning'); await syncNotion(); }
  });

  root.addEventListener('submit', async (e) => {
    const id = e.target.dataset.linkForm;
    if (id === undefined) return;
    e.preventDefault();
    const raw = new FormData(e.target).get('url'), url = cleanNotionURL(raw);
    if (raw.trim() && !url) { status.textContent = 'Вставь ссылку, которая начинается с https://'; return; }
    if (await commit((s) => (s.books.find((x) => x.id === id).notion = url))) { linking = null; renderLibrary(); status.textContent = url ? 'Конспект привязан.' : 'Ссылка на конспект убрана.'; }
  });

  render();

  if (study) {
    syncNotion();
    // Держим список свежим: раз в минуту, пока вкладка открыта, и сразу при возвращении на неё.
    setInterval(() => document.visibilityState === 'visible' && syncNotion(), 60000);
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && syncNotion());
  }
}
