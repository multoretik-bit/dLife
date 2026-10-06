import { library, changeStudy, safeURL, VIDEO_URL, DLANG_URL, HISTORY_NOTION_URL } from './study-model.js';
import { CATALOG } from './library-catalog.js';
import { escapeHTML as esc } from './development.js';

const PALETTE = ['#e9a23b', '#4f7fe0', '#d9605a', '#8a63d2', '#2fa58c', '#c7843a', '#3a9fd0', '#e0679a', '#5aa652', '#7b8ccc', '#c4a03a'];
const PAGE = 12;
const CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';
const TRASH = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/></svg>';
const ARROW = '<svg class="tool-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M9 7h8v8"/></svg>';
const categories = (books) => [...new Set([...CATALOG, ...books].map((b) => b.category))];
const tone = (cats, c) => PALETTE[Math.max(0, cats.indexOf(c)) % PALETTE.length];
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const external = (href) => `href="${esc(href)}" target="_blank" rel="noopener noreferrer"`;

/** Блок «Инструменты» на странице сферы: библиотека, английский и история для учёбы, ссылки — для остальных сфер. */
export function mountStudy({ root, sphereId, getState, save, getBackend }) {
  const study = sphereId === '10';
  const tabs = study ? [['library', 'Библиотека'], ['english', 'Английский'], ['history', 'История']] : [];
  let view = study ? 'library' : 'resources', query = '', category = '', filter = '', page = 0, pending = false, shelfOpen = false;

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

  /* ---------- Библиотека ---------- */
  function renderLibrary() {
    const books = library(getState()), cats = categories(books);
    const read = books.filter((b) => b.status === 'read').length, reading = books.filter((b) => b.status === 'reading').length;
    const pct = books.length ? Math.round((read / books.length) * 100) : 0, C = 2 * Math.PI * 44;
    body.innerHTML = `
      <div class="lib-hero">
        <div>
          <span class="lib-eyebrow">Осталось прочитать</span>
          <strong class="lib-count">${books.length - read}</strong>
          <p>${reading ? `<span class="lib-dot"></span>${reading} читаю сейчас · ` : ''}${read} из ${books.length} уже прочитано</p>
          <button class="sp-primary" data-action="new-book">＋ Добавить книгу</button>
        </div>
        <div class="lib-ring" role="progressbar" aria-label="Прочитанные книги" aria-valuenow="${read}" aria-valuemin="0" aria-valuemax="${books.length || 1}">
          <svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="44" class="lib-ring-track"/><circle cx="50" cy="50" r="44" class="lib-ring-fill" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - pct / 100)}"/></svg>
          <span><b>${pct}%</b>прочитано</span>
        </div>
      </div>
      <form id="book-form" class="study-form" hidden>
        <div><label for="book-title">Название</label><input id="book-title" name="title" maxlength="250" required></div>
        <div><label for="book-author">Автор</label><input id="book-author" name="author" maxlength="250"></div>
        <div><label for="book-category">Категория</label><input id="book-category" name="category" list="book-categories" value="Мои книги" maxlength="100" required>
          <datalist id="book-categories">${cats.map((c) => `<option value="${esc(c)}">`).join('')}</datalist></div>
        <div><label for="book-year">Год, если известен</label><input id="book-year" name="year" maxlength="60"></div>
        <div class="wide"><button class="sp-primary">Добавить в план</button> <button type="button" class="sp-ghost" data-action="cancel-book">Отмена</button></div>
      </form>
      <div class="lib-toolbar">
        <div class="lib-search"><label for="book-search" class="sp-sr">Поиск книги или автора</label>
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
          <input id="book-search" type="search" value="${esc(query)}" placeholder="Найти книгу или автора"></div>
        <div class="lib-chips" role="group" aria-label="Статус">${[['', 'Все'], ['reading', 'Читаю'], ['planned', 'Хочу прочитать']].map(([v, t]) => `<button type="button" class="lib-chip" data-filter="${v}">${t}</button>`).join('')}</div>
        <div class="lib-cat"><label for="category-filter" class="sp-sr">Категория</label>
          <select id="category-filter"><option value="">Все категории</option>${cats.map((c) => `<option ${category === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
      </div>
      <div class="study-books"></div><div class="study-pager"></div><div class="lib-shelf"></div>`;
    drawBooks();
    drawShelf();
    body.querySelector('#book-search').oninput = (e) => { query = e.target.value; page = 0; drawBooks(); };
    body.querySelector('#category-filter').onchange = (e) => { category = e.target.value; page = 0; drawBooks(); };
    body.querySelector('#book-form').onsubmit = async (e) => {
      e.preventDefault();
      const d = new FormData(e.target);
      const book = { id: crypto.randomUUID(), title: d.get('title').trim(), author: d.get('author').trim(), category: d.get('category').trim() || 'Мои книги', year: d.get('year').trim(), status: 'planned', notes: '' };
      if (book.title && await commit((s) => s.books.unshift(book))) { query = category = filter = ''; page = 0; renderLibrary(); }
    };
  }

  function drawBooks() {
    const books = library(getState()), cats = categories(books), q = query.toLocaleLowerCase('ru'), unread = books.some((b) => b.status !== 'read');
    const list = books
      .filter((b) => b.status !== 'read' && (!category || b.category === category) && (!filter || b.status === filter) && `${b.title} ${b.author}`.toLocaleLowerCase('ru').includes(q))
      .sort((a, b) => (b.status === 'reading') - (a.status === 'reading'));
    const pages = Math.ceil(list.length / PAGE);
    page = Math.min(page, Math.max(0, pages - 1));
    body.querySelectorAll('.lib-chip').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.filter === filter)));
    body.querySelector('.study-books').innerHTML = list.length
      ? list.slice(page * PAGE, (page + 1) * PAGE).map((b) => `
        <article class="study-book${b.status === 'reading' ? ' is-reading' : ''}" style="--tone:${tone(cats, b.category)}">
          <div class="study-book-head"><span class="study-category">${esc(b.category)}</span>${b.status === 'reading' ? '<span class="lib-badge">Читаю</span>' : ''}</div>
          <h3>${esc(b.title)}</h3>
          <p>${esc(b.author)}${b.year ? ' · ' + esc(b.year) : ''}</p>
          <div class="study-book-actions">
            <button class="lib-done" data-mark-read="${esc(b.id)}">${CHECK}Прочитал</button>
            <button class="sp-ghost" data-set-status="${esc(b.id)}" data-value="${b.status === 'reading' ? 'planned' : 'reading'}">${b.status === 'reading' ? 'Отложить' : 'Читаю'}</button>
            <button class="lib-icon" data-remove-book="${esc(b.id)}" aria-label="Удалить ${esc(b.title)}" title="Удалить из списка">${TRASH}</button>
          </div>
          <details><summary>Мои заметки${b.notes ? ' · есть запись' : ''}</summary>
            <textarea aria-label="Заметки: ${esc(b.title)}" rows="3" maxlength="5000">${esc(b.notes)}</textarea>
            <button class="sp-ghost" data-save-note="${esc(b.id)}">Сохранить заметку</button></details>
        </article>`).join('')
      : `<div class="lib-empty"><strong>${unread ? 'Ничего не нашлось' : 'Все книги прочитаны 🎉'}</strong><p>${unread ? 'Измени поиск или фильтры.' : 'Добавь новую книгу в план.'}</p></div>`;
    body.querySelector('.study-pager').innerHTML = pages > 1
      ? `<button data-page="-1" ${page === 0 ? 'disabled' : ''} aria-label="Назад">←</button><span>${page + 1} / ${pages}</span><button data-page="1" ${page + 1 >= pages ? 'disabled' : ''} aria-label="Далее">→</button>`
      : '';
  }

  function drawShelf() {
    const done = library(getState()).filter((b) => b.status === 'read'), shelf = body.querySelector('.lib-shelf');
    shelf.innerHTML = done.length
      ? `<details ${shelfOpen ? 'open' : ''}><summary>${CHECK}Прочитанные книги <b>${done.length}</b></summary><ul>${done.map((b) => `<li><div><strong>${esc(b.title)}</strong><span>${esc(b.author)}</span></div><button class="sp-ghost" data-unread="${esc(b.id)}">Вернуть</button></li>`).join('')}</ul></details>`
      : '';
    shelf.querySelector('details')?.addEventListener('toggle', (e) => (shelfOpen = e.target.open));
  }

  async function markRead(id, card) {
    const book = library(getState()).find((b) => b.id === id);
    if (!book) return;
    card.classList.add('is-closing');
    await new Promise((r) => setTimeout(r, reduced() ? 0 : 420));
    if (await commit((s) => (s.books.find((b) => b.id === id).status = 'read'))) {
      renderLibrary();
      status.innerHTML = `«${esc(book.title)}» — прочитана и убрана из списка. <button class="lib-undo" data-unread="${esc(id)}">Вернуть</button>`;
    } else card.classList.remove('is-closing');
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
    else if (d.page) { page += Number(d.page); drawBooks(); body.querySelector('.lib-toolbar').scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' }); }
    else if (d.filter !== undefined) { filter = d.filter; page = 0; drawBooks(); }
    else if (d.markRead) await markRead(d.markRead, b.closest('article'));
    else if (d.setStatus) { if (await commit((s) => (s.books.find((x) => x.id === d.setStatus).status = d.value))) renderLibrary(); }
    else if (d.unread) { if (await commit((s) => (s.books.find((x) => x.id === d.unread).status = 'planned'))) { renderLibrary(); status.textContent = 'Книга вернулась в список.'; } }
    else if (d.removeBook) {
      const book = library(getState()).find((x) => x.id === d.removeBook);
      if (confirm(`Убрать «${book.title}» из списка?`) && await commit((s) => (s.books = s.books.filter((x) => x.id !== book.id)))) renderLibrary();
    }
    else if (d.saveNote) { const notes = b.closest('article').querySelector('textarea').value; await commit((s) => (s.books.find((x) => x.id === d.saveNote).notes = notes)); }
    else if (d.removeResource) { if (await commit((s) => (s.resources = s.resources.filter((x) => x.id !== d.removeResource)))) renderResources(); }
    else if (d.action === 'new-book') { body.querySelector('#book-form').hidden = false; body.querySelector('#book-title').focus(); }
    else if (d.action === 'cancel-book') body.querySelector('#book-form').hidden = true;
  });

  render();
}
