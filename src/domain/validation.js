const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[a-z0-9_]{3,30}$/;

export function normalizeUsername(value) {
  return String(value ?? '').trim().toLowerCase();
}
export function validateUsername(value) {
  const username = normalizeUsername(value);
  return { valid: USERNAME_RE.test(username), value: username };
}
export function normalizeEmail(value) {
  return String(value ?? '').trim().toLowerCase();
}
export function validateEmail(value) {
  const email = normalizeEmail(value);
  return { valid: email.length <= 254 && EMAIL_RE.test(email), value: email };
}
export function validatePostInput(input = {}) {
  const text = String(input.text ?? '').trim();
  const imageUrl = String(input.imageUrl ?? '').trim();
  const mediaIds = Array.isArray(input.mediaIds) ? input.mediaIds.map(value => String(value || '').trim()).filter(Boolean) : [];
  const errors = [];
  if (!text && !imageUrl && mediaIds.length === 0) errors.push('Add text or select media from your device.');
  if (text.length > 5000) errors.push('Post text must be 5000 characters or fewer.');
  if (imageUrl) errors.push('Image URLs are no longer accepted. Select media from your device instead.');
  if (mediaIds.length > 10) errors.push('A post can contain up to 10 media attachments.');
  if (mediaIds.some(id => id.length > 80)) errors.push('One or more media references are invalid.');
  return { valid: errors.length === 0, errors, value: { text, mediaIds } };
}
const ABOUT_VISIBILITY_KEYS = ['bio','location','country','county','parish','city','gender','relationshipStatus','contactPhone'];

export function normalizeContactPhone(value) {
  return String(value ?? '').trim().replace(/[\s().-]/g,'');
}

export function validateContactPhone(value) {
  const phone=normalizeContactPhone(value);
  return {valid:!phone || /^\+[1-9]\d{7,14}$/.test(phone),value:phone};
}

const ABOUT_SECTION_KEYS = [
  'personalDetails','intro','work','education','hobbies','interests','travel',
  'links','contactInfo','names','details','aboutYou'
];
const ABOUT_AUDIENCES = ['public','friends','private'];

function cleanAboutText(value,maxLength,label,errors){
  const text=String(value??'').trim();
  if(text.length>maxLength)errors.push(label+' must be '+maxLength+' characters or fewer.');
  return text.slice(0,maxLength);
}
function cleanAboutList(value,maxItems,maxLength,label,errors){
  if(value===undefined)return [];
  if(!Array.isArray(value)){
    errors.push(label+' must be a list of text values.');
    return [];
  }
  if(value.length>maxItems)errors.push(label+' can contain up to '+maxItems+' items.');
  const seen=new Set(),items=[];
  for(const raw of value.slice(0,maxItems)){
    const item=cleanAboutText(raw,maxLength,label+' item',errors);
    const key=item.toLowerCase();
    if(item&&!seen.has(key)){seen.add(key);items.push(item);}
  }
  return items;
}
function cleanAboutUrl(value,label,errors){
  const text=cleanAboutText(value,2048,label,errors);
  if(!text)return '';
  try{
    const url=new URL(text);
    if(!['https:','http:'].includes(url.protocol)||url.username||url.password||!url.hostname.includes('.')){
      errors.push(label+' must be a full http or https web address.');
      return '';
    }
    return url.toString();
  }catch{
    errors.push(label+' must be a full http or https web address.');
    return '';
  }
}
function cleanAboutEntries(value,kind,errors){
  if(value===undefined)return {entries:[]};
  if(!Array.isArray(value)){
    errors.push(kind+' entries must be a list.');
    return {entries:[]};
  }
  if(value.length>20)errors.push(kind+' can contain up to 20 entries.');
  const fields=kind==='Work'
    ?{company:140,position:120,city:120,description:600,startDate:20,endDate:20}
    :{school:160,degree:120,fieldOfStudy:120,graduationYear:20,city:120,description:600};
  const entries=[];
  for(const [index,raw] of value.slice(0,20).entries()){
    if(!raw||typeof raw!=='object'||Array.isArray(raw)){
      errors.push(kind+' entry '+(index+1)+' must be an object.');
      continue;
    }
    const entry={};
    for(const [key,max] of Object.entries(fields))entry[key]=cleanAboutText(raw[key],max,kind+' '+key,errors);
    if(kind==='Work'){
      entry.isCurrent=raw.isCurrent===true;
      if(raw.isCurrent!==undefined&&typeof raw.isCurrent!=='boolean')errors.push('Work current-status choices must be true or false.');
      if(entry.isCurrent)entry.endDate='';
    }
    if(Object.values(fields).some(key=>entry[key])||(kind==='Work'&&entry.isCurrent))entries.push(entry);
  }
  return {entries};
}
function validateAboutSections(input,errors){
  if(!input||typeof input!=='object'||Array.isArray(input)){
    errors.push('About sections must be an object.');
    return {};
  }
  const result={};
  for(const [section,raw] of Object.entries(input)){
    if(!ABOUT_SECTION_KEYS.includes(section)){
      errors.push('Unsupported About section: '+section);
      continue;
    }
    if(!raw||typeof raw!=='object'||Array.isArray(raw)){
      errors.push('About section '+section+' must be an object.');
      continue;
    }
    const clean={};
    const fields={
      personalDetails:{birthDate:20,pronouns:60,gender:60,relationshipStatus:80,currentCity:120,hometown:120,country:120,county:120,parish:120},
      intro:{bio:500},
      names:{otherName:120,nickname:80,pronunciation:120,formerName:120},
      details:{favoriteQuote:350,otherDetails:700},
      aboutYou:{description:1200}
    };
    if(section==='personalDetails'||section==='intro'||section==='names'||section==='details'||section==='aboutYou'){
      for(const [key,max] of Object.entries(fields[section])){
        if(raw[key]!==undefined)clean[key]=cleanAboutText(raw[key],max,section+' '+key,errors);
      }
      if(section==='personalDetails'&&raw.familyMembers!==undefined)clean.familyMembers=cleanAboutList(raw.familyMembers,30,140,'Family members and relationships',errors);
      if(section==='details'&&raw.languages!==undefined)clean.languages=cleanAboutList(raw.languages,30,60,'Languages',errors);
    }else if(section==='work'){
      clean.entries=cleanAboutEntries(raw.entries,'Work',errors).entries;
    }else if(section==='education'){
      clean.entries=cleanAboutEntries(raw.entries,'Education',errors).entries;
    }else if(section==='hobbies'||section==='interests'){
      clean.items=cleanAboutList(raw.items,60,80,section,errors);
    }else if(section==='travel'){
      clean.placesLived=cleanAboutList(raw.placesLived,100,120,'Places lived',errors);
      clean.visited=cleanAboutList(raw.visited,100,120,'Visited places',errors);
      clean.wantToVisit=cleanAboutList(raw.wantToVisit,100,120,'Places to visit',errors);
    }else if(section==='links'){
      if(raw.items!==undefined&&!Array.isArray(raw.items))errors.push('Social links must be a list.');
      const items=Array.isArray(raw.items)?raw.items:[];
      if(items.length>25)errors.push('You can add up to 25 social links.');
      clean.items=[];
      for(const [index,item] of items.slice(0,25).entries()){
        if(!item||typeof item!=='object'||Array.isArray(item)){
          errors.push('Social link '+(index+1)+' must be an object.');
          continue;
        }
        const url=cleanAboutUrl(item.url,'Social link URL',errors);
        if(!url)continue;
        clean.items.push({
          platform:cleanAboutText(item.platform||'Other',40,'Social link platform',errors)||'Other',
          label:cleanAboutText(item.label,80,'Social link label',errors),
          url
        });
      }
    }else if(section==='contactInfo'){
      if(raw.email!==undefined){
        const email=normalizeEmail(raw.email);
        if(email&&!validateEmail(email).valid)errors.push('Contact email must be a valid email address.');
        clean.email=email.slice(0,254);
      }
      for(const key of ['phone','whatsapp']){
        if(raw[key]!==undefined){
          const phone=normalizeContactPhone(raw[key]);
          if(!validateContactPhone(phone).valid)errors.push('Contact '+key+' must use international format with + and country code.');
          clean[key]=phone.slice(0,24);
        }
      }
      if(raw.website!==undefined)clean.website=cleanAboutUrl(raw.website,'Contact website',errors);
      if(raw.preferredContact!==undefined)clean.preferredContact=cleanAboutText(raw.preferredContact,80,'Preferred contact method',errors);
    }
    result[section]=clean;
  }
  return result;
}
function validateAboutSectionVisibility(input,errors){
  if(!input||typeof input!=='object'||Array.isArray(input)){
    errors.push('About section visibility must be an object.');
    return {};
  }
  const result={};
  for(const [key,value] of Object.entries(input)){
    if(!ABOUT_SECTION_KEYS.includes(key)){errors.push('Unsupported About section visibility: '+key);continue;}
    if(!ABOUT_AUDIENCES.includes(value)){errors.push('Choose Public, Friends or Only me for '+key+'.');continue;}
    result[key]=value;
  }
  return result;
}

export function validateProfilePatch(input = {}) {
  const limits = {
    name:120, username:30, bio:500, location:120, contactPhone:24,
    country:120, county:120, parish:120, city:120, gender:60, relationshipStatus:80
  };
  const value = {};
  const errors = [];
  const allowedKeys=new Set([...Object.keys(limits),'aboutVisibility','aboutSections','aboutSectionVisibility']);
  for(const key of Object.keys(input||{}))if(!allowedKeys.has(key))errors.push(key+' cannot be edited through profile details. Choose a file from your device for profile media.');
  for (const [key, limit] of Object.entries(limits)) {
    if (input[key] === undefined) continue;
    const normalized = key==='contactPhone'?normalizeContactPhone(input[key]):String(input[key] ?? '').trim();
    if (normalized.length > limit) errors.push(key+' must be '+limit+' characters or fewer.');
    value[key] = normalized;
  }
  if (Object.hasOwn(value,'contactPhone') && !validateContactPhone(value.contactPhone).valid) {
    errors.push('Enter a phone number in international format, including + and country code (for example +18765551234).');
  }
  if (Object.hasOwn(value, 'name') && value.name.length < 2) errors.push('name must contain at least 2 characters.');
  if (Object.hasOwn(value, 'username')) { const normalized=normalizeUsername(value.username); if (!validateUsername(normalized).valid) errors.push('username must contain 3–30 letters, numbers or underscores.'); value.username=normalized; }
  if (input.aboutVisibility !== undefined) {
    if (!input.aboutVisibility || typeof input.aboutVisibility !== 'object' || Array.isArray(input.aboutVisibility)) {
      errors.push('About visibility must be a set of show/hide choices.');
    } else {
      const visibility={};
      for(const [key,flag] of Object.entries(input.aboutVisibility)) {
        if(!ABOUT_VISIBILITY_KEYS.includes(key)){errors.push('Unsupported About visibility field: '+key);continue;}
        if(typeof flag!=='boolean'){errors.push('About visibility choices must be enabled or disabled.');continue;}
        visibility[key]=flag;
      }
      value.aboutVisibility=visibility;
    }
  }
  if(input.aboutSections!==undefined)value.aboutSections=validateAboutSections(input.aboutSections,errors);
  if(input.aboutSectionVisibility!==undefined)value.aboutSectionVisibility=validateAboutSectionVisibility(input.aboutSectionVisibility,errors);
  return { valid: errors.length === 0, errors, value };
}
