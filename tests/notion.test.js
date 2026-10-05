import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/notion.js';
function response(){return {code:200,body:null,setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;return this;}};}
test('Notion endpoint rejects foreign origins and missing server configuration',async()=>{
 let res=response();await handler({method:'POST',headers:{origin:'https://elsewhere.test',host:'dlife.test'}},res);assert.equal(res.code,403);
 res=response();await handler({method:'POST',headers:{origin:'not a url',host:'dlife.test'}},res);assert.equal(res.code,403);
 res=response();await handler({method:'GET',headers:{}},res);assert.equal(res.code,405);
 res=response();await handler({method:'POST',headers:{origin:'https://dlife.test',host:'dlife.test'}},res);assert.equal(res.code,503);
});
test('Notion requires an allowed authenticated user before requesting private content',async()=>{
 const names=['NOTION_TOKEN','NOTION_ALLOWED_USER_IDS','DMONEY_SUPABASE_URL','DMONEY_SUPABASE_ANON_KEY'],old=names.map(k=>process.env[k]);
 const originalFetch=globalThis.fetch;let calls=0;
 try{
 names.forEach((k,i)=>process.env[k]=['test-not-real','owner','https://example.supabase.co','public'][i]);
 globalThis.fetch=async()=>{calls++;return Response.json({id:'other-user'});};
 const res=response();await handler({method:'POST',headers:{origin:'https://dlife.test',host:'dlife.test',authorization:'Bearer test'},body:{topic:'history'}},res);
 assert.equal(res.code,403);assert.equal(calls,1);
 }finally{globalThis.fetch=originalFetch;names.forEach((k,i)=>old[i]===undefined?delete process.env[k]:process.env[k]=old[i]);}
});
