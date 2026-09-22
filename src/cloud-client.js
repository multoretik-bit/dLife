import {createClient} from '@supabase/supabase-js';
import {DMONEY_URL,DMONEY_ANON_KEY} from './dmoney-config.js';
let client;
let clientKey='';
const defaultConfig=DMONEY_URL.startsWith('https://')&&DMONEY_ANON_KEY&&!DMONEY_ANON_KEY.startsWith('__')?{url:DMONEY_URL,key:DMONEY_ANON_KEY}:null;
export function cloudConfig(){try{return JSON.parse(localStorage.getItem('dlife-cloud')||'null')||defaultConfig;}catch{return defaultConfig;}}
export function cloudClient(){
  const c=cloudConfig();
  if(!c)return null;
  const ref=new URL(c.url).hostname.split('.')[0];
  const storageKey=`dlife-supabase-session-${ref}`;
  try {
    if (ref==='fzabpzvsgshbdoahcjnn'&&!localStorage.getItem(storageKey)) {
      const shared = localStorage.getItem('dhabits-dmoney-auth') || localStorage.getItem('sb-fzabpzvsgshbdoahcjnn-auth-token');
      if (shared) localStorage.setItem(storageKey, shared);
    }
  } catch {}
  const nextKey=c.url+'|'+c.key;
  if(!client||clientKey!==nextKey){client=createClient(c.url,c.key,{auth:{persistSession:true,autoRefreshToken:true,storageKey}});clientKey=nextKey;}
  return client;
}
export function configureCloud(url,key){
  const parsed=new URL(url);
  if(parsed.protocol!=='https:'||!parsed.hostname.endsWith('.supabase.co'))throw Error('Укажи HTTPS-адрес проекта Supabase.');
  if(key.startsWith('sb_secret_'))throw Error('Используй публичный publishable / anon key, не secret key.');
  if(key.startsWith('eyJ')){try{const claims=JSON.parse(atob(key.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));if(claims.role!=='anon')throw Error();}catch{throw Error('Допустим только публичный anon key.');}}
  if(!key.startsWith('eyJ')&&!key.startsWith('sb_publishable_'))throw Error('Нужен publishable или anon key.');
  localStorage.setItem('dlife-cloud',JSON.stringify({url:parsed.origin,key}));
  client=null;
}
export const cloudEnabled=()=>localStorage.getItem('dlife-cloud-enabled')==='true';
export const codeSyncEnabled=()=>localStorage.getItem('dlife-code-enabled')==='true';
export const savedSyncCode=()=>localStorage.getItem('dlife-sync-code')||'';
export async function cloudUser(){
  const c=cloudClient();
  if(!c)return null;
  const {data,error}=await c.auth.getUser();
  if(error)return null;
  return data.user;
}
export async function joinSyncCode(code,initialState){
  const c=cloudClient();
  if(!c)throw Error('Проект Supabase не настроен.');
  let user=await cloudUser();
  if(!user){
    const {data,error}=await c.auth.signInAnonymously();
    if(error)throw Error('Не удалось создать устройство: '+error.message+'. Включи Anonymous Sign-Ins в Supabase Auth.');
    user=data.user;
  }
  const normalized=String(code||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  if(normalized.length<10||normalized.length>32)throw Error('Код должен содержать от 10 до 32 букв и цифр.');
  const {data,error}=await c.rpc('dlife_join_code',{p_code:normalized,p_initial:initialState});
  if(error)throw Error('Код не подключён: '+error.message);
  localStorage.setItem('dlife-sync-code',String(code).toUpperCase());
  localStorage.setItem('dlife-code-enabled','true');
  localStorage.removeItem('dlife-cloud-enabled');
  return data;
}
export function disableCodeSync(){localStorage.removeItem('dlife-code-enabled');}
