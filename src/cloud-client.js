import {createClient} from '@supabase/supabase-js';
import {DMONEY_URL,DMONEY_ANON_KEY} from './dmoney-config.js';
let client;
const defaultConfig=DMONEY_URL.startsWith('https://')&&DMONEY_ANON_KEY&&!DMONEY_ANON_KEY.startsWith('__')?{url:DMONEY_URL,key:DMONEY_ANON_KEY}:null;
export function cloudConfig(){try{return JSON.parse(localStorage.getItem('dlife-cloud')||'null')||defaultConfig;}catch{return defaultConfig;}}
export function cloudClient(){
  const c=cloudConfig();
  if(!c)return null;
  try {
    if (!localStorage.getItem('dlife-supabase-session')) {
      const shared = localStorage.getItem('dhabits-dmoney-auth') || localStorage.getItem('sb-fzabpzvsgshbdoahcjnn-auth-token');
      if (shared) localStorage.setItem('dlife-supabase-session', shared);
    }
  } catch {}
  client??=createClient(c.url,c.key,{auth:{persistSession:true,autoRefreshToken:true,storageKey:'dlife-supabase-session'}});
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
export async function cloudUser(){
  const c=cloudClient();
  if(!c)return null;
  try {
    const {data:sessionData} = await c.auth.getSession();
    if(sessionData?.session?.user) return sessionData.session.user;
  } catch {}
  const {data,error}=await c.auth.getUser();
  if(error)return null;
  return data.user;
}
