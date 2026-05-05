import { useState, useEffect } from "react";
import { db } from "./firebase";
import { ref, onValue, set, update, push, remove } from "firebase/database";
import * as XLSX from "xlsx";

const COLORS = ["#00C9A7","#4F8EF7","#F7B731","#FC5C65","#45AAF2","#A55EEA","#FD9644","#26DE81"];
const UNIDADES = ["Cama", "Camilla", "Cubículo", "Habitación", "Otro"];

function RadialProgress({ pct, color, size = 80 }) {
  const r = (size - 12) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (Math.min(pct, 100) / 100) * circ;
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#1e2a3a" strokeWidth={8}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={8}
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        style={{ transition: "stroke-dashoffset 0.6s cubic-bezier(.4,2,.6,1)" }}/>
    </svg>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "#000000bb", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#0f1f35", border: "1px solid #1e2d45", borderRadius: 18, padding: "24px 28px", width: "90%", maxWidth: 480, maxHeight: "85vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#4F8EF7" }}>{title}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#4f7096", fontSize: 20, cursor: "pointer" }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function App() {
  const [config, setConfig] = useState({ institucion: "", area: "" });
  const [auditoras, setAuditoras] = useState({});
  const [servicios, setServicios] = useState({});
  const [log, setLog] = useState([]);
  const [historial, setHistorial] = useState({});
  const [view, setView] = useState("dashboard");
  const [pulse, setPulse] = useState(null);
  const [connected, setConnected] = useState(true);
  const [registro, setRegistro] = useState({});
  const [modalAuditora, setModalAuditora] = useState(null);
  const [modalServicio, setModalServicio] = useState(false);
  const [historialView, setHistorialView] = useState(false);
  const [filtroAuditora, setFiltroAuditora] = useState("todas");
  const [filtroRango, setFiltroRango] = useState("semana");
  const [formAuditora, setFormAuditora] = useState({ nombre: "", meta: 30, servicios: [] });
  const [nuevoServicio, setNuevoServicio] = useState("");

  const hoy = () => new Date().toISOString().slice(0, 10);
  const ts = () => new Date().toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const fechaStr = () => new Date().toLocaleDateString("es-CO", { day: "2-digit", month: "2-digit", year: "numeric" });

  useEffect(() => {
    const pairs = [
      [ref(db, "config"), (s) => setConfig(s.val() || { institucion: "", area: "" })],
      [ref(db, "auditoras"), (s) => { setAuditoras(s.val() || {}); setConnected(true); }],
      [ref(db, "servicios"), (s) => setServicios(s.val() || {})],
      [ref(db, "historial"), (s) => setHistorial(s.val() || {})],
      [ref(db, "log"), (s) => {
        const d = s.val();
        setLog(d ? Object.values(d).sort((a,b) => b.ts_ms - a.ts_ms).slice(0,100) : []);
      }],
    ];
    const unsubs = pairs.map(([r, cb]) => onValue(r, cb, () => setConnected(false)));
    return () => unsubs.forEach(u => u());
  }, []);

  const registrar = async (auditoraId) => {
    const a = auditoras[auditoraId];
    if (!a) return;
    const reg = registro[auditoraId] || {};
    const servicio = reg.servicio || "";
    const unidad = reg.unidad || "Cama";
    const numero = reg.numero || "";
    if (!servicio) { alert("Selecciona un servicio antes de registrar."); return; }
    const nuevas = (a.historias || 0) + 1;
    const key = `${servicio}__${unidad}`;
    const tipos = { ...(a.tipos || {}), [key]: ((a.tipos || {})[key] || 0) + 1 };
    await update(ref(db, `auditoras/${auditoraId}`), { historias: nuevas, tipos });
    const dia = hoy();
    const diaActual = (historial[dia] && historial[dia][auditoraId]) || { total: 0, tipos: {} };
    const nuevosTipos = { ...diaActual.tipos, [key]: ((diaActual.tipos || {})[key] || 0) + 1 };
    await update(ref(db, `historial/${dia}/${auditoraId}`), { total: (diaActual.total || 0) + 1, tipos: nuevosTipos });
    await push(ref(db, "log"), { ts: ts(), ts_ms: Date.now(), nombre: a.nombre, delta: 1, total: nuevas, servicio, unidad, numero });
    setPulse(auditoraId);
    setTimeout(() => setPulse(null), 600);
  };

  const resetAll = async () => {
    if (!window.confirm("¿Reiniciar todos los conteos del día?")) return;
    const updates = {};
    Object.keys(auditoras).forEach(id => { updates[`auditoras/${id}/historias`] = 0; updates[`auditoras/${id}/tipos`] = {}; });
    await update(ref(db), updates);
    await push(ref(db, "log"), { ts: ts(), ts_ms: Date.now(), nombre: "Sistema", delta: 0, total: 0, tipo: "reset" });
  };

  const agregarServicio = async () => {
    if (!nuevoServicio.trim()) return;
    await push(ref(db, "servicios"), { nombre: nuevoServicio.trim() });
    setNuevoServicio("");
  };
  const eliminarServicio = async (id) => { if (!window.confirm("¿Eliminar este servicio?")) return; await remove(ref(db, `servicios/${id}`)); };

  const abrirNuevaAuditora = () => { setFormAuditora({ nombre: "", meta: 30, servicios: [] }); setModalAuditora("new"); };
  const abrirEditarAuditora = (id) => { const a = auditoras[id]; setFormAuditora({ nombre: a.nombre, meta: a.meta || 30, servicios: a.servicios || [] }); setModalAuditora(id); };
  const guardarAuditora = async () => {
    if (!formAuditora.nombre.trim()) return;
    const data = { nombre: formAuditora.nombre.trim(), meta: parseInt(formAuditora.meta) || 30, servicios: formAuditora.servicios };
    if (modalAuditora === "new") await push(ref(db, "auditoras"), { ...data, historias: 0, tipos: {} });
    else await update(ref(db, `auditoras/${modalAuditora}`), data);
    setModalAuditora(null);
  };
  const eliminarAuditora = async (id) => { if (!window.confirm("¿Eliminar?")) return; await remove(ref(db, `auditoras/${id}`)); };
  const toggleServicioAuditora = (sid) => {
    const cur = formAuditora.servicios || [];
    setFormAuditora(f => ({ ...f, servicios: cur.includes(sid) ? cur.filter(x => x !== sid) : [...cur, sid] }));
  };

  const guardarConfig = async (campo, valor) => { await update(ref(db, "config"), { [campo]: valor }); };

  const exportToExcel = () => {
    const wb = XLSX.utils.book_new();
    const listaA = Object.entries(auditoras);
    const listaS = Object.values(servicios).map(s => s.nombre);
    const hoy2 = fechaStr(); const ahora = ts();

    const rows1 = [
      [config.institucion || "Institución"],
      [`${config.area || "Auditoría Clínica"} — Fecha: ${hoy2}  Hora: ${ahora}`],
      [],
      ["Auditora", "Total", "Meta", "% Cumplimiento", "Estado", ...listaS.flatMap(s => UNIDADES.map(u => `${s}/${u}`))],
      ...listaA.map(([,a]) => {
        const pct = (a.meta||30) > 0 ? a.historias/(a.meta||30) : 0;
        return [a.nombre, a.historias||0, a.meta||30, pct,
          pct>=1?"✅ Meta cumplida":pct>=0.7?"🟡 En progreso":"🔴 Por debajo",
          ...listaS.flatMap(s => UNIDADES.map(u => (a.tipos&&a.tipos[`${s}__${u}`])||0))];
      }),
      [],["TOTAL", listaA.reduce((s,[,a])=>s+(a.historias||0),0), listaA.reduce((s,[,a])=>s+(a.meta||30),0)]
    ];
    const ws1 = XLSX.utils.aoa_to_sheet(rows1);
    ws1["!cols"] = [{wch:26},{wch:8},{wch:8},{wch:14},{wch:18},...listaS.flatMap(()=>UNIDADES.map(()=>({wch:14})))];
    listaA.forEach((_,i)=>{ const c=`D${5+i}`; if(ws1[c]) ws1[c].z="0.0%"; });
    XLSX.utils.book_append_sheet(wb, ws1, "Resumen del día");

    const diasOrdenados = Object.keys(historial).sort().reverse();
    if (diasOrdenados.length > 0) {
      const rows2 = [
        ["Historial por día — " + (config.institucion||"")],[], 
        ["Fecha","Auditora","Total",...listaS.flatMap(s=>UNIDADES.map(u=>`${s}/${u}`))],
        ...diasOrdenados.flatMap(dia => listaA.map(([id,a]) => {
          const d = historial[dia]&&historial[dia][id]; if(!d) return null;
          return [dia,a.nombre,d.total||0,...listaS.flatMap(s=>UNIDADES.map(u=>(d.tipos&&d.tipos[`${s}__${u}`])||0))];
        }).filter(Boolean))
      ];
      const ws2 = XLSX.utils.aoa_to_sheet(rows2);
      ws2["!cols"] = [{wch:12},{wch:26},{wch:10},...listaS.flatMap(()=>UNIDADES.map(()=>({wch:14})))];
      XLSX.utils.book_append_sheet(wb, ws2, "Historial por día");
    }

    if (log.length > 0) {
      const rows3 = [["Registro de actividad"],[],["Hora","Auditora","Servicio","Unidad","N°","Total"],
        ...log.map(e=>[e.ts,e.nombre,e.servicio||"—",e.unidad||"—",e.numero||"—",e.tipo==="reset"?"Reinicio":e.total])];
      const ws3 = XLSX.utils.aoa_to_sheet(rows3);
      ws3["!cols"] = [{wch:12},{wch:26},{wch:18},{wch:12},{wch:8},{wch:12}];
      XLSX.utils.book_append_sheet(wb, ws3, "Registro de actividad");
    }

    XLSX.writeFile(wb, `Auditoria_${(config.institucion||"IPS").replace(/\s+/g,"_")}_${hoy2.replace(/\//g,"-")}.xlsx`);
  };

  const getHistorialFiltrado = () => {
    const dias = filtroRango==="semana"?7:filtroRango==="mes"?30:90;
    const ahora = new Date();
    return Object.entries(historial)
      .filter(([d]) => (ahora - new Date(d+"T12:00:00"))/86400000 <= dias)
      .sort(([a],[b]) => b.localeCompare(a));
  };

  const listaAuditoras = Object.entries(auditoras);
  const listaServicios = Object.entries(servicios);
  const total = listaAuditoras.reduce((s,[,a])=>s+(a.historias||0),0);
  const totalMeta = listaAuditoras.reduce((s,[,a])=>s+(a.meta||30),0);
  const pctGlobal = totalMeta>0?Math.round((total/totalMeta)*100):0;
  const setReg = (id,campo,val) => setRegistro(r=>({...r,[id]:{...(r[id]||{}),[campo]:val}}));

  const inputStyle = { background:"#0b1523", border:"1px solid #1e2d45", borderRadius:8, padding:"7px 10px", color:"#e8f0fe", fontSize:12, outline:"none", width:"100%" };
  const btnStyle = (bg,color) => ({ background:bg, color:color||"#0b1523", border:"none", borderRadius:8, padding:"7px 12px", cursor:"pointer", fontSize:12, fontWeight:700 });

  return (
    <div style={{ minHeight:"100vh", background:"#0b1523", fontFamily:"'DM Sans','Segoe UI',sans-serif", color:"#e8f0fe" }}>

      {/* Header */}
      <div style={{ background:"linear-gradient(135deg,#0f1f35,#0b1523)", borderBottom:"1px solid #1e2d45", padding:"13px 18px", display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:10, position:"sticky", top:0, zIndex:100 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ width:32, height:32, borderRadius:9, background:"linear-gradient(135deg,#00C9A7,#4F8EF7)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:15 }}>📋</div>
          <div>
            <div style={{ fontSize:13, fontWeight:700 }}>Monitor de Auditoría Concurrente</div>
            <div style={{ fontSize:10, color:"#4f7096" }}>{config.institucion||"—"} · {config.area||"—"}</div>
          </div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:7, flexWrap:"wrap" }}>
          <div style={{ fontSize:11, padding:"4px 9px", borderRadius:6, background:connected?"#0d2a1e":"#2a1010", color:connected?"#26DE81":"#FC5C65", border:`1px solid ${connected?"#1a4a30":"#4a1a1a"}` }}>
            {connected?"● En línea":"● Sin conexión"}
          </div>
          <button onClick={()=>setHistorialView(true)} style={btnStyle("#1e2d45","#e8f0fe")}>📅 Historial</button>
          <button onClick={exportToExcel} style={btnStyle("linear-gradient(135deg,#26DE81,#00C9A7)")}>📥 Excel</button>
          <button onClick={()=>setView(view==="config"?"dashboard":"config")} style={btnStyle(view==="config"?"#4F8EF7":"#1e2d45","#e8f0fe")}>
            {view==="config"?"← Dashboard":"⚙ Configurar"}
          </button>
          <button onClick={resetAll} style={{ ...btnStyle("#1e1530","#FC5C65"), border:"1px solid #3d1f2b" }}>↺</button>
        </div>
      </div>

      {/* DASHBOARD */}
      {view==="dashboard" && (
        <div style={{ padding:"16px 18px" }}>
          {/* Resumen global */}
          <div style={{ background:"linear-gradient(135deg,#0f1f35,#111f33)", border:"1px solid #1e2d45", borderRadius:16, padding:"18px 22px", marginBottom:16, display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:14 }}>
            <div>
              <div style={{ fontSize:11, color:"#4f7096", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:4 }}>Total revisadas hoy</div>
              <div style={{ fontSize:46, fontWeight:800, color:"#00C9A7", lineHeight:1, letterSpacing:"-2px" }}>
                {total}<span style={{ fontSize:16, color:"#4f7096", fontWeight:400, marginLeft:8 }}>/ {totalMeta}</span>
              </div>
              <div style={{ marginTop:8, height:5, background:"#1e2d45", borderRadius:99, width:230, overflow:"hidden" }}>
                <div style={{ height:"100%", borderRadius:99, background:pctGlobal>=100?"#26DE81":"linear-gradient(90deg,#00C9A7,#4F8EF7)", width:`${Math.min(pctGlobal,100)}%`, transition:"width 0.6s ease" }}/>
              </div>
              <div style={{ fontSize:11, color:"#4f7096", marginTop:5 }}>{pctGlobal}% de la meta grupal</div>
            </div>
            <div style={{ display:"flex", gap:12, flexWrap:"wrap" }}>
              {[{label:"Auditoras",val:listaAuditoras.length,icon:"👩‍⚕️"},{label:"Promedio",val:listaAuditoras.length>0?Math.round(total/listaAuditoras.length):0,icon:"📊"},{label:"Mayor",val:listaAuditoras.length>0?Math.max(...listaAuditoras.map(([,a])=>a.historias||0)):0,icon:"🏆"}].map(s=>(
                <div key={s.label} style={{ background:"#0b1523", border:"1px solid #1e2d45", borderRadius:11, padding:"10px 14px", textAlign:"center", minWidth:76 }}>
                  <div style={{ fontSize:17 }}>{s.icon}</div>
                  <div style={{ fontSize:22, fontWeight:800, marginTop:2 }}>{s.val}</div>
                  <div style={{ fontSize:10, color:"#4f7096", marginTop:1 }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Tarjetas */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(285px,1fr))", gap:13 }}>
            {listaAuditoras.map(([id,a],i) => {
              const color = COLORS[i%COLORS.length];
              const pct = (a.meta||30)>0?Math.round(((a.historias||0)/a.meta)*100):0;
              const isPulsing = pulse===id;
              const svcsDisponibles = listaServicios.filter(([sid])=>(a.servicios||[]).includes(sid));
              const reg = registro[id]||{};
              return (
                <div key={id} style={{ background:"linear-gradient(145deg,#0f1f35,#0d1a2d)", border:`1px solid ${isPulsing?color:"#1e2d45"}`, borderRadius:16, padding:"15px 17px", transition:"all 0.3s", transform:isPulsing?"scale(1.02)":"scale(1)", boxShadow:isPulsing?`0 0 18px ${color}44`:"none" }}>
                  <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between" }}>
                    <div>
                      <div style={{ fontSize:10, color, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:2 }}>{a.nombre}</div>
                      <div style={{ fontSize:38, fontWeight:800, color:"#e8f0fe", lineHeight:1, letterSpacing:"-1px" }}>{a.historias||0}</div>
                      <div style={{ fontSize:11, color:"#4f7096", marginTop:2 }}>de {a.meta} · {pct}%</div>
                    </div>
                    <div style={{ position:"relative" }}>
                      <RadialProgress pct={pct} color={color} size={64}/>
                      <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:700, color }}>{pct}%</div>
                    </div>
                  </div>

                  <div style={{ marginTop:11, display:"flex", flexDirection:"column", gap:5 }}>
                    <select value={reg.servicio||""} onChange={e=>setReg(id,"servicio",e.target.value)} style={inputStyle}>
                      <option value="">— Selecciona servicio —</option>
                      {svcsDisponibles.map(([sid,s])=><option key={sid} value={s.nombre}>{s.nombre}</option>)}
                    </select>
                    <div style={{ display:"flex", gap:5 }}>
                      <select value={reg.unidad||"Cama"} onChange={e=>setReg(id,"unidad",e.target.value)} style={{ ...inputStyle, flex:1 }}>
                        {UNIDADES.map(u=><option key={u} value={u}>{u}</option>)}
                      </select>
                      <input type="number" placeholder="N°" value={reg.numero||""} onChange={e=>setReg(id,"numero",e.target.value)} style={{ ...inputStyle, width:56 }}/>
                    </div>
                  </div>

                  {a.tipos && Object.keys(a.tipos).length>0 && (
                    <div style={{ marginTop:7, display:"flex", flexWrap:"wrap", gap:3 }}>
                      {Object.entries(a.tipos).map(([key,cnt])=>{
                        const [svc,und]=key.split("__");
                        return <span key={key} style={{ fontSize:9, background:`${color}22`, color, border:`1px solid ${color}44`, borderRadius:5, padding:"2px 5px" }}>{svc}/{und}: {cnt}</span>;
                      })}
                    </div>
                  )}

                  <div style={{ marginTop:9, height:4, background:"#1e2d45", borderRadius:99, overflow:"hidden" }}>
                    <div style={{ height:"100%", borderRadius:99, background:pct>=100?"#26DE81":color, width:`${Math.min(pct,100)}%`, transition:"width 0.5s ease" }}/>
                  </div>

                  <button onClick={()=>registrar(id)} style={{ width:"100%", marginTop:11, padding:"10px 0", background:`${color}22`, color, border:`1px solid ${color}55`, borderRadius:10, fontSize:13, cursor:"pointer", fontWeight:700 }}>
                    + Registrar historia
                  </button>
                  {pct>=100 && <div style={{ marginTop:7, textAlign:"center", fontSize:11, color:"#26DE81", fontWeight:700 }}>✅ Meta cumplida</div>}
                </div>
              );
            })}
          </div>

          {/* Log */}
          {log.length>0 && (
            <div style={{ marginTop:16, background:"#0f1f35", border:"1px solid #1e2d45", borderRadius:14, padding:"13px 17px" }}>
              <div style={{ fontSize:11, color:"#4f7096", marginBottom:9, textTransform:"uppercase", letterSpacing:"0.08em" }}>📜 Actividad reciente</div>
              <div style={{ display:"flex", flexDirection:"column", gap:3, maxHeight:150, overflowY:"auto" }}>
                {log.slice(0,20).map((e,i)=>(
                  <div key={i} style={{ display:"flex", gap:7, fontSize:11, color:"#8faec4", padding:"3px 0", borderBottom:"1px solid #1e2d4533", flexWrap:"wrap" }}>
                    <span style={{ color:"#4f7096", minWidth:65 }}>{e.ts}</span>
                    <span style={{ fontWeight:700, color:"#e8f0fe", minWidth:100 }}>{e.nombre}</span>
                    {e.tipo!=="reset"
                      ? <><span style={{ color:"#4f7096" }}>{e.servicio} / {e.unidad}{e.numero?` #${e.numero}`:""}</span><span style={{ color:"#26DE81" }}>→ <strong style={{ color:"#00C9A7" }}>{e.total}</strong></span></>
                      : <span style={{ color:"#F7B731" }}>🔄 Reinicio</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* CONFIGURACIÓN */}
      {view==="config" && (
        <div style={{ padding:"16px 18px", maxWidth:560 }}>
          <div style={{ fontSize:14, fontWeight:700, marginBottom:14, color:"#4F8EF7" }}>⚙ Configuración</div>

          {/* Institución */}
          <div style={{ background:"#0f1f35", border:"1px solid #1e2d45", borderRadius:13, padding:"15px 17px", marginBottom:14 }}>
            <div style={{ fontSize:11, color:"#4f7096", marginBottom:10, textTransform:"uppercase" }}>🏥 Institución</div>
            <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
              <input key={config.institucion} defaultValue={config.institucion} placeholder="Nombre de la institución"
                onBlur={e=>guardarConfig("institucion",e.target.value)} style={inputStyle}/>
              <input key={config.area} defaultValue={config.area} placeholder="Área (ej. Auditoría Clínica)"
                onBlur={e=>guardarConfig("area",e.target.value)} style={inputStyle}/>
            </div>
            <div style={{ fontSize:10, color:"#4f7096", marginTop:5 }}>Los cambios se guardan al salir del campo (Tab o clic fuera)</div>
          </div>

          {/* Servicios */}
          <div style={{ background:"#0f1f35", border:"1px solid #1e2d45", borderRadius:13, padding:"15px 17px", marginBottom:14 }}>
            <div style={{ fontSize:11, color:"#4f7096", marginBottom:10, textTransform:"uppercase" }}>🏷 Servicios</div>
            <div style={{ display:"flex", gap:7, marginBottom:10 }}>
              <input value={nuevoServicio} onChange={e=>setNuevoServicio(e.target.value)}
                placeholder="Ej: Urgencias, UCI, Ginecología..."
                onKeyDown={e=>e.key==="Enter"&&agregarServicio()} style={{ ...inputStyle, flex:1 }}/>
              <button onClick={agregarServicio} style={btnStyle("#00C9A7")}>+ Agregar</button>
            </div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
              {listaServicios.map(([sid,s])=>(
                <div key={sid} style={{ display:"flex", alignItems:"center", gap:5, background:"#0b1523", border:"1px solid #1e2d45", borderRadius:7, padding:"4px 9px" }}>
                  <span style={{ fontSize:12 }}>{s.nombre}</span>
                  <button onClick={()=>eliminarServicio(sid)} style={{ background:"none", border:"none", color:"#FC5C65", cursor:"pointer", fontSize:11, padding:0 }}>✕</button>
                </div>
              ))}
              {listaServicios.length===0 && <div style={{ fontSize:12, color:"#4f7096" }}>Agrega el primer servicio.</div>}
            </div>
          </div>

          {/* Auditoras */}
          <div style={{ background:"#0f1f35", border:"1px solid #1e2d45", borderRadius:13, padding:"15px 17px" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:11 }}>
              <div style={{ fontSize:11, color:"#4f7096", textTransform:"uppercase" }}>👩‍⚕️ Auditoras</div>
              <button onClick={abrirNuevaAuditora} style={btnStyle("#00C9A7")}>+ Nueva</button>
            </div>
            {listaAuditoras.map(([id,a],i)=>{
              const color=COLORS[i%COLORS.length];
              return (
                <div key={id} style={{ borderLeft:`4px solid ${color}`, background:"#0b1523", border:"1px solid #1e2d45", borderRadius:9, padding:"11px 13px", marginBottom:7 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                    <div>
                      <div style={{ fontWeight:700, fontSize:13 }}>{a.nombre}</div>
                      <div style={{ fontSize:11, color:"#4f7096", marginTop:1 }}>Meta: {a.meta} · {(a.servicios||[]).length} servicios</div>
                      <div style={{ display:"flex", flexWrap:"wrap", gap:3, marginTop:5 }}>
                        {listaServicios.filter(([sid])=>(a.servicios||[]).includes(sid)).map(([sid,s])=>(
                          <span key={sid} style={{ fontSize:9, background:`${color}22`, color, border:`1px solid ${color}44`, borderRadius:4, padding:"2px 5px" }}>{s.nombre}</span>
                        ))}
                      </div>
                    </div>
                    <div style={{ display:"flex", gap:5 }}>
                      <button onClick={()=>abrirEditarAuditora(id)} style={btnStyle("#1e2d45","#e8f0fe")}>✏</button>
                      <button onClick={()=>eliminarAuditora(id)} style={{ ...btnStyle("#1e1530","#FC5C65"), border:"1px solid #3d1f2b" }}>🗑</button>
                    </div>
                  </div>
                </div>
              );
            })}
            {listaAuditoras.length===0 && <div style={{ fontSize:12, color:"#4f7096" }}>Agrega la primera auditora.</div>}
          </div>
        </div>
      )}

      {/* MODAL: Auditora */}
      {modalAuditora!==null && (
        <Modal title={modalAuditora==="new"?"Nueva auditora":"Editar auditora"} onClose={()=>setModalAuditora(null)}>
          <div style={{ display:"flex", flexDirection:"column", gap:11 }}>
            <input value={formAuditora.nombre} onChange={e=>setFormAuditora(f=>({...f,nombre:e.target.value}))} placeholder="Nombre completo" style={inputStyle}/>
            <div style={{ display:"flex", alignItems:"center", gap:9 }}>
              <span style={{ fontSize:12, color:"#4f7096", whiteSpace:"nowrap" }}>Meta diaria:</span>
              <input type="number" value={formAuditora.meta} onChange={e=>setFormAuditora(f=>({...f,meta:e.target.value}))} style={{ ...inputStyle, width:80 }}/>
            </div>
            <div>
              <div style={{ fontSize:11, color:"#4f7096", marginBottom:8, textTransform:"uppercase" }}>Servicios asignados</div>
              {listaServicios.length===0
                ? <div style={{ fontSize:12, color:"#4f7096" }}>Primero agrega servicios en configuración.</div>
                : <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
                    {listaServicios.map(([sid,s])=>(
                      <label key={sid} style={{ display:"flex", alignItems:"center", gap:8, cursor:"pointer", fontSize:13 }}>
                        <input type="checkbox" checked={(formAuditora.servicios||[]).includes(sid)} onChange={()=>toggleServicioAuditora(sid)} style={{ accentColor:"#00C9A7", width:15, height:15 }}/>
                        {s.nombre}
                      </label>
                    ))}
                  </div>
              }
            </div>
            <button onClick={guardarAuditora} style={{ ...btnStyle("linear-gradient(135deg,#00C9A7,#4F8EF7)"), padding:"11px 0", fontSize:14, borderRadius:10, marginTop:4 }}>Guardar</button>
          </div>
        </Modal>
      )}

      {/* MODAL: Historial */}
      {historialView && (
        <Modal title="📅 Historial de auditoría" onClose={()=>setHistorialView(false)}>
          <div style={{ display:"flex", gap:7, marginBottom:13, flexWrap:"wrap" }}>
            <select value={filtroAuditora} onChange={e=>setFiltroAuditora(e.target.value)} style={{ ...inputStyle, flex:1 }}>
              <option value="todas">Todas las auditoras</option>
              {listaAuditoras.map(([id,a])=><option key={id} value={id}>{a.nombre}</option>)}
            </select>
            <select value={filtroRango} onChange={e=>setFiltroRango(e.target.value)} style={{ ...inputStyle, width:130 }}>
              <option value="semana">Última semana</option>
              <option value="mes">Último mes</option>
              <option value="trimestre">Último trimestre</option>
            </select>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
            {getHistorialFiltrado().map(([dia,diaData])=>{
              const entradas = filtroAuditora==="todas"
                ? Object.entries(diaData)
                : Object.entries(diaData).filter(([id])=>id===filtroAuditora);
              if (entradas.length===0) return null;
              const totalDia = entradas.reduce((s,[,d])=>s+(d.total||0),0);
              return (
                <div key={dia} style={{ background:"#0b1523", border:"1px solid #1e2d45", borderRadius:10, padding:"11px 13px" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:7 }}>
                    <div style={{ fontSize:11, color:"#4F8EF7", fontWeight:700 }}>
                      {new Date(dia+"T12:00:00").toLocaleDateString("es-CO",{weekday:"long",day:"2-digit",month:"long",year:"numeric"})}
                    </div>
                    <div style={{ fontSize:12, color:"#00C9A7", fontWeight:700 }}>{totalDia} historias</div>
                  </div>
                  {entradas.map(([audId,datos])=>{
                    const nombreAud = auditoras[audId]?.nombre||audId;
                    return (
                      <div key={audId} style={{ marginBottom:6 }}>
                        <div style={{ fontSize:12, color:"#e8f0fe" }}>{nombreAud} — <span style={{ color:"#00C9A7", fontWeight:700 }}>{datos.total}</span></div>
                        {datos.tipos && (
                          <div style={{ display:"flex", flexWrap:"wrap", gap:3, marginTop:3 }}>
                            {Object.entries(datos.tipos).map(([key,cnt])=>{
                              const [svc,und]=key.split("__");
                              return <span key={key} style={{ fontSize:9, background:"#1e2d45", color:"#8faec4", borderRadius:4, padding:"2px 5px" }}>{svc}/{und}: {cnt}</span>;
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
            {getHistorialFiltrado().filter(([,d])=>filtroAuditora==="todas"||d[filtroAuditora]).length===0 && (
              <div style={{ fontSize:13, color:"#4f7096", textAlign:"center", padding:"20px 0" }}>No hay datos para el período seleccionado.</div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
