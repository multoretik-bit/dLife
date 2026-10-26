import {ScheduleStore} from './store.js';
import {cloudClient,cloudConfig,configureCloud,cloudEnabled,cloudUser,joinSyncCode,codeSyncEnabled,savedSyncCode,disableCodeSync,dcapitalClient} from './cloud.js';
import {dateKey,emptyState,validateState} from './schedule.js';
import {coinTotal,normalize} from './development.js';
import {mountToday} from './today.js';
import {updateTiles, tileForm, tileChange} from './tiles.js';
import {pullWatch} from './watch.js';

const $ = s => document.querySelector(s), store = new ScheduleStore();
let state = null, busy = false;

$('#cloud-login')?.insertAdjacentHTML('beforebegin',`<section class="sync-code-panel"><span>ЕДИНЫЙ АККАУНТ DLIFE</span><h3>Один код — все устройства</h3><p>Создай код на этом устройстве или введи существующий. Задачи, блоки, привычки, таймер и прогресс будут общими.</p><div class="sync-code-row"><input id="sync-code" aria-label="Код синхронизации" placeholder="DLIFE-XXXX-XXXX-XXXX" autocomplete="off" spellcheck="false"/><button class="add-block" id="sync-code-join" type="button">Войти по коду</button></div><div class="sync-code-actions"><button class="quiet-button" id="sync-code-create" type="button">Создать новый код</button><button class="quiet-button" id="sync-code-copy" type="button">Копировать код</button><button class="quiet-button" id="sync-code-disable" type="button">Отключить на устройстве</button></div><p id="sync-code-status" role="status"></p></section>`);
const makeCode=()=>{const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789',bytes=crypto.getRandomValues(new Uint8Array(12)),part=(from)=>Array.from(bytes.slice(from,from+4),n=>alphabet[n%alphabet.length]).join('');return `DLIFE-${part(0)}-${part(4)}-${part(8)}`;};
if($('#sync-code'))$('#sync-code').value=savedSyncCode();

async function connectCode(code){
  if(busy)return;
  busy=true;
  $('#sync-code-status').textContent='Подключаем защищённое пространство…';
  try{
    let local=null;
    try{const raw=JSON.parse(localStorage.getItem('dlife-local-state-v1')||'null');if(validateState(raw?.state))local=normalize(raw.state);}catch{}
    const weight=s=>(s?.blocks?.length||0)+(s?.items?.length||0)+(s?.logs?.length||0)+(s?.practices?.length||0)+Object.keys(s?.done||{}).length+Object.keys(s?.steps||{}).length+Object.keys(s?.spherePlans||{}).length;
    const initial=local&&weight(local)>weight(state)?local:(state||local||emptyState());
    const result=await joinSyncCode(code,initial);
    $('#sync-code').value=String(code).toUpperCase();
    $('#sync-code-status').textContent=result?.created?'Код создан. Сохрани его — синхронизация включена.':result?.imported?'Локальные данные перенесены в облако. Загружаем их…':'Вход выполнен. Загружаем данные с другого устройства…';
    setTimeout(()=>location.reload(),700);
  }catch(error){$('#sync-code-status').textContent=error.message;}
  finally{busy=false;}
}
$('#sync-code-create')?.addEventListener('click',()=>{const code=makeCode();$('#sync-code').value=code;connectCode(code);});
$('#sync-code-join')?.addEventListener('click',()=>connectCode($('#sync-code').value));
$('#sync-code-copy')?.addEventListener('click',async()=>{const code=$('#sync-code').value.trim();if(!code)return $('#sync-code-status').textContent='Сначала создай или введи код.';try{await navigator.clipboard.writeText(code);$('#sync-code-status').textContent='Код скопирован.';}catch{$('#sync-code-status').textContent='Код: '+code;}});
$('#sync-code-disable')?.addEventListener('click',()=>{disableCodeSync();$('#sync-code-status').textContent='Синхронизация отключена только на этом устройстве.';setTimeout(()=>location.reload(),500);});

function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
}

function render() {
  if (!state) return;
  $('#coin-balance').textContent = new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2}).format(coinTotal(state));
  updateTiles(state);
}

// Привычки и цели на сегодня отмечаются прямо на главной.
async function saveToday(next) {
  try {
    state = normalize(await store.save(next));
    render();
    $('#home-status').textContent = '';
    return true;
  } catch (e) {
    $('#home-status').textContent = e.message;
    return false;
  }
}

try {
  state = normalize(await store.load());
  render();
  if ($('#today')) mountToday({root: $('#today'), getState: () => state, save: saveToday});
  // Свежие шаги и калории с Apple Watch (если часы подключены в «Здоровье»).
  pullWatch(() => state, saveToday);
  // Разовая правка по просьбе Дениса: 26.10.2026 случайно добавлено 2 × 100 ккал сожжённых (было 255 → 55).
  if (state.calories?.['2026-10-26'] === 255 && await saveToday({...state, calories: {...state.calories, '2026-10-26': 55}}))
    $('#home-status').textContent = 'Убрал лишние 200 ккал за 26 октября.';
} catch (e) {
  $('#home-status').textContent = e.message;
}

// Вода и сожжённые калории добавляются прямо с плитки: кнопка открывает поле для числа.
const tileButtons = {};
$('.home-tiles')?.addEventListener('click', e => {
  const open = e.target.closest('[data-tile-open]'), cancel = e.target.closest('[data-tile-cancel]');
  if (open) {
    const box = open.closest('.tile-actions'), kind = open.dataset.tileOpen;
    tileButtons[kind] = box.innerHTML;
    box.innerHTML = tileForm(kind);
    box.querySelector('input').focus();
  } else if (cancel) {
    const form = cancel.closest('form');
    form.parentElement.innerHTML = tileButtons[form.dataset.tileForm];
  }
});
$('.home-tiles')?.addEventListener('submit', async e => {
  e.preventDefault();
  const form = e.target, kind = form.dataset.tileForm, mode = e.submitter?.value || 'add';
  const next = state && tileChange(state, kind, form.amount.value, mode);
  if (!next) return;
  form.querySelectorAll('button,input').forEach(el => (el.disabled = true));
  if (await saveToday(next)) form.parentElement.innerHTML = tileButtons[kind];
  else form.querySelectorAll('button,input').forEach(el => (el.disabled = false));
});
