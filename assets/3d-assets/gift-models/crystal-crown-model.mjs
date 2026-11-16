const TAU = Math.PI * 2;
const unit = (x,y,z) => { const d=Math.hypot(x,y,z)||1; return [x/d,y/d,z/d]; };
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]];

export function createCrystalCrownModel() {
  const parts = [];
  const add = (name,positions,normals,indices,color,metallic=0.32,roughness=0.34) => {
    if (!positions.length || positions.length !== normals.length || indices.length < 3) throw new Error("Invalid Crystal Crown mesh " + name);
    const existing = parts.find(part => part.name === name && part.color === color && part.metallic === metallic && part.roughness === roughness);
    if (existing) {
      const offset=existing.positions.length/3;
      existing.positions.push(...positions);
      existing.normals.push(...normals);
      existing.indices.push(...indices.map(index=>index+offset));
    } else parts.push({name,positions,normals,indices,color,metallic,roughness});
  };

  function ellipsoid(name,center,radii,color,metallic=0.18,roughness=0.3,segments=20,rings=14) {
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

  function tube(name,points,radii,color,metallic=0.5,roughness=0.28,sides=10) {
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

  function torus(name,center,major,minor,color,metallic=0.7,roughness=0.24,segments=48,sides=10) {
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

  function ribbon(name,points,width,color,normalAxis=[0,0,1],metallic=0.5,roughness=0.3) {
    const positions=[],normals=[],indices=[],steps=5;
    for(let i=0;i<points.length;i++){
      const previous=points[Math.max(0,i-1)],next=points[Math.min(points.length-1,i+1)];
      const tangent=unit(next[0]-previous[0],next[1]-previous[1],next[2]-previous[2]);
      const side=unit(...cross(tangent,normalAxis));
      const taper=0.08+0.92*Math.pow(Math.sin(Math.PI*i/(points.length-1)),0.65);
      for(let j=0;j<=steps;j++){
        const v=(j/steps)*2-1,half=width*taper;
        positions.push(points[i][0]+side[0]*half*v,points[i][1]+side[1]*half*v,points[i][2]+side[2]*half*v);
        normals.push(...unit(...cross(tangent,side)));
      }
    }
    for(let i=0;i<points.length-1;i++)for(let j=0;j<steps;j++){
      const a=i*(steps+1)+j,b=a+steps+1;
      indices.push(a,b,a+1,a+1,b,b+1);
    }
    add(name,positions,normals,indices,color,metallic,roughness);
  }

  function ringBand(name,yBottom,yTop,rBottom,rTop,color) {
    const segments=64,positions=[],normals=[],indices=[];
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
    add(name,positions,normals,indices,color,0.78,0.25);
  }

  function triangle(name,a,b,c,color,roughness=0.18) {
    const n=unit(...cross([b[0]-a[0],b[1]-a[1],b[2]-a[2]],[c[0]-a[0],c[1]-a[1],c[2]-a[2]]));
    add(name,[...a,...b,...c],[...n,...n,...n],[0,1,2],color,0.22,roughness);
  }

  function gemstone(name,center,radii,palette) {
    const sides=10,ringY=center[1],ring=[];
    for(let i=0;i<sides;i++){
      const a=TAU*i/sides+Math.PI/10;
      ring.push([center[0]+Math.cos(a)*radii[0],ringY,center[2]+Math.sin(a)*radii[2]]);
    }
    const top=[center[0],center[1]+radii[1],center[2]],bottom=[center[0],center[1]-radii[1]*0.72,center[2]];
    for(let i=0;i<sides;i++){
      const next=(i+1)%sides,color=palette[i%palette.length];
      triangle(name+" upper cut facet",top,ring[i],ring[next],color,0.16);
      triangle(name+" pavilion cut facet",bottom,ring[next],ring[i],palette[(i+1)%palette.length],0.2);
    }
    torus(name+" gold setting",[center[0],ringY,center[2]],Math.max(radii[0],radii[2])*0.88,0.009,"#e5bf71",0.86,0.2,28,6);
  }

  // Sculpted gold body and velvet interior.
  torus("Crystal Crown lower gold comfort rim",[0,-0.12,0],0.408,0.043,"#bd852e",0.82,0.26);
  torus("Crystal Crown upper polished edge",[0,0.15,0],0.427,0.025,"#f7d783",0.9,0.2);
  ringBand("Crystal Crown tapered gold band", -0.12,0.15,0.4,0.425,"#d7a642");
  torus("Crystal Crown engraved inner lip",[0,-0.045,0],0.377,0.013,"#8f6028",0.76,0.34);
  torus("Crystal Crown inner velvet lining",[0,-0.115,0],0.354,0.037,"#38234f",0.02,0.88);
  torus("Crystal Crown velvet satin seam",[0,-0.085,0],0.364,0.009,"#9b6fbc",0.2,0.42);

  // Repeating gold engraving and inlaid pearls around the complete lower band.
  for(let i=0;i<24;i++){
    const a=TAU*i/24,x=Math.cos(a),z=Math.sin(a);
    const center=[x*0.421,0.015,z*0.421];
    ellipsoid("Crystal Crown band gold granule "+(i+1),center,[0.018,0.018,0.018],"#f5d486",0.82,0.22,10,7);
    if(i%2===0){
      const r=0.421;
      tube("Crystal Crown band engraved chevron "+(i+1),[
        [x*r,-0.07,z*r],
        [Math.cos(a+0.045)*(r+0.006),-0.015,Math.sin(a+0.045)*(r+0.006)],
        [Math.cos(a+0.09)*r,0.055,Math.sin(a+0.09)*r]
      ],0.004,"#fff0bc",0.62,0.24,6);
    }
  }

  // Five individually shaped crown points with double filigree arches.
  const tips=[];
  for(let i=0;i<5;i++){
    const angle=TAU*i/5+Math.PI/2;
    const radial=[Math.cos(angle),0,Math.sin(angle)];
    const base=[radial[0]*0.39,0.14,radial[2]*0.39];
    const mid=[radial[0]*0.47,0.47,radial[2]*0.47];
    const tip=[radial[0]*0.38,0.82,radial[2]*0.38];
    tips.push({angle,base,mid,tip});
    tube("Crystal Crown royal point spine "+(i+1),[base,mid,tip],[0.045,0.027,0.009],"#e5b84e",0.88,0.22,9);
    tube("Crystal Crown royal point light edge "+(i+1),[
      [base[0]*1.025,base[1]+0.015,base[2]*1.025],
      [mid[0]*1.02,mid[1]+0.02,mid[2]*1.02],
      [tip[0]*1.015,tip[1]-0.02,tip[2]*1.015]
    ],[0.012,0.008,0.002],"#fff0bd",0.68,0.2,7);
    ellipsoid("Crystal Crown point pearl "+(i+1),tip,[0.035,0.035,0.035],"#f9e3a5",0.28,0.2,14,9);
    gemstone("Crystal Crown point jewel "+(i+1),[tip[0],tip[1]-0.1,tip[2]],[0.045,0.072,0.045],["#77dff0","#d9a9ff","#f6d27b","#f3a5c2"]);
  }

  for(let i=0;i<5;i++){
    const current=tips[i],next=tips[(i+1)%5],midAngle=(current.angle+next.angle)/2;
    const control=[Math.cos(midAngle)*0.52,0.37,Math.sin(midAngle)*0.52];
    tube("Crystal Crown inter-point gold arch "+(i+1),[
      current.base,
      [current.base[0]*0.55+control[0]*0.45,0.27,current.base[2]*0.55+control[2]*0.45],
      control,
      [next.base[0]*0.55+control[0]*0.45,0.27,next.base[2]*0.55+control[2]*0.45],
      next.base
    ],[0.018,0.015,0.012,0.015,0.018],"#d9a84c",0.82,0.24,8);
    tube("Crystal Crown inner arch highlight "+(i+1),[
      current.base,[control[0]*0.94,0.31,control[2]*0.94],next.base
    ],0.005,"#fff0bd",0.45,0.2,6);
  }

  // Front-facing central sapphire cluster and graduated side stones.
  torus("Crystal Crown central sapphire bezel",[0,0.34,0.435],0.155,0.023,"#f2d27c",0.85,0.18,40,8);
  gemstone("Crystal Crown great sapphire",[0,0.37,0.452],[0.125,0.17,0.078],["#8be5fa","#43b6e6","#176fae","#d0f8ff","#5792e7"]);
  for(let i=0;i<2;i++){
    const side=i===0?-1:1;
    gemstone("Crystal Crown side amethyst "+(i+1),[side*0.245,0.245,0.355],[0.067,0.092,0.045],["#f2b6ff","#b67de5","#8050b5","#ead5ff"]);
    gemstone("Crystal Crown side emerald "+(i+1),[side*0.32,0.02,0.29],[0.052,0.07,0.038],["#9ce6a8","#48a96d","#24744d","#d3f5bf"]);
  }
  for(let i=0;i<7;i++){
    const a=(i-3)*0.19;
    ellipsoid("Crystal Crown sapphire gallery pearl "+(i+1),[a,-0.055,0.422-Math.abs(a)*0.1],[0.016,0.016,0.012],"#fff0ca",0.34,0.16,10,7);
  }

  // Raised central lotus ornament, side curls and suspended pendant drops.
  for(let side of [-1,1]){
    tube("Crystal Crown front lotus scroll "+side,[
      [side*0.08,0.16,0.412],[side*0.15,0.25,0.44],[side*0.14,0.34,0.45],[side*0.07,0.39,0.46]
    ],[0.014,0.012,0.009,0.003],"#f6d88d",0.85,0.22,8);
    ribbon("Crystal Crown lotus petal "+side,[
      [side*0.018,0.34,0.45],[side*0.06,0.48,0.46],[side*0.105,0.43,0.455]
    ],0.027,"#e8bf69",[0,0,1],0.78,0.22);
    tube("Crystal Crown side pendant chain "+side,[
      [side*0.35,0.11,0.285],[side*0.38,-0.02,0.29],[side*0.38,-0.16,0.3]
    ],0.007,"#e5bf71",0.82,0.2,6);
    gemstone("Crystal Crown suspended drop "+side,[side*0.38,-0.2,0.3],[0.044,0.08,0.035],["#bfeafa","#74c8e9","#f6dfab","#d9c3fa"]);
  }

  // Small pavé stones and engraved stars make the front and side surfaces readable.
  for(let row=0;row<2;row++)for(let i=0;i<13;i++){
    const a=TAU*i/13+(row?0.16:0),r=row?0.43:0.408,y=row?0.105:-0.075;
    ellipsoid("Crystal Crown pavé accent "+row+"-"+i,[Math.cos(a)*r,y,Math.sin(a)*r],[0.012,0.012,0.012],row?"#d4f3ff":"#fff0c8",0.55,0.14,9,6);
  }
  torus("Crystal Crown finial halo",[0,0.88,0],0.075,0.009,"#f8df9d",0.86,0.2,32,6);
  gemstone("Crystal Crown top finial",[0,0.91,0],[0.065,0.1,0.065],["#e7f9ff","#8ccfe7","#c9a6ee","#f4d584"]);

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
      mingloraAssetId:"gift-crystal-crown-3d-v1",
      source:"assets/3d-assets/gift-models/crystal-crown-model.mjs",
      artDirection:"original royal tiara with a tapered sculpted gold band, velvet inner lining, twenty-four granulated band details, five arched points with gold filigree, individually faceted sapphire/amethyst/emerald crystals, a central great sapphire, pendant drops and a jewel-topped finial",
      reviewStatus:"design-review-pending"
    }},
    scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0,name:"Minglora Crystal Crown - Five-point Sapphire Royal Tiara"}],
    meshes:[{name:"Minglora Crystal Crown - Sculpted Gold, Velvet and Faceted Gemstones",primitives}],materials,
    buffers:[{byteLength:binary.length,uri:"data:application/octet-stream;base64,"+binary.toString("base64")}],
    bufferViews,accessors
  };
}
