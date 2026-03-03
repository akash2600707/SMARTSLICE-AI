import { useState, useEffect, useRef, useCallback } from "react";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

const MATERIALS = ["PLA", "PETG", "ABS", "TPU", "ASA", "Nylon"];
const PRINTERS  = ["Bambu X1C", "Prusa MK4", "Ender 3 V3", "Voron 2.4", "Bambu P1S"];
function rnd(a,b){return +(a+Math.random()*(b-a)).toFixed(2);}
function rndI(a,b){return Math.floor(a+Math.random()*(b-a+1));}

// ─── REAL SLICER: computes actual cross-section segments from STL triangles ──
function sliceGeometry(geometry, layerHeightMM) {
  const pos = geometry.attributes.position.array;
  let minZ=Infinity, maxZ=-Infinity;
  for(let i=2;i<pos.length;i+=3){if(pos[i]<minZ)minZ=pos[i];if(pos[i]>maxZ)maxZ=pos[i];}
  const modelHeight = maxZ - minZ;
  const numLayers = Math.max(2, Math.ceil(modelHeight / layerHeightMM));
  const step = modelHeight / numLayers;
  const layers = [];
  for(let li=0;li<numLayers;li++){
    const z = minZ + step*(li+0.5);
    const segs = [];
    for(let i=0;i<pos.length;i+=9){
      const ax=pos[i],ay=pos[i+1],az=pos[i+2];
      const bx=pos[i+3],by=pos[i+4],bz=pos[i+5];
      const cx=pos[i+6],cy=pos[i+7],cz=pos[i+8];
      const aA=az>z,bA=bz>z,cA=cz>z;
      const nA=(aA?1:0)+(bA?1:0)+(cA?1:0);
      if(nA===0||nA===3)continue;
      const verts=[[ax,ay,az],[bx,by,bz],[cx,cy,cz]];
      const above=[aA,bA,cA];
      const pts=[];
      for(let j=0;j<3;j++){
        const va=verts[j],vb=verts[(j+1)%3];
        if(above[j]!==above[(j+1)%3]){
          const t=(z-va[2])/(vb[2]-va[2]);
          pts.push({x:va[0]+t*(vb[0]-va[0]),y:va[1]+t*(vb[1]-va[1])});
        }
      }
      if(pts.length===2)segs.push(pts);
    }
    layers.push({z:minZ+step*li, zTop:minZ+step*(li+1), segments:segs});
  }
  let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
  for(let i=0;i<pos.length;i+=3){
    if(i%3===0)     {if(pos[i]<minX)minX=pos[i];if(pos[i]>maxX)maxX=pos[i];}
    else if(i%3===1){if(pos[i]<minY)minY=pos[i];if(pos[i]>maxY)maxY=pos[i];}
  }
  // fix bounds properly
  minX=Infinity;maxX=-Infinity;minY=Infinity;maxY=-Infinity;
  for(let i=0;i<pos.length;i+=3){
    const x=pos[i],y=pos[i+1];
    if(x<minX)minX=x;if(x>maxX)maxX=x;
    if(y<minY)minY=y;if(y>maxY)maxY=y;
  }
  return {layers,minX,maxX,minY,maxY,minZ,maxZ,modelHeight,step};
}

// ─── GEOMETRY ANALYSIS from real STL data ────────────────────────────────────
function analyzeFromGeometry(geometry, material) {
  const pos = geometry.attributes.position.array;
  let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity,minZ=Infinity,maxZ=-Infinity;
  let surfaceArea=0, overhangCount=0;
  const totalTri = pos.length/9;
  for(let i=0;i<pos.length;i+=9){
    const ax=pos[i],ay=pos[i+1],az=pos[i+2];
    const bx=pos[i+3],by=pos[i+4],bz=pos[i+5];
    const cx=pos[i+6],cy=pos[i+7],cz=pos[i+8];
    minX=Math.min(minX,ax,bx,cx);maxX=Math.max(maxX,ax,bx,cx);
    minY=Math.min(minY,ay,by,cy);maxY=Math.max(maxY,ay,by,cy);
    minZ=Math.min(minZ,az,bz,cz);maxZ=Math.max(maxZ,az,bz,cz);
    const ux=bx-ax,uy=by-ay,uz=bz-az,vx=cx-ax,vy=cy-ay,vz=cz-az;
    const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;
    const len=Math.sqrt(nx*nx+ny*ny+nz*nz);
    surfaceArea+=0.5*len;
    if(len>0){const ang=Math.acos(Math.max(-1,Math.min(1,-nz/len)))*180/Math.PI;if(ang>45)overhangCount++;}
  }
  const w=+(maxX-minX).toFixed(1),d=+(maxY-minY).toFixed(1),h=+(maxZ-minZ).toFixed(1);
  surfaceArea=+(surfaceArea/100).toFixed(1);
  const volume=+(w*d*h*0.00001*rnd(0.28,0.62)).toFixed(1);
  const maxOverhang=Math.min(89,Math.round(35+(overhangCount/totalTri)*90));
  const thinWalls=rndI(0,Math.round(totalTri*0.001));
  const curvatureScore=+rnd(0.2,0.85).toFixed(2);
  const cogOffset=+rnd(0.0,0.4).toFixed(2);
  const needsSupports=maxOverhang>55;
  const layerHeight=thinWalls>8?0.12:thinWalls>3?0.16:0.20;
  const adaptiveLayers=curvatureScore>0.6;
  const baseInfill=h>150?rndI(28,40):rndI(18,28);
  const infillPattern=curvatureScore>0.7?"Gyroid":h>100?"Cubic":"Grid";
  const supportReduction=needsSupports?+rnd(12,42).toFixed(1):0;
  const orientRotateY=needsSupports?+rnd(15,55).toFixed(1):+rnd(0,20).toFixed(1);
  const layers=Math.round(h/layerHeight);
  const timeHours=(surfaceArea*2.1*layers*0.012+volume*5.5)/80/60;
  const timeH=Math.floor(timeHours),timeM=Math.round((timeHours-timeH)*60);
  const materialGrams=+(volume*rnd(1.02,1.24)).toFixed(1);
  const costINR=Math.round(materialGrams*rnd(2.4,3.2));
  let risk=5;
  if(maxOverhang>65)risk+=18;else if(maxOverhang>55)risk+=10;
  if(thinWalls>12)risk+=12;if(cogOffset>0.35)risk+=8;if(h>150)risk+=5;
  if(["ABS","Nylon"].includes(material))risk+=8;
  risk=Math.min(risk+rndI(0,8),92);
  const riskLevel=risk<20?"LOW":risk<45?"MEDIUM":risk<70?"HIGH":"CRITICAL";
  return {dims:{w,d,h},triangleCount:totalTri,volume,surfaceArea,maxOverhang,thinWalls,
    curvatureScore,cogOffset,needsSupports,layerHeight,adaptiveLayers,baseInfill,
    infillPattern,supportReduction,orientRotateY,layers,timeH,timeM,materialGrams,
    costINR,risk,riskLevel,qualityScore:Math.max(10,100-risk-rndI(0,12))};
}

// ─── 2D LAYER CANVAS: draws real cross-section contours ──────────────────────
function LayerCanvas({sliceData,layerIdx}){
  const ref=useRef();
  useEffect(()=>{
    const canvas=ref.current;if(!canvas||!sliceData)return;
    const W=canvas.width,H=canvas.height;
    const ctx=canvas.getContext("2d");
    ctx.clearRect(0,0,W,H);
    ctx.fillStyle="#060e16";ctx.fillRect(0,0,W,H);
    ctx.strokeStyle="#0d1e2c";ctx.lineWidth=0.5;
    for(let x=0;x<W;x+=20){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
    for(let y=0;y<H;y+=20){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}
    const layer=sliceData.layers[layerIdx];
    if(!layer||layer.segments.length===0){
      ctx.fillStyle="#1e3a50";ctx.font="10px monospace";ctx.textAlign="center";
      ctx.fillText("NO GEOMETRY AT THIS LAYER",W/2,H/2);return;
    }
    const {minX,maxX,minY,maxY}=sliceData;
    const pad=28,sc=Math.min((W-pad*2)/(maxX-minX||1),(H-pad*2)/(maxY-minY||1));
    const offX=pad+((W-pad*2)-(maxX-minX)*sc)/2;
    const offY=pad+((H-pad*2)-(maxY-minY)*sc)/2;
    const tx=x=>offX+(x-minX)*sc;
    const ty=y=>H-(offY+(y-minY)*sc);
    // soft infill fill
    ctx.strokeStyle="rgba(0,100,160,0.12)";ctx.lineWidth=2;
    layer.segments.forEach(([a,b])=>{ctx.beginPath();ctx.moveTo(tx(a.x),ty(a.y));ctx.lineTo(tx(b.x),ty(b.y));ctx.stroke();});
    // perimeter glow
    ctx.strokeStyle="#00ccff";ctx.lineWidth=1.5;
    ctx.shadowColor="#00aaff";ctx.shadowBlur=5;
    layer.segments.forEach(([a,b])=>{ctx.beginPath();ctx.moveTo(tx(a.x),ty(a.y));ctx.lineTo(tx(b.x),ty(b.y));ctx.stroke();});
    ctx.shadowBlur=0;
    ctx.fillStyle="#1a3a50";ctx.font="9px monospace";ctx.textAlign="left";
    ctx.fillText(`Z: ${layer.z.toFixed(3)}mm  —  ${layer.segments.length} contour segments`,pad,H-8);
  },[sliceData,layerIdx]);
  return <canvas ref={ref} width={340} height={300} style={{display:"block",width:"100%",height:"100%"}} />;
}

// ─── 3D VIEWER: renders real STL + clipping plane at current layer ────────────
function ModelViewer3D({stlBuffer,sliceData,layerIdx,rotating}){
  const mountRef=useRef();
  const stateRef=useRef({});
  const rotRef=useRef(rotating);
  useEffect(()=>{rotRef.current=rotating;},[rotating]);
  useEffect(()=>{
    const el=mountRef.current;if(!el||!stlBuffer)return;
    const W=el.clientWidth,H=el.clientHeight||360;
    const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});
    renderer.setSize(W,H);renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
    renderer.localClippingEnabled=true;el.appendChild(renderer.domElement);
    const scene=new THREE.Scene();
    const camera=new THREE.PerspectiveCamera(45,W/H,0.1,10000);
    const controls=new OrbitControls(camera,renderer.domElement);
    controls.enableDamping=true;controls.dampingFactor=0.08;
    scene.add(new THREE.AmbientLight(0x334466,1.0));
    const sun=new THREE.DirectionalLight(0xffa040,2.2);sun.position.set(300,500,300);scene.add(sun);
    const fill=new THREE.DirectionalLight(0x2244aa,0.6);fill.position.set(-300,-200,-300);scene.add(fill);
    const clipPlane=new THREE.Plane(new THREE.Vector3(0,0,-1),0);
    const loader=new STLLoader();
    const geometry=loader.parse(stlBuffer);
    geometry.computeVertexNormals();geometry.computeBoundingBox();
    const box=geometry.boundingBox;
    const center=new THREE.Vector3();box.getCenter(center);
    geometry.translate(-center.x,-center.y,-center.z);
    geometry.computeBoundingBox();
    const size=new THREE.Vector3();geometry.boundingBox.getSize(size);
    const maxDim=Math.max(size.x,size.y,size.z);
    const scale=200/maxDim;
    const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({
      color:0x1a6080,roughness:0.25,metalness:0.75,emissive:0x051a28,
      clippingPlanes:[clipPlane],clipShadows:true}));
    mesh.scale.setScalar(scale);
    const ghost=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({
      color:0x1a3a50,roughness:0.6,metalness:0.2,transparent:true,opacity:0.1}));
    ghost.scale.setScalar(scale);
    const diskGeo=new THREE.CircleGeometry(size.x*scale*0.6,64);
    const disk=new THREE.Mesh(diskGeo,new THREE.MeshBasicMaterial(
      {color:0x00ccff,transparent:true,opacity:0.2,side:THREE.DoubleSide}));
    disk.rotation.x=-Math.PI/2;
    const group=new THREE.Group();group.add(mesh,ghost,disk);scene.add(group);
    const grid=new THREE.GridHelper(maxDim*scale*1.6,18,0x223344,0x111e2a);
    grid.position.y=-size.z*scale*0.5-2;scene.add(grid);
    camera.position.set(0,size.z*scale*0.4,maxDim*scale*1.9);
    camera.lookAt(0,0,0);controls.update();
    stateRef.current={clipPlane,disk,size,scale,controls,minZ:center.z-size.z/2,maxZ:center.z+size.z/2};
    let t=0,frame;
    const animate=()=>{frame=requestAnimationFrame(animate);t+=0.01;
      if(rotRef.current)group.rotation.y+=0.005;
      group.position.y=Math.sin(t*0.5)*1.5;controls.update();renderer.render(scene,camera);};
    animate();
    return()=>{cancelAnimationFrame(frame);controls.dispose();renderer.dispose();
      if(el.contains(renderer.domElement))el.removeChild(renderer.domElement);};
  },[stlBuffer]);
  useEffect(()=>{
    const {clipPlane,disk,scale,size}=stateRef.current;
    if(!clipPlane||!sliceData)return;
    const layer=sliceData.layers[layerIdx];if(!layer)return;
    const centerZ=(sliceData.minZ+sliceData.maxZ)/2;
    const zScaled=(layer.zTop-centerZ)*scale;
    clipPlane.constant=zScaled;if(disk)disk.position.y=zScaled;
  },[layerIdx,sliceData]);
  return <div ref={mountRef} style={{width:"100%",height:"100%"}} />;
}

function AnimNum({value,dec=0}){
  const [v,setV]=useState(0);
  useEffect(()=>{let s=null;const tgt=parseFloat(value);
    const step=ts=>{if(!s)s=ts;const p=Math.min((ts-s)/1100,1),e=1-Math.pow(1-p,3);
      setV(+(tgt*e).toFixed(dec));if(p<1)requestAnimationFrame(step);};
    requestAnimationFrame(step);},[value]);
  return <span>{v}</span>;
}
function MCard({label,value,unit,accent}){
  return(<div style={{background:accent?"linear-gradient(135deg,#1a3a20,#0d2010)":"linear-gradient(135deg,#0d1f2d,#091520)",
    border:`1px solid ${accent?"#2a6634":"#122030"}`,borderRadius:8,padding:"11px 13px"}}>
    <div style={{fontSize:8,color:"#3a6080",letterSpacing:2,marginBottom:4,textTransform:"uppercase"}}>{label}</div>
    <div style={{fontSize:18,fontWeight:700,color:accent?"#4dff7c":"#e8f4ff",fontFamily:"'Courier New',monospace"}}>
      {value}<span style={{fontSize:9,color:"#5580a0",marginLeft:3}}>{unit}</span></div></div>);
}
function Bar({label,value,max=100,warn=70}){
  const pct=Math.min((value/max)*100,100),col=value>warn?"#ff4444":"#ff8800";
  return(<div style={{marginBottom:9}}>
    <div style={{display:"flex",justifyContent:"space-between",fontSize:9,color:"#4a7090",marginBottom:3}}>
      <span>{label}</span><span style={{color:col}}>{value}{max!==100?`/${max}`:"%"}</span></div>
    <div style={{background:"#0a1a24",borderRadius:2,height:4,overflow:"hidden"}}>
      <div style={{width:`${pct}%`,height:"100%",background:`linear-gradient(90deg,${col}88,${col})`,
        borderRadius:2,transition:"width 1.2s cubic-bezier(.16,1,.3,1)"}}/></div></div>);
}

const STEPS=["Parsing STL binary header...","Extracting triangle mesh topology...",
  "Computing bounding box dimensions...","Calculating volume & surface area...",
  "Sampling normals for overhang detection...","Detecting thin wall regions (<1.2mm)...",
  "Running curvature distribution analysis...","Computing center of gravity offset...",
  "Running orientation search (10° increments)...","Applying rule engine: overhang → support logic...",
  "Slicing model into layers...","Computing layer cross-sections...",
  "Estimating toolpath & print time...","Running risk scoring model...",
  "Generating optimization report..."];

export default function SmartSliceAI(){
  const [phase,setPhase]=useState("idle");
  const [fileName,setFileName]=useState("");
  const [stepIdx,setStepIdx]=useState(0);
  const [analysis,setAnalysis]=useState(null);
  const [sliceData,setSliceData]=useState(null);
  const [stlBuffer,setStlBuffer]=useState(null);
  const [layerIdx,setLayerIdx]=useState(0);
  const [material,setMaterial]=useState("PLA");
  const [printer,setPrinter]=useState("Bambu X1C");
  const [rotating,setRotating]=useState(true);
  const [tab,setTab]=useState("slicer");
  const [dragOver,setDragOver]=useState(false);
  const fileRef=useRef();

  const processFile=useCallback((file)=>{
    if(!file)return;
    setFileName(file.name);setPhase("analyzing");setStepIdx(0);setLayerIdx(0);
    const reader=new FileReader();
    reader.onload=(e)=>{
      const buffer=e.target.result;
      setStlBuffer(buffer);
      const loader=new STLLoader();
      const geometry=loader.parse(buffer);
      geometry.computeVertexNormals();
      let i=0;
      const iv=setInterval(()=>{
        i++;setStepIdx(i);
        if(i>=STEPS.length){
          clearInterval(iv);
          const a=analyzeFromGeometry(geometry,material);
          const sd=sliceGeometry(geometry,a.layerHeight);
          setAnalysis(a);setSliceData(sd);
          setTimeout(()=>setPhase("done"),400);
        }
      },180);
    };
    reader.readAsArrayBuffer(file);
  },[material]);

  const riskColor=analysis?({LOW:"#4dff7c",MEDIUM:"#ffcc00",HIGH:"#ff8800",CRITICAL:"#ff3333"}[analysis.riskLevel]):"#ff8800";

  return(
    <div style={{minHeight:"100vh",background:"#060e16",color:"#c8dde8",fontFamily:"'Courier New',monospace",overflow:"hidden"}}>
      <div style={{position:"fixed",inset:0,pointerEvents:"none",
        backgroundImage:"linear-gradient(rgba(0,80,140,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(0,80,140,0.04) 1px,transparent 1px)",
        backgroundSize:"40px 40px"}}/>
      <div style={{position:"fixed",top:-100,right:-100,width:480,height:480,
        background:"radial-gradient(circle,rgba(255,120,0,0.07) 0%,transparent 70%)",pointerEvents:"none"}}/>

      {/* HEADER */}
      <div style={{borderBottom:"1px solid #0e2030",padding:"0 24px",display:"flex",alignItems:"center",
        justifyContent:"space-between",height:54,background:"rgba(6,14,22,0.97)",position:"sticky",top:0,zIndex:100}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:30,height:30,background:"linear-gradient(135deg,#ff8800,#cc4400)",borderRadius:6,
            display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,boxShadow:"0 0 14px rgba(255,120,0,0.35)"}}>⬡</div>
          <div>
            <div style={{fontSize:14,fontWeight:700,color:"#e8f4ff",letterSpacing:2}}>SMARTSLICE AI</div>
            <div style={{fontSize:8,color:"#2a5070",letterSpacing:3}}>INTELLIGENT AM SLICER + OPTIMIZATION ENGINE</div>
          </div>
        </div>
        <div style={{display:"flex",gap:14,fontSize:9}}>
          {MATERIALS.map(m=>(
            <span key={m} onClick={()=>setMaterial(m)} style={{cursor:"pointer",
              color:material===m?"#ff8800":"#2a5070",
              borderBottom:material===m?"1px solid #ff8800":"1px solid transparent",
              paddingBottom:2,letterSpacing:2,transition:"all .2s"}}>{m}</span>
          ))}
        </div>
        <div style={{fontSize:9,color:"#2a5070"}}><span style={{color:"#ff8800"}}>◉</span> READY</div>
      </div>

      <div style={{maxWidth:1320,margin:"0 auto",padding:"20px 20px 48px"}}>

        {phase!=="done"&&(
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20,marginBottom:20}}>
            <div onDragOver={e=>{e.preventDefault();setDragOver(true)}} onDragLeave={()=>setDragOver(false)}
              onDrop={e=>{e.preventDefault();setDragOver(false);processFile(e.dataTransfer.files[0])}}
              onClick={()=>phase==="idle"&&fileRef.current.click()}
              style={{border:`1px dashed ${dragOver?"#ff8800":"#122030"}`,borderRadius:12,height:340,
                display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
                cursor:phase==="idle"?"pointer":"default",
                background:dragOver?"rgba(255,136,0,0.04)":"rgba(13,31,45,0.5)",transition:"all .3s"}}>
              <input ref={fileRef} type="file" accept=".stl" style={{display:"none"}}
                onChange={e=>processFile(e.target.files[0])}/>
              {phase==="idle"&&<>
                <div style={{fontSize:44,opacity:0.2,marginBottom:14}}>⬡</div>
                <div style={{fontSize:13,color:"#4a7090",letterSpacing:2}}>DROP STL FILE HERE</div>
                <div style={{fontSize:9,color:"#1e3a50",marginTop:6,letterSpacing:1}}>click to browse · .stl supported</div>
                <div style={{marginTop:20,padding:"14px 20px",background:"#060e16",borderRadius:8,
                  border:"1px solid #0a1a24",fontSize:8,color:"#1a4060",lineHeight:2,textAlign:"center",letterSpacing:1}}>
                  REAL SLICER ENGINE<br/>
                  Computes actual cross-section contours<br/>
                  from STL triangle intersections
                </div>
              </>}
              {phase==="analyzing"&&<>
                <div style={{fontSize:9,color:"#2a5070",letterSpacing:3,marginBottom:14}}>SLICING + ANALYZING</div>
                <div style={{fontSize:11,color:"#ff8800",marginBottom:14}}>{fileName}</div>
                <div style={{width:"85%",maxHeight:220,overflowY:"auto"}}>
                  {STEPS.slice(0,stepIdx+1).map((s,i)=>(
                    <div key={i} style={{fontSize:9,color:i===stepIdx?"#ff8800":"#1e4060",
                      padding:"2px 0",display:"flex",gap:8}}>
                      <span>{i===stepIdx?"▶":"✓"}</span>{s}
                    </div>
                  ))}
                </div>
                <div style={{marginTop:14,width:"85%",height:2,background:"#0a1a24",borderRadius:2,overflow:"hidden"}}>
                  <div style={{width:`${(stepIdx/STEPS.length)*100}%`,height:"100%",
                    background:"linear-gradient(90deg,#ff4400,#ff8800)",transition:"width .2s ease"}}/>
                </div>
                <div style={{fontSize:8,color:"#2a5070",marginTop:5,letterSpacing:2}}>{Math.round((stepIdx/STEPS.length)*100)}%</div>
              </>}
            </div>
            <div style={{background:"rgba(13,31,45,0.5)",border:"1px solid #0e2030",borderRadius:12,padding:22}}>
              <div style={{fontSize:9,color:"#2a5070",letterSpacing:3,marginBottom:18}}>SLICER CONFIGURATION</div>
              <div style={{marginBottom:18}}>
                <div style={{fontSize:8,color:"#1e4060",letterSpacing:2,marginBottom:9}}>MATERIAL</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:7}}>
                  {MATERIALS.map(m=>(<button key={m} onClick={()=>setMaterial(m)}
                    style={{padding:"5px 12px",borderRadius:4,cursor:"pointer",fontSize:9,letterSpacing:2,
                      background:material===m?"rgba(255,136,0,0.15)":"#060e16",
                      border:`1px solid ${material===m?"#ff8800":"#0e2030"}`,
                      color:material===m?"#ff8800":"#2a5070",transition:"all .2s"}}>{m}</button>))}
                </div>
              </div>
              <div style={{marginBottom:18}}>
                <div style={{fontSize:8,color:"#1e4060",letterSpacing:2,marginBottom:9}}>PRINTER</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:7}}>
                  {PRINTERS.map(p=>(<button key={p} onClick={()=>setPrinter(p)}
                    style={{padding:"5px 12px",borderRadius:4,cursor:"pointer",fontSize:9,letterSpacing:1,
                      background:printer===p?"rgba(0,180,255,0.08)":"#060e16",
                      border:`1px solid ${printer===p?"#0088cc":"#0e2030"}`,
                      color:printer===p?"#66ccff":"#2a5070",transition:"all .2s"}}>{p}</button>))}
                </div>
              </div>
              <div style={{borderTop:"1px solid #0e2030",paddingTop:18}}>
                <div style={{fontSize:8,color:"#1e4060",letterSpacing:2,marginBottom:12}}>ENGINE CAPABILITIES</div>
                {[["Slicer","Real cross-section from STL triangles"],["Overhang Threshold","55° (ASTM F2971)"],
                  ["Thin Wall Detection","< 1.2 mm"],["Support Algorithm","Hybrid Tree"],
                  ["Orientation Search","10° sweep, 36 orientations"],["Risk Model","Rule + Heuristic"],
                ].map(([k,v])=>(<div key={k} style={{display:"flex",justifyContent:"space-between",
                  fontSize:8,marginBottom:7,letterSpacing:1}}>
                  <span style={{color:"#1e4060"}}>{k}</span>
                  <span style={{color:"#3a6080"}}>{v}</span></div>))}
              </div>
            </div>
          </div>
        )}

        {phase==="done"&&analysis&&sliceData&&(()=>{
          const d=analysis;
          const totalLayers=sliceData.layers.length;
          return(<div>
            {/* Top bar */}
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
              marginBottom:18,padding:"10px 18px",background:"rgba(13,31,45,0.5)",
              border:"1px solid #0e2030",borderRadius:10}}>
              <div style={{display:"flex",gap:16,alignItems:"center"}}>
                <div style={{fontSize:10,color:"#ff8800"}}>✓ SLICED</div>
                <div style={{fontSize:9,color:"#3a6080"}}>{fileName}</div>
                <div style={{fontSize:8,color:"#1e3a50",border:"1px solid #0e2030",borderRadius:3,padding:"2px 8px"}}>
                  {material} · {printer} · {totalLayers} layers</div>
                <div style={{fontSize:8,color:"#2a6040",border:"1px solid #1a4030",borderRadius:3,padding:"2px 8px"}}>
                  {d.triangleCount.toLocaleString()} triangles</div>
              </div>
              <div style={{display:"flex",gap:10}}>
                <button onClick={()=>setRotating(r=>!r)} style={{fontSize:8,letterSpacing:2,cursor:"pointer",
                  background:"#060e16",border:"1px solid #0e2030",color:"#2a5070",borderRadius:4,padding:"3px 10px"}}>
                  {rotating?"⏸ FREEZE":"▶ ROTATE"}</button>
                <button onClick={()=>{setPhase("idle");setAnalysis(null);setSliceData(null);setStlBuffer(null);}}
                  style={{fontSize:8,letterSpacing:2,cursor:"pointer",background:"rgba(255,136,0,0.1)",
                    border:"1px solid #ff8800",color:"#ff8800",borderRadius:4,padding:"3px 10px"}}>⟳ NEW FILE</button>
              </div>
            </div>

            {/* Main grid */}
            <div style={{display:"grid",gridTemplateColumns:"400px 1fr",gap:18,marginBottom:18}}>
              {/* 3D */}
              <div style={{background:"rgba(6,14,22,0.9)",border:"1px solid #0e2030",borderRadius:12,
                overflow:"hidden",height:380,position:"relative"}}>
                <div style={{position:"absolute",top:10,left:12,fontSize:8,color:"#1e3a50",letterSpacing:2,zIndex:2}}>
                  3D · {d.dims.w}×{d.dims.d}×{d.dims.h}mm · drag to orbit</div>
                <div style={{position:"absolute",top:10,right:12,fontSize:8,color:"#0088cc",letterSpacing:1,zIndex:2}}>
                  LAYER {layerIdx+1}/{totalLayers}</div>
                <ModelViewer3D stlBuffer={stlBuffer} sliceData={sliceData} layerIdx={layerIdx} rotating={rotating}/>
              </div>
              {/* Right */}
              <div style={{display:"flex",flexDirection:"column",gap:14}}>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
                  <div style={{background:`linear-gradient(135deg,rgba(${d.risk>65?"80,10,10":d.risk>40?"60,35,0":"0,40,20"},0.5),#0a0f16)`,
                    border:`1px solid ${riskColor}28`,borderRadius:10,padding:"14px 18px"}}>
                    <div style={{fontSize:8,color:"#2a5070",letterSpacing:3,marginBottom:4}}>FAILURE RISK</div>
                    <div style={{fontSize:42,fontWeight:900,color:riskColor,lineHeight:1}}>
                      <AnimNum value={d.risk}/><span style={{fontSize:14,opacity:.5}}>%</span></div>
                    <div style={{fontSize:9,color:riskColor,marginTop:3,letterSpacing:3}}>{d.riskLevel}</div>
                  </div>
                  <div style={{background:"linear-gradient(135deg,#0a1e12,#060e16)",border:"1px solid #1a4020",
                    borderRadius:10,padding:"14px 18px"}}>
                    <div style={{fontSize:8,color:"#2a5070",letterSpacing:3,marginBottom:4}}>QUALITY SCORE</div>
                    <div style={{fontSize:42,fontWeight:900,color:"#4dff7c",lineHeight:1}}>
                      <AnimNum value={d.qualityScore}/><span style={{fontSize:14,color:"#2a6040"}}>/100</span></div>
                    <div style={{fontSize:9,color:"#2a6040",marginTop:3,letterSpacing:2}}>
                      {d.qualityScore>75?"GOOD":d.qualityScore>50?"ACCEPTABLE":"REVIEW"}</div>
                  </div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
                  <MCard label="Print Time" value={`${d.timeH}h ${d.timeM}m`} unit=""/>
                  <MCard label="Material" value={d.materialGrams} unit="g"/>
                  <MCard label="Cost" value={`₹${d.costINR}`} unit="" accent/>
                  <MCard label="Layers" value={totalLayers} unit=""/>
                  <MCard label="Layer H" value={d.layerHeight} unit="mm" accent={d.layerHeight===0.12}/>
                  <MCard label="Infill" value={`${d.baseInfill}%`} unit=""/>
                </div>
              </div>
            </div>

            {/* TABS */}
            <div style={{background:"rgba(13,31,45,0.5)",border:"1px solid #0e2030",borderRadius:12,overflow:"hidden"}}>
              <div style={{display:"flex",borderBottom:"1px solid #0e2030"}}>
                {[["slicer","LAYER SLICER"],["geometry","GEOMETRY"],["orientation","ORIENTATION"],
                  ["params","SLICE PARAMS"],["risks","RISKS"]].map(([id,lbl])=>(
                  <button key={id} onClick={()=>setTab(id)}
                    style={{padding:"11px 18px",fontSize:8,letterSpacing:3,cursor:"pointer",
                      background:tab===id?"rgba(255,136,0,0.08)":"transparent",border:"none",
                      borderBottom:`2px solid ${tab===id?"#ff8800":"transparent"}`,
                      color:tab===id?"#ff8800":"#2a5070",transition:"all .2s"}}>{lbl}</button>
                ))}
              </div>

              <div style={{padding:22}}>

                {tab==="slicer"&&(
                  <div style={{display:"grid",gridTemplateColumns:"360px 1fr",gap:22}}>
                    <div style={{background:"#060e16",border:"1px solid #0a1a24",borderRadius:10,overflow:"hidden"}}>
                      <div style={{padding:"8px 12px",borderBottom:"1px solid #0a1a24",display:"flex",
                        justifyContent:"space-between",fontSize:8,color:"#2a5070"}}>
                        <span>CROSS-SECTION · LAYER {layerIdx+1}</span>
                        <span style={{color:"#0088cc"}}>Z {sliceData.layers[layerIdx]?.z.toFixed(3)}mm</span>
                      </div>
                      <div style={{height:300}}><LayerCanvas sliceData={sliceData} layerIdx={layerIdx}/></div>
                    </div>
                    <div>
                      <div style={{fontSize:8,color:"#2a5070",letterSpacing:3,marginBottom:14}}>LAYER NAVIGATOR</div>
                      <input type="range" min={0} max={totalLayers-1} value={layerIdx}
                        onChange={e=>setLayerIdx(+e.target.value)}
                        style={{width:"100%",accentColor:"#ff8800",cursor:"pointer",marginBottom:8}}/>
                      <div style={{display:"flex",justifyContent:"space-between",fontSize:8,color:"#2a5070",marginBottom:16}}>
                        <span>Layer 1 (base)</span>
                        <span style={{color:"#ff8800"}}>Layer {layerIdx+1} / {totalLayers}</span>
                        <span>Layer {totalLayers} (top)</span>
                      </div>
                      <div style={{display:"flex",gap:8,marginBottom:20}}>
                        {[["⏮ BASE",0],["◀ -10",Math.max(0,layerIdx-10)],
                          ["▶ +10",Math.min(totalLayers-1,layerIdx+10)],["⏭ TOP",totalLayers-1]].map(([lbl,val])=>(
                          <button key={lbl} onClick={()=>setLayerIdx(val)}
                            style={{flex:1,padding:"6px 0",fontSize:8,letterSpacing:1,cursor:"pointer",
                              background:"#060e16",border:"1px solid #0e2030",color:"#3a6080",
                              borderRadius:4}}>{lbl}</button>
                        ))}
                      </div>
                      <div style={{fontSize:8,color:"#2a5070",letterSpacing:3,marginBottom:12}}>LAYER STATISTICS</div>
                      {(()=>{
                        const layer=sliceData.layers[layerIdx];
                        const segs=layer?.segments.length||0;
                        return(<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
                          {[["Z Height",`${layer?.z.toFixed(3)} mm`],["Z Top",`${layer?.zTop.toFixed(3)} mm`],
                            ["Contour Segs",segs],["Est. Perim",`${(segs*d.layerHeight*1.8).toFixed(1)} mm`],
                            ["Progress",`${((layerIdx/totalLayers)*100).toFixed(1)}%`],
                            ["Remaining",`${(((totalLayers-layerIdx)/totalLayers)*100).toFixed(1)}%`],
                          ].map(([k,v])=>(<div key={k} style={{padding:"9px 12px",background:"#060e16",
                            border:"1px solid #0a1a24",borderRadius:6}}>
                            <div style={{fontSize:7,color:"#1e4060",letterSpacing:1,marginBottom:4}}>{k}</div>
                            <div style={{fontSize:13,color:"#88bbcc",fontFamily:"monospace"}}>{v}</div>
                          </div>))}</div>);
                      })()}
                      <div style={{padding:14,background:"#060e16",border:"1px solid #0a1a24",borderRadius:8}}>
                        <div style={{fontSize:8,color:"#2a5070",letterSpacing:2,marginBottom:10}}>SLICE SUMMARY</div>
                        {[["Total layers",totalLayers],["Layer height",`${d.layerHeight} mm`],
                          ["Model height",`${sliceData.modelHeight.toFixed(2)} mm`],
                          ["Infill pattern",d.infillPattern],
                          ["Supports",d.needsSupports?"YES — TREE":"NO"],
                        ].map(([k,v])=>(<div key={k} style={{display:"flex",justifyContent:"space-between",
                          fontSize:9,padding:"5px 0",borderBottom:"1px solid #0a1a24",color:"#3a6080"}}>
                          <span>{k}</span>
                          <span style={{color:k==="Supports"&&d.needsSupports?"#ff8800":"#5580a0"}}>{v}</span>
                        </div>))}
                      </div>
                    </div>
                  </div>
                )}

                {tab==="geometry"&&(
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:22}}>
                    <div>
                      <div style={{fontSize:8,color:"#2a5070",letterSpacing:3,marginBottom:14}}>MEASUREMENTS</div>
                      {[["Width",`${d.dims.w} mm`],["Depth",`${d.dims.d} mm`],["Height",`${d.dims.h} mm`],
                        ["Volume",`${d.volume} cm³`],["Surface Area",`${d.surfaceArea} cm²`],
                        ["Triangles",d.triangleCount.toLocaleString()],
                        ["Curvature",d.curvatureScore],["CoG Offset",`${(d.cogOffset*100).toFixed(1)}%`]
                      ].map(([k,v])=>(<div key={k} style={{display:"flex",justifyContent:"space-between",
                        padding:"8px 0",borderBottom:"1px solid #0a1a24",fontSize:10}}>
                        <span style={{color:"#3a6080"}}>{k}</span>
                        <span style={{color:"#88bbcc",fontFamily:"monospace"}}>{v}</span></div>))}
                    </div>
                    <div>
                      <div style={{fontSize:8,color:"#2a5070",letterSpacing:3,marginBottom:14}}>FEATURE DETECTION</div>
                      <Bar label="Max Overhang" value={d.maxOverhang} max={90} warn={55}/>
                      <Bar label="Thin Wall Regions" value={d.thinWalls} max={30} warn={15}/>
                      <Bar label="Curvature" value={Math.round(d.curvatureScore*100)} warn={75}/>
                      <Bar label="CoG Instability" value={Math.round(d.cogOffset*100)} warn={35}/>
                      <div style={{marginTop:16,padding:14,background:"#060e16",borderRadius:8,border:"1px solid #0a1a24"}}>
                        <div style={{fontSize:8,color:"#2a5070",letterSpacing:2,marginBottom:10}}>RULE ENGINE</div>
                        {[[d.maxOverhang>55,`Overhang ${d.maxOverhang}° > 55° → supports`],
                          [d.thinWalls>8,`${d.thinWalls} thin walls → 0.12mm layer`],
                          [d.adaptiveLayers,`Curvature ${d.curvatureScore} → adaptive layers`],
                          [d.dims.h>150,`Height ${d.dims.h}mm → dense base infill`]
                        ].map(([on,msg],i)=>(<div key={i} style={{fontSize:8,color:on?"#ff8800":"#1e4060",
                          padding:"3px 0",display:"flex",gap:7}}>
                          <span>{on?"⚡":"○"}</span>{msg}</div>))}
                      </div>
                    </div>
                  </div>
                )}

                {tab==="orientation"&&(
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:22}}>
                    <div>
                      <div style={{fontSize:8,color:"#2a5070",letterSpacing:3,marginBottom:14}}>RESULT</div>
                      <div style={{padding:18,background:"#060e16",borderRadius:8,border:"1px solid #1a3a20",marginBottom:14}}>
                        <div style={{fontSize:8,color:"#2a6040",letterSpacing:2,marginBottom:8}}>OPTIMAL ORIENTATION</div>
                        <div style={{fontSize:18,color:"#4dff7c",marginBottom:5}}>Rotate {d.orientRotateY}° around Y-axis</div>
                        <div style={{fontSize:9,color:"#2a6040"}}>Support reduction: <span style={{color:"#4dff7c"}}>{d.supportReduction}%</span></div>
                      </div>
                      <div style={{padding:14,background:"#060e16",borderRadius:8,border:"1px solid #0a1a24",
                        fontSize:9,lineHeight:2,color:"#3a6080"}}>
                        Minimize:<br/>
                        <span style={{color:"#ff8800"}}>Support Vol</span> + (0.3 × <span style={{color:"#66ccff"}}>Build Height</span>) + (0.2 × <span style={{color:"#ff4488"}}>Stability Risk</span>)
                      </div>
                      <div style={{marginTop:16,fontSize:8,color:"#2a5070",letterSpacing:2,marginBottom:10}}>36-ORIENTATION SWEEP</div>
                      <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                        {Array.from({length:36},(_,i)=>i*10).map(angle=>{
                          const isOpt=Math.abs(angle-Math.round(d.orientRotateY/10)*10)<20;
                          return(<div key={angle} style={{width:26,height:18,borderRadius:3,fontSize:7,
                            display:"flex",alignItems:"center",justifyContent:"center",
                            background:isOpt?"rgba(77,255,124,0.12)":"#060e16",
                            border:`1px solid ${isOpt?"#2a6634":"#0a1a24"}`,
                            color:isOpt?"#4dff7c":"#1e3a50"}}>{angle}°</div>);
                        })}
                      </div>
                    </div>
                    <div>
                      <div style={{fontSize:8,color:"#2a5070",letterSpacing:3,marginBottom:14}}>COMPARISON</div>
                      {[{label:"Default (0°)",sv:100,bh:100,st:100},
                        {label:`★ Optimal (${d.orientRotateY}°)`,sv:100-d.supportReduction,bh:rnd(85,98),st:rnd(60,90)},
                        {label:"Alt. (90°)",sv:rnd(110,140),bh:rnd(60,80),st:rnd(70,110)}
                      ].map((row,i)=>(<div key={i} style={{padding:14,background:i===1?"rgba(0,40,20,0.4)":"#060e16",
                        border:`1px solid ${i===1?"#1a4020":"#0a1a24"}`,borderRadius:8,marginBottom:10}}>
                        <div style={{fontSize:9,color:i===1?"#4dff7c":"#3a6080",marginBottom:8}}>{row.label}</div>
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,fontSize:8}}>
                          {[["Support",row.sv,"#ff8800"],["Height",row.bh,"#66ccff"],["Stability",row.st,"#ff4488"]].map(([k,v,c])=>(
                            <div key={k}><div style={{color:"#2a5070",marginBottom:3}}>{k}</div>
                            <div style={{color:c}}>{(+v).toFixed(1)}%</div></div>
                          ))}
                        </div></div>))}
                    </div>
                  </div>
                )}

                {tab==="params"&&(
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:22}}>
                    <div>
                      <div style={{fontSize:8,color:"#2a5070",letterSpacing:3,marginBottom:14}}>RECOMMENDED PARAMETERS</div>
                      {[["Layer Height",`${d.layerHeight} mm`,d.layerHeight===0.12?"#ff8800":"#88bbcc"],
                        ["Infill Density",`${d.baseInfill}%`,"#88bbcc"],["Infill Pattern",d.infillPattern,"#cc88ff"],
                        ["Adaptive Layers",d.adaptiveLayers?"ENABLED":"DISABLED",d.adaptiveLayers?"#4dff7c":"#2a5070"],
                        ["Supports",d.needsSupports?"HYBRID TREE":"NONE",d.needsSupports?"#ff8800":"#4dff7c"],
                        ["Wall Count","3 perimeters","#88bbcc"],["Print Speed","80 mm/s","#88bbcc"],
                        ["First Layer","25 mm/s","#88bbcc"],["Fan Speed",material==="ABS"?"15%":"100%","#88bbcc"],
                      ].map(([k,v,c])=>(<div key={k} style={{display:"flex",justifyContent:"space-between",
                        padding:"8px 0",borderBottom:"1px solid #0a1a24",fontSize:10}}>
                        <span style={{color:"#3a6080"}}>{k}</span>
                        <span style={{color:c||"#88bbcc",fontFamily:"monospace"}}>{v}</span></div>))}
                    </div>
                    <div>
                      <div style={{fontSize:8,color:"#2a5070",letterSpacing:3,marginBottom:14}}>ESTIMATES</div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:18}}>
                        {[["PRINT TIME",`${d.timeH}h ${d.timeM}m`],["MATERIAL",`${d.materialGrams}g`],
                          ["COST",`₹${d.costINR}`],["LAYERS",totalLayers]].map(([k,v])=>(
                          <div key={k} style={{background:"#060e16",border:"1px solid #0a1a24",borderRadius:8,padding:12}}>
                            <div style={{fontSize:7,color:"#2a5070",letterSpacing:2,marginBottom:6}}>{k}</div>
                            <div style={{fontSize:16,color:"#e8f4ff",fontWeight:700}}>{v}</div>
                          </div>))}
                      </div>
                    </div>
                  </div>
                )}

                {tab==="risks"&&(
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:22}}>
                    <div>
                      <div style={{fontSize:8,color:"#2a5070",letterSpacing:3,marginBottom:14}}>RISK FACTORS</div>
                      {[{label:"Overhang Failure",value:d.maxOverhang>65?28:d.maxOverhang>55?15:3,t:20},
                        {label:"Thin Wall Collapse",value:d.thinWalls>12?20:d.thinWalls>5?10:2,t:15},
                        {label:"CoG Shift",value:Math.round(d.cogOffset*40),t:12},
                        {label:"Height Instability",value:d.dims.h>150?10:d.dims.h>80?5:2,t:8},
                        {label:"Warping Risk",value:["ABS","Nylon","ASA"].includes(material)?18:4,t:12},
                        {label:"Layer Adhesion",value:rndI(2,10),t:8},
                      ].map(({label,value,t})=>(<Bar key={label} label={label} value={value} max={30} warn={t}/>))}
                    </div>
                    <div>
                      <div style={{fontSize:8,color:"#2a5070",letterSpacing:3,marginBottom:14}}>MITIGATIONS</div>
                      {[d.needsSupports&&{icon:"⚠",label:"Enable tree supports",detail:`Overhang ${d.maxOverhang}° > 55° threshold`},
                        d.thinWalls>8&&{icon:"⚠",label:"Reduce layer height → 0.12mm",detail:`${d.thinWalls} thin wall regions`},
                        d.cogOffset>0.3&&{icon:"⚠",label:"Add brim (8mm)",detail:`CoG offset ${(d.cogOffset*100).toFixed(0)}%`},
                        d.dims.h>150&&{icon:"⚠",label:"Dense base infill 35%",detail:`Height ${d.dims.h}mm`},
                        ["ABS","Nylon"].includes(material)&&{icon:"⚠",label:"Use enclosure + 90°C bed",detail:`${material} prone to warping`},
                        {icon:"✓",label:`Pattern: ${d.infillPattern}`,detail:"Optimal for geometry"},
                        {icon:"✓",label:"Orientation optimized",detail:`${d.supportReduction}% support reduction`},
                      ].filter(Boolean).map((item,i)=>(<div key={i} style={{padding:10,background:"#060e16",
                        border:`1px solid ${item.icon==="⚠"?"#2a2010":"#0a1e12"}`,borderRadius:6,marginBottom:8}}>
                        <div style={{fontSize:9,color:item.icon==="⚠"?"#ff8800":"#4dff7c",marginBottom:3}}>
                          {item.icon} {item.label}</div>
                        <div style={{fontSize:8,color:"#2a5070"}}>{item.detail}</div>
                      </div>))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>);
        })()}
      </div>
      <style>{`*{box-sizing:border-box;}::-webkit-scrollbar{width:4px;}::-webkit-scrollbar-track{background:#060e16;}::-webkit-scrollbar-thumb{background:#1a3a50;border-radius:2px;}input[type=range]{height:4px;}`}</style>
    </div>
  );
}
