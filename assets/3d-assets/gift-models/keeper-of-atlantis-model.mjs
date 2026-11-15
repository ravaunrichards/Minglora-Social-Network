const TAU=Math.PI*2;
const unit=(x,y,z)=>{const d=Math.hypot(x,y,z)||1;return[x/d,y/d,z/d];};
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];

export function createKeeperOfAtlantisModel(){
  const parts=[];
  const add=(name,positions,normals,indices,color,metallic=.36,roughness=.31)=>{
    if(!positions.length||positions.length!==normals.length||indices.length<3)throw new Error("Invalid Keeper of Atlantis mesh "+name);
    parts.push({name,positions,normals,indices,color,metallic,roughness});
  };
  function ellipsoid(name,center,radii,color,metallic=.2,roughness=.36,segments=18,rings=12){
    const positions=[],normals=[],indices=[];
    for(let y=0;y<=rings;y++){
      const phi=Math.PI*y/rings;
      for(let x=0;x<=segments;x++){
        const theta=TAU*x/segments,nx=Math.sin(phi)*Math.cos(theta),ny=Math.cos(phi),nz=Math.sin(phi)*Math.sin(theta);
        positions.push(center[0]+nx*radii[0],center[1]+ny*radii[1],center[2]+nz*radii[2]);
        normals.push(...unit(nx/radii[0],ny/radii[1],nz/radii[2]));
      }
    }
    for(let y=0;y<rings;y++)for(let x=0;x<segments;x++){
      const a=y*(segments+1)+x,b=a+segments+1;
      indices.push(a,b,a+1,a+1,b,b+1);
    }
    add(name,positions,normals,indices,color,metallic,roughness);
  }
  function tube(name,points,radii,color,metallic=.7,roughness=.24,sides=9){
    const positions=[],normals=[],indices=[];
    for(let i=0;i<points.length;i++){
      const previous=points[Math.max(0,i-1)],next=points[Math.min(points.length-1,i+1)];
      const tangent=unit(next[0]-previous[0],next[1]-previous[1],next[2]-previous[2]);
      const reference=Math.abs(tangent[1])>.9?[0,0,1]:[0,1,0];
      const axisU=unit(...cross(tangent,reference)),axisV=unit(...cross(tangent,axisU));
      const radius=Array.isArray(radii)?radii[i]:radii;
      for(let side=0;side<=sides;side++){
        const angle=TAU*side/sides,nx=axisU[0]*Math.cos(angle)+axisV[0]*Math.sin(angle);
        const ny=axisU[1]*Math.cos(angle)+axisV[1]*Math.sin(angle),nz=axisU[2]*Math.cos(angle)+axisV[2]*Math.sin(angle);
        positions.push(points[i][0]+nx*radius,points[i][1]+ny*radius,points[i][2]+nz*radius);
        normals.push(nx,ny,nz);
      }
    }
    for(let i=0;i<points.length-1;i++)for(let side=0;side<sides;side++){
      const a=i*(sides+1)+side,b=a+sides+1;
      indices.push(a,b,a+1,a+1,b,b+1);
    }
    add(name,positions,normals,indices,color,metallic,roughness);
  }
  function cylinder(name,yBottom,yTop,rBottom,rTop,color,metallic=.8,roughness=.22,segments=36){
    const positions=[],normals=[],indices=[];
    for(let ring=0;ring<2;ring++){
      const y=ring?yTop:yBottom,r=ring?rTop:rBottom;
      for(let i=0;i<=segments;i++){
        const a=TAU*i/segments,x=Math.cos(a),z=Math.sin(a);
        positions.push(r*x,y,r*z);normals.push(x,0,z);
      }
    }
    for(let i=0;i<segments;i++){
      const a=i,b=segments+1+i;indices.push(a,a+1,b,a+1,b+1,b);
    }
    add(name,positions,normals,indices,color,metallic,roughness);
  }
  function torus(name,center,major,minor,color,metallic=.78,roughness=.21,segments=40,sides=9){
    const positions=[],normals=[],indices=[];
    for(let i=0;i<=segments;i++)for(let j=0;j<=sides;j++){
      const u=TAU*i/segments,v=TAU*j/sides,r=major+minor*Math.cos(v);
      positions.push(center[0]+r*Math.cos(u),center[1]+minor*Math.sin(v),center[2]+r*Math.sin(u));
      normals.push(...unit(Math.cos(v)*Math.cos(u),Math.sin(v),Math.cos(v)*Math.sin(u)));
    }
    for(let i=0;i<segments;i++)for(let j=0;j<sides;j++){
      const a=i*(sides+1)+j,b=a+sides+1;indices.push(a,b,a+1,a+1,b,b+1);
    }
    add(name,positions,normals,indices,color,metallic,roughness);
  }
  function facet(name,a,b,c,color,metallic=.35,roughness=.16){
    const normal=unit(...cross([b[0]-a[0],b[1]-a[1],b[2]-a[2]],[c[0]-a[0],c[1]-a[1],c[2]-a[2]]));
    add(name,[...a,...b,...c],[...normal,...normal,...normal],[0,1,2],color,metallic,roughness);
  }
  function gem(name,center,radii,palette){
    const ring=[],sides=10;
    for(let i=0;i<sides;i++){
      const angle=TAU*i/sides+Math.PI/10;
      ring.push([center[0]+Math.cos(angle)*radii[0],center[1],center[2]+Math.sin(angle)*radii[2]]);
    }
    const top=[center[0],center[1]+radii[1],center[2]],bottom=[center[0],center[1]-radii[1]*.7,center[2]];
    for(let i=0;i<sides;i++){
      const next=(i+1)%sides;
      facet(name+" crown cut "+(i+1),top,ring[i],ring[next],palette[i%palette.length],.45,.14);
      facet(name+" pavilion cut "+(i+1),bottom,ring[next],ring[i],palette[(i+1)%palette.length],.58,.2);
    }
    torus(name+" gold bezel",center,Math.max(radii[0],radii[2])*.9,.009,"#f0d78e",.9,.18,28,6);
  }

  // Vertical staff with a wave-enamel handgrip, fluted rings and a shell pommel.
  cylinder("Keeper of Atlantis trident staff gold shaft",-1.16,.48,.064,.085,"#c38c42",.9,.22,32);
  cylinder("Keeper of Atlantis deep-sea enamel handgrip",-.92,-.52,.105,.105,"#164c60",.38,.38,32);
  torus("Keeper of Atlantis upper grip collar",[0,-.52,0],.108,.023,"#f0d48a",.92,.18);
  torus("Keeper of Atlantis lower grip collar",[0,-.92,0],.108,.023,"#f0d48a",.92,.18);
  for(let i=0;i<7;i++){
    const y=-.88+i*.047;
    torus("Keeper of Atlantis grip turquoise fillet "+(i+1),[0,y,0],.106,.006,i%2?"#85d6d1":"#d2b16d",.72,.27,30,6);
  }
  for(let strand=0;strand<2;strand++){
    const points=[];
    for(let i=0;i<=38;i++){
      const t=i/38,a=TAU*(t*2.1+strand*.5),radius=.088;
      points.push([Math.cos(a)*radius,-.13-.37*t,Math.sin(a)*radius]);
    }
    tube("Keeper of Atlantis spiral shaft engraving "+(strand+1),points,.008,strand?"#b6e8db":"#f6d995",.85,.2,6);
  }
  ellipsoid("Keeper of Atlantis shell pommel",[0,-1.22,0],[.12,.115,.12],"#c9a66e",.7,.28,18,12);
  torus("Keeper of Atlantis shell pommel rim",[0,-1.22,0],.112,.018,"#fff0c0",.85,.2);
  gem("Keeper of Atlantis pommel aquamarine",[0,-1.22,.116],[.035,.045,.02],["#b8fff0","#4bb8b6","#16748a","#e5ffff"]);

  // Guard and coral-like sea branches at the base of the trident head.
  torus("Keeper of Atlantis trident lower collar",[0,.43,0],.13,.028,"#efd18a",.9,.2);
  ellipsoid("Keeper of Atlantis guard sea-glass centre",[0,.48,.01],[.2,.1,.13],"#327d84",.65,.28,18,12);
  for(const side of [-1,1]){
    tube("Keeper of Atlantis outward coral guard "+side,[
      [side*.08,.48,.02],[side*.2,.53,.04],[side*.32,.65,.035],[side*.42,.71,.02]
    ],[.045,.036,.022,.006],side<0?"#d17c70":"#e8ae77",.35,.4,8);
    ellipsoid("Keeper of Atlantis coral guard pearl "+side,[side*.42,.71,.02],[.035,.035,.035],"#fff0ce",.38,.18,10,7);
  }

  // The trident head: central spear, two outward prongs and an open wave silhouette.
  tube("Keeper of Atlantis central trident spear",[
    [0,.5,.02],[0,.83,.04],[0,1.17,.05],[0,1.53,.08]
  ],[.075,.065,.035,.002],"#d6b66f",.9,.18,12);
  for(const side of [-1,1]){
    tube("Keeper of Atlantis side trident prong "+side,[
      [side*.14,.54,.015],[side*.29,.75,.02],[side*.37,1.02,.035],[side*.31,1.25,.05],[side*.22,1.38,.05]
    ],[.064,.054,.039,.021,.002],side<0?"#c79d58":"#e1c17b",.91,.2,10);
    tube("Keeper of Atlantis inner wave fork "+side,[
      [side*.04,.75,.04],[side*.14,.9,.06],[side*.25,.93,.055]
    ],[.023,.015,.002],"#8ee5d9",.64,.2,8);
    gem("Keeper of Atlantis fork crystal "+side,[side*.29,1.18,.085],[.045,.072,.03],["#c4fff4","#56c8c4","#1b8194","#efffff"]);
  }
  torus("Keeper of Atlantis trident crown junction",[0,.79,.03],.18,.027,"#f2d68e",.92,.18,34,8);
  gem("Keeper of Atlantis main aquamarine",[0,.94,.145],[.105,.14,.045],["#d3fff2","#7fe2d3","#37aab7","#176d8f","#e9ffff"]);
  gem("Keeper of Atlantis central opal",[0,.57,.16],[.07,.085,.034],["#f2ffff","#b5e8e2","#7ebdc8","#f3d9b8"]);

  // Shell medallion behind the gem and individually raised nacre ribs.
  ellipsoid("Keeper of Atlantis shell medallion",[0,.19,.11],[.31,.34,.13],"#d0a879",.46,.3,22,16);
  ellipsoid("Keeper of Atlantis nacre shell core",[0,.19,.225],[.24,.27,.055],"#f1dcb7",.22,.27,22,14);
  for(let i=0;i<13;i++){
    const t=(i-6)/6,x=t*.205,spread=Math.sqrt(Math.max(.03,1-t*t));
    tube("Keeper of Atlantis shell nacre rib "+(i+1),[
      [x,.0,.25],[x*.88,.17,.289],[x*.56,.38*spread+.19,.25],[x*.12,.46*spread+.17,.21]
    ],[.008,.012,.009,.002],i%3===0?"#fff5d9":i%3===1?"#d7b98c":"#91d9ce",.35,.25,6);
  }
  torus("Keeper of Atlantis shell medallion gold rim",[0,.19,.11],.3,.021,"#f4d58c",.88,.18,42,8);
  // Twelve small pearls ring the medallion.
  for(let i=0;i<12;i++){
    const a=TAU*i/12;
    ellipsoid("Keeper of Atlantis medallion pearl "+(i+1),[Math.cos(a)*.29,.19+Math.sin(a)*.32,.19],[.025,.025,.022],"#fff1cb",.33,.16,10,7);
  }

  // Raised coral fronds and sea-glass bubbles surround the shell.
  for(let i=0;i<18;i++){
    const a=TAU*i/18,x=Math.cos(a),y=Math.sin(a),start=[x*.42,.18+y*.42,.02],mid=[x*.59,.18+y*.62,.045],end=[x*.69,.18+y*.78,.02];
    tube("Keeper of Atlantis coral branch "+(i+1),[
      start,[mid[0]*.6+start[0]*.4,mid[1]*.6+start[1]*.4,.055],mid,end
    ],[.042,.031,.019,.002],i%3===0?"#df8e79":i%3===1?"#70bcb1":"#d5b26f",.35,.4,7);
  }
  for(let i=0;i<15;i++){
    const a=TAU*i/15,r=.48+(i%3)*.055,y=.18+Math.sin(a)*r;
    ellipsoid("Keeper of Atlantis floating sea-glass bubble "+(i+1),[Math.cos(a)*r,y,.16],[.02+(i%3)*.004,.02+(i%2)*.006,.018],"#b7f5ec",.22,.15,10,7);
  }

  // Underwater current rings and a restrained wave crest near the staff foot.
  for(let i=0;i<6;i++){
    const y=-.25+i*.075;
    torus("Keeper of Atlantis staff tide ring "+(i+1),[0,y,0],.13+i*.018,.009,i%2?"#64c2c0":"#e5c77f",.54,.25,36,6);
  }
  for(let side of [-1,1]){
    tube("Keeper of Atlantis curling ocean current "+side,[
      [side*.12,-.5,.0],[side*.27,-.39,.07],[side*.38,-.23,.12],[side*.31,-.12,.14],[side*.23,-.1,.13]
    ],[.045,.036,.025,.015,.002],side<0?"#277f91":"#50bdb5",.48,.28,8);
  }
  ellipsoid("Keeper of Atlantis small tidal base pearl",[0,-.42,.15],[.08,.08,.045],"#e9f5dd",.25,.2,16,10);
  for(let i=0;i<8;i++){
    const a=TAU*i/8;
    ellipsoid("Keeper of Atlantis lower wave glint "+(i+1),[Math.cos(a)*.2,-.38,Math.sin(a)*.12],[.018,.036,.018],"#a9eee5",.3,.2,8,6);
  }

  const chunks=[],bufferViews=[],accessors=[],primitives=[],materials=[];
  let byteOffset=0;
  function addBuffer(buffer,target){
    const padding=(4-buffer.length%4)%4,padded=padding?Buffer.concat([buffer,Buffer.alloc(padding)]):buffer;
    const view=bufferViews.length;bufferViews.push({buffer:0,byteOffset,byteLength:buffer.length,target});
    chunks.push(padded);byteOffset+=padded.length;return view;
  }
  for(const part of parts){
    const positionBuffer=Buffer.from(new Float32Array(part.positions).buffer);
    const normalBuffer=Buffer.from(new Float32Array(part.normals).buffer);
    const maxIndex=Math.max(...part.indices),use32=maxIndex>65535;
    const indexBuffer=use32?Buffer.from(new Uint32Array(part.indices).buffer):Buffer.from(new Uint16Array(part.indices).buffer);
    const pv=addBuffer(positionBuffer,34962),nv=addBuffer(normalBuffer,34962),iv=addBuffer(indexBuffer,34963);
    const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
    for(let i=0;i<part.positions.length;i+=3)for(let axis=0;axis<3;axis++){
      min[axis]=Math.min(min[axis],part.positions[i+axis]);max[axis]=Math.max(max[axis],part.positions[i+axis]);
    }
    const pa=accessors.length;accessors.push({bufferView:pv,componentType:5126,count:part.positions.length/3,type:"VEC3",min,max});
    const na=accessors.length;accessors.push({bufferView:nv,componentType:5126,count:part.normals.length/3,type:"VEC3"});
    const ia=accessors.length;accessors.push({bufferView:iv,componentType:use32?5125:5123,count:part.indices.length,type:"SCALAR"});
    const rgb=[1,3,5].map(i=>parseInt(part.color.slice(i,i+2),16)/255),mi=materials.length;
    materials.push({name:part.name+" material",pbrMetallicRoughness:{baseColorFactor:[...rgb,1],metallicFactor:part.metallic,roughnessFactor:part.roughness},doubleSided:true});
    primitives.push({attributes:{POSITION:pa,NORMAL:na},indices:ia,material:mi,mode:4,extras:{mingloraPartName:part.name}});
  }
  const binary=Buffer.concat(chunks);
  return {
    asset:{version:"2.0",generator:"Minglora Gift Studio",extras:{
      mingloraAssetId:"gift-keeper-of-atlantis-3d-v1",
      source:"assets/3d-assets/gift-models/keeper-of-atlantis-model.mjs",
      artDirection:"original underwater ceremonial trident with three curved gold prongs, faceted aquamarine and opal jewels, spiral-fluted staff, pearl-inlaid nautilus shell medallion, branching coral, sea-glass bubbles and curling tidal currents",
      reviewStatus:"design-review-pending"
    }},
    scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0,name:"Minglora Keeper of Atlantis - Trident, Nacre Shell and Coral Tide Sculpture"}],
    meshes:[{name:"Minglora Keeper of Atlantis - Three-Prong Trident and Ocean Crown",primitives}],materials,
    buffers:[{byteLength:binary.length,uri:"data:application/octet-stream;base64,"+binary.toString("base64")}],
    bufferViews,accessors
  };
}
