import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');
const liveCss=read('public/styles.css')+'\n'+read('public/live-room-fit.css')+'\n'+read('public/live-tiktok-compact.css');
const meetwaveCss=read('public/meetwave.css');
const croppedDirectory=path.join(root,'assets/Crop References/Guests Layout');
const originalDirectory=path.join(root,'assets/Guests Layout');
const layouts=[
  {id:'full-screen',label:'Full Screen',jpg:'Full Screen.jpg',png:null},
  {id:'fluid-panel',label:'Fluid Panel',jpg:'Fluid Panel.jpg',png:'Fluid Panel.png'},
  {id:'fluid-grid',label:'Fluid Grid',jpg:'Fluid Grid.jpg',png:'Fluid Grid.png'},
  {id:'fixed-grid',label:'Fixed Grid',jpg:'Fixed Grid.jpg',png:'Fixed Grid.png'},
  {id:'fixed-panel',label:'Fixed Panel',jpg:'Fixed Panel.jpg',png:'Fixed Panel.png'},
  {id:'side-by-side',label:'Side by Side',jpg:'Side by Side.jpg',png:'Side by Side.png'},
  {id:'spotlight',label:'Spotlight',jpg:'Spotlight.jpg',png:'Spotlight.png'},
  {id:'roundtable-1',label:'Roundtable 1',jpg:'Roundtable 1.jpg',png:'Roundtable 1.png'},
  {id:'roundtable-2',label:'Roundtable 2',jpg:'Roundtable 2.jpg',png:'Roundtable 2.png'}
];
const viewports=[
  {name:'mobile',width:390,height:844},
  {name:'tablet',width:820,height:1180},
  {name:'desktop',width:1366,height:900}
];
const artifacts=path.join(root,'artifacts/nine-guest-layout-visual');
fs.mkdirSync(artifacts,{recursive:true});

for(const layout of layouts){
  assert.ok(fs.existsSync(path.join(originalDirectory,layout.jpg)),'missing original JPG '+layout.jpg);
  if(layout.png)assert.ok(fs.existsSync(path.join(croppedDirectory,layout.png)),'missing retained crop '+layout.png);
}
assert.equal(fs.existsSync(path.join(croppedDirectory,'Full Screen.png')),false,
  'the intentionally removed Full Screen crop must remain absent');

function seatMarkup(product){
  const heading='<div class="live-guest-layout-heading"><strong>MINGLORA GUEST LAYOUT</strong><small>Host + 8 guests</small></div>';
  const host='<div class="live-video-tile mw-video-tile live-guest-seat is-host is-spotlight" id="fixture-host" data-seat-index="0" data-identity="host"><div class="live-guest-seat-meta"><strong>Host</strong><small>Host</small></div><span class="live-guest-seat-tag">HOST</span></div>';
  const guests=Array.from({length:8},(_,index)=>{
    const seat=index+1;
    const body='<span class="live-guest-seat-tag">GUEST '+seat+'</span><span class="live-guest-seat-meta"><strong>Guest '+seat+'</strong><small>Guest seat '+seat+'</small></span>';
    return product==='meetwave'
      ?'<button type="button" class="mw-video-tile live-video-tile live-guest-seat is-guest empty mw-empty-seat" data-seat-index="'+seat+'" data-open-guest-invite aria-label="Invite guest '+seat+'"><span class="live-guest-seat-plus">+</span>'+body+'</button>'
      :'<div class="live-video-tile mw-video-tile live-guest-seat is-guest" data-seat-index="'+seat+'">'+body+'</div>';
  }).join('');
  return heading+host+guests;
}

function livePage(viewport,layout){
  return '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+liveCss+'</style></head><body><div class="layout"><main class="main-content"><section id="live-player-shell" class="live-player-shell"><header class="live-player-header"><div><strong>MINGLORA LIVE</strong></div></header><div class="live-player-layout"><section class="live-video-column"><div id="live-video-stage" class="live-video-stage"><div id="live-guest-layout" class="live-guest-layout" data-live-layout="'+layout.id+'">'+seatMarkup('live')+'</div></div><div class="live-player-controls live-icon-controls"><button>Mic</button></div></section><aside class="live-fullscreen-chat-slot"><div class="live-fullscreen-side-head"><strong>LIVE PANEL</strong></div></aside></div></section></main></div></body></html>';
}

function meetwavePage(layout){
  return '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+meetwaveCss+'</style></head><body><section class="mw-meeting live-player-shell"><header class="mw-meeting-head live-player-header"><div><strong>MINGLORA MEETWAVE</strong></div><b>Room</b></header><div class="mw-meeting-layout live-player-layout"><section class="mw-stage-column live-video-column"><div id="mw-screen-stage" class="mw-screen-stage" data-screen-layout="'+layout.id+'"><div id="mw-grid" class="mw-video-grid live-guest-layout live-video-stage" data-layout="'+layout.id+'" data-grid-role="host-eight-guest-seats">'+seatMarkup('meetwave')+'</div><div id="mw-screen-share-stage" hidden></div></div><div class="mw-controls live-player-controls live-icon-controls"><button>Mic</button></div></section><aside id="mw-support-column" class="mw-support-column live-fullscreen-chat-slot"><div class="live-fullscreen-side-head"><strong>MEETWAVE PANEL</strong></div></aside></div></section></body></html>';
}

function round(value){return Math.round(value*10)/10;}
async function collectGeometry(page,product,layout){
  return page.evaluate(({product,layout})=>{
    const round=value=>Math.round(value*10)/10;
    const grid=document.querySelector(product==='live'?'#live-guest-layout':'#mw-grid');
    const stage=document.querySelector(product==='live'?'#live-video-stage':'#mw-screen-stage');
    if(product==='live'){grid.dataset.liveLayout=layout;delete grid.dataset.liveGuestLayout;}
    else{stage.dataset.screenLayout=layout;grid.dataset.layout=layout;delete grid.dataset.guestLayout;}
    grid.querySelector('.live-guest-seat.is-host')?.classList.add('is-spotlight');
    const gridRect=grid.getBoundingClientRect();
    const seats=[...grid.querySelectorAll('.live-guest-seat')].sort((a,b)=>Number(a.dataset.seatIndex)-Number(b.dataset.seatIndex));
    const values=seats.map(tile=>{
      const style=getComputedStyle(tile),rect=tile.getBoundingClientRect();
      const visible=style.display!=='none'&&style.visibility!=='hidden'&&Number(style.opacity)>0.01&&rect.width>1&&rect.height>1;
      return {
        seat:Number(tile.dataset.seatIndex),visible,
        box:[round((rect.left-gridRect.left)/gridRect.width*100),round((rect.top-gridRect.top)/gridRect.height*100),round(rect.width/gridRect.width*100),round(rect.height/gridRect.height*100)],
        empty:tile.classList.contains('mw-empty-seat')
      };
    });
    return {
      stage:[Math.round(stage.getBoundingClientRect().width),Math.round(stage.getBoundingClientRect().height)],
      grid:[Math.round(gridRect.width),Math.round(gridRect.height)],
      seatCount:seats.length,visibleCount:values.filter(x=>x.visible).length,
      emptyCount:values.filter(x=>x.empty).length,
      geometry:values.map(x=>[x.seat,x.visible?x.box:null])
    };
  },{product,layout:layout.id});
}

function dataUri(file,mime){
  return 'data:'+mime+';base64,'+fs.readFileSync(file).toString('base64');
}

async function writeReferenceComparison(browser,layout,product,viewport,renderedBuffer){
  const page=await browser.newPage({viewport:{width:1280,height:610}});
  const original=dataUri(path.join(originalDirectory,layout.jpg),'image/jpeg');
  const crop=layout.png?dataUri(path.join(croppedDirectory,layout.png),'image/png'):null;
  const implementation='data:image/png;base64,'+renderedBuffer.toString('base64');
  const cropContent=crop
    ?'<figure><figcaption>Cropped PNG reference</figcaption><img src="'+crop+'"></figure>'
    :'<figure class="source-only"><figcaption>Cropped PNG reference</figcaption><div>Intentionally not retained</div></figure>';
  const html='<!doctype html><html><head><style>body{margin:0;padding:18px;background:#0d1421;color:#f5f7fb;font:14px system-ui}h1{font-size:18px;margin:0 0 6px}p{margin:0 0 16px;color:#aab6c8}.row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}figure{margin:0;padding:10px;border:1px solid #35445c;border-radius:10px;background:#151f30;display:flex;flex-direction:column;gap:8px;min-width:0}figcaption{font-weight:700;font-size:12px}img{width:100%;height:475px;object-fit:contain;background:#070b12;border-radius:6px}.source-only div{height:475px;display:grid;place-items:center;background:#202b3d;border-radius:6px;color:#c4cedb;font-size:13px}</style></head><body><h1>'+product.toUpperCase()+' · '+layout.label+' · '+viewport.name+'</h1><p>Uncropped original, retained crop (when available), and rendered panel/grid implementation.</p><div class="row"><figure><figcaption>Uncropped JPG reference</figcaption><img src="'+original+'"></figure>'+cropContent+'<figure><figcaption>Rendered implementation</figcaption><img src="'+implementation+'"></figure></div></body></html>';
  await page.setContent(html,{waitUntil:'load'});
  const safe=(value)=>value.toLowerCase().replace(/[^a-z0-9-]+/g,'-');
  await page.screenshot({path:path.join(artifacts,product+'-'+layout.id+'-'+viewport.name+'-reference-comparison.png'),fullPage:true});
  await page.close();
}

const browser=await chromium.launch({headless:true});
const results={layouts:layouts.length,viewports:viewports.length,products:2,combinations:0,seatRecordsChecked:0,comparisonScreenshots:0};
try{
  for(const viewport of viewports){
    for(const product of ['live','meetwave']){
      const page=await browser.newPage({viewport:{width:viewport.width,height:viewport.height}});
      await page.setContent(product==='live'
        ?livePage(viewport,layouts[0])
        :meetwavePage(layouts[0]),{waitUntil:'load'});
      await page.evaluate(()=>document.fonts.ready);
      const signatures=new Set();
      for(const layout of layouts){
        await page.evaluate(({product,layout})=>{
          const grid=document.querySelector(product==='live'?'#live-guest-layout':'#mw-grid');
          const stage=document.querySelector(product==='live'?'#live-video-stage':'#mw-screen-stage');
          if(product==='live'){grid.dataset.liveLayout=layout;delete grid.dataset.liveGuestLayout;}
          else{stage.dataset.screenLayout=layout;grid.dataset.layout=layout;delete grid.dataset.guestLayout;}
          grid.querySelector('.live-guest-seat.is-host')?.classList.add('is-spotlight');
        },{product,layout:layout.id});
        const measure=await collectGeometry(page,product,layout);
        assert.equal(measure.seatCount,9,product+' '+layout.id+' '+viewport.name+' must retain exactly one host and eight guest seats');
        assert.equal(measure.visibleCount,9,product+' '+layout.id+' '+viewport.name+' must display all eight guest panels plus the host');
        if(product==='meetwave')assert.equal(measure.emptyCount,8,'MeetWave guest placeholders remain invitation seats in '+layout.id);
        const signature=JSON.stringify(measure.geometry);
        signatures.add(signature);
        results.combinations++;
        results.seatRecordsChecked+=measure.seatCount;

        const stageSelector=product==='live'?'#live-video-stage':'#mw-screen-stage';
        const rendered=await page.locator(stageSelector).screenshot();
        await writeReferenceComparison(browser,layout,product,viewport,rendered);
        results.comparisonScreenshots++;
      }
      assert.equal(signatures.size,9,product+' layouts must have nine distinct panel/grid geometries at '+viewport.name);
      await page.close();
    }
  }
}finally{
  await browser.close();
}
fs.writeFileSync(path.join(artifacts,'layout-matrix-report.json'),JSON.stringify(results,null,2));
console.log(JSON.stringify({result:'passed',...results},null,2));
