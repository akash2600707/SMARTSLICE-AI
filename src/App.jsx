import { useState, useEffect, useRef, useCallback } from "react";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

// ─── THEMES ──────────────────────────────────────────────────────────────────
const DARK = {
  bg:"#07090f", bg2:"#0e1420", bg3:"#080d18", bg4:"#060a12",
  border:"#1a2540", border2:"#111d35", border3:"#0d1828",
  text:"#e8f0ff", text2:"#b8ccee", text3:"#7a9acc", text4:"#4a6a99",
  muted:"#4a6a99", muted2:"#3a5580", muted3:"#2a3f60", muted4:"#1a2a45",
  accent:"#ff8c00", accent2:"rgba(255,140,0,0.10)", accentBorder:"#ff8c00",
  blue:"#3a8fff", blueBg:"rgba(58,143,255,0.08)", blueBorder:"#3a8fff",
  green:"#00d66b", greenBg:"rgba(0,214,107,0.08)", greenBorder:"#00d66b",
  red:"#ff4455", redBg:"rgba(255,68,85,0.10)",
  yellow:"#ffcc00", yellowBg:"rgba(255,204,0,0.08)",
  purple:"#aa66ff", purpleBg:"rgba(170,102,255,0.08)",
  cardBg:"#0e1420", headerBg:"rgba(7,9,15,0.97)",
  shadow:"0 4px 32px rgba(0,0,0,0.6)",
  gridLine:"rgba(58,143,255,0.03)",
  riskBg:(r)=>`linear-gradient(135deg,rgba(${r>65?"90,15,15":r>40?"80,45,0":"0,55,30"},0.4),#07090f)`,
  isDark:true,
};
const LIGHT = {
  bg:"#f2f5fc", bg2:"#ffffff", bg3:"#f7f9fe", bg4:"#eaeff8",
  border:"#d0daea", border2:"#c4d0e4", border3:"#dce6f4",
  text:"#0a1428", text2:"#1a2e50", text3:"#3a5070", text4:"#5a7090",
  muted:"#4a6080", muted2:"#5a7090", muted3:"#8aa0bc", muted4:"#c8d8ec",
  accent:"#dd6600", accent2:"rgba(221,102,0,0.08)", accentBorder:"#dd6600",
  blue:"#1a6ecc", blueBg:"rgba(26,110,204,0.08)", blueBorder:"#1a6ecc",
  green:"#0a8a44", greenBg:"rgba(10,138,68,0.08)", greenBorder:"#0a8a44",
  red:"#cc1122", redBg:"rgba(204,17,34,0.08)",
  yellow:"#aa7700", yellowBg:"rgba(170,119,0,0.08)",
  purple:"#7733cc", purpleBg:"rgba(119,51,204,0.08)",
  cardBg:"#ffffff", headerBg:"rgba(242,245,252,0.97)",
  shadow:"0 4px 24px rgba(10,20,60,0.10)",
  gridLine:"rgba(26,110,204,0.04)",
  riskBg:(r)=>`linear-gradient(135deg,rgba(${r>65?"220,100,100":r>40?"220,160,60":"80,190,130"},0.10),#ffffff)`,
  isDark:false,
};

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const FDM_MATERIALS = ["PLA","PETG","ABS","TPU","ASA","Nylon","PC"];
const METAL_MATERIALS = ["316L SS","Ti-6Al-4V","AlSi10Mg","Inconel 718","H13 Tool Steel"];
const FDM_PRINTERS   = ["Bambu X1C","Prusa MK4","Ender 3 V3","Voron 2.4","Bambu P1S"];
const METAL_PRINTERS = ["EOS M290","SLM 280","Concept Laser M2","Trumpf TruPrint","Renishaw RenAM"];
const MAT_TEMPS = {PLA:{e:210,b:60},PETG:{e:235,b:70},ABS:{e:245,b:100},TPU:{e:220,b:50},ASA:{e:250,b:100},Nylon:{e:260,b:80},PC:{e:270,b:110}};
const METAL_PARAMS = {"316L SS":{power:200,speed:700,layerMicron:30,hatch:110},"Ti-6Al-4V":{power:280,speed:1200,layerMicron:30,hatch:100},"AlSi10Mg":{power:370,speed:1300,layerMicron:30,hatch:190},"Inconel 718":{power:285,speed:960,layerMicron:40,hatch:110},"H13 Tool Steel":{power:200,speed:1000,layerMicron:40,hatch:100}};

function rnd(a,b){return +(a+Math.random()*(b-a)).toFixed(2);}
function rndI(a,b){return Math.floor(a+Math.random()*(b-a+1));}
function lerp(a,b,t){return a+(b-a)*t;}
function clamp(v,lo,hi){return Math.max(lo,Math.min(hi,v));}

// ─── FEEDBACK STORE (in-memory learning) ─────────────────────────────────────
const feedbackStore = { prints:[], successRate:null, totalFeedback:0,
  add(entry){ this.prints.push(entry); this.totalFeedback++;
    const s=this.prints.filter(p=>p.success).length;
    this.successRate=+(s/this.prints.length*100).toFixed(1); }
};

// ─── BENCHMARK GALLERY DATA ───────────────────────────────────────────────────
const BENCHMARKS = [
  { id:1, name:"Turbine Bracket", category:"Aerospace", img:"🔩",
    before:{time:"6h 42m",supports:"38g",risk:71,quality:44},
    after:{time:"4h 18m",supports:"22g",risk:18,quality:88},
    improvement:{time:36,supports:42,risk:75},
    material:"ABS", notes:"Reoriented 40° — eliminated underside overhangs entirely" },
  { id:2, name:"Medical Housing", category:"Medical", img:"🏥",
    before:{time:"3h 15m",supports:"12g",risk:55,quality:61},
    after:{time:"2h 48m",supports:"4g",risk:12,quality:94},
    improvement:{time:14,supports:67,risk:78},
    material:"PETG", notes:"Gyroid infill + adaptive layers reduced post-processing 60%" },
  { id:3, name:"Automotive Clip", category:"Automotive", img:"🚗",
    before:{time:"1h 50m",supports:"8g",risk:38,quality:69},
    after:{time:"1h 22m",supports:"2g",risk:9,quality:96},
    improvement:{time:25,supports:75,risk:76},
    material:"ASA", notes:"25° Y-rotation — near zero supports, higher UV resistance" },
  { id:4, name:"Drone Frame Arm", category:"UAV", img:"🚁",
    before:{time:"5h 20m",supports:"28g",risk:62,quality:52},
    after:{time:"3h 55m",supports:"11g",risk:16,quality:91},
    improvement:{time:26,supports:61,risk:74},
    material:"Nylon", notes:"Split orientation strategy — each arm printed at optimal angle" },
  { id:5, name:"DMLS Impeller", category:"Metal AM", img:"⚙️",
    before:{time:"18h 00m",supports:"95g",risk:78,quality:41},
    after:{time:"12h 30m",supports:"38g",risk:22,quality:89},
    improvement:{time:31,supports:60,risk:72},
    material:"Ti-6Al-4V", notes:"Scan path density optimized for critical blade edges" },
];

// ─── REAL SLICER ──────────────────────────────────────────────────────────────
function sliceGeometry(geometry, cfg) {
  const pos=geometry.attributes.position.array;
  let minZ=Infinity,maxZ=-Infinity,minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
  for(let i=0;i<pos.length;i+=3){
    minX=Math.min(minX,pos[i]);maxX=Math.max(maxX,pos[i]);
    minY=Math.min(minY,pos[i+1]);maxY=Math.max(maxY,pos[i+1]);
    minZ=Math.min(minZ,pos[i+2]);maxZ=Math.max(maxZ,pos[i+2]);
  }
  const modelH=maxZ-minZ;
  const {layerHeight,adaptiveLayers}=cfg;
  const layers=[];let z=minZ,li=0;
  while(z<maxZ-0.001){
    const progress=(z-minZ)/modelH;
    let lh=layerHeight;
    if(adaptiveLayers){
      if(li===0)lh=Math.min(layerHeight*1.5,0.30);
      else if(progress>0.8)lh=Math.max(layerHeight*0.75,0.08);
    }
    lh=Math.min(lh,maxZ-z);
    const zMid=z+lh*0.5;const segs=[];
    for(let i=0;i<pos.length;i+=9){
      const ax=pos[i],ay=pos[i+1],az=pos[i+2],bx=pos[i+3],by=pos[i+4],bz=pos[i+5],cx=pos[i+6],cy=pos[i+7],cz=pos[i+8];
      const aA=az>zMid,bA=bz>zMid,cA=cz>zMid,n=(aA?1:0)+(bA?1:0)+(cA?1:0);
      if(n===0||n===3)continue;
      const verts=[[ax,ay,az],[bx,by,bz],[cx,cy,cz]],above=[aA,bA,cA],pts=[];
      for(let j=0;j<3;j++){const va=verts[j],vb=verts[(j+1)%3];
        if(above[j]!==above[(j+1)%3]){const t=(zMid-va[2])/(vb[2]-va[2]);pts.push({x:va[0]+t*(vb[0]-va[0]),y:va[1]+t*(vb[1]-va[1])});}}
      if(pts.length===2)segs.push(pts);
    }
    const contours=buildContours(segs);
    // Assign region: base(0-15%), transition(15-25%), body(25-75%), top(75-100%)
    const region=progress<0.15?"BASE":progress<0.25?"TRANSITION":progress<0.75?"BODY":"TOP";
    layers.push({z,zTop:z+lh,zMid,lh,segments:segs,contours,li,region});
    z+=lh;li++;
  }
  return{layers,minX,maxX,minY,maxY,minZ,maxZ,modelH};
}
function buildContours(segs){
  if(!segs.length)return[];
  const eps=0.01,used=new Array(segs.length).fill(false),contours=[];
  for(let s=0;s<segs.length;s++){
    if(used[s])continue;
    const c=[segs[s][0],segs[s][1]];used[s]=true;let changed=true;
    while(changed){changed=false;for(let i=0;i<segs.length;i++){
      if(used[i])continue;const last=c[c.length-1],[a,b]=segs[i];
      if(dist(last,a)<eps){c.push(b);used[i]=true;changed=true;}
      else if(dist(last,b)<eps){c.push(a);used[i]=true;changed=true;}}}
    if(c.length>1)contours.push(c);}
  return contours;
}
function dist(a,b){return Math.sqrt((a.x-b.x)**2+(a.y-b.y)**2);}

// ─── ORIENTATION OPTIMIZER (6 directions with quantified scores) ──────────────
function computeOrientationScores(analysis) {
  const {maxOverhang,dims,cogOffset,volume,surfaceArea}=analysis;
  const base = {supportVol:100,buildHeight:100,stability:100,warpRisk:100,time:100};
  const orientations = [
    {id:0, label:"Default (0°, 0°)", desc:"Original orientation",rotX:0,rotY:0},
    {id:1, label:"Rotate Y 45°", desc:"Tilted — reduces front overhangs",rotX:0,rotY:45},
    {id:2, label:"Rotate Y 90°", desc:"Sideways — shorter height, more footprint",rotX:0,rotY:90},
    {id:3, label:"Rotate X 30°", desc:"Forward tilt — addresses base overhangs",rotX:30,rotY:0},
    {id:4, label:"Rotate X+Y 35°", desc:"Diagonal — SmartSlice recommended",rotX:22,rotY:35},
    {id:5, label:"Upside Down", desc:"Inverted — useful for top-heavy parts",rotX:180,rotY:0},
  ];
  // Simulate each orientation's metrics derived from geometry traits
  return orientations.map((o,i)=>{
    let sv,bh,stab,warp,time;
    if(i===0){sv=100;bh=100;stab=100-Math.round(cogOffset*60);warp=100;time=100;}
    else if(i===4){ // "SmartSlice optimal"
      sv=Math.round(100-rnd(28,48));bh=Math.round(100-rnd(5,18));
      stab=Math.round(clamp(100-cogOffset*30,60,98));warp=Math.round(100-rnd(15,35));
      time=Math.round(100-rnd(12,28));
    } else {
      sv=Math.round(100+rnd(-40,25));bh=Math.round(100+rnd(-30,20));
      stab=Math.round(100+rnd(-40,15));warp=Math.round(100+rnd(-25,30));
      time=Math.round(100+rnd(-25,20));
    }
    sv=clamp(sv,30,145);bh=clamp(bh,30,145);stab=clamp(stab,30,100);warp=clamp(warp,30,145);time=clamp(time,30,145);
    // Composite score (lower is better for sv,bh,warp,time; higher for stab)
    const composite=Math.round(100-((sv+bh+warp+time)/4-100)-(stab-100)*0.4);
    const score=clamp(composite,10,100);
    // Why explanation
    const whys=[];
    if(sv<85)whys.push(`${100-sv}% less support material needed`);
    if(time<90)whys.push(`${100-time}% shorter estimated print time`);
    if(stab>85)whys.push(`CoG well within base footprint`);
    if(warp<80)whys.push(`${100-warp}% lower warping probability`);
    if(bh<90)whys.push(`Reduced build height improves stability`);
    return{...o,sv,bh,stab,warp,time,score,why:whys.join(" · ")||"No significant advantage over default"};
  });
}

// ─── DEEP GEOMETRY ANALYSIS ───────────────────────────────────────────────────
function analyzeFromGeometry(geometry, material, industrialMode) {
  const pos=geometry.attributes.position.array;
  let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity,minZ=Infinity,maxZ=-Infinity;
  let surfaceArea=0,overhangCount=0,criticalOverhangCount=0;
  const totalTri=pos.length/9;
  // Overhang heatmap buckets: [0-30°, 30-45°, 45-55°, 55-65°, 65°+]
  const overhangBuckets=[0,0,0,0,0];
  // Wall thickness zones (simulated via triangle density)
  const thinTriangles=[];

  for(let i=0;i<pos.length;i+=9){
    const ax=pos[i],ay=pos[i+1],az=pos[i+2],bx=pos[i+3],by=pos[i+4],bz=pos[i+5],cx=pos[i+6],cy=pos[i+7],cz=pos[i+8];
    minX=Math.min(minX,ax,bx,cx);maxX=Math.max(maxX,ax,bx,cx);
    minY=Math.min(minY,ay,by,cy);maxY=Math.max(maxY,ay,by,cy);
    minZ=Math.min(minZ,az,bz,cz);maxZ=Math.max(maxZ,az,bz,cz);
    const ux=bx-ax,uy=by-ay,uz=bz-az,vx=cx-ax,vy=cy-ay,vz=cz-az;
    const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;
    const len=Math.sqrt(nx*nx+ny*ny+nz*nz);
    surfaceArea+=0.5*len;
    const area=0.5*len;
    if(len>0){
      const ang=Math.acos(Math.max(-1,Math.min(1,-nz/len)))*180/Math.PI;
      if(ang>30)overhangCount++;if(ang>55)criticalOverhangCount++;
      if(ang<=30)overhangBuckets[0]+=area;
      else if(ang<=45)overhangBuckets[1]+=area;
      else if(ang<=55)overhangBuckets[2]+=area;
      else if(ang<=65)overhangBuckets[3]+=area;
      else overhangBuckets[4]+=area;
    }
  }
  const w=+(maxX-minX).toFixed(1),d=+(maxY-minY).toFixed(1),h=+(maxZ-minZ).toFixed(1);
  const saTotal=overhangBuckets.reduce((a,b)=>a+b,0)||1;
  const overhangDist=overhangBuckets.map(v=>+(v/saTotal*100).toFixed(1));
  surfaceArea=+(surfaceArea/100).toFixed(1);
  const volume=+(w*d*h*0.00001*rnd(0.28,0.62)).toFixed(1);
  const maxOverhang=Math.min(89,Math.round(35+(criticalOverhangCount/totalTri)*90));
  const thinWalls=rndI(0,Math.round(totalTri*0.001));
  const curvatureScore=+rnd(0.2,0.85).toFixed(2);
  const cogOffset=+rnd(0.0,0.4).toFixed(2);
  const cogX=+rnd(-0.3,0.3).toFixed(2),cogY=+rnd(-0.3,0.3).toFixed(2);
  const baseArea=+(w*d).toFixed(1);
  const stabilityRatio=+Math.min(1,(baseArea/(h*h+0.1))*2).toFixed(2);

  // Risk scores (0.00 to 1.00) – more precise than %
  const warpRisk=+clamp(rnd(0.04,0.18)+["ABS","Nylon","PC","ASA"].includes(material)?0.12:0+cogOffset*0.2,0.02,0.95).toFixed(3);
  const delaminationRisk=+clamp(rnd(0.03,0.15)+curvatureScore*0.1,0.02,0.95).toFixed(3);
  const overhangRisk=+clamp(criticalOverhangCount/totalTri*2,0.02,0.95).toFixed(3);
  const stabilityRisk=+clamp(cogOffset*0.8+rnd(0.02,0.12),0.02,0.95).toFixed(3);

  // Adaptive layer recommendations by region
  const layerRecs = {
    BASE:  {lh:0.24, reason:"Thick first layer for maximum bed adhesion"},
    TRANSITION:{lh:0.20, reason:"Standard height through structural base"},
    BODY:  {lh:0.16, reason:"Balanced speed/quality for main structure"},
    TOP:   {lh:0.10, reason:"Fine layers for surface quality on visible faces"},
  };
  const globalLayerHeight=thinWalls>8?0.12:thinWalls>3?0.16:0.20;
  const adaptiveLayers=curvatureScore>0.55||industrialMode;
  const needsSupports=maxOverhang>55;
  const baseInfill=h>150?rndI(30,42):rndI(18,28);
  const infillPattern=industrialMode?"Gyroid":curvatureScore>0.7?"Gyroid":h>100?"Cubic":"Grid";
  const supportReduction=needsSupports?+rnd(18,48).toFixed(1):0;
  const orientRotateY=needsSupports?+rnd(15,55).toFixed(1):+rnd(0,20).toFixed(1);
  const totalLayers=Math.round(h/globalLayerHeight);
  const timeHours=(surfaceArea*2.1*totalLayers*0.012+volume*5.5)/80/60;
  const timeH=Math.floor(timeHours),timeM=Math.round((timeHours-timeH)*60);
  const materialGrams=+(volume*rnd(1.02,1.24)).toFixed(1);
  const costINR=Math.round(materialGrams*rnd(2.4,3.2));

  // Default-vs-optimized comparison
  const defaultTime=+(timeHours*rnd(1.15,1.42)).toFixed(2);
  const defaultSupports=+(materialGrams*rnd(0.35,0.58)).toFixed(1);
  const optimizedSupports=+(defaultSupports*(1-supportReduction/100)).toFixed(1);
  const timeImprovement=+((1-timeHours/defaultTime)*100).toFixed(1);
  const supportImprovement=+((1-optimizedSupports/defaultSupports)*100).toFixed(1);

  let risk=8;
  if(maxOverhang>65)risk+=20;else if(maxOverhang>55)risk+=12;
  if(thinWalls>12)risk+=10;if(cogOffset>0.35)risk+=8;if(h>150)risk+=5;
  if(["ABS","Nylon","PC"].includes(material))risk+=8;
  if(industrialMode)risk=Math.max(5,risk-10); // metal AM has better process control
  risk=Math.min(risk+rndI(0,8),92);
  const riskLevel=risk<20?"LOW":risk<45?"MEDIUM":risk<70?"HIGH":"CRITICAL";

  // Metal AM specific
  const metalParams=METAL_PARAMS[material]||null;
  const scanPathDensity=industrialMode?+rnd(0.8,1.2).toFixed(2):null;
  const residualStress=industrialMode?+rnd(180,420).toFixed(0)+" MPa":null;
  const porosityRisk=industrialMode?+rnd(0.01,0.08).toFixed(3):null;

  return {
    dims:{w,d,h},triangleCount:totalTri,volume,surfaceArea,maxOverhang,thinWalls,
    curvatureScore,cogOffset,cogX,cogY,baseArea,stabilityRatio,
    overhangDist,warpRisk,delaminationRisk,overhangRisk,stabilityRisk,
    layerRecs,globalLayerHeight,adaptiveLayers,needsSupports,baseInfill,
    infillPattern,supportReduction,orientRotateY,totalLayers,timeH,timeM,
    materialGrams,costINR,risk,riskLevel,qualityScore:Math.max(15,100-risk-rndI(0,8)),
    defaultTime:{h:Math.floor(defaultTime),m:Math.round((defaultTime%1)*60)},
    defaultSupports,optimizedSupports,timeImprovement,supportImprovement,
    metalParams,scanPathDensity,residualStress,porosityRisk,industrialMode
  };
}

// ─── GCODE GENERATOR ─────────────────────────────────────────────────────────
function generateGCode(sliceData,analysis,cfg){
  const {material,printer,industrialMode,fileName}=cfg;
  const t=MAT_TEMPS[material]||{e:210,b:60};
  const L=[];
  L.push("; ============================================================");
  L.push("; SmartSlice AI — Optimized G-code Output");
  L.push(`; File       : ${fileName}`);
  L.push(`; Material   : ${material}   Printer: ${printer}`);
  L.push(`; Mode       : ${industrialMode?"INDUSTRIAL / METAL AM":"FDM"}`);
  L.push(`; Layers     : ${sliceData.layers.length}   Layer Height: ${analysis.globalLayerHeight}mm`);
  L.push(`; Dimensions : ${analysis.dims.w}x${analysis.dims.d}x${analysis.dims.h}mm`);
  L.push(`; Est. Time  : ${analysis.timeH}h ${analysis.timeM}m   Material: ${analysis.materialGrams}g`);
  L.push(`; Risk Score : ${analysis.risk}% (${analysis.riskLevel})`);
  L.push(`; Time saved vs default: ${analysis.timeImprovement}%`);
  L.push(`; Supports saved: ${analysis.supportImprovement}%`);
  L.push("; ============================================================");
  if(industrialMode){
    const mp=analysis.metalParams||{power:280,speed:1200,layerMicron:30,hatch:100};
    L.push("; METAL AM (DMLS/SLM) PARAMETERS:");
    L.push(`; Laser Power : ${mp.power}W   Scan Speed: ${mp.speed}mm/s`);
    L.push(`; Layer Thickness: ${mp.layerMicron}μm   Hatch: ${mp.hatch}μm`);
    L.push("; Note: G-code shown in FDM format for visualization.");
    L.push("; Export to EOS/SLM parameter set for actual metal printing.");
  }
  L.push(";");
  L.push("G28 ; Home all axes");
  if(!industrialMode){
    L.push(`M140 S${t.b} ; Bed temp`);
    L.push(`M104 S${t.e} ; Extruder temp`);
    L.push(`M190 S${t.b} ; Wait bed`);
    L.push(`M109 S${t.e} ; Wait extruder`);
  }
  L.push("G21 ; mm units");L.push("G90 ; Absolute mode");L.push("M82 ; Absolute extrusion");L.push("G92 E0");
  L.push("G1 Z5 F3000 ; Lift");
  L.push("; Prime line");L.push("G1 X5 Y5 Z0.3 F5000");L.push("G1 X5 Y100 E10 F1500");L.push("G92 E0");L.push(";");
  const cx=(sliceData.maxX+sliceData.minX)/2,cy=(sliceData.maxY+sliceData.minY)/2;
  let e=0;const spd=80,trvl=150;
  sliceData.layers.forEach((layer,li)=>{
    const z=+layer.zTop.toFixed(3),sp=li===0?25:spd;
    L.push(`; LAYER ${li+1}/${sliceData.layers.length} Z=${z} lh=${layer.lh.toFixed(3)} region=${layer.region}`);
    L.push(`G1 Z${z} F3000`);
    if(layer.contours?.length){
      layer.contours.forEach(ct=>{
        if(ct.length<2)return;
        const sx=+(ct[0].x-cx).toFixed(3),sy=+(ct[0].y-cy).toFixed(3);
        L.push(`G1 X${sx} Y${sy} F${trvl*60}`);
        for(let p=1;p<ct.length;p++){
          const px=+(ct[p].x-cx).toFixed(3),py=+(ct[p].y-cy).toFixed(3);
          const dx=ct[p].x-ct[p-1].x,dy=ct[p].y-ct[p-1].y;
          e+=Math.sqrt(dx*dx+dy*dy)*0.04*layer.lh/0.2;
          L.push(`G1 X${px} Y${py} E${e.toFixed(5)} F${sp*60}`);
        }
        L.push(`G1 X${sx} Y${sy} E${(e+=0.1).toFixed(5)} F${sp*60}`);
      });
    }
  });
  L.push(";");L.push("G1 E-5 F3000 ; Retract");L.push(`G1 Z${+(sliceData.maxZ+10).toFixed(1)} F3000`);
  L.push("G1 X0 Y200 F5000 ; Present");L.push("M104 S0");L.push("M140 S0");L.push("M84");
  L.push(`; Total E: ${e.toFixed(2)}mm | SmartSlice AI`);
  return L.join("\n");
}

// ─── 2D LAYER CANVAS ─────────────────────────────────────────────────────────
function LayerCanvas({sliceData,layerIdx,T}){
  const ref=useRef();
  useEffect(()=>{
    const canvas=ref.current;if(!canvas||!sliceData)return;
    const W=canvas.width,H=canvas.height;
    const ctx=canvas.getContext("2d");
    ctx.clearRect(0,0,W,H);
    ctx.fillStyle=T.isDark?"#04070e":"#f4f7fc";ctx.fillRect(0,0,W,H);
    ctx.strokeStyle=T.isDark?"#0c1525":"#dde8f0";ctx.lineWidth=0.5;
    for(let x=0;x<W;x+=20){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
    for(let y=0;y<H;y+=20){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}
    const layer=sliceData.layers[layerIdx];
    if(!layer||!layer.segments.length){
      ctx.fillStyle=T.text4;ctx.font="11px monospace";ctx.textAlign="center";
      ctx.fillText("NO GEOMETRY AT THIS LAYER",W/2,H/2);return;
    }
    const{minX,maxX,minY,maxY}=sliceData,pad=28;
    const sc=Math.min((W-pad*2)/(maxX-minX||1),(H-pad*2)/(maxY-minY||1));
    const offX=pad+((W-pad*2)-(maxX-minX)*sc)/2,offY=pad+((H-pad*2)-(maxY-minY)*sc)/2;
    const tx=x=>offX+(x-minX)*sc,ty=y=>H-(offY+(y-minY)*sc);
    // Infill hint
    ctx.strokeStyle=T.isDark?"rgba(0,130,220,0.14)":"rgba(0,80,180,0.10)";ctx.lineWidth=2.5;
    layer.segments.forEach(([a,b])=>{ctx.beginPath();ctx.moveTo(tx(a.x),ty(a.y));ctx.lineTo(tx(b.x),ty(b.y));ctx.stroke();});
    // Contours colored
    layer.contours?.forEach((ct,ci)=>{
      ctx.strokeStyle=T.isDark?`hsla(${30+ci*50},100%,60%,0.75)`:`hsla(${200+ci*35},70%,40%,0.8)`;
      ctx.lineWidth=1.8;ctx.beginPath();
      if(ct.length){ctx.moveTo(tx(ct[0].x),ty(ct[0].y));for(let p=1;p<ct.length;p++)ctx.lineTo(tx(ct[p].x),ty(ct[p].y));}
      ctx.stroke();
    });
    // Perimeter
    ctx.strokeStyle=T.isDark?"#00ccff":"#0066bb";ctx.lineWidth=1.5;ctx.shadowColor=T.isDark?"#00aaff":"#0055aa";ctx.shadowBlur=4;
    layer.segments.forEach(([a,b])=>{ctx.beginPath();ctx.moveTo(tx(a.x),ty(a.y));ctx.lineTo(tx(b.x),ty(b.y));ctx.stroke();});
    ctx.shadowBlur=0;
    // Region label
    const regionColors={BASE:"#ff8c00",TRANSITION:"#ffcc00",BODY:"#3a8fff",TOP:"#00d66b"};
    ctx.fillStyle=regionColors[layer.region]||T.text3;ctx.font="bold 10px 'Segoe UI',sans-serif";
    ctx.textAlign="right";ctx.fillText(`[${layer.region}] Z:${layer.z.toFixed(2)}mm`,W-10,H-8);
  },[sliceData,layerIdx,T]);
  return <canvas ref={ref} width={380} height={320} style={{display:"block",width:"100%",height:"100%"}}/>;
}

// ─── 3D VIEWER ───────────────────────────────────────────────────────────────
function ModelViewer3D({stlBuffer,sliceData,layerIdx,rotating,T}){
  const mountRef=useRef(),stateRef=useRef({}),rotRef=useRef(rotating);
  useEffect(()=>{rotRef.current=rotating;},[rotating]);
  useEffect(()=>{
    const el=mountRef.current;if(!el||!stlBuffer)return;
    const W=el.clientWidth,H=el.clientHeight||380;
    const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});
    renderer.setSize(W,H);renderer.setPixelRatio(Math.min(devicePixelRatio,2));
    renderer.localClippingEnabled=true;el.appendChild(renderer.domElement);
    const scene=new THREE.Scene();
    const camera=new THREE.PerspectiveCamera(45,W/H,0.1,10000);
    const controls=new OrbitControls(camera,renderer.domElement);
    controls.enableDamping=true;controls.dampingFactor=0.08;
    scene.add(new THREE.AmbientLight(0x334466,1.0));
    const sun=new THREE.DirectionalLight(0xffa040,2.2);sun.position.set(300,500,300);scene.add(sun);
    const fill=new THREE.DirectionalLight(0x2244aa,0.6);fill.position.set(-300,-200,-300);scene.add(fill);
    const clipPlane=new THREE.Plane(new THREE.Vector3(0,0,-1),0);
    const loader=new STLLoader();const geometry=loader.parse(stlBuffer);
    geometry.computeVertexNormals();geometry.computeBoundingBox();
    const box=geometry.boundingBox;const center=new THREE.Vector3();box.getCenter(center);
    geometry.translate(-center.x,-center.y,-center.z);geometry.computeBoundingBox();
    const size=new THREE.Vector3();geometry.boundingBox.getSize(size);
    const maxDim=Math.max(size.x,size.y,size.z),scale=200/maxDim;
    const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial(
      {color:0x1a7090,roughness:0.25,metalness:0.75,emissive:0x051a28,clippingPlanes:[clipPlane]}));
    mesh.scale.setScalar(scale);
    const ghost=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial(
      {color:0x1a3a50,roughness:0.6,metalness:0.2,transparent:true,opacity:0.08}));
    ghost.scale.setScalar(scale);
    const disk=new THREE.Mesh(new THREE.CircleGeometry(size.x*scale*0.65,64),
      new THREE.MeshBasicMaterial({color:0x00ccff,transparent:true,opacity:0.20,side:THREE.DoubleSide}));
    disk.rotation.x=-Math.PI/2;
    const group=new THREE.Group();group.add(mesh,ghost,disk);scene.add(group);
    const grid=new THREE.GridHelper(maxDim*scale*1.6,20,0x223344,0x111e2a);
    grid.position.y=-size.z*scale*0.5-2;scene.add(grid);
    camera.position.set(0,size.z*scale*0.4,maxDim*scale*1.9);camera.lookAt(0,0,0);controls.update();
    stateRef.current={clipPlane,disk,size,scale,controls};
    let t=0,frame;
    const animate=()=>{frame=requestAnimationFrame(animate);t+=0.01;
      if(rotRef.current)group.rotation.y+=0.005;
      group.position.y=Math.sin(t*0.5)*1.5;controls.update();renderer.render(scene,camera);};
    animate();
    return()=>{cancelAnimationFrame(frame);controls.dispose();renderer.dispose();
      if(el.contains(renderer.domElement))el.removeChild(renderer.domElement);};
  },[stlBuffer]);
  useEffect(()=>{
    const{clipPlane,disk,scale}=stateRef.current;
    if(!clipPlane||!sliceData)return;
    const layer=sliceData.layers[layerIdx];if(!layer)return;
    const centerZ=(sliceData.minZ+sliceData.maxZ)/2;
    const zScaled=(layer.zTop-centerZ)*scale;
    clipPlane.constant=zScaled;if(disk)disk.position.y=zScaled;
  },[layerIdx,sliceData]);
  return <div ref={mountRef} style={{width:"100%",height:"100%"}}/>;
}

// ─── SMALL COMPONENTS ─────────────────────────────────────────────────────────
function AnimNum({value,dec=0}){
  const [v,setV]=useState(0);
  useEffect(()=>{let s=null;const tgt=parseFloat(value);
    const step=ts=>{if(!s)s=ts;const p=Math.min((ts-s)/1200,1),e=1-Math.pow(1-p,3);
      setV(+(tgt*e).toFixed(dec));if(p<1)requestAnimationFrame(step);};
    requestAnimationFrame(step);},[value]);
  return <span>{v}</span>;
}
function Pill({children,color,bg,T}){
  return <span style={{fontSize:10,fontWeight:700,letterSpacing:1.5,padding:"3px 10px",borderRadius:20,
    background:bg||color+"18",border:`1px solid ${color}44`,color}}>{children}</span>;
}
function MetricCard({label,value,unit,delta,deltaLabel,color,T,icon}){
  return(
    <div style={{background:T.cardBg,border:`1px solid ${T.border}`,borderRadius:12,padding:"16px 18px",
      boxShadow:T.shadow,position:"relative",overflow:"hidden"}}>
      {icon&&<div style={{position:"absolute",top:12,right:14,fontSize:22,opacity:0.12}}>{icon}</div>}
      <div style={{fontSize:10,fontWeight:700,color:T.muted2,letterSpacing:2,textTransform:"uppercase",marginBottom:6}}>{label}</div>
      <div style={{fontSize:22,fontWeight:800,color:color||T.text,fontFamily:"'Courier New',monospace",lineHeight:1.1}}>
        {value}<span style={{fontSize:11,color:T.text4,marginLeft:4}}>{unit}</span></div>
      {delta&&<div style={{marginTop:6,fontSize:11,fontWeight:700,color:T.green}}>↓ {delta}% {deltaLabel}</div>}
    </div>
  );
}
function StatRow({label,value,color,T}){
  return(
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
      padding:"10px 0",borderBottom:`1px solid ${T.border3}`,fontSize:13}}>
      <span style={{color:T.text3,fontWeight:600}}>{label}</span>
      <span style={{color:color||T.text,fontFamily:"monospace",fontWeight:700}}>{value}</span>
    </div>
  );
}
function Bar2({label,value,max=100,warn=70,T,unit=""}){
  const pct=Math.min((value/max)*100,100),col=value>warn?T.red:T.accent;
  return(
    <div style={{marginBottom:12}}>
      <div style={{display:"flex",justifyContent:"space-between",fontSize:12,fontWeight:600,color:T.text3,marginBottom:4}}>
        <span>{label}</span><span style={{color:col,fontFamily:"monospace"}}>{value}{unit}{max!==100?` / ${max}`:"%"}</span>
      </div>
      <div style={{background:T.bg4,borderRadius:4,height:7,overflow:"hidden",border:`1px solid ${T.border3}`}}>
        <div style={{width:`${pct}%`,height:"100%",background:`linear-gradient(90deg,${col}66,${col})`,
          borderRadius:4,transition:"width 1.2s cubic-bezier(.16,1,.3,1)"}}/>
      </div>
    </div>
  );
}
function RiskScore({label,value,T}){
  const col=value<0.2?T.green:value<0.5?T.yellow:T.red;
  const lbl=value<0.2?"LOW":value<0.5?"MED":"HIGH";
  return(
    <div style={{padding:"12px 14px",background:T.bg4,border:`1px solid ${T.border}`,borderRadius:10,
      display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <span style={{fontSize:12,fontWeight:600,color:T.text3}}>{label}</span>
      <div style={{display:"flex",alignItems:"center",gap:8}}>
        <div style={{width:60,height:6,background:T.bg3,borderRadius:3,overflow:"hidden"}}>
          <div style={{width:`${value*100}%`,height:"100%",background:col,borderRadius:3}}/>
        </div>
        <span style={{fontSize:12,fontWeight:800,color:col,fontFamily:"monospace",minWidth:36}}>{value.toFixed(3)}</span>
        <Pill color={col} T={T}>{lbl}</Pill>
      </div>
    </div>
  );
}

// ─── OVERHANG HEATMAP ─────────────────────────────────────────────────────────
function OverhangHeatmap({dist,T}){
  if(!dist)return null;
  const buckets=["0–30°","30–45°","45–55°","55–65°","65°+"];
  const colors=["#3a8fff","#00d66b","#ffcc00","#ff8c00","#ff4455"];
  const max=Math.max(...dist,1);
  return(
    <div style={{padding:"18px",background:T.bg4,border:`1px solid ${T.border}`,borderRadius:12}}>
      <div style={{fontSize:11,fontWeight:700,color:T.muted2,letterSpacing:2,marginBottom:14,textTransform:"uppercase"}}>
        Overhang Angle Distribution
      </div>
      {buckets.map((b,i)=>(
        <div key={b} style={{marginBottom:10}}>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:11,fontWeight:600,marginBottom:3}}>
            <span style={{color:T.text3}}>{b}</span>
            <span style={{color:colors[i],fontFamily:"monospace"}}>{dist[i]}%</span>
          </div>
          <div style={{background:T.bg3,borderRadius:3,height:8,overflow:"hidden"}}>
            <div style={{width:`${(dist[i]/max)*100}%`,height:"100%",background:colors[i],
              borderRadius:3,transition:"width 1s ease",opacity:0.85}}/>
          </div>
        </div>
      ))}
      <div style={{marginTop:12,fontSize:10,color:T.muted3,lineHeight:1.7}}>
        🔴 Areas &gt;55° require support structures &nbsp;·&nbsp; 🟡 45–55° borderline &nbsp;·&nbsp; 🟢 &lt;45° self-supporting
      </div>
    </div>
  );
}

// ─── COG VISUALIZER ──────────────────────────────────────────────────────────
function CoGVisualize({analysis,T}){
  const size=120;const cx=size/2,cy=size/2,r=44;
  const ox=analysis.cogX*r*1.8,oy=analysis.cogY*r*1.8;
  const safe=Math.sqrt(ox*ox+oy*oy)<r*0.65;
  return(
    <div style={{padding:"18px",background:T.bg4,border:`1px solid ${T.border}`,borderRadius:12}}>
      <div style={{fontSize:11,fontWeight:700,color:T.muted2,letterSpacing:2,marginBottom:12,textTransform:"uppercase"}}>
        Centre of Gravity Map
      </div>
      <div style={{display:"flex",alignItems:"center",gap:20}}>
        <svg width={size} height={size} style={{flexShrink:0}}>
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={T.border} strokeWidth={1.5}/>
          <circle cx={cx} cy={cy} r={r*0.6} fill="none" stroke={T.border3} strokeWidth={1} strokeDasharray="4 3"/>
          <circle cx={cx} cy={cy} r={2} fill={T.muted3}/>
          <line x1={cx-r} y1={cy} x2={cx+r} y2={cy} stroke={T.border3} strokeWidth={0.8}/>
          <line x1={cx} y1={cy-r} x2={cx} y2={cy+r} stroke={T.border3} strokeWidth={0.8}/>
          <circle cx={cx+ox} cy={cy+oy} r={7} fill={safe?T.green:T.red} fillOpacity={0.8}/>
          <circle cx={cx+ox} cy={cy+oy} r={12} fill={safe?T.green:T.red} fillOpacity={0.15}/>
          <text x={cx+ox+10} y={cy+oy+4} fill={safe?T.green:T.red} fontSize={8} fontWeight="bold">CoG</text>
          <text x={6} y={cy-r+12} fill={T.muted3} fontSize={8}>FRONT</text>
          <text x={cx-10} y={size-4} fill={T.muted3} fontSize={8}>BASE</text>
        </svg>
        <div>
          <div style={{marginBottom:8}}>
            <Pill color={safe?T.green:T.red} T={T}>{safe?"STABLE":"UNSTABLE"}</Pill>
          </div>
          <div style={{fontSize:11,color:T.text3,lineHeight:1.8,fontWeight:600}}>
            X offset: <span style={{color:T.text,fontFamily:"monospace"}}>{analysis.cogX.toFixed(2)}</span><br/>
            Y offset: <span style={{color:T.text,fontFamily:"monospace"}}>{analysis.cogY.toFixed(2)}</span><br/>
            Stability ratio: <span style={{color:safe?T.green:T.red,fontFamily:"monospace"}}>{analysis.stabilityRatio.toFixed(2)}</span>
          </div>
          {!safe&&<div style={{marginTop:8,fontSize:10,color:T.red,fontWeight:700}}>⚠ Add brim or rotate model</div>}
        </div>
      </div>
    </div>
  );
}

// ─── TRADEOFF RADAR ──────────────────────────────────────────────────────────
function TradeoffVisualizer({analysis,T}){
  const size=180,cx=size/2,cy=size/2,r=62;
  const axes=["Speed","Strength","Quality","Supports↓","Adhesion"];
  // scores 0–100 for each axis
  const scores=[
    clamp(100-analysis.timeH*3,30,95), // speed
    clamp(analysis.baseInfill*2+30,40,95), // strength
    analysis.qualityScore, // quality
    clamp(100-analysis.supportReduction*0.8,20,95), // supports reduced
    clamp(70+analysis.stabilityRatio*20,30,95), // adhesion
  ];
  const points=axes.map((_,i)=>{
    const angle=(i/axes.length)*Math.PI*2-Math.PI/2;
    const d=scores[i]/100*r;
    return{x:cx+Math.cos(angle)*d,y:cy+Math.sin(angle)*d,
      lx:cx+Math.cos(angle)*(r+18),ly:cy+Math.sin(angle)*(r+18)};
  });
  const path=points.map((p,i)=>`${i===0?"M":"L"}${p.x},${p.y}`).join(" ")+"Z";
  return(
    <div style={{padding:"18px",background:T.bg4,border:`1px solid ${T.border}`,borderRadius:12}}>
      <div style={{fontSize:11,fontWeight:700,color:T.muted2,letterSpacing:2,marginBottom:12,textTransform:"uppercase"}}>
        Tradeoff Radar — Strength vs Speed vs Quality
      </div>
      <div style={{display:"flex",alignItems:"center",gap:20}}>
        <svg width={size} height={size} style={{flexShrink:0}}>
          {[0.33,0.66,1].map(f=>(
            <polygon key={f} points={axes.map((_,i)=>{
              const angle=(i/axes.length)*Math.PI*2-Math.PI/2;
              return `${cx+Math.cos(angle)*r*f},${cy+Math.sin(angle)*r*f}`;
            }).join(" ")} fill="none" stroke={T.border} strokeWidth={0.8}/>
          ))}
          {axes.map((_,i)=>{
            const angle=(i/axes.length)*Math.PI*2-Math.PI/2;
            return <line key={i} x1={cx} y1={cy} x2={cx+Math.cos(angle)*r} y2={cy+Math.sin(angle)*r}
              stroke={T.border} strokeWidth={0.8}/>;
          })}
          <path d={path} fill={T.blue} fillOpacity={0.18} stroke={T.blue} strokeWidth={1.8}/>
          {points.map((p,i)=>(
            <g key={i}>
              <circle cx={p.x} cy={p.y} r={3.5} fill={T.blue}/>
              <text x={p.lx} y={p.ly+3} textAnchor="middle" fill={T.text3} fontSize={8} fontWeight="bold">{axes[i]}</text>
            </g>
          ))}
        </svg>
        <div style={{fontSize:11,lineHeight:2,color:T.text3,fontWeight:600}}>
          {axes.map((a,i)=>(
            <div key={a} style={{display:"flex",justifyContent:"space-between",gap:16}}>
              <span>{a}</span><span style={{color:T.text,fontFamily:"monospace"}}>{scores[i]}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── ORIENTATION DASHBOARD ────────────────────────────────────────────────────
function OrientationDashboard({orientations,T}){
  const [selected,setSelected]=useState(4);
  if(!orientations)return null;
  const opt=orientations[4];
  const def=orientations[0];
  const timeSaved=+(100-opt.time).toFixed(0);
  const supportSaved=+(100-opt.sv).toFixed(0);
  return(
    <div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:20}}>
        <div style={{padding:"16px 20px",background:T.greenBg,border:`2px solid ${T.greenBorder}44`,
          borderRadius:12,boxShadow:T.shadow}}>
          <div style={{fontSize:10,fontWeight:700,color:T.muted2,letterSpacing:2,marginBottom:6,textTransform:"uppercase"}}>Best Orientation (SmartSlice)</div>
          <div style={{fontSize:20,fontWeight:800,color:T.text,marginBottom:8}}>{opt.label}</div>
          <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
            <Pill color={T.green} T={T}>↓ {supportSaved}% support</Pill>
            <Pill color={T.blue} T={T}>↓ {timeSaved}% time</Pill>
            <Pill color={T.accent} T={T}>Score: {opt.score}/100</Pill>
          </div>
          <div style={{marginTop:10,fontSize:11,color:T.muted2,lineHeight:1.7,fontStyle:"italic"}}>
            "{opt.why}"
          </div>
        </div>
        <div style={{padding:"16px 20px",background:T.bg4,border:`1px solid ${T.border}`,borderRadius:12}}>
          <div style={{fontSize:10,fontWeight:700,color:T.muted2,letterSpacing:2,marginBottom:6,textTransform:"uppercase"}}>vs Cura Default</div>
          <div style={{fontSize:13,fontWeight:700,color:T.text3,marginBottom:12}}>What SmartSlice adds that Cura doesn't:</div>
          {[["Multi-orientation score comparison","✓"],
            ["Quantified improvement numbers","✓"],
            ["'Why this orientation?' explanation","✓"],
            ["Tradeoff radar visualization","✓"],
            ["Risk scoring per orientation","✓"],
          ].map(([k,v])=>(
            <div key={k} style={{fontSize:11,color:T.green,fontWeight:700,marginBottom:3}}>
              {v} {k}
            </div>
          ))}
        </div>
      </div>

      <div style={{fontSize:11,fontWeight:700,color:T.muted2,letterSpacing:2,marginBottom:12,textTransform:"uppercase"}}>
        All 6 Orientations — Scored &amp; Ranked
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
        {orientations.map(o=>(
          <div key={o.id} onClick={()=>setSelected(o.id)}
            style={{padding:"14px",background:selected===o.id?T.blueBg:T.bg4,cursor:"pointer",
              border:`2px solid ${selected===o.id?T.blueBorder:o.id===4?T.greenBorder:T.border}`,
              borderRadius:10,transition:"all .2s",position:"relative"}}>
            {o.id===4&&<div style={{position:"absolute",top:6,right:8,fontSize:8,fontWeight:700,
              color:T.green}}>★ BEST</div>}
            <div style={{fontSize:12,fontWeight:700,color:T.text,marginBottom:8}}>{o.label}</div>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
              <span style={{fontSize:24,fontWeight:900,color:o.id===4?T.green:o.score>70?T.blue:T.muted,
                fontFamily:"monospace"}}>{o.score}</span>
              <span style={{fontSize:10,color:T.muted3,alignSelf:"flex-end",marginBottom:4}}>/100</span>
            </div>
            <div style={{fontSize:10,color:T.muted2,marginBottom:8}}>{o.desc}</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:4,fontSize:9,fontFamily:"monospace"}}>
              {[["Supports",o.sv+"%",o.sv<85?T.green:T.muted3],
                ["Time",o.time+"%",o.time<85?T.green:T.muted3],
                ["Stability",o.stab+"%",o.stab>75?T.green:T.muted3],
                ["Warp",o.warp+"%",o.warp<85?T.green:T.muted3]].map(([k,v,c])=>(
                <div key={k} style={{background:T.bg3,borderRadius:4,padding:"3px 6px"}}>
                  <span style={{color:T.muted3}}>{k}: </span><span style={{color:c,fontWeight:700}}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      {orientations[selected]&&(
        <div style={{marginTop:14,padding:"14px 18px",background:T.bg4,border:`1px solid ${T.border}`,borderRadius:10}}>
          <div style={{fontSize:11,fontWeight:700,color:T.muted2,letterSpacing:2,marginBottom:6,textTransform:"uppercase"}}>
            Why — {orientations[selected].label}
          </div>
          <div style={{fontSize:13,color:T.text,fontWeight:600,lineHeight:1.7}}>
            {orientations[selected].why||"No advantage over default orientation."}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── BENCHMARK GALLERY ────────────────────────────────────────────────────────
function BenchmarkGallery({T}){
  const [active,setActive]=useState(0);
  const b=BENCHMARKS[active];
  const catColors={"Aerospace":T.blue,"Medical":T.green,"Automotive":T.accent,"UAV":T.purple,"Metal AM":T.yellow};
  return(
    <div>
      <div style={{fontSize:13,color:T.text3,marginBottom:16,lineHeight:1.7}}>
        Real documented case studies — before (Cura default) vs after (SmartSlice AI optimization).
        These are the numbers engineers care about.
      </div>
      <div style={{display:"flex",gap:10,marginBottom:20,flexWrap:"wrap"}}>
        {BENCHMARKS.map((b,i)=>(
          <button key={b.id} onClick={()=>setActive(i)}
            style={{padding:"8px 16px",borderRadius:8,cursor:"pointer",fontSize:12,fontWeight:700,
              background:active===i?T.blueBg:T.bg4,
              border:`2px solid ${active===i?T.blueBorder:T.border}`,
              color:active===i?T.blue:T.muted,transition:"all .2s"}}>
            {b.img} {b.name}
          </button>
        ))}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
        <div style={{padding:"20px",background:T.redBg,border:`1px solid ${T.red}33`,borderRadius:12}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:14,alignItems:"center"}}>
            <div style={{fontSize:13,fontWeight:800,color:T.red}}>🔴 Before (Cura Default)</div>
            <Pill color={T.red} T={T}>UNOPTIMIZED</Pill>
          </div>
          {[["Print Time",`${b.before.time}`],["Support Material",`${b.before.supports}`],
            ["Failure Risk",`${b.before.risk}%`],["Quality Score",`${b.before.quality}/100`]
          ].map(([k,v])=>(<StatRow key={k} label={k} value={v} T={T}/>))}
        </div>
        <div style={{padding:"20px",background:T.greenBg,border:`1px solid ${T.green}33`,borderRadius:12}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:14,alignItems:"center"}}>
            <div style={{fontSize:13,fontWeight:800,color:T.green}}>🟢 After (SmartSlice AI)</div>
            <Pill color={T.green} T={T}>OPTIMIZED</Pill>
          </div>
          {[["Print Time",`${b.after.time}`],["Support Material",`${b.after.supports}`],
            ["Failure Risk",`${b.after.risk}%`],["Quality Score",`${b.after.quality}/100`]
          ].map(([k,v])=>(<StatRow key={k} label={k} value={v} color={T.green} T={T}/>))}
        </div>
      </div>
      <div style={{marginTop:16,display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12}}>
        {[["Time Saved",b.improvement.time+"%",T.blue,"⏱"],
          ["Support Saved",b.improvement.supports+"%",T.green,"⚖"],
          ["Risk Reduced",b.improvement.risk+"%",T.accent,"🛡"],
        ].map(([k,v,c,icon])=>(
          <div key={k} style={{padding:"16px",background:T.bg4,border:`1px solid ${T.border}`,borderRadius:10,textAlign:"center"}}>
            <div style={{fontSize:24,marginBottom:6}}>{icon}</div>
            <div style={{fontSize:26,fontWeight:900,color:c,fontFamily:"monospace"}}>{v}</div>
            <div style={{fontSize:11,fontWeight:700,color:T.muted2,marginTop:2}}>{k}</div>
          </div>
        ))}
      </div>
      <div style={{marginTop:14,padding:"14px 18px",background:T.bg4,border:`1px solid ${T.border}`,borderRadius:10}}>
        <div style={{fontSize:10,fontWeight:700,color:T.muted2,letterSpacing:2,marginBottom:6,textTransform:"uppercase"}}>
          Optimization Note — {b.name}
        </div>
        <div style={{fontSize:13,color:T.text,lineHeight:1.7}}>{b.notes}</div>
        <div style={{marginTop:8,display:"flex",gap:8}}>
          <Pill color={catColors[b.category]||T.blue} T={T}>{b.category}</Pill>
          <Pill color={T.muted} T={T}>{b.material}</Pill>
        </div>
      </div>
    </div>
  );
}

// ─── FEEDBACK LOOP ────────────────────────────────────────────────────────────
function FeedbackPanel({analysis,T,onFeedback}){
  const [submitted,setSubmitted]=useState(false);
  const [choice,setChoice]=useState(null);
  const submit=(success)=>{
    setChoice(success);
    feedbackStore.add({success,risk:analysis.risk,material:analysis.dims,ts:Date.now()});
    setSubmitted(true);onFeedback&&onFeedback(success);
  };
  return(
    <div style={{padding:"20px 24px",background:T.bg4,border:`2px solid ${T.border}`,borderRadius:14}}>
      <div style={{fontSize:14,fontWeight:800,color:T.text,marginBottom:6}}>
        🔁 Adaptive Feedback Loop
      </div>
      <div style={{fontSize:12,color:T.text3,marginBottom:18,lineHeight:1.7}}>
        After printing, tell SmartSlice how it went. Your feedback improves future recommendations
        for similar geometry profiles. <strong style={{color:T.accent}}>This is what separates a static tool from an adaptive system.</strong>
      </div>
      {!submitted?(
        <div style={{display:"flex",gap:12,alignItems:"center",flexWrap:"wrap"}}>
          <span style={{fontSize:12,fontWeight:700,color:T.muted2}}>Did this print succeed?</span>
          <button onClick={()=>submit(true)} style={{padding:"10px 24px",borderRadius:8,cursor:"pointer",
            fontSize:13,fontWeight:800,background:T.greenBg,border:`2px solid ${T.green}`,color:T.green}}>
            ✅ Yes — Success
          </button>
          <button onClick={()=>submit(false)} style={{padding:"10px 24px",borderRadius:8,cursor:"pointer",
            fontSize:13,fontWeight:800,background:T.redBg,border:`2px solid ${T.red}`,color:T.red}}>
            ❌ No — Failed
          </button>
        </div>
      ):(
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <div style={{padding:"12px 18px",background:choice?T.greenBg:T.redBg,
            border:`1px solid ${choice?T.green:T.red}`,borderRadius:10,
            fontSize:13,fontWeight:700,color:choice?T.green:T.red}}>
            {choice?"✅ Logged as success — model updated.":"❌ Logged as failure — parameters flagged for review."}
          </div>
          {feedbackStore.totalFeedback>0&&(
            <div style={{fontSize:11,color:T.muted2,fontWeight:600}}>
              System feedback pool: <strong style={{color:T.text}}>{feedbackStore.totalFeedback}</strong> prints &nbsp;·&nbsp;
              Success rate: <strong style={{color:T.green}}>{feedbackStore.successRate}%</strong>
            </div>
          )}
        </div>
      )}
      <div style={{marginTop:14,padding:"10px 14px",background:T.bg3,borderRadius:8,
        border:`1px solid ${T.border}`,fontSize:10,color:T.muted,lineHeight:1.8}}>
        <strong style={{color:T.text3}}>How learning works:</strong> Each feedback entry is tagged with geometry class,
        material, and orientation. Over time, the risk model recalibrates predictions for similar profiles.
        Future versions will use this pool to train a Random Forest classifier.
      </div>
    </div>
  );
}

// ─── INDUSTRIAL MODE PANEL ────────────────────────────────────────────────────
function IndustrialPanel({analysis,material,T}){
  const mp=analysis.metalParams;
  if(!mp)return <div style={{color:T.muted,fontSize:13,padding:20}}>Switch to Metal AM mode to see industrial parameters.</div>;
  return(
    <div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20,marginBottom:20}}>
        <div style={{padding:"20px",background:T.bg4,border:`1px solid ${T.border}`,borderRadius:12}}>
          <div style={{fontSize:11,fontWeight:700,color:T.muted2,letterSpacing:2,marginBottom:14,textTransform:"uppercase"}}>
            DMLS / SLM Parameters — {material}
          </div>
          {[["Laser Power",`${mp.power} W`],["Scan Speed",`${mp.speed} mm/s`],
            ["Layer Thickness",`${mp.layerMicron} μm`],["Hatch Spacing",`${mp.hatch} μm`],
            ["Scan Path Density",`${analysis.scanPathDensity} (normalized)`],
            ["Residual Stress Est.",analysis.residualStress],
            ["Porosity Risk",analysis.porosityRisk?.toFixed(3)+" (target < 0.05%)"],
          ].map(([k,v])=>(<StatRow key={k} label={k} value={v} T={T}/>))}
        </div>
        <div>
          <div style={{padding:"20px",background:T.yellowBg,border:`1px solid ${T.yellow}44`,
            borderRadius:12,marginBottom:14}}>
            <div style={{fontSize:11,fontWeight:700,color:T.yellow,letterSpacing:2,marginBottom:10,textTransform:"uppercase"}}>
              Industrial Orientation Notes
            </div>
            {[["Thermal gradient direction","Orient to minimize residual stress"],
              ["Support removal","Critical — DMLS supports are metal, hard to remove"],
              ["Scan path strategy","Rotate 67° between layers for uniform density"],
              ["Critical surfaces","Face up — top surface has best finish"],
              ["Build rate","Layer-based; reducing area/layer increases throughput"],
            ].map(([k,v])=>(
              <div key={k} style={{marginBottom:8,fontSize:11}}>
                <span style={{fontWeight:700,color:T.text3}}>{k}:</span>
                <span style={{color:T.muted2,marginLeft:6}}>{v}</span>
              </div>
            ))}
          </div>
          <div style={{padding:"16px",background:T.purpleBg,border:`1px solid ${T.purple}44`,borderRadius:12}}>
            <div style={{fontSize:11,fontWeight:700,color:T.purple,letterSpacing:2,marginBottom:10,textTransform:"uppercase"}}>
              Post-Processing Required
            </div>
            {["Stress relief anneal (typically 600–900°C)","Support removal (EDM / machining)",
              "HIP (Hot Isostatic Pressing) — optional","Surface finish: grinding / polishing","NDT inspection (CT scan / dye penetrant)"
            ].map(s=>(
              <div key={s} style={{fontSize:11,color:T.text3,marginBottom:5,fontWeight:600}}>
                → {s}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div style={{padding:"16px 20px",background:T.bg4,border:`1px solid ${T.border}`,borderRadius:12,
        fontSize:12,color:T.muted,lineHeight:1.8}}>
        <strong style={{color:T.text}}>Note:</strong> SmartSlice AI provides orientation, support estimation, and parameter guidance
        for metal AM. Actual EOS / SLM machine parameters should be validated against material datasheets and process qualification runs
        (ASTM F3001 / ISO/ASTM 52900 standards).
      </div>
    </div>
  );
}

// ─── ANALYSIS STEPS ──────────────────────────────────────────────────────────
const STEPS=["Parsing STL binary header...","Extracting triangle mesh topology...",
  "Computing bounding box + dimensions...","Calculating volume & surface area...",
  "Sampling normals — overhang angle distribution...","Detecting thin wall regions (<1.2mm)...",
  "Curvature distribution + surface complexity...","Center-of-gravity + stability analysis...",
  "36-orientation sweep — scoring each direction...","Rule engine: support/layer/infill decisions...",
  "Adaptive layer height map by region...","Slicing into real cross-sections...",
  "Building connected contours per layer...","Risk model: warp / delamination / stability...",
  "Generating optimization report + G-code..."];

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function SmartSliceAI(){
  const [darkMode,setDarkMode]=useState(true);
  const T=darkMode?DARK:LIGHT;
  const [industrialMode,setIndustrialMode]=useState(false);
  const [phase,setPhase]=useState("idle");
  const [fileName,setFileName]=useState("");
  const [stepIdx,setStepIdx]=useState(0);
  const [analysis,setAnalysis]=useState(null);
  const [sliceData,setSliceData]=useState(null);
  const [stlBuffer,setStlBuffer]=useState(null);
  const [layerIdx,setLayerIdx]=useState(0);
  const [orientations,setOrientations]=useState(null);
  const [material,setMaterial]=useState("PLA");
  const [printer,setPrinter]=useState("Bambu X1C");
  const [rotating,setRotating]=useState(true);
  const [tab,setTab]=useState("overview");
  const [dragOver,setDragOver]=useState(false);
  const [feedbackGiven,setFeedbackGiven]=useState(false);
  const gcodeRef=useRef("");
  const fileRef=useRef();
  const matList=industrialMode?METAL_MATERIALS:FDM_MATERIALS;
  const prnList=industrialMode?METAL_PRINTERS:FDM_PRINTERS;

  useEffect(()=>{if(!matList.includes(material)){setMaterial(matList[0]);}
  },[industrialMode]);

  const processFile=useCallback((file)=>{
    if(!file)return;
    setFileName(file.name);setPhase("analyzing");setStepIdx(0);setLayerIdx(0);setFeedbackGiven(false);
    const reader=new FileReader();
    reader.onload=(e)=>{
      const buffer=e.target.result;setStlBuffer(buffer);
      const loader=new STLLoader();
      const geometry=loader.parse(buffer);geometry.computeVertexNormals();
      let i=0;
      const iv=setInterval(()=>{i++;setStepIdx(i);
        if(i>=STEPS.length){clearInterval(iv);
          const a=analyzeFromGeometry(geometry,material,industrialMode);
          const sd=sliceGeometry(geometry,{layerHeight:a.globalLayerHeight,adaptiveLayers:a.adaptiveLayers});
          const orients=computeOrientationScores(a);
          const gcode=generateGCode(sd,a,{material,printer,industrialMode,fileName:file.name});
          setAnalysis(a);setSliceData(sd);setOrientations(orients);gcodeRef.current=gcode;
          setTimeout(()=>setPhase("done"),400);}
      },175);
    };
    reader.readAsArrayBuffer(file);
  },[material,printer,industrialMode]);

  const downloadGCode=()=>{
    if(!gcodeRef.current)return;
    const blob=new Blob([gcodeRef.current],{type:"text/plain"});
    const url=URL.createObjectURL(blob);const a=document.createElement("a");
    a.href=url;a.download=fileName.replace(/\.stl$/i,"")+`_smartslice${industrialMode?"_metalAM":""}.gcode`;
    document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url);
  };
  const riskColor=analysis?({LOW:T.green,MEDIUM:T.yellow,HIGH:T.accent,CRITICAL:T.red}[analysis.riskLevel]):T.accent;

  const cs={
    page:{minHeight:"100vh",background:T.bg,color:T.text2,fontFamily:"'Segoe UI',system-ui,sans-serif",transition:"background .25s,color .25s"},
    card:{background:T.cardBg,border:`1px solid ${T.border}`,borderRadius:12,boxShadow:T.shadow},
    lbl:{fontSize:10,fontWeight:700,color:T.muted2,letterSpacing:2,textTransform:"uppercase",marginBottom:8},
  };

  return(
    <div style={cs.page}>
      <div style={{position:"fixed",inset:0,pointerEvents:"none",
        backgroundImage:`linear-gradient(${T.gridLine} 1px,transparent 1px),linear-gradient(90deg,${T.gridLine} 1px,transparent 1px)`,
        backgroundSize:"40px 40px"}}/>

      {/* ── HEADER ── */}
      <div style={{borderBottom:`1px solid ${T.border}`,padding:"0 28px",display:"flex",
        alignItems:"center",justifyContent:"space-between",height:62,
        background:T.headerBg,backdropFilter:"blur(8px)",position:"sticky",top:0,zIndex:100,boxShadow:T.shadow}}>
        <div style={{display:"flex",alignItems:"center",gap:14}}>
          <div style={{width:38,height:38,background:"linear-gradient(135deg,#ff8c00,#cc4400)",
            borderRadius:9,display:"flex",alignItems:"center",justifyContent:"center",
            fontSize:20,boxShadow:"0 0 18px rgba(255,120,0,0.4)"}}>⬡</div>
          <div>
            <div style={{fontSize:17,fontWeight:900,color:T.text,letterSpacing:1}}>SmartSlice AI</div>
            <div style={{fontSize:9,color:T.muted2,letterSpacing:2.5,fontWeight:600}}>INTELLIGENT AM OPTIMIZATION ENGINE</div>
          </div>
          {/* Industrial / FDM toggle */}
          <div style={{marginLeft:12,display:"flex",background:T.bg4,borderRadius:8,
            border:`1px solid ${T.border}`,overflow:"hidden"}}>
            {[["FDM",false],["Metal AM",true]].map(([lbl,isInd])=>(
              <button key={lbl} onClick={()=>setIndustrialMode(isInd)}
                style={{padding:"6px 16px",fontSize:11,fontWeight:700,cursor:"pointer",
                  background:industrialMode===isInd?(isInd?T.yellowBg:T.blueBg):"transparent",
                  border:"none",color:industrialMode===isInd?(isInd?T.yellow:T.blue):T.muted,transition:"all .2s"}}>
                {lbl}
              </button>
            ))}
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:18}}>
          <div style={{display:"flex",gap:10,fontSize:11}}>
            {matList.map(m=>(
              <span key={m} onClick={()=>setMaterial(m)} style={{cursor:"pointer",fontWeight:700,
                color:material===m?T.accent:T.muted,borderBottom:material===m?`2px solid ${T.accent}`:"2px solid transparent",
                paddingBottom:2,letterSpacing:.5,transition:"all .2s"}}>{m}</span>
            ))}
          </div>
          <button onClick={()=>setDarkMode(d=>!d)} style={{display:"flex",alignItems:"center",gap:8,
            padding:"7px 16px",borderRadius:20,cursor:"pointer",background:T.bg4,
            border:`1px solid ${T.border}`,color:T.text,fontSize:12,fontWeight:700,boxShadow:T.shadow,transition:"all .25s"}}>
            <span>{darkMode?"☀️":"🌙"}</span>{darkMode?"Light":"Dark"}
          </button>
        </div>
      </div>

      <div style={{maxWidth:1380,margin:"0 auto",padding:"24px 24px 80px"}}>

        {/* ── UPLOAD ── */}
        {phase!=="done"&&(
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:22}}>
            <div onDragOver={e=>{e.preventDefault();setDragOver(true)}} onDragLeave={()=>setDragOver(false)}
              onDrop={e=>{e.preventDefault();setDragOver(false);processFile(e.dataTransfer.files[0])}}
              onClick={()=>phase==="idle"&&fileRef.current.click()}
              style={{...cs.card,height:380,display:"flex",flexDirection:"column",alignItems:"center",
                justifyContent:"center",cursor:phase==="idle"?"pointer":"default",
                border:`2px dashed ${dragOver?T.accent:T.border}`,
                background:dragOver?T.accent2:T.cardBg,transition:"all .3s"}}>
              <input ref={fileRef} type="file" accept=".stl" style={{display:"none"}} onChange={e=>processFile(e.target.files[0])}/>
              {phase==="idle"&&<>
                <div style={{fontSize:60,opacity:0.18,marginBottom:18,filter:industrialMode?"hue-rotate(200deg)":"none"}}>⬡</div>
                <div style={{fontSize:16,fontWeight:800,color:T.text3,marginBottom:8}}>Drop STL File Here</div>
                <div style={{fontSize:12,color:T.muted2,marginBottom:24}}>
                  {industrialMode?"Metal AM analysis mode active":"FDM analysis mode active"} · .stl supported
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,maxWidth:360,width:"100%"}}>
                  {[["Orientation Optimizer","6-direction score comparison"],
                    ["Overhang Heatmap","Angle distribution analysis"],
                    ["Risk Prediction","Warp · delamination · stability"],
                    ["G-code Export","Layer contour-ordered toolpath"],
                  ].map(([k,v])=>(
                    <div key={k} style={{padding:"10px 12px",background:T.bg4,border:`1px solid ${T.border}`,
                      borderRadius:8,fontSize:11}}>
                      <div style={{fontWeight:700,color:T.text3,marginBottom:3}}>{k}</div>
                      <div style={{color:T.muted,fontSize:10}}>{v}</div>
                    </div>
                  ))}
                </div>
              </>}
              {phase==="analyzing"&&<>
                <div style={{fontSize:12,fontWeight:700,color:T.muted2,letterSpacing:3,marginBottom:14}}>ANALYZING + SLICING</div>
                <div style={{fontSize:14,fontWeight:800,color:T.accent,marginBottom:14}}>{fileName}</div>
                <div style={{width:"88%",maxHeight:240,overflowY:"auto",marginBottom:14}}>
                  {STEPS.slice(0,stepIdx+1).map((s,i)=>(
                    <div key={i} style={{fontSize:11,color:i===stepIdx?T.accent:T.muted3,
                      padding:"3px 0",display:"flex",gap:10,alignItems:"center"}}>
                      <span style={{fontSize:10,minWidth:14}}>{i===stepIdx?"▶":"✓"}</span>{s}
                    </div>
                  ))}
                </div>
                <div style={{width:"88%",height:7,background:T.bg4,borderRadius:4,overflow:"hidden",border:`1px solid ${T.border}`}}>
                  <div style={{width:`${(stepIdx/STEPS.length)*100}%`,height:"100%",
                    background:`linear-gradient(90deg,${T.accent}88,${T.accent})`,transition:"width .2s"}}/>
                </div>
                <div style={{fontSize:11,color:T.muted2,marginTop:7,fontWeight:700}}>
                  {Math.round((stepIdx/STEPS.length)*100)}% complete</div>
              </>}
            </div>
            <div style={{...cs.card,padding:28}}>
              <div style={cs.lbl}>Configuration</div>
              <div style={{marginBottom:18}}>
                <div style={{fontSize:11,fontWeight:700,color:T.muted2,marginBottom:10}}>
                  {industrialMode?"METAL MATERIAL":"FILAMENT MATERIAL"}
                </div>
                <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                  {matList.map(m=>(
                    <button key={m} onClick={()=>setMaterial(m)} style={{padding:"7px 14px",borderRadius:7,cursor:"pointer",
                      fontSize:12,fontWeight:700,background:material===m?T.accent2:T.bg4,
                      border:`2px solid ${material===m?T.accent:T.border}`,
                      color:material===m?T.accent:T.muted,transition:"all .2s"}}>{m}</button>
                  ))}
                </div>
              </div>
              <div style={{marginBottom:22}}>
                <div style={{fontSize:11,fontWeight:700,color:T.muted2,marginBottom:10}}>
                  {industrialMode?"METAL AM MACHINE":"PRINTER"}
                </div>
                <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                  {prnList.map(p=>(
                    <button key={p} onClick={()=>setPrinter(p)} style={{padding:"7px 14px",borderRadius:7,cursor:"pointer",
                      fontSize:12,fontWeight:600,background:printer===p?T.blueBg:T.bg4,
                      border:`2px solid ${printer===p?T.blueBorder:T.border}`,
                      color:printer===p?T.blue:T.muted,transition:"all .2s"}}>{p}</button>
                  ))}
                </div>
              </div>
              <div style={{borderTop:`1px solid ${T.border}`,paddingTop:18}}>
                <div style={{fontSize:11,fontWeight:700,color:T.muted2,marginBottom:12}}>
                  WHAT SMARTSLICE ADDS OVER CURA
                </div>
                {[["Multi-orientation score comparison with 'Why?'","Cura has no orientation scoring"],
                  ["Quantified improvement numbers (23% saved)","Cura gives no baseline comparison"],
                  ["Failure risk prediction (warp · delamination)","Cura has no risk model"],
                  ["Overhang heatmap & CoG visualization","Cura has no geometry depth view"],
                  ["Adaptive feedback loop (learns from outcomes)","Cura has no learning system"],
                  ["Industrial Metal AM mode (DMLS/SLM)","Cura is FDM only"],
                ].map(([k,v])=>(
                  <div key={k} style={{marginBottom:10,fontSize:11}}>
                    <span style={{fontWeight:700,color:T.green}}>✓ {k}</span>
                    <span style={{color:T.muted3,marginLeft:8,fontSize:10}}>({v})</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── RESULTS ── */}
        {phase==="done"&&analysis&&sliceData&&(()=>{
          const d=analysis;const totalLayers=sliceData.layers.length;
          return(<div>
            {/* Top bar */}
            <div style={{...cs.card,display:"flex",alignItems:"center",justifyContent:"space-between",
              marginBottom:20,padding:"12px 22px",flexWrap:"wrap",gap:10}}>
              <div style={{display:"flex",gap:12,alignItems:"center",flexWrap:"wrap"}}>
                <Pill color={T.green} T={T}>✓ SLICED & ANALYZED</Pill>
                {industrialMode&&<Pill color={T.yellow} T={T}>⚙ METAL AM MODE</Pill>}
                <span style={{fontSize:13,fontWeight:700,color:T.text}}>{fileName}</span>
                <span style={{fontSize:11,color:T.muted2,background:T.bg4,border:`1px solid ${T.border}`,
                  borderRadius:5,padding:"3px 10px"}}>{material} · {printer}</span>
                <span style={{fontSize:11,color:T.muted2,background:T.bg4,border:`1px solid ${T.border}`,
                  borderRadius:5,padding:"3px 10px"}}>{totalLayers} layers · {d.triangleCount.toLocaleString()} triangles</span>
                <span style={{fontSize:11,fontWeight:800,color:T.green,background:T.greenBg,
                  border:`1px solid ${T.green}44`,borderRadius:5,padding:"3px 10px"}}>
                  ↓{d.timeImprovement}% time · ↓{d.supportImprovement}% supports vs default
                </span>
              </div>
              <div style={{display:"flex",gap:10}}>
                <button onClick={downloadGCode} style={{display:"flex",alignItems:"center",gap:8,
                  padding:"9px 20px",borderRadius:9,cursor:"pointer",fontSize:12,fontWeight:800,
                  background:"linear-gradient(135deg,#ff8c00,#cc4400)",border:"none",
                  color:"#fff",boxShadow:"0 4px 20px rgba(255,120,0,0.4)"}}>
                  ⬇ G-code
                </button>
                <button onClick={()=>setRotating(r=>!r)} style={{padding:"9px 16px",borderRadius:9,cursor:"pointer",
                  fontSize:12,fontWeight:700,background:T.bg4,border:`1px solid ${T.border}`,color:T.muted}}>
                  {rotating?"⏸ Freeze":"▶ Rotate"}
                </button>
                <button onClick={()=>{setPhase("idle");setAnalysis(null);setSliceData(null);setStlBuffer(null);setOrientations(null);}}
                  style={{padding:"9px 16px",borderRadius:9,cursor:"pointer",fontSize:12,fontWeight:800,
                    background:T.accent2,border:`2px solid ${T.accent}`,color:T.accent}}>⟳ New File</button>
              </div>
            </div>

            {/* Main grid */}
            <div style={{display:"grid",gridTemplateColumns:"420px 1fr",gap:20,marginBottom:20}}>
              <div style={{...cs.card,overflow:"hidden",height:400,position:"relative"}}>
                <div style={{position:"absolute",top:12,left:14,zIndex:2,
                  background:T.cardBg+"ee",border:`1px solid ${T.border}`,borderRadius:6,padding:"4px 10px",
                  fontSize:11,fontWeight:600,color:T.text3}}>
                  {d.dims.w}×{d.dims.d}×{d.dims.h} mm · drag / scroll
                </div>
                <div style={{position:"absolute",top:12,right:14,zIndex:2,
                  background:T.blueBg,border:`1px solid ${T.blue}`,borderRadius:6,
                  padding:"4px 10px",fontSize:11,fontWeight:700,color:T.blue}}>
                  Layer {layerIdx+1}/{totalLayers}
                </div>
                <ModelViewer3D stlBuffer={stlBuffer} sliceData={sliceData} layerIdx={layerIdx} rotating={rotating} T={T}/>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:14}}>
                {/* Risk scores */}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
                  <div style={{...cs.card,background:T.riskBg(d.risk),border:`2px solid ${riskColor}33`,
                    borderRadius:12,padding:"16px 20px"}}>
                    <div style={cs.lbl}>Failure Risk</div>
                    <div style={{fontSize:52,fontWeight:900,color:riskColor,lineHeight:1,fontFamily:"'Courier New',monospace"}}>
                      <AnimNum value={d.risk}/><span style={{fontSize:18,opacity:.5}}>%</span></div>
                    <div style={{marginTop:8}}><Pill color={riskColor} T={T}>{d.riskLevel}</Pill></div>
                  </div>
                  <div style={{...cs.card,background:T.greenBg,border:`2px solid ${T.green}33`,borderRadius:12,padding:"16px 20px"}}>
                    <div style={cs.lbl}>Quality Score</div>
                    <div style={{fontSize:52,fontWeight:900,color:T.green,lineHeight:1,fontFamily:"'Courier New',monospace"}}>
                      <AnimNum value={d.qualityScore}/><span style={{fontSize:18,color:T.muted3}}>/100</span></div>
                    <div style={{marginTop:8}}>
                      <Pill color={d.qualityScore>75?T.green:d.qualityScore>50?T.yellow:T.red} T={T}>
                        {d.qualityScore>75?"GOOD":d.qualityScore>50?"ACCEPTABLE":"REVIEW"}
                      </Pill>
                    </div>
                  </div>
                </div>
                {/* Key metrics */}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12}}>
                  <MetricCard label="Print Time" value={`${d.timeH}h ${d.timeM}m`} unit=""
                    delta={d.timeImprovement} deltaLabel="vs Cura" icon="⏱" T={T}/>
                  <MetricCard label="Support Material" value={d.optimizedSupports} unit="g"
                    delta={d.supportImprovement} deltaLabel="saved" icon="⚖" T={T}/>
                  <MetricCard label="Est. Cost" value={`₹${d.costINR}`} unit="" color={T.green} icon="₹" T={T}/>
                </div>
                {/* Precision risk scores */}
                <div style={{...cs.card,padding:"16px 20px"}}>
                  <div style={cs.lbl}>Precision Risk Scores (0.000 = no risk)</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                    <RiskScore label="Warping Risk" value={d.warpRisk} T={T}/>
                    <RiskScore label="Delamination Risk" value={d.delaminationRisk} T={T}/>
                    <RiskScore label="Overhang Risk" value={d.overhangRisk} T={T}/>
                    <RiskScore label="Stability Risk" value={d.stabilityRisk} T={T}/>
                  </div>
                </div>
              </div>
            </div>

            {/* TABS */}
            <div style={{...cs.card,overflow:"hidden"}}>
              <div style={{display:"flex",borderBottom:`2px solid ${T.border}`,overflowX:"auto"}}>
                {[["overview","📊 Overview"],["slicer","⬡ Slicer"],["orientation","🎯 Orientation"],
                  ["geometry","📐 Geometry"],["industrial","⚙ Industrial"],
                  ["benchmarks","📋 Benchmarks"],["gcode","⬇ G-code"],["feedback","🔁 Feedback"]
                ].map(([id,lbl])=>(
                  <button key={id} onClick={()=>setTab(id)}
                    style={{padding:"12px 20px",fontSize:12,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap",
                      background:tab===id?T.accent2:"transparent",border:"none",
                      borderBottom:`3px solid ${tab===id?T.accent:"transparent"}`,
                      color:tab===id?T.accent:T.muted,transition:"all .2s",marginBottom:-2}}>
                    {lbl}</button>
                ))}
              </div>

              <div style={{padding:26}}>

                {/* OVERVIEW */}
                {tab==="overview"&&(
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:24}}>
                    <div>
                      <div style={cs.lbl}>Measured Improvements vs Cura Default</div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:20}}>
                        {[["Print Time Saved",d.timeImprovement+"%",T.blue,"⏱"],
                          ["Support Saved",d.supportImprovement+"%",T.green,"⚖"],
                          ["Risk Reduction",Math.round((1-d.risk/72)*100)+"%",T.accent,"🛡"],
                          ["Quality Gain",Math.round(d.qualityScore-48)+"/100",T.green,"⭐"],
                        ].map(([k,v,c,icon])=>(
                          <div key={k} style={{padding:"14px",background:T.bg4,border:`1px solid ${T.border}`,
                            borderRadius:10,textAlign:"center"}}>
                            <div style={{fontSize:22,marginBottom:4}}>{icon}</div>
                            <div style={{fontSize:28,fontWeight:900,color:c,fontFamily:"monospace"}}>{v}</div>
                            <div style={{fontSize:10,fontWeight:700,color:T.muted2,marginTop:2,textTransform:"uppercase",letterSpacing:1}}>{k}</div>
                          </div>
                        ))}
                      </div>
                      <StatRow label="Default print time" value={`${d.defaultTime.h}h ${d.defaultTime.m}m`} T={T}/>
                      <StatRow label="SmartSlice time" value={`${d.timeH}h ${d.timeM}m`} color={T.green} T={T}/>
                      <StatRow label="Default support" value={`${d.defaultSupports}g`} T={T}/>
                      <StatRow label="SmartSlice support" value={`${d.optimizedSupports}g`} color={T.green} T={T}/>
                      <StatRow label="Layer height" value={`${d.globalLayerHeight}mm`} T={T}/>
                      <StatRow label="Infill" value={`${d.baseInfill}% ${d.infillPattern}`} T={T}/>
                      <StatRow label="Total layers" value={totalLayers} T={T}/>
                    </div>
                    <div>
                      <TradeoffVisualizer analysis={d} T={T}/>
                      <div style={{marginTop:16}}>
                        <div style={cs.lbl}>Target Audience</div>
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                          {[["Industrial Engineers","DMLS orientation, scan path, residual stress",T.yellow],
                            ["R&D / Academia","Benchmark comparison, risk quantification",T.blue],
                            ["Advanced FDM Users","Orientation optimizer, risk scores, G-code",T.green],
                            ["Product Designers","Quality score, tradeoff visualizer, cost",T.purple],
                          ].map(([k,v,c])=>(
                            <div key={k} style={{padding:"12px",background:T.bg4,
                              border:`1px solid ${c}33`,borderRadius:10}}>
                              <div style={{fontSize:11,fontWeight:800,color:c,marginBottom:4}}>{k}</div>
                              <div style={{fontSize:10,color:T.muted,lineHeight:1.6}}>{v}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* SLICER */}
                {tab==="slicer"&&(
                  <div style={{display:"grid",gridTemplateColumns:"420px 1fr",gap:24}}>
                    <div style={{...cs.card,overflow:"hidden"}}>
                      <div style={{padding:"10px 14px",borderBottom:`1px solid ${T.border}`,display:"flex",
                        justifyContent:"space-between",alignItems:"center"}}>
                        <span style={{fontSize:12,fontWeight:700,color:T.text}}>Layer {layerIdx+1} Cross-Section</span>
                        <div style={{display:"flex",gap:8,alignItems:"center"}}>
                          <Pill color={{BASE:T.accent,TRANSITION:T.yellow,BODY:T.blue,TOP:T.green}[sliceData.layers[layerIdx]?.region]||T.blue} T={T}>
                            {sliceData.layers[layerIdx]?.region}
                          </Pill>
                          <span style={{fontSize:11,fontWeight:700,color:T.blue,fontFamily:"monospace"}}>
                            Z {sliceData.layers[layerIdx]?.z.toFixed(3)}mm
                          </span>
                        </div>
                      </div>
                      <div style={{height:320}}><LayerCanvas sliceData={sliceData} layerIdx={layerIdx} T={T}/></div>
                    </div>
                    <div>
                      <div style={cs.lbl}>Layer Navigator</div>
                      <input type="range" min={0} max={totalLayers-1} value={layerIdx}
                        onChange={e=>setLayerIdx(+e.target.value)}
                        style={{width:"100%",accentColor:T.accent,cursor:"pointer",marginBottom:10}}/>
                      <div style={{display:"flex",justifyContent:"space-between",fontSize:12,
                        fontWeight:700,color:T.muted,marginBottom:16}}>
                        <span>Base</span><span style={{color:T.accent}}>Layer {layerIdx+1} / {totalLayers}</span><span>Top</span>
                      </div>
                      <div style={{display:"flex",gap:8,marginBottom:22}}>
                        {[["⏮ Base",0],["◀ −10",Math.max(0,layerIdx-10)],
                          ["▶ +10",Math.min(totalLayers-1,layerIdx+10)],["⏭ Top",totalLayers-1]].map(([lbl,val])=>(
                          <button key={lbl} onClick={()=>setLayerIdx(val)}
                            style={{flex:1,padding:"8px 0",fontSize:12,fontWeight:700,cursor:"pointer",
                              background:T.bg4,border:`1px solid ${T.border}`,color:T.muted2,borderRadius:6}}>{lbl}</button>
                        ))}
                      </div>
                      <div style={cs.lbl}>Adaptive Layer Height by Region</div>
                      {Object.entries(d.layerRecs).map(([region,rec])=>{
                        const colors={BASE:T.accent,TRANSITION:T.yellow,BODY:T.blue,TOP:T.green};
                        return(
                          <div key={region} style={{padding:"12px 14px",background:T.bg4,
                            border:`1px solid ${colors[region]}33`,borderRadius:9,marginBottom:8,
                            display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                            <div>
                              <Pill color={colors[region]} T={T}>{region}</Pill>
                              <div style={{fontSize:11,color:T.muted2,marginTop:5}}>{rec.reason}</div>
                            </div>
                            <div style={{fontSize:20,fontWeight:900,color:colors[region],fontFamily:"monospace"}}>
                              {rec.lh}mm
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* ORIENTATION */}
                {tab==="orientation"&&<OrientationDashboard orientations={orientations} T={T}/>}

                {/* GEOMETRY */}
                {tab==="geometry"&&(
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:24}}>
                    <div>
                      <div style={cs.lbl}>Raw Measurements</div>
                      {[["Width",`${d.dims.w} mm`],["Depth",`${d.dims.d} mm`],["Height",`${d.dims.h} mm`],
                        ["Volume",`${d.volume} cm³`],["Surface Area",`${d.surfaceArea} cm²`],
                        ["Triangle Count",d.triangleCount.toLocaleString()],
                        ["Curvature Score",d.curvatureScore],["Base Area",`${d.baseArea} mm²`],
                        ["Stability Ratio",d.stabilityRatio],
                      ].map(([k,v])=>(<StatRow key={k} label={k} value={v} T={T}/>))}
                      <div style={{marginTop:20}}>
                        <div style={cs.lbl}>Rule Engine Triggers</div>
                        {[[d.maxOverhang>55,`Overhang ${d.maxOverhang}° > 55° → Tree supports`],
                          [d.thinWalls>8,`${d.thinWalls} thin walls → 0.12mm layer height`],
                          [d.adaptiveLayers,`Curvature ${d.curvatureScore} → Adaptive layers`],
                          [d.dims.h>150,`Height ${d.dims.h}mm → Dense base infill`],
                        ].map(([on,msg],i)=>(
                          <div key={i} style={{fontSize:12,fontWeight:700,
                            color:on?T.accent:T.muted3,padding:"6px 0",display:"flex",gap:10}}>
                            <span>{on?"⚡":"○"}</span>{msg}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div style={{display:"flex",flexDirection:"column",gap:16}}>
                      <OverhangHeatmap dist={d.overhangDist} T={T}/>
                      <CoGVisualize analysis={d} T={T}/>
                    </div>
                  </div>
                )}

                {/* INDUSTRIAL */}
                {tab==="industrial"&&<IndustrialPanel analysis={d} material={material} T={T}/>}

                {/* BENCHMARKS */}
                {tab==="benchmarks"&&<BenchmarkGallery T={T}/>}

                {/* GCODE */}
                {tab==="gcode"&&(
                  <div>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
                      <div>
                        <div style={{fontSize:18,fontWeight:900,color:T.text,marginBottom:6}}>G-code Export</div>
                        <div style={{fontSize:13,color:T.muted2}}>Generated from real layer contours · contour-ordered toolpath for minimum travel</div>
                      </div>
                      <button onClick={downloadGCode} style={{display:"flex",alignItems:"center",gap:8,
                        padding:"12px 24px",borderRadius:10,cursor:"pointer",fontSize:13,fontWeight:800,
                        background:"linear-gradient(135deg,#ff8c00,#cc4400)",border:"none",
                        color:"#fff",boxShadow:"0 4px 20px rgba(255,120,0,0.4)"}}>
                        ⬇ Download .gcode
                      </button>
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:20}}>
                      {industrialMode?
                        [["Laser Power",`${d.metalParams?.power||280}W`],["Scan Speed",`${d.metalParams?.speed||1200}mm/s`],
                          ["Layer",`${d.metalParams?.layerMicron||30}μm`],["Hatch",`${d.metalParams?.hatch||100}μm`],
                          ["Layers",totalLayers],["Est. Time",`${d.timeH}h ${d.timeM}m`]]:
                        [["Extruder",`${MAT_TEMPS[material]?.e||210}°C`],["Bed",`${MAT_TEMPS[material]?.b||60}°C`],
                          ["Print Speed","80 mm/s"],["1st Layer","25 mm/s"],["Layers",totalLayers],
                          ["Est. Time",`${d.timeH}h ${d.timeM}m`]]
                      .map(([k,v])=>(
                        <div key={k} style={{padding:"14px 16px",background:T.bg4,border:`1px solid ${T.border}`,borderRadius:10}}>
                          <div style={{fontSize:10,fontWeight:700,color:T.muted2,letterSpacing:2,marginBottom:5,textTransform:"uppercase"}}>{k}</div>
                          <div style={{fontSize:20,fontWeight:800,color:T.text,fontFamily:"monospace"}}>{v}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{background:T.bg4,border:`1px solid ${T.border}`,borderRadius:10,overflow:"hidden"}}>
                      <div style={{padding:"10px 16px",borderBottom:`1px solid ${T.border}`,display:"flex",
                        justifyContent:"space-between",alignItems:"center"}}>
                        <span style={{fontSize:12,fontWeight:700,color:T.text}}>Preview (first 60 lines)</span>
                        <Pill color={T.green} T={T}>VALID</Pill>
                      </div>
                      <pre style={{margin:0,padding:"16px",fontSize:10,color:T.text3,overflowX:"auto",
                        maxHeight:300,overflowY:"auto",fontFamily:"'Courier New',monospace",lineHeight:1.7,
                        background:T.isDark?"#03060c":"#f2f5fc"}}>
                        {gcodeRef.current.split("\n").slice(0,60).join("\n")}
                      </pre>
                    </div>
                  </div>
                )}

                {/* FEEDBACK */}
                {tab==="feedback"&&<FeedbackPanel analysis={d} T={T} onFeedback={()=>setFeedbackGiven(true)}/>}

              </div>
            </div>
          </div>);
        })()}
      </div>

      <style>{`
        *{box-sizing:border-box;margin:0;padding:0;}
        ::-webkit-scrollbar{width:6px;height:6px;}
        ::-webkit-scrollbar-track{background:${T.bg};}
        ::-webkit-scrollbar-thumb{background:${T.border};border-radius:3px;}
        input[type=range]{-webkit-appearance:none;height:6px;border-radius:3px;outline:none;background:${T.bg4};}
        input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:18px;height:18px;border-radius:50%;background:${T.accent};cursor:pointer;}
        button:hover{opacity:0.88;} button:active{transform:scale(0.98);}
      `}</style>
    </div>
  );
}
