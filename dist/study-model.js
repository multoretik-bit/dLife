import { CATALOG, CATALOG_VERSION, withAdditions } from './library-catalog.js';
export const VIDEO_URL = 'https://kinogomy.net/cartoons/555-griffiny-hd-mvisionstv13-v54.html';
export const DLANG_URL = 'https://den-english-10000.tivishka.chatgpt.site';
export const HISTORY_NOTION_URL = 'https://app.notion.com/p/24c8171a481c80cb8553e9ca2723c9c0';
// Сохранённый список дополняется книгами, вошедшими в каталог позже (один раз — до первой записи с новой версией).
export function library(state) {
  const study = state.study;
  if (!study?.books) return CATALOG;
  return (study.catalogVersion ?? 1) < CATALOG_VERSION ? withAdditions(study.books) : study.books;
}
export function changeStudy(state, change) {
  const next=structuredClone(state);
  next.study={...next.study,books:structuredClone(library(state)),catalogVersion:CATALOG_VERSION};
  change(next.study); return next;
}
export function safeURL(value) { try {const u=new URL(value); return u.protocol==='https:'&&!u.username&&!u.password?u.href:'';} catch{return '';} }
export function validateStudy(s) {
  if (s===undefined) return true;
  const str=(v,n)=>typeof v==='string'&&v.length<=n;
  if(!s||typeof s!=='object'||Array.isArray(s))return false;
  if(s.books!==undefined&&(!Array.isArray(s.books)||s.books.length>2000||new Set(s.books.map(b=>b?.id)).size!==s.books.length||s.books.some(b=>!b||!str(b.id,80)||!b.id||!str(b.title,250)||!b.title.trim()||!str(b.author,250)||!str(b.category,100)||!str(b.year,60)||!['planned','reading','read'].includes(b.status)||!str(b.notes,5000)||(b.notion!==undefined&&(!str(b.notion,2000)||(b.notion!==''&&!safeURL(b.notion)))))))return false;
  if(s.catalogVersion!==undefined&&(!Number.isInteger(s.catalogVersion)||s.catalogVersion<1||s.catalogVersion>1000))return false;
  if(s.english!==undefined){const e=s.english;if(!e||!Number.isInteger(e.season)||e.season<1||e.season>100||!Number.isInteger(e.episode)||e.episode<1||e.episode>1000||!str(e.position,30)||!str(e.notes,10000))return false;}
  if(s.resources!==undefined&&(!Array.isArray(s.resources)||s.resources.length>300||new Set(s.resources.map(r=>r?.id)).size!==s.resources.length||s.resources.some(r=>!r||!str(r.id,80)||!r.id||!str(r.title,150)||!r.title.trim()||!str(r.url,2000)||!safeURL(r.url)||!/^([1-9]|10)$/.test(r.sphereId))))return false;
  return true;
}
