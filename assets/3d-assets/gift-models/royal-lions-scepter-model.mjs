const TAU = Math.PI * 2;
const unit = (x,y,z) => { const d=Math.hypot(x,y,z)||1; return [x/d,y/d,z/d]; };
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];

export function createRoyalLionsScepterModel() {
  const parts = [];
  const add = (name,positions,normals,indices,color,metallic=0.35,roughness=0.3) => {
    if (!positions.length || positions.length !== normals.length || indices.length < 3) {
      throw new Error("Invalid Royal Lions Scepter mesh " + name);
    }
    const existing = parts.find(part => part.name === name && part.color === color &&
      part.metallic === metallic && part.roughness === roughness);
    if (existing) {
      const offset=existing.positions.length/3;
      existing.positions.push(...positions);
      existing.normals.push(...normals);
      existing.indices.push(...indices.map(index=>index+offset));
    } else {
      parts.push({name,positions,normals,indices,color,metallic,roughness});
    }
  };

  function ellipsoid(name,center,radii,color,metallic=0.18,roughness=0.34,segments=18,rings=12) {
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

  function tube(name,points,radii,color,metallic=0.55,roughness=0.28,sides=9) {
    const positions=[],normals=[],indices=[];
    for(let i=0;i<points.length;i++){
      const previous=points[Math.max(0,i-1)],next=points[Math.min(points.length-1,i+1)];
      const tangent=unit(next[0]-previous[0],next[1]-previous[1],next[2]-previous[2]);
      const reference=Math.abs(tangent[1])>0.9?[0,0,1]:[0,1,0];
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

  function cylinder(name,yBottom,yTop,rBottom,rTop,color,metallic=0.7,roughness=0.25,segments=36) {
    const positions=[],normals=[],indices=[];
    for(let ring=0;ring<2;ring++){
      const y=ring?yTop:yBottom,r=ring?rTop:rBottom;
      for(let i=0;i<=segments;i++){
        const a=TAU*i/segments,x=Math.cos(a),z=Math.sin(a);
        positions.push(r*x,y,r*z);normals.push(x,0,z);
      }
    }
    for(let i=0;i<segments;i++){
      const a=i,b=segments+1+i;
      indices.push(a,a+1,b,a+1,b+1,b);
    }
    add(name,positions,normals,indices,color,metallic,roughness);
  }

  function torus(name,center,major,minor,color,metallic=0.75,roughness=0.22,segments=42,sides=9) {
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

  function facet(name,a,b,c,color,metallic=0.35,roughness=0.18) {
    const normal=unit(...cross([b[0]-a[0],b[1]-a[1],b[2]-a[2]],[c[0]-a[0],c[1]-a[1],c[2]-a[2]]));
    add(name,[...a,...b,...c],[...normal,...normal,...normal],[0,1,2],color,metallic,roughness);
  }

  function gemstone(name,center,radii,palette) {
    const sides=10,ring=[];
    for(let i=0;i<sides;i++){
      const angle=TAU*i/sides+Math.PI/10;
      ring.push([center[0]+Math.cos(angle)*radii[0],center[1],center[2]+Math.sin(angle)*radii[2]]);
    }
    const top=[center[0],center[1]+radii[1],center[2]];
    const bottom=[center[0],center[1]-radii[1]*0.72,center[2]];
    for(let i=0;i<sides;i++){
      const next=(i+1)%sides;
      facet(name+" upper cut facet "+(i+1),top,ring[i],ring[next],palette[i%palette.length],0.42,0.16);
      facet(name+" pavilion cut facet "+(i+1),bottom,ring[next],ring[i],palette[(i+1)%palette.length],0.52,0.2);
    }
    torus(name+" gold bezel",[center[0],center[1],center[2]],Math.max(radii[0],radii[2])*0.9,0.009,"#f3d47c",0.9,0.18,28,6);
  }

  // Scepter shaft: fluted gold, a dark enamel grip, and a weighted lower pommel.
  cylinder("Royal Lions Scepter main gold shaft",-1.18,-0.12,0.067,0.105,"#c58a32",0.88,0.23,32);
  cylinder("Royal Lions Scepter central enamel grip",-0.91,-0.55,0.112,0.112,"#29324a",0.34,0.43,32);
  torus("Royal Lions Scepter grip upper gold collar",[0,-0.55,0],0.115,0.023,"#f1cf76",0.9,0.2);
  torus("Royal Lions Scepter grip lower gold collar",[0,-0.91,0],0.115,0.023,"#f1cf76",0.9,0.2);
  for(let i=0;i<8;i++){
    const y=-0.88+i*0.043;
    torus("Royal Lions Scepter enamel grip filigree ring "+(i+1),[0,y,0],0.111,0.006,i%2?"#dcae56":"#79b8c5",0.76,0.3,32,6);
  }
  // Fine helical grooves along the long shaft.
  for(let strand=0;strand<3;strand++){
    const points=[];
    for(let i=0;i<=42;i++){
      const t=i/42,angle=TAU*(t*2.25+strand/3),radius=0.108;
      points.push([Math.cos(angle)*radius,-0.17-0.35*t,Math.sin(angle)*radius]);
    }
    tube("Royal Lions Scepter spiral shaft filigree "+(strand+1),points,0.008,strand===1?"#fff0b5":"#e9bd60",0.86,0.2,6);
  }
  torus("Royal Lions Scepter lower pommel neck",[0,-1.17,0],0.075,0.025,"#f1d27b",0.88,0.2);
  ellipsoid("Royal Lions Scepter lower pommel orb",[0,-1.29,0],[0.13,0.13,0.13],"#d7a344",0.88,0.22,20,14);
  gemstone("Royal Lions Scepter lower pommel sapphire",[0,-1.29,0.125],[0.045,0.055,0.028],["#9beeff","#35a5d8","#145b9d","#d6f8ff"]);

  // Crossguard and shoulder transitions connect the shaft to the lion-head finial.
  torus("Royal Lions Scepter lower shoulder collar",[0,-0.06,0],0.112,0.025,"#f5d47f",0.9,0.18);
  ellipsoid("Royal Lions Scepter guard centre",[0,-0.015,0],[0.19,0.1,0.13],"#d5a143",0.88,0.22,20,12);
  for(const side of [-1,1]){
    tube("Royal Lions Scepter curved guard arm "+side,[
      [side*0.08,-0.03,0.015],[side*0.23,0.02,0.02],[side*0.37,0.10,0.015],[side*0.43,0.18,0.01]
    ],[0.052,0.04,0.026,0.009],"#e3b34e",0.88,0.22,9);
    ellipsoid("Royal Lions Scepter guard pearl "+side,[side*0.43,0.18,0.01],[0.035,0.035,0.035],"#f8e6b0",0.46,0.19,12,8);
  }

  // Lion mane is a layered aureole behind the forward-facing face.
  ellipsoid("Royal Lions Scepter lion mane core",[0,0.61,0.035],[0.58,0.61,0.24],"#98602b",0.48,0.38,26,18);
  ellipsoid("Royal Lions Scepter inner mane cushion",[0,0.61,0.13],[0.48,0.51,0.22],"#c27a35",0.42,0.4,24,16);
  for(let i=0;i<28;i++){
    const angle=TAU*i/28,ca=Math.cos(angle),sa=Math.sin(angle);
    const start=[ca*0.37,0.61+sa*0.38,0.16];
    const middle=[ca*0.54,0.61+sa*0.57,0.17];
    const end=[ca*0.62,0.61+sa*0.68,0.11];
    tube("Royal Lions Scepter radial mane lock "+(i+1),[
      start,
      [middle[0]*0.84+start[0]*0.16,middle[1]*0.84+start[1]*0.16,0.18],
      middle,end
    ],[0.078,0.067,0.044,0.007],i%4===0?"#f0b958":i%4===1?"#c98235":i%4===2?"#9a542a":"#e4a34b",0.56,0.36,8);
  }
  // Face, cheeks, ears and chin.
  ellipsoid("Royal Lions Scepter sculpted lion face",[0,0.62,0.305],[0.385,0.43,0.205],"#d69a50",0.26,0.38,28,20);
  for(const side of [-1,1]){
    ellipsoid("Royal Lions Scepter lion ear outer "+side,[side*0.31,0.99,0.24],[0.15,0.19,0.09],"#b66b32",0.32,0.4,18,12);
    ellipsoid("Royal Lions Scepter lion ear inner "+side,[side*0.31,0.99,0.315],[0.082,0.115,0.035],"#4a2930",0.1,0.56,16,10);
    ellipsoid("Royal Lions Scepter lion cheek plate "+side,[side*0.21,0.49,0.44],[0.19,0.17,0.095],"#e6b06a",0.22,0.4,18,12);
    tube("Royal Lions Scepter lion brow ridge "+side,[
      [side*0.04,0.79,0.48],[side*0.15,0.85,0.51],[side*0.29,0.81,0.455]
    ],[0.046,0.053,0.026],"#88502b",0.38,0.38,9);
    ellipsoid("Royal Lions Scepter sapphire lion eye "+side,[side*0.155,0.735,0.505],[0.058,0.067,0.028],"#12375c",0.58,0.19,16,12);
    ellipsoid("Royal Lions Scepter eye glint "+side,[side*0.17,0.756,0.531],[0.014,0.021,0.009],"#f7f2d9",0.12,0.12,10,7);
    tube("Royal Lions Scepter cheek whisker groove "+side,[
      [side*0.12,0.48,0.522],[side*0.24,0.45,0.51],[side*0.31,0.49,0.47]
    ],0.009,"#78452b",0.14,0.55,6);
    for(let dot=0;dot<3;dot++){
      ellipsoid("Royal Lions Scepter whisker pore "+side+"-"+(dot+1),[side*(0.18+dot*0.035),0.39+dot*0.035,0.527],[0.012,0.012,0.008],"#70402b",0.1,0.7,8,6);
    }
  }
  ellipsoid("Royal Lions Scepter lion muzzle left",[ -0.095,0.43,0.505],[0.15,0.12,0.09],"#f0d5a4",0.12,0.52,18,12);
  ellipsoid("Royal Lions Scepter lion muzzle right",[0.095,0.43,0.505],[0.15,0.12,0.09],"#f0d5a4",0.12,0.52,18,12);
  ellipsoid("Royal Lions Scepter lion nose",[0,0.51,0.588],[0.095,0.065,0.042],"#39232b",0.18,0.32,18,12);
  tube("Royal Lions Scepter lion philtrum",[ [0,0.46,0.58],[0,0.39,0.59] ],0.012,"#58332c",0.1,0.7,6);
  tube("Royal Lions Scepter lion mouth curve",[
    [-0.105,0.365,0.556],[0,0.337,0.581],[0.105,0.365,0.556]
  ],0.012,"#56302b",0.12,0.68,7);
  ellipsoid("Royal Lions Scepter lion chin",[0,0.29,0.41],[0.19,0.09,0.1],"#bd7c3f",0.2,0.45,18,12);

  // Forehead blaze, cheek engraving and mane beads.
  tube("Royal Lions Scepter lion forehead blaze",[
    [0,0.95,0.47],[0,0.84,0.535],[0,0.77,0.55]
  ],[0.027,0.019,0.005],"#f4d38b",0.28,0.32,7);
  for(let i=0;i<12;i++){
    const angle=TAU*i/12;
    const x=Math.cos(angle)*0.46,y=0.61+Math.sin(angle)*0.48;
    ellipsoid("Royal Lions Scepter mane gold bead "+(i+1),[x,y,0.31],[0.027,0.027,0.021],"#f4d17b",0.82,0.19,10,7);
  }

  // Royal crown set just above the lion brow, with a central sapphire.
  torus("Royal Lions Scepter crown lower gold rim",[0,1.005,0.22],0.315,0.035,"#f1c765",0.9,0.18,40,8);
  cylinder("Royal Lions Scepter crown front band",0.98,1.095,0.285,0.255,"#d7a643",0.88,0.23,36);
  torus("Royal Lions Scepter crown upper gold lip",[0,1.095,0.22],0.255,0.025,"#fff0b4",0.88,0.18,36,8);
  for(let i=0;i<7;i++){
    const angle=TAU*i/7+Math.PI/2,x=Math.cos(angle),z=0.22+Math.sin(angle)*0.22;
    const y=1.12+(i%2)*0.06;
    tube("Royal Lions Scepter crown fleur point "+(i+1),[
      [x*0.23,1.08,z],[x*0.28,y+0.07,z+Math.sin(angle)*0.02],[x*0.25,y+0.19,z]
    ],[0.034,0.019,0.004],"#f0c767",0.9,0.2,8);
    ellipsoid("Royal Lions Scepter crown pearl "+(i+1),[x*0.25,y+0.19,z],[0.025,0.025,0.025],"#fff1bf",0.4,0.18,10,7);
  }
  gemstone("Royal Lions Scepter crown central sapphire",[0,1.12,0.49],[0.092,0.12,0.045],["#a7ecff","#46aee1","#17639d","#dffaff","#527fd0"]);
  gemstone("Royal Lions Scepter crown left ruby",[-0.19,1.06,0.41],[0.045,0.067,0.027],["#ffb2a3","#c83945","#861f35","#f4d0ab"]);
  gemstone("Royal Lions Scepter crown right ruby",[0.19,1.06,0.41],[0.045,0.067,0.027],["#ffb2a3","#c83945","#861f35","#f4d0ab"]);

  // The head joins the shaft through a jeweled neck collar and a fluted transition.
  cylinder("Royal Lions Scepter upper neck post",-0.15,0.06,0.13,0.16,"#c38a37",0.9,0.22,32);
  torus("Royal Lions Scepter upper neck lower collar", [0,-0.1,0],0.145,0.025,"#f2d17b",0.9,0.18);
  torus("Royal Lions Scepter upper neck upper collar", [0,0.015,0],0.17,0.028,"#fff0b6",0.9,0.17);
  gemstone("Royal Lions Scepter neck front emerald",[0,-0.025,0.168],[0.045,0.06,0.025],["#b6f2bd","#55b978","#226348","#e7ffd5"]);

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
    const rgb=[1,3,5].map(i=>parseInt(part.color.slice(i,i+2),16)/255),mi=materials.length;
    materials.push({name:part.name+" material",pbrMetallicRoughness:{baseColorFactor:[...rgb,1],metallicFactor:part.metallic,roughnessFactor:part.roughness},doubleSided:true});
    primitives.push({attributes:{POSITION:pa,NORMAL:na},indices:ia,material:mi,mode:4,extras:{mingloraPartName:part.name}});
  }
  const binary=Buffer.concat(chunks);
  return {
    asset:{version:"2.0",generator:"Minglora Gift Studio",extras:{
      mingloraAssetId:"gift-royal-lions-scepter-3d-v1",
      source:"assets/3d-assets/gift-models/royal-lions-scepter-model.mjs",
      artDirection:"original vertical ceremonial gold scepter crowned by a forward-facing lion head, radial individually modelled mane locks, sculpted muzzle and brows, sapphire eyes, an engraved royal crown, a central deep-blue faceted sapphire, spiral-fluted shaft, dark enamel grip and a jeweled lower pommel",
      reviewStatus:"design-review-pending"
    }},
    scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0,name:"Minglora Royal Lions Scepter - Sculpted Lion Finial and Jeweled Gold Staff"}],
    meshes:[{name:"Minglora Royal Lions Scepter - Mane, Lion Face, Crown, Shaft and Pommel",primitives}],materials,
    buffers:[{byteLength:binary.length,uri:"data:application/octet-stream;base64,"+binary.toString("base64")}],
    bufferViews,accessors
  };
}
