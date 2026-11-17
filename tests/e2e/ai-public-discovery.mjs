import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const publicDir=path.join(root,'public');
const artifacts=path.join(root,'artifacts','ai-public-discovery-qa');
const identities=[
 {identity_id:'22222222-2222-4222-8222-222222222222',population:'independent',category_key:'ai_educators',
  name:{first_name:'Nia',last_name:'Campbell',display_name:'Nia Campbell',username:'nia_campbell'},
  profile:{gender:'female',nationality:'Jamaican',current_country:'JM',city:'Kingston',profession:'Educator',bio:'AI-labelled learning and study support.'},
  languages:[{language_tag:'en-JM',language_name:'English (Jamaica)'}],follower_count:4,is_following:false,follow_requested:false},
 {identity_id:'33333333-3333-4333-8333-333333333333',population:'independent',category_key:'ai_friends',
  name:{first_name:'Jay',last_name:'Reid',display_name:'Jay Reid',username:'jay_reid'},
  profile:{gender:'male',current_country:'JM',city:'Montego Bay',profession:'Community host',bio:'AI-labelled community companion.'},
  languages:[{language_tag:'en'}],follower_count:2,is_following:false,follow_requested:false}
];
let followed=new Set(),groups=[],queries=[],bulkCalls=[],reviewCalls=[];
let pendingRequests=[{follow_id:'55555555-5555-4555-8555-555555555555',identity_id:'22222222-2222-4222-8222-222222222222',name:{display_name:'Nia Campbell'}}];
function json(res,data,status=200){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url||'/','http://127.0.0.1');
 if(url.pathname.startsWith('/api/ai-discovery')){
  let body={};if(['POST','PATCH','DELETE'].includes(req.method||'')){const chunks=[];for await(const chunk of req)chunks.push(chunk);body=chunks.length?JSON.parse(Buffer.concat(chunks).toString('utf8')):{};}
  const p=url.pathname.slice('/api/ai-discovery'.length)||'/';
  if(req.method==='GET'&&p==='/'){
   const filters=JSON.parse(url.searchParams.get('filters')||'{}');queries.push(filters);
   return json(res,{identities:identities.map(item=>({...item,is_following:followed.has(item.identity_id)})),total:identities.length,hasMore:false});
  }
  if(req.method==='GET'&&p==='/following')return json(res,{following:[...followed].map(id=>({identity_id:id,follow_status:'active',name:{display_name:identities.find(x=>x.identity_id===id)?.name.display_name}}))});
  if(req.method==='GET'&&p==='/saved-groups')return json(res,{groups});
  if(req.method==='GET'&&p==='/follow-requests')return json(res,{requests:pendingRequests});
  if(req.method==='POST'&&p==='/follows'){followed.add(body.identity_id);return json(res,{follow_status:'active'});}
  if(req.method==='PATCH'&&p.startsWith('/follow-requests/')){reviewCalls.push(body);pendingRequests=[];return json(res,{follow_status:body.decision==='approve'?'active':'declined'});}
  if(req.method==='DELETE'&&p.startsWith('/follows/')){followed.delete(p.split('/').at(-1));return json(res,{unfollowed:true});}
  if(req.method==='POST'&&p==='/follows/bulk'){bulkCalls.push(body);body.identity_ids.forEach(id=>followed.add(id));return json(res,{created_or_reused:body.identity_ids.length});}
  if(req.method==='POST'&&p==='/saved-groups'){const group={group_id:'44444444-4444-4444-8444-444444444444',group_name:body.group_name,filters:body.filters};groups=[group];return json(res,{group_id:group.group_id});}
  if(req.method==='DELETE'&&p.startsWith('/saved-groups/')){groups=[];return json(res,{deleted:true});}
  return json(res,{error:'Not found'},404);
 }
 const relative=decodeURIComponent(url.pathname).replace(/^\/+/, '')||'index.html';
 const file=path.resolve(publicDir,relative);
 if(!file.startsWith(publicDir+path.sep))return json(res,{error:'Forbidden'},403);
 fs.readFile(file,(error,data)=>{if(error){res.writeHead(404);res.end('Not found');return;}const ext=path.extname(file);const type=ext==='.html'?'text/html':ext==='.css'?'text/css':'text/javascript';res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store'});res.end(data);});
});
await fs.promises.rm(artifacts,{recursive:true,force:true});await fs.promises.mkdir(artifacts,{recursive:true});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1280,height:900},serviceWorkers:'block'});
 const pageErrors=[];page.on('pageerror',error=>pageErrors.push(error.message));
 await page.goto(base+'/ai-discovery.html',{waitUntil:'domcontentloaded'});
 await page.locator('#ai-discovery-results-list [data-identity-id]').first().waitFor();
 assert.equal(await page.locator('#ai-discovery-countries option').count(),249,'All country and territory options must render.');
 await page.locator('#ai-discovery-country-search').fill('Jamaica');
 await page.waitForFunction(()=>document.querySelector('#ai-discovery-countries option[value="JM"]')?.hidden===false);
 await page.locator('#ai-discovery-countries').selectOption('JM');
 await page.locator('#ai-discovery-country-search').fill('');
 assert.equal(await page.locator('.ai-discovery-profile').count(),2);
 assert.ok(await page.getByText('AI PROFILE').count()>=2);
 await page.locator('#ai-discovery-filters [name="search"]').fill('Nia');
 await page.locator('#ai-discovery-filters [name="genders"]').selectOption('female');
 await page.locator('#ai-discovery-filters [name="countries"]').selectOption('JM');
 await page.locator('#ai-discovery-filters [name="category_keys"]').selectOption('ai_educators');
 await page.getByRole('button',{name:'Apply filters'}).click();
 await page.getByText('Showing public AI profiles from Minglora.').waitFor();
 assert.equal(queries.at(-1).search,'Nia');
 assert.deepEqual(queries.at(-1).genders,['female']);
 assert.deepEqual(queries.at(-1).countries,['JM']);
 assert.deepEqual(queries.at(-1).category_keys,['ai_educators']);
 await page.locator('[data-follow="22222222-2222-4222-8222-222222222222"]').click();
 await page.getByText('You are now following this AI profile.').waitFor();
 assert.ok(followed.has('22222222-2222-4222-8222-222222222222'));
 await page.locator('#ai-discovery-save [name="group_name"]').fill('Jamaican educators');
 await page.getByRole('button',{name:'Save search group'}).click();
 await page.getByText('Jamaican educators').waitFor();
 assert.equal(groups.length,1);
 await page.locator('[data-review-follow="55555555-5555-4555-8555-555555555555"][data-decision="approve"]').click();
 await page.getByText('AI profile follow request approved.').waitFor();
 assert.equal(reviewCalls[0].decision,'approve');
 await page.locator('[data-apply-group="'+groups[0].group_id+'"]').click();
 await page.locator('#ai-discovery-filters [name="search"]').waitFor();
 const savedFilter=await page.locator('#ai-discovery-filters [name="search"]').inputValue();
 assert.equal(savedFilter,'Nia');
 const checkboxes=page.locator('[data-select-identity]');
 await checkboxes.first().check();
 await checkboxes.nth(1).check();
 await page.getByRole('button',{name:'Follow selected (max 100)'}).click();
 assert.equal(bulkCalls.length,1);
 assert.equal(bulkCalls[0].identity_ids.length,2);
 await page.screenshot({path:path.join(artifacts,'desktop-discover-ai.png'),fullPage:true});
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:path.join(artifacts,'mobile-discover-ai.png'),fullPage:true});
 await page.locator('[data-unfollow="22222222-2222-4222-8222-222222222222"]').first().click();
 assert.equal(followed.has('22222222-2222-4222-8222-222222222222'),false);
 assert.equal(groups.length,1);
 assert.deepEqual(pageErrors,[],'Public discovery page must not throw browser errors.');
 console.log(JSON.stringify({status:'passed',countryOptions:249,publicProfiles:2,filterCalls:queries.length,followed:followed.size,bulkRequests:bulkCalls.length,savedGroups:groups.length,followRequestsReviewed:reviewCalls.length,screenshots:2},null,2));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
