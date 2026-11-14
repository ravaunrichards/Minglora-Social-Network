const TAU=Math.PI*2;
const unit=(x,y,z)=>{const d=Math.hypot(x,y,z)||1;return [x/d,y/d,z/d];};
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]];

export function createBeachMaracasModel(){
 const parts=[];
 const add=(name,positions,normals,indices,color,metallic=.04,roughness=.56)=>{
  if(!positions.length||positions.length!==normals.length||indices.length<3)throw new Error("Invalid Beach Maracas mesh "+name);
  const old=parts.find(p=>p.name===name&&p.color===color&&p.metallic===metallic&&p.roughness===roughness);
  if(old){const offset=old.positions.length/3;old.positions.push(...positions);old.normals.push(...normals);old.indices.push(...indices.map(i=>i+offset));}
  else parts.push({name,positions,normals,indices,color,metallic,roughness});
 };
 function ellipsoid(name,center,radii,color,metallic=.02,roughness=.62,segments=20,rings=14){
  const p=[],n=[],ix=[];
  for(let y=0;y<=rings;y++){const phi=Math.PI*y/rings;for(let x=0;x<=segments;x++){
   const a=TAU*x/segments,nx=Math.sin(phi)*Math.cos(a),ny=Math.cos(phi),nz=Math.sin(phi)*Math.sin(a);
   p.push(center[0]+nx*radii[0],center[1]+ny*radii[1],center[2]+nz*radii[2]);n.push(...unit(nx/radii[0],ny/radii[1],nz/radii[2]));
  }}
  for(let y=0;y<rings;y++)for(let x=0;x<segments;x++){const a=y*(segments+1)+x,b=a+segments+1;ix.push(a,b,a+1,a+1,b,b+1);}
  add(name,p,n,ix,color,metallic,roughness);
 }
 function tube(name,points,radius,color,metallic=.08,roughness=.5,sides=10){
  const p=[],n=[],ix=[];
  for(let i=0;i<points.length;i++){
   const prev=points[Math.max(0,i-1)],next=points[Math.min(points.length-1,i+1)];
   const t=unit(next[0]-prev[0],next[1]-prev[1],next[2]-prev[2]),ref=Math.abs(t[1])>.9?[1,0,0]:[0,1,0];
   const u=unit(...cross(t,ref)),v=unit(...cross(t,u)),r=Array.isArray(radius)?radius[i]:radius;
   for(let j=0;j<=sides;j++){const a=TAU*j/sides,nx=u[0]*Math.cos(a)+v[0]*Math.sin(a),ny=u[1]*Math.cos(a)+v[1]*Math.sin(a),nz=u[2]*Math.cos(a)+v[2]*Math.sin(a);p.push(points[i][0]+nx*r,points[i][1]+ny*r,points[i][2]+nz*r);n.push(nx,ny,nz);}
  }
  for(let i=0;i<points.length-1;i++)for(let j=0;j<sides;j++){const a=i*(sides+1)+j,b=a+sides+1;ix.push(a,b,a+1,a+1,b,b+1);}
  add(name,p,n,ix,color,metallic,roughness);
 }
 function torus(name,center,major,minor,color,metallic=.55,roughness=.3,segments=40,sides=8){
  const p=[],n=[],ix=[];
  for(let i=0;i<=segments;i++)for(let j=0;j<=sides;j++){const u=TAU*i/segments,v=TAU*j/sides,r=major+minor*Math.cos(v);p.push(center[0]+r*Math.cos(u),center[1]+minor*Math.sin(v),center[2]+r*Math.sin(u));n.push(...unit(Math.cos(v)*Math.cos(u),Math.sin(v),Math.cos(v)*Math.sin(u)));}
  for(let i=0;i<segments;i++)for(let j=0;j<sides;j++){const a=i*(sides+1)+j,b=a+sides+1;ix.push(a,b,a+1,a+1,b+1,b);}
  add(name,p,n,ix,color,metallic,roughness);
 }
 function ribbon(name,points,width,color,normal=[0,0,1]){
  const p=[],n=[],ix=[],steps=5;
  for(let i=0;i<points.length;i++){const prev=points[Math.max(0,i-1)],next=points[Math.min(points.length-1,i+1)],t=unit(next[0]-prev[0],next[1]-prev[1],next[2]-prev[2]),side=unit(...cross(t,normal)),tap=.08+.92*Math.sin(Math.PI*i/(points.length-1));
   for(let j=0;j<=steps;j++){const v=(j/steps*2-1)*width*tap;p.push(points[i][0]+side[0]*v,points[i][1]+side[1]*v,points[i][2]+side[2]*v);n.push(...unit(...cross(t,side)));}
  }
  for(let i=0;i<points.length-1;i++)for(let j=0;j<steps;j++){const a=i*(steps+1)+j,b=a+steps+1;ix.push(a,b,a+1,a+1,b,b+1);}
  add(name,p,n,ix,color,.02,.48);
 }
 // Two distinct gourd chambers, crossed at a lively rhythm angle.
 function maraca(label,center,lean,colors){
  const [x,y,z]=center;
  const handleBase=[x+lean*.28,y-.67,z],handleTop=[x,y-.08,z];
  tube("Beach Maracas "+label+" polished hardwood handle",[handleBase,[x+lean*.18,y-.42,z],[x+lean*.07,y-.2,z],handleTop],[.045,.052,.065,.074],colors.handle,.08,.38,12);
  for(let band=0;band<5;band++){
   const t=.12+band*.15;
   torus("Beach Maracas "+label+" handle woven grip band "+(band+1),[x+lean*.26*(1-t),y-.62+t*.43,z],.052*(1-t*.16),.009,band%2?colors.accent:colors.gold,.42,.34,24,6);
  }
  ellipsoid("Beach Maracas "+label+" carved gourd shell",[x+lean*.025,y+.22,z],[.22,.29,.18],colors.body,.02,.43,28,18);
  ellipsoid("Beach Maracas "+label+" gourd crown",[x+lean*.02,y+.4,z],[.125,.13,.12],colors.accent,.08,.34,20,12);
  torus("Beach Maracas "+label+" painted lower rim",[x+lean*.025,y+.015,z],.2,.014,colors.gold,.56,.28,36,7);
  torus("Beach Maracas "+label+" painted crown ring",[x+lean*.02,y+.35,z],.145,.012,colors.gold,.56,.27,36,7);
  torus("Beach Maracas "+label+" bright accent ring",[x+lean*.02,y+.25,z],.216,.009,colors.accent,.24,.34,36,7);
  for(let row=0;row<3;row++)for(let bead=0;bead<8;bead++){
   const a=TAU*bead/8+(row%2)*.19,ry=y+.11+row*.1;
   const rad=.204-row*.022;
   ellipsoid("Beach Maracas "+label+" hand-painted seed motif "+row+"-"+bead,[x+lean*.025+Math.cos(a)*rad,ry,z+Math.sin(a)*rad*.82],[.018,.032,.012],bead%2?colors.gold:colors.pattern,.22,.32,10,7);
  }
  // Sunburst inlays on the camera-facing side make the two subjects distinguishable.
  for(let ray=0;ray<8;ray++){
   const a=TAU*ray/8;
   const bx=x+lean*.025+Math.cos(a)*.115,by=y+.22+Math.sin(a)*.12,bz=z+.167;
   ribbon("Beach Maracas "+label+" gourd sunburst ray "+(ray+1),[[x+lean*.025, y+.22,z+.179],[bx,by,bz]],.012,ray%2?colors.gold:colors.pattern,[0,0,1]);
  }
  ellipsoid("Beach Maracas "+label+" polished wooden neck ferrule",[x,y-.06,z],[.079,.045,.079],colors.gold,.48,.27,16,10);
 }
 const left={body:"#c95432",accent:"#267b69",handle:"#84522f",gold:"#f0c26b",pattern:"#f3e0aa"};
 const right={body:"#e5a343",accent:"#1d6f73",handle:"#70452d",gold:"#f4d17d",pattern:"#fff0c4"};
 maraca("coral",[ -.24,.04,.02],-.22,left);
 maraca("lagoon",[.24,.04,.035],.22,right);
 // A small authentic woven carry loop and island-shell details finish the pair.
 torus("Beach Maracas braided carry loop",[0,-.58,-.02],.12,.012,"#d5a45f",.12,.62,28,7);
 ellipsoid("Beach Maracas central conch charm",[0,-.41,.1],[.06,.095,.035],"#f1c5a6",.02,.55,16,10);
 for(let i=0;i<3;i++)tube("Beach Maracas conch rib "+(i+1),[[-.035+i*.035,-.46,.13],[ -.02+i*.035,-.4,.145],[.0+i*.035,-.35,.13]],.004,"#fff0db",.02,.48,6);

 const chunks=[],views=[],accessors=[],primitives=[],materials=[];let byteOffset=0;
 const addBuffer=(buffer,target)=>{const pad=(4-buffer.length%4)%4,chunk=pad?Buffer.concat([buffer,Buffer.alloc(pad)]):buffer,view=views.length;views.push({buffer:0,byteOffset,byteLength:buffer.length,target});chunks.push(chunk);byteOffset+=chunk.length;return view;};
 for(const part of parts){
  const pb=Buffer.from(new Float32Array(part.positions).buffer),nb=Buffer.from(new Float32Array(part.normals).buffer),maxIndex=Math.max(...part.indices),use32=maxIndex>65535,ib=use32?Buffer.from(new Uint32Array(part.indices).buffer):Buffer.from(new Uint16Array(part.indices).buffer);
  const pv=addBuffer(pb,34962),nv=addBuffer(nb,34962),iv=addBuffer(ib,34963),min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(let i=0;i<part.positions.length;i+=3)for(let a=0;a<3;a++){min[a]=Math.min(min[a],part.positions[i+a]);max[a]=Math.max(max[a],part.positions[i+a]);}
  const pa=accessors.length;accessors.push({bufferView:pv,componentType:5126,count:part.positions.length/3,type:"VEC3",min,max});
  const na=accessors.length;accessors.push({bufferView:nv,componentType:5126,count:part.normals.length/3,type:"VEC3"});
  const ia=accessors.length;accessors.push({bufferView:iv,componentType:use32?5125:5123,count:part.indices.length,type:"SCALAR"});
  const rgb=[1,3,5].map(i=>parseInt(part.color.slice(i,i+2),16)/255),mi=materials.length;
  materials.push({name:part.name+" material",pbrMetallicRoughness:{baseColorFactor:[...rgb,1],metallicFactor:part.metallic,roughnessFactor:part.roughness},doubleSided:true});
  primitives.push({attributes:{POSITION:pa,NORMAL:na},indices:ia,material:mi,mode:4,extras:{mingloraPartName:part.name}});
 }
 const binary=Buffer.concat(chunks);
 return {asset:{version:"2.0",generator:"Minglora Gift Studio",extras:{mingloraAssetId:"gift-beach-maracas-3d-v1",source:"assets/3d-assets/gift-models/beach-maracas-model.mjs",artDirection:"original crossed pair of brightly painted Caribbean calabash maracas with carved hardwood handles, woven grip rings, hand-painted seed motifs, sunburst inlays, gold accents and conch charm",reviewStatus:"design-review-pending"}},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0,name:"Minglora Beach Maracas - Coral and Lagoon Pair"}],meshes:[{name:"Minglora Caribbean Maracas Pair",primitives}],materials,buffers:[{byteLength:binary.length,uri:"data:application/octet-stream;base64,"+binary.toString("base64")}],bufferViews:views,accessors};
}
