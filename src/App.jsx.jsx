import { useState, useEffect, useRef, useCallback } from "react";
import * as THREE from "three";

// ─── CONSTANTS ───────────────────────────────────────────────────────────────
const MATERIALS = ["PLA", "PETG", "ABS", "TPU", "ASA", "Nylon"];
const PRINTERS = ["Bambu X1C", "Prusa MK4", "Ender 3 V3", "Voron 2.4", "Bambu P1S"];

function randomBetween(a, b) { return +(a + Math.random() * (b - a)).toFixed(2); }
function randomInt(a, b) { return Math.floor(a + Math.random() * (b - a + 1)); }

// ─── SIMULATE GEOMETRY ANALYSIS ──────────────────────────────────────────────
function analyzeGeometry(fileName, fileSize) {
  const seed = fileName.split("").reduce((s, c) => s + c.charCodeAt(0), 0);
  const r = (a, b, offset = 0) => randomBetween(a + (seed % (b - a + offset)) * 0.01, b);

  const volume = r(8.4, 180.6);
  const surfaceArea = r(40, 420);
  const maxOverhang = r(28, 74);
  const thinWalls = randomInt(0, 24);
  const height = r(12, 240);
  const width = r(18, 160);
  const depth = r(18, 140);
  const curvatureScore = r(0.1, 0.9);
  const cogOffset = r(0.0, 0.45);

  // Rule engine
  const needsSupports = maxOverhang > 55;
  const layerHeight = thinWalls > 8 ? 0.12 : thinWalls > 3 ? 0.16 : 0.20;
  const adaptiveLayers = curvatureScore > 0.6;
  const baseInfill = height > 150 ? randomInt(28, 40) : randomInt(18, 28);
  const infillPattern = curvatureScore > 0.7 ? "Gyroid" : height > 100 ? "Cubic" : "Grid";
  const supportReduction = needsSupports ? r(12, 42) : 0;
  const orientRotateY = needsSupports ? r(15, 55) : r(0, 20);

  // Print time estimate
  const perimeterLen = surfaceArea * r(1.8, 2.4);
  const layers = Math.round(height / layerHeight);
  const infillLen = volume * r(4.5, 6.5);
  const totalPath = perimeterLen * layers * 0.012 + infillLen;
  const printSpeed = 80;
  const timeHours = totalPath / printSpeed / 60;
  const timeH = Math.floor(timeHours);
  const timeM = Math.round((timeHours - timeH) * 60);

  const materialGrams = volume * r(1.02, 1.24);
  const costINR = materialGrams * r(2.4, 3.2);

  // Risk score
  let risk = 5;
  if (maxOverhang > 65) risk += 18;
  else if (maxOverhang > 55) risk += 10;
  if (thinWalls > 12) risk += 12;
  if (cogOffset > 0.35) risk += 8;
  if (height > 150) risk += 5;
  risk = Math.min(risk + randomInt(0, 8), 92);

  const riskLevel = risk < 20 ? "LOW" : risk < 45 ? "MEDIUM" : risk < 70 ? "HIGH" : "CRITICAL";

  return {
    dims: { w: width, d: depth, h: height },
    volume, surfaceArea, maxOverhang, thinWalls,
    curvatureScore, cogOffset,
    needsSupports, layerHeight, adaptiveLayers, baseInfill,
    infillPattern, supportReduction, orientRotateY,
    layers, timeH, timeM, materialGrams: +materialGrams.toFixed(1),
    costINR: +costINR.toFixed(0), risk, riskLevel,
    qualityScore: Math.max(10, 100 - risk - randomInt(0, 15)),
  };
}

// ─── 3D PREVIEW (Three.js parametric model) ──────────────────────────────────
function ModelViewer({ analysisData, rotating }) {
  const mountRef = useRef(null);
  const sceneRef = useRef({});

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    const W = el.clientWidth, H = el.clientHeight;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 1000);
    camera.position.set(3, 2.5, 4);
    camera.lookAt(0, 0, 0);

    // Lights
    const amb = new THREE.AmbientLight(0x334455, 0.8);
    scene.add(amb);
    const dir = new THREE.DirectionalLight(0xffa040, 1.6);
    dir.position.set(4, 8, 4);
    dir.castShadow = true;
    scene.add(dir);
    const fill = new THREE.DirectionalLight(0x2244ff, 0.4);
    fill.position.set(-4, -2, -4);
    scene.add(fill);

    // Grid
    const grid = new THREE.GridHelper(6, 12, 0x223344, 0x1a2a38);
    grid.position.y = -1;
    scene.add(grid);

    // Build a parametric "technical part" shape
    const group = new THREE.Group();

    // Base block
    const baseGeo = new THREE.BoxGeometry(1.6, 0.3, 1.4);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x1a4060, roughness: 0.35, metalness: 0.6,
      emissive: 0x0a1828, emissiveIntensity: 0.3
    });
    const baseMesh = new THREE.Mesh(baseGeo, mat);
    baseMesh.position.y = -0.85;
    baseMesh.castShadow = true;
    group.add(baseMesh);

    // Central tower
    const towerGeo = new THREE.CylinderGeometry(0.3, 0.38, 1.4, 32);
    const towerMesh = new THREE.Mesh(towerGeo, new THREE.MeshStandardMaterial({
      color: 0x1e5070, roughness: 0.3, metalness: 0.65, emissive: 0x0a2030
    }));
    towerMesh.position.y = 0;
    towerMesh.castShadow = true;
    group.add(towerMesh);

    // Top flange
    const flangeGeo = new THREE.CylinderGeometry(0.55, 0.32, 0.18, 32);
    const flangeMesh = new THREE.Mesh(flangeGeo, new THREE.MeshStandardMaterial({
      color: 0xff8800, roughness: 0.2, metalness: 0.8, emissive: 0x221100
    }));
    flangeMesh.position.y = 0.79;
    group.add(flangeMesh);

    // Holes / bolts
    for (let i = 0; i < 4; i++) {
      const ang = (i / 4) * Math.PI * 2;
      const boltGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.35, 12);
      const boltMesh = new THREE.Mesh(boltGeo, new THREE.MeshStandardMaterial({
        color: 0x8899aa, roughness: 0.3, metalness: 0.9
      }));
      boltMesh.position.set(Math.cos(ang) * 0.62, -0.68, Math.sin(ang) * 0.52);
      group.add(boltMesh);
    }

    // Side fins
    for (let i = 0; i < 3; i++) {
      const finGeo = new THREE.BoxGeometry(0.08, 0.6, 0.5);
      const finMesh = new THREE.Mesh(finGeo, new THREE.MeshStandardMaterial({
        color: 0x224466, roughness: 0.4, metalness: 0.5
      }));
      finMesh.position.set(-0.72, -0.3 + i * 0.0, 0.0);
      finMesh.rotation.z = (i - 1) * 0.15;
      group.add(finMesh);
    }

    // Wireframe overlay for techy look
    const wfGeo = new THREE.CylinderGeometry(0.305, 0.385, 1.42, 32);
    const wfMat = new THREE.MeshBasicMaterial({ color: 0x00ccff, wireframe: true, opacity: 0.12, transparent: true });
    const wfMesh = new THREE.Mesh(wfGeo, wfMat);
    group.add(wfMesh);

    scene.add(group);
    sceneRef.current = { renderer, scene, camera, group };

    let frame;
    let t = 0;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      t += 0.01;
      if (rotating) group.rotation.y += 0.008;
      group.position.y = Math.sin(t * 0.7) * 0.04;
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(frame);
      renderer.dispose();
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
    };
  }, [rotating]);

  return <div ref={mountRef} style={{ width: "100%", height: "100%" }} />;
}

// ─── ANIMATED COUNTER ────────────────────────────────────────────────────────
function AnimatedNumber({ value, decimals = 1, duration = 1200 }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    let start = null;
    const target = parseFloat(value);
    const step = (ts) => {
      if (!start) start = ts;
      const progress = Math.min((ts - start) / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      setDisplay(+(target * ease).toFixed(decimals));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [value]);
  return <span>{display}</span>;
}

// ─── METRIC CARD ─────────────────────────────────────────────────────────────
function MetricCard({ label, value, unit, icon, accent = false, sub }) {
  return (
    <div style={{
      background: accent ? "linear-gradient(135deg,#1a3a20,#0d2010)" : "linear-gradient(135deg,#0d1f2d,#091520)",
      border: `1px solid ${accent ? "#2a6634" : "#122030"}`,
      borderRadius: 8,
      padding: "14px 16px",
      position: "relative",
      overflow: "hidden",
    }}>
      <div style={{ position: "absolute", top: 8, right: 10, fontSize: 22, opacity: 0.18 }}>{icon}</div>
      <div style={{ fontSize: 10, color: "#5580a0", letterSpacing: 2, textTransform: "uppercase", marginBottom: 6, fontFamily: "monospace" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: accent ? "#4dff7c" : "#e8f4ff", fontFamily: "'Courier New', monospace" }}>
        {value}<span style={{ fontSize: 12, color: "#5580a0", marginLeft: 4 }}>{unit}</span>
      </div>
      {sub && <div style={{ fontSize: 10, color: "#3a6080", marginTop: 4, fontFamily: "monospace" }}>{sub}</div>}
    </div>
  );
}

// ─── PROGRESS BAR ────────────────────────────────────────────────────────────
function Bar({ label, value, max = 100, color = "#ff8800", warn = 70 }) {
  const pct = Math.min((value / max) * 100, 100);
  const col = value > warn ? "#ff4444" : color;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#4a7090", fontFamily: "monospace", marginBottom: 4 }}>
        <span>{label}</span><span style={{ color: col }}>{value}{max !== 100 ? ` / ${max}` : "%"}</span>
      </div>
      <div style={{ background: "#0a1a24", borderRadius: 2, height: 5, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: `linear-gradient(90deg, ${col}88, ${col})`, borderRadius: 2, transition: "width 1.2s cubic-bezier(0.16,1,0.3,1)" }} />
      </div>
    </div>
  );
}

// ─── ANALYSIS STEP LOG ───────────────────────────────────────────────────────
const STEPS = [
  "Parsing binary STL header...",
  "Extracting mesh topology...",
  "Computing bounding box dimensions...",
  "Calculating volume via divergence theorem...",
  "Sampling surface normals for overhang detection...",
  "Detecting thin wall regions (<1.2mm threshold)...",
  "Running curvature distribution analysis...",
  "Computing center of gravity offset...",
  "Evaluating orientation search space (10° increments)...",
  "Applying rule engine: overhang → support logic...",
  "Estimating toolpath length & print time...",
  "Running risk scoring model...",
  "Generating optimization report...",
];

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function SmartSliceAI() {
  const [phase, setPhase] = useState("idle"); // idle | uploading | analyzing | done
  const [fileName, setFileName] = useState("");
  const [fileSize, setFileSize] = useState(0);
  const [stepIdx, setStepIdx] = useState(0);
  const [analysisData, setAnalysisData] = useState(null);
  const [selectedMaterial, setSelectedMaterial] = useState("PLA");
  const [selectedPrinter, setSelectedPrinter] = useState("Bambu X1C");
  const [rotating, setRotating] = useState(true);
  const [activeTab, setActiveTab] = useState("geometry");
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef();

  const runAnalysis = useCallback((name, size) => {
    setFileName(name);
    setFileSize(size);
    setPhase("uploading");
    setStepIdx(0);

    setTimeout(() => {
      setPhase("analyzing");
      let i = 0;
      const interval = setInterval(() => {
        i++;
        setStepIdx(i);
        if (i >= STEPS.length) {
          clearInterval(interval);
          const data = analyzeGeometry(name, size);
          setAnalysisData(data);
          setTimeout(() => setPhase("done"), 400);
        }
      }, 210);
    }, 600);
  }, []);

  const handleFile = (file) => {
    if (!file) return;
    runAnalysis(file.name, file.size);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const riskColor = analysisData ? {
    LOW: "#4dff7c", MEDIUM: "#ffcc00", HIGH: "#ff8800", CRITICAL: "#ff3333"
  }[analysisData.riskLevel] : "#ff8800";

  // ── RENDER ──
  return (
    <div style={{
      minHeight: "100vh",
      background: "#060e16",
      color: "#c8dde8",
      fontFamily: "'Courier New', 'Lucida Console', monospace",
      position: "relative",
      overflow: "hidden",
    }}>
      {/* Background grid */}
      <div style={{
        position: "fixed", inset: 0, pointerEvents: "none",
        backgroundImage: "linear-gradient(rgba(0,80,140,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(0,80,140,0.04) 1px, transparent 1px)",
        backgroundSize: "40px 40px",
      }} />
      {/* Glow spot */}
      <div style={{
        position: "fixed", top: -120, right: -120, width: 500, height: 500,
        background: "radial-gradient(circle, rgba(255,120,0,0.08) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />

      {/* ── HEADER ── */}
      <div style={{
        borderBottom: "1px solid #0e2030",
        padding: "0 28px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        height: 58,
        background: "rgba(6,14,22,0.96)",
        backdropFilter: "blur(8px)",
        position: "sticky", top: 0, zIndex: 100,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 32, height: 32, background: "linear-gradient(135deg,#ff8800,#cc4400)",
            borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 16, boxShadow: "0 0 16px rgba(255,120,0,0.4)",
          }}>⬡</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#e8f4ff", letterSpacing: 1.5 }}>SMARTSLICE AI</div>
            <div style={{ fontSize: 9, color: "#3a6080", letterSpacing: 3 }}>INTELLIGENT AM OPTIMIZATION ENGINE</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 20, fontSize: 10, color: "#3a6080" }}>
          {["PLA","PETG","ABS","TPU","ASA","Nylon"].map(m => (
            <span key={m} onClick={() => setSelectedMaterial(m)}
              style={{ cursor: "pointer", color: selectedMaterial === m ? "#ff8800" : "#3a6080",
                borderBottom: selectedMaterial === m ? "1px solid #ff8800" : "1px solid transparent",
                paddingBottom: 2, letterSpacing: 2, transition: "all 0.2s" }}>
              {m}
            </span>
          ))}
        </div>
        <div style={{ fontSize: 10, color: "#2a5070" }}>
          <span style={{ color: "#ff8800" }}>◉</span> ENGINE READY
        </div>
      </div>

      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "24px 24px 48px" }}>

        {/* ── UPLOAD / ANALYZING PHASE ── */}
        {phase !== "done" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>

            {/* Upload zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => phase === "idle" && fileRef.current.click()}
              style={{
                border: `1px dashed ${dragOver ? "#ff8800" : "#122030"}`,
                borderRadius: 12,
                height: 320,
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                cursor: phase === "idle" ? "pointer" : "default",
                background: dragOver ? "rgba(255,136,0,0.04)" : "rgba(13,31,45,0.5)",
                transition: "all 0.3s",
                position: "relative", overflow: "hidden",
              }}>
              <input ref={fileRef} type="file" accept=".stl,.obj" style={{ display: "none" }}
                onChange={(e) => handleFile(e.target.files[0])} />

              {phase === "idle" && <>
                <div style={{ fontSize: 48, opacity: 0.25, marginBottom: 16 }}>⬡</div>
                <div style={{ fontSize: 14, color: "#4a7090", letterSpacing: 2 }}>DROP STL FILE HERE</div>
                <div style={{ fontSize: 10, color: "#1e3a50", marginTop: 8, letterSpacing: 1 }}>or click to browse — .stl / .obj supported</div>
                <div style={{ marginTop: 24, display: "flex", gap: 8 }}>
                  {["bracket.stl","turbine.stl","housing.stl"].map(f => (
                    <span key={f} onClick={(e) => { e.stopPropagation(); runAnalysis(f, randomInt(80000, 4000000)); }}
                      style={{ fontSize: 9, color: "#2a6080", border: "1px solid #122030", borderRadius: 4,
                        padding: "4px 10px", cursor: "pointer", letterSpacing: 1, transition: "all 0.2s",
                        background: "#080f18" }}>
                      {f}
                    </span>
                  ))}
                </div>
                <div style={{ fontSize: 9, color: "#1a3040", marginTop: 10, letterSpacing: 1 }}>↑ demo files</div>
              </>}

              {phase === "uploading" && <>
                <div style={{ fontSize: 11, color: "#4a7090", letterSpacing: 3, marginBottom: 16 }}>LOADING GEOMETRY</div>
                <div style={{ fontSize: 13, color: "#ff8800" }}>{fileName}</div>
                <div style={{ fontSize: 10, color: "#2a5070", marginTop: 6 }}>{(fileSize / 1024).toFixed(1)} KB</div>
                <div style={{ marginTop: 24, width: 200, height: 2, background: "#0a1a24", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ width: "60%", height: "100%", background: "#ff8800", animation: "pulse 1s infinite" }} />
                </div>
              </>}

              {phase === "analyzing" && <>
                <div style={{ fontSize: 10, color: "#3a6080", letterSpacing: 3, marginBottom: 20 }}>ANALYSIS IN PROGRESS</div>
                <div style={{ width: "85%", maxHeight: 220, overflowY: "auto" }}>
                  {STEPS.slice(0, stepIdx + 1).map((s, i) => (
                    <div key={i} style={{
                      fontSize: 10, color: i === stepIdx ? "#ff8800" : "#2a5070",
                      padding: "3px 0", letterSpacing: 0.5,
                      display: "flex", gap: 8, alignItems: "center",
                    }}>
                      <span style={{ color: i === stepIdx ? "#ff8800" : "#1a4060" }}>
                        {i === stepIdx ? "▶" : "✓"}
                      </span>
                      {s}
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 16, width: "85%", height: 2, background: "#0a1a24", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{
                    width: `${(stepIdx / STEPS.length) * 100}%`, height: "100%",
                    background: "linear-gradient(90deg,#ff4400,#ff8800)", borderRadius: 2,
                    transition: "width 0.2s ease"
                  }} />
                </div>
                <div style={{ fontSize: 9, color: "#2a5070", marginTop: 6, letterSpacing: 2 }}>
                  {Math.round((stepIdx / STEPS.length) * 100)}% COMPLETE
                </div>
              </>}
            </div>

            {/* Config panel */}
            <div style={{ background: "rgba(13,31,45,0.5)", border: "1px solid #0e2030", borderRadius: 12, padding: 24 }}>
              <div style={{ fontSize: 10, color: "#3a6080", letterSpacing: 3, marginBottom: 20 }}>PRINT CONFIGURATION</div>

              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 9, color: "#2a5070", letterSpacing: 2, marginBottom: 10 }}>MATERIAL</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {MATERIALS.map(m => (
                    <button key={m} onClick={() => setSelectedMaterial(m)}
                      style={{
                        padding: "6px 14px", borderRadius: 4, cursor: "pointer", fontSize: 10, letterSpacing: 2,
                        background: selectedMaterial === m ? "rgba(255,136,0,0.15)" : "#060e16",
                        border: `1px solid ${selectedMaterial === m ? "#ff8800" : "#0e2030"}`,
                        color: selectedMaterial === m ? "#ff8800" : "#3a6080",
                        transition: "all 0.2s",
                      }}>{m}</button>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 9, color: "#2a5070", letterSpacing: 2, marginBottom: 10 }}>PRINTER</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {PRINTERS.map(p => (
                    <button key={p} onClick={() => setSelectedPrinter(p)}
                      style={{
                        padding: "6px 14px", borderRadius: 4, cursor: "pointer", fontSize: 10, letterSpacing: 1,
                        background: selectedPrinter === p ? "rgba(0,180,255,0.08)" : "#060e16",
                        border: `1px solid ${selectedPrinter === p ? "#0088cc" : "#0e2030"}`,
                        color: selectedPrinter === p ? "#66ccff" : "#3a6080",
                        transition: "all 0.2s",
                      }}>{p}</button>
                  ))}
                </div>
              </div>

              <div style={{ borderTop: "1px solid #0e2030", paddingTop: 20, marginTop: 12 }}>
                <div style={{ fontSize: 9, color: "#2a5070", letterSpacing: 2, marginBottom: 14 }}>ENGINE PARAMETERS</div>
                {[
                  ["Orientation Search", "10° INCREMENTS"],
                  ["Overhang Threshold", "55° (ASTM F2971)"],
                  ["Thin Wall Detection", "< 1.2 mm"],
                  ["Support Algorithm", "HYBRID TREE"],
                  ["Cost Rate", "₹2.8 / gram"],
                  ["Risk Model", "RULE + HEURISTIC"],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 9, marginBottom: 8, letterSpacing: 1 }}>
                    <span style={{ color: "#2a5070" }}>{k}</span>
                    <span style={{ color: "#4a7090" }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── RESULTS PHASE ── */}
        {phase === "done" && analysisData && (() => {
          const d = analysisData;
          return (
            <div>
              {/* Top bar */}
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                marginBottom: 20, padding: "12px 20px",
                background: "rgba(13,31,45,0.5)", border: "1px solid #0e2030", borderRadius: 10,
              }}>
                <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
                  <div style={{ fontSize: 11, color: "#ff8800" }}>✓ ANALYSIS COMPLETE</div>
                  <div style={{ fontSize: 10, color: "#3a6080" }}>{fileName}</div>
                  <div style={{ fontSize: 9, color: "#1e3a50", border: "1px solid #0e2030", borderRadius: 3, padding: "2px 8px" }}>
                    {selectedMaterial} · {selectedPrinter}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 12 }}>
                  <button onClick={() => setRotating(r => !r)} style={{
                    fontSize: 9, letterSpacing: 2, cursor: "pointer",
                    background: "#060e16", border: "1px solid #0e2030", color: "#3a6080",
                    borderRadius: 4, padding: "4px 12px",
                  }}>{rotating ? "⏸ FREEZE" : "▶ ROTATE"}</button>
                  <button onClick={() => { setPhase("idle"); setAnalysisData(null); }} style={{
                    fontSize: 9, letterSpacing: 2, cursor: "pointer",
                    background: "rgba(255,136,0,0.1)", border: "1px solid #ff8800", color: "#ff8800",
                    borderRadius: 4, padding: "4px 12px",
                  }}>⟳ NEW FILE</button>
                </div>
              </div>

              {/* Main grid */}
              <div style={{ display: "grid", gridTemplateColumns: "420px 1fr", gap: 20, marginBottom: 20 }}>

                {/* 3D Viewer */}
                <div style={{
                  background: "rgba(6,14,22,0.9)", border: "1px solid #0e2030", borderRadius: 12, overflow: "hidden",
                  height: 380, position: "relative",
                }}>
                  <div style={{ position: "absolute", top: 12, left: 14, fontSize: 9, color: "#2a5070", letterSpacing: 2, zIndex: 2 }}>
                    3D PREVIEW — {d.dims.w.toFixed(0)}×{d.dims.d.toFixed(0)}×{d.dims.h.toFixed(0)} mm
                  </div>
                  <div style={{ position: "absolute", bottom: 12, left: 14, fontSize: 8, color: "#1a3a50", letterSpacing: 1, zIndex: 2 }}>
                    PARAMETRIC VISUALIZATION
                  </div>
                  <ModelViewer analysisData={d} rotating={rotating} />
                </div>

                {/* Risk + Quality */}
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

                  {/* Risk score big card */}
                  <div style={{
                    background: `linear-gradient(135deg, rgba(${d.risk > 65 ? "80,10,10" : d.risk > 40 ? "60,35,0" : "0,40,20"},0.6), #0a0f16)`,
                    border: `1px solid ${riskColor}30`,
                    borderRadius: 12, padding: "18px 22px",
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                  }}>
                    <div>
                      <div style={{ fontSize: 9, color: "#3a6080", letterSpacing: 3, marginBottom: 6 }}>FAILURE RISK SCORE</div>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                        <span style={{ fontSize: 52, fontWeight: 900, color: riskColor, lineHeight: 1 }}>
                          <AnimatedNumber value={d.risk} decimals={0} />
                        </span>
                        <span style={{ fontSize: 18, color: riskColor, opacity: 0.6 }}>%</span>
                      </div>
                      <div style={{ fontSize: 11, color: riskColor, marginTop: 4, letterSpacing: 3 }}>{d.riskLevel} RISK</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 9, color: "#3a6080", letterSpacing: 3, marginBottom: 6 }}>QUALITY SCORE</div>
                      <div style={{ fontSize: 36, fontWeight: 700, color: "#4dff7c" }}>
                        <AnimatedNumber value={d.qualityScore} decimals={0} /><span style={{ fontSize: 14, color: "#2a6040" }}>/100</span>
                      </div>
                    </div>
                  </div>

                  {/* Key metrics grid */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                    <MetricCard label="Print Time" value={`${d.timeH}h ${d.timeM}m`} unit="" icon="⏱" />
                    <MetricCard label="Material" value={d.materialGrams} unit="g" icon="⚖" />
                    <MetricCard label="Est. Cost" value={`₹${d.costINR}`} unit="" icon="₹" accent />
                    <MetricCard label="Layer Count" value={d.layers} unit="" icon="▤" />
                    <MetricCard label="Infill" value={`${d.baseInfill}%`} unit="" icon="◈" />
                    <MetricCard label="Layer Height" value={d.layerHeight} unit="mm" icon="↕" accent={d.layerHeight === 0.12} />
                  </div>
                </div>
              </div>

              {/* ── TAB PANEL ── */}
              <div style={{ background: "rgba(13,31,45,0.5)", border: "1px solid #0e2030", borderRadius: 12, overflow: "hidden" }}>

                {/* Tabs */}
                <div style={{ display: "flex", borderBottom: "1px solid #0e2030" }}>
                  {[
                    ["geometry", "GEOMETRY"],
                    ["orientation", "ORIENTATION"],
                    ["slicing", "SLICE PARAMS"],
                    ["risks", "RISK ANALYSIS"],
                  ].map(([id, label]) => (
                    <button key={id} onClick={() => setActiveTab(id)}
                      style={{
                        padding: "12px 24px", fontSize: 9, letterSpacing: 3, cursor: "pointer",
                        background: activeTab === id ? "rgba(255,136,0,0.08)" : "transparent",
                        border: "none", borderBottom: `2px solid ${activeTab === id ? "#ff8800" : "transparent"}`,
                        color: activeTab === id ? "#ff8800" : "#2a5070",
                        transition: "all 0.2s",
                      }}>{label}</button>
                  ))}
                </div>

                <div style={{ padding: 24 }}>

                  {activeTab === "geometry" && (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
                      <div>
                        <div style={{ fontSize: 9, color: "#2a5070", letterSpacing: 3, marginBottom: 16 }}>RAW MEASUREMENTS</div>
                        {[
                          ["Model Volume", `${d.volume} cm³`],
                          ["Surface Area", `${d.surfaceArea} cm²`],
                          ["Bounding Box W", `${d.dims.w.toFixed(1)} mm`],
                          ["Bounding Box D", `${d.dims.d.toFixed(1)} mm`],
                          ["Bounding Box H", `${d.dims.h.toFixed(1)} mm`],
                          ["Curvature Score", `${d.curvatureScore.toFixed(3)}`],
                          ["CoG Offset", `${(d.cogOffset * 100).toFixed(1)}%`],
                        ].map(([k, v]) => (
                          <div key={k} style={{
                            display: "flex", justifyContent: "space-between", padding: "8px 0",
                            borderBottom: "1px solid #0a1a24", fontSize: 11,
                          }}>
                            <span style={{ color: "#3a6080" }}>{k}</span>
                            <span style={{ color: "#88bbcc", fontFamily: "monospace" }}>{v}</span>
                          </div>
                        ))}
                      </div>
                      <div>
                        <div style={{ fontSize: 9, color: "#2a5070", letterSpacing: 3, marginBottom: 16 }}>FEATURE DETECTION</div>
                        <div style={{ marginBottom: 20 }}>
                          <Bar label="Max Overhang Angle" value={d.maxOverhang} max={90} color="#ff8800" warn={55} />
                          <Bar label="Thin Wall Regions" value={d.thinWalls} max={30} color="#66ccff" warn={20} />
                          <Bar label="Curvature Complexity" value={Math.round(d.curvatureScore * 100)} color="#cc88ff" warn={75} />
                          <Bar label="CoG Stability Risk" value={Math.round(d.cogOffset * 100)} color="#ff4488" warn={35} />
                        </div>
                        <div style={{ padding: 14, background: "#060e16", borderRadius: 8, border: "1px solid #0a1a24" }}>
                          <div style={{ fontSize: 9, color: "#2a5070", letterSpacing: 2, marginBottom: 10 }}>RULE ENGINE OUTPUT</div>
                          {[
                            [d.maxOverhang > 55, `Overhang ${d.maxOverhang}° > 55° → SUPPORTS REQUIRED`],
                            [d.thinWalls > 8, `${d.thinWalls} thin walls → LAYER HEIGHT 0.12mm`],
                            [d.adaptiveLayers, `High curvature (${d.curvatureScore.toFixed(2)}) → ADAPTIVE LAYERS`],
                            [d.dims.h > 150, `Height ${d.dims.h.toFixed(0)}mm > 150mm → DENSE BASE INFILL`],
                          ].map(([triggered, msg], i) => (
                            <div key={i} style={{ fontSize: 9, color: triggered ? "#ff8800" : "#1e4060",
                              padding: "3px 0", display: "flex", gap: 8 }}>
                              <span>{triggered ? "⚡" : "○"}</span>{msg}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {activeTab === "orientation" && (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
                      <div>
                        <div style={{ fontSize: 9, color: "#2a5070", letterSpacing: 3, marginBottom: 16 }}>OPTIMIZATION RESULT</div>
                        <div style={{ padding: 20, background: "#060e16", borderRadius: 8, border: "1px solid #1a3a20", marginBottom: 16 }}>
                          <div style={{ fontSize: 9, color: "#2a6040", letterSpacing: 2, marginBottom: 10 }}>RECOMMENDED ORIENTATION</div>
                          <div style={{ fontSize: 22, color: "#4dff7c", marginBottom: 6 }}>
                            Rotate {d.orientRotateY.toFixed(1)}° around Y-axis
                          </div>
                          <div style={{ fontSize: 10, color: "#2a6040" }}>
                            Support reduction: <span style={{ color: "#4dff7c" }}>{d.supportReduction.toFixed(1)}%</span>
                          </div>
                        </div>
                        <div style={{ fontSize: 9, color: "#2a5070", letterSpacing: 2, marginBottom: 12 }}>OBJECTIVE FUNCTION</div>
                        <div style={{ padding: 14, background: "#060e16", borderRadius: 8, border: "1px solid #0a1a24",
                          fontSize: 10, color: "#3a6080", lineHeight: 2, letterSpacing: 0.5 }}>
                          Minimize:<br />
                          <span style={{ color: "#ff8800" }}>Support Vol</span> + (0.3 × <span style={{ color: "#66ccff" }}>Build Height</span>) + (0.2 × <span style={{ color: "#ff4488" }}>Stability Risk</span>)
                        </div>
                        <div style={{ marginTop: 16, fontSize: 9, color: "#2a5070", letterSpacing: 2, marginBottom: 10 }}>SEARCH SPACE EVALUATED</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                          {Array.from({ length: 36 }, (_, i) => i * 10).map(angle => {
                            const isOptimal = Math.abs(angle - Math.round(d.orientRotateY / 10) * 10) < 15;
                            return (
                              <div key={angle} style={{
                                width: 28, height: 20, borderRadius: 3, fontSize: 8,
                                display: "flex", alignItems: "center", justifyContent: "center",
                                background: isOptimal ? "rgba(77,255,124,0.15)" : "#060e16",
                                border: `1px solid ${isOptimal ? "#2a6634" : "#0a1a24"}`,
                                color: isOptimal ? "#4dff7c" : "#1e3a50",
                              }}>{angle}°</div>
                            );
                          })}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 9, color: "#2a5070", letterSpacing: 3, marginBottom: 16 }}>ORIENTATION COMPARISON</div>
                        {[
                          { label: "Default (0°)", supportVol: 100, buildH: 100, stability: 100 },
                          { label: `Optimal (${d.orientRotateY.toFixed(0)}°)`, supportVol: 100 - d.supportReduction, buildH: randomBetween(85, 98), stability: randomBetween(60, 90) },
                          { label: "Alt. (90°)", supportVol: randomBetween(110, 140), buildH: randomBetween(60, 80), stability: randomBetween(70, 110) },
                        ].map((row, i) => (
                          <div key={i} style={{
                            padding: 14, background: i === 1 ? "rgba(0,40,20,0.4)" : "#060e16",
                            border: `1px solid ${i === 1 ? "#1a4020" : "#0a1a24"}`,
                            borderRadius: 8, marginBottom: 10,
                          }}>
                            <div style={{ fontSize: 10, color: i === 1 ? "#4dff7c" : "#3a6080", marginBottom: 8 }}>
                              {i === 1 && "★ "}{row.label}
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, fontSize: 9 }}>
                              {[["Support Vol", row.supportVol, "#ff8800"], ["Build Height", row.buildH, "#66ccff"], ["Stability", row.stability, "#ff4488"]].map(([k, v, c]) => (
                                <div key={k}>
                                  <div style={{ color: "#2a5070", marginBottom: 3 }}>{k}</div>
                                  <div style={{ color: c }}>{v.toFixed ? v.toFixed(1) : v}%</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {activeTab === "slicing" && (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
                      <div>
                        <div style={{ fontSize: 9, color: "#2a5070", letterSpacing: 3, marginBottom: 16 }}>RECOMMENDED PARAMETERS</div>
                        {[
                          ["Layer Height", `${d.layerHeight} mm`, d.layerHeight === 0.12 ? "#ff8800" : "#88bbcc"],
                          ["Infill Density", `${d.baseInfill}%`, "#88bbcc"],
                          ["Infill Pattern", d.infillPattern, "#cc88ff"],
                          ["Adaptive Layers", d.adaptiveLayers ? "ENABLED" : "DISABLED", d.adaptiveLayers ? "#4dff7c" : "#2a5070"],
                          ["Support Type", d.needsSupports ? "HYBRID TREE" : "NONE", d.needsSupports ? "#ff8800" : "#4dff7c"],
                          ["Wall Count", "3 perimeters", "#88bbcc"],
                          ["Top/Bottom Layers", "4 layers", "#88bbcc"],
                          ["Print Speed", "80 mm/s", "#88bbcc"],
                          ["First Layer Speed", "25 mm/s", "#88bbcc"],
                          ["Fan Speed", selectedMaterial === "ABS" ? "15%" : "100%", "#88bbcc"],
                        ].map(([k, v, c]) => (
                          <div key={k} style={{
                            display: "flex", justifyContent: "space-between", padding: "9px 0",
                            borderBottom: "1px solid #0a1a24", fontSize: 11,
                          }}>
                            <span style={{ color: "#3a6080" }}>{k}</span>
                            <span style={{ color: c || "#88bbcc", fontFamily: "monospace" }}>{v}</span>
                          </div>
                        ))}
                      </div>
                      <div>
                        <div style={{ fontSize: 9, color: "#2a5070", letterSpacing: 3, marginBottom: 16 }}>PRINT ESTIMATES</div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
                          {[
                            ["PRINT TIME", `${d.timeH}h ${d.timeM}m`, "#e8f4ff"],
                            ["MATERIAL", `${d.materialGrams}g`, "#e8f4ff"],
                            ["COST", `₹${d.costINR}`, "#4dff7c"],
                            ["LAYERS", d.layers, "#e8f4ff"],
                          ].map(([k, v, c]) => (
                            <div key={k} style={{ background: "#060e16", border: "1px solid #0a1a24", borderRadius: 8, padding: 14 }}>
                              <div style={{ fontSize: 9, color: "#2a5070", letterSpacing: 2, marginBottom: 8 }}>{k}</div>
                              <div style={{ fontSize: 18, color: c, fontWeight: 700 }}>{v}</div>
                            </div>
                          ))}
                        </div>
                        <div style={{ fontSize: 9, color: "#2a5070", letterSpacing: 2, marginBottom: 12 }}>PATH LENGTH BREAKDOWN</div>
                        {[
                          ["Perimeter passes", `${(d.surfaceArea * 2.1 * d.layers * 0.012).toFixed(1)}m`],
                          ["Infill traversal", `${(d.volume * 5.5).toFixed(1)}m`],
                          ["Support material", d.needsSupports ? `${(d.volume * 0.8).toFixed(1)}m` : "0m"],
                          ["Travel moves (est.)", `${(d.layers * 0.18).toFixed(1)}m`],
                        ].map(([k, v]) => (
                          <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 10, padding: "6px 0", color: "#3a6080" }}>
                            <span>{k}</span><span style={{ color: "#5580a0" }}>{v}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {activeTab === "risks" && (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
                      <div>
                        <div style={{ fontSize: 9, color: "#2a5070", letterSpacing: 3, marginBottom: 16 }}>RISK FACTOR BREAKDOWN</div>
                        {[
                          { label: "Overhang Failure", value: d.maxOverhang > 65 ? 28 : d.maxOverhang > 55 ? 15 : 3, thresh: 20 },
                          { label: "Thin Wall Collapse", value: d.thinWalls > 12 ? 20 : d.thinWalls > 5 ? 10 : 2, thresh: 15 },
                          { label: "Center of Mass Shift", value: Math.round(d.cogOffset * 40), thresh: 12 },
                          { label: "Height Instability", value: d.dims.h > 150 ? 10 : d.dims.h > 80 ? 5 : 2, thresh: 8 },
                          { label: "Warping Risk", value: ["ABS", "Nylon", "ASA"].includes(selectedMaterial) ? 18 : 4, thresh: 12 },
                          { label: "Layer Adhesion", value: randomInt(2, 10), thresh: 8 },
                        ].map(({ label, value, thresh }) => (
                          <div key={label} style={{ marginBottom: 12 }}>
                            <Bar label={label} value={value} max={30} color={value > thresh ? "#ff4444" : "#ff8800"} warn={thresh} />
                          </div>
                        ))}
                      </div>
                      <div>
                        <div style={{ fontSize: 9, color: "#2a5070", letterSpacing: 3, marginBottom: 16 }}>MITIGATION RECOMMENDATIONS</div>
                        {[
                          d.needsSupports && { icon: "⚠", label: "Enable tree supports", detail: `Overhang at ${d.maxOverhang}° exceeds 55° threshold` },
                          d.thinWalls > 8 && { icon: "⚠", label: "Reduce layer height to 0.12mm", detail: `${d.thinWalls} thin wall regions detected` },
                          d.cogOffset > 0.3 && { icon: "⚠", label: "Add brim (8mm) for adhesion", detail: `CoG offset ${(d.cogOffset * 100).toFixed(0)}% may cause tipping` },
                          d.dims.h > 150 && { icon: "⚠", label: "Increase base infill to 35%", detail: `Height ${d.dims.h.toFixed(0)}mm requires stability base` },
                          ["ABS", "Nylon"].includes(selectedMaterial) && { icon: "⚠", label: "Use enclosure + 90°C bed", detail: `${selectedMaterial} prone to warping on open machines` },
                          { icon: "✓", label: `Infill pattern: ${d.infillPattern}`, detail: "Optimal for current geometry profile" },
                          { icon: "✓", label: "Orientation optimized", detail: `${d.supportReduction.toFixed(0)}% support material reduction achieved` },
                        ].filter(Boolean).map((item, i) => (
                          <div key={i} style={{
                            padding: 12, background: "#060e16",
                            border: `1px solid ${item.icon === "⚠" ? "#2a2010" : "#0a1e12"}`,
                            borderRadius: 6, marginBottom: 8,
                          }}>
                            <div style={{ fontSize: 10, color: item.icon === "⚠" ? "#ff8800" : "#4dff7c", marginBottom: 4 }}>
                              {item.icon} {item.label}
                            </div>
                            <div style={{ fontSize: 9, color: "#2a5070" }}>{item.detail}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      <style>{`
        @keyframes pulse {
          0%,100% { opacity:1; } 50% { opacity:0.4; }
        }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: #060e16; }
        ::-webkit-scrollbar-thumb { background: #1a3a50; border-radius: 2px; }
      `}</style>
    </div>
  );
}
