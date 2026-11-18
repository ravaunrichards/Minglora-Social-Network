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
  const TABS=[
    ["dashboard","Logo Center Dashboard"],["library","Logo Library"],
    ["collections","Logo Collections"],["categories","Logo Categories"],
    ["upload","Logo Upload Manager"],["design","Logo Design Studio"],
    ["editing","Logo Editing Studio"],["mockups","Logo Mockup Studio"],
    ["placements","Logo Placement Manager"],["identity","Brand Identity Center"],
    ["assets","Brand Asset Library"],["deployment","Brand Deployment Manager"],
    ["scheduling","Logo Scheduling"],["versions","Logo Version History"],
    ["recovery","Brand Backup & Recovery"],["security","Brand Security & Permissions"],
    ["analytics","Brand Analytics"],["settings","Brand Settings"],
    ["complete","Complete Logo Library"]
  ];
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
  const zonedDateTimeToIso=(value,timeZone)=>{
    const halves=String(value||"").split("T"),date=(halves[0]||"").split("-").map(Number),time=(halves[1]||"").split(":").map(Number);
    if(date.length!==3||time.length<2||[...date,...time].some(n=>!Number.isFinite(n)))throw new Error("Enter a valid date and time.");
    const target={year:date[0],month:date[1],day:date[2],hour:time[0],minute:time[1]};
    const desiredUtc=Date.UTC(target.year,target.month-1,target.day,target.hour,target.minute);
    const formatter=new Intl.DateTimeFormat("en-CA",{timeZone:timeZone||"America/Jamaica",hourCycle:"h23",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit"});
    const partsFor=instant=>Object.fromEntries(formatter.formatToParts(instant).filter(part=>part.type!=="literal").map(part=>[part.type,Number(part.value)]));
    const parts=partsFor(new Date(desiredUtc)),representedUtc=Date.UTC(parts.year,parts.month-1,parts.day,parts.hour,parts.minute,parts.second);
    const candidate=new Date(desiredUtc-(representedUtc-desiredUtc)),check=partsFor(candidate);
    if(check.year!==target.year||check.month!==target.month||check.day!==target.day||check.hour!==target.hour||check.minute!==target.minute)throw new Error("That local time is invalid in the selected timezone. Choose another time.");
    return candidate.toISOString();
  };
  const downloadJson=(name,data)=>{
    const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"}),url=URL.createObjectURL(blob),link=make("a");
    link.href=url;link.download=name;document.body.append(link);link.click();link.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1000);
  };

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

    const state={data:null,tab:"dashboard",query:"",uploadAssetId:"",duplicateAssetId:"",studioSourceId:"",mockupAssetId:"",editorImage:null,editorBlob:null,busy:false};
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
    const imageAssets=()=> (state.data?.assets||[]).filter(x=>String(x.mime_type||"").startsWith("image/")&&x.previewUrl&&x.status!=="deleted");
    const loadEditorImage=async asset=>new Promise((resolve,reject)=>{
      const image=new Image();image.crossOrigin="anonymous";image.onload=()=>resolve(image);image.onerror=()=>reject(new Error("The selected logo preview could not be loaded."));image.src=asset.previewUrl;
    });
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
      view.append(title("Overview · Brand operations","Current counts from Minglora's private brand records."));
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

    function renderLibrary(heading="Logo Library"){
      view.append(title(heading,"Search, filter, preview, approve, archive, restore and manage verified brand assets."));
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
        actions.append(button("New version",()=>{state.uploadAssetId=a.id;state.duplicateAssetId="";setTab("upload");say("Choose a new source file. The existing logo version will remain preserved.");},"quiet"));
        actions.append(button("Duplicate",()=>{state.uploadAssetId="";state.duplicateAssetId=a.id;setTab("upload");say("Choose the original file to create a separate copy. The source asset remains unchanged.");},"quiet"));
        if(String(a.mime_type||"").startsWith("image/")){
          actions.append(button("Design",()=>{state.studioSourceId=a.id;state.editorImage=null;state.editorBlob=null;setTab("design");},"quiet"));
          actions.append(button("Mockup",()=>{state.mockupAssetId=a.id;setTab("mockups");},"quiet"));
        }
        if(a.current_version_id&&a.approved_version_id!==a.current_version_id)actions.append(button("Approve current version",()=>run("asset_approve",{assetId:a.id},"Current logo version approved."),"primary"));
        if(a.status==="archived")actions.append(button("Restore",()=>run("asset_status",{assetId:a.id,status:"draft"},"Logo restored as a draft."),"quiet"));
        else if(a.status!=="deleted")actions.append(button("Archive",()=>run("asset_status",{assetId:a.id,status:"archived"},"Logo archived and retained."),"quiet"));
        const edit=make("details","brand-panel brand-asset-edit");
        edit.append(make("summary","","Edit title, description, category and collection"));
        const editForm=make("form","brand-form-grid");
        const editTitle=field("text","Logo title",a.title);editTitle.required=true;editTitle.maxLength=120;
        const editDescription=make("textarea","brand-textarea");editDescription.value=a.description||"";editDescription.rows=3;editDescription.maxLength=2000;
        const editCategory=select("Select a category",cats());editCategory.value=a.category_id||"";
        const editCollection=select("Select a collection",cols());editCollection.value=a.collection_id||"";
        const editSave=make("button","brand-button brand-button-primary","Save asset details");editSave.type="submit";
        editForm.append(label("Title",editTitle),label("Description",editDescription),label("Category",editCategory),label("Collection",editCollection),editSave);
        editForm.addEventListener("submit",async event=>{
          event.preventDefault();
          await run("asset_update",{assetId:a.id,title:editTitle.value.trim(),description:editDescription.value,categoryId:editCategory.value||null,collectionId:editCollection.value||null},"Logo details updated.");
        });
        edit.append(editForm);
        if(a.previewUrl){
          const open=make("a","brand-button brand-button-quiet","Open file");
          open.href=a.previewUrl;open.target="_blank";open.rel="noopener noreferrer";actions.append(open);
        }
        card.append(preview,detail,actions,edit);cards.append(card);
      });
      view.append(cards);
      const versions=make("div","brand-panel");versions.append(title("Version history","Recent immutable uploads. Older original versions are never overwritten."));
      (state.data?.versions||[]).slice(0,30).forEach(v=>{
        const row=make("div","brand-list-row");
        row.append(make("strong","", "Version "+v.version_number+" · "+v.original_name),make("span","",when(v.created_at)),make("span","brand-state",v.is_approved?"Approved":"Unapproved"));
        if(v.previewUrl){const link=make("a","brand-inline-link","Preview");link.href=v.previewUrl;link.target="_blank";link.rel="noopener noreferrer";row.append(link);}
        if(v.asset_id)row.append(button("Restore version",()=>run("version_restore",{assetId:v.asset_id,versionId:v.id},"Previous immutable version restored. Reapprove it before publishing when required."),"quiet"));
        versions.append(row);
      });
      view.append(versions);
    }

    function renderUpload(){
      view.append(title("Upload manager","Create an original logo asset or append a new immutable version to an existing logo."));
      const form=make("form","brand-form-grid");
      const existing=(state.data?.assets||[]).find(a=>a.id===state.uploadAssetId);
      const duplicate=(state.data?.assets||[]).find(a=>a.id===state.duplicateAssetId);
      const name=field("text","Logo title",existing?.title||(duplicate?"Copy of "+duplicate.title:""));name.required=true;name.maxLength=120;
      const file=field("file");file.accept=ACCEPTED;file.required=!state.uploadAssetId;
      const category=select("Select a category",cats());const collection=select("Select a collection",cols());
      category.value=existing?.category_id||duplicate?.category_id||"";
      collection.value=existing?.collection_id||duplicate?.collection_id||"";
      const desc=make("textarea","brand-textarea");desc.placeholder="Description and usage notes";desc.rows=3;desc.maxLength=2000;desc.value=existing?.description||duplicate?.description||"";
      const note=make("textarea","brand-textarea");note.placeholder="Version notes (optional)";note.rows=2;note.maxLength=500;
      const info=make("div","brand-upload-file-info",existing?"New upload for: "+existing.title:duplicate?"Create a separate copy of "+duplicate.title+". Select the original file; the source remains unchanged.":"New logo upload. The file remains private until approved.");
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
          state.uploadAssetId="";state.duplicateAssetId="";state.tab="library";await load();
          say("Logo upload verified and stored as version "+(saved.versionNumber||1)+". It is still a draft and is not published.");
        }catch(error){say(error.message||"Logo upload failed.",true);info.textContent="Upload incomplete. Existing versions were preserved.";}
        finally{submit.disabled=false;}
      });
      view.append(form);
      view.append(make("p","brand-note","Formats: SVG, PNG/APNG, JPEG, WebP, GIF, ICO, Lottie JSON, MP4 and WebM. Maximum 50 MB per file. SVG content is checked for active markup before preview."));
    }

    async function renderDesign(){
      view.append(title("Logo Design Studio","Crop, resize, rotate and change the canvas background. Each export becomes a separate new asset; the source logo and approved versions stay untouched."));
      const sources=imageAssets();
      if(!sources.length){view.append(empty("No image logos to edit","Upload a verified image logo first. Video assets and animation files remain available in the library but are not raster-edited here."));return;}
      const controls=make("div","brand-editor-controls");
      const source=select("Choose source logo",sources.map(a=>({value:a.id,label:a.title+" · v"+(a.version_count||1)})));
      source.value=state.studioSourceId||sources[0].id;
      state.studioSourceId=source.value;
      const sourceAsset=sources.find(a=>a.id===state.studioSourceId)||sources[0];
      const cropX=field("number","Crop left (%)","0");cropX.min="0";cropX.max="99";cropX.step="1";
      const cropY=field("number","Crop top (%)","0");cropY.min="0";cropY.max="99";cropY.step="1";
      const cropW=field("number","Crop width (%)","100");cropW.min="1";cropW.max="100";cropW.step="1";
      const cropH=field("number","Crop height (%)","100");cropH.min="1";cropH.max="100";cropH.step="1";
      const width=field("number","Output width (px)","1200");width.min="1";width.max="4096";
      const height=field("number","Output height (px)","1200");height.min="1";height.max="4096";
      const rotation=select("Rotation",[{value:"0",label:"0°"},{value:"90",label:"90°"},{value:"180",label:"180°"},{value:"270",label:"270°"}]);
      const background=field("color","Canvas background","#ffffff");
      const transparent=field("checkbox");transparent.checked=true;
      const transparentLabel=label("Keep transparent background",transparent);
      const outputName=field("text","New logo title",sourceAsset.title+" — Edited");outputName.maxLength=120;
      const sourceSelect=label("Source logo",source);
      sourceSelect.classList.add("brand-field-wide");
      controls.append(sourceSelect,label("Crop left %",cropX),label("Crop top %",cropY),
        label("Crop width %",cropW),label("Crop height %",cropH),
        label("Output width",width),label("Output height",height),
        label("Rotate",rotation),label("Background",background),
        transparentLabel,label("Save as a new logo",outputName));
      const work=make("div","brand-editor-preview");
      const canvas=make("canvas","brand-editor-canvas");
      canvas.setAttribute("aria-label","Edited logo preview");
      const placeholder=empty("Preview not rendered","Choose your crop and output options, then render the preview.");
      work.append(canvas,placeholder);
      const controlsRow=make("div","brand-editor-actions");
      const previewButton=button("Render preview",async()=>{
        try{
          previewButton.disabled=true;
          const asset=imageAssets().find(a=>a.id===source.value);
          if(!asset)throw new Error("Select an available logo asset.");
          if(!state.editorImage||state.studioSourceId!==asset.id){
            state.studioSourceId=asset.id;
            state.editorImage=await loadEditorImage(asset);
          }
          const image=state.editorImage;
          const left=Math.max(0,Math.min(99,Number(cropX.value)||0));
          const top=Math.max(0,Math.min(99,Number(cropY.value)||0));
          const cropWidth=Math.max(1,Math.min(100-left,Number(cropW.value)||100));
          const cropHeight=Math.max(1,Math.min(100-top,Number(cropH.value)||100));
          const sourceX=Math.round(image.naturalWidth*left/100);
          const sourceY=Math.round(image.naturalHeight*top/100);
          const sourceWidth=Math.max(1,Math.round(image.naturalWidth*cropWidth/100));
          const sourceHeight=Math.max(1,Math.round(image.naturalHeight*cropHeight/100));
          const outputWidth=Math.max(1,Math.min(4096,Math.round(Number(width.value)||1200)));
          const outputHeight=Math.max(1,Math.min(4096,Math.round(Number(height.value)||1200)));
          width.value=String(outputWidth);height.value=String(outputHeight);
          const cropped=document.createElement("canvas");
          cropped.width=outputWidth;cropped.height=outputHeight;
          const cropContext=cropped.getContext("2d");
          if(!cropContext)throw new Error("Canvas editing is not available in this browser.");
          cropContext.drawImage(image,sourceX,sourceY,sourceWidth,sourceHeight,0,0,outputWidth,outputHeight);
          const angle=(Number(rotation.value)||0)*Math.PI/180;
          const swap=Math.abs(Number(rotation.value))%180===90;
          const result=document.createElement("canvas");
          result.width=swap?outputHeight:outputWidth;
          result.height=swap?outputWidth:outputHeight;
          const context=result.getContext("2d");
          if(!context)throw new Error("Canvas editing is not available in this browser.");
          if(!transparent.checked){context.fillStyle=background.value;context.fillRect(0,0,result.width,result.height);}
          context.translate(result.width/2,result.height/2);
          context.rotate(angle);
          context.drawImage(cropped,-outputWidth/2,-outputHeight/2);
          const blob=await new Promise(resolve=>result.toBlob(resolve,"image/png"));
          if(!blob)throw new Error("The edited preview could not be exported.");
          state.editorBlob=blob;
          canvas.width=result.width;canvas.height=result.height;
          const display=canvas.getContext("2d");
          display.clearRect(0,0,canvas.width,canvas.height);
          display.drawImage(result,0,0);
          placeholder.remove();
          say("Preview rendered. Save it as a new asset to preserve the original.");
        }catch(error){say(error.message||"Could not render this logo.",true);}
        finally{previewButton.disabled=false;}
      },"primary");
      const saveButton=button("Save as new logo",async()=>{
        if(!state.editorBlob){say("Render a preview before saving the edited logo.",true);return;}
        if(!outputName.value.trim()){say("Enter a title for the new logo.",true);return;}
        saveButton.disabled=true;
        try{
          const asset=imageAssets().find(a=>a.id===source.value);
          if(!asset)throw new Error("The source logo is no longer available.");
          const file=new File([state.editorBlob],outputName.value.trim().replace(/[^\w.-]+/g,"-")+".png",{type:"image/png"});
          const prepare=await fetch("/api/admin/logo-center/upload/prepare",{
            method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json","Accept":"application/json"},
            body:JSON.stringify({title:outputName.value.trim(),fileName:file.name,mimeType:file.type,byteSize:file.size,
              categoryId:asset.category_id||"",collectionId:asset.collection_id||"",
              description:"Edited derivative of "+asset.title+". Original asset "+asset.id+" remains preserved.",
              changeNote:"Created as a new asset in Logo Design Studio; source original not overwritten."})
          });
          const prepared=await prepare.json().catch(()=>({}));
          if(!prepare.ok)throw new Error(prepared.error||"Could not prepare the edited logo upload.");
          const uploaded=await fetch(prepared.signedUrl,{
            method:"POST",headers:{"apikey":prepared.apiKey,"Content-Type":file.type,"x-upsert":"false","cache-control":"3600"},body:file
          });
          if(!uploaded.ok){const e=await uploaded.json().catch(()=>({}));throw new Error(e.message||e.error||"Private Storage rejected the edited logo.");}
          const complete=await fetch("/api/admin/logo-center/upload/complete",{
            method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json","Accept":"application/json"},
            body:JSON.stringify({assetId:prepared.assetId,versionId:prepared.versionId,width:canvas.width,height:canvas.height})
          });
          const saved=await complete.json().catch(()=>({}));
          if(!complete.ok)throw new Error(saved.error||"The edited logo could not be verified.");
          state.data=await api("/admin/logo-center");state.tab="library";state.editorBlob=null;render();
          say("Edited derivative saved as a separate draft logo. The source and approved original were not changed.");
        }catch(error){say(error.message||"The edited logo could not be saved.",true);}
        finally{saveButton.disabled=false;}
      },"primary");
      source.addEventListener("change",async()=>{
        state.studioSourceId=source.value;state.editorImage=null;state.editorBlob=null;
        const item=sources.find(a=>a.id===source.value);
        if(item)outputName.value=item.title+" — Edited";
        say("Source changed. Render a new preview before saving.");
      });
      controlsRow.append(previewButton,saveButton);
      view.append(controls,controlsRow,work);
    }

    function renderMockups(){
      view.append(title("Logo Mockup Studio","Inspect the selected logo against realistic web, phone, tablet, profile and live-stream preview surfaces. These previews do not publish or modify the source asset."));
      const sources=imageAssets();
      if(!sources.length){view.append(empty("No image logos to preview","Upload an image logo to preview its appearance in different placements."));return;}
      const picker=select("Choose a logo",sources.map(a=>({value:a.id,label:a.title})));
      picker.value=state.mockupAssetId||sources[0].id;
      state.mockupAssetId=picker.value;
      const source=sources.find(a=>a.id===picker.value)||sources[0];
      const info=make("p","brand-note","Previewing: "+source.title+" · "+(source.width||"—")+" × "+(source.height||"—")+" px · "+statusLabel(source.status));
      picker.addEventListener("change",()=>{state.mockupAssetId=picker.value;render();});
      view.append(label("Logo asset",picker),info);
      const grid=make("div","brand-mockup-grid");
      const mockups=[
        ["phone","Smartphone","Phone app header and profile"],
        ["tablet","Tablet","Tablet application header"],
        ["desktop","Desktop","Website header"],
        ["profile","Social profile","Avatar and cover layout"],
        ["live","LIVE streaming","Live header and watermark"],
        ["dark","Dark background","Logo contrast on dark surfaces"]
      ];
      mockups.forEach(([kind,name,desc])=>{
        const card=make("article","brand-mockup-card");
        card.append(make("strong","",""+name),make("small","",desc));
        const frame=make("div","brand-device-frame brand-device-"+kind);
        if(kind==="profile"){
          const cover=make("div","brand-profile-cover");
          const avatar=make("div","brand-profile-avatar");
          const img=make("img");img.src=source.previewUrl;img.alt=source.title;avatar.append(img);
          frame.append(cover,avatar);
        }else{
          const top=make("div","brand-device-top");
          top.append(make("span","","Minglora"));
          const img=make("img");img.src=source.previewUrl;img.alt=source.title;img.loading="lazy";
          frame.append(top,img);
        }
        card.append(frame);grid.append(card);
      });
      view.append(grid);
    }

    function renderCategories(){
      view.append(title("Logo Categories","Browse the protected standard categories and add unlimited custom logo categories."));
      const panelWrap=make("div","brand-panel"),form=make("form","brand-compact-form");
      const name=field("text","New category name");name.required=true;name.maxLength=80;
      const description=field("text","Description (optional)");description.maxLength=500;
      const submit=make("button","brand-button brand-button-primary","Add category");submit.type="submit";
      form.append(label("Category name",name),label("Description",description),submit);
      form.addEventListener("submit",async event=>{
        event.preventDefault();submit.disabled=true;await run("category_create",{name:name.value,description:description.value},"Category created.");
        name.value="";description.value="";submit.disabled=false;
      });
      panelWrap.append(form);
      (state.data?.categories||[]).forEach(category=>{
        const row=make("div","brand-list-row");row.append(make("strong","",category.name),make("span","",category.is_system?"System category":"Custom category"));panelWrap.append(row);
      });
      view.append(panelWrap);
    }

    function renderCollections(){
      view.append(title("Logo Collections","Organize approved logos and wider visual identity assets into reusable collections."));
      const panelWrap=make("div","brand-panel"),enigma=(state.data?.collections||[]).find(item=>item.slug==="enigma-branding");
      panelWrap.append(make("p","brand-note",enigma?"Enigma Branding is a real collection. It stays empty until approved Enigma source artwork is added; no sample logos are inserted.":"No Enigma collection record is currently available."));
      const form=make("form","brand-compact-form"),name=field("text","New collection name"),description=field("text","Description (optional)");
      name.required=true;name.maxLength=100;description.maxLength=1000;
      const submit=make("button","brand-button brand-button-primary","Create collection");submit.type="submit";
      form.append(label("Collection name",name),label("Description",description),submit);
      form.addEventListener("submit",async event=>{
        event.preventDefault();submit.disabled=true;await run("collection_create",{name:name.value,description:description.value},"Collection created.");
        name.value="";description.value="";submit.disabled=false;
      });
      panelWrap.append(form);
      (state.data?.collections||[]).forEach(collection=>{
        const row=make("div","brand-list-row");row.append(make("strong","",collection.name),make("span","",collection.is_system?"System collection":"Custom collection"));panelWrap.append(row);
      });
      view.append(panelWrap);
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
        const pendingAsset=(state.data?.assets||[]).find(asset=>asset.id===item.pending_asset_id);
        meta.append(make("strong","",placementName(item.placement_key)),make("small","",statusLabel(item.status)+(pendingAsset?" · Pending change: "+pendingAsset.title:"")));
        row.append(meta);
        const previewAssetId=item.pending_asset_id||item.asset_id;
        if(previewAssetId)row.append(button("Preview",()=>{state.mockupAssetId=previewAssetId;setTab("mockups");},"quiet"));
        if(item.pending_asset_id)row.append(button("Publish",()=>run("assignment_publish",{placementKey:item.placement_key},"Approved logo placement published."),"primary"));
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
      view.append(title("Logo scheduling","Approved changes activate automatically at their scheduled time and restore the previous approved placement when an expiry is reached."));
      const form=make("form","brand-form-grid");
      const place=select("Application location",PLACEMENTS.map(x=>({value:x[0],label:x[1]})));
      const asset=select("Approved logo",approved());
      const start=field("datetime-local");const expiry=field("datetime-local");
      const zone=field("text","IANA timezone","America/Jamaica");
      const submit=make("button","brand-button brand-button-primary","Save schedule");submit.type="submit";
      form.append(label("Location",place),label("Approved logo",asset),label("Activation time",start),label("Optional expiry",expiry),label("Timezone",zone),submit);
      form.addEventListener("submit",async e=>{e.preventDefault();if(!place.value||!asset.value||!start.value){say("Choose a placement, logo and future activation time.",true);return;}
        try{
          const timezone=zone.value.trim()||"America/Jamaica";
          await run("schedule_create",{placementKey:place.value,assetId:asset.value,activatesAt:zonedDateTimeToIso(start.value,timezone),
            expiresAt:expiry.value?zonedDateTimeToIso(expiry.value,timezone):null,timezone},
            "Schedule saved. Minglora will process activation and expiry automatically.");
        }catch(error){say(error.message||"The selected schedule time is invalid.",true);}
      });
      const list=make("div","brand-panel");list.append(title("Scheduled changes","Future activation requests currently recorded."));
      (state.data?.schedules||[]).forEach(item=>{const row=make("div","brand-list-row");row.append(make("strong","",placementName(item.placement_key)),make("span","",when(item.activates_at)));
        row.append(button("Cancel",()=>run("schedule_cancel",{scheduleId:item.id},"Schedule cancelled."),"quiet"));list.append(row);});
      if(!(state.data?.schedules||[]).length)list.append(empty("No scheduled changes","Scheduled branding changes will appear here."));
      view.append(form,list);
    }

    function renderVersionHistory(){
      view.append(title("Logo Version History","Every upload is retained as an immutable version. Restore an earlier version without overwriting its original file."));
      const panelWrap=make("div","brand-panel"),versions=state.data?.versions||[];
      if(!versions.length)panelWrap.append(empty("No versions recorded","Verified logo uploads and revisions will appear here."));
      versions.forEach(version=>{
        const row=make("div","brand-list-row"),asset=(state.data?.assets||[]).find(item=>item.id===version.asset_id);
        row.append(make("div","brand-list-row-main",(asset?.title||"Logo asset")+" · Version "+version.version_number),
          make("small","",version.original_name+" · "+formatBytes(version.byte_size)),make("span","",when(version.created_at)),
          make("span","brand-state",version.is_approved?"Approved":"Not approved"));
        if(version.previewUrl){const preview=make("a","brand-inline-link","Preview");preview.href=version.previewUrl;preview.target="_blank";preview.rel="noopener noreferrer";row.append(preview);}
        row.append(button("Restore version",()=>run("version_restore",{assetId:version.asset_id,versionId:version.id},
          "The selected immutable version is now current. Reapprove it before publishing when required."),"quiet"));
        panelWrap.append(row);
      });view.append(panelWrap);
    }
    function renderRecovery(){
      view.append(title("Brand Backup & Recovery","Archived assets and immutable originals remain in private Storage. Export a metadata snapshot or restore archived sources."));
      const exportButton=button("Download metadata recovery snapshot",()=>{
        const safe={format:"minglora-brand-metadata-backup-v1",exportedAt:new Date().toISOString(),
          note:"Metadata only. Original media remains stored in the private minglora-brand-assets bucket.",
          categories:state.data?.categories||[],collections:state.data?.collections||[],
          assets:(state.data?.assets||[]).map(({previewUrl,...asset})=>asset),
          versions:(state.data?.versions||[]).map(({previewUrl,...version})=>version),
          assignments:state.data?.assignments||[],schedules:state.data?.schedules||[],
          identitySettings:state.data?.identitySettings||null,activity:state.data?.activity||[]};
        downloadJson("minglora-brand-metadata-"+new Date().toISOString().replace(/[:.]/g,"-")+".json",safe);
        say("Metadata snapshot exported. Original media remains in private Storage.");
      },"primary");
      const panelWrap=make("div","brand-panel");
      panelWrap.append(exportButton,title("Archived assets","Restoring an archived asset preserves its historical versions."));
      const archived=(state.data?.assets||[]).filter(asset=>asset.status==="archived");
      if(!archived.length)panelWrap.append(empty("No archived assets","Archived branding is retained and can be restored here."));
      archived.forEach(asset=>{
        const row=make("div","brand-list-row");row.append(make("strong","",asset.title),make("span","",Number(asset.version_count||0)+" retained version(s)"));
        row.append(button("Restore as draft",()=>run("asset_status",{assetId:asset.id,status:"draft"},"Archived asset restored."),"quiet"));panelWrap.append(row);
      });view.append(panelWrap);
    }
    function renderSecurity(){
      view.append(title("Brand Security & Permissions","Official brand changes remain behind Minglora's designated-owner and active MFA verification gates."));
      const panelWrap=make("div","brand-panel");
      const rules=[
        ["Owner control","Official brand management is restricted to the designated platform owner."],
        ["MFA verification","Administrative writes and publishing require an active verified reviewer session."],
        ["Server-side enforcement","The API and database independently validate the owner, staff record and service-role boundary."],
        ["Member isolation","Ordinary member sessions cannot read private brand tables or write logo records."],
        ["Private media","Logo originals use the private minglora-brand-assets bucket and short-lived signed previews."],
        ["Audit protection","Brand activity logs are append-only; deployment history supports rollback."]
      ];
      rules.forEach(([name,description])=>{const row=make("div","brand-list-row");row.append(make("strong","",name),make("span","",description));panelWrap.append(row);});
      view.append(panelWrap,button("View administrative audit activity",()=>setTab("activity"),"quiet"),
        make("p","brand-note","This workspace uses owner-only official-brand permissions. It does not silently grant delegated administrator upload or publishing privileges."));
    }
    function renderAnalytics(){
      const data=state.data||{},assets=data.assets||[],assignments=(data.assignments||[]).filter(item=>item.status==="active");
      const assigned=new Set(assignments.map(item=>item.asset_id).filter(Boolean)),counts=new Map();
      assignments.forEach(item=>counts.set(item.asset_id,(counts.get(item.asset_id)||0)+1));
      const top=[...counts.entries()].sort((left,right)=>right[1]-left[1])[0],topAsset=assets.find(item=>item.id===top?.[0]);
      view.append(title("Brand Analytics","Metrics calculated from stored records; no synthetic statistics are shown."));
      const grid=make("div","brand-stats-grid");
      grid.append(stat("Total logos",Number(data.stats?.total||0),"Stored assets"),
        stat("Active placements",assignments.length,"Published locations"),stat("Archived logos",Number(data.stats?.archived||0),"Recoverable records"),
        stat("Unused assets",assets.filter(asset=>!assigned.has(asset.id)).length,"Not on an active placement"),
        stat("Logo categories",(data.categories||[]).length,"System and custom categories"),stat("Collections",(data.collections||[]).length,"Organized asset collections"));
      view.append(grid);
      const panelWrap=make("div","brand-panel");
      if(topAsset)panelWrap.append(make("p","","Most-assigned current logo: "+topAsset.title+" · "+top[1]+" active placement(s)."));
      else panelWrap.append(empty("No published logo usage yet","Published assignments will appear here after activation."));
      view.append(panelWrap);
    }
    function renderSettings(){
      view.append(title("Brand Settings","Review the connected Logo Center storage and compatibility settings."));
      const panelWrap=make("div","brand-panel"),settings=[
        ["Brand storage","minglora-brand-assets · private"],["Maximum file size","50 MB per original upload"],
        ["Supported formats","SVG, PNG, APNG, JPG/JPEG, WebP, GIF, ICO, Lottie JSON, MP4 and WebM"],
        ["Application timezone","America/Jamaica"],["Approval model","Only the current approved version can be assigned and published"],
        ["Version retention","Original uploads are retained at unique immutable version paths"],
        ["Public delivery","Only approved active image assignments appear in the signed public manifest"]
      ];
      settings.forEach(([name,value])=>{const row=make("div","brand-list-row");row.append(make("strong","",name),make("span","",value));panelWrap.append(row);});
      view.append(panelWrap);
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
      else if(state.tab==="categories")renderCategories();
      else if(state.tab==="placements"||state.tab==="deployment")renderPlacements();
      else if(state.tab==="identity")renderIdentity();
      else if(state.tab==="design"||state.tab==="editing")renderDesign();
      else if(state.tab==="mockups")renderMockups();
      else if(state.tab==="scheduling")renderScheduling();
      else if(state.tab==="versions")renderVersionHistory();
      else if(state.tab==="recovery")renderRecovery();
      else if(state.tab==="security")renderSecurity();
      else if(state.tab==="analytics")renderAnalytics();
      else if(state.tab==="settings")renderSettings();
      else if(state.tab==="assets")renderLibrary("Brand Asset Library");
      else if(state.tab==="complete")renderLibrary("Complete Logo Library");
      else if(state.tab==="activity")renderActivity();
    }
    load();
  }
  window.MingloraAdminLogoCenter=Object.freeze({mount});
})();
