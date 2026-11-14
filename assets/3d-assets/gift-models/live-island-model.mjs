const TAU = Math.PI * 2;
const unit = (x,y,z) => { const d=Math.hypot(x,y,z)||1; return [x/d,y/d,z/d]; };
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];

export function createLiveIslandModel() {
  const parts = [];
  const add = (name,positions,normals,indices,color,metallic=0.01,roughness=0.58) => {
    if (!positions.length || positions.length !== normals.length || indices.length < 3) throw new Error("Invalid LIVE Island mesh " + name);
    const existing = parts.find(part => part.name === name && part.color === color && part.metallic === metallic && part.roughness === roughness);
    if (existing) {
      const offset = existing.positions.length / 3;
      existing.positions.push(...positions);
      existing.normals.push(...normals);
      existing.indices.push(...indices.map(index => index + offset));
    } else {
      parts.push({name,positions,normals,indices,color,metallic,roughness});
    }
  };

  function ellipsoid(name,center,radii,color,metallic=0.01,roughness=0.64,segments=20,rings=14) {
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

  function tube(name,points,radii,color,metallic=0.01,roughness=0.62,sides=10) {
    const positions=[],normals=[],indices=[];
    for(let i=0;i<points.length;i++){
      const previous=points[Math.max(0,i-1)],next=points[Math.min(points.length-1,i+1)];
      const tangent=unit(next[0]-previous[0],next[1]-previous[1],next[2]-previous[2]);
      const reference=Math.abs(tangent[1])>0.9?[0,0,1]:[0,1,0];
      const axisU=unit(...cross(tangent,reference)),axisV=unit(...cross(tangent,axisU));
      const radius=Array.isArray(radii)?radii[i]:radii;
      for(let side=0;side<=sides;side++){
        const angle=TAU*side/sides;
        const nx=axisU[0]*Math.cos(angle)+axisV[0]*Math.sin(angle);
        const ny=axisU[1]*Math.cos(angle)+axisV[1]*Math.sin(angle);
        const nz=axisU[2]*Math.cos(angle)+axisV[2]*Math.sin(angle);
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

  function ribbon(name,points,width,color,normalAxis=[0,1,0],roughness=0.7) {
    const positions=[],normals=[],indices=[],steps=6;
    for(let i=0;i<points.length;i++){
      const previous=points[Math.max(0,i-1)],next=points[Math.min(points.length-1,i+1)];
      const tangent=unit(next[0]-previous[0],next[1]-previous[1],next[2]-previous[2]);
      const side=unit(...cross(tangent,normalAxis));
      const taper=0.08+0.92*Math.pow(Math.sin(Math.PI*i/(points.length-1)),0.62);
      for(let j=0;j<=steps;j++){
        const v=j/steps*2-1,half=width*taper;
        positions.push(points[i][0]+side[0]*half*v,points[i][1]+side[1]*half*v,points[i][2]+side[2]*half*v);
        normals.push(...unit(...cross(tangent,side)));
      }
    }
    for(let i=0;i<points.length-1;i++)for(let j=0;j<steps;j++){
      const a=i*(steps+1)+j,b=a+steps+1;
      indices.push(a,b,a+1,a+1,b,b+1);
    }
    add(name,positions,normals,indices,color,0,roughness);
  }

  function torus(name,center,major,minor,color,metallic=0.01,roughness=0.48,segments=48,sides=9) {
    const positions=[],normals=[],indices=[];
    for(let i=0;i<=segments;i++)for(let j=0;j<=sides;j++){
      const u=TAU*i/segments,v=TAU*j/sides,r=major+minor*Math.cos(v);
      positions.push(center[0]+r*Math.cos(u),center[1]+minor*Math.sin(v),center[2]+r*Math.sin(u));
      normals.push(...unit(Math.cos(v)*Math.cos(u),Math.sin(v),Math.cos(v)*Math.sin(u)));
    }
    for(let i=0;i<segments;i++)for(let j=0;j<sides;j++){
      const a=i*(sides+1)+j,b=a+sides+1;
      indices.push(a,b,a+1,a+1,b,b+1);
    }
    add(name,positions,normals,indices,color,metallic,roughness);
  }

  function box(name,center,size,color,metallic=0.01,roughness=0.62) {
    const [x,y,z]=center,[sx,sy,sz]=size;
    const faces=[
      {n:[0,0,1],v:[[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]]},
      {n:[0,0,-1],v:[[1,-1,-1],[-1,-1,-1],[-1,1,-1],[1,1,-1]]},
      {n:[1,0,0],v:[[1,-1,1],[1,-1,-1],[1,1,-1],[1,1,1]]},
      {n:[-1,0,0],v:[[-1,-1,-1],[-1,-1,1],[-1,1,1],[-1,1,-1]]},
      {n:[0,1,0],v:[[-1,1,1],[1,1,1],[1,1,-1],[-1,1,-1]]},
      {n:[0,-1,0],v:[[-1,-1,-1],[1,-1,-1],[1,-1,1],[-1,-1,1]]}
    ];
    const positions=[],normals=[],indices=[];
    for(const face of faces){
      const base=positions.length/3;
      for(const v of face.v){
        positions.push(x+v[0]*sx/2,y+v[1]*sy/2,z+v[2]*sz/2);
        normals.push(...face.n);
      }
      indices.push(base,base+1,base+2,base,base+2,base+3);
    }
    add(name,positions,normals,indices,color,metallic,roughness);
  }

  // Continuous turquoise lagoon, pale surf, sand and the raised green cay.
  ellipsoid("LIVE Island deep lagoon plinth",[0,-0.57,0],[0.91,0.17,0.73],"#148d9c",0.18,0.3,48,18);
  ellipsoid("LIVE Island shallow turquoise shelf",[0,-0.49,0],[0.79,0.085,0.62],"#42c8c3",0.08,0.28,48,16);
  torus("LIVE Island outer white surf crest",[0,-0.49,0],0.77,0.023,"#e8fff0",0.05,0.28);
  torus("LIVE Island lagoon sunlit rim",[0,-0.445,0],0.66,0.016,"#8be2d6",0.04,0.3);
  ellipsoid("LIVE Island warm ivory beach",[0,-0.37,0],[0.64,0.16,0.49],"#e8cb91",0,0.86,40,16);
  ellipsoid("LIVE Island central green rise",[-0.055,-0.14,-0.055],[0.48,0.32,0.36],"#397c51",0,0.9,32,18);
  ellipsoid("LIVE Island sunlit grassy crown",[-0.13,0.035,-0.11],[0.3,0.22,0.24],"#70a95d",0,0.9,28,16);
  ellipsoid("LIVE Island cliff basalt shelf",[0.17,-0.31,-0.1],[0.31,0.11,0.28],"#67594b",0.02,0.88,28,14);

  // A narrow waterfall spills from the green rise into the lagoon.
  ribbon("LIVE Island cascading waterfall",[
    [-0.13,-0.02,0.23],[-0.15,-0.15,0.29],[-0.18,-0.27,0.34],[-0.2,-0.42,0.38]
  ],0.085,"#9af4f0",[0,0,1],0.24);
  ribbon("LIVE Island waterfall bright stream",[
    [-0.13,-0.035,0.246],[-0.15,-0.15,0.31],[-0.18,-0.28,0.36],[-0.2,-0.415,0.4]
  ],0.022,"#f1ffff",[0,0,1],0.2);

  // Two distinct palm clusters frame the island rather than repeating a single tree mesh.
  function palm(name,base,height,lean,seed) {
    const [x,y,z]=base;
    const top=[x+lean,y+height,z+lean*0.22];
    tube(name+" curved trunk",[
      [x,y,z],[x+lean*0.18,y+height*0.25,z+lean*0.04],
      [x+lean*0.62,y+height*0.67,z+lean*0.13],top
    ],[0.075,0.061,0.048,0.035],"#815038",0.01,0.82,9);
    for(let ring=0;ring<4;ring++){
      const t=0.2+ring*0.17,rx=x+lean*t,ry=y+height*t,rz=z+lean*0.22*t;
      torus(name+" trunk growth band "+(ring+1),[rx,ry,rz],0.047*(1-t*0.55),0.006,"#bd8957",0.01,0.72,20,6);
    }
    const frondCount=6+(seed%2);
    for(let f=0;f<frondCount;f++){
      const a=TAU*f/frondCount+seed*0.37;
      const radial=[Math.cos(a),0,Math.sin(a)],lateral=[-Math.sin(a),0,Math.cos(a)];
      const length=0.36+(f%3)*0.045;
      const end=[top[0]+radial[0]*length,top[1]-height*0.14+(f%2)*0.04,top[2]+radial[2]*length];
      const mid=[(top[0]+end[0])/2+radial[0]*0.055,top[1]+0.05,(top[2]+end[2])/2+radial[2]*0.055];
      tube(name+" frond rachis", [top,mid,end],0.012,"#376f42",0.01,0.62,7);
      for(let leaf=1;leaf<=6;leaf++){
        const t=leaf/7;
        const p=[top[0]+(end[0]-top[0])*t,top[1]+(end[1]-top[1])*t,top[2]+(end[2]-top[2])*t];
        for(const side of [-1,1]){
          const leafEnd=[
            p[0]+radial[0]*0.055+lateral[0]*side*(0.11+0.035*Math.sin(t*Math.PI)),
            p[1]-0.075-(t*0.035),
            p[2]+radial[2]*0.055+lateral[2]*side*(0.11+0.035*Math.sin(t*Math.PI))
          ];
          const leafMid=[(p[0]+leafEnd[0])/2+radial[0]*0.02,(p[1]+leafEnd[1])/2+0.018,(p[2]+leafEnd[2])/2+radial[2]*0.02];
          const shade=(leaf+f+seed)%3===0?"#7fb968":(leaf+f)%3===1?"#4c9b60":"#347d4d";
          ribbon(name+" pinnate leaflets", [p,leafMid,leafEnd],0.021,shade,radial,0.78);
        }
      }
    }
    for(let c=0;c<3;c++){
      const a=TAU*c/3+0.4;
      ellipsoid(name+" coconut",[top[0]+Math.cos(a)*0.07,top[1]-0.1,top[2]+Math.sin(a)*0.07],[0.048,0.061,0.047],c===1?"#a47b46":"#785a36",0,0.82,14,10);
    }
    ellipsoid(name+" crown core",top,[0.07,0.065,0.07],"#a4c56e",0,0.72,16,10);
  }
  palm("LIVE Island west palm",[-0.34,-0.14,-0.04],0.76,-0.12,1);
  palm("LIVE Island east palm",[0.19,-0.12,-0.12],0.88,0.12,3);
  palm("LIVE Island rear palm",[0.0,-0.12,-0.32],0.7,-0.06,5);

  // A tiny open-air beach pavilion with woven timber, fabric roof and lit lanterns.
  box("LIVE Island pavilion timber floor",[0.27,-0.19,0.19],[0.34,0.045,0.25],"#9a623e",0.03,0.72);
  for(const [dx,dz] of [[-.14,-.09],[.14,-.09],[-.14,.09],[.14,.09]]){
    tube("LIVE Island pavilion cedar post",[[0.27+dx,-0.19,0.19+dz],[0.27+dx,0.08,0.19+dz]],0.014,"#7d4c31",0.02,0.72,7);
  }
  ribbon("LIVE Island pavilion coral roof",[
    [0.05,0.1,0.03],[0.16,0.23,0.19],[0.27,0.25,0.19],[0.38,0.23,0.19],[0.49,0.1,0.03]
  ],0.105,"#db865d",[0,0,1],0.66);
  tube("LIVE Island pavilion ridge cap",[[0.15,0.245,0.19],[0.27,0.27,0.19],[0.39,0.245,0.19]],0.014,"#f2d58e",0.32,0.34,8);
  box("LIVE Island pavilion warm lantern",[0.27,-0.015,0.32],[0.055,0.075,0.04],"#f6d17e",0.18,0.26);
  tube("LIVE Island pavilion lantern hook",[[0.27,0.08,0.19],[0.27,0.035,0.19],[0.27,0.025,0.29]],0.006,"#b27b43",0.5,0.3,6);

  // A small wooden longboat and its bright sail sit at the sheltered shoreline.
  ellipsoid("LIVE Island canoe hull",[0.56,-0.43,0.08],[0.18,0.035,0.07],"#875236",0.04,0.62,24,10);
  ribbon("LIVE Island canoe raised bow",[[0.42,-0.42,0.08],[0.51,-0.385,0.08],[0.66,-0.39,0.08],[0.73,-0.43,0.08]],0.025,"#d9a36a",[0,1,0],0.64);
  tube("LIVE Island canoe mast",[[0.56,-0.4,0.08],[0.56,-0.13,0.08]],0.009,"#7c4b32",0.02,0.72,7);
  ribbon("LIVE Island canoe golden sail",[[0.57,-0.14,0.08],[0.7,-0.22,0.08],[0.57,-0.38,0.08]],0.07,"#f0d17a",[0,0,1],0.4);
  ribbon("LIVE Island canoe teal sail",[[0.55,-0.17,0.07],[0.43,-0.26,0.07],[0.55,-0.38,0.07]],0.055,"#4d9d98",[0,0,1],0.4);

  // Coral heads and shells add unique reef details around the clear shelf.
  for(let reef=0;reef<5;reef++){
    const a=TAU*reef/5+0.26,x=Math.cos(a)*0.69,z=Math.sin(a)*0.53;
    ellipsoid("LIVE Island reef coral base "+(reef+1),[x,-0.49,z],[0.09,0.035,0.075],reef%2?"#df8c78":"#e9a36c",0,0.78,14,9);
    for(let branch=0;branch<3;branch++){
      const side=(branch-1)*0.035;
      tube("LIVE Island reef coral branch "+(branch+1),[
        [x+side,-0.48,z],[x+side*1.2,-0.42,z+0.018],[x+side*1.3,-0.37,z+0.025]
      ],[0.018,0.013,0.006],reef%2?"#e9aa83":"#c66f71",0,0.8,7);
    }
  }
  for(let shell=0;shell<4;shell++){
    const a=TAU*shell/4,x=Math.cos(a)*0.51,z=Math.sin(a)*0.42;
    ellipsoid("LIVE Island beach shell "+(shell+1),[x,-0.34,z],[0.035,0.018,0.045],shell%2?"#fff0d8":"#f4c8ac",0,0.54,14,9);
  }
  torus("LIVE Island golden stage inlay",[0.0,-0.285,0.34],0.12,0.008,"#e9c16f",0.7,0.26,32,6);
  ellipsoid("LIVE Island Minglora live beacon",[0.0,-0.265,0.34],[0.048,0.018,0.048],"#f5d47c",0.58,0.23,16,8);

  const chunks=[],bufferViews=[],accessors=[],primitives=[],materials=[];
  let byteOffset=0;
  function addBuffer(buffer,target){
    const padding=(4-buffer.length%4)%4,padded=padding?Buffer.concat([buffer,Buffer.alloc(padding)]):buffer;
    const view=bufferViews.length;
    bufferViews.push({buffer:0,byteOffset,byteLength:buffer.length,target});
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
    const material=materials.length;
    materials.push({name:part.name+" material",pbrMetallicRoughness:{baseColorFactor:[...rgb,1],metallicFactor:part.metallic,roughnessFactor:part.roughness},doubleSided:true});
    primitives.push({attributes:{POSITION:pa,NORMAL:na},indices:ia,material,mode:4,extras:{mingloraPartName:part.name}});
  }
  const binary=Buffer.concat(chunks);
  return {
    asset:{version:"2.0",generator:"Minglora Gift Studio",extras:{
      mingloraAssetId:"gift-live-island-3d-v1",
      source:"assets/3d-assets/gift-models/live-island-model.mjs",
      artDirection:"original miniature tropical cay with turquoise lagoon and white surf, ivory sand, raised green headland, cascading waterfall, three individually detailed palms, lit open-air beach pavilion, small lateen-sail canoe, branching coral reef and a golden Minglora live beacon",
      reviewStatus:"design-review-pending"
    }},
    scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0,name:"Minglora LIVE Island - Lagoon, Waterfall and Reef Cay"}],
    meshes:[{name:"Minglora LIVE Island environment sculpture",primitives}],materials,
    buffers:[{byteLength:binary.length,uri:"data:application/octet-stream;base64,"+binary.toString("base64")}],
    bufferViews,accessors
  };
}
