import {createClient} from '@supabase/supabase-js';
let client;
export function cloudConfig(){try{return JSON.parse(localStorage.getItem('dlife-cloud')||'null');}catch{return null;}}
export function cloudClient(){const c=cloudConfig();if(!c)return null;client??=createClient(c.url,c.key,{auth:{persistSession:true,autoRefreshToken:true,storageKey:'dlife-supabase-session'}});return client;}
export function configureCloud(url,key){const parsed=new URL(url);if(parsed.protocol!=='https:'||!parsed.hostname.endsWith('.supabase.co'))throw Error('Укажи HTTPS-адрес проекта Supabase.');if(key.startsWith('sb_secret_'))throw Error('Используй публичный publishable / anon key, не secret key.');if(key.startsWith('eyJ')){try{const claims=JSON.parse(atob(key.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));if(claims.role!=='anon')throw Error();}catch{throw Error('Допустим только публичный anon key.');}}if(!key.startsWith('eyJ')&&!key.startsWith('sb_publishable_'))throw Error('Нужен publishable или anon key.');localStorage.setItem('dlife-cloud',JSON.stringify({url:parsed.origin,key}));client=null;}
export const cloudEnabled=()=>localStorage.getItem('dlife-cloud-enabled')==='true';
export async function cloudUser(){const c=cloudClient();if(!c)return null;const {data,error}=await c.auth.getUser();if(error)return null;return data.user;}
