import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG } from '../dist/library-catalog.js';
import { changeStudy, library, validateStudy, safeURL } from '../dist/study-model.js';
import { validateState, emptyState } from '../dist/schedule.js';
test('library catalog is a reading plan that keeps every imported book and its id',()=>{
 assert.equal(new Set(CATALOG.map(b=>b.id)).size,CATALOG.length);
 assert.ok(CATALOG.length>=270);
 assert.equal(CATALOG.filter(b=>/^library-\d+$/.test(b.id)).length,208);
 assert.ok(CATALOG.some(b=>b.id==='library-bible')&&CATALOG.some(b=>b.id==='library-spqr'));
 assert.equal(CATALOG.find(b=>b.id==='library-1').title,'Мастер и Маргарита');
 assert.equal(CATALOG.find(b=>b.id==='library-208').title,'Осознание');
 assert.ok(CATALOG.every(b=>b.category&&b.era));
 const russian=CATALOG.filter(b=>b.category==='Русская литература');
 assert.deepEqual([...new Set(russian.map(b=>b.era))].slice(0,2),['Золотой век · XIX век','Серебряный век · 1890–1920-е']);
 assert.deepEqual(russian.filter(b=>b.author==='Александр Пушкин').map(b=>b.title),['Повести Белкина','Капитанская дочка','Евгений Онегин']);
 assert.ok(CATALOG.some(b=>b.era==='Викторианская эпоха · 1837–1901'&&b.title==='Джейн Эйр'));
});
test('library updates preserve old state, persist removal and accept an empty library',()=>{
 const old={...emptyState(),spherePlans:{'10':{vision:'Учиться',deadline:'',tools:'',results:''}},study:undefined};
 const updated=changeStudy(old,s=>{s.books=s.books.filter(b=>b.id!=='library-1');s.books[0].status='reading';});
 assert.equal(library(old).length,CATALOG.length);assert.equal(library(updated).length,CATALOG.length-1);assert.equal(updated.spherePlans['10'].vision,'Учиться');assert.ok(validateState(updated));
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
test('a saved old list moves into the reading plan once, keeping statuses, removals and own books',()=>{
 // Список первой версии: без Библии и SPQR, «Мастер и Маргарита» прочитана, «Мы» удалена, плюс две свои книги.
 const v1=CATALOG.filter(b=>/^library-\d+$/.test(b.id)).map(({era,...b})=>({...b,category:'Старая категория'}));
 const books=[{id:'my-1',title:'Моя книга',author:'Я',year:'',category:'Мои книги',status:'planned',notes:''},{id:'my-2',title:'Капитанская дочка',author:'А. С. Пушкин',year:'',category:'Мои книги',status:'read',notes:''},
   ...v1.filter(b=>b.title!=='Мы').map(b=>b.id==='library-1'?{...b,status:'read',notion:'https://app.notion.com/p/0123456789abcdef0123456789abcdef'}:b)];
 const saved={...emptyState(),study:{books}};
 assert.ok(validateState(saved));
 const lib=library(saved);
 const master=lib.find(b=>b.id==='library-1');
 assert.equal(master.status,'read');assert.ok(master.notion);assert.equal(master.category,'Русская литература');assert.equal(master.era,'Советская эпоха · 1920–1960-е');
 assert.ok(!lib.some(b=>b.title==='Мы'));
 assert.ok(lib.some(b=>b.id==='library-bible'));
 assert.equal(lib.filter(b=>b.title==='Капитанская дочка').length,1);
 assert.equal(lib.find(b=>b.title==='Капитанская дочка').id,'my-2');assert.equal(lib.find(b=>b.id==='my-2').status,'read');
 assert.equal(lib.at(-1).id,'my-1');assert.equal(lib.at(-1).category,'Мои книги');
 assert.equal(lib.length,CATALOG.length);
 const next=changeStudy(saved,s=>{s.books=s.books.filter(b=>b.id!=='library-bible');});
 assert.equal(next.study.catalogVersion,3);assert.ok(validateState(next));
 assert.ok(!library(next).some(b=>b.id==='library-bible'));
 assert.equal(library(next).length,CATALOG.length-1);
});
test('a version 2 list does not get v2 additions back after the move',()=>{
 const v2=CATALOG.filter(b=>!b.id.startsWith('lib3-')&&b.id!=='library-spqr').map(({era,...b})=>b);
 const lib=library({...emptyState(),study:{books:v2,catalogVersion:2}});
 assert.ok(!lib.some(b=>b.id==='library-spqr'));
 assert.ok(lib.some(b=>b.id.startsWith('lib3-')));
 assert.equal(validateStudy({books:[{...CATALOG[0],era:'x'.repeat(200)}]}),false);
});
test('daily burned calories are stored per date as whole numbers',()=>{
 assert.ok(validateState({...emptyState(),calories:{'2026-10-08':320}}));
 assert.equal(validateState({...emptyState(),calories:{'2026-10-08':-5}}),false);
 assert.equal(validateState({...emptyState(),calories:{'2026-10-08':12.5}}),false);
 assert.equal(validateState({...emptyState(),calories:{'вчера':100}}),false);
});
