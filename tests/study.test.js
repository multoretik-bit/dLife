import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG } from '../dist/library-catalog.js';
import { changeStudy, library, validateStudy, safeURL } from '../dist/study-model.js';
import { validateState, emptyState } from '../dist/schedule.js';
test('library catalog keeps 208 imported books plus later additions in eleven categories',()=>{
 assert.equal(CATALOG.length,210);assert.equal(new Set(CATALOG.map(b=>b.title)).size,210);assert.equal(new Set(CATALOG.map(b=>b.category)).size,11);assert.equal(CATALOG.filter(b=>b.category==='История').length,12);
 assert.ok(CATALOG.some(b=>b.title==='Библия'&&b.category==='Мировая классика'));assert.ok(CATALOG.some(b=>b.title.startsWith('SPQR')&&b.category==='История'));
 assert.equal(CATALOG.find(b=>b.id==='library-208').title,'Осознание');
});
test('library updates preserve old state, persist removal and accept an empty library',()=>{
 const old={...emptyState(),spherePlans:{'10':{vision:'Учиться',deadline:'',tools:'',results:''}},study:undefined};
 const updated=changeStudy(old,s=>{s.books=s.books.filter(b=>b.id!=='library-1');s.books[0].status='reading';});
 assert.equal(library(old).length,210);assert.equal(library(updated).length,209);assert.equal(updated.spherePlans['10'].vision,'Учиться');assert.ok(validateState(updated));
 assert.equal(library(changeStudy(updated,s=>s.books=[])).length,0);
});
test('new state rejects invalid books, unsafe links and malformed progress',()=>{
 const state=changeStudy(emptyState(),()=>{});assert.ok(validateState(state));
 state.study.books[0].status='invented';assert.equal(validateState(state),false);
 assert.equal(safeURL('javascript:alert(1)'), '');assert.equal(safeURL('https://user:secret@example.com'),'');
 assert.equal(validateStudy({english:{season:0,episode:1,position:'',notes:''}}),false);
 assert.equal(validateStudy({resources:[{id:'a',sphereId:'10',title:'X',url:'data:text/html,x'}]}),false);
});
test('sphere plans accept yearly goals and reject malformed ones',()=>{
 const plan={vision:'',deadline:'',tools:'',results:''};
 const withGoals=goals=>({...emptyState(),spherePlans:{'10':{...plan,goals}}});
 assert.ok(validateState(withGoals([{id:'g1',text:'Прочитать 24 книги',done:false}])));
 assert.ok(validateState({...emptyState(),spherePlans:{'10':plan}}));
 assert.equal(validateState(withGoals([{id:'g1',text:'  ',done:false}])),false);
 assert.equal(validateState(withGoals([{id:'g1',text:'A',done:'yes'}])),false);
 assert.equal(validateState(withGoals([{id:'g1',text:'A',done:false},{id:'g1',text:'B',done:true}])),false);
});
test('books keep an optional https link to their Notion summary',()=>{
 const state=changeStudy(emptyState(),s=>{s.books[0].notion='https://app.notion.com/p/0123456789abcdef0123456789abcdef';s.books[1].notion='';});
 assert.ok(validateState(state));
 state.study.books[0].notion='javascript:alert(1)';assert.equal(validateState(state),false);
});
test('books saved before the catalog grew get the new books once, and a later removal sticks',()=>{
 const saved={...emptyState(),study:{books:CATALOG.filter(b=>!b.id.startsWith('library-bible')&&b.id!=='library-spqr').map(b=>b.id==='library-1'?{...b,status:'read'}:b)}};
 assert.ok(validateState(saved));
 assert.equal(library(saved).length,210);
 assert.equal(library(saved).find(b=>b.id==='library-1').status,'read');
 const next=changeStudy(saved,s=>{s.books=s.books.filter(b=>b.id!=='library-bible');});
 assert.equal(next.study.catalogVersion,2);assert.ok(validateState(next));
 assert.equal(library(next).length,209);assert.ok(!library(next).some(b=>b.id==='library-bible'));
});
test('daily burned calories are stored per date as whole numbers',()=>{
 assert.ok(validateState({...emptyState(),calories:{'2026-10-08':320}}));
 assert.equal(validateState({...emptyState(),calories:{'2026-10-08':-5}}),false);
 assert.equal(validateState({...emptyState(),calories:{'2026-10-08':12.5}}),false);
 assert.equal(validateState({...emptyState(),calories:{'вчера':100}}),false);
});
