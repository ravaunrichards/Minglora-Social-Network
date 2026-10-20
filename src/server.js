import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { db, saveStore, uid, now } from './store.js';
const scrypt = promisify(crypto.scrypt);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '..', 'public');
const PORT = Number(process.env.PORT || 3000);
const SESSION_SECRET = process.env.SESSION_SECRET || 'development-only-change-this-secret-before-deploying';
const MIME = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.webp':'image/webp' };
const safeUser = u => u && ({ id:u.id, name:u.name, username:u.username, bio:u.bio || '', location:u.location || '', avatar:u.avatar || '', cover:u.cover || '', createdAt:u.createdAt });
const json = (res, status, body, headers={}) => { res.writeHead(status, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', ...headers }); res.end(JSON.stringify(body)); };
const cookie = (req, name) => (req.headers.cookie || '').split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='))?.slice(name.length+1);
const sign = value => crypto.createHmac('sha256', SESSION_SECRET).update(value).digest('hex');
function sessionUser(req) {
  const raw = cookie(req, 'sid'); if (!raw) return null;
  const [id, sig] = decodeURIComponent(raw).split('.'); const expected = id ? sign(id) : ''; if (!id || !sig || sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  const session = db.sessions.find(s => s.id === id && new Date(s.expiresAt) > new Date());
  return session ? db.users.find(u => u.id === session.userId) || null : null;
}
async function body(req) {
  let raw=''; for await (const chunk of req) { raw += chunk; if (raw.length > 1_000_000) throw Object.assign(new Error('Request body too large'), {status:413}); }
  if (!raw) return {}; try { return JSON.parse(raw); } catch { throw Object.assign(new Error('Invalid JSON body'), {status:400}); }
}
const requireAuth = user => { if (!user) throw Object.assign(new Error('Sign in to continue.'), {status:401}); };
const notify = (userId, actorId, type, text) => db.notifications.unshift({ id:uid(), userId, actorId, type, text, createdAt:now(), read:false });
function publicPost(p, viewerId) {
  const author = db.users.find(u=>u.id===p.userId);
  return { ...p, author:safeUser(author), reactions:p.reactions || {}, reactionCount:Object.values(p.reactions || {}).length, myReaction:(p.reactions || {})[viewerId] || null,
    comments:(p.comments || []).map(c=>({...c, author:safeUser(db.users.find(u=>u.id===c.userId))})) };
}
async function route(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`); const p = url.pathname; const method = req.method;
  if (method === 'GET' && p === '/api/health') return json(res,200,{ok:true,service:'social-network',timestamp:now()});
  if (p.startsWith('/api/')) {
    let input; try { if (!['GET','HEAD'].includes(method)) input=await body(req); } catch(e) { return json(res,e.status||400,{error:e.message}); }
    const user = sessionUser(req);
    try {
      if (method==='POST' && p==='/api/auth/register') {
        const name=String(input.name||'').trim(), username=String(input.username||'').trim().toLowerCase(), email=String(input.email||'').trim().toLowerCase(), password=String(input.password||'');
        if (name.length<2 || username.length<3 || !/^[a-z0-9_]+$/.test(username) || !/^\S+@\S+\.\S+$/.test(email) || password.length<10) return json(res,400,{error:'Enter a name, username (3+ letters/numbers/underscores), valid email, and password of at least 10 characters.'});
        if (db.users.some(u=>u.email===email || u.username===username)) return json(res,409,{error:'That email or username is already registered.'});
        const salt=crypto.randomBytes(16).toString('hex'); const hash=(await scrypt(password,salt,64)).toString('hex'); const created={id:uid(),name,username,email,passwordHash:`${salt}:${hash}`,bio:'',location:'',avatar:'',cover:'',createdAt:now()}; db.users.push(created);
        const sid=uid(); db.sessions.push({id:sid,userId:created.id,expiresAt:new Date(Date.now()+7*86400000).toISOString()}); saveStore(); return json(res,201,{user:safeUser(created)},{'Set-Cookie':`sid=${encodeURIComponent(sid+'.'+sign(sid))}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${process.env.NODE_ENV==='production'?'; Secure':''}`});
      }
      if (method==='POST' && p==='/api/auth/login') {
        const email=String(input.email||'').trim().toLowerCase(), password=String(input.password||''); const found=db.users.find(u=>u.email===email);
        if (!found?.passwordHash) return json(res,401,{error:'Email or password is incorrect.'});
        const [salt, expected]=found.passwordHash.split(':'); const actual=(await scrypt(password,salt,64)).toString('hex'); if (actual.length!==expected.length || !crypto.timingSafeEqual(Buffer.from(actual),Buffer.from(expected))) return json(res,401,{error:'Email or password is incorrect.'});
        const sid=uid(); db.sessions.push({id:sid,userId:found.id,expiresAt:new Date(Date.now()+7*86400000).toISOString()}); saveStore(); return json(res,200,{user:safeUser(found)},{'Set-Cookie':`sid=${encodeURIComponent(sid+'.'+sign(sid))}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${process.env.NODE_ENV==='production'?'; Secure':''}`});
      }
      if (method==='POST' && p==='/api/auth/logout') { const sid=cookie(req,'sid'); if(sid){const id=decodeURIComponent(sid).split('.')[0]; db.sessions=db.sessions.filter(s=>s.id!==id); saveStore();} return json(res,200,{ok:true},{'Set-Cookie':'sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0'}); }
      if (method==='GET' && p==='/api/auth/me') return json(res,200,{user:safeUser(user)});
      requireAuth(user);
      if (method==='GET' && p==='/api/feed') return json(res,200,{posts:db.posts.slice().sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).map(x=>publicPost(x,user.id))});
      if (method==='POST' && p==='/api/posts') { const text=String(input.text||'').trim(), imageUrl=String(input.imageUrl||'').trim(); if(!text && !imageUrl)return json(res,400,{error:'Add text or an image URL to publish a post.'}); if(text.length>5000 || imageUrl.length>2000 || (imageUrl && !/^https:\/\//i.test(imageUrl)))return json(res,400,{error:'Post is too long or image URL is invalid. Use an HTTPS image URL.'}); const post={id:uid(),userId:user.id,text,imageUrl,createdAt:now(),reactions:{},comments:[]};db.posts.unshift(post);saveStore();return json(res,201,{post:publicPost(post,user.id)}); }
      let m=p.match(/^\/api\/posts\/([^/]+)\/reactions$/);
      if(method==='POST'&&m){const post=db.posts.find(x=>x.id===m[1]);if(!post)return json(res,404,{error:'Post not found.'});post.reactions ||= {};const reaction=String(input.reaction||'like');if(!['like','love','care','haha','wow','sad','angry'].includes(reaction))return json(res,400,{error:'Unsupported reaction.'});if(post.reactions[user.id]===reaction)delete post.reactions[user.id];else post.reactions[user.id]=reaction;if(post.userId!==user.id)notify(post.userId,user.id,'reaction',`${user.name} reacted to your post.`);saveStore();return json(res,200,{post:publicPost(post,user.id)});}
      m=p.match(/^\/api\/posts\/([^/]+)\/comments$/);
      if(method==='POST'&&m){const post=db.posts.find(x=>x.id===m[1]);const text=String(input.text||'').trim();if(!post)return json(res,404,{error:'Post not found.'});if(!text||text.length>2000)return json(res,400,{error:'Comment must contain 1–2000 characters.'});const comment={id:uid(),userId:user.id,text,createdAt:now()};post.comments.push(comment);if(post.userId!==user.id)notify(post.userId,user.id,'comment',`${user.name} commented on your post.`);saveStore();return json(res,201,{comment:{...comment,author:safeUser(user)}});}
      if(method==='GET'&&p==='/api/users')return json(res,200,{users:db.users.filter(u=>u.id!==user.id).map(u=>({...safeUser(u),friendship:db.friendships.find(f=>(f.from===user.id&&f.to===u.id)||(f.to===user.id&&f.from===u.id))?.status||null}))});
      m=p.match(/^\/api\/users\/([^/]+)$/);
      if(method==='GET'&&m){const target=db.users.find(u=>u.id===m[1]);if(!target)return json(res,404,{error:'Profile not found.'});return json(res,200,{user:safeUser(target),posts:db.posts.filter(x=>x.userId===target.id).map(x=>publicPost(x,user.id)),friendship:db.friendships.find(f=>(f.from===user.id&&f.to===target.id)||(f.to===user.id&&f.from===target.id))?.status||null});}
      if(method==='PATCH'&&p==='/api/users/me'){for(const key of ['name','bio','location','avatar','cover'])if(input[key]!==undefined){const val=String(input[key]).trim();if(val.length>(key==='bio'?500: key==='cover'||key==='avatar'?2000:120))return json(res,400,{error:`${key} is too long.`});if(['avatar','cover'].includes(key)&&val&&!/^https:\/\//i.test(val))return json(res,400,{error:'Profile images must use HTTPS URLs.'});user[key]=val;}saveStore();return json(res,200,{user:safeUser(user)});}
      m=p.match(/^\/api\/friends\/([^/]+)\/request$/);
      if(method==='POST'&&m){if(m[1]===user.id||!db.users.some(u=>u.id===m[1]))return json(res,400,{error:'Invalid friend.'});let f=db.friendships.find(x=>(x.from===user.id&&x.to===m[1])||(x.to===user.id&&x.from===m[1]));if(f){if(f.status==='pending'&&f.to===user.id){f.status='accepted';notify(m[1],user.id,'friend',`${user.name} accepted your friend request.`);}else return json(res,409,{error:'A friend request or friendship already exists.'});}else{f={id:uid(),from:user.id,to:m[1],status:'pending',createdAt:now()};db.friendships.push(f);notify(m[1],user.id,'friend',`${user.name} sent you a friend request.`);}saveStore();return json(res,200,{friendship:f});}
      m=p.match(/^\/api\/friends\/([^/]+)\/accept$/);
      if(method==='POST'&&m){const f=db.friendships.find(x=>x.from===m[1]&&x.to===user.id&&x.status==='pending');if(!f)return json(res,404,{error:'Pending request not found.'});f.status='accepted';notify(m[1],user.id,'friend',`${user.name} accepted your friend request.`);saveStore();return json(res,200,{friendship:f});}
      if(method==='GET'&&p==='/api/friends'){const list=db.friendships.filter(f=>f.status==='accepted'&&(f.from===user.id||f.to===user.id)).map(f=>safeUser(db.users.find(u=>u.id===(f.from===user.id?f.to:f.from))));const incoming=db.friendships.filter(f=>f.to===user.id&&f.status==='pending').map(f=>({...safeUser(db.users.find(u=>u.id===f.from)),requestId:f.id}));return json(res,200,{friends:list,incoming});}
      if(method==='GET'&&p==='/api/groups')return json(res,200,{groups:db.groups.map(g=>({...g,owner:safeUser(db.users.find(u=>u.id===g.ownerId)),memberCount:g.members.length,isMember:g.members.includes(user.id)}))});
      if(method==='POST'&&p==='/api/groups'){const name=String(input.name||'').trim(),description=String(input.description||'').trim();if(name.length<3||name.length>80||description.length>500)return json(res,400,{error:'Group name must be 3–80 characters; description max 500.'});const g={id:uid(),name,description,ownerId:user.id,members:[user.id],createdAt:now()};db.groups.unshift(g);saveStore();return json(res,201,{group:g});}
      m=p.match(/^\/api\/groups\/([^/]+)\/join$/);
      if(method==='POST'&&m){const g=db.groups.find(g=>g.id===m[1]);if(!g)return json(res,404,{error:'Group not found.'});if(!g.members.includes(user.id))g.members.push(user.id);saveStore();return json(res,200,{group:{...g,isMember:true}});}
      if(method==='GET'&&p==='/api/messages'){const peers=[...new Set(db.messages.filter(x=>x.from===user.id||x.to===user.id).map(x=>x.from===user.id?x.to:x.from))];return json(res,200,{conversations:peers.map(id=>({user:safeUser(db.users.find(u=>u.id===id)),messages:db.messages.filter(x=>(x.from===user.id&&x.to===id)||(x.from===id&&x.to===user.id)).map(x=>({...x,author:safeUser(db.users.find(u=>u.id===x.from))})).sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt))}))});}
      if(method==='POST'&&p==='/api/messages'){const to=String(input.to||''),text=String(input.text||'').trim();if(!db.users.some(u=>u.id===to)||to===user.id||!text||text.length>3000)return json(res,400,{error:'Choose a recipient and enter a message (max 3000 characters).'});const msg={id:uid(),from:user.id,to,text,createdAt:now(),read:false};db.messages.push(msg);notify(to,user.id,'message',`${user.name} sent you a message.`);saveStore();return json(res,201,{message:{...msg,author:safeUser(user)}});}
      if(method==='GET'&&p==='/api/notifications')return json(res,200,{notifications:db.notifications.filter(n=>n.userId===user.id).map(n=>({...n,actor:safeUser(db.users.find(u=>u.id===n.actorId))}))});
      if(method==='POST'&&p==='/api/notifications/read'){db.notifications.filter(n=>n.userId===user.id).forEach(n=>n.read=true);saveStore();return json(res,200,{ok:true});}
      if(method==='GET'&&p==='/api/search'){const q=(url.searchParams.get('q')||'').trim().toLowerCase().slice(0,100);if(!q)return json(res,200,{users:[],posts:[],groups:[]});return json(res,200,{users:db.users.filter(u=>u.name.toLowerCase().includes(q)||u.username.includes(q)).map(safeUser),posts:db.posts.filter(x=>x.text.toLowerCase().includes(q)).map(x=>publicPost(x,user.id)),groups:db.groups.filter(g=>(g.name+' '+g.description).toLowerCase().includes(q))});}
      return json(res,404,{error:'API route not found.'});
    } catch(e) { return json(res,e.status||500,{error:e.status?e.message:'Internal server error.'}); }
  }
  const rel=p==='/'?'index.html':decodeURIComponent(p.slice(1)); const file=path.resolve(publicDir,rel);
  if(!file.startsWith(publicDir+path.sep)&&file!==path.join(publicDir,'index.html'))return json(res,403,{error:'Forbidden'});
  fs.readFile(file,(err,data)=>{if(err){fs.readFile(path.join(publicDir,'index.html'),(e,d)=>{if(e)return json(res,404,{error:'Not found'});res.writeHead(200,{'Content-Type':MIME['.html']});res.end(d);});return;}res.writeHead(200,{'Content-Type':MIME[path.extname(file)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin'});res.end(data);});
}
const server=http.createServer((req,res)=>{route(req,res).catch(()=>json(res,500,{error:'Unexpected server error.'}));});
async function bootstrap(){ const demo=db.users.find(u=>u.email==='demo@example.com'); if(demo && !demo.passwordHash){const salt=crypto.randomBytes(16).toString('hex');const hash=(await scrypt('DemoPass123!',salt,64)).toString('hex');demo.passwordHash=`${salt}:${hash}`;saveStore();} server.listen(PORT,'0.0.0.0',()=>console.log(`Social Network running at http://localhost:${PORT}`)); }
bootstrap().catch(err=>{console.error('Startup failed:',err);process.exitCode=1;});
