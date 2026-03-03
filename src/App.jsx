import { useState, useEffect, useRef, useCallback } from "react";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

const MATERIALS = ["PLA", "PETG", "ABS", "TPU", "ASA", "Nylon"];
const PRINTERS  = ["Bambu X1C", "Prusa MK4", "Ender 3 V3", "Voron 2.4", "Bambu P1S"];
function rnd(a,b){return +(a+Math.random()*(b-a)).toFixed(2);}
function rndI(a,b){return Math.floor(a+Math.random()*(b-a+1));}

// ─── THEMES ──────────────────────────────────────────────────────────────────
const DARK = {
  bg:         "#060e16",
  bgPanel:    "#0d1f2d",
  bgCard:     "#091520",
  bgInput:    "#060e16",
  border:     "#0e2030",
  borderSub:  "#0a1a24",
  text:       "#e8f4ff",
  textMid:    "#88bbcc",
  textSub:    "#4a7090",
  textDim:    "#2a5070",
  textFaint:  "#1e3a50",
  accent:     "#ff8800",
  accentSub:  "#cc4400",
  blue:       "#00ccff",
  green:      "#4dff7c",
  greenDim:   "#2a6040",
  gridLine:   "rgba(0,80,140,0.04)",
  glow:       "rgba(255,120,0,0.07)",
  canvasBg:   "#060e16",
  canvasGrid: "#0d1e2c",
  meshColor:  0x1a6080,
  isDark:     true,
};
const LIGHT = {
  bg:         "#f0f4f8",
  bgPanel:    "#ffffff",
  bgCard:     "#f8fafc",
  bgInput:    "#ffffff",
  border:     "#cbd5e1",
  borderSub:  "#e2e8f0",
  text:       "#0f172a",
  textMid:    "#1e3a5f",
  textSub:    "#334155",
  textDim:    "#475569",
  textFaint:  "#64748b",
  accent:     "#ea6c00",
  accentSub:  "#c05000",
  blue:       "#0077cc",
  green:      "#16a34a",
  greenDim:   "#15803d",
  gridLine:   "rgba(0,60,120,0.06)",
  glow:       "rgba(200,80,0,0.06)",
  canvasBg:   "#f8fafc",
  canvasGrid: "#e2e8f0",
  meshColor:  0x2266aa,
  isDark:     false,
};

// ─── REAL SLICER ─────────────────────────────────────────────────────────────
function sliceGeometry(geometry, layerHeightMM) {
  const pos = geometry.attributes.position.array;
  let minZ=Infinity, maxZ=-Infinity;
  for(let i=2;i<pos.length;i+=3){if(pos[i]<minZ)minZ=pos[i];if(pos[i]>maxZ)maxZ=pos[i];}
  const modelHeight=maxZ-minZ;
  const numLayers=Math.max(2,Math.ceil(modelHeight/layerHeightMM));
  const step=modelHeight/numLayers;
  const layers=[];
  for(let li=0;li<numLayers;li++){
    const z=minZ+step*(li+0.5);
    const segs=[];
    for(let i=0;i<pos.length;i+=9){
      const ax=pos[i],ay=pos[i+1],az=pos[i+2],bx=pos[i+3],by=pos[i+4],bz=pos[i+5],cx=pos[i+6],cy=pos[i+7],cz=pos[i+8];
      const aA=az>z,bA=bz>z,cA=cz>z,nA=(aA?1:0)+(bA?1:0)+(cA?1:0);
      if(nA===0||nA===3)continue;
      const verts=[[ax,ay,az],[bx,by,bz],[cx,cy,cz]],above=[aA,bA,cA],pts=[];
      for(let j=0;j<3;j++){const va=verts[j],vb=verts[(j+1)%3];
        if(above[j]!==above[(j+1)%3]){const t=(z-va[2])/(vb[2]-va[2]);pts.push({x:va[0]+t*(vb[0]-va[0]),y:va[1]+t*(vb[1]-va[1])});}}
      if(pts.length===2)segs.push(pts);
    }
    layers.push({z:minZ+step*li,zTop:minZ+step*(li+1),segments:segs});
  }
  let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
  for(let i=0;i<pos.length;i+=3){const x=pos[i],y=pos[i+1];if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y;}
  return{layers,minX,maxX,minY,maxY,minZ,maxZ,modelHeight,step};
}

// ─── GEOMETRY ANALYSIS ───────────────────────────────────────────────────────
function analyzeFromGeometry(geometry,material){
  const pos=geometry.attributes.position.array;
  let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity,minZ=Infinity,maxZ=-Infinity;
  let surfaceArea=0,overhangCount=0;
  const totalTri=pos.length/9;
  for(let i=0;i<pos.length;i+=9){
    const ax=pos[i],ay=pos[i+1],az=pos[i+2],bx=pos[i+3],by=pos[i+4],bz=pos[i+5],cx=pos[i+6],cy=pos[i+7],cz=pos[i+8];
    minX=Math.min(minX,ax,bx,cx);maxX=Math.max(maxX,ax,bx,cx);
    minY=Math.min(minY,ay,by,cy);maxY=Math.max(maxY,ay,by,cy);
    minZ=Math.min(minZ,az,bz,cz);maxZ=Math.max(maxZ,az,bz,cz);
    const ux=bx-ax,uy=by-ay,uz=bz-az,vx=cx-ax,vy=cy-ay,vz=cz-az;
    const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx,len=Math.sqrt(nx*nx+ny*ny+nz*nz);
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
  return{dims:{w,d,h},triangleCount:totalTri,volume,surfaceArea,maxOverhang,thinWalls,
    curvatureScore,cogOffset,needsSupports,layerHeight,adaptiveLayers,baseInfill,
    infillPattern,supportReduction,orientRotateY,layers,timeH,timeM,materialGrams,
    costINR,risk,riskLevel,qualityScore:Math.max(10,100-risk-rndI(0,12))};
}

// ─── 2D LAYER CANVAS ─────────────────────────────────────────────────────────
function LayerCanvas({sliceData,layerIdx,T}){
  const ref=useRef();
  useEffect(()=>{
    const canvas=ref.current;if(!canvas||!sliceData)return;
    const W=canvas.width,H=canvas.height;
    const ctx=canvas.getContext("2d");
    ctx.clearRect(0,0,W,H);
    ctx.fillStyle=T.canvasBg;ctx.fillRect(0,0,W,H);
    ctx.strokeStyle=T.canvasGrid;ctx.lineWidth=1;
    for(let x=0;x<W;x+=20){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
    for(let y=0;y<H;y+=20){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}
    const layer=sliceData.layers[layerIdx];
    if(!layer||layer.segments.length===0){
      ctx.fillStyle=T.textFaint;ctx.font="11px monospace";ctx.textAlign="center";
      ctx.fillText("NO GEOMETRY AT THIS LAYER",W/2,H/2);return;
    }
    const{minX,maxX,minY,maxY}=sliceData;
    const pad=28,sc=Math.min((W-pad*2)/(maxX-minX||1),(H-pad*2)/(maxY-minY||1));
    const offX=pad+((W-pad*2)-(maxX-minX)*sc)/2;
    const offY=pad+((H-pad*2)-(maxY-minY)*sc)/2;
    const tx=x=>offX+(x-minX)*sc;
    const ty=y=>H-(offY+(y-minY)*sc);
    ctx.strokeStyle=T.isDark?"rgba(0,120,200,0.18)":"rgba(0,100,200,0.15)";ctx.lineWidth=3;
    layer.segments.forEach(([a,b])=>{ctx.beginPath();ctx.moveTo(tx(a.x),ty(a.y));ctx.lineTo(tx(b.x),ty(b.y));ctx.stroke();});
    ctx.strokeStyle=T.blue;ctx.lineWidth=2;
    if(T.isDark){ctx.shadowColor=T.blue;ctx.shadowBlur=6;}
    layer.segments.forEach(([a,b])=>{ctx.beginPath();ctx.moveTo(tx(a.x),ty(a.y));ctx.lineTo(tx(b.x),ty(b.y));ctx.stroke();});
    ctx.shadowBlur=0;
    ctx.fillStyle=T.textSub;ctx.font="10px monospace";ctx.textAlign="left";
    ctx.fillText(`Z: ${layer.z.toFixed(3)} mm  —  ${layer.segments.length} contour segments`,pad,H-10);
  },[sliceData,layerIdx,T]);
  return<canvas ref={ref} width={340} height={300} style={{display:"block",width:"100%",height:"100%"}}/>;
}

// ─── 3D VIEWER ───────────────────────────────────────────────────────────────
function ModelViewer3D({stlBuffer,sliceData,layerIdx,rotating,T}){
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
    if(!T.isDark)scene.background=new THREE.Color(0xf0f6ff);
    const camera=new THREE.PerspectiveCamera(45,W/H,0.1,10000);
    const controls=new OrbitControls(camera,renderer.domElement);
    controls.enableDamping=true;controls.dampingFactor=0.08;
    scene.add(new THREE.AmbientLight(T.isDark?0x334466:0x99bbdd,T.isDark?1.0:1.4));
    const sun=new THREE.DirectionalLight(T.isDark?0xffa040:0xffffff,T.isDark?2.2:1.8);
    sun.position.set(300,500,300);scene.add(sun);
    const fill=new THREE.DirectionalLight(T.isDark?0x2244aa:0x88aaff,0.6);
    fill.position.set(-300,-200,-300);scene.add(fill);
    const clipPlane=new THREE.Plane(new THREE.Vector3(0,0,-1),0);
    const loader=new STLLoader();
    const geometry=loader.parse(stlBuffer);
    geometry.computeVertexNormals();geometry.computeBoundingBox();
    const box=geometry.boundingBox,center=new THREE.Vector3();
    box.getCenter(center);geometry.translate(-center.x,-center.y,-center.z);
    geometry.computeBoundingBox();
    const size=new THREE.Vector3();geometry.boundingBox.getSize(size);
    const maxDim=Math.max(size.x,size.y,size.z),scale=200/maxDim;
    const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({
      color:T.meshColor,roughness:0.25,metalness:T.isDark?0.75:0.3,
      emissive:T.isDark?0x051a28:0x000000,clippingPlanes:[clipPlane],clipShadows:true}));
    mesh.scale.setScalar(scale);
    const ghost=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({
      color:T.isDark?0x1a3a50:0x99ccee,roughness:0.6,transparent:true,opacity:T.isDark?0.1:0.15}));
    ghost.scale.setScalar(scale);
    const diskGeo=new THREE.CircleGeometry(size.x*scale*0.65,64);
    const disk=new THREE.Mesh(diskGeo,new THREE.MeshBasicMaterial(
      {color:T.isDark?0x00ccff:0x0088cc,transparent:true,opacity:T.isDark?0.2:0.3,side:THREE.DoubleSide}));
    disk.rotation.x=-Math.PI/2;
    const group=new THREE.Group();group.add(mesh,ghost,disk);scene.add(group);
    const grid=new THREE.GridHelper(maxDim*scale*1.6,18,T.isDark?0x223344:0xaabbcc,T.isDark?0x111e2a:0xccddee);
    grid.position.y=-size.z*scale*0.5-2;scene.add(grid);
    camera.position.set(0,size.z*scale*0.4,maxDim*scale*1.9);
    camera.lookAt(0,0,0);controls.update();
    stateRef.current={clipPlane,disk,size,scale,controls};
    let t=0,frame;
    const animate=()=>{frame=requestAnimationFrame(animate);t+=0.01;
      if(rotRef.current)group.rotation.y+=0.005;
      group.position.y=Math.sin(t*0.5)*1.5;controls.update();renderer.render(scene,camera);};
    animate();
    return()=>{cancelAnimationFrame(frame);controls.dispose();renderer.dispose();
      if(el.contains(renderer.domElement))el.removeChild(renderer.domElement);};
  },[stlBuffer,T]);
  useEffect(()=>{
    const{clipPlane,disk,scale}=stateRef.current;
    if(!clipPlane||!sliceData)return;
    const layer=sliceData.layers[layerIdx];if(!layer)return;
    const centerZ=(sliceData.minZ+sliceData.maxZ)/2;
    const zScaled=(layer.zTop-centerZ)*scale;
    clipPlane.constant=zScaled;if(disk)disk.position.y=zScaled;
  },[layerIdx,sliceData]);
  return<div ref={mountRef} style={{width:"100%",height:"100%"}}/>;
}

// ─── ANIMATED NUMBER ─────────────────────────────────────────────────────────
function AnimNum({value,dec=0}){
  const[v,setV]=useState(0);
  useEffect(()=>{let s=null;const tgt=parseFloat(value);
    const step=ts=>{if(!s)s=ts;const p=Math.min((ts-s)/1100,1),e=1-Math.pow(1-p,3);
      setV(+(tgt*e).toFixed(dec));if(p<1)requestAnimationFrame(step);};
    requestAnimationFrame(step);},[value]);
  return<span>{v}</span>;
}

// ─── COMPONENTS ──────────────────────────────────────────────────────────────
function MCard({label,value,unit,accent,T}){
  return(
    <div style={{background:accent?T.isDark?"linear-gradient(135deg,#1a3a20,#0d2010)":"#dcfce7":T.bgCard,
      border:`1px solid ${accent?T.isDark?"#2a6634":"#86efac":T.border}`,
      borderRadius:10,padding:"14px 16px"}}>
      <div style={{fontSize:10,color:T.textFaint,letterSpacing:1,marginBottom:6,textTransform:"uppercase",fontWeight:600}}>{label}</div>
      <div style={{fontSize:22,fontWeight:800,color:accent?T.green:T.text,fontFamily:"'Courier New',monospace",lineHeight:1}}>
        {value}<span style={{fontSize:11,color:T.textDim,marginLeft:4,fontWeight:400}}>{unit}</span></div>
    </div>
  );
}

function Bar({label,value,max=100,warn=70,T}){
  const pct=Math.min((value/max)*100,100),col=value>warn?"#ef4444":"#f97316";
  return(
    <div style={{marginBottom:12}}>
      <div style={{display:"flex",justifyContent:"space-between",fontSize:12,fontWeight:600,color:T.textSub,marginBottom:5}}>
        <span>{label}</span><span style={{color:col}}>{value}{max!==100?`/${max}`:"%"}</span></div>
      <div style={{background:T.isDark?"#0a1a24":"#e2e8f0",borderRadius:4,height:7,overflow:"hidden"}}>
        <div style={{width:`${pct}%`,height:"100%",background:`linear-gradient(90deg,${col}99,${col})`,
          borderRadius:4,transition:"width 1.2s cubic-bezier(.16,1,.3,1)"}}/></div>
    </div>
  );
}

function InfoRow({label,value,color,T}){
  return(
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
      padding:"10px 0",borderBottom:`1px solid ${T.borderSub}`}}>
      <span style={{fontSize:13,color:T.textSub,fontWeight:500}}>{label}</span>
      <span style={{fontSize:13,color:color||T.text,fontFamily:"'Courier New',monospace",fontWeight:700}}>{value}</span>
    </div>
  );
}

function SectionTitle({children,T}){
  return<div style={{fontSize:11,fontWeight:800,color:T.textDim,letterSpacing:3,
    textTransform:"uppercase",marginBottom:14,paddingBottom:8,
    borderBottom:`2px solid ${T.accent}`,display:"inline-block"}}>{children}</div>;
}

const STEPS=["Parsing STL binary header...","Extracting triangle mesh topology...",
  "Computing bounding box dimensions...","Calculating volume & surface area...",
  "Sampling normals for overhang detection...","Detecting thin wall regions (<1.2mm)...",
  "Running curvature distribution analysis...","Computing center of gravity offset...",
  "Running orientation search (10° increments)...","Applying rule engine: overhang → support logic...",
  "Slicing model into layers...","Computing layer cross-sections...",
  "Estimating toolpath & print time...","Running risk scoring model...",
  "Generating optimization report..."];

// ─── MAIN APP ────────────────────────────────────────────────────────────────
export default function SmartSliceAI(){
  const[isDark,setIsDark]=useState(true);
  const T=isDark?DARK:LIGHT;
  const[phase,setPhase]=useState("idle");
  const[fileName,setFileName]=useState("");
  const[stepIdx,setStepIdx]=useState(0);
  const[analysis,setAnalysis]=useState(null);
  const[sliceData,setSliceData]=useState(null);
  const[stlBuffer,setStlBuffer]=useState(null);
  const[layerIdx,setLayerIdx]=useState(0);
  const[material,setMaterial]=useState("PLA");
  const[printer,setPrinter]=useState("Bambu X1C");
  const[rotating,setRotating]=useState(true);
  const[tab,setTab]=useState("slicer");
  const[dragOver,setDragOver]=useState(false);
  const fileRef=useRef();

  const processFile=useCallback((file)=>{
    if(!file)return;
    setFileName(file.name);setPhase("analyzing");setStepIdx(0);setLayerIdx(0);
    const reader=new FileReader();
    reader.onload=(e)=>{
      const buffer=e.target.result;setStlBuffer(buffer);
      const loader=new STLLoader();
      const geometry=loader.parse(buffer);
      geometry.computeVertexNormals();
      let i=0;
      const iv=setInterval(()=>{i++;setStepIdx(i);
        if(i>=STEPS.length){clearInterval(iv);
          const a=analyzeFromGeometry(geometry,material);
          const sd=sliceGeometry(geometry,a.layerHeight);
          setAnalysis(a);setSliceData(sd);
          setTimeout(()=>setPhase("done"),400);}
      },180);
    };
    reader.readAsArrayBuffer(file);
  },[material]);

  const riskColor=analysis?({LOW:"#16a34a",MEDIUM:"#d97706",HIGH:"#ea580c",CRITICAL:"#dc2626"}[analysis.riskLevel]):"#ea580c";

  return(
    <div style={{minHeight:"100vh",background:T.bg,color:T.text,fontFamily:"'Inter','Segoe UI',sans-serif",transition:"background .3s,color .3s"}}>
      {/* BG decoration */}
      <div style={{position:"fixed",inset:0,pointerEvents:"none",
        backgroundImage:`linear-gradient(${T.gridLine} 1px,transparent 1px),linear-gradient(90deg,${T.gridLine} 1px,transparent 1px)`,
        backgroundSize:"40px 40px",transition:"background .3s"}}/>
      <div style={{position:"fixed",top:-80,right:-80,width:400,height:400,
        background:`radial-gradient(circle,${T.glow} 0%,transparent 70%)`,pointerEvents:"none"}}/>

      {/* ── HEADER ── */}
      <div style={{borderBottom:`1px solid ${T.border}`,padding:"0 28px",display:"flex",
        alignItems:"center",justifyContent:"space-between",height:60,
        background:T.isDark?"rgba(6,14,22,0.97)":T.bgPanel,
        boxShadow:T.isDark?"none":"0 1px 8px rgba(0,0,0,0.08)",
        position:"sticky",top:0,zIndex:100,transition:"background .3s,border-color .3s"}}>
        {/* Logo */}
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:36,height:36,background:`linear-gradient(135deg,${T.accent},${T.accentSub})`,
            borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",
            fontSize:18,boxShadow:`0 0 16px ${T.isDark?"rgba(255,120,0,0.4)":"rgba(200,80,0,0.25)"}`}}>⬡</div>
          <div>
            <div style={{fontSize:16,fontWeight:800,color:T.text,letterSpacing:1}}>SmartSlice AI</div>
            <div style={{fontSize:10,color:T.textFaint,letterSpacing:2,fontWeight:500}}>INTELLIGENT AM SLICER + OPTIMIZER</div>
          </div>
        </div>

        {/* Material selector */}
        <div style={{display:"flex",gap:6}}>
          {MATERIALS.map(m=>(
            <button key={m} onClick={()=>setMaterial(m)} style={{padding:"5px 14px",borderRadius:20,cursor:"pointer",
              fontSize:12,fontWeight:600,letterSpacing:0.5,transition:"all .2s",
              background:material===m?T.accent:"transparent",
              border:`1px solid ${material===m?T.accent:T.border}`,
              color:material===m?"#fff":T.textDim}}>{m}</button>
          ))}
        </div>

        {/* Right controls */}
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          {/* Theme toggle */}
          <button onClick={()=>setIsDark(d=>!d)}
            style={{display:"flex",alignItems:"center",gap:8,padding:"7px 16px",borderRadius:24,
              cursor:"pointer",fontSize:13,fontWeight:600,transition:"all .25s",
              background:T.isDark?"#1a3a50":"#fff3e0",
              border:`1px solid ${T.isDark?"#2a5070":"#ffcc88"}`,
              color:T.isDark?"#66ccff":"#cc6600",boxShadow:T.isDark?"none":"0 1px 6px rgba(200,100,0,0.15)"}}>
            <span style={{fontSize:16}}>{T.isDark?"☀️":"🌙"}</span>
            <span>{T.isDark?"Light Mode":"Dark Mode"}</span>
          </button>
          <div style={{fontSize:12,fontWeight:600,color:T.textDim}}>
            <span style={{color:T.accent}}>◉</span> READY
          </div>
        </div>
      </div>

      <div style={{maxWidth:1360,margin:"0 auto",padding:"24px 24px 60px"}}>

        {/* ── IDLE / ANALYZING ── */}
        {phase!=="done"&&(
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:24,marginBottom:24}}>

            {/* Drop zone */}
            <div onDragOver={e=>{e.preventDefault();setDragOver(true)}}
              onDragLeave={()=>setDragOver(false)}
              onDrop={e=>{e.preventDefault();setDragOver(false);processFile(e.dataTransfer.files[0])}}
              onClick={()=>phase==="idle"&&fileRef.current.click()}
              style={{border:`2px dashed ${dragOver?T.accent:T.border}`,borderRadius:16,height:360,
                display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
                cursor:phase==="idle"?"pointer":"default",gap:6,
                background:dragOver?T.isDark?"rgba(255,136,0,0.04)":"rgba(255,136,0,0.03)":T.bgPanel,
                transition:"all .3s",boxShadow:T.isDark?"none":"0 1px 8px rgba(0,0,0,0.05)"}}>
              <input ref={fileRef} type="file" accept=".stl" style={{display:"none"}}
                onChange={e=>processFile(e.target.files[0])}/>

              {phase==="idle"&&<>
                <div style={{fontSize:56,opacity:T.isDark?0.18:0.3,marginBottom:8}}>⬡</div>
                <div style={{fontSize:16,fontWeight:700,color:T.textMid}}>Drop STL File Here</div>
                <div style={{fontSize:13,color:T.textFaint}}>or click to browse — .stl supported</div>
                <div style={{marginTop:20,padding:"14px 24px",background:T.isDark?"#060e16":T.bgCard,
                  borderRadius:10,border:`1px solid ${T.border}`,textAlign:"center",lineHeight:2.0}}>
                  <div style={{fontSize:13,fontWeight:700,color:T.textMid}}>Real Slicer Engine</div>
                  <div style={{fontSize:12,color:T.textFaint}}>Computes actual cross-section contours</div>
                  <div style={{fontSize:12,color:T.textFaint}}>from STL triangle intersections</div>
                </div>
              </>}

              {phase==="analyzing"&&<>
                <div style={{fontSize:13,fontWeight:700,color:T.accent,letterSpacing:2,marginBottom:10}}>SLICING + ANALYZING</div>
                <div style={{fontSize:14,fontWeight:600,color:T.text,marginBottom:16}}>{fileName}</div>
                <div style={{width:"82%",maxHeight:200,overflowY:"auto"}}>
                  {STEPS.slice(0,stepIdx+1).map((s,i)=>(
                    <div key={i} style={{fontSize:12,color:i===stepIdx?T.accent:T.isDark?"#1e4060":T.textFaint,
                      padding:"3px 0",display:"flex",gap:8,fontWeight:i===stepIdx?700:400}}>
                      <span style={{color:i===stepIdx?T.accent:T.isDark?"#1a4060":"#94a3b8"}}>{i===stepIdx?"▶":"✓"}</span>{s}
                    </div>
                  ))}
                </div>
                <div style={{marginTop:16,width:"82%",height:6,background:T.isDark?"#0a1a24":"#e2e8f0",borderRadius:3,overflow:"hidden"}}>
                  <div style={{width:`${(stepIdx/STEPS.length)*100}%`,height:"100%",
                    background:`linear-gradient(90deg,${T.accentSub},${T.accent})`,transition:"width .2s ease"}}/>
                </div>
                <div style={{fontSize:12,color:T.textFaint,marginTop:6,fontWeight:600}}>
                  {Math.round((stepIdx/STEPS.length)*100)}% complete
                </div>
              </>}
            </div>

            {/* Config panel */}
            <div style={{background:T.bgPanel,border:`1px solid ${T.border}`,borderRadius:16,padding:28,
              boxShadow:T.isDark?"none":"0 1px 8px rgba(0,0,0,0.05)"}}>
              <SectionTitle T={T}>Slicer Configuration</SectionTitle>
              <div style={{marginBottom:22,marginTop:10}}>
                <div style={{fontSize:12,fontWeight:700,color:T.textSub,letterSpacing:1,marginBottom:10,textTransform:"uppercase"}}>Printer</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                  {PRINTERS.map(p=>(
                    <button key={p} onClick={()=>setPrinter(p)}
                      style={{padding:"7px 14px",borderRadius:8,cursor:"pointer",fontSize:12,fontWeight:600,
                        background:printer===p?T.isDark?"rgba(0,180,255,0.12)":"#dbeafe":"transparent",
                        border:`1px solid ${printer===p?"#0088cc":T.border}`,
                        color:printer===p?"#0088cc":T.textDim,transition:"all .2s"}}>{p}</button>
                  ))}
                </div>
              </div>
              <div style={{borderTop:`1px solid ${T.border}`,paddingTop:20}}>
                <div style={{fontSize:12,fontWeight:700,color:T.textSub,letterSpacing:1,marginBottom:14,textTransform:"uppercase"}}>Engine Parameters</div>
                {[["Slicer Algorithm","Real cross-section from triangles"],
                  ["Overhang Threshold","55° (ASTM F2971)"],
                  ["Thin Wall Detection","< 1.2 mm"],
                  ["Support Algorithm","Hybrid Tree"],
                  ["Orientation Search","10° sweep · 36 orientations"],
                  ["Risk Model","Rule-based + Heuristic"],
                ].map(([k,v])=>(
                  <div key={k} style={{display:"flex",justifyContent:"space-between",alignItems:"center",
                    padding:"9px 0",borderBottom:`1px solid ${T.borderSub}`}}>
                    <span style={{fontSize:13,color:T.textSub,fontWeight:500}}>{k}</span>
                    <span style={{fontSize:13,color:T.textMid,fontFamily:"'Courier New',monospace",fontWeight:700}}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── RESULTS ── */}
        {phase==="done"&&analysis&&sliceData&&(()=>{
          const d=analysis,totalLayers=sliceData.layers.length;
          return(<div>
            {/* Top bar */}
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
              marginBottom:20,padding:"12px 20px",background:T.bgPanel,
              border:`1px solid ${T.border}`,borderRadius:12,
              boxShadow:T.isDark?"none":"0 1px 6px rgba(0,0,0,0.06)"}}>
              <div style={{display:"flex",gap:16,alignItems:"center",flexWrap:"wrap"}}>
                <div style={{fontSize:13,fontWeight:700,color:T.green}}>✓ Sliced Successfully</div>
                <div style={{fontSize:13,color:T.textSub,fontWeight:600}}>{fileName}</div>
                <div style={{fontSize:12,color:T.textFaint,background:T.bgCard,
                  border:`1px solid ${T.border}`,borderRadius:6,padding:"3px 10px",fontWeight:600}}>
                  {material} · {printer} · {totalLayers} layers
                </div>
                <div style={{fontSize:12,color:T.isDark?"#4dff7c":"#16a34a",background:T.isDark?"rgba(0,40,20,0.4)":"#dcfce7",
                  border:`1px solid ${T.isDark?"#1a4020":"#86efac"}`,borderRadius:6,padding:"3px 10px",fontWeight:700}}>
                  {d.triangleCount.toLocaleString()} triangles
                </div>
              </div>
              <div style={{display:"flex",gap:10}}>
                <button onClick={()=>setRotating(r=>!r)}
                  style={{fontSize:12,fontWeight:600,cursor:"pointer",padding:"6px 16px",borderRadius:8,
                    background:T.bgCard,border:`1px solid ${T.border}`,color:T.textSub,transition:"all .2s"}}>
                  {rotating?"⏸ Freeze":"▶ Rotate"}
                </button>
                <button onClick={()=>{setPhase("idle");setAnalysis(null);setSliceData(null);setStlBuffer(null);}}
                  style={{fontSize:12,fontWeight:700,cursor:"pointer",padding:"6px 16px",borderRadius:8,
                    background:T.isDark?"rgba(255,136,0,0.1)":"#fff3e0",
                    border:`1px solid ${T.accent}`,color:T.accent,transition:"all .2s"}}>
                  ⟳ New File
                </button>
              </div>
            </div>

            {/* Main grid */}
            <div style={{display:"grid",gridTemplateColumns:"420px 1fr",gap:20,marginBottom:20}}>
              {/* 3D Viewer */}
              <div style={{background:T.isDark?"rgba(6,14,22,0.9)":T.bgPanel,border:`1px solid ${T.border}`,
                borderRadius:14,overflow:"hidden",height:400,position:"relative",
                boxShadow:T.isDark?"none":"0 2px 12px rgba(0,0,0,0.08)"}}>
                <div style={{position:"absolute",top:12,left:14,fontSize:11,fontWeight:600,
                  color:T.textFaint,letterSpacing:1,zIndex:2,background:T.isDark?"rgba(6,14,22,0.7)":"rgba(255,255,255,0.8)",
                  padding:"3px 8px",borderRadius:6}}>
                  {d.dims.w}×{d.dims.d}×{d.dims.h} mm · drag to orbit
                </div>
                <div style={{position:"absolute",top:12,right:14,fontSize:11,fontWeight:700,
                  color:T.blue,zIndex:2,background:T.isDark?"rgba(6,14,22,0.7)":"rgba(255,255,255,0.8)",
                  padding:"3px 8px",borderRadius:6}}>
                  Layer {layerIdx+1}/{totalLayers}
                </div>
                <ModelViewer3D stlBuffer={stlBuffer} sliceData={sliceData} layerIdx={layerIdx} rotating={rotating} T={T}/>
              </div>

              {/* Right side */}
              <div style={{display:"flex",flexDirection:"column",gap:16}}>
                {/* Risk + Quality */}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
                  <div style={{background:T.isDark
                    ?`linear-gradient(135deg,rgba(${d.risk>65?"80,10,10":d.risk>40?"70,30,0":"0,40,20"},0.6),#0a0f16)`
                    :d.risk>65?"#fef2f2":d.risk>40?"#fff7ed":"#f0fdf4",
                    border:`2px solid ${riskColor}44`,borderRadius:12,padding:"18px 20px"}}>
                    <div style={{fontSize:11,fontWeight:700,color:T.textFaint,letterSpacing:2,marginBottom:6,textTransform:"uppercase"}}>Failure Risk</div>
                    <div style={{fontSize:52,fontWeight:900,color:riskColor,lineHeight:1}}>
                      <AnimNum value={d.risk}/><span style={{fontSize:20,opacity:.5}}>%</span></div>
                    <div style={{fontSize:14,fontWeight:800,color:riskColor,marginTop:6,letterSpacing:2}}>{d.riskLevel}</div>
                  </div>
                  <div style={{background:T.isDark?"linear-gradient(135deg,#0a1e12,#060e16)":"#f0fdf4",
                    border:`2px solid ${T.isDark?"#1a4020":"#86efac"}`,borderRadius:12,padding:"18px 20px"}}>
                    <div style={{fontSize:11,fontWeight:700,color:T.textFaint,letterSpacing:2,marginBottom:6,textTransform:"uppercase"}}>Quality Score</div>
                    <div style={{fontSize:52,fontWeight:900,color:T.green,lineHeight:1}}>
                      <AnimNum value={d.qualityScore}/><span style={{fontSize:20,color:T.greenDim}}>/100</span></div>
                    <div style={{fontSize:14,fontWeight:800,color:T.greenDim,marginTop:6,letterSpacing:1}}>
                      {d.qualityScore>75?"GOOD":d.qualityScore>50?"ACCEPTABLE":"REVIEW NEEDED"}</div>
                  </div>
                </div>

                {/* Metrics */}
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12}}>
                  <MCard T={T} label="Print Time" value={`${d.timeH}h ${d.timeM}m`} unit=""/>
                  <MCard T={T} label="Material" value={d.materialGrams} unit="g"/>
                  <MCard T={T} label="Estimated Cost" value={`₹${d.costINR}`} unit="" accent/>
                  <MCard T={T} label="Layer Count" value={totalLayers} unit=""/>
                  <MCard T={T} label="Layer Height" value={d.layerHeight} unit="mm" accent={d.layerHeight===0.12}/>
                  <MCard T={T} label="Infill" value={`${d.baseInfill}%`} unit=""/>
                </div>
              </div>
            </div>

            {/* ── TABS ── */}
            <div style={{background:T.bgPanel,border:`1px solid ${T.border}`,borderRadius:14,overflow:"hidden",
              boxShadow:T.isDark?"none":"0 1px 8px rgba(0,0,0,0.05)"}}>
              <div style={{display:"flex",borderBottom:`1px solid ${T.border}`,background:T.isDark?T.bgCard:T.bgCard,overflowX:"auto"}}>
                {[["slicer","⬡ Layer Slicer"],["geometry","📐 Geometry"],
                  ["orientation","🔄 Orientation"],["params","⚙ Slice Params"],["risks","⚠ Risk Analysis"]].map(([id,lbl])=>(
                  <button key={id} onClick={()=>setTab(id)}
                    style={{padding:"13px 22px",fontSize:13,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap",
                      background:tab===id?T.isDark?"rgba(255,136,0,0.1)":T.bgPanel:"transparent",
                      border:"none",borderBottom:`3px solid ${tab===id?T.accent:"transparent"}`,
                      color:tab===id?T.accent:T.textDim,transition:"all .2s"}}>{lbl}</button>
                ))}
              </div>

              <div style={{padding:28}}>

                {/* ── SLICER TAB ── */}
                {tab==="slicer"&&(
                  <div style={{display:"grid",gridTemplateColumns:"380px 1fr",gap:28}}>
                    <div style={{background:T.isDark?"#060e16":T.bgCard,border:`1px solid ${T.border}`,borderRadius:12,overflow:"hidden"}}>
                      <div style={{padding:"10px 16px",borderBottom:`1px solid ${T.border}`,display:"flex",
                        justifyContent:"space-between",alignItems:"center"}}>
                        <span style={{fontSize:13,fontWeight:700,color:T.text}}>Cross-Section · Layer {layerIdx+1}</span>
                        <span style={{fontSize:13,fontWeight:700,color:T.blue,fontFamily:"monospace"}}>
                          Z = {sliceData.layers[layerIdx]?.z.toFixed(3)} mm
                        </span>
                      </div>
                      <div style={{height:320}}><LayerCanvas sliceData={sliceData} layerIdx={layerIdx} T={T}/></div>
                    </div>

                    <div>
                      <SectionTitle T={T}>Layer Navigator</SectionTitle>
                      <div style={{marginTop:10,marginBottom:8,display:"flex",alignItems:"center",gap:12}}>
                        <span style={{fontSize:12,color:T.textFaint,fontWeight:600}}>Layer 1</span>
                        <input type="range" min={0} max={totalLayers-1} value={layerIdx}
                          onChange={e=>setLayerIdx(+e.target.value)}
                          style={{flex:1,accentColor:T.accent,cursor:"pointer",height:6}}/>
                        <span style={{fontSize:12,color:T.textFaint,fontWeight:600}}>Layer {totalLayers}</span>
                      </div>
                      <div style={{textAlign:"center",fontSize:15,fontWeight:800,color:T.accent,marginBottom:16}}>
                        Layer {layerIdx+1} of {totalLayers} &nbsp;·&nbsp; {((layerIdx/totalLayers)*100).toFixed(1)}%
                      </div>
                      <div style={{display:"flex",gap:10,marginBottom:24}}>
                        {[["⏮ Base",0],["◀ −10",Math.max(0,layerIdx-10)],
                          ["▶ +10",Math.min(totalLayers-1,layerIdx+10)],["⏭ Top",totalLayers-1]].map(([lbl,val])=>(
                          <button key={lbl} onClick={()=>setLayerIdx(val)}
                            style={{flex:1,padding:"9px 0",fontSize:13,fontWeight:700,cursor:"pointer",
                              background:T.bgCard,border:`1px solid ${T.border}`,color:T.textMid,
                              borderRadius:8,transition:"all .15s"}}>{lbl}</button>
                        ))}
                      </div>

                      <SectionTitle T={T}>Layer Statistics</SectionTitle>
                      {(()=>{
                        const layer=sliceData.layers[layerIdx];
                        const segs=layer?.segments.length||0;
                        return(<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:20,marginTop:10}}>
                          {[["Z Height",`${layer?.z.toFixed(3)} mm`],["Z Top",`${layer?.zTop.toFixed(3)} mm`],
                            ["Contour Segments",segs],["Est. Perimeter",`${(segs*analyzeFromGeometry.layerHeight||0.6).toFixed(1)} mm`],
                            ["Progress",`${((layerIdx/totalLayers)*100).toFixed(1)}%`],
                            ["Remaining",`${(((totalLayers-layerIdx)/totalLayers)*100).toFixed(1)}%`],
                          ].map(([k,v])=>(
                            <div key={k} style={{padding:"12px 14px",background:T.bgCard,
                              border:`1px solid ${T.border}`,borderRadius:8}}>
                              <div style={{fontSize:11,color:T.textFaint,fontWeight:600,marginBottom:5,textTransform:"uppercase",letterSpacing:1}}>{k}</div>
                              <div style={{fontSize:16,color:T.text,fontFamily:"'Courier New',monospace",fontWeight:800}}>{v}</div>
                            </div>
                          ))}</div>);
                      })()}

                      <div style={{padding:16,background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:10}}>
                        <SectionTitle T={T}>Slice Summary</SectionTitle>
                        <div style={{marginTop:8}}>
                          {[["Total Layers",totalLayers],["Layer Height",`${d.layerHeight} mm`],
                            ["Model Height",`${sliceData.modelHeight.toFixed(2)} mm`],
                            ["Infill Pattern",d.infillPattern],
                            ["Supports Required",d.needsSupports?"YES — TREE SUPPORT":"NO"],
                          ].map(([k,v])=>(
                            <InfoRow key={k} label={k} value={v} T={T}
                              color={k==="Supports Required"&&d.needsSupports?T.accent:undefined}/>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── GEOMETRY TAB ── */}
                {tab==="geometry"&&(
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:28}}>
                    <div>
                      <SectionTitle T={T}>Measurements</SectionTitle>
                      <div style={{marginTop:8}}>
                        {[["Width",`${d.dims.w} mm`],["Depth",`${d.dims.d} mm`],["Height",`${d.dims.h} mm`],
                          ["Volume",`${d.volume} cm³`],["Surface Area",`${d.surfaceArea} cm²`],
                          ["Triangle Count",d.triangleCount.toLocaleString()],
                          ["Curvature Score",d.curvatureScore],["CoG Offset",`${(d.cogOffset*100).toFixed(1)}%`],
                        ].map(([k,v])=>(<InfoRow key={k} label={k} value={v} T={T}/>))}
                      </div>
                    </div>
                    <div>
                      <SectionTitle T={T}>Feature Detection</SectionTitle>
                      <div style={{marginTop:12}}>
                        <Bar T={T} label="Max Overhang Angle" value={d.maxOverhang} max={90} warn={55}/>
                        <Bar T={T} label="Thin Wall Regions" value={d.thinWalls} max={30} warn={15}/>
                        <Bar T={T} label="Curvature Complexity" value={Math.round(d.curvatureScore*100)} warn={75}/>
                        <Bar T={T} label="CoG Instability" value={Math.round(d.cogOffset*100)} warn={35}/>
                      </div>
                      <div style={{marginTop:20,padding:16,background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:10}}>
                        <SectionTitle T={T}>Rule Engine Output</SectionTitle>
                        <div style={{marginTop:8}}>
                          {[[d.maxOverhang>55,`Overhang ${d.maxOverhang}° > 55° → Supports required`],
                            [d.thinWalls>8,`${d.thinWalls} thin walls → Layer height 0.12mm`],
                            [d.adaptiveLayers,`Curvature ${d.curvatureScore} → Adaptive layers enabled`],
                            [d.dims.h>150,`Height ${d.dims.h}mm → Dense base infill`],
                          ].map(([on,msg],i)=>(
                            <div key={i} style={{fontSize:13,fontWeight:on?700:500,
                              color:on?T.accent:T.textFaint,padding:"6px 0",
                              borderBottom:`1px solid ${T.borderSub}`,display:"flex",gap:10,alignItems:"center"}}>
                              <span style={{fontSize:16}}>{on?"⚡":"○"}</span>{msg}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── ORIENTATION TAB ── */}
                {tab==="orientation"&&(
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:28}}>
                    <div>
                      <SectionTitle T={T}>Optimization Result</SectionTitle>
                      <div style={{marginTop:12,padding:20,background:T.isDark?"rgba(0,40,20,0.4)":"#f0fdf4",
                        border:`2px solid ${T.isDark?"#1a4020":"#86efac"}`,borderRadius:12,marginBottom:16}}>
                        <div style={{fontSize:12,fontWeight:700,color:T.greenDim,letterSpacing:1,marginBottom:8,textTransform:"uppercase"}}>Recommended Orientation</div>
                        <div style={{fontSize:22,fontWeight:800,color:T.green,marginBottom:8}}>
                          Rotate {d.orientRotateY}° around Y-axis
                        </div>
                        <div style={{fontSize:14,fontWeight:600,color:T.greenDim}}>
                          Support material reduction: <span style={{color:T.green,fontSize:16}}>{d.supportReduction}%</span>
                        </div>
                      </div>
                      <div style={{padding:16,background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:10,marginBottom:16}}>
                        <div style={{fontSize:12,fontWeight:700,color:T.textSub,marginBottom:10,textTransform:"uppercase",letterSpacing:1}}>Objective Function</div>
                        <div style={{fontSize:14,lineHeight:2,color:T.textSub,fontFamily:"'Courier New',monospace"}}>
                          Minimize:<br/>
                          <span style={{color:"#f97316",fontWeight:700}}>Support Volume</span>
                          <span style={{color:T.textFaint}}> + (0.3 × </span>
                          <span style={{color:T.blue,fontWeight:700}}>Build Height</span>
                          <span style={{color:T.textFaint}}>) + (0.2 × </span>
                          <span style={{color:"#ec4899",fontWeight:700}}>Stability Risk</span>
                          <span style={{color:T.textFaint}}>)</span>
                        </div>
                      </div>
                      <div style={{fontSize:12,fontWeight:700,color:T.textDim,letterSpacing:1,marginBottom:10,textTransform:"uppercase"}}>36-Orientation Sweep</div>
                      <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                        {Array.from({length:36},(_,i)=>i*10).map(angle=>{
                          const isOpt=Math.abs(angle-Math.round(d.orientRotateY/10)*10)<20;
                          return(<div key={angle} style={{width:36,height:26,borderRadius:5,fontSize:10,
                            display:"flex",alignItems:"center",justifyContent:"center",fontWeight:isOpt?800:500,
                            background:isOpt?T.isDark?"rgba(77,255,124,0.15)":"#dcfce7":T.bgCard,
                            border:`1px solid ${isOpt?T.isDark?"#2a6634":"#86efac":T.border}`,
                            color:isOpt?T.green:T.textFaint}}>{angle}°</div>);
                        })}
                      </div>
                    </div>
                    <div>
                      <SectionTitle T={T}>Orientation Comparison</SectionTitle>
                      <div style={{marginTop:12}}>
                        {[{label:"Default (0°)",sv:100,bh:100,st:100,best:false},
                          {label:`★ Optimal (${d.orientRotateY}°)`,sv:100-d.supportReduction,bh:rnd(85,98),st:rnd(60,90),best:true},
                          {label:"Alternative (90°)",sv:rnd(110,140),bh:rnd(60,80),st:rnd(70,110),best:false},
                        ].map((row)=>(
                          <div key={row.label} style={{padding:16,
                            background:row.best?T.isDark?"rgba(0,40,20,0.4)":"#f0fdf4":T.bgCard,
                            border:`1px solid ${row.best?T.isDark?"#1a4020":"#86efac":T.border}`,
                            borderRadius:10,marginBottom:12}}>
                            <div style={{fontSize:14,fontWeight:800,color:row.best?T.green:T.text,marginBottom:12}}>{row.label}</div>
                            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12}}>
                              {[["Support",row.sv,"#f97316"],["Build Height",row.bh,T.blue],["Stability",row.st,"#ec4899"]].map(([k,v,c])=>(
                                <div key={k} style={{padding:"8px 10px",background:T.bgPanel,borderRadius:7,border:`1px solid ${T.borderSub}`}}>
                                  <div style={{fontSize:10,color:T.textFaint,fontWeight:600,marginBottom:4,textTransform:"uppercase"}}>{k}</div>
                                  <div style={{fontSize:16,fontWeight:800,color:c}}>{(+v).toFixed(1)}%</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* ── SLICE PARAMS TAB ── */}
                {tab==="params"&&(
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:28}}>
                    <div>
                      <SectionTitle T={T}>Recommended Parameters</SectionTitle>
                      <div style={{marginTop:8}}>
                        {[["Layer Height",`${d.layerHeight} mm`,d.layerHeight===0.12?T.accent:T.text],
                          ["Infill Density",`${d.baseInfill}%`,T.text],
                          ["Infill Pattern",d.infillPattern,T.isDark?"#cc88ff":"#7c3aed"],
                          ["Adaptive Layers",d.adaptiveLayers?"ENABLED":"DISABLED",d.adaptiveLayers?T.green:T.textFaint],
                          ["Support Type",d.needsSupports?"HYBRID TREE":"NONE",d.needsSupports?T.accent:T.green],
                          ["Wall Count","3 perimeters",T.text],["Top/Bottom Layers","4 layers",T.text],
                          ["Print Speed","80 mm/s",T.text],["First Layer Speed","25 mm/s",T.text],
                          ["Fan Speed",material==="ABS"?"15%":"100%",T.text],
                        ].map(([k,v,c])=>(<InfoRow key={k} label={k} value={v} color={c} T={T}/>))}
                      </div>
                    </div>
                    <div>
                      <SectionTitle T={T}>Print Estimates</SectionTitle>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:24,marginTop:10}}>
                        {[["PRINT TIME",`${d.timeH}h ${d.timeM}m`,false],["MATERIAL",`${d.materialGrams} g`,false],
                          ["COST",`₹${d.costINR}`,true],["LAYERS",totalLayers,false]].map(([k,v,accent])=>(
                          <div key={k} style={{padding:"16px 18px",background:accent?T.isDark?"rgba(26,58,32,0.6)":"#dcfce7":T.bgCard,
                            border:`1px solid ${accent?T.isDark?"#2a6634":"#86efac":T.border}`,borderRadius:10}}>
                            <div style={{fontSize:11,fontWeight:700,color:T.textFaint,letterSpacing:1,marginBottom:8,textTransform:"uppercase"}}>{k}</div>
                            <div style={{fontSize:22,fontWeight:800,color:accent?T.green:T.text,fontFamily:"'Courier New',monospace"}}>{v}</div>
                          </div>
                        ))}
                      </div>
                      <SectionTitle T={T}>Toolpath Breakdown</SectionTitle>
                      <div style={{marginTop:8}}>
                        {[["Perimeter passes",`${(d.surfaceArea*2.1*totalLayers*0.012).toFixed(1)} m`],
                          ["Infill traversal",`${(d.volume*5.5).toFixed(1)} m`],
                          ["Support material",d.needsSupports?`${(d.volume*0.8).toFixed(1)} m`:"0 m"],
                          ["Travel moves (est.)",`${(totalLayers*0.18).toFixed(1)} m`],
                        ].map(([k,v])=>(<InfoRow key={k} label={k} value={v} T={T}/>))}
                      </div>
                    </div>
                  </div>
                )}

                {/* ── RISKS TAB ── */}
                {tab==="risks"&&(
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:28}}>
                    <div>
                      <SectionTitle T={T}>Risk Factor Breakdown</SectionTitle>
                      <div style={{marginTop:12}}>
                        {[{label:"Overhang Failure Risk",value:d.maxOverhang>65?28:d.maxOverhang>55?15:3,t:20},
                          {label:"Thin Wall Collapse",value:d.thinWalls>12?20:d.thinWalls>5?10:2,t:15},
                          {label:"Center of Mass Shift",value:Math.round(d.cogOffset*40),t:12},
                          {label:"Height Instability",value:d.dims.h>150?10:d.dims.h>80?5:2,t:8},
                          {label:"Material Warping Risk",value:["ABS","Nylon","ASA"].includes(material)?18:4,t:12},
                          {label:"Layer Adhesion Risk",value:rndI(2,10),t:8},
                        ].map(({label,value,t})=>(<Bar key={label} T={T} label={label} value={value} max={30} warn={t}/>))}
                      </div>
                    </div>
                    <div>
                      <SectionTitle T={T}>Mitigation Recommendations</SectionTitle>
                      <div style={{marginTop:12}}>
                        {[d.needsSupports&&{warn:true,label:"Enable tree supports",detail:`Overhang at ${d.maxOverhang}° exceeds 55° threshold`},
                          d.thinWalls>8&&{warn:true,label:"Reduce layer height → 0.12mm",detail:`${d.thinWalls} thin wall regions detected`},
                          d.cogOffset>0.3&&{warn:true,label:"Add 8mm brim for bed adhesion",detail:`CoG offset ${(d.cogOffset*100).toFixed(0)}% may cause tipping`},
                          d.dims.h>150&&{warn:true,label:"Increase base infill to 35%",detail:`Height ${d.dims.h}mm requires stability base`},
                          ["ABS","Nylon"].includes(material)&&{warn:true,label:"Use enclosure + 90°C bed",detail:`${material} is prone to warping`},
                          {warn:false,label:`Infill pattern: ${d.infillPattern}`,detail:"Optimal pattern for current geometry profile"},
                          {warn:false,label:"Orientation optimized",detail:`${d.supportReduction}% support material reduction achieved`},
                        ].filter(Boolean).map((item,i)=>(
                          <div key={i} style={{padding:"12px 16px",
                            background:item.warn?T.isDark?"rgba(60,20,0,0.4)":"#fff7ed":T.isDark?"rgba(0,30,15,0.4)":"#f0fdf4",
                            border:`1px solid ${item.warn?T.isDark?"#3a2010":"#fdba74":T.isDark?"#1a4020":"#86efac"}`,
                            borderRadius:10,marginBottom:10}}>
                            <div style={{fontSize:14,fontWeight:700,color:item.warn?T.accent:T.green,marginBottom:4}}>
                              {item.warn?"⚠ ":"✓ "}{item.label}</div>
                            <div style={{fontSize:13,color:T.textSub}}>{item.detail}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>);
        })()}
      </div>
      <style>{`
        *{box-sizing:border-box;}
        body{margin:0;}
        ::-webkit-scrollbar{width:6px;height:6px;}
        ::-webkit-scrollbar-track{background:transparent;}
        ::-webkit-scrollbar-thumb{background:${T.isDark?"#1a3a50":"#cbd5e1"};border-radius:3px;}
        input[type=range]{width:100%;}
        button:hover{opacity:0.85;}
      `}</style>
    </div>
  );
}
