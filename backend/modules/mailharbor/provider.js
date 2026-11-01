import crypto from 'node:crypto';
const RESEND_API = 'https://api.resend.com';
function addressFrom(value) { const s=String(value||'').trim(); const m=s.match(/<([^<>]+)>/); return (m?m[1]:s).trim().toLowerCase(); }
export function getMailHarborProviderStatus(env=process.env) {
  const apiKey=String(env.MAILHARBOR_RESEND_API_KEY||env.RESEND_API_KEY||'').trim();
  const secret=String(env.MAILHARBOR_RESEND_WEBHOOK_SECRET||env.RESEND_WEBHOOK_SECRET||'').trim();
  const domain=String(env.MAILHARBOR_MAIL_DOMAIN||'members.minglora.invalid').trim().toLowerCase().replace(/^@/,'');
  const verified=String(env.MAILHARBOR_DOMAIN_VERIFIED||'').toLowerCase()==='true';
  const inbound=String(env.MAILHARBOR_INBOUND_ENABLED||'').toLowerCase()==='true';
  const from=addressFrom(env.MAILHARBOR_FROM_EMAIL||env.EMAIL_FROM||('no-reply@'+domain));
  const publicDomain=!domain.endsWith('.invalid')&&!domain.endsWith('.test');
  const outboundEmailConfigured=Boolean(apiKey&&publicDomain&&verified&&from.split('@')[1]===domain);
  const inboundEmailConfigured=Boolean(apiKey&&secret&&publicDomain&&verified&&inbound);
  const resend={configured:outboundEmailConfigured||inboundEmailConfigured,connected:outboundEmailConfigured||inboundEmailConfigured};
  return {provider:'resend',apiKeyConfigured:Boolean(apiKey),fromEmail:from,mailDomain:domain,domainVerified:verified,outboundEmailConfigured,inboundEmailConfigured,resend,
    gmail:{configured:false,connected:false},yahoo:{configured:false,connected:false},outlook:{configured:false,connected:false},icloud:{configured:false,connected:false}};
}
async function request(path,{method='GET',body,idempotencyKey}={}) {
  const key=String(process.env.MAILHARBOR_RESEND_API_KEY||process.env.RESEND_API_KEY||'').trim();
  if(!key)throw new Error('MailHarbor Resend API key is not configured.');
  const response=await fetch(RESEND_API+path,{method,headers:{Authorization:'Bearer '+key,...(body===undefined?{}:{'Content-Type':'application/json'}),...(idempotencyKey?{'Idempotency-Key':idempotencyKey}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const data=await response.json().catch(()=>({}));
  if(!response.ok){const e=new Error(String(data.message||data.error||data.name||('Resend request failed ('+response.status+')')).slice(0,700));e.status=response.status;throw e;}
  return data;
}
export async function sendMailHarborExternal(message,idempotencyKey) {
  const status=getMailHarborProviderStatus();
  if(!status.outboundEmailConfigured)throw new Error('External mail requires a Resend API key and verified public sender domain.');
  const sender=String(message.sender_email||'');
  if(sender.split('@')[1]!==status.mailDomain)throw new Error('Sender mailbox is outside the verified MailHarbor domain.');
  const name=String(message.sender_name||'Minglora member').replace(/[\\r\\n<>"]/g,'').slice(0,120);
  const ext=message.externalDelivery||{};
  let to=[...(ext.to||[])], cc=[...(ext.cc||[])], bcc=[...(ext.bcc||[])];
  if(!to.length&&cc.length)to=[cc.shift()];
  if(!to.length&&bcc.length)to=[bcc.shift()];
  if(!to.length)throw new Error('At least one external recipient is required.');
  const attachments = (Array.isArray(message.attachments) ? message.attachments : [])
    .filter(item => item.contentBase64)
    .map(item => ({
      filename: String(item.filename || 'attachment').replace(/[\r\n]/g, '_').slice(0, 180),
      content: String(item.contentBase64),
      content_type: String(item.contentType || 'application/octet-stream')
    }));
  return request('/emails',{method:'POST',idempotencyKey,body:{
    from:name+' <'+sender+'>',to,cc,bcc,reply_to:message.reply_to||sender,
    subject:String(message.subject||''),text:String(message.body_text||''),
    ...(attachments.length ? {attachments} : {})
  }});
}
export async function retrieveResendReceivedEmail(id) {
  if(!/^[a-z0-9-]{16,80}$/i.test(String(id||'')))throw new Error('Invalid Resend inbound email ID.');
  return request('/emails/receiving/'+encodeURIComponent(id));
}
export function verifyResendWebhook({rawBody,headers={},secret,now=Date.now()}) {
  if(!Buffer.isBuffer(rawBody)||!secret||!secret.startsWith('whsec_'))return false;
  const id=String(headers['svix-id']||headers['Svix-Id']||''),ts=String(headers['svix-timestamp']||headers['Svix-Timestamp']||''),sig=String(headers['svix-signature']||headers['Svix-Signature']||'');
  if(!id||!ts||!ts.split('').every(char=>char>='0'&&char<='9')||!sig)return false;
  const seconds=Number(ts);if(!Number.isFinite(seconds)||Math.abs(now-seconds*1000)>300000)return false;
  const key=Buffer.from(secret.slice(6),'base64');if(!key.length)return false;
  const expected=crypto.createHmac('sha256',key).update(Buffer.concat([Buffer.from(id+'.'+ts+'.'),rawBody])).digest('base64');
  return sig.split(' ').some(part=>{const v=part.trim();if(!v.startsWith('v1,'))return false;const supplied=Buffer.from(v.slice(3)),digest=Buffer.from(expected);return supplied.length===digest.length&&crypto.timingSafeEqual(supplied,digest);});
}
