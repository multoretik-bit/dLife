import {ScheduleStore} from './store.js';
import {cloudClient,cloudConfig,configureCloud,cloudEnabled,cloudUser,joinSyncCode,codeSyncEnabled,savedSyncCode,disableCodeSync} from './cloud.js';
import {dateKey,emptyState,validateState} from './schedule.js';
import {coinTotal,normalize} from './development.js';

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

function render() {
  if (!state) return;
  $('#steps-value').textContent = new Intl.NumberFormat('ru-RU').format(state.steps[dateKey()] || 0);
  $('#steps-input').value = state.steps[dateKey()] || '';
  $('#useful-value').textContent = state.logs.filter(l => l.date === dateKey()).reduce((n, l) => n + l.minutes, 0) + ' мин';
  $('#coin-balance').textContent = coinTotal(state);
}

try {
  state = normalize(await store.load());
  render();
} catch (e) {
  $('#home-status').textContent = e.message;
}

$('#steps-form')?.addEventListener('submit', async e => {
  e.preventDefault();
  if (!state || busy) return;
  busy = true;
  try {
    const next = structuredClone(state);
    next.steps[dateKey()] = Number($('#steps-input').value);
    state = normalize(await store.save(next));
    render();
    $('#home-status').textContent = 'Шаги сохранены';
  } catch (e) {
    $('#home-status').textContent = e.message;
  } finally {
    busy = false;
  }
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
  $('#cloud-status').textContent = 'Вход выполнен! Капитал подключён.' + syncMessage;
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
  $('#cloud-status').textContent = 'Выход выполнен. Для чтения капитала dMoney войди снова.';
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
  const user = await cloudUser();
  if (!user) {
    $('#capital-value').textContent = '—';
    $('#capital-status').textContent = 'Войди в аккаунт dMoney для показа капитала';
    $('#capital-refresh').textContent = 'Подключить dMoney';
    return;
  }

  $('#capital-refresh').textContent = 'Обновить dMoney ↗';
  $('#capital-status').textContent = 'Загружаем кошельки dMoney…';
  try {
    const c = cloudClient();
    const [walletResult, prefsResult] = await Promise.all([
      c.from('wallets').select('balance,currency'),
      c.from('user_preferences').select('base_currency').eq('user_id', user.id).maybeSingle()
    ]);

    if (walletResult.error) throw walletResult.error;
    const wallets = walletResult.data || [];
    if (!wallets.length) {
      $('#capital-value').textContent = '0';
      $('#capital-status').textContent = 'В этом аккаунте нет кошельков dMoney';
      return;
    }

    const baseCurrency = prefsResult.data?.base_currency || 'USD';
    const rates = await exchangeRates(baseCurrency);

    const total = wallets.reduce((sum, w) => {
      const amount = Number(w.balance || 0);
      const curr = w.currency || baseCurrency;
      const rate = curr === baseCurrency ? 1 : Number(rates[curr]);
      return sum + (Number.isFinite(rate) && rate > 0 ? amount / rate : 0);
    }, 0);

    const formatted = new Intl.NumberFormat('ru-RU', {maximumFractionDigits: 0}).format(Math.round(total));
    $('#capital-value').textContent = `${formatted} ${baseCurrency}`;
    const count = wallets.length;
    const countWord = count === 1 ? 'счёт' : count < 5 ? 'счёта' : 'счетов';
    const timeStr = new Date().toLocaleTimeString('ru-RU', {hour: '2-digit', minute: '2-digit'});
    $('#capital-status').textContent = `${count} ${countWord} · dMoney · ${timeStr}`;
  } catch (e) {
    $('#capital-status').textContent = 'Не удалось прочитать dMoney: ' + e.message;
  }
}

$('#capital-refresh')?.addEventListener('click', async () => {
  const user = await cloudUser();
  if (!user) {
    openCloudDialog();
    return;
  }
  await capital();
});

capital();
