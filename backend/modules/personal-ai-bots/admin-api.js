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
      return (json(res,200,{ok:true,network}),true);
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
      if(!bot.enabled||bot.status!=='enabled')return (json(res,409,{error:'Enable this bot before assigning an instruction. The network master switch must also be enabled before any future execution.'}),true);
      const task=queuePersonalAiBotInstruction(db,instructionMatch[1],input||{},user.id,stamp,uid);
      await saveStore();
      return (json(res,201,{ok:true,task,message:'Instruction saved for administrator approval. No bot action has been executed.'}),true);
    }
    const taskMatch=path.match(/^\/api\/admin\/personal-ai-bots\/tasks\/([0-9a-f-]{36})\/(approve|cancel)$/i);
    if(taskMatch&&method==='POST'){
      const action=taskMatch[2];
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
