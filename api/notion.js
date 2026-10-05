const ROOTS={history:'24c8171a481c80cb8553e9ca2723c9c0',english:'24a8171a481c8006a863f5ed3934c410'};
const compact=id=>String(id||'').replaceAll('-','');
const uuid=id=>/^[a-f0-9]{32}$/i.test(compact(id));
const plain=a=>(Array.isArray(a)?a:[]).map(t=>t.plain_text||t.text?.content||'').join('');
export default async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');
  const send=(status,message)=>res.status(status).json({message});
  if(req.method!=='POST')return send(405,'Используй кнопку загрузки заметок.');
  const origin=req.headers.origin;
  let originHost;try{originHost=new URL(origin).host;}catch{return send(403,'Открой заметки через dLife.');}
  if(originHost!==req.headers.host)return send(403,'Открой заметки через dLife.');
  const {NOTION_TOKEN,NOTION_ALLOWED_USER_IDS,DMONEY_SUPABASE_URL,DMONEY_SUPABASE_ANON_KEY}=process.env;
  if(!NOTION_TOKEN||!NOTION_ALLOWED_USER_IDS||!DMONEY_SUPABASE_URL||!DMONEY_SUPABASE_ANON_KEY)return send(503,'Живое подключение Notion ещё не настроено для dLife. Оригиналы заметок доступны по ссылке выше.');
  const bearer=req.headers.authorization;if(!bearer?.startsWith('Bearer '))return send(401,'Войди в синхронизацию dLife.');
  try{
    const auth=await fetch(`${DMONEY_SUPABASE_URL}/auth/v1/user`,{headers:{apikey:DMONEY_SUPABASE_ANON_KEY,Authorization:bearer},signal:AbortSignal.timeout(10000)});
    if(!auth.ok)return send(401,'Сессия завершилась. Войди в синхронизацию dLife снова.');
    const user=await auth.json();
    if(!NOTION_ALLOWED_USER_IDS.split(',').map(s=>s.trim()).includes(user.id))return send(403,'Для этого аккаунта доступ к личным заметкам не настроен.');
    const data=typeof req.body==='string'?JSON.parse(req.body):req.body;
    if(!data||!Object.hasOwn(ROOTS,data.topic)||(data.id&&!uuid(data.id))||(data.cursor&&!uuid(data.cursor)))return send(400,'Некорректный запрос заметок.');
    const root=ROOTS[data.topic],id=data.id||root;
    async function notion(path){
      const r=await fetch('https://api.notion.com/v1/'+path,{headers:{Authorization:`Bearer ${NOTION_TOKEN}`,'Notion-Version':'2022-06-28'},signal:AbortSignal.timeout(12000)});
      if(!r.ok){const error=new Error(r.status===429?'Notion ограничил частоту запросов. Попробуй через минуту.':'Notion не дал прочитать страницу. Проверь доступ интеграции к разделу.');error.status=r.status===429?429:502;throw error;}return r.json();
    }
    // Every requested block must be descended from the selected topic, including nested pages.
    let current=id,authorized=false;
    for(let depth=0;depth<24;depth++){
      if(compact(current)===compact(root)){authorized=true;break;}
      const block=await notion(`blocks/${current}`),parent=block.parent;
      current=parent?.block_id||parent?.page_id;
      if(!current)break;
    }
    if(!authorized)return send(403,'Эта страница не относится к выбранному разделу.');
    const result=await notion(`blocks/${id}/children?page_size=100${data.cursor?'&start_cursor='+encodeURIComponent(data.cursor):''}`);
    if(!data.id){
      const pages=[{id:root,title:data.topic==='history'?'Все записи по истории':'Все записи по английскому'},...result.results.filter(b=>b.type==='child_page').map(b=>({id:b.id,title:b.child_page.title}))];
      return res.status(200).json({pages});
    }
    const blocks=result.results.map(b=>({id:b.id,type:b.type,hasChildren:b.has_children,text:plain(b[b.type]?.rich_text)||b.child_page?.title||b.child_database?.title||(b.type==='image'?'Изображение — смотри в оригинале Notion':b.type==='divider'?'────────':`[${b.type}]`)}));
    return res.status(200).json({blocks,nextCursor:result.has_more?result.next_cursor:null});
  }catch(e){return send(e.status||502,e.status?e.message:'Не удалось загрузить Notion. Попробуй ещё раз.');}
}
