const TAU = Math.PI * 2;
const unit = (x,y,z) => { const d=Math.hypot(x,y,z)||1; return [x/d,y/d,z/d]; };
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]];

export function createPhoenixModel() {
  const parts=[];
  const add=(name,positions,normals,indices,color,metallic=0.04,roughness=0.5)=>{
    if(!positions.length||positions.length!==normals.length||indices.length<3)throw new Error("Invalid Phoenix mesh "+name);
    const existing=parts.find(part=>part.name===name&&part.color===color&&part.metallic===metallic&&part.roughness===roughness);
    if(existing){
      const offset=existing.positions.length/3;
      existing.positions.push(...positions);existing.normals.push(...normals);
      existing.indices.push(...indices.map(index=>index+offset));
    }else parts.push({name,positions,normals,indices,color,metallic,roughness});
  };

  function ellipsoid(name,center,radii,color,metallic=0.04,roughness=0.52,segments=22,rings=15){
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
      const a=y*(segments+1)+x,b=a+segments+1;indices.push(a,b,a+1,a+1,b,b+1);
    }
    add(name,positions,normals,indices,color,metallic,roughness);
  }

  function tube(name,points,radii,color,metallic=0.08,roughness=0.48,sides=10){
    const positions=[],normals=[],indices=[];
    for(let i=0;i<points.length;i++){
      const previous=points[Math.max(0,i-1)],next=points[Math.min(points.length-1,i+1)];
      const tangent=unit(next[0]-previous[0],next[1]-previous[1],next[2]-previous[2]);
      const reference=Math.abs(tangent[1])>.9?[0,0,1]:[0,1,0];
      const u=unit(...cross(tangent,reference)),v=unit(...cross(tangent,u));
      const radius=Array.isArray(radii)?radii[i]:radii;
      for(let j=0;j<=sides;j++){
        const angle=TAU*j/sides,nx=u[0]*Math.cos(angle)+v[0]*Math.sin(angle);
        const ny=u[1]*Math.cos(angle)+v[1]*Math.sin(angle),nz=u[2]*Math.cos(angle)+v[2]*Math.sin(angle);
        positions.push(points[i][0]+nx*radius,points[i][1]+ny*radius,points[i][2]+nz*radius);
        normals.push(nx,ny,nz);
      }
    }
    for(let i=0;i<points.length-1;i++)for(let j=0;j<sides;j++){
      const a=i*(sides+1)+j,b=a+sides+1;indices.push(a,b,a+1,a+1,b,b+1);
    }
    add(name,positions,normals,indices,color,metallic,roughness);
  }

  function ribbon(name,points,width,color,normalAxis=[0,0,1],roughness=0.48,metallic=0.04){
    const positions=[],normals=[],indices=[],steps=6;
    for(let i=0;i<points.length;i++){
      const previous=points[Math.max(0,i-1)],next=points[Math.min(points.length-1,i+1)];
      const tangent=unit(next[0]-previous[0],next[1]-previous[1],next[2]-previous[2]);
      const side=unit(...cross(tangent,normalAxis));
      const taper=.05+.95*Math.pow(Math.sin(Math.PI*i/(points.length-1)),.68);
      for(let j=0;j<=steps;j++){
        const amount=j/steps*2-1,half=width*taper;
        positions.push(points[i][0]+side[0]*half*amount,points[i][1]+side[1]*half*amount,points[i][2]+side[2]*half*amount);
        normals.push(...unit(...cross(tangent,side)));
      }
    }
    for(let i=0;i<points.length-1;i++)for(let j=0;j<steps;j++){
      const a=i*(steps+1)+j,b=a+steps+1;indices.push(a,b,a+1,a+1,b,b+1);
    }
    add(name,positions,normals,indices,color,metallic,roughness);
  }

  function torus(name,center,major,minor,color,metallic=.55,roughness=.28,segments=44,sides=8){
    const positions=[],normals=[],indices=[];
    for(let i=0;i<=segments;i++)for(let j=0;j<=sides;j++){
      const u=TAU*i/segments,v=TAU*j/sides,r=major+minor*Math.cos(v);
      positions.push(center[0]+r*Math.cos(u),center[1]+minor*Math.sin(v),center[2]+r*Math.sin(u));
      normals.push(...unit(Math.cos(v)*Math.cos(u),Math.sin(v),Math.cos(v)*Math.sin(u)));
    }
    for(let i=0;i<segments;i++)for(let j=0;j<sides;j++){
      const a=i*(sides+1)+j,b=a+sides+1;indices.push(a,b,a+1,a+1,b+1,b);
    }
    add(name,positions,normals,indices,color,metallic,roughness);
  }

  function feather(name,base,tip,width,color,veinColor){
    const dx=tip[0]-base[0],dy=tip[1]-base[1],dz=tip[2]-base[2];
    const length=Math.hypot(dx,dy,dz)||1;
    const tangent=[dx/length,dy/length,dz/length];
    const reference=Math.abs(tangent[2])>.88?[0,1,0]:[0,0,1];
    const side=unit(...cross(tangent,reference));
    const points=[];
    for(let i=0;i<=6;i++){
      const t=i/6;
      points.push([
        base[0]+dx*t+side[0]*Math.sin(Math.PI*t)*width*.16,
        base[1]+dy*t+side[1]*Math.sin(Math.PI*t)*width*.16,
        base[2]+dz*t+side[2]*Math.sin(Math.PI*t)*width*.16
      ]);
    }
    ribbon(name,points,width,color,[0,0,1],.42,.08);
    tube(name+" central quill",[base,points[2],points[4],tip],.004,veinColor,.18,.34,6);
    ellipsoid(name+" rounded root",base,[width*.34,width*.12,width*.16],color,.06,.4,12,8);
  }

  // Ember-glass plinth and gold ring frame the bird without obscuring it.
  ellipsoid("Phoenix obsidian ember plinth",[0,-.78,0],[.69,.09,.5],"#25213b",.42,.28,40,14);
  torus("Phoenix molten gold plinth inlay",[0,-.72,0],.59,.014,"#efbd58",.82,.22,56,8);
  torus("Phoenix inner ember light ring",[0,-.69,0],.48,.012,"#ef6a36",.5,.24,48,7);

  // Body, breast and long swan-like neck.
  ellipsoid("Phoenix sculpted torso",[0,-.02,.025],[.29,.43,.245],"#a9362b",.12,.42,28,18);
  ellipsoid("Phoenix breast plumage",[0,-.075,.222],[.215,.31,.088],"#f2a347",.08,.42,24,16);
  ellipsoid("Phoenix golden throat",[0,.35,.12],[.15,.27,.15],"#edb64e",.12,.38,24,16);
  tube("Phoenix long curved neck",[[0,.14,.1],[0,.32,.12],[.015,.51,.13],[.07,.66,.12],[.13,.73,.1]],[.16,.13,.105,.09,.075],"#b9432e",.08,.42,12);
  ellipsoid("Phoenix regal head",[.13,.73,.1],[.16,.145,.14],"#d64a31",.12,.36,24,16);
  ellipsoid("Phoenix golden brow",[.19,.78,.205],[.075,.035,.026],"#f5d27a",.45,.24,16,8);
  ellipsoid("Phoenix obsidian eye",[.215,.745,.224],[.027,.032,.018],"#211b28",.15,.18,14,9);
  ellipsoid("Phoenix eye catchlight",[.222,.759,.24],[.008,.009,.006],"#fff3d8",.06,.12,10,6);
  ribbon("Phoenix curved golden beak",[[.25,.72,.12],[.34,.69,.13],[.39,.64,.12]],.045,"#f3c75e",[0,0,1],.26,.48);
  ribbon("Phoenix lower beak",[[.27,.68,.13],[.33,.65,.14],[.375,.63,.13]],.019,"#c88836",[0,0,1],.28,.38);

  // Fire crest feathers rise behind the head in separate flame shapes.
  const crest=[
    [[.06,.82,.02],[-.02,1.12,.025],[-.03,1.25,.01]],
    [[.12,.84,.025],[.14,1.14,.015],[.2,1.28,0]],
    [[.19,.84,.02],[.29,1.08,.01],[.34,1.17,-.01]],
    [[.02,.8,.02],[-.16,1.02,0],[-.23,1.1,-.02]]
  ];
  const crestColors=["#f7c84f","#f07832","#dd4530","#f6a13d"];
  crest.forEach((p,i)=>{
    ribbon("Phoenix crown flame plume "+(i+1),p,.047,crestColors[i],[0,0,1],.34,.12);
    tube("Phoenix plume golden spine "+(i+1),p,.005,"#ffe29a",.32,.22,6);
  });

  // The two wings have layered coverts, secondaries and individually tapered primaries.
  for(const side of [-1,1]){
    const label=side<0?"left":"right";
    const shoulder=[side*.2,.14,.015],elbow=[side*.48,.35,-.005],wrist=[side*.73,.22,-.015];
    tube("Phoenix "+label+" wing upper arm",[shoulder,[side*.36,.24,0],elbow],[.12,.1,.075],"#a83a2d",.08,.44,10);
    tube("Phoenix "+label+" wing forearm",[elbow,[side*.62,.29,-.01],wrist],[.08,.06,.04],"#c84a30",.08,.42,9);
    for(let row=0;row<3;row++){
      for(let featherIndex=0;featherIndex<7;featherIndex++){
        const t=featherIndex/6;
        const base=[side*(.29+t*.42),.3-row*.082+Math.sin(t*Math.PI)*.025,.055+row*.012];
        const tip=[base[0]+side*(.1+t*.05),base[1]+.11-row*.018,base[2]+.012];
        const colors=row===0?["#e6a442","#dc7136","#bd4a2d"]:row===1?["#f0b34a","#d85c31","#a83a2d"]:["#ffd16a","#e77b35","#c74a2b"];
        const color=colors[(featherIndex+row)%colors.length];
        feather("Phoenix "+label+" wing covert row "+(row+1)+" feather "+(featherIndex+1),base,tip,.042-row*.006,color,"#f9cc74");
      }
    }
    for(let featherIndex=0;featherIndex<9;featherIndex++){
      const t=featherIndex/8;
      const base=[side*(.53+t*.2),.22-t*.12,-.02];
      const tip=[side*(.72+t*.24),.2-t*.36,-.035];
      const color=["#a92f2c","#cd4330","#ef7c36","#f2b34c"][featherIndex%4];
      feather("Phoenix "+label+" wing primary flight feather "+(featherIndex+1),base,tip,.065,color,"#fbd17a");
    }
    tube("Phoenix "+label+" wing leading-edge gold trim",[
      [side*.23,.22,.08],[side*.43,.42,.06],[side*.66,.32,.025],[side*.82,.18,-.01]
    ],.009,"#f2c76b",.68,.25,7);
  }

  // A fan of tail feathers sweeps back and upward like a comet.
  for(let i=0;i<11;i++){
    const t=(i-5)/5;
    const base=[t*.13,-.28,-.2];
    const tip=[t*.39,-.57+Math.abs(t)*.13,-.78+Math.abs(t)*.14];
    const color=["#a92f2d","#d7442d","#ef7834","#f5b44a","#b93d30"][i%5];
    feather("Phoenix tail fan feather "+(i+1),base,tip,.073- Math.abs(t)*.012,color,"#fbd17a");
  }
  tube("Phoenix tail central ember shaft",[[0,-.26,-.18],[0,-.43,-.43],[0,-.5,-.68]], [.035,.023,.004],"#f4bf59",.18,.34,8);
  for(let i=0;i<5;i++){
    const t=(i-2)/2;
    ribbon("Phoenix tail flame tip "+(i+1),[
      [t*.28,-.49,-.53],[t*.34,-.62,-.67],[t*.4,-.69,-.82]
    ],.032,i%2?"#f6b64a":"#ef6934",[0,0,1],.3,.12);
  }

  // Metallic talons grip the warm-lit base.
  for(const side of [-1,1]){
    const x=side*.13;
    tube("Phoenix "+side+" scaled leg",[[x,-.26,.1],[x,-.48,.18],[x,-.61,.2]],[.045,.035,.025],"#d48a3e",.38,.34,8);
    for(let claw=0;claw<3;claw++){
      const z=.22+(claw-1)*.075;
      tube("Phoenix "+side+" talon "+(claw+1),[[x,-.6,.2],[x+side*(claw-1)*.045,-.64,z],[x+side*(claw-1)*.075,-.72,z+.035]],[.021,.014,.002],"#f7d17a",.72,.23,7);
    }
  }

  // Ember motes and feather sparks are actual small meshes, not decorative emoji.
  const sparkColors=["#ffd36b","#f18b3b","#fff0ba","#d84b35"];
  for(let i=0;i<12;i++){
    const a=TAU*i/12,x=Math.cos(a)*(.47+(i%3)*.035),y=-.1+Math.sin(a)*.58,z=.02+(i%2)*.03;
    ellipsoid("Phoenix orbiting ember mote "+(i+1),[x,y,z],[.018,.035,.018],sparkColors[i%4],.32,.24,10,7);
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
    const rgb=[1,3,5].map(index=>parseInt(part.color.slice(index,index+2),16)/255);
    const material=materials.length;materials.push({name:part.name+" material",pbrMetallicRoughness:{baseColorFactor:[...rgb,1],metallicFactor:part.metallic,roughnessFactor:part.roughness},doubleSided:true});
    primitives.push({attributes:{POSITION:pa,NORMAL:na},indices:ia,material,mode:4,extras:{mingloraPartName:part.name}});
  }
  const binary=Buffer.concat(chunks);
  return {
    asset:{version:"2.0",generator:"Minglora Gift Studio",extras:{
      mingloraAssetId:"gift-phoenix-3d-v1",
      source:"assets/3d-assets/gift-models/phoenix-model.mjs",
      artDirection:"original rising firebird with layered crimson and amber wings, individually tapered flight feathers, curved neck and gilded beak, flame crown, long comet-tail fan, metallic talons, ember motes and warm obsidian presentation plinth",
      reviewStatus:"design-review-pending"
    }},
    scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0,name:"Minglora Phoenix - Rising Firebird of Embers"}],
    meshes:[{name:"Minglora Phoenix - Layered Plumage, Wings and Flame Tail",primitives}],materials,
    buffers:[{byteLength:binary.length,uri:"data:application/octet-stream;base64,"+binary.toString("base64")}],
    bufferViews,accessors
  };
}
