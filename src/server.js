import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { db, saveStore, uid, now } from './store.js';
import { normalizeEmail, normalizeUsername, validateEmail, validateUsername, validatePostInput, validateProfilePatch } from './domain/validation.js';
import { paginateDescending } from './domain/pagination.js';
const scrypt = promisify(crypto.scrypt);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '..', 'public');
const PORT = Number(process.env.PORT || 3000);
if (process.env.NODE_ENV === 'production' &&
    (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)) {
  throw new Error('Production startup requires SESSION_SECRET to contain at least 32 characters.');
}
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
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
const blockedBetween = (firstId, secondId) => firstId !== secondId && (db.blocks || []).some(b => (b.blockerId === firstId && b.blockedId === secondId) || (b.blockerId === secondId && b.blockedId === firstId));
const pageRole = (pageId, userId) => (db.pageRoles || []).find(role => role.pageId === pageId && role.userId === userId)?.role || null;
const canManagePage = (pageId, userId) => ['owner','admin','editor'].includes(pageRole(pageId,userId));
const canViewStory = (viewerId, story) => {
  if (!viewerId || !story?.userId) return false;
  if (viewerId === story.userId) return true;
  if (blockedBetween(viewerId, story.userId)) return false;
  if (story.audience === 'public') return true;
  if (story.audience === 'friends') return db.friendships.some(f => f.status === 'accepted' && ((f.from === viewerId && f.to === story.userId) || (f.from === story.userId && f.to === viewerId)));
  if (story.audience === 'followers') return (db.follows || []).some(f => f.followerId === viewerId && f.followedId === story.userId);
  return false;
};
function pruneExpiredStories() {
  const current = Date.now();
  const expired = (db.stories || []).filter(story => !Number.isFinite(Date.parse(story.expiresAt)) || Date.parse(story.expiresAt) <= current);
  if (!expired.length) return;
  const expiredIds = new Set(expired.map(story => story.id));
  db.stories = (db.stories || []).filter(story => !expiredIds.has(story.id));
  db.storyViews = (db.storyViews || []).filter(view => !expiredIds.has(view.storyId));
  saveStore();
}
function publicPost(p, viewerId) {
  const author = db.users.find(u=>u.id===p.userId);
  return { ...p, author:safeUser(author), reactions:p.reactions || {}, reactionCount:Object.values(p.reactions || {}).length, myReaction:(p.reactions || {})[viewerId] || null,
    isSaved:(db.savedPosts || []).some(saved => saved.userId === viewerId && saved.postId === p.id),
    comments:(p.comments || []).map(c=>({...c, author:safeUser(db.users.find(u=>u.id===c.userId))})) };
}
async function route(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`); const p = url.pathname; const method = req.method;
  if (method === 'GET' && p === '/api/health') return json(res,200,{ok:true,service:'minglora-social-network',timestamp:now()});
  if (p.startsWith('/api/')) {
    let input; try { if (!['GET','HEAD'].includes(method)) input=await body(req); } catch(e) { return json(res,e.status||400,{error:e.message}); }
    const user = sessionUser(req);
    try {
      if (method==='POST' && p==='/api/auth/register') {
        const name=String(input.name||'').trim(), username=normalizeUsername(input.username), email=normalizeEmail(input.email), password=String(input.password||'');
        if (name.length<2 || !validateUsername(username).valid || !validateEmail(email).valid || password.length<10 || password.length>1024) return json(res,400,{error:'Enter a name, username (3+ letters/numbers/underscores), valid email, and password of at least 10 characters.'});
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
      if (method==='GET' && p==='/api/feed') {
        const scope=String(url.searchParams.get('scope')||'all');
        if(!['all','following','friends'].includes(scope))return json(res,400,{error:'Feed scope must be all, following, or friends.'});
        let eligibleIds=null;
        if(scope==='following'){
          eligibleIds=new Set([user.id,...(db.follows||[]).filter(f=>f.followerId===user.id).map(f=>f.followedId)]);
        } else if(scope==='friends'){
          eligibleIds=new Set([user.id,...db.friendships.filter(f=>f.status==='accepted'&&(f.from===user.id||f.to===user.id)).map(f=>f.from===user.id?f.to:f.from)]);
        }
        const posts=db.posts.filter(x=>!blockedBetween(user.id,x.userId)&&(!eligibleIds||eligibleIds.has(x.userId)))
          .slice().sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).map(x=>publicPost(x,user.id));
        if (!url.searchParams.has('limit') && !url.searchParams.has('cursor')) return json(res,200,{posts,scope});
        try {
          const page=paginateDescending(posts,{limit:url.searchParams.has('limit')?Number(url.searchParams.get('limit')):20,cursor:url.searchParams.get('cursor')});
          return json(res,200,{posts:page.items,nextCursor:page.nextCursor,hasMore:page.hasMore,scope});
        } catch (e) { return json(res,400,{error:e.message}); }
      }
      if (method==='POST' && p==='/api/posts') { const validation=validatePostInput(input); if(!validation.valid)return json(res,400,{error:validation.errors.join(' ')}); const {text,imageUrl}=validation.value; const post={id:uid(),userId:user.id,text,imageUrl,createdAt:now(),reactions:{},comments:[]};db.posts.unshift(post);saveStore();return json(res,201,{post:publicPost(post,user.id)}); }
      let m=p.match(/^\/api\/posts\/([^/]+)$/);
      if(method==='PATCH'&&m){
        const post=db.posts.find(x=>x.id===m[1]);
        if(!post)return json(res,404,{error:'Post not found.'});
        if(post.userId!==user.id)return json(res,403,{error:'Only the post author can edit this post.'});
        const validation=validatePostInput({text:input.text===undefined?post.text:input.text,imageUrl:input.imageUrl===undefined?post.imageUrl:input.imageUrl});
        if(!validation.valid)return json(res,400,{error:validation.errors.join(' ')});
        Object.assign(post,validation.value,{updatedAt:now()});saveStore();return json(res,200,{post:publicPost(post,user.id)});
      }
      if(method==='DELETE'&&m){
        const post=db.posts.find(x=>x.id===m[1]);
        if(!post)return json(res,404,{error:'Post not found.'});
        if(post.userId!==user.id)return json(res,403,{error:'Only the post author can delete this post.'});
        db.posts=db.posts.filter(x=>x.id!==post.id);
        db.savedPosts=(db.savedPosts||[]).filter(saved=>saved.postId!==post.id);
        saveStore();return json(res,200,{ok:true,id:post.id});
      }
      if(method==='GET'&&p==='/api/saved-posts'){
        const posts=(db.savedPosts||[]).filter(saved=>saved.userId===user.id).map(saved=>db.posts.find(post=>post.id===saved.postId)).filter(post=>post&&!blockedBetween(user.id,post.userId)).map(post=>publicPost(post,user.id));
        return json(res,200,{posts});
      }
      m=p.match(/^\/api\/posts\/([^/]+)\/save$/);
      if((method==='POST'||method==='DELETE')&&m){
        const post=db.posts.find(x=>x.id===m[1]);
        if(!post||blockedBetween(user.id,post.userId))return json(res,404,{error:'Post not found.'});
        const exists=(db.savedPosts||[]).some(saved=>saved.userId===user.id&&saved.postId===post.id);
        if(method==='POST'&&!exists)db.savedPosts.push({id:uid(),userId:user.id,postId:post.id,createdAt:now()});
        if(method==='DELETE'&&exists)db.savedPosts=db.savedPosts.filter(saved=>!(saved.userId===user.id&&saved.postId===post.id));
        saveStore();return json(res,200,{saved:method==='POST'});
      }
      m=p.match(/^\/api\/posts\/([^/]+)\/reactions$/);
      if(method==='POST'&&m){const post=db.posts.find(x=>x.id===m[1]);if(!post||blockedBetween(user.id,post.userId))return json(res,404,{error:'Post not found.'});post.reactions ||= {};const reaction=String(input.reaction||'like');if(!['like','love','care','haha','wow','sad','angry'].includes(reaction))return json(res,400,{error:'Unsupported reaction.'});if(post.reactions[user.id]===reaction)delete post.reactions[user.id];else post.reactions[user.id]=reaction;if(post.userId!==user.id)notify(post.userId,user.id,'reaction',`${user.name} reacted to your post.`);saveStore();return json(res,200,{post:publicPost(post,user.id)});}
      m=p.match(/^\/api\/posts\/([^/]+)\/comments\/([^/]+)$/);
      if(method==='DELETE'&&m){
        const post=db.posts.find(x=>x.id===m[1]);
        if(!post||blockedBetween(user.id,post.userId))return json(res,404,{error:'Post not found.'});
        const comment=(post.comments||[]).find(x=>x.id===m[2]);
        if(!comment)return json(res,404,{error:'Comment not found.'});
        if(comment.userId!==user.id&&post.userId!==user.id)return json(res,403,{error:'Only the comment author or post author can delete this comment.'});
        post.comments=post.comments.filter(x=>x.id!==comment.id);
        saveStore();return json(res,200,{ok:true,id:comment.id});
      }
      m=p.match(/^\/api\/posts\/([^/]+)\/comments$/);
      if(method==='POST'&&m){const post=db.posts.find(x=>x.id===m[1]);const text=String(input.text||'').trim();if(!post||blockedBetween(user.id,post.userId))return json(res,404,{error:'Post not found.'});if(!text||text.length>2000)return json(res,400,{error:'Comment must contain 1–2000 characters.'});const comment={id:uid(),userId:user.id,text,createdAt:now()};post.comments.push(comment);if(post.userId!==user.id)notify(post.userId,user.id,'comment',`${user.name} commented on your post.`);saveStore();return json(res,201,{comment:{...comment,author:safeUser(user)}});}
      if(method==='GET'&&p==='/api/users')return json(res,200,{users:db.users.filter(u=>u.id!==user.id&&!blockedBetween(user.id,u.id)).map(u=>({...safeUser(u),friendship:db.friendships.find(f=>(f.from===user.id&&f.to===u.id)||(f.to===user.id&&f.from===u.id))?.status||null,following:(db.follows||[]).some(f=>f.followerId===user.id&&f.followedId===u.id)}))});
      m=p.match(/^\/api\/users\/([^/]+)\/follow$/);
      if((method==='POST'||method==='DELETE')&&m){
        const target=db.users.find(u=>u.id===m[1]);
        if(!target||target.id===user.id)return json(res,400,{error:'Choose another valid account.'});
        if(blockedBetween(user.id,target.id))return json(res,403,{error:'This relationship is unavailable.'});
        const exists=(db.follows||[]).some(f=>f.followerId===user.id&&f.followedId===target.id);
        if(method==='POST'&&!exists){db.follows.push({id:uid(),followerId:user.id,followedId:target.id,createdAt:now()});notify(target.id,user.id,'follow',`${user.name} started following you.`);}
        if(method==='DELETE'&&exists)db.follows=db.follows.filter(f=>!(f.followerId===user.id&&f.followedId===target.id));
        saveStore();return json(res,200,{following:method==='POST'});
      }
      m=p.match(/^\/api\/users\/([^/]+)\/block$/);
      if((method==='POST'||method==='DELETE')&&m){
        const target=db.users.find(u=>u.id===m[1]);
        if(!target||target.id===user.id)return json(res,400,{error:'Choose another valid account.'});
        const exists=(db.blocks||[]).some(b=>b.blockerId===user.id&&b.blockedId===target.id);
        if(method==='POST'&&!exists){
          db.blocks.push({id:uid(),blockerId:user.id,blockedId:target.id,createdAt:now()});
          db.follows=(db.follows||[]).filter(f=>!((f.followerId===user.id&&f.followedId===target.id)||(f.followerId===target.id&&f.followedId===user.id)));
          db.friendships=db.friendships.filter(f=>!((f.from===user.id&&f.to===target.id)||(f.from===target.id&&f.to===user.id)));
        }
        if(method==='DELETE'&&exists)db.blocks=db.blocks.filter(b=>!(b.blockerId===user.id&&b.blockedId===target.id));
        saveStore();return json(res,200,{blocked:method==='POST'});
      }
      if(method==='GET'&&p==='/api/blocks')return json(res,200,{users:(db.blocks||[]).filter(b=>b.blockerId===user.id).map(b=>safeUser(db.users.find(u=>u.id===b.blockedId))).filter(Boolean)});
      m=p.match(/^\/api\/users\/([^/]+)\/(followers|following)$/);
      if(method==='GET'&&m){
        const target=db.users.find(u=>u.id===m[1]);
        if(!target||blockedBetween(user.id,target.id))return json(res,404,{error:'Profile not found.'});
        const rows=m[2]==='followers'?(db.follows||[]).filter(f=>f.followedId===target.id):(db.follows||[]).filter(f=>f.followerId===target.id);
        const users=rows.map(f=>db.users.find(u=>u.id===(m[2]==='followers'?f.followerId:f.followedId))).filter(u=>u&&!blockedBetween(user.id,u.id)).map(safeUser);
        return json(res,200,{users,count:users.length});
      }
      m=p.match(/^\/api\/users\/([^/]+)$/);
      if(method==='GET'&&m){const target=db.users.find(u=>u.id===m[1]);if(!target||blockedBetween(user.id,target.id))return json(res,404,{error:'Profile not found.'});return json(res,200,{user:safeUser(target),posts:db.posts.filter(x=>x.userId===target.id&&!blockedBetween(user.id,x.userId)).map(x=>publicPost(x,user.id)),friendship:db.friendships.find(f=>(f.from===user.id&&f.to===target.id)||(f.to===user.id&&f.from===target.id))?.status||null,following:(db.follows||[]).some(f=>f.followerId===user.id&&f.followedId===target.id),followersCount:(db.follows||[]).filter(f=>f.followedId===target.id&&!blockedBetween(user.id,f.followerId)).length,followingCount:(db.follows||[]).filter(f=>f.followerId===target.id&&!blockedBetween(user.id,f.followedId)).length}); }
      if(method==='PATCH'&&p==='/api/users/me'){const validation=validateProfilePatch(input);if(!validation.valid)return json(res,400,{error:validation.errors.join(' ')});Object.assign(user,validation.value);saveStore();return json(res,200,{user:safeUser(user)}); }
      m=p.match(/^\/api\/friends\/([^/]+)\/request$/);
      if(method==='POST'&&m){if(m[1]===user.id||!db.users.some(u=>u.id===m[1]))return json(res,400,{error:'Invalid friend.'});if(blockedBetween(user.id,m[1]))return json(res,403,{error:'This relationship is unavailable.'});let f=db.friendships.find(x=>(x.from===user.id&&x.to===m[1])||(x.to===user.id&&x.from===m[1]));if(f){if(f.status==='pending'&&f.to===user.id){f.status='accepted';f.updatedAt=now();notify(m[1],user.id,'friend',`${user.name} accepted your friend request.`);}else if(['declined','cancelled'].includes(f.status)){f.from=user.id;f.to=m[1];f.status='pending';f.createdAt=now();f.updatedAt=now();notify(m[1],user.id,'friend',`${user.name} sent you a friend request.`);}else return json(res,409,{error:'A friend request or friendship already exists.'});}else{f={id:uid(),from:user.id,to:m[1],status:'pending',createdAt:now()};db.friendships.push(f);notify(m[1],user.id,'friend',`${user.name} sent you a friend request.`);}saveStore();return json(res,200,{friendship:f});}
      m=p.match(/^\/api\/friends\/([^/]+)\/accept$/);
      if(method==='POST'&&m){const f=db.friendships.find(x=>x.from===m[1]&&x.to===user.id&&x.status==='pending');if(!f)return json(res,404,{error:'Pending request not found.'});f.status='accepted';notify(m[1],user.id,'friend',`${user.name} accepted your friend request.`);saveStore();return json(res,200,{friendship:f});}
      m=p.match(/^\/api\/friends\/([^/]+)\/decline$/);
      if(method==='POST'&&m){
        const request=db.friendships.find(f=>f.from===m[1]&&f.to===user.id&&f.status==='pending');
        if(!request)return json(res,404,{error:'Pending friend request not found.'});
        request.status='declined';request.updatedAt=now();
        notify(request.from,user.id,'friend',`${user.name} declined your friend request.`);
        saveStore();return json(res,200,{friendship:request});
      }
      m=p.match(/^\/api\/friends\/([^/]+)$/);
      if(method==='DELETE'&&m){
        if(blockedBetween(user.id,m[1]))return json(res,404,{error:'Friendship not found.'});
        const friendship=db.friendships.find(f=>(f.from===user.id&&f.to===m[1]||f.from===m[1]&&f.to===user.id)&&['accepted','pending'].includes(f.status));
        if(!friendship)return json(res,404,{error:'Friendship not found.'});
        if(friendship.status==='pending'&&friendship.from!==user.id)return json(res,403,{error:'Only the requester can cancel a pending request. Use decline for incoming requests.'});
        const wasAccepted=friendship.status==='accepted';
        db.friendships=db.friendships.filter(f=>f.id!==friendship.id);
        saveStore();return json(res,200,{removed:true,wasAccepted});
      }
      if(method==='GET'&&p==='/api/friends'){const list=db.friendships.filter(f=>f.status==='accepted'&&(f.from===user.id||f.to===user.id)&&!blockedBetween(user.id,f.from===user.id?f.to:f.from)).map(f=>safeUser(db.users.find(u=>u.id===(f.from===user.id?f.to:f.from))));const incoming=db.friendships.filter(f=>f.to===user.id&&f.status==='pending'&&!blockedBetween(user.id,f.from)).map(f=>({...safeUser(db.users.find(u=>u.id===f.from)),requestId:f.id}));return json(res,200,{friends:list,incoming});}
      if(method==='GET'&&p==='/api/groups')return json(res,200,{groups:db.groups.map(g=>({...g,owner:safeUser(db.users.find(u=>u.id===g.ownerId)),memberCount:g.members.length,isMember:g.members.includes(user.id)}))});
      if(method==='POST'&&p==='/api/groups'){
        const name=String(input.name||'').trim(),description=String(input.description||'').trim();
        if(name.length<3||name.length>80||description.length>500)return json(res,400,{error:'Group name must be 3–80 characters; description max 500.'});
        const g={id:uid(),name,description,ownerId:user.id,members:[user.id],createdAt:now()};db.groups.unshift(g);saveStore();return json(res,201,{group:g});
      }
      m=p.match(/^\/api\/groups\/([^/]+)\/posts$/);
      if(method==='POST'&&m){
        const group=db.groups.find(g=>g.id===m[1]);if(!group)return json(res,404,{error:'Group not found.'});
        if(!group.members.includes(user.id))return json(res,403,{error:'Join this group before posting.'});
        const text=String(input.text||'').trim();
        if(!text||text.length>5000)return json(res,400,{error:'Group post must contain 1–5000 characters.'});
        const post={id:uid(),groupId:group.id,userId:user.id,text,createdAt:now(),updatedAt:now()};
        db.groupPosts.push(post);saveStore();return json(res,201,{post:{...post,author:safeUser(user)}});
      }
      m=p.match(/^\/api\/groups\/([^/]+)\/posts\/([^/]+)$/);
      if(method==='DELETE'&&m){
        const group=db.groups.find(g=>g.id===m[1]);if(!group)return json(res,404,{error:'Group not found.'});
        const post=(db.groupPosts||[]).find(x=>x.groupId===group.id&&x.id===m[2]);
        if(!post)return json(res,404,{error:'Group post not found.'});
        if(post.userId!==user.id&&group.ownerId!==user.id)return json(res,403,{error:'Only the post author or group owner can delete this post.'});
        db.groupPosts=db.groupPosts.filter(x=>x.id!==post.id);saveStore();return json(res,200,{ok:true,id:post.id});
      }
      m=p.match(/^\/api\/groups\/([^/]+)\/join$/);
      if(method==='POST'&&m){
        const group=db.groups.find(g=>g.id===m[1]);if(!group)return json(res,404,{error:'Group not found.'});
        if(!group.members.includes(user.id))group.members.push(user.id);saveStore();return json(res,200,{group:{...group,isMember:true}});
      }
      if(method==='DELETE'&&m){
        const group=db.groups.find(g=>g.id===m[1]);if(!group)return json(res,404,{error:'Group not found.'});
        if(group.ownerId===user.id)return json(res,409,{error:'The group owner cannot leave without transferring ownership or deleting the group.'});
        group.members=group.members.filter(id=>id!==user.id);saveStore();return json(res,200,{left:!group.members.includes(user.id)});
      }
      m=p.match(/^\/api\/groups\/([^/]+)$/);
      if(method==='GET'&&m){
        const group=db.groups.find(g=>g.id===m[1]);if(!group)return json(res,404,{error:'Group not found.'});
        const posts=(db.groupPosts||[]).filter(post=>post.groupId===group.id).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).map(post=>({...post,author:safeUser(db.users.find(u=>u.id===post.userId))}));
        return json(res,200,{group:{...group,owner:safeUser(db.users.find(u=>u.id===group.ownerId)),members:group.members.map(id=>safeUser(db.users.find(u=>u.id===id))).filter(Boolean),memberCount:group.members.length,isMember:group.members.includes(user.id)},posts});
      }
      if(method==='GET'&&p==='/api/stories'){
        pruneExpiredStories();
        const stories=(db.stories||[]).filter(story=>canViewStory(user.id,story)).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).map(story=>({...story,author:safeUser(db.users.find(u=>u.id===story.userId)),viewedByMe:(db.storyViews||[]).some(view=>view.storyId===story.id&&view.viewerId===user.id)}));
        return json(res,200,{stories});
      }
      if(method==='POST'&&p==='/api/stories'){
        const text=String(input.text||'').trim(),imageUrl=String(input.imageUrl||'').trim(),audience=String(input.audience||'public');
        if(!['public','friends','followers','private'].includes(audience))return json(res,400,{error:'Unsupported story audience.'});
        if(!text&&!imageUrl)return json(res,400,{error:'Add text or an HTTPS image URL to create a story.'});
        if(text.length>1000||imageUrl.length>2000)return json(res,400,{error:'Story text or image URL is too long.'});
        if(imageUrl){try{if(new URL(imageUrl).protocol!=='https:')return json(res,400,{error:'Story image URL must use HTTPS.'});}catch{return json(res,400,{error:'Story image URL must be a valid absolute URL.'});}}
        const createdAt=now();
        const story={id:uid(),userId:user.id,text,imageUrl,audience,createdAt,expiresAt:new Date(Date.now()+24*60*60*1000).toISOString()};
        db.stories.push(story);saveStore();return json(res,201,{story:{...story,author:safeUser(user),viewCount:0,viewedByMe:false}});
      }
      m=p.match(/^\/api\/stories\/([^/]+)\/view$/);
      if(method==='POST'&&m){
        pruneExpiredStories();
        const story=db.stories.find(x=>x.id===m[1]);
        if(!story||!canViewStory(user.id,story))return json(res,404,{error:'Story not found.'});
        if(story.userId!==user.id&&!(db.storyViews||[]).some(view=>view.storyId===story.id&&view.viewerId===user.id)){
          db.storyViews.push({storyId:story.id,viewerId:user.id,viewedAt:now()});saveStore();
        }
        const views=(db.storyViews||[]).filter(view=>view.storyId===story.id);
        return json(res,200,{story:{...story,author:safeUser(db.users.find(u=>u.id===story.userId)),viewedByMe:story.userId===user.id||views.some(view=>view.viewerId===user.id),viewCount:views.length,viewers:story.userId===user.id?views.map(view=>({...view,user:safeUser(db.users.find(u=>u.id===view.viewerId))})):undefined}});
      }
      m=p.match(/^\/api\/stories\/([^/]+)$/);
      if(method==='DELETE'&&m){
        pruneExpiredStories();
        const story=db.stories.find(x=>x.id===m[1]);
        if(!story)return json(res,404,{error:'Story not found.'});
        if(story.userId!==user.id)return json(res,403,{error:'Only the story author can delete this story.'});
        db.stories=db.stories.filter(x=>x.id!==story.id);db.storyViews=(db.storyViews||[]).filter(view=>view.storyId!==story.id);
        saveStore();return json(res,200,{ok:true,id:story.id});
      }
      if(method==='GET'&&p==='/api/pages'){
        const pages=(db.pages||[]).filter(page=>page.status==='active'&&!blockedBetween(user.id,page.createdBy)).map(page=>({...page,owner:safeUser(db.users.find(u=>u.id===page.createdBy)),followerCount:(db.pageFollows||[]).filter(f=>f.pageId===page.id).length,isFollowing:(db.pageFollows||[]).some(f=>f.pageId===page.id&&f.userId===user.id),myRole:pageRole(page.id,user.id)}));
        return json(res,200,{pages});
      }
      if(method==='POST'&&p==='/api/pages'){
        const handle=String(input.handle||'').trim().toLowerCase(),title=String(input.title||'').trim(),description=String(input.description||'').trim(),category=String(input.category||'').trim();
        if(!/^[a-z0-9][a-z0-9_-]{2,29}$/.test(handle))return json(res,400,{error:'Page handle must be 3–30 lowercase letters, numbers, underscores or hyphens, starting with a letter or number.'});
        if(title.length<3||title.length>160||description.length>2000||category.length>60)return json(res,400,{error:'Page title must be 3–160 characters; description max 2000 and category max 60.'});
        if((db.pages||[]).some(page=>page.handle.toLowerCase()===handle))return json(res,409,{error:'That Page handle is already taken.'});
        const page={id:uid(),handle,title,description,category,status:'active',createdBy:user.id,createdAt:now()};
        db.pages.push(page);db.pageRoles.push({pageId:page.id,userId:user.id,role:'owner',createdAt:now()});saveStore();
        return json(res,201,{page:{...page,owner:safeUser(user),followerCount:0,isFollowing:false,myRole:'owner'}});
      }
      m=p.match(/^\/api\/pages\/([^/]+)\/follow$/);
      if((method==='POST'||method==='DELETE')&&m){
        const page=(db.pages||[]).find(item=>item.id===m[1]&&item.status==='active');
        if(!page||blockedBetween(user.id,page.createdBy))return json(res,404,{error:'Page not found.'});
        if(page.createdBy===user.id)return json(res,400,{error:'You already manage this Page.'});
        const exists=(db.pageFollows||[]).some(f=>f.pageId===page.id&&f.userId===user.id);
        if(method==='POST'&&!exists)db.pageFollows.push({pageId:page.id,userId:user.id,createdAt:now()});
        if(method==='DELETE'&&exists)db.pageFollows=db.pageFollows.filter(f=>!(f.pageId===page.id&&f.userId===user.id));
        saveStore();return json(res,200,{isFollowing:method==='POST'});
      }
      m=p.match(/^\/api\/pages\/([^/]+)\/posts$/);
      if(method==='POST'&&m){
        const page=(db.pages||[]).find(item=>item.id===m[1]&&item.status==='active');
        if(!page||blockedBetween(user.id,page.createdBy))return json(res,404,{error:'Page not found.'});
        if(!canManagePage(page.id,user.id))return json(res,403,{error:'Only Page owners, admins or editors can publish.'});
        const validation=validatePostInput({text:input.text,imageUrl:input.imageUrl});
        if(!validation.valid)return json(res,400,{error:validation.errors.join(' ')});
        const post={id:uid(),pageId:page.id,publishedBy:user.id,text:validation.value.text,imageUrl:validation.value.imageUrl,createdAt:now(),updatedAt:now(),status:'published'};
        db.pagePosts.push(post);saveStore();return json(res,201,{post:{...post,author:safeUser(user),page:{id:page.id,title:page.title,handle:page.handle}}});
      }
      m=p.match(/^\/api\/pages\/([^/]+)\/posts\/([^/]+)$/);
      if(method==='DELETE'&&m){
        const page=(db.pages||[]).find(item=>item.id===m[1]);if(!page)return json(res,404,{error:'Page not found.'});
        const post=(db.pagePosts||[]).find(item=>item.id===m[2]&&item.pageId===page.id);
        if(!post)return json(res,404,{error:'Page post not found.'});
        if(post.publishedBy!==user.id&&!['owner','admin'].includes(pageRole(page.id,user.id)))return json(res,403,{error:'Only the publisher or Page owner/admin can delete this post.'});
        db.pagePosts=db.pagePosts.filter(item=>item.id!==post.id);saveStore();return json(res,200,{ok:true,id:post.id});
      }
      m=p.match(/^\/api\/pages\/([^/]+)$/);
      if(method==='GET'&&m){
        const page=(db.pages||[]).find(item=>item.id===m[1]&&item.status==='active');
        if(!page||blockedBetween(user.id,page.createdBy))return json(res,404,{error:'Page not found.'});
        const posts=(db.pagePosts||[]).filter(post=>post.pageId===page.id&&post.status==='published').sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).map(post=>({...post,author:safeUser(db.users.find(u=>u.id===post.publishedBy)),page:{id:page.id,title:page.title,handle:page.handle}}));
        return json(res,200,{page:{...page,owner:safeUser(db.users.find(u=>u.id===page.createdBy)),followerCount:(db.pageFollows||[]).filter(f=>f.pageId===page.id).length,isFollowing:(db.pageFollows||[]).some(f=>f.pageId===page.id&&f.userId===user.id),myRole:pageRole(page.id,user.id)},posts});
      }
      m=p.match(/^\/api\/pages\/([^/]+)$/);
      if(method==='DELETE'&&m){
        const page=(db.pages||[]).find(item=>item.id===m[1]);
        if(!page)return json(res,404,{error:'Page not found.'});
        if(page.createdBy!==user.id)return json(res,403,{error:'Only the Page owner can delete this Page.'});
        db.pages=db.pages.filter(item=>item.id!==page.id);
        db.pageRoles=db.pageRoles.filter(role=>role.pageId!==page.id);
        db.pageFollows=db.pageFollows.filter(f=>f.pageId!==page.id);
        db.pagePosts=db.pagePosts.filter(post=>post.pageId!==page.id);
        saveStore();return json(res,200,{ok:true,id:page.id});
      }
      if(method==='GET'&&p==='/api/messages'){const peers=[...new Set(db.messages.filter(x=>x.from===user.id||x.to===user.id).map(x=>x.from===user.id?x.to:x.from))].filter(id=>!blockedBetween(user.id,id));return json(res,200,{conversations:peers.map(id=>({user:safeUser(db.users.find(u=>u.id===id)),messages:db.messages.filter(x=>(x.from===user.id&&x.to===id)||(x.from===id&&x.to===user.id)).map(x=>({...x,author:safeUser(db.users.find(u=>u.id===x.from))})).sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt))}))});}
      if(method==='POST'&&p==='/api/messages'){const to=String(input.to||''),text=String(input.text||'').trim();if(!db.users.some(u=>u.id===to)||to===user.id||blockedBetween(user.id,to)||!text||text.length>3000)return json(res,400,{error:'Choose a recipient and enter a message (max 3000 characters).'});const msg={id:uid(),from:user.id,to,text,createdAt:now(),read:false};db.messages.push(msg);notify(to,user.id,'message',`${user.name} sent you a message.`);saveStore();return json(res,201,{message:{...msg,author:safeUser(user)}});}
      if(method==='GET'&&p==='/api/notifications')return json(res,200,{notifications:db.notifications.filter(n=>n.userId===user.id&&(!n.actorId||!blockedBetween(user.id,n.actorId))).map(n=>({...n,actor:safeUser(db.users.find(u=>u.id===n.actorId))}))});
      if(method==='POST'&&p==='/api/notifications/read'){db.notifications.filter(n=>n.userId===user.id).forEach(n=>n.read=true);saveStore();return json(res,200,{ok:true});}
      if(method==='GET'&&p==='/api/search'){const q=(url.searchParams.get('q')||'').trim().toLowerCase().slice(0,100);if(!q)return json(res,200,{users:[],posts:[],groups:[],pages:[]});return json(res,200,{users:db.users.filter(u=>u.id!==user.id&&!blockedBetween(user.id,u.id)&&(u.name.toLowerCase().includes(q)||u.username.includes(q))).map(safeUser),posts:db.posts.filter(x=>!blockedBetween(user.id,x.userId)&&x.text.toLowerCase().includes(q)).map(x=>publicPost(x,user.id)),groups:db.groups.filter(g=>(g.name+' '+g.description).toLowerCase().includes(q)),pages:(db.pages||[]).filter(page=>page.status==='active'&&!blockedBetween(user.id,page.createdBy)&&(page.title+' '+page.handle+' '+page.description+' '+page.category).toLowerCase().includes(q)).map(page=>({...page,owner:safeUser(db.users.find(u=>u.id===page.createdBy)),followerCount:(db.pageFollows||[]).filter(f=>f.pageId===page.id).length,isFollowing:(db.pageFollows||[]).some(f=>f.pageId===page.id&&f.userId===user.id)}))});}
      return json(res,404,{error:'API route not found.'});
    } catch(e) { return json(res,e.status||500,{error:e.status?e.message:'Internal server error.'}); }
  }
  const rel=p==='/'?'index.html':decodeURIComponent(p.slice(1)); const file=path.resolve(publicDir,rel);
  if(!file.startsWith(publicDir+path.sep)&&file!==path.join(publicDir,'index.html'))return json(res,403,{error:'Forbidden'});
  fs.readFile(file,(err,data)=>{if(err){fs.readFile(path.join(publicDir,'index.html'),(e,d)=>{if(e)return json(res,404,{error:'Not found'});res.writeHead(200,{'Content-Type':MIME['.html']});res.end(d);});return;}res.writeHead(200,{'Content-Type':MIME[path.extname(file)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin'});res.end(data);});
}
const server=http.createServer((req,res)=>{route(req,res).catch(()=>json(res,500,{error:'Unexpected server error.'}));});
server.listen(PORT,'0.0.0.0',()=>console.log(`Minglora listening on port ${PORT}`));
