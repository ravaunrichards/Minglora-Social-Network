import {
  ensurePersonalAiBotCollections,
  getPersonalAiBotCategories,
  getPersonalAiBotOverview,
  createPersonalAiBot,
  createPersonalAiBotStarterSet,
  updatePersonalAiBot,
  createPersonalAiBotCategory,
  queuePersonalAiBotInstruction,
  approvePersonalAiBotTask,
  cancelPersonalAiBotTask,
  setPersonalAiBotNetworkSettings,
  setPersonalAiBotCategoryEnabled,
  updatePersonalAiBotCategory,
  bulkUpdatePersonalAiBots,
  emergencyShutdownPersonalAiBots,
  PERSONAL_AI_BOT_CATEGORIES
} from './personal-ai-bots-service.js';

export async function handlePersonalAiBotsAdminApi(context) {
  const {req,res,url,method,path,user,input,db,saveStore,uid,now,json,isOwnerAdmin,isSameOriginWrite}=context;
  const root='/api/admin/personal-ai-bots';
  if(path!==root&&!path.startsWith(root+'/'))return false;
  if(!isOwnerAdmin)return (json(res,403,{error:'Only the designated MFA-verified Minglora owner can manage the Personal AI Bots Network.'}),true);
  const write=['POST','PUT','PATCH','DELETE'].includes(method);
  if(write&&!isSameOriginWrite)return (json(res,403,{error:'This bot-management request must come from Minglora.'}),true);
  ensurePersonalAiBotCollections(db);
  const stamp=now();
  try{
    if(method==='GET'&&path===root){
      const overview=getPersonalAiBotOverview(db);
      return (json(res,200,{
        ...overview,
        categories:getPersonalAiBotCategories(db),
        bots:db.personalAiBots.slice().sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))),
        tasks:db.personalAiBotTasks.slice(0,100),
        audit:db.personalAiBotAudit.slice(0,100),
        templates:PERSONAL_AI_BOT_CATEGORIES
      }),true);
    }
    if(method==='POST'&&path===root){
      const bot=createPersonalAiBot(db,input||{},user.id,stamp,uid);
      await saveStore();
      return (json(res,201,{ok:true,bot}),true);
    }
    if(method==='POST'&&path===root+'/starter-set'){
      const bots=createPersonalAiBotStarterSet(db,user.id,stamp,uid);
      await saveStore();
      return (json(res,201,{ok:true,created:bots.length,bots}),true);
    }
    if(method==='POST'&&path===root+'/categories'){
      const category=createPersonalAiBotCategory(db,input||{},user.id,stamp,uid);
      await saveStore();
      return (json(res,201,{ok:true,category}),true);
    }
    if(method==='PUT'&&path===root+'/network'){
      const network=setNetwork(input||{});
      await saveStore();
      return (json(res,200,{ok:true,network}),true);
    }
    if(method==='POST'&&path===root+'/emergency-shutdown'){
      const result=emergencyShutdownPersonalAiBots(db,user.id,stamp,uid);
      await saveStore();
      return (json(res,200,{...result,message:'Emergency shutdown complete. Enabled bots were paused and open tasks were cancelled.'}),true);
    }
    const categoryMatch=path.match(/^\/api\/admin\/personal-ai-bots\/categories\/([a-z0-9-]+)$/i);
    if(categoryMatch&&method==='PATCH'){
      const category=updatePersonalAiBotCategory(db,categoryMatch[1],input||{},user.id,stamp,uid);
      await saveStore();
      return (json(res,200,{ok:true,category}),true);
    }
    if(method==='POST'&&path===root+'/bots/bulk'){
      const result=bulkUpdatePersonalAiBots(db,input?.botIds,input?.status,user.id,stamp,uid);
      await saveStore();
      return (json(res,200,{ok:true,...result}),true);
    }
    const botMatch=path.match(/^\/api\/admin\/personal-ai-bots\/bots\/([0-9a-f-]{36})$/i);
    if(botMatch&&method==='PATCH'){
      const bot=updatePersonalAiBot(db,botMatch[1],input||{},user.id,stamp,uid);
      await saveStore();
      return (json(res,200,{ok:true,bot}),true);
    }
    const instructionMatch=path.match(/^\/api\/admin\/personal-ai-bots\/bots\/([0-9a-f-]{36})\/instructions$/i);
    if(instructionMatch&&method==='POST'){
      const bot= db.personalAiBots.find(item=>item.id===instructionMatch[1]);
      if(!bot)return (json(res,404,{error:'Bot not found.'}),true);
      const network=db.personalAiBotSettings.find(item=>item.id==='global');
      if(!network?.enabled||!bot.enabled||bot.status!=='enabled')return (json(res,409,{error:'Enable the network and this bot before assigning an instruction.'}),true);
      const taskType=String(input?.taskType||'other');
      if(['follow','unfollow'].includes(taskType)){
        const targetUserId=String(input?.targetUserId||'');
        const targetMember=(db.users||[]).find(member=>member.id===targetUserId);
        if(!targetMember)return (json(res,404,{error:'The selected Minglora member account could not be found.'}),true);
        if(['banned','suspended','deactivated','deleted'].includes(String(targetMember.status||'').toLowerCase())){
          return (json(res,409,{error:'This member account is not eligible for following operations.'}),true);
        }
      }
      const task=queuePersonalAiBotInstruction(db,instructionMatch[1],input||{},user.id,stamp,uid);
      await saveStore();
      return (json(res,201,{ok:true,task,message:'Instruction saved for administrator approval. No bot action has been executed.'}),true);
    }
    const taskMatch=path.match(/^\/api\/admin\/personal-ai-bots\/tasks\/([0-9a-f-]{36})\/(approve|cancel)$/i);
    if(taskMatch&&method==='POST'){
      const action=taskMatch[2];
      if(action==='approve'){
        const existing=db.personalAiBotTasks.find(item=>item.id===taskMatch[1]);
        const bot=existing?db.personalAiBots.find(item=>item.id===existing.botId):null;
        const network=db.personalAiBotSettings.find(item=>item.id==='global');
        const category=bot?getPersonalAiBotCategories(db).find(item=>item.id===bot.categoryId):null;
        if(!existing||!bot)return (json(res,404,{error:'Instruction or bot not found.'}),true);
        if(!network?.enabled||!bot.enabled||bot.status!=='enabled'||!category?.enabled)return (json(res,409,{error:'The network, bot and category must all be enabled before an instruction can be approved.'}),true);
      }
      const task=action==='approve'
        ?approvePersonalAiBotTask(db,taskMatch[1],user.id,stamp,uid)
        :cancelPersonalAiBotTask(db,taskMatch[1],user.id,stamp,uid);
      await saveStore();
      return (json(res,200,{ok:true,task,message:action==='approve'?'Instruction approved and queued, but no worker is configured to execute it yet.':'Instruction cancelled.'}),true);
    }
    if(method==='POST'&&path.startsWith(root+'/')){
      return (json(res,404,{error:'Unknown Personal AI Bots operation.'}),true);
    }
    return (json(res,405,{error:'Method not allowed for Personal AI Bots.'}),true);
  }catch(error){
    return (json(res,error.status||400,{error:error.message||'The bot-management operation could not be completed.'}),true);
  }

  function setNetwork(payload){
    return setPersonalAiBotNetworkSettings(db,payload,user.id,stamp,uid);
  }
}
