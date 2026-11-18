(() => {
  const PLACEMENTS = [
    ["website_header","Website header"],["website_footer","Website footer"],["mobile_app","Mobile application"],
    ["desktop_app","Desktop application"],["tablet_app","Tablet application"],["admin_dashboard","Admin dashboard"],
    ["login_page","Login page"],["registration_page","Registration page"],["password_recovery_page","Password recovery"],
    ["loading_screen","Loading screen"],["splash_screen","Splash screen"],["browser_favicon","Browser favicon"],
    ["notifications","Notifications"],["email_templates","Email templates"],["live_streaming","LIVE streaming"],
    ["meetwave","MeetWave"],["video_watermarks","Video watermarks"],["image_watermarks","Image watermarks"],
    ["post_share_previews","Post sharing previews"],["application_icons","Application icons"],
    ["error_pages","Error pages"],["maintenance_pages","Maintenance pages"],["promotional_pages","Promotional pages"]
  ];
  const TABS=[["dashboard","Overview"],["library","Logo Library"],["upload","Upload"],
    ["collections","Collections & Categories"],["placements","Placements"],["identity","Brand Identity"],
    ["scheduling","Scheduling"],["activity","Activity & History"]];
  const ACCEPTED=["image/svg+xml","image/png","image/apng","image/jpeg","image/webp","image/gif",
    "image/vnd.microsoft.icon","image/x-icon","application/json","video/mp4","video/webm"].join(",");
  const make=(tag,cls,text)=>{
    const n=document.createElement(tag);
    if(cls)n.className=cls;
    if(text!==undefined)n.textContent=String(text);
    return n;
  };
  const button=(title,handler,variant)=>{
    const b=make("button","brand-button brand-button-"+(variant||"quiet"),title);
    b.type="button";b.addEventListener("click",handler);return b;
  };
  const label=(title,control)=>{
    const l=make("label","brand-field");
    l.append(make("span","",title),control);return l;
  };
  const field=(type,placeholder,value)=>{
    const i=make("input","brand-input");i.type=type;
    if(placeholder)i.placeholder=placeholder;if(value!==undefined)i.value=value;return i;
  };
  const select=(placeholder,items)=>{
    const s=make("select","brand-input");
    const first=make("option","",placeholder);first.value="";s.append(first);
    (items||[]).forEach(item=>{const o=make("option","",item.label);o.value=item.value;s.append(o);});
    return s;
  };
  const formatBytes=value=>{
    const n=Number(value||0);
    if(n<1024)return n+" B";
    if(n<1048576)return (n/1024).toFixed(1)+" KB";
    if(n<1073741824)return (n/1048576).toFixed(1)+" MB";
    return (n/1073741824).toFixed(2)+" GB";
  };
  const when=value=>{
    const d=new Date(value||0);return !value||Number.isNaN(d.getTime())?"—":d.toLocaleString();
  };
  const placementName=key=>PLACEMENTS.find(item=>item[0]===key)?.[1]||String(key||"").replaceAll("_"," ");
  const statusLabel=value=>String(value||"draft").replaceAll("_"," ");

  function mount(panel,api){
    if(!panel||panel.querySelector("#admin-logo-center"))return;
    const root=make("section","admin-control-centre-section admin-logo-center");
    root.id="admin-logo-center";
    root.setAttribute("aria-labelledby","admin-logo-center-title");
    const top=make("div","brand-center-heading");
    const copy=make("div","brand-center-heading-copy");
    copy.append(make("p","brand-eyebrow","MINGLORA BRAND IDENTITY"),make("h2","","Logo Center"),
      make("p","brand-intro","Manage official logo files, collections, versions, application placements and brand identity from one protected workspace."));
    top.append(copy,button("Refresh",()=>load(),"quiet"));
    const status=make("div","brand-status");
    status.setAttribute("role","status");status.setAttribute("aria-live","polite");
    const tabs=make("nav","brand-tabs");tabs.setAttribute("aria-label","Logo Center sections");
    const view=make("div","brand-view");
    root.append(top,status,tabs,view);panel.append(root);

    const state={data:null,tab:"dashboard",query:"",uploadAssetId:"",busy:false};
    const say=(text,error)=>{
      status.textContent=text||"";
      status.classList.toggle("is-error",!!error);
      status.classList.toggle("is-success",!!text&&!error);
    };
    const post=(brandAction,payload)=>{
      return api("/admin/logo-center/action",{method:"POST",body:JSON.stringify({brandAction,payload:payload||{}})});
    };
    const load=async()=>{
      if(state.busy)return;state.busy=true;say("Loading verified brand records…");
      try{
        const q=new URLSearchParams();if(state.query)q.set("search",state.query);
        state.data=await api("/admin/logo-center"+(q.size?"?"+q.toString():""));
        say("");render();
      }catch(error){say(error.message||"Logo Center records could not be loaded.",true);}
      finally{state.busy=false;}
    };
    const run=async(action,payload,message)=>{
      try{await post(action,payload);say(message||"Logo Center updated.");await load();}
      catch(error){say(error.message||"The requested Logo Center action failed.",true);}
    };
    const cats=()=> (state.data?.categories||[]).map(x=>({value:x.id,label:x.name}));
    const cols=()=> (state.data?.collections||[]).map(x=>({value:x.id,label:x.name}));
    const approved=()=> (state.data?.assets||[]).filter(x=>["approved","active"].includes(x.status)&&x.approved_version_id&&x.approved_version_id===x.current_version_id).map(x=>({value:x.id,label:x.title}));
    const title=(heading,sub)=>{
      const h=make("div","brand-section-heading");h.append(make("h3","",heading),make("p","",sub));return h;
    };
    const empty=(heading,body)=>{
      const e=make("div","brand-empty");e.append(make("strong","",heading),make("p","",body));return e;
    };
    const stat=(name,value,sub)=>{
      const e=make("article","brand-stat-card");
      e.append(make("span","brand-stat-label",name),make("strong","brand-stat-value",value),make("small","",sub));return e;
    };
    const setTab=key=>{state.tab=key;render();};
    const renderTabs=()=>{
      tabs.replaceChildren();
      TABS.forEach(item=>{
        const b=button(item[1],()=>setTab(item[0]),state.tab===item[0]?"primary":"quiet");
        b.dataset.tab=item[0];b.classList.toggle("is-active",state.tab===item[0]);tabs.append(b);
      });
    };
    const addAssetSummary=(container,a)=>{
      const row=make("div","brand-asset-row");
      const thumb=make("div","brand-asset-mini");
      if(a.previewUrl&&String(a.mime_type||"").startsWith("image/")){
        const img=make("img");img.src=a.previewUrl;img.alt=a.title;img.loading="lazy";thumb.append(img);
      }else thumb.append(make("span","","▧"));
      const info=make("div","brand-asset-row-info");
      info.append(make("strong","",a.title),make("small","",String(a.file_format||"").toUpperCase()+" · "+formatBytes(a.byte_size)+" · "+Number(a.version_count||0)+" version(s)"));
      row.append(thumb,info,make("span","brand-state",statusLabel(a.status)));container.append(row);
    };

    function renderDashboard(){
      const d=state.data||{},s=d.stats||{};
      view.append(title("Brand operations overview","Current counts from Minglora's private brand records."));
      const grid=make("div","brand-stats-grid");
      grid.append(stat("Total logos",Number(s.total||0).toLocaleString(),"Uploaded assets"),
        stat("Approved / active",Number(s.approved||0)+Number(s.active||0),"Eligible versions"),
        stat("Drafts",Number(s.draft||0),"Awaiting review"),
        stat("Archived",Number(s.archived||0),"Recoverable assets"),
        stat("Scheduled",Number(s.scheduled||0),"Pending schedule records"),
        stat("Storage used",formatBytes(s.bytes),"Recorded file size"));
      view.append(grid);
      const colsWrap=make("div","brand-dashboard-columns");
      const recent=make("div","brand-panel");recent.append(title("Recently changed logos","Latest uploaded and updated assets."));
      const assets=(d.assets||[]).slice(0,6);
      if(!assets.length)recent.append(empty("No uploaded logos yet","Upload the verified Enigma master artwork or another original Minglora brand asset to begin."));
      else assets.forEach(a=>addAssetSummary(recent,a));
      const placements=make("div","brand-panel");placements.append(title("Published placements","Locations currently active in the brand manifest."));
      const active=(d.assignments||[]).filter(x=>x.status==="active");
      if(!active.length)placements.append(empty("No active logo placements","No new replacement is live. Existing application branding remains unchanged."));
      else active.forEach(a=>{
        const row=make("div","brand-list-row");row.append(make("strong","",placementName(a.placement_key)),make("span","brand-state brand-state-active","Active"));placements.append(row);
      });
      colsWrap.append(recent,placements);view.append(colsWrap);
      view.append(make("p","brand-note","Original files and every version remain stored privately under unique paths. Nothing is published until an approved version is explicitly assigned and published."));
    }

    function renderLibrary(){
      view.append(title("Logo Library","Search, filter, preview, approve, archive and restore uploaded assets."));
      const tools=make("div","brand-library-tools");
      const search=field("search","Search by title or original name",state.query);search.setAttribute("aria-label","Search logo library");
      const category=select("All categories",cats());const collection=select("All collections",cols());
      const apply=button("Apply filters",async()=>{
        state.query=search.value.trim();
        try{
          const q=new URLSearchParams();if(state.query)q.set("search",state.query);
          if(category.value)q.set("categoryId",category.value);if(collection.value)q.set("collectionId",collection.value);
          state.data=await api("/admin/logo-center"+(q.size?"?"+q.toString():""));render();
        }catch(error){say(error.message||"Filters could not be applied.",true);}
      },"primary");
      tools.append(search,category,collection,apply,button("Reset",()=>{state.query="";load();},"quiet"));view.append(tools);
      const items=state.data?.assets||[];
      if(!items.length){view.append(empty("No matching logo assets","Upload an original logo file to create a verifiable library record."));return;}
      const cards=make("div","brand-asset-grid");
      items.forEach(a=>{
        const card=make("article","brand-asset-card");
        const preview=make("div","brand-asset-preview");
        if(a.previewUrl&&String(a.mime_type||"").startsWith("image/")){
          const img=make("img");img.src=a.previewUrl;img.alt=a.title;img.loading="lazy";preview.append(img);
        }else if(a.previewUrl&&String(a.mime_type||"").startsWith("video/")){
          const video=make("video");video.src=a.previewUrl;video.controls=true;video.preload="metadata";video.setAttribute("aria-label",a.title);preview.append(video);
        }else preview.append(make("div","brand-file-placeholder",String(a.file_format||"ASSET").toUpperCase()));
        const detail=make("div","brand-asset-details");
        detail.append(make("h4","",a.title),make("p","",(a.category_name||"Uncategorized")+" · "+(a.collection_name||"No collection")+" · "+formatBytes(a.byte_size)));
        const meta=make("div","brand-asset-meta");meta.append(make("span","brand-state",statusLabel(a.status)),make("span","",Number(a.version_count||0)+" version(s)"));detail.append(meta);
        const actions=make("div","brand-asset-actions");
        actions.append(button(a.is_favorite?"★ Saved":"☆ Favorite",()=>run("favorite_toggle",{assetId:a.id},"Favorite updated."),"quiet"));
        actions.append(button("New version",()=>{state.uploadAssetId=a.id;setTab("upload");say("Choose a new source file. The existing logo version will remain preserved.");},"quiet"));
        if(a.current_version_id&&a.approved_version_id!==a.current_version_id)actions.append(button("Approve current version",()=>run("asset_approve",{assetId:a.id},"Current logo version approved."),"primary"));
        if(a.status==="archived")actions.append(button("Restore",()=>run("asset_status",{assetId:a.id,status:"draft"},"Logo restored as a draft."),"quiet"));
        else if(a.status!=="deleted")actions.append(button("Archive",()=>run("asset_status",{assetId:a.id,status:"archived"},"Logo archived and retained."),"quiet"));
        if(a.previewUrl){
          const open=make("a","brand-button brand-button-quiet","Open file");
          open.href=a.previewUrl;open.target="_blank";open.rel="noopener noreferrer";actions.append(open);
        }
        card.append(preview,detail,actions);cards.append(card);
      });
      view.append(cards);
      const versions=make("div","brand-panel");versions.append(title("Version history","Recent immutable uploads. Older original versions are never overwritten."));
      (state.data?.versions||[]).slice(0,30).forEach(v=>{
        const row=make("div","brand-list-row");
        row.append(make("strong","", "Version "+v.version_number+" · "+v.original_name),make("span","",when(v.created_at)),make("span","brand-state",v.is_approved?"Approved":"Unapproved"));
        if(v.previewUrl){const link=make("a","brand-inline-link","Preview");link.href=v.previewUrl;link.target="_blank";link.rel="noopener noreferrer";row.append(link);}
        versions.append(row);
      });
      view.append(versions);
    }

    function renderUpload(){
      view.append(title("Upload manager","Create an original logo asset or append a new immutable version to an existing logo."));
      const form=make("form","brand-form-grid");
      const existing=(state.data?.assets||[]).find(a=>a.id===state.uploadAssetId);
      const name=field("text","Logo title",existing?.title||"");name.required=true;name.maxLength=120;
      const file=field("file");file.accept=ACCEPTED;file.required=!state.uploadAssetId;
      const category=select("Select a category",cats());const collection=select("Select a collection",cols());
      const desc=make("textarea","brand-textarea");desc.placeholder="Description and usage notes";desc.rows=3;desc.maxLength=2000;
      const note=make("textarea","brand-textarea");note.placeholder="Version notes (optional)";note.rows=2;note.maxLength=500;
      const info=make("div","brand-upload-file-info",existing?"New upload for: "+existing.title:"New logo upload. The file remains private until approved.");
      const submit=make("button","brand-button brand-button-primary","Upload and verify");submit.type="submit";
      form.append(label("Logo title",name),label("Category",category),label("Collection",collection),
        label("Logo file",file),label("Description",desc),label("Version notes",note),info,submit);
      form.addEventListener("submit",async event=>{
        event.preventDefault();const selected=file.files?.[0];
        if(!selected){say("Select a logo file to upload.",true);return;}
        if(!ACCEPTED.split(",").includes(selected.type)||selected.size<1||selected.size>50*1024*1024){say("File type or size is not supported. Maximum is 50 MB.",true);return;}
        submit.disabled=true;info.textContent="Preparing a private upload session…";
        try{
          const prep=await fetch("/api/admin/logo-center/upload/prepare",{
            method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json","Accept":"application/json"},
            body:JSON.stringify({assetId:state.uploadAssetId||undefined,title:name.value.trim(),fileName:selected.name,
              mimeType:selected.type,byteSize:selected.size,categoryId:category.value||"",collectionId:collection.value||"",
              description:desc.value,changeNote:note.value})
          });
          const prepared=await prep.json().catch(()=>({}));if(!prep.ok)throw new Error(prepared.error||"Could not prepare the upload.");
          info.textContent="Uploading original file to private Supabase Storage…";
          const uploaded=await fetch(prepared.signedUrl,{
            method:"POST",headers:{"apikey":prepared.apiKey,"Content-Type":selected.type,"x-upsert":"false","cache-control":"3600"},
            body:selected
          });
          if(!uploaded.ok){const problem=await uploaded.json().catch(()=>({}));throw new Error(problem.message||problem.error||"Storage rejected the file upload.");}
          let width=null,height=null,durationMs=null;
          if(selected.type.startsWith("image/")){
            const objectUrl=URL.createObjectURL(selected);
            try{const image=new Image();await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src=objectUrl;});width=image.naturalWidth;height=image.naturalHeight;}catch{}
            URL.revokeObjectURL(objectUrl);
          }else if(selected.type.startsWith("video/")){
            const objectUrl=URL.createObjectURL(selected);
            try{const video=document.createElement("video");video.preload="metadata";video.src=objectUrl;
              await new Promise((resolve,reject)=>{video.onloadedmetadata=resolve;video.onerror=reject;});
              width=video.videoWidth;height=video.videoHeight;durationMs=Number.isFinite(video.duration)?Math.round(video.duration*1000):null;}catch{}
            URL.revokeObjectURL(objectUrl);
          }
          info.textContent="Checking the file signature and recording its version…";
          const complete=await fetch("/api/admin/logo-center/upload/complete",{
            method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json","Accept":"application/json"},
            body:JSON.stringify({assetId:prepared.assetId,versionId:prepared.versionId,width,height,durationMs})
          });
          const saved=await complete.json().catch(()=>({}));if(!complete.ok)throw new Error(saved.error||"File verification failed.");
          state.uploadAssetId="";state.tab="library";await load();
          say("Logo upload verified and stored as version "+(saved.versionNumber||1)+". It is still a draft and is not published.");
        }catch(error){say(error.message||"Logo upload failed.",true);info.textContent="Upload incomplete. Existing versions were preserved.";}
        finally{submit.disabled=false;}
      });
      view.append(form);
      view.append(make("p","brand-note","Formats: SVG, PNG/APNG, JPEG, WebP, GIF, ICO, Lottie JSON, MP4 and WebM. Maximum 50 MB per file. SVG content is checked for active markup before preview."));
    }

    function renderCollections(){
      view.append(title("Collections & categories","All requested system logo categories are available. Add custom categories and unlimited collections as storage permits."));
      const columns=make("div","brand-dashboard-columns");
      const category=make("div","brand-panel");category.append(title("Logo categories","Built-in categories are protected. New custom categories can be added below."));
      const catForm=make("form","brand-compact-form");const catName=field("text","New category name");catName.required=true;catName.maxLength=80;
      const catDesc=field("text","Description (optional)");catDesc.maxLength=500;
      const catSubmit=make("button","brand-button brand-button-primary","Add category");catSubmit.type="submit";
      catForm.append(label("Category name",catName),label("Description",catDesc),catSubmit);
      catForm.addEventListener("submit",async e=>{e.preventDefault();catSubmit.disabled=true;await run("category_create",{name:catName.value,description:catDesc.value},"Category created.");catName.value="";catDesc.value="";catSubmit.disabled=false;});
      category.append(catForm);
      (state.data?.categories||[]).forEach(c=>{const row=make("div","brand-list-row");row.append(make("strong","",c.name),make("span","",c.is_system?"System":"Custom"));category.append(row);});
      const collection=make("div","brand-panel");collection.append(title("Logo collections","The Enigma Branding collection exists as an empty, real collection until verified artwork is added."));
      const colForm=make("form","brand-compact-form");const colName=field("text","New collection name");colName.required=true;colName.maxLength=100;
      const colDesc=field("text","Description (optional)");colDesc.maxLength=1000;
      const colSubmit=make("button","brand-button brand-button-primary","Create collection");colSubmit.type="submit";
      colForm.append(label("Collection name",colName),label("Description",colDesc),colSubmit);
      colForm.addEventListener("submit",async e=>{e.preventDefault();colSubmit.disabled=true;await run("collection_create",{name:colName.value,description:colDesc.value},"Collection created.");colName.value="";colDesc.value="";colSubmit.disabled=false;});
      collection.append(colForm);
      (state.data?.collections||[]).forEach(c=>{const row=make("div","brand-list-row");row.append(make("strong","",c.name),make("span","",c.is_system?"System":"Custom"));collection.append(row);});
      columns.append(category,collection);view.append(columns);
    }

    function renderPlacements(){
      view.append(title("Logo placement manager","Choose an approved version, prepare a placement for approval, then publish it to the live brand manifest."));
      const form=make("form","brand-form-grid");
      const place=select("Application location",PLACEMENTS.map(x=>({value:x[0],label:x[1]})));
      const asset=select("Approved logo",approved());
      const submit=make("button","brand-button brand-button-primary","Prepare placement");submit.type="submit";
      form.append(label("Application location",place),label("Approved logo",asset),submit);
      form.addEventListener("submit",async e=>{e.preventDefault();if(!place.value||!asset.value){say("Select a location and an approved logo.",true);return;}submit.disabled=true;await run("assignment_set",{placementKey:place.value,assetId:asset.value},"Placement is pending publication approval.");submit.disabled=false;});
      const panelWrap=make("div","brand-panel");panelWrap.append(title("Pending and published placements","Only published assignments appear in the public brand manifest."));
      (state.data?.assignments||[]).forEach(item=>{
        const row=make("div","brand-list-row");const meta=make("div","brand-list-row-main");
        meta.append(make("strong","",placementName(item.placement_key)),make("small","",statusLabel(item.status)));
        row.append(meta);
        if(item.status==="pending_approval")row.append(button("Publish",()=>run("assignment_publish",{placementKey:item.placement_key},"Placement published."),"primary"));
        if(item.status==="active")row.append(button("Rollback",()=>run("assignment_rollback",{placementKey:item.placement_key},"Placement rollback recorded."),"quiet"));
        panelWrap.append(row);
      });
      if(!(state.data?.assignments||[]).length)panelWrap.append(empty("No logo placements yet","Choose an approved logo to prepare the first placement."));
      view.append(form,panelWrap);
    }

    function renderIdentity(){
      const settings=state.data?.identitySettings?.settings||{};
      view.append(title("Brand Identity Center","Save platform-wide brand colors, typography and usage guidance independently from individual logo files."));
      const form=make("form","brand-form-grid");
      const primary=field("color","",settings.primaryColor||"#1769e0");
      const secondary=field("color","",settings.secondaryColor||"#20263a");
      const accent=field("color","",settings.accentColor||"#7b61ff");
      const background=field("color","",settings.backgroundColor||"#ffffff");
      const font=field("text","Font family",settings.fontFamily||"");
      const weight=field("text","Font weight",settings.fontWeight||"");
      const spacing=field("text","Spacing rule",settings.spacingRule||"");
      const guidance=field("text","Usage guidelines",settings.usageGuidance||"");
      const submit=make("button","brand-button brand-button-primary","Save identity settings");submit.type="submit";
      form.append(label("Primary color",primary),label("Secondary color",secondary),label("Accent color",accent),
        label("Background color",background),label("Typography family",font),label("Typography weight",weight),
        label("Spacing rule",spacing),label("Usage guidelines",guidance),submit);
      form.addEventListener("submit",async e=>{e.preventDefault();await run("identity_update",{settings:{
        primaryColor:primary.value,secondaryColor:secondary.value,accentColor:accent.value,backgroundColor:background.value,
        fontFamily:font.value.trim(),fontWeight:weight.value.trim(),spacingRule:spacing.value.trim(),usageGuidance:guidance.value.trim()
      }},"Brand identity settings saved.");});
      view.append(form);
      const preview=make("div","brand-identity-preview");
      [primary,secondary,accent].forEach((control,i)=>{const swatch=make("span","brand-identity-swatch",["Primary","Secondary","Accent"][i]);swatch.style.background=control.value;control.addEventListener("input",()=>{swatch.style.background=control.value;});preview.append(swatch);});
      view.append(preview);
    }

    function renderScheduling(){
      view.append(title("Logo scheduling","Register future brand changes in an explicit IANA timezone. Activation remains pending until the scheduler worker is deployed and verified."));
      const form=make("form","brand-form-grid");
      const place=select("Application location",PLACEMENTS.map(x=>({value:x[0],label:x[1]})));
      const asset=select("Approved logo",approved());
      const start=field("datetime-local");const expiry=field("datetime-local");
      const zone=field("text","IANA timezone",Intl.DateTimeFormat().resolvedOptions().timeZone||"America/Jamaica");
      const submit=make("button","brand-button brand-button-primary","Save schedule");submit.type="submit";
      form.append(label("Location",place),label("Approved logo",asset),label("Activation time",start),label("Optional expiry",expiry),label("Timezone",zone),submit);
      form.addEventListener("submit",async e=>{e.preventDefault();if(!place.value||!asset.value||!start.value){say("Choose a placement, logo and future activation time.",true);return;}
        await run("schedule_create",{placementKey:place.value,assetId:asset.value,activatesAt:new Date(start.value).toISOString(),
          expiresAt:expiry.value?new Date(expiry.value).toISOString():null,timezone:zone.value.trim()||"America/Jamaica"},
          "Schedule saved. Automated activation is not enabled yet.");});
      const list=make("div","brand-panel");list.append(title("Scheduled changes","Future activation requests currently recorded."));
      (state.data?.schedules||[]).forEach(item=>{const row=make("div","brand-list-row");row.append(make("strong","",placementName(item.placement_key)),make("span","",when(item.activates_at)));
        row.append(button("Cancel",()=>run("schedule_cancel",{scheduleId:item.id},"Schedule cancelled."),"quiet"));list.append(row);});
      if(!(state.data?.schedules||[]).length)list.append(empty("No scheduled changes","Scheduled branding changes will appear here."));
      view.append(form,list);
    }

    function renderActivity(){
      view.append(title("Activity & history","Recent actions from the Logo Center, including upload preparation, versions, approvals and publication."));
      const panelWrap=make("div","brand-panel");
      (state.data?.activity||[]).forEach(item=>{
        const row=make("div","brand-list-row");
        row.append(make("strong","",String(item.action||"").replaceAll("."," · ")),make("span","",when(item.created_at)));
        if(item.details&&Object.keys(item.details).length)row.append(make("small","",JSON.stringify(item.details)));
        panelWrap.append(row);
      });
      if(!(state.data?.activity||[]).length)panelWrap.append(empty("No activity recorded","New actions will appear here when Logo Center data changes."));
      view.append(panelWrap);
    }

    function render(){
      renderTabs();view.replaceChildren();if(!state.data)return;
      if(state.tab==="dashboard")renderDashboard();
      else if(state.tab==="library")renderLibrary();
      else if(state.tab==="upload")renderUpload();
      else if(state.tab==="collections")renderCollections();
      else if(state.tab==="placements")renderPlacements();
      else if(state.tab==="identity")renderIdentity();
      else if(state.tab==="scheduling")renderScheduling();
      else if(state.tab==="activity")renderActivity();
    }
    load();
  }
  window.MingloraAdminLogoCenter=Object.freeze({mount});
})();
