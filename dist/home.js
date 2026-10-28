import {ScheduleStore} from './store.js';
import {cloudClient,cloudConfig,configureCloud,cloudEnabled,cloudUser,joinSyncCode,codeSyncEnabled,savedSyncCode,disableCodeSync,dcapitalClient} from './cloud.js';
import {dateKey,emptyState,validateState} from './schedule.js';
import {coinTotal,normalize} from './development.js';
import {mountToday} from './today.js';
import {updateTiles, tileForm, tileChange} from './tiles.js';
import {applySeeds} from './seeds.js';
import {mountBars} from './bars.js';
import {pullWatch, WATCH_ENABLED, undoWatchDay} from './watch.js';

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
  // Разовые добавления (вечерняя учёба) — до отрисовки, чтобы сразу были видны.
  const seeded = applySeeds(state);
  if (seeded && await saveToday(seeded)) $('#home-status').textContent = 'Добавил прогресс-бары: 50 отжиманий и по 30 минут истории, испанского и английского.';
  render();
  // Прогресс дня (отжимания, минуты учёбы по таймеру) и «Сегодня» обновляют друг друга: полный бар отмечает привычку.
  let todayView = null, barsView = null;
  if ($('#bars')) barsView = mountBars({root: $('#bars'), getState: () => state, save: async next => { const ok = await saveToday(next); todayView?.render(); return ok; }, onError: msg => { $('#home-status').textContent = msg; }});
  if ($('#today')) todayView = mountToday({root: $('#today'), getState: () => state, save: async next => { const ok = await saveToday(next); barsView?.render(); return ok; }});
  // Свежие шаги и калории с Apple Watch (если часы подключены в «Здоровье»).
  if (WATCH_ENABLED) pullWatch(() => state, saveToday);
  else { const fixed = undoWatchDay(state); if (fixed && await saveToday(fixed)) $('#home-status').textContent = 'Вернул калории за 26 октября: 55 ккал.'; }
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

$('#export-data')?.addEventListener('click', async () => {
  try {
    const data = await new ScheduleStore().load();
    const url = URL.createObjectURL(new Blob([JSON.stringify({format: 'dlife-backup-v1', exportedAt: new Date().toISOString(), state: data}, null, 2)], {type: 'application/json'}));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'dlife-' + dateKey() + '.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (e) {
    $('#home-status').textContent = e.message;
  }
});

function openCloudDialog() {
  const c = cloudConfig();
  if ($('#cloud-url')) $('#cloud-url').value = c?.url || '';
  if ($('#cloud-key')) $('#cloud-key').value = c?.key || '';
  $('#cloud-status').textContent = codeSyncEnabled() ? 'Синхронизация по коду активна.' : cloudEnabled() ? 'Хранилище: Supabase (синхронизация активна)' : 'Хранилище: dLife. Создай код для синхронизации.';
  $('#cloud-dialog')?.showModal();
}

$('#open-cloud')?.addEventListener('click', openCloudDialog);

$('#cloud-config')?.addEventListener('submit', e => {
  e.preventDefault();
  try {
    if (cloudEnabled()) throw Error('Нельзя менять проект при активной синхронизации. Сначала сохрани резервную копию.');
    configureCloud($('#cloud-url').value, $('#cloud-key').value.trim());
    $('#cloud-status').textContent = 'Подключение сохранено. Войди в свой аккаунт.';
  } catch (e) {
    $('#cloud-status').textContent = e.message;
  }
});

$('#cloud-login')?.addEventListener('submit', async e => {
  e.preventDefault();
  const c = cloudClient();
  if (!c) {
    $('#cloud-status').textContent = 'Сначала укажи проект Supabase.';
    return;
  }
  $('#cloud-status').textContent = 'Входим в dMoney…';
  const email = $('#cloud-email').value.trim();
  const password = $('#cloud-password').value;
  const {data, error} = await c.auth.signInWithPassword({email, password});
  $('#cloud-password').value = '';
  if (error) {
    $('#cloud-status').textContent = 'Не удалось войти в dMoney: ' + error.message;
    return;
  }
  let syncMessage = '';
  if (savedSyncCode()) {
    try {
      await joinSyncCode(savedSyncCode(), state || emptyState());
      syncMessage = ' Код синхронизации привязан к аккаунту.';
    } catch (syncError) {
      syncMessage = ' Код синхронизации нужно подключить повторно: ' + syncError.message;
    }
  }
  $('#cloud-status').textContent = 'Вход выполнен.' + syncMessage;
  setTimeout(() => {
    $('#cloud-dialog')?.close();
  }, 1000);
  await capital();
});

$('#cloud-migrate')?.addEventListener('click', async () => {
  if (busy) return;
  busy = true;
  try {
    const user = await cloudUser();
    if (!user) throw Error('Сначала войди в Supabase / dMoney.');
    const c = cloudClient();
    const {data, error} = await c.from('dlife_state').select('payload,revision').eq('user_id', user.id).maybeSingle();
    if (error) throw error;
    if (!data) {
      const current = await new ScheduleStore().load();
      const result = await c.rpc('dlife_save', {p_payload: current, p_revision: 0});
      if (result.error) throw result.error;
    } else if (!confirm('В Supabase уже есть данные. Подключить их? Текущие данные dLife останутся в прежнем хранилище.')) return;
    localStorage.setItem('dlife-cloud-enabled', 'true');
    location.reload();
  } catch (e) {
    $('#cloud-status').textContent = 'Перенос не выполнен. ' + e.message;
  } finally {
    busy = false;
  }
});

$('#cloud-logout')?.addEventListener('click', async () => {
  await cloudClient()?.auth.signOut();
  $('#cloud-status').textContent = 'Выход из аккаунта синхронизации выполнен.';
  await capital();
});

const fallbackRates = {USD: 1, EUR: 0.8671, RUB: 83.274, KZT: 465.07, THB: 33.15, KGS: 87.49, GBP: 0.7516, TRY: 47.81, GEL: 2.61};
let ratesCache = null;

async function exchangeRates(baseCurrency = 'USD') {
  if (ratesCache && ratesCache.base === baseCurrency && ratesCache.exp > Date.now()) {
    return ratesCache.rates;
  }
  try {
    const r = await fetch(`https://open.er-api.com/v6/latest/${baseCurrency}`, {cache: 'no-store'});
    if (!r.ok) throw Error(String(r.status));
    const data = await r.json();
    if (data?.rates) {
      ratesCache = {base: baseCurrency, rates: data.rates, exp: Date.now() + 5 * 60_000};
      return data.rates;
    }
  } catch {}
  return fallbackRates;
}

async function capital() {
  const c = dcapitalClient(), {data: {user}} = await c.auth.getUser().catch(() => ({data: {user: null}}));
  if (!user) {
    $('#capital-value').textContent = '—';
    $('#capital-status').textContent = 'Войди в dCapital, чтобы видеть капитал';
    $('#capital-refresh').textContent = 'Войти в dCapital';
    return;
  }
  $('#capital-refresh').textContent = 'Обновить';
  $('#capital-status').textContent = 'Загружаю счета dCapital…';
  try {
    const [walletResult, assetResult, prefsResult] = await Promise.all([
      c.from('wallets').select('balance,currency'),
      c.from('assets').select('estimated_value,currency'),
      c.from('user_preferences').select('base_currency').eq('user_id', user.id).maybeSingle(),
    ]);
    if (walletResult.error) throw walletResult.error;
    const wallets = walletResult.data || [], assets = assetResult.error ? [] : assetResult.data || [];
    const base = prefsResult.data?.base_currency || 'USD', rates = await exchangeRates(base);
    const inBase = (amount, currency) => {
      const rate = !currency || currency === base ? 1 : Number(rates[currency]);
      return Number.isFinite(rate) && rate > 0 ? Number(amount || 0) / rate : 0;
    };
    const money = wallets.reduce((sum, w) => sum + inBase(w.balance, w.currency), 0);
    const property = assets.reduce((sum, a) => sum + inBase(a.estimated_value, a.currency), 0);
    const fmt = n => new Intl.NumberFormat('ru-RU', {maximumFractionDigits: 0}).format(Math.round(n));
    $('#capital-value').textContent = `${fmt(money)} ${base}`;
    const time = new Date().toLocaleTimeString('ru-RU', {hour: '2-digit', minute: '2-digit'});
    $('#capital-status').textContent = `${wallets.length} ${plural(wallets.length, 'счёт', 'счёта', 'счетов')}${property ? ` · имущество ≈ ${fmt(property)} ${base}` : ''} · обновлено в ${time}`;
  } catch (e) {
    $('#capital-status').textContent = 'Не удалось прочитать dCapital: ' + e.message;
  }
}

$('#dcapital-login')?.addEventListener('submit', async e => {
  e.preventDefault();
  $('#dcapital-status').textContent = 'Вхожу в dCapital…';
  const {error} = await dcapitalClient().auth.signInWithPassword({email: $('#dcapital-email').value.trim(), password: $('#dcapital-password').value});
  $('#dcapital-password').value = '';
  if (error) { $('#dcapital-status').textContent = 'Не получилось войти: ' + error.message; return; }
  $('#dcapital-status').textContent = 'Готово! Капитал подключён.';
  setTimeout(() => $('#dcapital-dialog')?.close(), 700);
  await capital();
});

$('#dcapital-logout')?.addEventListener('click', async () => {
  await dcapitalClient().auth.signOut();
  $('#dcapital-status').textContent = 'Вышел из dCapital на этом устройстве.';
  await capital();
});

$('#capital-refresh')?.addEventListener('click', async () => {
  const {data: {user}} = await dcapitalClient().auth.getUser().catch(() => ({data: {user: null}}));
  if (!user) {
    $('#dcapital-status').textContent = '';
    $('#dcapital-dialog')?.showModal();
    return;
  }
  await capital();
});

capital();
