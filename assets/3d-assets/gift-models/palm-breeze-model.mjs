const TAU = Math.PI * 2;
const unit = (x,y,z) => { const d=Math.hypot(x,y,z)||1; return [x/d,y/d,z/d]; };
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];

export function createPalmBreezeModel() {
  const parts=[];
  const add=(name,positions,normals,indices,color,metallic=0.01,roughness=0.58)=>{
    if(!positions.length||positions.length!==normals.length||indices.length<3) throw new Error("Invalid Palm Breeze mesh "+name);
    parts.push({name,positions,normals,indices,color,metallic,roughness});
  };

  function tube(name,points,radii,color,roughness=0.58) {
    const sides=8,positions=[],normals=[],indices=[];
    for(let i=0;i<points.length;i++){
      const previous=points[Math.max(0,i-1)],next=points[Math.min(points.length-1,i+1)];
      const tangent=unit(next[0]-previous[0],next[1]-previous[1],next[2]-previous[2]);
      const reference=Math.abs(tangent[1])>0.92?[0,0,1]:[0,1,0];
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
    add(name,positions,normals,indices,color,0.01,roughness);
  }

  function ribbon(name,points,width,color,normalAxis=[0,1,0]) {
    const positions=[],normals=[],indices=[],steps=5;
    for(let i=0;i<points.length;i++){
      const previous=points[Math.max(0,i-1)],next=points[Math.min(points.length-1,i+1)];
      const tangent=unit(next[0]-previous[0],next[1]-previous[1],next[2]-previous[2]);
      const side=unit(...cross(tangent,normalAxis));
      const taper=0.06+0.94*Math.pow(Math.sin(Math.PI*(i/(points.length-1))),0.65);
      for(let j=0;j<=steps;j++){
        const v=(j/steps)*2-1,half=width*taper;
        positions.push(points[i][0]+side[0]*half*v,points[i][1]+side[1]*half*v,points[i][2]+side[2]*half*v);
        const n=unit(...cross(tangent,side));normals.push(...n);
      }
    }
    for(let i=0;i<points.length-1;i++)for(let j=0;j<steps;j++){
      const a=i*(steps+1)+j,b=a+steps+1;
      indices.push(a,b,a+1,a+1,b,b+1);
    }
    add(name,positions,normals,indices,color,0.0,0.72);
  }

  function sphere(name,center,scale,color,roughness=0.42) {
    const seg=16,rings=12,positions=[],normals=[],indices=[];
    for(let y=0;y<=rings;y++){
      const phi=Math.PI*y/rings;
      for(let x=0;x<=seg;x++){
        const theta=TAU*x/seg,nx=Math.sin(phi)*Math.cos(theta),ny=Math.cos(phi),nz=Math.sin(phi)*Math.sin(theta);
        positions.push(center[0]+nx*scale[0],center[1]+ny*scale[1],center[2]+nz*scale[2]);
        normals.push(...unit(nx/scale[0],ny/scale[1],nz/scale[2]));
      }
    }
    for(let y=0;y<rings;y++)for(let x=0;x<seg;x++){
      const a=y*(seg+1)+x,b=a+seg+1;indices.push(a,b,a+1,a+1,b,b+1);
    }
    add(name,positions,normals,indices,color,0.015,roughness);
  }

  function torus(name,center,major,minor,color,roughness=0.5) {
    const seg=40,sides=8,positions=[],normals=[],indices=[];
    for(let i=0;i<=seg;i++)for(let j=0;j<=sides;j++){
      const u=TAU*i/seg,v=TAU*j/sides,r=major+minor*Math.cos(v);
      positions.push(center[0]+r*Math.cos(u),center[1]+minor*Math.sin(v),center[2]+r*Math.sin(u));
      normals.push(...unit(Math.cos(v)*Math.cos(u),Math.sin(v),Math.cos(v)*Math.sin(u)));
    }
    for(let i=0;i<seg;i++)for(let j=0;j<sides;j++){
      const a=i*(sides+1)+j,b=a+sides+1;indices.push(a,b,a+1,a+1,b,b+1);
    }
    add(name,positions,normals,indices,color,0.015,roughness);
  }

  function disk(name,centerY,radius,color) {
    const rings=7,seg=48,positions=[],normals=[],indices=[];
    for(let r=0;r<=rings;r++){
      const amount=r/rings;
      for(let i=0;i<=seg;i++){
        const a=TAU*i/seg,x=radius*amount*Math.cos(a),z=radius*amount*Math.sin(a);
        positions.push(x,centerY+0.014*(1-amount*amount),z);
        normals.push(...unit(-0.028*x,1,-0.028*z));
      }
    }
    for(let r=0;r<rings;r++)for(let i=0;i<seg;i++){
      const a=r*(seg+1)+i,b=a+seg+1;indices.push(a,a+1,b,a+1,b+1,b);
    }
    add(name,positions,normals,indices,color,0.0,0.84);
  }

  const trunkTop=[0.12,1.28,0.08];
  const trunkPoints=[
    [0,-0.72,0],[0.025,-0.42,-0.005],[0.065,-0.08,0.015],
    [0.12,0.28,0.04],[0.16,0.62,0.07],[0.15,0.96,0.08],trunkTop
  ];
  tube("Palm curved fibrous trunk",trunkPoints,[0.105,0.093,0.081,0.073,0.063,0.054,0.047],"#8b5634",0.82);
  tube("Palm trunk golden growth rings",[
    [0.02,-0.48,0.0],[0.045,-0.46,0.0],[0.055,-0.44,0.0]
  ],[0.095,0.097,0.096],"#b77a46",0.75);
  for(let row=0;row<5;row++){
    const y=-0.34+row*0.16,x=0.035+y*0.19;
    const points=[];
    for(let i=0;i<=5;i++){
      const a=TAU*i/5;
      points.push([x+0.078*Math.cos(a),y,0.078*Math.sin(a)]);
    }
    tube("Palm trunk engraved growth line "+(row+1),points,0.004,"#d09a61",0.76);
  }

  for(let root=0;root<6;root++){
    const a=TAU*root/6;
    tube("Palm root flare "+(root+1),[
      [0,-0.61,0],[Math.cos(a)*0.11,-0.69,Math.sin(a)*0.11],
      [Math.cos(a)*0.28,-0.76,Math.sin(a)*0.28]
    ],[0.045,0.028,0.006],"#7b4b31",0.83);
  }

  // Each pinnate frond has a curved rachis, a pair of leaflets at each node and fine ribs.
  const frondCount=8;
  for(let f=0;f<frondCount;f++){
    const angle=TAU*f/frondCount+0.16;
    const radial=[Math.cos(angle),0,Math.sin(angle)];
    const lateral=[-Math.sin(angle),0,Math.cos(angle)];
    const rachis=[];
    for(let step=0;step<=12;step++){
      const t=step/12,r=t*0.93;
      const y=1.25+0.32*Math.sin(Math.PI*t)-0.66*t+(f%2)*0.035;
      rachis.push([trunkTop[0]+radial[0]*r,y,trunkTop[2]+radial[2]*r]);
    }
    tube("Palm frond central rachis "+(f+1),rachis,0.014,"#477b43",0.58);
    for(let leaf=1;leaf<=9;leaf++){
      const t=0.11+leaf*0.083;
      const r=t*0.93;
      const baseY=1.25+0.32*Math.sin(Math.PI*t)-0.66*t+(f%2)*0.035;
      const base=[trunkTop[0]+radial[0]*r,baseY,trunkTop[2]+radial[2]*r];
      for(const sign of [-1,1]){
        const length=0.24+0.12*Math.sin(Math.PI*t);
        const end=[
          base[0]+radial[0]*0.12+lateral[0]*sign*length,
          base[1]-0.20-(t*0.11),
          base[2]+radial[2]*0.12+lateral[2]*sign*length
        ];
        const mid=[
          (base[0]+end[0])*0.5+radial[0]*0.035,
          (base[1]+end[1])*0.5+0.025,
          (base[2]+end[2])*0.5+radial[2]*0.035
        ];
        const points=[base,mid,end];
        const leafColor=(leaf+f)%3===0?"#4f9851":(leaf+f)%3===1?"#377d42":"#70a85b";
        ribbon("Palm frond "+(f+1)+" leaflet "+leaf+" "+(sign<0?"left":"right"),points,0.033,leafColor,radial);
        tube("Palm leaflet vein "+(f+1)+"-"+leaf+"-"+sign,[base,mid,end],0.004,"#b3cb79",0.72);
      }
    }
  }

  // Three young coconuts sit inside the crown below the frond attachment points.
  const coconuts=[
    [0.16,1.13,0.10],[-0.025,1.14,0.12],[0.09,1.04,-0.085]
  ];
  for(let i=0;i<coconuts.length;i++){
    const center=coconuts[i];
    sphere("Palm coconut husk "+(i+1),center,[0.105,0.12,0.105],i===1?"#80613a":"#765638",0.72);
    sphere("Palm coconut husk highlight "+(i+1),[center[0]+0.045,center[1]+0.03,center[2]+0.07],[0.025,0.018,0.018],"#a98456",0.7);
  }
  sphere("Palm crown heart",[0.11,1.24,0.08],[0.09,0.12,0.09],"#a7c56d",0.52);

  // Sand and shallow turquoise water form a compact presentation base, not a scene backdrop.
  disk("Palm island sandy plinth",-0.79,0.55,"#d6bd8a");
  torus("Palm island turquoise waterline",[0,-0.805,0],0.53,0.018,"#48a9a1",0.42);
  torus("Palm island pale surf line",[0,-0.794,0],0.47,0.009,"#d8eee0",0.52);
  for(let i=0;i<8;i++){
    const a=TAU*i/8,x=Math.cos(a)*0.37,z=Math.sin(a)*0.37;
    sphere("Island beach pebble "+(i+1),[x,-0.758,z],[0.045,0.018,0.03],i%2?"#a98b64":"#e1d1a9",0.86);
  }
  sphere("Island small shell",[0.28,-0.735,0.17],[0.05,0.025,0.04],"#f0d7bc",0.8);

  const chunks=[],bufferViews=[],accessors=[],primitives=[],materials=[];
  let byteOffset=0;
  function addBuffer(buffer,target){
    const pad=(4-buffer.length%4)%4,padded=pad?Buffer.concat([buffer,Buffer.alloc(pad)]):buffer;
    const index=bufferViews.length;
    bufferViews.push({buffer:0,byteOffset,byteLength:buffer.length,target});
    chunks.push(padded);byteOffset+=padded.length;return index;
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
      mingloraAssetId:"gift-palm-breeze-3d-v1",
      source:"assets/3d-assets/gift-models/palm-breeze-model.mjs",
      artDirection:"curved fibrous palm trunk, eight radial pinnate fronds with individual leaflets and veins, three young coconuts, sculpted root flares and a compact tropical sand-and-water plinth",
      reviewStatus:"design-review-pending"
    }},
    scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0,name:"Minglora Palm Breeze - Tropical Island Sculpture"}],
    meshes:[{name:"Minglora Palm Tree and Island",primitives}],materials,
    buffers:[{byteLength:binary.length,uri:"data:application/octet-stream;base64,"+binary.toString("base64")}],
    bufferViews,accessors
  };
}
