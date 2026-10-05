import { library, changeStudy, safeURL, VIDEO_URL } from './study-model.js';
import { CATALOG } from './library-catalog.js';
import { escapeHTML as esc } from './development.js';
import { cloudClient } from './cloud.js';

export function mountStudy({sphereId,getState,save,getBackend}) {
  if(location.pathname.startsWith('/embed/') && new URLSearchParams(location.search).get('section')!=='tools')return;
  const root=document.createElement('section');root.className='study-hub';root.setAttribute('aria-label','Инструменты сферы');
  document.querySelector('#sphere-error').after(root);
  let view=sphereId==='10'?'library':'resources',query='',category='',filter='',page=0,pending=false;
  const tabs=sphereId==='10'?[['library','Библиотека'],['english','Английский'],['history','История'],['resources','Мои сервисы']]:[['resources','Мои сервисы']];
  root.innerHTML=`<div class="study-top"><h2>${sphereId==='10'?'Моя учёба':'Под рукой'}</h2><div class="study-tabs" role="tablist">${tabs.map(([id,label])=>`<button role="tab" aria-selected="${id===view}" data-tab="${id}">${label}</button>`).join('')}</div></div><p class="study-status" role="status" aria-live="polite"></p><div class="study-body"></div>`;
  const body=root.querySelector('.study-body'),status=root.querySelector('.study-status');
  async function commit(change){
    if(pending)return false;
    if(getBackend()==='local'){status.innerHTML='Для сохранения подключи <a href="/#open-cloud">синхронизацию на главной</a>. Книги доступны для просмотра.';return false;}
    pending=true;const controls=[...root.querySelectorAll('button,input,select,textarea')].map(el=>[el,el.disabled]);controls.forEach(([el])=>el.disabled=true);
    try{const ok=await save(changeStudy(getState(),change));status.textContent=ok?'Сохранено':'Не удалось сохранить. Проверь сообщение выше; введённые данные сохранены в форме.';return ok;}
    finally{pending=false;controls.forEach(([el,disabled])=>el.disabled=disabled);}
  }
  function render(){
    root.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.tab===view)));
    if(view==='library')renderLibrary();else if(view==='resources')renderResources();else renderTopic();
  }
  const PALETTE=['#e9a23b','#4f7fe0','#d9605a','#8a63d2','#2fa58c','#c7843a','#3a9fd0','#e0679a','#5aa652','#7b8ccc','#c4a03a'];
  let shelfOpen=false;
  const categories=books=>[...new Set([...CATALOG,...books].map(b=>b.category))];
  const tone=(cats,c)=>PALETTE[Math.max(0,cats.indexOf(c))%PALETTE.length];
  const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
  function renderLibrary(){
    const books=library(getState()),read=books.filter(b=>b.status==='read').length,left=books.length-read,reading=books.filter(b=>b.status==='reading').length;
    const pct=books.length?Math.round(read/books.length*100):0,C=2*Math.PI*44,cats=categories(books);
    if(filter==='read')filter='';
    body.innerHTML=`<div class="lib-hero"><div class="lib-hero-text"><span class="lib-eyebrow">Осталось прочитать</span><strong class="lib-count">${left}</strong><p>${reading?`<span class="lib-dot"></span>${reading} читаю сейчас · `:''}${read} из ${books.length} уже прочитано</p><button class="study-primary" data-action="new-book">＋ Добавить книгу</button></div><div class="lib-ring" role="progressbar" aria-label="Прочитанные книги" aria-valuenow="${read}" aria-valuemin="0" aria-valuemax="${books.length||1}"><svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="44" class="lib-ring-track"/><circle cx="50" cy="50" r="44" class="lib-ring-fill" stroke-dasharray="${C}" stroke-dashoffset="${C*(1-pct/100)}"/></svg><span><b>${pct}%</b>прочитано</span></div></div>
    <form id="book-form" class="study-form" hidden><div><label for="book-title">Название</label><input id="book-title" name="title" maxlength="250" required></div><div><label for="book-author">Автор</label><input id="book-author" name="author" maxlength="250"></div><div><label for="book-category">Категория</label><input id="book-category" name="category" list="book-categories" value="Мои книги" maxlength="100" required><datalist id="book-categories">${cats.map(c=>`<option value="${esc(c)}">`).join('')}</datalist></div><div><label for="book-year">Год, если известен</label><input id="book-year" name="year" maxlength="60"></div><div class="wide"><button class="study-primary">Добавить в план</button> <button type="button" data-action="cancel-book">Отмена</button></div></form>
    <div class="lib-toolbar"><div class="lib-search"><label for="book-search" class="lib-sr">Поиск книги или автора</label><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input id="book-search" type="search" value="${esc(query)}" placeholder="Найти книгу или автора"></div><div class="lib-chips" role="group" aria-label="Статус">${[['','Все'],['reading','Читаю'],['planned','Хочу прочитать']].map(([v,t])=>`<button type="button" class="lib-chip" data-filter="${v}" aria-pressed="${filter===v}">${t}</button>`).join('')}</div><div class="lib-cat"><label for="category-filter" class="lib-sr">Категория</label><select id="category-filter"><option value="">Все категории</option>${cats.map(c=>`<option ${category===c?'selected':''}>${esc(c)}</option>`).join('')}</select></div></div><div class="study-books"></div><div class="study-pager"></div><div class="lib-shelf"></div><p class="study-note">Каталог из <a href="https://sto-knig-na-vsyu-zhizn.tivishka.chatgpt.site/" target="_blank" rel="noopener noreferrer">моей библиотеки</a>. Отметки сохраняются в dLife; исходный сайт не изменяется.</p>`;
    drawBooks();drawShelf();
    body.querySelector('#book-search').oninput=e=>{query=e.target.value;page=0;drawBooks();};
    body.querySelector('#category-filter').onchange=e=>{category=e.target.value;page=0;drawBooks();};
    body.querySelector('#book-form').onsubmit=async e=>{e.preventDefault();const f=e.target,d=new FormData(f);const b={id:crypto.randomUUID(),title:d.get('title').trim(),author:d.get('author').trim(),category:d.get('category').trim()||'Мои книги',year:d.get('year').trim(),status:'planned',notes:''};if(!b.title)return;if(await commit(s=>s.books.unshift(b))){query='';category='';filter='';page=0;renderLibrary();}};
  }
  function drawBooks(){
    const books=library(getState()),cats=categories(books),q=query.toLocaleLowerCase('ru'),unread=books.some(b=>b.status!=='read');
    const all=books.filter(b=>b.status!=='read'&&(!category||b.category===category)&&(!filter||b.status===filter)&&`${b.title} ${b.author}`.toLocaleLowerCase('ru').includes(q)).sort((a,b)=>(b.status==='reading')-(a.status==='reading'));
    page=Math.min(page,Math.max(0,Math.ceil(all.length/12)-1));
    body.querySelectorAll('.lib-chip').forEach(c=>c.setAttribute('aria-pressed',String(c.dataset.filter===filter)));
    body.querySelector('.study-books').innerHTML=all.length?all.slice(page*12,page*12+12).map(b=>`<article class="study-book${b.status==='reading'?' is-reading':''}" data-book="${esc(b.id)}" style="--tone:${tone(cats,b.category)}"><div class="study-book-head"><span class="study-category">${esc(b.category)}</span>${b.status==='reading'?'<span class="lib-badge">Читаю</span>':''}</div><h3>${esc(b.title)}</h3><p>${esc(b.author)}${b.year?' · '+esc(b.year):''}</p><div class="study-book-actions"><button class="lib-done" data-mark-read="${esc(b.id)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>Прочитал</button><button class="lib-ghost" data-set-status="${esc(b.id)}" data-value="${b.status==='reading'?'planned':'reading'}">${b.status==='reading'?'Отложить':'Читаю'}</button><button class="lib-icon study-delete" data-remove-book="${esc(b.id)}" aria-label="Удалить ${esc(b.title)}" title="Удалить из списка"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/></svg></button></div><details><summary>Мои заметки${b.notes?' · есть запись':''}</summary><textarea aria-label="Заметки: ${esc(b.title)}" rows="3" maxlength="5000">${esc(b.notes)}</textarea><button data-save-note="${esc(b.id)}">Сохранить заметку</button></details></article>`).join(''):`<div class="lib-empty"><strong>${unread?'Ничего не нашлось':'Все книги прочитаны 🎉'}</strong><p>${unread?'Измени поиск или фильтры.':'Добавь новую книгу в план.'}</p></div>`;
    body.querySelector('.study-pager').innerHTML=all.length>12?`<button data-page="-1" ${page===0?'disabled':''} aria-label="Назад">←</button><span>${page+1} / ${Math.ceil(all.length/12)}</span><button data-page="1" ${(page+1)*12>=all.length?'disabled':''} aria-label="Далее">→</button>`:'';
  }
  function drawShelf(){
    const done=library(getState()).filter(b=>b.status==='read'),shelf=body.querySelector('.lib-shelf');
    shelf.innerHTML=done.length?`<details ${shelfOpen?'open':''}><summary><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>Прочитанные книги <b>${done.length}</b></summary><ul>${done.map(b=>`<li><div><strong>${esc(b.title)}</strong><span>${esc(b.author)}</span></div><button class="lib-ghost" data-unread="${esc(b.id)}">Вернуть</button></li>`).join('')}</ul></details>`:'';
    shelf.querySelector('details')?.addEventListener('toggle',e=>shelfOpen=e.target.open);
  }
  async function markRead(id,card){
    const book=library(getState()).find(b=>b.id===id);if(!book)return;
    if(card){card.classList.add('is-closing');await new Promise(r=>setTimeout(r,reduced()?0:420));}
    if(await commit(s=>s.books.find(b=>b.id===id).status='read')){renderLibrary();status.innerHTML=`«${esc(book.title)}» — прочитана и убрана из списка. <button class="lib-undo" data-unread="${esc(id)}">Вернуть</button>`;}
    else card?.classList.remove('is-closing');
  }
  function renderResources(){
    const resources=(getState().study?.resources||[]).filter(r=>r.sphereId===sphereId);
    body.innerHTML=`<h3>Мои приложения и материалы</h3><p class="study-note">Сохраняй здесь сервисы, документы и полезные страницы для этой сферы.</p><form id="resource-form" class="study-form"><div><label for="resource-title">Название</label><input id="resource-title" name="title" required maxlength="150" placeholder="Название инструмента"></div><div><label for="resource-url">Ссылка</label><input id="resource-url" type="url" name="url" required maxlength="2000" placeholder="https://"></div><button class="study-primary">Добавить инструмент</button></form><div class="study-resources">${resources.map(r=>`<div class="study-resource"><a href="${esc(safeURL(r.url))}" target="_blank" rel="noopener noreferrer">${esc(r.title)}</a><button class="study-delete" data-remove-resource="${esc(r.id)}">Удалить</button></div>`).join('')||'<p class="study-note">Здесь появятся твои инструменты.</p>'}</div>`;
    body.querySelector('form').onsubmit=async e=>{e.preventDefault();const d=new FormData(e.target),url=safeURL(d.get('url')),title=d.get('title').trim();if(!url||!title){status.textContent='Укажи название и ссылку, начинающуюся с https://';return;}if(await commit(s=>(s.resources??=[]).push({id:crypto.randomUUID(),sphereId,title,url})))renderResources();};
  }
  function renderTopic(){
    const english=view==='english',e=getState().study?.english||{season:1,episode:1,position:'',notes:''};
    body.innerHTML=english?`<h3>Английский с «Гриффинами»</h3><div class="study-topic-links"><a href="${VIDEO_URL}" target="_blank" rel="noopener noreferrer">Открыть серии на Kinogomy</a><a href="https://den-english-10000.tivishka.chatgpt.site" target="_blank" rel="noopener noreferrer">Мой dLang</a></div><button data-action="watch">Показать сайт просмотра здесь</button><div id="player"></div><p class="study-note">Язык и субтитры выбираются в плеере источника. Если сайт запрещает встраивание, открой его по ссылке выше. Номер серии и время сохраняются вручную.</p><form id="episode-form" class="study-form"><div><label for="season">Сезон</label><input id="season" name="season" type="number" min="1" max="100" required value="${e.season}"></div><div><label for="episode">Серия</label><input id="episode" name="episode" type="number" min="1" max="1000" required value="${e.episode}"></div><div><label for="position">Остановился на</label><input id="position" name="position" maxlength="30" placeholder="12:35" value="${esc(e.position)}"></div><div class="wide"><label for="episode-notes">Новые слова, фразы и заметки</label><textarea id="episode-notes" name="notes" maxlength="10000" rows="5">${esc(e.notes)}</textarea></div><button class="study-primary">Сохранить прогресс</button></form>`:`<h3>История</h3><div class="study-topic-links"><button data-action="history-books">Мои книги по истории</button><a href="https://rim-do-imperii.tivishka.chatgpt.site" target="_blank" rel="noopener noreferrer">История Рима</a><a href="https://romanov-family-tree.tivishka.chatgpt.site" target="_blank" rel="noopener noreferrer">Династия Романовых</a></div>`;
    body.insertAdjacentHTML('beforeend',`<h3>Мои заметки Notion · ${english?'английский':'история'}</h3><p><a href="https://www.notion.so/${english?'24a8171a481c8006a863f5ed3934c410':'24c8171a481c80cb8553e9ca2723c9c0'}" target="_blank" rel="noopener noreferrer">Открыть мой раздел в Notion</a></p><button data-action="notion-refresh">Загрузить заметки</button><p id="notion-status" class="study-note" role="status">Открой заметку, чтобы читать её прямо здесь.</p><div class="notion-pages"></div><div class="notion-reader" hidden></div>`);
    if(english)body.querySelector('#episode-form').onsubmit=async event=>{event.preventDefault();const d=new FormData(event.target);await commit(s=>s.english={season:Number(d.get('season')),episode:Number(d.get('episode')),position:d.get('position').trim(),notes:d.get('notes')});};
  }
  let notionGeneration=0;
  async function notionRequest(args){
    const client=cloudClient(),session=client?(await client.auth.getSession()).data.session:null;
    if(!session)throw Error('Войди в синхронизацию dLife на главной, чтобы читать личные заметки.');
    const response=await fetch('/api/notion',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},body:JSON.stringify(args)});
    let result;try{result=await response.json();}catch{throw Error('Подключение Notion ещё не настроено на сервере dLife.');}
    if(!response.ok)throw Error(result.message||'Notion временно недоступен. Попробуй ещё раз.');return result;
  }
  async function loadNotion(id=null,cursor=null){
    const generation=++notionGeneration,topic=view,note=body.querySelector('#notion-status');if(!note)return;
    note.textContent='Загружаю из Notion…';
    try{const result=await notionRequest({topic,...(id?{id}:{}),...(cursor?{cursor}:{})});if(generation!==notionGeneration||view!==topic)return;
      note.textContent='Обновлено '+new Date().toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});
      if(!id){body.querySelector('.notion-pages').innerHTML=result.pages.map(p=>`<button data-notion-page="${esc(p.id)}">${esc(p.title)}</button>`).join('')||'В этом разделе пока нет страниц.';}
      else{const reader=body.querySelector('.notion-reader');reader.hidden=false;const content=result.blocks.map(b=>`${b.type.startsWith('heading')?'<h3>':'<p>'}${esc(b.text)||'—'}${b.type.startsWith('heading')?'</h3>':'</p>'}${b.hasChildren?`<button data-notion-page="${esc(b.id)}">Открыть вложенные записи</button>`:''}`).join('');if(cursor)reader.querySelector('[data-notion-more]')?.remove();if(cursor)reader.insertAdjacentHTML('beforeend',content);else reader.innerHTML=content||'<p>Нет текстовых блоков. Открой оригинал в Notion.</p>';if(result.nextCursor)reader.insertAdjacentHTML('beforeend',`<button data-notion-more="${esc(result.nextCursor)}" data-block-id="${esc(id)}">Загрузить продолжение</button>`);}
    }catch(e){if(generation===notionGeneration&&view===topic)note.textContent=e.message;}
  }
  root.addEventListener('click',async e=>{
    const b=e.target.closest('button');if(!b||pending)return;
    if(b.dataset.tab){view=b.dataset.tab;notionGeneration++;status.textContent='';render();return;}
    if(b.dataset.page){page+=Number(b.dataset.page);drawBooks();body.querySelector('.lib-toolbar')?.scrollIntoView({behavior:reduced()?'auto':'smooth',block:'start'});return;}
    if(b.dataset.filter!==undefined){filter=b.dataset.filter;page=0;drawBooks();return;}
    if(b.dataset.markRead){await markRead(b.dataset.markRead,b.closest('article'));return;}
    if(b.dataset.setStatus){const id=b.dataset.setStatus,value=b.dataset.value;if(await commit(s=>s.books.find(x=>x.id===id).status=value))renderLibrary();return;}
    if(b.dataset.unread){const id=b.dataset.unread;if(await commit(s=>s.books.find(x=>x.id===id).status='planned')){renderLibrary();status.textContent='Книга вернулась в список.';}return;}
    if(b.dataset.removeBook){const book=library(getState()).find(x=>x.id===b.dataset.removeBook);if(!confirm(`Убрать «${book.title}» из списка dLife?`))return;if(await commit(s=>s.books=s.books.filter(x=>x.id!==book.id)))renderLibrary();return;}
    if(b.dataset.saveNote){const notes=b.closest('article').querySelector('textarea').value;await commit(s=>s.books.find(x=>x.id===b.dataset.saveNote).notes=notes);return;}
    if(b.dataset.removeResource){if(await commit(s=>s.resources=s.resources.filter(x=>x.id!==b.dataset.removeResource)))renderResources();return;}
    if(b.dataset.notionPage){await loadNotion(b.dataset.notionPage);return;}
    if(b.dataset.notionMore){await loadNotion(b.dataset.blockId,b.dataset.notionMore);return;}
    const action=b.dataset.action;
    if(action==='new-book'){body.querySelector('#book-form').hidden=false;body.querySelector('#book-title').focus();}
    if(action==='cancel-book')body.querySelector('#book-form').hidden=true;
    if(action==='history-books'){category='История';query='';filter='';page=0;view='library';render();}
    if(action==='watch'){body.querySelector('#player').innerHTML=`<iframe class="study-player" title="Гриффины на Kinogomy" src="${VIDEO_URL}" sandbox="allow-scripts allow-same-origin allow-presentation" allow="fullscreen" referrerpolicy="no-referrer" loading="lazy"></iframe>`;b.hidden=true;}
    if(action==='notion-refresh')await loadNotion();
  });
  render();
}
