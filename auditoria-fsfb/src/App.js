import { useState, useEffect, useRef } from "react";
import { db } from "./firebase";
import { ref, onValue, set, update, push, remove, get } from "firebase/database";
import * as XLSX from "xlsx";

const COLORS = ["#00C9A7","#4F8EF7","#F7B731","#FC5C65","#45AAF2","#A55EEA","#FD9644","#26DE81"];
const UNIDADES = ["Cama","Camilla","Cubículo","Habitación","Otro"];
const DEFAULT_PIN = "1234";

// ─── Utilidades ──────────────────────────────────────────────────────────────
const hoy       = () => new Date().toISOString().slice(0,10);
const tsNow     = () => new Date().toLocaleTimeString("es-CO",{hour:"2-digit",minute:"2-digit",second:"2-digit"});
const fechaLarga= (iso) => new Date(iso+"T12:00:00").toLocaleDateString("es-CO",{weekday:"long",day:"2-digit",month:"long",year:"numeric"});
const fechaCorta= () => new Date().toLocaleDateString("es-CO",{day:"2-digit",month:"2-digit",year:"numeric"});

// ─── Componentes base ─────────────────────────────────────────────────────────
function RadialProgress({pct,color,size=72}){
  const r=(size-12)/2, circ=2*Math.PI*r, offset=circ-(Math.min(pct,100)/100)*circ;
  return(
    <svg width={size} height={size} style={{transform:"rotate(-90deg)"}}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#1e2a3a" strokeWidth={8}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={8}
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        style={{transition:"stroke-dashoffset 0.6s cubic-bezier(.4,2,.6,1)"}}/>
    </svg>
  );
}

function Modal({title,onClose,children,wide}){
  return(
    <div style={{position:"fixed",inset:0,background:"#000000cc",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:12}}>
      <div style={{background:"#0f1f35",border:"1px solid #1e2d45",borderRadius:18,padding:"22px 26px",width:"100%",maxWidth:wide?680:460,maxHeight:"88vh",overflowY:"auto"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
          <div style={{fontSize:15,fontWeight:700,color:"#4F8EF7"}}>{title}</div>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#4f7096",fontSize:20,cursor:"pointer"}}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

const inp = {background:"#0b1523",border:"1px solid #1e2d45",borderRadius:8,padding:"8px 11px",color:"#e8f0fe",fontSize:13,outline:"none",width:"100%",boxSizing:"border-box"};
const btn = (bg,fg="#0b1523",extra={}) => ({background:bg,color:fg,border:"none",borderRadius:8,padding:"8px 14px",cursor:"pointer",fontSize:12,fontWeight:700,...extra});

// ─── LOGIN COORDINADORA ───────────────────────────────────────────────────────
function LoginCoord({onLogin}){
  const [pin,setPin]=useState(""), [err,setErr]=useState(false);
  const handleLogin=async()=>{
    const snap=await get(ref(db,"config/pin"));
    const stored=snap.val()||DEFAULT_PIN;
    if(pin===stored){ onLogin(); }
    else{ setErr(true); setTimeout(()=>setErr(false),1500); }
  };
  return(
    <div style={{minHeight:"100vh",background:"#0b1523",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{background:"#0f1f35",border:"1px solid #1e2d45",borderRadius:20,padding:"36px 40px",width:320,textAlign:"center"}}>
        <div style={{fontSize:36,marginBottom:12}}>🔐</div>
        <div style={{fontSize:16,fontWeight:700,color:"#e8f0fe",marginBottom:4}}>Panel de Coordinación</div>
        <div style={{fontSize:12,color:"#4f7096",marginBottom:24}}>Ingresa tu PIN para continuar</div>
        <input type="password" value={pin} onChange={e=>setPin(e.target.value)}
          onKeyDown={e=>e.key==="Enter"&&handleLogin()}
          placeholder="PIN" maxLength={20}
          style={{...inp,textAlign:"center",fontSize:18,letterSpacing:4,marginBottom:12}}/>
        {err && <div style={{fontSize:12,color:"#FC5C65",marginBottom:8}}>PIN incorrecto</div>}
        <button onClick={handleLogin} style={{...btn("linear-gradient(135deg,#4F8EF7,#00C9A7)","#fff"),width:"100%",padding:"11px 0",fontSize:14}}>
          Ingresar
        </button>
      </div>
    </div>
  );
}

// ─── APP PRINCIPAL ────────────────────────────────────────────────────────────
export default function App(){
  const [rol,setRol]=useState(null); // null=sin rol | "auditora" | "coord"
  const [auditoras,setAuditoras]=useState({});
  const [servicios,setServicios]=useState({});
  const [config,setConfig]=useState({institucion:"",area:"",pin:DEFAULT_PIN});
  const [log,setLog]=useState([]);
  const [historial,setHistorial]=useState({});
  const [connected,setConnected]=useState(true);
  const [pulse,setPulse]=useState(null);
  const [registro,setRegistro]=useState({});

  // Vistas coordinadora
  const [coordView,setCoordView]=useState("dashboard"); // dashboard|config|log|historial
  // Modales
  const [modalAuditora,setModalAuditora]=useState(null);
  const [modalEditLog,setModalEditLog]=useState(null);
  const [historialFiltroAud,setHistorialFiltroAud]=useState("todas");
  const [historialRango,setHistorialRango]=useState("semana");
  const [nuevoServicio,setNuevoServicio]=useState("");
  const [formAuditora,setFormAuditora]=useState({nombre:"",meta:30,servicios:[]});
  const [newPin,setNewPin]=useState("");
  const [pinMsg,setPinMsg]=useState("");

  // Firebase listeners
  useEffect(()=>{
    const pairs=[
      [ref(db,"config"),(s)=>setConfig(s.val()||{institucion:"",area:"",pin:DEFAULT_PIN})],
      [ref(db,"auditoras"),(s)=>{setAuditoras(s.val()||{});setConnected(true);}],
      [ref(db,"servicios"),(s)=>setServicios(s.val()||{})],
      [ref(db,"historial"),(s)=>setHistorial(s.val()||{})],
      [ref(db,"log"),(s)=>{
        const d=s.val();
        setLog(d?Object.entries(d).map(([id,v])=>({...v,_id:id})).sort((a,b)=>b.ts_ms-a.ts_ms).slice(0,200):[]);
      }],
    ];
    const unsubs=pairs.map(([r,cb])=>onValue(r,cb,()=>setConnected(false)));
    return()=>unsubs.forEach(u=>u());
  },[]);

  // ── Registro de historia (auditora) ──
  const registrar=async(auditoraId)=>{
    const a=auditoras[auditoraId]; if(!a) return;
    const reg=registro[auditoraId]||{};
    const servicio=reg.servicio||"";
    const unidad=reg.unidad||"Cama";
    const numero=reg.numero||"";
    if(!servicio){alert("Selecciona un servicio antes de registrar.");return;}
    const nuevas=(a.historias||0)+1;
    const key=`${servicio}__${unidad}`;
    const tipos={...(a.tipos||{}),[key]:((a.tipos||{})[key]||0)+1};
    await update(ref(db,`auditoras/${auditoraId}`),{historias:nuevas,tipos});
    const dia=hoy();
    const diaActual=(historial[dia]&&historial[dia][auditoraId])||{total:0,tipos:{}};
    const nuevosTipos={...(diaActual.tipos||{}),[key]:((diaActual.tipos||{})[key]||0)+1};
    await update(ref(db,`historial/${dia}/${auditoraId}`),{total:(diaActual.total||0)+1,tipos:nuevosTipos});
    const logEntry={ts:tsNow(),ts_ms:Date.now(),nombre:a.nombre,auditoraId,delta:1,total:nuevas,servicio,unidad,numero};
    await push(ref(db,"log"),logEntry);
    setPulse(auditoraId);
    setTimeout(()=>setPulse(null),600);
  };

  const setReg=(id,campo,val)=>setRegistro(r=>({...r,[id]:{...(r[id]||{}),[campo]:val}}));

  // ── Coordinadora: editar log ──
  const guardarEdicionLog=async(logId,cambios)=>{
    await update(ref(db,`log/${logId}`),cambios);
    // Recalcular conteo de auditora basado en log
    const audId=cambios.auditoraId||(log.find(l=>l._id===logId)||{}).auditoraId;
    if(audId){
      const logsAud=log.filter(l=>l.auditoraId===audId&&l._id!==logId&&l.tipo!=="reset");
      const totalRecalc=logsAud.reduce((s,l)=>s+(l.delta||0),0)+(cambios.delta||1);
      // Reconstruir tipos
      const todosLogs=[...logsAud,{...log.find(l=>l._id===logId),...cambios}];
      const tipos={};
      todosLogs.forEach(l=>{
        const k=`${l.servicio}__${l.unidad}`;
        tipos[k]=(tipos[k]||0)+(l.delta||0);
      });
      await update(ref(db,`auditoras/${audId}`),{historias:totalRecalc,tipos});
    }
    setModalEditLog(null);
  };

  const eliminarLogEntry=async(entry)=>{
    if(!window.confirm("¿Eliminar este registro? El conteo de la auditora se ajustará.")) return;
    await remove(ref(db,`log/${entry._id}`));
    // Restar del conteo
    const audId=entry.auditoraId;
    if(audId&&auditoras[audId]){
      const a=auditoras[audId];
      const nuevas=Math.max(0,(a.historias||0)-(entry.delta||1));
      const key=`${entry.servicio}__${entry.unidad}`;
      const tipos={...(a.tipos||{})};
      if(tipos[key]) tipos[key]=Math.max(0,tipos[key]-(entry.delta||1));
      await update(ref(db,`auditoras/${audId}`),{historias:nuevas,tipos});
      // Ajustar historial del día
      const dia=entry.ts_ms?new Date(entry.ts_ms).toISOString().slice(0,10):hoy();
      const diaData=(historial[dia]&&historial[dia][audId])||{total:0,tipos:{}};
      const nuevosTipos={...(diaData.tipos||{})};
      if(nuevosTipos[key]) nuevosTipos[key]=Math.max(0,(nuevosTipos[key]||0)-(entry.delta||1));
      await update(ref(db,`historial/${dia}/${audId}`),{total:Math.max(0,(diaData.total||0)-(entry.delta||1)),tipos:nuevosTipos});
    }
  };

  // ── Coordinadora: ajuste directo de conteo ──
  const ajustarConteo=async(audId,delta)=>{
    const a=auditoras[audId]; if(!a) return;
    const nuevas=Math.max(0,(a.historias||0)+delta);
    await update(ref(db,`auditoras/${audId}`),{historias:nuevas});
    await push(ref(db,"log"),{ts:tsNow(),ts_ms:Date.now(),nombre:a.nombre,auditoraId:audId,delta,total:nuevas,servicio:"Ajuste manual",unidad:"—",numero:"",esAjuste:true});
  };

  // ── Reset ──
  const resetAll=async()=>{
    if(!window.confirm("¿Reiniciar todos los conteos del día?")) return;
    const updates={};
    Object.keys(auditoras).forEach(id=>{updates[`auditoras/${id}/historias`]=0;updates[`auditoras/${id}/tipos`]={};});
    await update(ref(db),updates);
    await push(ref(db,"log"),{ts:tsNow(),ts_ms:Date.now(),nombre:"Sistema",delta:0,total:0,tipo:"reset"});
  };

  // ── Servicios ──
  const agregarServicio=async()=>{if(!nuevoServicio.trim())return;await push(ref(db,"servicios"),{nombre:nuevoServicio.trim()});setNuevoServicio("");};
  const eliminarServicio=async(id)=>{if(!window.confirm("¿Eliminar este servicio?"))return;await remove(ref(db,`servicios/${id}`));};

  // ── Auditoras ──
  const abrirNueva=()=>{setFormAuditora({nombre:"",meta:30,servicios:[]});setModalAuditora("new");};
  const abrirEditar=(id)=>{const a=auditoras[id];setFormAuditora({nombre:a.nombre,meta:a.meta||30,servicios:a.servicios||[]});setModalAuditora(id);};
  const guardarAuditora=async()=>{
    if(!formAuditora.nombre.trim())return;
    const data={nombre:formAuditora.nombre.trim(),meta:parseInt(formAuditora.meta)||30,servicios:formAuditora.servicios};
    if(modalAuditora==="new") await push(ref(db,"auditoras"),{...data,historias:0,tipos:{}});
    else await update(ref(db,`auditoras/${modalAuditora}`),data);
    setModalAuditora(null);
  };
  const eliminarAuditora=async(id)=>{if(!window.confirm("¿Eliminar?"))return;await remove(ref(db,`auditoras/${id}`));};
  const toggleSvcAuditora=(sid)=>{
    const cur=formAuditora.servicios||[];
    setFormAuditora(f=>({...f,servicios:cur.includes(sid)?cur.filter(x=>x!==sid):[...cur,sid]}));
  };

  // ── Config ──
  const guardarConfig=async(campo,valor)=>await update(ref(db,"config"),{[campo]:valor});
  const cambiarPin=async()=>{
    if(newPin.length<4){setPinMsg("El PIN debe tener al menos 4 caracteres.");return;}
    await guardarConfig("pin",newPin);
    setNewPin("");setPinMsg("✅ PIN actualizado correctamente.");
    setTimeout(()=>setPinMsg(""),3000);
  };

  // ── Excel ──
  const exportToExcel=()=>{
    const wb=XLSX.utils.book_new();
    const listaA=Object.entries(auditoras);
    const listaS=Object.values(servicios).map(s=>s.nombre);
    const hoy2=fechaCorta(),ahora=tsNow();
    // Hoja 1: Resumen
    const rows1=[
      [config.institucion||"Institución"],[`${config.area||"Auditoría"} — ${hoy2}  ${ahora}`],[],
      ["Auditora","Total","Meta","% Cumpl.","Estado",...listaS.flatMap(s=>UNIDADES.map(u=>`${s}/${u}`))],
      ...listaA.map(([,a])=>{
        const pct=(a.meta||30)>0?a.historias/(a.meta||30):0;
        return[a.nombre,a.historias||0,a.meta||30,pct,pct>=1?"✅ Cumplida":pct>=0.7?"🟡 En progreso":"🔴 Por debajo",
          ...listaS.flatMap(s=>UNIDADES.map(u=>(a.tipos&&a.tipos[`${s}__${u}`])||0))];
      }),
      [],[" TOTAL",listaA.reduce((s,[,a])=>s+(a.historias||0),0),listaA.reduce((s,[,a])=>s+(a.meta||30),0)]
    ];
    const ws1=XLSX.utils.aoa_to_sheet(rows1);
    ws1["!cols"]=[{wch:26},{wch:8},{wch:8},{wch:12},{wch:18},...listaS.flatMap(()=>UNIDADES.map(()=>({wch:14})))];
    listaA.forEach((_,i)=>{const c=`D${5+i}`;if(ws1[c])ws1[c].z="0.0%";});
    XLSX.utils.book_append_sheet(wb,ws1,"Resumen del día");
    // Hoja 2: Historial
    const dias=Object.keys(historial).sort().reverse();
    if(dias.length>0){
      const rows2=[["Historial por día"],[],["Fecha","Auditora","Total",...listaS.flatMap(s=>UNIDADES.map(u=>`${s}/${u}`))],
        ...dias.flatMap(dia=>listaA.map(([id,a])=>{
          const d=historial[dia]&&historial[dia][id];if(!d)return null;
          return[dia,a.nombre,d.total||0,...listaS.flatMap(s=>UNIDADES.map(u=>(d.tipos&&d.tipos[`${s}__${u}`])||0))];
        }).filter(Boolean))
      ];
      const ws2=XLSX.utils.aoa_to_sheet(rows2);
      ws2["!cols"]=[{wch:12},{wch:26},{wch:10},...listaS.flatMap(()=>UNIDADES.map(()=>({wch:14})))];
      XLSX.utils.book_append_sheet(wb,ws2,"Historial por día");
    }
    // Hoja 3: Log
    if(log.length>0){
      const rows3=[["Registro de actividad"],[],["Hora","Auditora","Servicio","Unidad","N°","Total","Tipo"],
        ...log.map(e=>[e.ts,e.nombre,e.servicio||"—",e.unidad||"—",e.numero||"—",e.tipo==="reset"?"Reinicio":e.total,e.esAjuste?"Ajuste manual":e.tipo==="reset"?"Reinicio":"Registro"])
      ];
      const ws3=XLSX.utils.aoa_to_sheet(rows3);
      ws3["!cols"]=[{wch:12},{wch:26},{wch:18},{wch:12},{wch:8},{wch:10},{wch:14}];
      XLSX.utils.book_append_sheet(wb,ws3,"Registro de actividad");
    }
    XLSX.writeFile(wb,`Auditoria_${(config.institucion||"IPS").replace(/\s+/g,"_")}_${hoy2.replace(/\//g,"-")}.xlsx`);
  };

  // ── Historial filtrado ──
  const getHistorialFiltrado=()=>{
    const dias=historialRango==="semana"?7:historialRango==="mes"?30:90;
    return Object.entries(historial)
      .filter(([d])=>(new Date()-new Date(d+"T12:00:00"))/86400000<=dias)
      .sort(([a],[b])=>b.localeCompare(a));
  };

  // ── Cálculos globales ──
  const listaAuditoras=Object.entries(auditoras);
  const listaServicios=Object.entries(servicios);
  const total=listaAuditoras.reduce((s,[,a])=>s+(a.historias||0),0);
  const totalMeta=listaAuditoras.reduce((s,[,a])=>s+(a.meta||30),0);
  const pctGlobal=totalMeta>0?Math.round((total/totalMeta)*100):0;

  // ── Pantalla de selección de rol ──
  if(!rol){
    return(
      <div style={{minHeight:"100vh",background:"#0b1523",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16,padding:20}}>
        <div style={{width:48,height:48,borderRadius:14,background:"linear-gradient(135deg,#00C9A7,#4F8EF7)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,marginBottom:8}}>📋</div>
        <div style={{fontSize:18,fontWeight:800,color:"#e8f0fe"}}>Monitor de Auditoría Concurrente</div>
        <div style={{fontSize:13,color:"#4f7096",marginBottom:8}}>{config.institucion||"Cargando..."}</div>
        <div style={{display:"flex",gap:14,flexWrap:"wrap",justifyContent:"center"}}>
          <button onClick={()=>setRol("auditora")} style={{background:"linear-gradient(135deg,#00C9A7,#26DE81)",color:"#0b1523",border:"none",borderRadius:14,padding:"22px 36px",cursor:"pointer",fontWeight:800,fontSize:15,display:"flex",flexDirection:"column",alignItems:"center",gap:8,minWidth:160}}>
            <span style={{fontSize:32}}>👩‍⚕️</span>Soy auditora
          </button>
          <button onClick={()=>setRol("coord")} style={{background:"linear-gradient(135deg,#4F8EF7,#A55EEA)",color:"#fff",border:"none",borderRadius:14,padding:"22px 36px",cursor:"pointer",fontWeight:800,fontSize:15,display:"flex",flexDirection:"column",alignItems:"center",gap:8,minWidth:160}}>
            <span style={{fontSize:32}}>🔐</span>Soy coordinadora
          </button>
        </div>
      </div>
    );
  }

  // ── Login coordinadora ──
  if(rol==="coord"){
    const [autenticada,setAutenticada]=useState(false);
    if(!autenticada) return <LoginCoord onLogin={()=>setAutenticada(true)}/>;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // VISTA AUDITORA
  // ─────────────────────────────────────────────────────────────────────────────
  if(rol==="auditora"){
    return(
      <div style={{minHeight:"100vh",background:"#0b1523",fontFamily:"'DM Sans','Segoe UI',sans-serif",color:"#e8f0fe"}}>
        {/* Header auditora */}
        <div style={{background:"linear-gradient(135deg,#0f1f35,#0b1523)",borderBottom:"1px solid #1e2d45",padding:"12px 18px",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8,position:"sticky",top:0,zIndex:100}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:30,height:30,borderRadius:8,background:"linear-gradient(135deg,#00C9A7,#4F8EF7)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>📋</div>
            <div>
              <div style={{fontSize:12,fontWeight:700}}>Auditoría Concurrente</div>
              <div style={{fontSize:10,color:"#4f7096"}}>{config.institucion||"—"} · {config.area||"—"}</div>
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{fontSize:11,padding:"3px 8px",borderRadius:6,background:connected?"#0d2a1e":"#2a1010",color:connected?"#26DE81":"#FC5C65",border:`1px solid ${connected?"#1a4a30":"#4a1a1a"}`}}>{connected?"● En línea":"● Sin conexión"}</div>
            <button onClick={()=>setRol(null)} style={{...btn("#1e2d45","#4f7096"),fontSize:11}}>← Salir</button>
          </div>
        </div>

        {/* Resumen pequeño */}
        <div style={{padding:"12px 18px 0"}}>
          <div style={{background:"#0f1f35",border:"1px solid #1e2d45",borderRadius:12,padding:"12px 18px",display:"flex",alignItems:"center",gap:20,flexWrap:"wrap"}}>
            <div>
              <div style={{fontSize:10,color:"#4f7096",textTransform:"uppercase",letterSpacing:"0.08em"}}>Total hoy</div>
              <div style={{fontSize:34,fontWeight:800,color:"#00C9A7",lineHeight:1}}>{total}<span style={{fontSize:14,color:"#4f7096",fontWeight:400,marginLeft:6}}>/ {totalMeta}</span></div>
            </div>
            <div style={{flex:1,minWidth:120}}>
              <div style={{height:5,background:"#1e2d45",borderRadius:99,overflow:"hidden"}}>
                <div style={{height:"100%",borderRadius:99,background:pctGlobal>=100?"#26DE81":"linear-gradient(90deg,#00C9A7,#4F8EF7)",width:`${Math.min(pctGlobal,100)}%`,transition:"width 0.6s ease"}}/>
              </div>
              <div style={{fontSize:10,color:"#4f7096",marginTop:4}}>{pctGlobal}% meta grupal</div>
            </div>
          </div>
        </div>

        {/* Tarjetas auditoras */}
        <div style={{padding:"12px 18px"}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:12}}>
            {listaAuditoras.map(([id,a],i)=>{
              const color=COLORS[i%COLORS.length];
              const pct=(a.meta||30)>0?Math.round(((a.historias||0)/a.meta)*100):0;
              const isPulsing=pulse===id;
              const svcsDisp=listaServicios.filter(([sid])=>(a.servicios||[]).includes(sid));
              const reg=registro[id]||{};
              return(
                <div key={id} style={{background:"linear-gradient(145deg,#0f1f35,#0d1a2d)",border:`1px solid ${isPulsing?color:"#1e2d45"}`,borderRadius:16,padding:"15px 17px",transition:"all 0.3s",transform:isPulsing?"scale(1.02)":"scale(1)",boxShadow:isPulsing?`0 0 18px ${color}44`:"none"}}>
                  <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between"}}>
                    <div>
                      <div style={{fontSize:10,color,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:2}}>{a.nombre}</div>
                      <div style={{fontSize:38,fontWeight:800,color:"#e8f0fe",lineHeight:1,letterSpacing:"-1px"}}>{a.historias||0}</div>
                      <div style={{fontSize:11,color:"#4f7096",marginTop:2}}>de {a.meta} · {pct}%</div>
                    </div>
                    <div style={{position:"relative"}}>
                      <RadialProgress pct={pct} color={color} size={64}/>
                      <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,color}}>{pct}%</div>
                    </div>
                  </div>
                  <div style={{marginTop:10,display:"flex",flexDirection:"column",gap:5}}>
                    <select value={reg.servicio||""} onChange={e=>setReg(id,"servicio",e.target.value)} style={{...inp,fontSize:12}}>
                      <option value="">— Selecciona servicio —</option>
                      {svcsDisp.map(([sid,s])=><option key={sid} value={s.nombre}>{s.nombre}</option>)}
                    </select>
                    <div style={{display:"flex",gap:5}}>
                      <select value={reg.unidad||"Cama"} onChange={e=>setReg(id,"unidad",e.target.value)} style={{...inp,fontSize:12,flex:1}}>
                        {UNIDADES.map(u=><option key={u} value={u}>{u}</option>)}
                      </select>
                      <input type="number" placeholder="N°" value={reg.numero||""} onChange={e=>setReg(id,"numero",e.target.value)} style={{...inp,width:56,fontSize:12}}/>
                    </div>
                  </div>
                  {a.tipos&&Object.keys(a.tipos).length>0&&(
                    <div style={{marginTop:7,display:"flex",flexWrap:"wrap",gap:3}}>
                      {Object.entries(a.tipos).map(([key,cnt])=>{
                        const[svc,und]=key.split("__");
                        return<span key={key} style={{fontSize:9,background:`${color}22`,color,border:`1px solid ${color}44`,borderRadius:5,padding:"2px 5px"}}>{svc}/{und}: {cnt}</span>;
                      })}
                    </div>
                  )}
                  <div style={{marginTop:9,height:4,background:"#1e2d45",borderRadius:99,overflow:"hidden"}}>
                    <div style={{height:"100%",borderRadius:99,background:pct>=100?"#26DE81":color,width:`${Math.min(pct,100)}%`,transition:"width 0.5s ease"}}/>
                  </div>
                  <button onClick={()=>registrar(id)} style={{width:"100%",marginTop:11,padding:"11px 0",background:`${color}22`,color,border:`1px solid ${color}55`,borderRadius:10,fontSize:13,cursor:"pointer",fontWeight:700}}>
                    + Registrar historia
                  </button>
                  {pct>=100&&<div style={{marginTop:7,textAlign:"center",fontSize:11,color:"#26DE81",fontWeight:700}}>✅ Meta cumplida</div>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // VISTA COORDINADORA (autenticada)
  // ─────────────────────────────────────────────────────────────────────────────
  const navItems=[
    {id:"dashboard",label:"Dashboard",icon:"📊"},
    {id:"log",label:"Registros",icon:"📝"},
    {id:"historial",label:"Historial",icon:"📅"},
    {id:"config",label:"Configuración",icon:"⚙"},
  ];

  return(
    <div style={{minHeight:"100vh",background:"#0b1523",fontFamily:"'DM Sans','Segoe UI',sans-serif",color:"#e8f0fe"}}>
      {/* Header coordinadora */}
      <div style={{background:"linear-gradient(135deg,#0f1f35,#0b1523)",borderBottom:"1px solid #1e2d45",padding:"12px 18px",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8,position:"sticky",top:0,zIndex:100}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:30,height:30,borderRadius:8,background:"linear-gradient(135deg,#4F8EF7,#A55EEA)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>🔐</div>
          <div>
            <div style={{fontSize:12,fontWeight:700}}>Panel de Coordinación</div>
            <div style={{fontSize:10,color:"#4f7096"}}>{config.institucion||"—"} · {config.area||"—"}</div>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:7,flexWrap:"wrap"}}>
          <div style={{fontSize:11,padding:"3px 8px",borderRadius:6,background:connected?"#0d2a1e":"#2a1010",color:connected?"#26DE81":"#FC5C65",border:`1px solid ${connected?"#1a4a30":"#4a1a1a"}`}}>{connected?"● En línea":"● Sin conexión"}</div>
          <button onClick={exportToExcel} style={btn("linear-gradient(135deg,#26DE81,#00C9A7)")}>📥 Excel</button>
          <button onClick={resetAll} style={{...btn("#1e1530","#FC5C65"),border:"1px solid #3d1f2b"}}>↺ Reiniciar</button>
          <button onClick={()=>setRol(null)} style={{...btn("#1e2d45","#4f7096"),fontSize:11}}>← Salir</button>
        </div>
      </div>

      {/* Nav coordinadora */}
      <div style={{background:"#0b1a2a",borderBottom:"1px solid #1e2d45",padding:"0 18px",display:"flex",gap:4}}>
        {navItems.map(n=>(
          <button key={n.id} onClick={()=>setCoordView(n.id)} style={{background:"none",border:"none",borderBottom:`2px solid ${coordView===n.id?"#4F8EF7":"transparent"}`,color:coordView===n.id?"#4F8EF7":"#4f7096",padding:"10px 14px",cursor:"pointer",fontSize:12,fontWeight:coordView===n.id?700:400,transition:"all 0.2s"}}>
            {n.icon} {n.label}
          </button>
        ))}
      </div>

      <div style={{padding:"16px 18px"}}>

        {/* ── DASHBOARD COORDINADORA ── */}
        {coordView==="dashboard"&&(
          <>
            {/* Resumen global */}
            <div style={{background:"linear-gradient(135deg,#0f1f35,#111f33)",border:"1px solid #1e2d45",borderRadius:16,padding:"18px 22px",marginBottom:16,display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:14}}>
              <div>
                <div style={{fontSize:11,color:"#4f7096",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:4}}>Total revisadas hoy</div>
                <div style={{fontSize:46,fontWeight:800,color:"#00C9A7",lineHeight:1,letterSpacing:"-2px"}}>{total}<span style={{fontSize:16,color:"#4f7096",fontWeight:400,marginLeft:8}}>/ {totalMeta}</span></div>
                <div style={{marginTop:8,height:5,background:"#1e2d45",borderRadius:99,width:230,overflow:"hidden"}}>
                  <div style={{height:"100%",borderRadius:99,background:pctGlobal>=100?"#26DE81":"linear-gradient(90deg,#00C9A7,#4F8EF7)",width:`${Math.min(pctGlobal,100)}%`,transition:"width 0.6s ease"}}/>
                </div>
                <div style={{fontSize:11,color:"#4f7096",marginTop:5}}>{pctGlobal}% de la meta grupal</div>
              </div>
              <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
                {[{label:"Auditoras",val:listaAuditoras.length,icon:"👩‍⚕️"},{label:"Promedio",val:listaAuditoras.length>0?Math.round(total/listaAuditoras.length):0,icon:"📊"},{label:"Mayor",val:listaAuditoras.length>0?Math.max(...listaAuditoras.map(([,a])=>a.historias||0)):0,icon:"🏆"}].map(s=>(
                  <div key={s.label} style={{background:"#0b1523",border:"1px solid #1e2d45",borderRadius:11,padding:"10px 14px",textAlign:"center",minWidth:78}}>
                    <div style={{fontSize:17}}>{s.icon}</div>
                    <div style={{fontSize:22,fontWeight:800,marginTop:2}}>{s.val}</div>
                    <div style={{fontSize:10,color:"#4f7096",marginTop:1}}>{s.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Tarjetas con ajuste de conteo */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(270px,1fr))",gap:12}}>
              {listaAuditoras.map(([id,a],i)=>{
                const color=COLORS[i%COLORS.length];
                const pct=(a.meta||30)>0?Math.round(((a.historias||0)/a.meta)*100):0;
                return(
                  <div key={id} style={{background:"linear-gradient(145deg,#0f1f35,#0d1a2d)",border:"1px solid #1e2d45",borderRadius:16,padding:"15px 17px"}}>
                    <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between"}}>
                      <div>
                        <div style={{fontSize:10,color,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:2}}>{a.nombre}</div>
                        <div style={{fontSize:36,fontWeight:800,color:"#e8f0fe",lineHeight:1,letterSpacing:"-1px"}}>{a.historias||0}</div>
                        <div style={{fontSize:11,color:"#4f7096",marginTop:2}}>de {a.meta} · {pct}%</div>
                      </div>
                      <div style={{position:"relative"}}>
                        <RadialProgress pct={pct} color={color} size={62}/>
                        <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,color}}>{pct}%</div>
                      </div>
                    </div>
                    {/* Desglose */}
                    {a.tipos&&Object.keys(a.tipos).length>0&&(
                      <div style={{marginTop:7,display:"flex",flexWrap:"wrap",gap:3}}>
                        {Object.entries(a.tipos).map(([key,cnt])=>{
                          const[svc,und]=key.split("__");
                          return<span key={key} style={{fontSize:9,background:`${color}22`,color,border:`1px solid ${color}44`,borderRadius:5,padding:"2px 5px"}}>{svc}/{und}: {cnt}</span>;
                        })}
                      </div>
                    )}
                    <div style={{marginTop:9,height:4,background:"#1e2d45",borderRadius:99,overflow:"hidden"}}>
                      <div style={{height:"100%",borderRadius:99,background:pct>=100?"#26DE81":color,width:`${Math.min(pct,100)}%`,transition:"width 0.5s ease"}}/>
                    </div>
                    {/* Ajuste manual de conteo */}
                    <div style={{marginTop:10,display:"flex",gap:6,alignItems:"center"}}>
                      <span style={{fontSize:11,color:"#4f7096",flex:1}}>Ajuste manual:</span>
                      <button onClick={()=>ajustarConteo(id,-1)} style={{...btn("#1e2d45","#FC5C65"),padding:"5px 12px",fontSize:14}}>−</button>
                      <button onClick={()=>ajustarConteo(id,1)} style={{...btn("#1e2d45","#26DE81"),padding:"5px 12px",fontSize:14}}>+</button>
                      <button onClick={()=>{setCoordView("log");}} style={{...btn("#1e2d45","#4F8EF7"),fontSize:11,padding:"5px 10px"}}>Ver log</button>
                    </div>
                    {pct>=100&&<div style={{marginTop:7,textAlign:"center",fontSize:11,color:"#26DE81",fontWeight:700}}>✅ Meta cumplida</div>}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* ── LOG EDITABLE ── */}
        {coordView==="log"&&(
          <div>
            <div style={{fontSize:14,fontWeight:700,marginBottom:14,color:"#4F8EF7"}}>📝 Registros individuales</div>
            <div style={{fontSize:12,color:"#4f7096",marginBottom:12}}>
              Puedes editar o eliminar cualquier registro. El conteo de la auditora se ajusta automáticamente.
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {log.filter(e=>e.tipo!=="reset").map((entry,i)=>{
                const a=auditoras[entry.auditoraId];
                const color=a?COLORS[listaAuditoras.findIndex(([id])=>id===entry.auditoraId)%COLORS.length]:"#4f7096";
                return(
                  <div key={entry._id||i} style={{background:"#0f1f35",border:"1px solid #1e2d45",borderLeft:`4px solid ${color}`,borderRadius:10,padding:"11px 14px",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                    <div style={{flex:1,minWidth:180}}>
                      <div style={{fontSize:12,fontWeight:700,color:"#e8f0fe"}}>{entry.nombre}</div>
                      <div style={{fontSize:11,color:"#4f7096",marginTop:2}}>
                        {entry.ts} · {entry.servicio||"—"} / {entry.unidad||"—"}{entry.numero?` #${entry.numero}`:""} 
                        {entry.esAjuste&&<span style={{marginLeft:6,background:"#F7B73122",color:"#F7B731",borderRadius:4,padding:"1px 5px",fontSize:9}}>Ajuste manual</span>}
                      </div>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:5}}>
                      <span style={{fontSize:11,color:"#4f7096"}}>Total:</span>
                      <span style={{fontSize:13,fontWeight:700,color:"#00C9A7"}}>{entry.total}</span>
                    </div>
                    <div style={{display:"flex",gap:5}}>
                      <button onClick={()=>setModalEditLog(entry)} style={btn("#1e2d45","#4F8EF7")}>✏ Editar</button>
                      <button onClick={()=>eliminarLogEntry(entry)} style={{...btn("#1e1530","#FC5C65"),border:"1px solid #3d1f2b"}}>🗑</button>
                    </div>
                  </div>
                );
              })}
              {log.filter(e=>e.tipo!=="reset").length===0&&(
                <div style={{fontSize:13,color:"#4f7096",textAlign:"center",padding:"30px 0"}}>No hay registros aún.</div>
              )}
            </div>
          </div>
        )}

        {/* ── HISTORIAL ── */}
        {coordView==="historial"&&(
          <div>
            <div style={{fontSize:14,fontWeight:700,marginBottom:14,color:"#4F8EF7"}}>📅 Historial de auditoría</div>
            <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
              <select value={historialFiltroAud} onChange={e=>setHistorialFiltroAud(e.target.value)} style={{...inp,flex:1,maxWidth:260}}>
                <option value="todas">Todas las auditoras</option>
                {listaAuditoras.map(([id,a])=><option key={id} value={id}>{a.nombre}</option>)}
              </select>
              <select value={historialRango} onChange={e=>setHistorialRango(e.target.value)} style={{...inp,width:150}}>
                <option value="semana">Última semana</option>
                <option value="mes">Último mes</option>
                <option value="trimestre">Último trimestre</option>
              </select>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {getHistorialFiltrado().map(([dia,diaData])=>{
                const entradas=historialFiltroAud==="todas"?Object.entries(diaData):Object.entries(diaData).filter(([id])=>id===historialFiltroAud);
                if(entradas.length===0)return null;
                const totalDia=entradas.reduce((s,[,d])=>s+(d.total||0),0);
                return(
                  <div key={dia} style={{background:"#0f1f35",border:"1px solid #1e2d45",borderRadius:12,padding:"13px 16px"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                      <div style={{fontSize:12,color:"#4F8EF7",fontWeight:700}}>{fechaLarga(dia)}</div>
                      <div style={{fontSize:13,color:"#00C9A7",fontWeight:700}}>{totalDia} historias</div>
                    </div>
                    {entradas.map(([audId,datos])=>{
                      const nombreAud=auditoras[audId]?.nombre||audId;
                      const idx=listaAuditoras.findIndex(([id])=>id===audId);
                      const color=COLORS[idx%COLORS.length]||"#4f7096";
                      return(
                        <div key={audId} style={{marginBottom:7,paddingLeft:8,borderLeft:`3px solid ${color}`}}>
                          <div style={{fontSize:12,color:"#e8f0fe"}}>{nombreAud} — <span style={{color:"#00C9A7",fontWeight:700}}>{datos.total}</span></div>
                          {datos.tipos&&(
                            <div style={{display:"flex",flexWrap:"wrap",gap:3,marginTop:3}}>
                              {Object.entries(datos.tipos).map(([key,cnt])=>{
                                const[svc,und]=key.split("__");
                                return<span key={key} style={{fontSize:9,background:"#1e2d45",color:"#8faec4",borderRadius:4,padding:"2px 5px"}}>{svc}/{und}: {cnt}</span>;
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
              {getHistorialFiltrado().length===0&&<div style={{fontSize:13,color:"#4f7096",textAlign:"center",padding:"30px 0"}}>No hay datos para el período seleccionado.</div>}
            </div>
          </div>
        )}

        {/* ── CONFIGURACIÓN COORDINADORA ── */}
        {coordView==="config"&&(
          <div style={{maxWidth:560}}>
            <div style={{fontSize:14,fontWeight:700,marginBottom:14,color:"#4F8EF7"}}>⚙ Configuración</div>

            {/* Institución */}
            <div style={{background:"#0f1f35",border:"1px solid #1e2d45",borderRadius:13,padding:"15px 17px",marginBottom:13}}>
              <div style={{fontSize:11,color:"#4f7096",marginBottom:10,textTransform:"uppercase"}}>🏥 Institución</div>
              <div style={{display:"flex",flexDirection:"column",gap:7}}>
                <input key={"inst"+config.institucion} defaultValue={config.institucion} placeholder="Nombre de la institución" onBlur={e=>guardarConfig("institucion",e.target.value)} style={inp}/>
                <input key={"area"+config.area} defaultValue={config.area} placeholder="Área (ej. Auditoría Clínica)" onBlur={e=>guardarConfig("area",e.target.value)} style={inp}/>
              </div>
              <div style={{fontSize:10,color:"#4f7096",marginTop:5}}>Los cambios se guardan al salir del campo</div>
            </div>

            {/* PIN */}
            <div style={{background:"#0f1f35",border:"1px solid #1e2d45",borderRadius:13,padding:"15px 17px",marginBottom:13}}>
              <div style={{fontSize:11,color:"#4f7096",marginBottom:10,textTransform:"uppercase"}}>🔐 Cambiar PIN de coordinadora</div>
              <div style={{display:"flex",gap:7}}>
                <input type="password" value={newPin} onChange={e=>setNewPin(e.target.value)} placeholder="Nuevo PIN (mín. 4 caracteres)" style={{...inp,flex:1}}/>
                <button onClick={cambiarPin} style={btn("#4F8EF7","#fff")}>Guardar</button>
              </div>
              {pinMsg&&<div style={{fontSize:12,color:pinMsg.startsWith("✅")?"#26DE81":"#FC5C65",marginTop:7}}>{pinMsg}</div>}
            </div>

            {/* Servicios */}
            <div style={{background:"#0f1f35",border:"1px solid #1e2d45",borderRadius:13,padding:"15px 17px",marginBottom:13}}>
              <div style={{fontSize:11,color:"#4f7096",marginBottom:10,textTransform:"uppercase"}}>🏷 Servicios</div>
              <div style={{display:"flex",gap:7,marginBottom:10}}>
                <input value={nuevoServicio} onChange={e=>setNuevoServicio(e.target.value)} placeholder="Ej: Urgencias, UCI..." onKeyDown={e=>e.key==="Enter"&&agregarServicio()} style={{...inp,flex:1}}/>
                <button onClick={agregarServicio} style={btn("#00C9A7")}>+ Agregar</button>
              </div>
              <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                {listaServicios.map(([sid,s])=>(
                  <div key={sid} style={{display:"flex",alignItems:"center",gap:5,background:"#0b1523",border:"1px solid #1e2d45",borderRadius:7,padding:"4px 9px"}}>
                    <span style={{fontSize:12}}>{s.nombre}</span>
                    <button onClick={()=>eliminarServicio(sid)} style={{background:"none",border:"none",color:"#FC5C65",cursor:"pointer",fontSize:11,padding:0}}>✕</button>
                  </div>
                ))}
                {listaServicios.length===0&&<div style={{fontSize:12,color:"#4f7096"}}>Agrega el primer servicio.</div>}
              </div>
            </div>

            {/* Auditoras */}
            <div style={{background:"#0f1f35",border:"1px solid #1e2d45",borderRadius:13,padding:"15px 17px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:11}}>
                <div style={{fontSize:11,color:"#4f7096",textTransform:"uppercase"}}>👩‍⚕️ Auditoras</div>
                <button onClick={abrirNueva} style={btn("#00C9A7")}>+ Nueva</button>
              </div>
              {listaAuditoras.map(([id,a],i)=>{
                const color=COLORS[i%COLORS.length];
                return(
                  <div key={id} style={{borderLeft:`4px solid ${color}`,background:"#0b1523",border:"1px solid #1e2d45",borderRadius:9,padding:"10px 13px",marginBottom:7}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                      <div>
                        <div style={{fontWeight:700,fontSize:13}}>{a.nombre}</div>
                        <div style={{fontSize:11,color:"#4f7096",marginTop:1}}>Meta: {a.meta} · {(a.servicios||[]).length} servicios</div>
                        <div style={{display:"flex",flexWrap:"wrap",gap:3,marginTop:4}}>
                          {listaServicios.filter(([sid])=>(a.servicios||[]).includes(sid)).map(([sid,s])=>(
                            <span key={sid} style={{fontSize:9,background:`${color}22`,color,border:`1px solid ${color}44`,borderRadius:4,padding:"2px 5px"}}>{s.nombre}</span>
                          ))}
                        </div>
                      </div>
                      <div style={{display:"flex",gap:5}}>
                        <button onClick={()=>abrirEditar(id)} style={btn("#1e2d45","#e8f0fe")}>✏</button>
                        <button onClick={()=>eliminarAuditora(id)} style={{...btn("#1e1530","#FC5C65"),border:"1px solid #3d1f2b"}}>🗑</button>
                      </div>
                    </div>
                  </div>
                );
              })}
              {listaAuditoras.length===0&&<div style={{fontSize:12,color:"#4f7096"}}>Agrega la primera auditora.</div>}
            </div>
          </div>
        )}
      </div>

      {/* MODAL: Editar log entry */}
      {modalEditLog&&(
        <Modal title="✏ Editar registro" onClose={()=>setModalEditLog(null)}>
          <EditLogForm
            entry={modalEditLog}
            listaServicios={listaServicios}
            onSave={(cambios)=>guardarEdicionLog(modalEditLog._id,cambios)}
            onCancel={()=>setModalEditLog(null)}
            inp={inp} btn={btn}
          />
        </Modal>
      )}

      {/* MODAL: Auditora */}
      {modalAuditora!==null&&(
        <Modal title={modalAuditora==="new"?"Nueva auditora":"Editar auditora"} onClose={()=>setModalAuditora(null)}>
          <div style={{display:"flex",flexDirection:"column",gap:11}}>
            <input value={formAuditora.nombre} onChange={e=>setFormAuditora(f=>({...f,nombre:e.target.value}))} placeholder="Nombre completo" style={inp}/>
            <div style={{display:"flex",alignItems:"center",gap:9}}>
              <span style={{fontSize:12,color:"#4f7096",whiteSpace:"nowrap"}}>Meta diaria:</span>
              <input type="number" value={formAuditora.meta} onChange={e=>setFormAuditora(f=>({...f,meta:e.target.value}))} style={{...inp,width:80}}/>
            </div>
            <div>
              <div style={{fontSize:11,color:"#4f7096",marginBottom:8,textTransform:"uppercase"}}>Servicios asignados</div>
              {listaServicios.length===0
                ?<div style={{fontSize:12,color:"#4f7096"}}>Primero agrega servicios en configuración.</div>
                :<div style={{display:"flex",flexDirection:"column",gap:7}}>
                  {listaServicios.map(([sid,s])=>(
                    <label key={sid} style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:13}}>
                      <input type="checkbox" checked={(formAuditora.servicios||[]).includes(sid)} onChange={()=>toggleSvcAuditora(sid)} style={{accentColor:"#00C9A7",width:15,height:15}}/>
                      {s.nombre}
                    </label>
                  ))}
                </div>
              }
            </div>
            <button onClick={guardarAuditora} style={{...btn("linear-gradient(135deg,#00C9A7,#4F8EF7)","#fff"),padding:"11px 0",fontSize:14,borderRadius:10,marginTop:4}}>Guardar</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// Componente separado para evitar hooks condicionales
function EditLogForm({entry,listaServicios,onSave,onCancel,inp,btn}){
  const[servicio,setServicio]=useState(entry.servicio||"");
  const[unidad,setUnidad]=useState(entry.unidad||"Cama");
  const[numero,setNumero]=useState(entry.numero||"");
  return(
    <div style={{display:"flex",flexDirection:"column",gap:11}}>
      <div style={{fontSize:12,color:"#4f7096"}}>Auditora: <strong style={{color:"#e8f0fe"}}>{entry.nombre}</strong></div>
      <div style={{fontSize:12,color:"#4f7096"}}>Hora: {entry.ts}</div>
      <select value={servicio} onChange={e=>setServicio(e.target.value)} style={inp}>
        <option value="">— Servicio —</option>
        {listaServicios.map(([sid,s])=><option key={sid} value={s.nombre}>{s.nombre}</option>)}
      </select>
      <select value={unidad} onChange={e=>setUnidad(e.target.value)} style={inp}>
        {["Cama","Camilla","Cubículo","Habitación","Otro"].map(u=><option key={u} value={u}>{u}</option>)}
      </select>
      <input type="number" placeholder="Número (opcional)" value={numero} onChange={e=>setNumero(e.target.value)} style={inp}/>
      <div style={{display:"flex",gap:8,marginTop:4}}>
        <button onClick={()=>onSave({servicio,unidad,numero,auditoraId:entry.auditoraId})} style={{...btn("linear-gradient(135deg,#00C9A7,#4F8EF7)","#fff"),flex:2,padding:"10px 0",fontSize:13,borderRadius:10}}>Guardar cambios</button>
        <button onClick={onCancel} style={{...btn("#1e2d45","#4f7096"),flex:1,padding:"10px 0",fontSize:13,borderRadius:10}}>Cancelar</button>
      </div>
    </div>
  );
}
