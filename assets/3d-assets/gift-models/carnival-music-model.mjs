const TAU = Math.PI * 2;
const normalize = v => { const length = Math.hypot(...v) || 1; return v.map(x => x / length); };
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];

export function createCarnivalMusicModel() {
  const parts = [];
  function add(name, positions, normals, indices, color, metallic=0.12, roughness=0.48) {
    if (!positions.length || positions.length!==normals.length || indices.length<3 || ![...positions,...normals].every(Number.isFinite)) throw new Error("Invalid Carnival Music mesh: "+name);
    parts.push({name,positions,normals,indices,color,metallic,roughness});
  }
  function ellipsoid(name,center,radii,color,options={}) {
    const segments=options.segments||24,rings=options.rings||16,positions=[],normals=[],indices=[];
    for(let y=0;y<=rings;y++){
      const phi=Math.PI*y/rings,sp=Math.sin(phi),cp=Math.cos(phi);
      for(let x=0;x<=segments;x++){
        const theta=TAU*x/segments,nx=sp*Math.cos(theta),ny=cp,nz=sp*Math.sin(theta);
        positions.push(center[0]+nx*radii[0],center[1]+ny*radii[1],center[2]+nz*radii[2]);
        normals.push(...normalize([nx/radii[0],ny/radii[1],nz/radii[2]]));
      }
    }
    for(let y=0;y<rings;y++)for(let x=0;x<segments;x++){const a=y*(segments+1)+x,b=a+segments+1;indices.push(a,b,a+1,a+1,b,b+1);}
    add(name,positions,normals,indices,color,options.metallic??0.12,options.roughness??0.48);
  }
  function cylinder(name,center,topRadius,bottomRadius,height,color,metallic=0.12,roughness=0.5,sides=40) {
    const positions=[],normals=[],indices=[],slope=(bottomRadius-topRadius)/height;
    for(let y=0;y<=1;y++){
      const radius=topRadius+(bottomRadius-topRadius)*y,yy=center[1]+height/2-height*y;
      for(let side=0;side<=sides;side++){const angle=TAU*side/sides,x=Math.cos(angle),z=Math.sin(angle);positions.push(center[0]+x*radius,yy,center[2]+z*radius);normals.push(...normalize([x,slope,z]));}
    }
    for(let side=0;side<sides;side++){const a=side,b=sides+1+side;indices.push(a,b,a+1,a+1,b,b+1);}
    add(name,positions,normals,indices,color,metallic,roughness);
  }
  function tube(name,points,radius,color,metallic=0.16,roughness=0.42,sides=9) {
    if(points.length<2)return;
    const positions=[],normals=[],indices=[];
    for(let i=0;i<points.length;i++){
      const previous=points[Math.max(0,i-1)],next=points[Math.min(points.length-1,i+1)],tangent=normalize(next.map((x,k)=>x-previous[k]));
      const reference=Math.abs(tangent[1])>0.9?[1,0,0]:[0,1,0],axisU=normalize(cross(tangent,reference)),axisV=normalize(cross(tangent,axisU));
      for(let side=0;side<=sides;side++){
        const angle=TAU*side/sides,normal=normalize(axisU.map((x,k)=>x*Math.cos(angle)+axisV[k]*Math.sin(angle)));
        positions.push(points[i][0]+normal[0]*radius,points[i][1]+normal[1]*radius,points[i][2]+normal[2]*radius);normals.push(...normal);
      }
    }
    for(let i=0;i<points.length-1;i++)for(let side=0;side<sides;side++){const a=i*(sides+1)+side,b=a+sides+1;indices.push(a,b,a+1,a+1,b,b+1);}
    add(name,positions,normals,indices,color,metallic,roughness);
  }
  function ring(name,radius,y,z,tubeRadius,color,metallic=0.55,roughness=0.32) {
    const points=[];for(let i=0;i<=64;i++){const a=TAU*i/64;points.push([radius*Math.cos(a),y,z+radius*Math.sin(a)]);}
    tube(name,points,tubeRadius,color,metallic,roughness,8);
  }
  function feather(name,start,control,end,width,z,color) {
    const uSteps=18,vSteps=8,positions=[],normals=[],indices=[];
    const point=(u,v)=>{
      const q=1-u,x=q*q*start[0]+2*q*u*control[0]+u*u*end[0],y=q*q*start[1]+2*q*u*control[1]+u*u*end[1];
      const dx=2*q*(control[0]-start[0])+2*u*(end[0]-control[0]),dy=2*q*(control[1]-start[1])+2*u*(end[1]-control[1]),length=Math.hypot(dx,dy)||1;
      const half=width*Math.pow(Math.max(0,Math.sin(Math.PI*u)),0.76)*(0.78+0.22*u);
      return [x-dy/length*half*v,y+dx/length*half*v,z+0.035*(1-v*v)*Math.sin(Math.PI*u)];
    };
    for(let i=0;i<=uSteps;i++)for(let j=0;j<=vSteps;j++)positions.push(...point(i/uSteps,j/vSteps*2-1));
    for(let i=0;i<=uSteps;i++)for(let j=0;j<=vSteps;j++){
      const a=point(Math.max(0,i-1)/uSteps,j/vSteps*2-1),b=point(Math.min(uSteps,i+1)/uSteps,j/vSteps*2-1);
      const c=point(i/uSteps,Math.max(0,j-1)/vSteps*2-1),d=point(i/uSteps,Math.min(vSteps,j+1)/vSteps*2-1),normal=cross(b.map((x,k)=>x-a[k]),d.map((x,k)=>x-c[k])),length=Math.hypot(...normal);
      normals.push(...(length>1e-8?normal.map(x=>x/length):[0,0,1]));
    }
    for(let i=0;i<uSteps;i++)for(let j=0;j<vSteps;j++){const a=i*(vSteps+1)+j,b=a+vSteps+1;indices.push(a,b,a+1,a+1,b,b+1);}
    add(name,positions,normals,indices,color,0.08,0.46);
    const quill=[];for(let i=0;i<=12;i++){const p=point(i/12,0);quill.push([p[0],p[1],p[2]+0.018]);}
    tube(name+" raised satin quill",quill,0.006,"#f4d78a",0.38,0.32,5);
  }

  ellipsoid("Carnival Music velvet display plinth",[0,-0.57,0],[0.76,0.095,0.68],"#172a43",{metallic:0.32,roughness:0.34});
  ring("Carnival Music gold plinth inlay",0.68,-0.53,0,0.018,"#e9bd59",0.72,0.26);
  const standLegs=[[[-0.34,-0.35,-0.04],[-0.43,-0.52,-0.34]],[[0.34,-0.35,-0.04],[0.43,-0.52,-0.34]],[[0,-0.35,0.34],[0,-0.52,0.55]]];
  standLegs.forEach((points,i)=>tube("Carnival Music tripod support "+(i+1),points,0.026,"#9eacb4",0.68,0.32,8));
  cylinder("Carnival Music brushed chrome steelpan barrel",[0,-0.04,0],0.55,0.43,0.56,"#647d8e",0.82,0.29,56);
  ring("Carnival Music lower chrome binding",0.44,-0.30,0,0.026,"#d4dfe3",0.82,0.24);
  ring("Carnival Music rolled upper steel rim",0.575,0.238,0,0.032,"#f0d17e",0.78,0.25);
  ellipsoid("Carnival Music hammered steelpan dish",[0,0.228,0],[0.565,0.082,0.565],"#bdcbd2",{metallic:0.84,roughness:0.28,segments:40,rings:20});
  ellipsoid("Carnival Music recessed tuning surface",[0,0.286,0],[0.464,0.021,0.464],"#8199a7",{metallic:0.76,roughness:0.32,segments:36,rings:16});
  const noteColors=["#e5edf0","#b5c8d0","#dce7e9","#8ea9b7"];
  for(let i=0;i<8;i++){const angle=TAU*i/8-Math.PI/8,x=Math.cos(angle)*0.305,z=Math.sin(angle)*0.305;ellipsoid("Carnival Music individually tuned steelpan note "+(i+1),[x,0.306,z],[0.092,0.013,0.061],noteColors[i%4],{metallic:0.68,roughness:0.3,segments:18,rings:10});}
  ellipsoid("Carnival Music centre tone field",[0,0.308,0],[0.092,0.014,0.092],"#f3d17c",{metallic:0.64,roughness:0.3});
  const mallets=[[[-0.56,0.53,0.43],[0.45,0.61,0.43]],[[0.56,0.55,0.48],[-0.44,0.63,0.48]]];
  mallets.forEach((points,i)=>{tube("Carnival Music maple pan mallet shaft "+(i+1),points,0.014,"#8b5938",0.12,0.48,8);ellipsoid("Carnival Music ivory mallet head "+(i+1),points[1],[0.047,0.035,0.04],"#f6e9ce",{metallic:0.02,roughness:0.66,segments:14,rings:9});});
  const colours=["#0b9d78","#efbd4f","#39a6c7","#e65a72","#8b66c4","#ef8640","#21aa9d","#d94f79","#e5b54c","#408fc1","#0e9875"];
  for(let i=0;i<colours.length;i++){const spread=i/(colours.length-1)*2-1;feather("Carnival Music layered satin carnival feather "+(i+1),[spread*0.18,0.43,-0.30],[spread*0.56,1.10,-0.28],[spread*0.94,1.40-Math.abs(spread)*0.12,-0.24],0.142,-0.30+(i%4)*0.016,colours[i]);}
  [[-0.73,0.43,0.05],[0.73,0.46,0.06],[-0.52,1.16,-0.18],[0.53,1.2,-0.17]].forEach((p,i)=>ellipsoid("Carnival Music warm stage glint "+(i+1),p,[0.022,0.022,0.022],"#ffe4a1",{metallic:0.34,roughness:0.26,segments:10,rings:7}));

  const chunks=[],bufferViews=[],accessors=[],primitives=[],materials=[];let byteOffset=0;
  function addBuffer(buffer,target){const padding=(4-buffer.length%4)%4,padded=padding?Buffer.concat([buffer,Buffer.alloc(padding)]):buffer,view=bufferViews.length;bufferViews.push({buffer:0,byteOffset,byteLength:buffer.length,target});chunks.push(padded);byteOffset+=padded.length;return view;}
  for(const part of parts){
    const positionBuffer=Buffer.from(new Float32Array(part.positions).buffer),normalBuffer=Buffer.from(new Float32Array(part.normals).buffer);
    let maxIndex=0;for(const index of part.indices)maxIndex=Math.max(maxIndex,index);
    const use32Bit=maxIndex>65535,indexBuffer=use32Bit?Buffer.from(new Uint32Array(part.indices).buffer):Buffer.from(new Uint16Array(part.indices).buffer);
    const positionView=addBuffer(positionBuffer,34962),normalView=addBuffer(normalBuffer,34962),indexView=addBuffer(indexBuffer,34963);
    const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
    for(let i=0;i<part.positions.length;i+=3)for(let axis=0;axis<3;axis++){min[axis]=Math.min(min[axis],part.positions[i+axis]);max[axis]=Math.max(max[axis],part.positions[i+axis]);}
    const positionAccessor=accessors.length;accessors.push({bufferView:positionView,componentType:5126,count:part.positions.length/3,type:"VEC3",min,max});
    const normalAccessor=accessors.length;accessors.push({bufferView:normalView,componentType:5126,count:part.normals.length/3,type:"VEC3"});
    const indexAccessor=accessors.length;accessors.push({bufferView:indexView,componentType:use32Bit?5125:5123,count:part.indices.length,type:"SCALAR"});
    const rgb=[1,3,5].map(i=>parseInt(part.color.slice(i,i+2),16)/255),material=materials.length;
    materials.push({name:part.name+" PBR material",pbrMetallicRoughness:{baseColorFactor:[...rgb,1],metallicFactor:part.metallic,roughnessFactor:part.roughness},doubleSided:true});
    primitives.push({attributes:{POSITION:positionAccessor,NORMAL:normalAccessor},indices:indexAccessor,material,mode:4,extras:{mingloraPartName:part.name}});
  }
  const binary=Buffer.concat(chunks);
  return{
    asset:{version:"2.0",generator:"Minglora Gift Studio",extras:{mingloraAssetId:"gift-carnival-music-3d-v1",source:"assets/3d-assets/gift-models/carnival-music-model.mjs",artDirection:"original Caribbean carnival steelpan presentation with a brushed chrome pan, eight individually modelled tuned note fields, crossed maple mallets, brass trim, a three-foot stand and a layered multicolour satin feather fan",reviewStatus:"design-review-pending"}},
    scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0,name:"Minglora Carnival Music - Steelpan and Carnival Feather Fan"}],
    meshes:[{name:"Minglora Carnival Music - Tuned Steelpan, Mallets and Plumes",primitives}],materials,
    buffers:[{byteLength:binary.length,uri:"data:application/octet-stream;base64,"+binary.toString("base64")}],bufferViews,accessors
  };
}
