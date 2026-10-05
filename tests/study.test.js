import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG } from '../dist/library-catalog.js';
import { changeStudy, library, validateStudy, safeURL } from '../dist/study-model.js';
import { validateState, emptyState } from '../dist/schedule.js';
test('complete library import preserves 208 unique books and eleven categories',()=>{
 assert.equal(CATALOG.length,208);assert.equal(new Set(CATALOG.map(b=>b.title)).size,208);assert.equal(new Set(CATALOG.map(b=>b.category)).size,11);assert.equal(CATALOG.filter(b=>b.category==='История').length,11);
});
test('library updates preserve old state, persist removal and accept an empty library',()=>{
 const old={...emptyState(),spherePlans:{'10':{vision:'Учиться',deadline:'',tools:'',results:''}},study:undefined};
 const updated=changeStudy(old,s=>{s.books=s.books.filter(b=>b.id!=='library-1');s.books[0].status='reading';});
 assert.equal(library(old).length,208);assert.equal(library(updated).length,207);assert.equal(updated.spherePlans['10'].vision,'Учиться');assert.ok(validateState(updated));
 assert.equal(library(changeStudy(updated,s=>s.books=[])).length,0);
});
test('new state rejects invalid books, unsafe links and malformed progress',()=>{
 const state=changeStudy(emptyState(),()=>{});assert.ok(validateState(state));
 state.study.books[0].status='invented';assert.equal(validateState(state),false);
 assert.equal(safeURL('javascript:alert(1)'), '');assert.equal(safeURL('https://user:secret@example.com'),'');
 assert.equal(validateStudy({english:{season:0,episode:1,position:'',notes:''}}),false);
 assert.equal(validateStudy({resources:[{id:'a',sphereId:'10',title:'X',url:'data:text/html,x'}]}),false);
});
