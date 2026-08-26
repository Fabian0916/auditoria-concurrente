import { useState, useEffect, useCallback } from "react";
import { db } from "./firebase";
import { ref, onValue, update, push, remove, get } from "firebase/database";
import * as XLSX from "xlsx";

const COLORS   = ["#00C9A7","#4F8EF7","#F7B731","#FC5C65","#45AAF2","#A55EEA","#FD9644","#26DE81"];
const UNIDADES = ["Cama","Camilla","Cubículo","Habitación","Otro"];
const DEFAULT_PIN = "1234";
const PERIODOS = [
  {id:"semana",    label:"Última semana",    dias:7},
  {id:"mes",       label:"Último mes",       dias:30},
  {id:"trimestre", label:"Último trimestre", dias:90},
  {id:"semestre",  label:"Último semestre",  dias:180},
  {id:"anual",     label:"Último año",       dias:365},
];

// Fecha local Colombia (UTC-5) — evita que registros nocturnos cambien de día
const hoyISO = () => {
  const now = new Date();
  const col = new Date(now.getTime() - 5*60*60*1000);
  return col.toISOString().slice(0,10);
};
const tsNow      = () => new Date().toLocaleTimeString("es-CO",{hour:"2-digit",minute:"2-digit",second:"2-digit"});
const fechaCorta = () => new Date().toLocaleDateString("es-CO",{day:"2-digit",month:"2-digit",year:"numeric"});
const fechaLarga = (iso) => { try{ return new Date(iso+"T12:00:00").toLocaleDateString("es-CO",{weekday:"long",day:"2-digit",month:"long",year:"numeric"}); }catch{ return iso; } };
const fechaHumana= (iso) => { try{ return new Date(iso+"T12:00:00").toLocaleDateString("es-CO",{day:"2-digit",month:"2-digit",year:"numeric"}); }catch{ return iso; } };
const diasAtras  = (n) => { const d=new Date(new Date().getTime()-5*60*60*1000); d.setDate(d.getDate()-n); return d.toISOString().slice(0,10); };

const inp = { background:"#0b1523",border:"1px solid #1e2d45",borderRadius:8,padding:"8px 11px",color:"#e8f0fe",fontSize:13,outline:"none",width:"100%",boxSizing:"border-box" };
const mkBtn = (bg,fg="#0b1523",extra={}) => ({ background:bg,color:fg,border:"none",borderRadius:8,padding:"8px 14px",cursor:"pointer",fontSize:12,fontWeight:700,...extra });

function calcPromedio(historial, Auditor(a)Id, Auditores, desde, hasta) {
  const diasArr = Object.entries(historial)
    .filter(([d]) => d >= desde && d <= hasta)
    .map(([, dData]) => {
      const data = dData[Auditor(a)Id]; if(!data) return null;
      const ingresos = data.ingresos || 0;
      const seguimientos = data.seguimientos || 0;
      const meta = Auditores[Auditor(a)Id]?.meta || 30;
      return { ingresos, seguimientos, pct: meta > 0 ? Math.round((ingresos/meta)*100) : 0 };
    }).filter(Boolean);
  if(diasArr.length === 0) return { avgPct:0, avgIngresos:0, avgSeguimientos:0, diasContados:0, totalIngresos:0, totalSeguimientos:0 };
  return {
    avgPct:           Math.round(diasArr.reduce((s,d)=>s+d.pct,0)/diasArr.length),
    avgIngresos:      Math.round(diasArr.reduce((s,d)=>s+d.ingresos,0)/diasArr.length),
    avgSeguimientos:  Math.round(diasArr.reduce((s,d)=>s+d.seguimientos,0)/diasArr.length),
    diasContados:     diasArr.length,
    totalIngresos:    diasArr.reduce((s,d)=>s+d.ingresos,0),
    totalSeguimientos:diasArr.reduce((s,d)=>s+d.seguimientos,0),
  };
}

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

function Modal({title,onClose,children}){
  return(
    <div style={{position:"fixed",inset:0,background:"#000000cc",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:"#0f1f35",border:"1px solid #1e2d45",borderRadius:18,padding:"22px 26px",width:"100%",maxWidth:480,maxHeight:"88vh",overflowY:"auto"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
          <div style={{fontSize:15,fontWeight:700,color:"#4F8EF7"}}>{title}</div>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#4f7096",fontSize:20,cursor:"pointer"}}>x</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function EditLogForm({entry,listaServicios,onSave,onCancel}){
  const [servicio,setServicio]=useState(entry.servicio||"");
  const [unidad,setUnidad]=useState(entry.unidad||"Cama");
  const [numero,setNumero]=useState(entry.numero||"");
  const [fecha,setFecha]=useState(entry.fecha||hoyISO());
  const [tipoReg,setTipoReg]=useState(entry.tipoReg||"I");

  const tipoColor = tipoReg==="I" ? "#00C9A7" : "#F7B731";

  return(
    <div style={{display:"flex",flexDirection:"column",gap:11}}>
      <div style={{fontSize:12,color:"#4f7096"}}>Auditor(a): <strong style={{color:"#e8f0fe"}}>{entry.nombre}</strong></div>

      {/* Tipo editable */}
      <div>
        <div style={{fontSize:11,color:"#4f7096",marginBottom:6,textTransform:"uppercase"}}>Tipo de registro</div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>setTipoReg("I")} style={{
            flex:1,padding:"10px 0",borderRadius:10,cursor:"pointer",fontWeight:800,fontSize:13,border:"2px solid",
            borderColor:tipoReg==="I"?"#00C9A7":"#1e2d45",
            background:tipoReg==="I"?"#00C9A722":"#0b1523",
            color:tipoReg==="I"?"#00C9A7":"#4f7096"}}>
            ✚ Ingreso (I)
            <div style={{fontSize:9,fontWeight:400,marginTop:2,color:tipoReg==="I"?"#00C9A7":"#4f7096"}}>Cuenta para la meta</div>
          </button>
          <button onClick={()=>setTipoReg("S")} style={{
            flex:1,padding:"10px 0",borderRadius:10,cursor:"pointer",fontWeight:800,fontSize:13,border:"2px solid",
            borderColor:tipoReg==="S"?"#F7B731":"#1e2d45",
            background:tipoReg==="S"?"#F7B73122":"#0b1523",
            color:tipoReg==="S"?"#F7B731":"#4f7096"}}>
            ↺ Seguimiento (S)
            <div style={{fontSize:9,fontWeight:400,marginTop:2,color:tipoReg==="S"?"#F7B731":"#4f7096"}}>Solo volumetria</div>
          </button>
        </div>
        {tipoReg !== entry.tipoReg && (
          <div style={{fontSize:10,color:"#FC5C65",marginTop:5,padding:"4px 8px",background:"#FC5C6522",borderRadius:6}}>
            ⚠ Cambiar de {entry.tipoReg==="I"?"Ingreso a Seguimiento":"Seguimiento a Ingreso"} ajustara el conteo de la Auditor(a) en ese dia
          </div>
        )}
      </div>

      {/* Fecha editable */}
      <div>
        <div style={{fontSize:11,color:"#4f7096",marginBottom:5,textTransform:"uppercase"}}>Fecha de la auditoria</div>
        <input type="date" value={fecha} onChange={e=>setFecha(e.target.value)}
          style={{...inp,colorScheme:"dark"}}/>
        <div style={{fontSize:10,color:"#4f7096",marginTop:3}}>Hora original: {entry.ts}</div>
      </div>

      <select value={servicio} onChange={e=>setServicio(e.target.value)} style={inp}>
        <option value="">-- Servicio --</option>
        {listaServicios.map(([sid,s])=><option key={sid} value={s.nombre}>{s.nombre}</option>)}
      </select>
      <select value={unidad} onChange={e=>setUnidad(e.target.value)} style={inp}>
        {UNIDADES.map(u=><option key={u} value={u}>{u}</option>)}
      </select>
      <input type="text" placeholder="ID / N (ej. 12A, UCI-3)" value={numero} onChange={e=>setNumero(e.target.value)} maxLength={20} style={inp}/>
      <div style={{display:"flex",gap:8,marginTop:4}}>
        <button onClick={()=>onSave({servicio,unidad,numero,fecha,tipoReg,Auditor(a)Id:entry.Auditor(a)Id})}
          style={{...mkBtn("linear-gradient(135deg,#00C9A7,#4F8EF7)","#fff"),flex:2,padding:"10px 0",fontSize:13,borderRadius:10}}>Guardar</button>
        <button onClick={onCancel} style={{...mkBtn("#1e2d45","#4f7096"),flex:1,padding:"10px 0",fontSize:13,borderRadius:10}}>Cancelar</button>
      </div>
    </div>
  );
}

function LoginCoordinador({onLogin,onBack}){
  const [pin,setPin]=useState(""), [err,setErr]=useState(false);
  const handleLogin=async()=>{
    const snap=await get(ref(db,"config/pin"));
    const stored=snap.val()||DEFAULT_PIN;
    if(pin===stored){ onLogin(); } else{ setErr(true); setPin(""); setTimeout(()=>setErr(false),1500); }
  };
  return(
    <div style={{minHeight:"100vh",background:"#0b1523",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{background:"#0f1f35",border:"1px solid #1e2d45",borderRadius:20,padding:"36px 40px",width:320,textAlign:"center"}}>
        <div style={{fontSize:36,marginBottom:12}}>🔐</div>
        <div style={{fontSize:16,fontWeight:700,color:"#e8f0fe",marginBottom:4}}>Panel de Coordinacion</div>
        <div style={{fontSize:12,color:"#4f7096",marginBottom:24}}>Ingresa tu PIN para continuar</div>
        <input type="password" value={pin} onChange={e=>setPin(e.target.value)}
          onKeyDown={e=>e.key==="Enter"&&handleLogin()} placeholder="PIN" maxLength={20}
          style={{...inp,textAlign:"center",fontSize:18,letterSpacing:4,marginBottom:10}}/>
        {err&&<div style={{fontSize:12,color:"#FC5C65",marginBottom:8}}>PIN incorrecto</div>}
        <button onClick={handleLogin} style={{...mkBtn("linear-gradient(135deg,#4F8EF7,#A55EEA)","#fff"),width:"100%",padding:"11px 0",fontSize:14,marginBottom:10}}>Ingresar</button>
        <button onClick={onBack} style={{...mkBtn("none","#4f7096"),fontSize:12,width:"100%"}}>Volver</button>
      </div>
    </div>
  );
}

function Portada({config,onSelectRol}){
  return(
    <div style={{minHeight:"100vh",background:"#0b1523",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:20,padding:24}}>
      {config.logoUrl
        ?<img src={config.logoUrl} alt="Logo" style={{width:90,height:90,borderRadius:16,objectFit:"contain",background:"#fff",padding:6}}/>
        :<div style={{width:72,height:72,borderRadius:18,background:"linear-gradient(135deg,#00C9A7,#4F8EF7)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:32}}>📋</div>
      }
      <div style={{textAlign:"center"}}>
        <div style={{fontSize:20,fontWeight:800,color:"#e8f0fe"}}>Monitor de Auditoria Concurrente</div>
        <div style={{fontSize:13,color:"#4f7096",marginTop:4}}>{config.institucion||""}</div>
        {config.area&&<div style={{fontSize:12,color:"#4f7096"}}>{config.area}</div>}
      </div>
      <div style={{display:"flex",gap:16,flexWrap:"wrap",justifyContent:"center",marginTop:8}}>
        <button onClick={()=>onSelectRol("Auditor(a)")} style={{background:"linear-gradient(135deg,#00C9A7,#26DE81)",color:"#0b1523",border:"none",borderRadius:16,padding:"24px 40px",cursor:"pointer",fontWeight:800,fontSize:15,display:"flex",flexDirection:"column",alignItems:"center",gap:10,minWidth:160,boxShadow:"0 4px 20px #00C9A733"}}>
          <span style={{fontSize:34}}>👩‍⚕️</span>Soy Auditor
        </button>
        <button onClick={()=>onSelectRol("coord")} style={{background:"linear-gradient(135deg,#4F8EF7,#A55EEA)",color:"#fff",border:"none",borderRadius:16,padding:"24px 40px",cursor:"pointer",fontWeight:800,fontSize:15,display:"flex",flexDirection:"column",alignItems:"center",gap:10,minWidth:160,boxShadow:"0 4px 20px #4F8EF733"}}>
          <span style={{fontSize:34}}>🔐</span>Soy Coordinador
        </button>
      </div>
    </div>
  );
}

function Header({config,esCoord,connected,onBack,extraButtons}){
  return(
    <div style={{background:"linear-gradient(135deg,#0f1f35,#0b1523)",borderBottom:"1px solid #1e2d45",padding:"12px 18px",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8,position:"sticky",top:0,zIndex:100}}>
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        {config.logoUrl
          ?<img src={config.logoUrl} alt="Logo" style={{width:30,height:30,borderRadius:7,objectFit:"contain",background:"#fff",padding:2}}/>
          :<div style={{width:30,height:30,borderRadius:8,background:esCoord?"linear-gradient(135deg,#4F8EF7,#A55EEA)":"linear-gradient(135deg,#00C9A7,#4F8EF7)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>{esCoord?"🔐":"📋"}</div>
        }
        <div>
          <div style={{fontSize:12,fontWeight:700}}>{esCoord?"Panel de Coordinacion":"Auditoria Concurrente"}</div>
          <div style={{fontSize:10,color:"#4f7096"}}>{config.institucion||"—"} · {config.area||"—"}</div>
        </div>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:7,flexWrap:"wrap"}}>
        <div style={{fontSize:11,padding:"3px 8px",borderRadius:6,background:connected?"#0d2a1e":"#2a1010",color:connected?"#26DE81":"#FC5C65",border:`1px solid ${connected?"#1a4a30":"#4a1a1a"}`}}>{connected?"● En linea":"● Sin conexion"}</div>
        {extraButtons}
        <button onClick={onBack} style={{...mkBtn("#1e2d45","#4f7096"),fontSize:11}}>Salir</button>
      </div>
    </div>
  );
}

function TarjetaAuditor(a)({id,a,color,historial,desde,hasta,registro,setReg,onRegistrar,listaServicios,esCoord,onAjustar,isPulsing}){
  const hoy       = hoyISO();
  const diaHoy    = (historial[hoy]&&historial[hoy][id])||{ingresos:0,seguimientos:0};
  const ingresos  = diaHoy.ingresos   ||0;
  const seguimien = diaHoy.seguimientos||0;
  const meta      = a.meta||30;
  const pct       = meta>0?Math.round((ingresos/meta)*100):0;
  const reg       = registro[id]||{};
  const {avgPct,avgIngresos,avgSeguimientos,diasContados} = calcPromedio(historial,id,{[id]:a},desde,hasta);

  return(
    <div style={{background:"linear-gradient(145deg,#0f1f35,#0d1a2d)",border:`1px solid ${isPulsing?color:"#1e2d45"}`,borderRadius:16,padding:"15px 17px",transition:"all 0.3s",transform:isPulsing?"scale(1.02)":"scale(1)",boxShadow:isPulsing?`0 0 18px ${color}44`:"none"}}>
      <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between"}}>
        <div>
          <div style={{fontSize:10,color,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:2}}>{a.nombre}</div>
          <div style={{fontSize:36,fontWeight:800,color:"#e8f0fe",lineHeight:1,letterSpacing:"-1px"}}>{ingresos}</div>
          <div style={{fontSize:11,color:"#4f7096",marginTop:1}}>
            Ingresos · meta {meta} · <span style={{color:pct>=100?"#26DE81":pct>=70?"#F7B731":"#e8f0fe",fontWeight:700}}>{pct}%</span>
          </div>
        </div>
        <div style={{position:"relative"}}>
          <RadialProgress pct={pct} color={pct>=100?"#26DE81":color} size={64}/>
          <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,color:pct>=100?"#26DE81":color}}>{pct}%</div>
        </div>
      </div>

      <div style={{marginTop:8,display:"flex",gap:6}}>
        <div style={{flex:1,background:"#0b1523",borderRadius:8,padding:"6px 10px",border:"1px solid #1e2d45"}}>
          <div style={{fontSize:9,color:"#4f7096",textTransform:"uppercase"}}>Seguimientos hoy</div>
          <div style={{fontSize:18,fontWeight:800,color:"#F7B731",marginTop:1}}>{seguimien}</div>
        </div>
        {diasContados>0&&(
          <div style={{flex:1,background:"#0b1523",borderRadius:8,padding:"6px 10px",border:"1px solid #1e2d45"}}>
            <div style={{fontSize:9,color:"#4f7096",textTransform:"uppercase"}}>Prom. {desde} → {hasta}</div>
            <div style={{fontSize:13,fontWeight:800,color:"#4F8EF7",marginTop:1}}>{avgPct}% <span style={{fontSize:10,color:"#4f7096",fontWeight:400}}>({avgIngresos} I/día)</span></div>
          </div>
        )}
      </div>

      <div style={{marginTop:8,height:4,background:"#1e2d45",borderRadius:99,overflow:"hidden"}}>
        <div style={{height:"100%",borderRadius:99,background:pct>=100?"#26DE81":color,width:`${Math.min(pct,100)}%`,transition:"width 0.5s ease"}}/>
      </div>

      <div style={{marginTop:10,display:"flex",flexDirection:"column",gap:5}}>
        <select value={reg.servicio||""} onChange={e=>setReg(id,"servicio",e.target.value)} style={{...inp,fontSize:12}}>
          <option value="">-- Selecciona servicio --</option>
          {listaServicios.filter(([sid])=>(a.servicios||[]).includes(sid)).map(([sid,s])=>(
            <option key={sid} value={s.nombre}>{s.nombre}</option>
          ))}
        </select>
        <select value={reg.unidad||"Cama"} onChange={e=>setReg(id,"unidad",e.target.value)} style={{...inp,fontSize:12}}>
          {UNIDADES.map(u=><option key={u} value={u}>{u}</option>)}
        </select>
        <input type="text" placeholder="ID / N (ej. 12A, UCI-3)" value={reg.numero||""} onChange={e=>setReg(id,"numero",e.target.value)} maxLength={20} style={{...inp,fontSize:12}}/>
      </div>

      <div style={{display:"flex",gap:6,marginTop:10}}>
        <button onClick={()=>onRegistrar(id,"I")} style={{flex:1,padding:"10px 0",background:"#00C9A722",color:"#00C9A7",border:"1px solid #00C9A755",borderRadius:10,fontSize:12,cursor:"pointer",fontWeight:800}}>
          + Ingreso (I)
        </button>
        <button onClick={()=>onRegistrar(id,"S")} style={{flex:1,padding:"10px 0",background:"#F7B73122",color:"#F7B731",border:"1px solid #F7B73155",borderRadius:10,fontSize:12,cursor:"pointer",fontWeight:800}}>
          + Seguim. (S)
        </button>
      </div>

      {esCoord&&(
        <div style={{display:"flex",gap:6,alignItems:"center",marginTop:8}}>
          <span style={{fontSize:10,color:"#4f7096",flex:1}}>Ajuste Ingresos:</span>
          <button onClick={()=>onAjustar(id,-1)} style={{...mkBtn("#1e2d45","#FC5C65"),padding:"4px 11px",fontSize:15}}>-</button>
          <button onClick={()=>onAjustar(id,1)} style={{...mkBtn("#1e2d45","#26DE81"),padding:"4px 11px",fontSize:15}}>+</button>
        </div>
      )}
      {pct>=100&&<div style={{marginTop:7,textAlign:"center",fontSize:11,color:"#26DE81",fontWeight:700}}>Meta cumplida</div>}
    </div>
  );
}

function useRegistro(Auditores,historial){
  const [registro,setRegistroState]=useState({});
  const [pulse,setPulse]=useState(null);
  const setReg=(id,campo,val)=>setRegistroState(r=>({...r,[id]:{...(r[id]||{}),[campo]:val}}));
  const registrar=useCallback(async(Auditor(a)Id,tipoReg)=>{
    const a=Auditores[Auditor(a)Id]; if(!a) return;
    const reg=registro[Auditor(a)Id]||{};
    const servicio=reg.servicio||"", unidad=reg.unidad||"Cama", numero=reg.numero||"";
    if(!servicio){ alert("Selecciona un servicio antes de registrar."); return; }
    const hoy=hoyISO();
    const diaActual=(historial[hoy]&&historial[hoy][Auditor(a)Id])||{ingresos:0,seguimientos:0,tipos:{}};
    const updates={};
    if(tipoReg==="I"){
      const nuevosI=(diaActual.ingresos||0)+1;
      updates[`historial/${hoy}/${Auditor(a)Id}/ingresos`]=nuevosI;
      updates[`Auditores/${Auditor(a)Id}/historias`]=nuevosI;
    } else {
      updates[`historial/${hoy}/${Auditor(a)Id}/seguimientos`]=(diaActual.seguimientos||0)+1;
    }
    const key=`${servicio}__${unidad}`;
    updates[`historial/${hoy}/${Auditor(a)Id}/tipos/${key}`]=((diaActual.tipos||{})[key]||0)+1;
    await update(ref(db),updates);
    await push(ref(db,"log"),{ts:tsNow(),ts_ms:Date.now(),fecha:hoy,nombre:a.nombre,Auditor(a)Id,tipoReg,delta:tipoReg==="I"?1:0,servicio,unidad,numero});
    setPulse(Auditor(a)Id);
    setTimeout(()=>setPulse(null),600);
  },[Auditores,historial,registro]);
  return {registro,setReg,registrar,pulse};
}

function VistaAuditor(a)({config,Auditores,servicios,historial,connected,onBack}){
  const {registro,setReg,registrar,pulse}=useRegistro(Auditores,historial);
  const [periodo,setPeriodo]=useState("semana");
  const listaAuditores=Object.entries(Auditores);
  const listaServicios=Object.entries(servicios);
  const hoy=hoyISO();
  const totalI=listaAuditores.reduce((s,[id])=>s+((historial[hoy]&&historial[hoy][id]?.ingresos)||0),0);
  const totalS=listaAuditores.reduce((s,[id])=>s+((historial[hoy]&&historial[hoy][id]?.seguimientos)||0),0);
  const totalMeta=listaAuditores.reduce((s,[,a])=>s+(a.meta||30),0);
  const pctGlobal=totalMeta>0?Math.round((totalI/totalMeta)*100):0;

  return(
    <div style={{minHeight:"100vh",background:"#0b1523",fontFamily:"'DM Sans','Segoe UI',sans-serif",color:"#e8f0fe"}}>
      <Header config={config} esCoord={false} connected={connected} onBack={onBack}/>
      <div style={{padding:"12px 18px 0"}}>
        <div style={{background:"#0f1f35",border:"1px solid #1e2d45",borderRadius:12,padding:"12px 18px",display:"flex",alignItems:"center",gap:16,flexWrap:"wrap",justifyContent:"space-between"}}>
          <div>
            <div style={{fontSize:10,color:"#4f7096",textTransform:"uppercase",letterSpacing:"0.08em"}}>Ingresos hoy</div>
            <div style={{fontSize:32,fontWeight:800,color:"#00C9A7",lineHeight:1}}>{totalI}<span style={{fontSize:13,color:"#4f7096",fontWeight:400,marginLeft:6}}>/ {totalMeta}</span></div>
            <div style={{height:4,background:"#1e2d45",borderRadius:99,overflow:"hidden",width:180,marginTop:6}}>
              <div style={{height:"100%",borderRadius:99,background:pctGlobal>=100?"#26DE81":"linear-gradient(90deg,#00C9A7,#4F8EF7)",width:`${Math.min(pctGlobal,100)}%`}}/>
            </div>
            <div style={{fontSize:10,color:"#4f7096",marginTop:3}}>{pctGlobal}% meta grupal</div>
          </div>
          <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
            <div style={{background:"#0b1523",border:"1px solid #1e2d45",borderRadius:10,padding:"10px 16px",textAlign:"center"}}>
              <div style={{fontSize:9,color:"#4f7096",textTransform:"uppercase"}}>Seguimientos hoy</div>
              <div style={{fontSize:24,fontWeight:800,color:"#F7B731",marginTop:2}}>{totalS}</div>
            </div>
            <select value={periodo} onChange={e=>setPeriodo(e.target.value)} style={{...inp,width:"auto",fontSize:11}}>
              {PERIODOS.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </div>
        </div>
      </div>
      <div style={{padding:"12px 18px"}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(290px,1fr))",gap:12}}>
          {listaAuditores.map(([id,a],i)=>(
            <TarjetaAuditor(a) key={id} id={id} a={a} color={COLORS[i%COLORS.length]}
              historial={historial} periodo={periodo} registro={registro}
              setReg={setReg} onRegistrar={registrar}
              listaServicios={listaServicios} esCoord={false} onAjustar={()=>{}}
              isPulsing={pulse===id}/>
          ))}
        </div>
      </div>
    </div>
  );
}

function VistaCoordinador({config,Auditores,servicios,historial,log,connected,onBack}){
  const {registro,setReg,registrar,pulse}=useRegistro(Auditores,historial);
  const [coordView,setCoordView]=useState("dashboard");
  const [modalAud,setModalAud]=useState(null);
  const [modalEditLog,setModalEditLog]=useState(null);
  const [filtroAud,setFiltroAud]=useState("todas");
  const [filtroRango,setFiltroRango]=useState("semana");
  const [filtroLogFecha,setFiltroLogFecha]=useState("");
  const [filtroLogAud,setFiltroLogAud]=useState("todas");
  const [filtroLogTipo,setFiltroLogTipo]=useState("todos");
  const [nuevoSvc,setNuevoSvc]=useState("");
  const [formAud,setFormAud]=useState({nombre:"",meta:30,servicios:[]});
  const [newPin,setNewPin]=useState("");
  const [pinMsg,setPinMsg]=useState("");
  const [logoInput,setLogoInput]=useState("");
  const [logoMsg,setLogoMsg]=useState("");
  const hoy=hoyISO();
  // Rango libre de fechas
  const [rangoDesde,setRangoDesde]=useState(diasAtras(6));
  const [rangoHasta,setRangoHasta]=useState(hoy);

  const listaAuditores=Object.entries(Auditores);
  const listaServicios=Object.entries(servicios);
  const totalMeta=listaAuditores.reduce((s,[,a])=>s+(a.meta||30),0);

  // KPIs globales del período
  const kpiPeriodo = listaAuditores.reduce((acc,[id,a])=>{
    const p=calcPromedio(historial,id,{[id]:a},rangoDesde,rangoHasta);
    acc.totalI+=p.totalIngresos; acc.totalS+=p.totalSeguimientos;
    acc.sumPct+=p.avgPct; acc.diasMax=Math.max(acc.diasMax,p.diasContados);
    return acc;
  },{totalI:0,totalS:0,sumPct:0,diasMax:0});
  const avgPctGlobal=listaAuditores.length>0?Math.round(kpiPeriodo.sumPct/listaAuditores.length):0;

  // Para el día de hoy (contador actual)
  const totalIHoy=listaAuditores.reduce((s,[id])=>s+((historial[hoy]&&historial[hoy][id]?.ingresos)||0),0);
  const totalSHoy=listaAuditores.reduce((s,[id])=>s+((historial[hoy]&&historial[hoy][id]?.seguimientos)||0),0);
  const pctGlobalHoy=totalMeta>0?Math.round((totalIHoy/totalMeta)*100):0;

  const setQuickRange=(dias)=>{
    setRangoDesde(diasAtras(dias-1));
    setRangoHasta(hoy);
  };

  const guardarConfig=async(campo,valor)=>await update(ref(db,"config"),{[campo]:valor});

  const resetDia=async()=>{
    if(!window.confirm("Reiniciar todos los conteos del dia? El historial se conserva.")) return;
    const updates={};
    Object.keys(Auditores).forEach(id=>{
      updates[`historial/${hoy}/${id}/ingresos`]=0;
      updates[`historial/${hoy}/${id}/seguimientos`]=0;
      updates[`historial/${hoy}/${id}/tipos`]={};
      updates[`Auditores/${id}/historias`]=0;
    });
    await update(ref(db),updates);
    await push(ref(db,"log"),{ts:tsNow(),ts_ms:Date.now(),fecha:hoy,nombre:"Sistema",tipo:"reset",tipoReg:"reset"});
  };

  const ajustarConteo=async(audId,delta)=>{
    const a=Auditores[audId]; if(!a) return;
    const diaActual=(historial[hoy]&&historial[hoy][audId])||{ingresos:0};
    const nuevos=Math.max(0,(diaActual.ingresos||0)+delta);
    await update(ref(db),{[`historial/${hoy}/${audId}/ingresos`]:nuevos,[`Auditores/${audId}/historias`]:nuevos});
    await push(ref(db,"log"),{ts:tsNow(),ts_ms:Date.now(),fecha:hoy,nombre:a.nombre,Auditor(a)Id:audId,delta,tipoReg:"I",servicio:"Ajuste manual",unidad:"—",numero:"",esAjuste:true});
  };

  const agregarSvc=async()=>{if(!nuevoSvc.trim())return;await push(ref(db,"servicios"),{nombre:nuevoSvc.trim()});setNuevoSvc("");};
  const eliminarSvc=async(id)=>{if(!window.confirm("Eliminar?"))return;await remove(ref(db,`servicios/${id}`));};
  const abrirNueva=()=>{setFormAud({nombre:"",meta:30,servicios:[]});setModalAud("new");};
  const abrirEditar=(id)=>{const a=Auditores[id];setFormAud({nombre:a.nombre,meta:a.meta||30,servicios:a.servicios||[]});setModalAud(id);};
  const guardarAud=async()=>{
    if(!formAud.nombre.trim())return;
    const data={nombre:formAud.nombre.trim(),meta:parseInt(formAud.meta)||30,servicios:formAud.servicios};
    if(modalAud==="new") await push(ref(db,"Auditores"),{...data,historias:0,tipos:{}});
    else await update(ref(db,`Auditores/${modalAud}`),data);
    setModalAud(null);
  };
  const eliminarAud=async(id)=>{if(!window.confirm("Eliminar?"))return;await remove(ref(db,`Auditores/${id}`));};
  const toggleSvc=(sid)=>{const cur=formAud.servicios||[];setFormAud(f=>({...f,servicios:cur.includes(sid)?cur.filter(x=>x!==sid):[...cur,sid]}));};

  const eliminarLogEntry=async(entry)=>{
    if(!window.confirm("Eliminar este registro?")) return;
    await remove(ref(db,`log/${entry._id}`));
    if(entry.Auditor(a)Id&&entry.tipoReg==="I"){
      const dia=entry.fecha||hoy;
      const diaData=(historial[dia]&&historial[dia][entry.Auditor(a)Id])||{ingresos:0};
      const nuevos=Math.max(0,(diaData.ingresos||0)-1);
      await update(ref(db),{[`historial/${dia}/${entry.Auditor(a)Id}/ingresos`]:nuevos,[`Auditores/${entry.Auditor(a)Id}/historias`]:nuevos});
    }
  };
  const guardarEdicionLog=async(logId,cambios)=>{
    const entry = modalEditLog;
    const fechaAnterior = entry.fecha || hoyISO();
    const fechaNueva    = cambios.fecha || fechaAnterior;
    const tipoAnterior  = entry.tipoReg || "I";
    const tipoNuevo     = cambios.tipoReg || tipoAnterior;
    const audId         = cambios.Auditor(a)Id || entry.Auditor(a)Id;
    const hoy           = hoyISO();

    // Guardar cambios en el log (incluye tipoReg y fecha nuevos)
    await update(ref(db,`log/${logId}`),{...cambios, delta: tipoNuevo==="I" ? 1 : 0});

    // Calcular ajuste neto de ingresos por día
    // Era Ingreso en fechaAnterior → quitar 1 de ese día
    // Es  Ingreso en fechaNueva   → sumar 1 a ese día
    const eraIngreso = tipoAnterior === "I";
    const esIngreso  = tipoNuevo   === "I";

    if(audId){
      const updates = {};

      if(eraIngreso){
        // Restar del día original
        const d=(historial[fechaAnterior]&&historial[fechaAnterior][audId])||{ingresos:0};
        updates[`historial/${fechaAnterior}/${audId}/ingresos`] = Math.max(0,(d.ingresos||0)-1);
      }
      if(esIngreso){
        // Sumar al día nuevo
        const d=(historial[fechaNueva]&&historial[fechaNueva][audId])||{ingresos:0};
        // Si es el mismo día y ya restamos, usar el valor ya ajustado
        const base = (fechaNueva===fechaAnterior && eraIngreso)
          ? Math.max(0,((historial[fechaAnterior]&&historial[fechaAnterior][audId]?.ingresos)||0)-1)
          : (d.ingresos||0);
        updates[`historial/${fechaNueva}/${audId}/ingresos`] = base + 1;
      }

      if(Object.keys(updates).length > 0){
        await update(ref(db), updates);
        // Recalcular historias del día actual
        const dHoy = (historial[hoy]&&historial[hoy][audId])||{ingresos:0};
        let ingHoy = dHoy.ingresos||0;
        if(eraIngreso && fechaAnterior===hoy) ingHoy = Math.max(0, ingHoy-1);
        if(esIngreso  && fechaNueva===hoy)    ingHoy = ingHoy+1;
        await update(ref(db,`Auditores/${audId}`),{historias: ingHoy});
      }
    }
    setModalEditLog(null);
  };
  const cambiarPin=async()=>{
    if(newPin.length<4){setPinMsg("Min. 4 caracteres.");return;}
    await guardarConfig("pin",newPin);setNewPin("");setPinMsg("PIN actualizado.");setTimeout(()=>setPinMsg(""),3000);
  };
  const guardarLogo=async()=>{
    if(!logoInput.trim()){setLogoMsg("URL invalida.");return;}
    await guardarConfig("logoUrl",logoInput.trim());setLogoInput("");setLogoMsg("Logo guardado.");setTimeout(()=>setLogoMsg(""),3000);
  };
  const quitarLogo=async()=>{await guardarConfig("logoUrl","");setLogoMsg("Logo eliminado.");setTimeout(()=>setLogoMsg(""),3000);};

  const exportToExcel=()=>{
    const wb=XLSX.utils.book_new();
    const hoy2=fechaCorta(),ahora=tsNow();
    const diasOrdenados=Object.keys(historial).sort().reverse();
    const rows1=[[config.institucion||"Institucion"],[`${config.area||"Auditoria"} — ${hoy2} ${ahora}`],[],
      ["Fecha","Auditor(a)","Ingresos","Seguimientos","Meta","% Cumplimiento","Prom Ing/dia","Prom % cumpl."]];
    listaAuditores.forEach(([id,a])=>{
      diasOrdenados.forEach(dia=>{
        const d=historial[dia]&&historial[dia][id]; if(!d) return;
        const ing=d.ingresos||0,seg=d.seguimientos||0,meta=a.meta||30;
        const pct=meta>0?Math.round((ing/meta)*100):0;
        const prom=calcPromedio(historial,id,{[id]:a},rangoDesde,rangoHasta);
        rows1.push([fechaHumana(dia),a.nombre,ing,seg,meta,pct/100,prom.avgIngresos,prom.avgPct/100]);
      });
    });
    const ws1=XLSX.utils.aoa_to_sheet(rows1);
    ws1["!cols"]=[{wch:14},{wch:26},{wch:10},{wch:14},{wch:8},{wch:16},{wch:16},{wch:16}];
    XLSX.utils.book_append_sheet(wb,ws1,"Historial completo");

    const rows2=[[config.institucion||"Institucion"],[`Resumen del dia — ${hoy2}`],[],
      ["Auditor(a)","Ingresos hoy","Seguimientos hoy","Meta","% Cumplimiento","Estado"],
      ...listaAuditores.map(([id,a])=>{
        const d=(historial[hoy]&&historial[hoy][id])||{ingresos:0,seguimientos:0};
        const ing=d.ingresos||0,meta=a.meta||30,pct=meta>0?ing/meta:0;
        return[a.nombre,ing,d.seguimientos||0,meta,pct,pct>=1?"Cumplida":pct>=0.7?"En progreso":"Por debajo"];
      })];
    const ws2=XLSX.utils.aoa_to_sheet(rows2);
    ws2["!cols"]=[{wch:26},{wch:14},{wch:16},{wch:8},{wch:16},{wch:16}];
    listaAuditores.forEach((_,i)=>{const c=`E${5+i}`;if(ws2[c])ws2[c].z="0.0%";});
    XLSX.utils.book_append_sheet(wb,ws2,"Resumen del dia");

    const logF=log.filter(e=>e.tipoReg!=="reset");
    if(logF.length>0){
      const rows3=[["Registro"],[],["Fecha","Hora","Auditor(a)","Tipo","Servicio","Unidad","Identificador"],
        ...logF.map(e=>[fechaHumana(e.fecha||hoy),e.ts,e.nombre,e.tipoReg==="I"?"Ingreso":e.tipoReg==="S"?"Seguimiento":"Ajuste",e.servicio||"—",e.unidad||"—",e.numero||"—"])];
      const ws3=XLSX.utils.aoa_to_sheet(rows3);
      ws3["!cols"]=[{wch:12},{wch:12},{wch:26},{wch:12},{wch:18},{wch:12},{wch:14}];
      XLSX.utils.book_append_sheet(wb,ws3,"Registro actividad");
    }
    XLSX.writeFile(wb,`Auditoria_${(config.institucion||"IPS").replace(/\s+/g,"_")}_${hoy2.replace(/\//g,"-")}.xlsx`);
  };

  const getHistFiltrado=()=>{
    const histDesde2=diasAtras(PERIODOS.find(p=>p.id===filtroRango)?.dias||7);
    return Object.entries(historial).filter(([d])=>d>=histDesde2&&d<=hoy).sort(([a],[b])=>b.localeCompare(a));
  };

  const navItems=[{id:"dashboard",label:"Dashboard",icon:"📊"},{id:"log",label:"Registros",icon:"📝"},{id:"historial",label:"Historial",icon:"📅"},{id:"config",label:"Config",icon:"⚙"}];
  const extraButtons=(<>
    <button onClick={exportToExcel} style={mkBtn("linear-gradient(135deg,#26DE81,#00C9A7)")}>📥 Excel</button>
    <button onClick={resetDia} style={{...mkBtn("#1e1530","#FC5C65"),border:"1px solid #3d1f2b"}}>↺ Reiniciar dia</button>
  </>);

  return(
    <div style={{minHeight:"100vh",background:"#0b1523",fontFamily:"'DM Sans','Segoe UI',sans-serif",color:"#e8f0fe"}}>
      <Header config={config} esCoord connected={connected} onBack={onBack} extraButtons={extraButtons}/>
      <div style={{background:"#0b1a2a",borderBottom:"1px solid #1e2d45",padding:"0 18px",display:"flex",gap:4}}>
        {navItems.map(n=>(
          <button key={n.id} onClick={()=>setCoordView(n.id)} style={{background:"none",border:"none",borderBottom:`2px solid ${coordView===n.id?"#4F8EF7":"transparent"}`,color:coordView===n.id?"#4F8EF7":"#4f7096",padding:"10px 14px",cursor:"pointer",fontSize:12,fontWeight:coordView===n.id?700:400,transition:"all 0.2s"}}>
            {n.icon} {n.label}
          </button>
        ))}
      </div>
      <div style={{padding:"16px 18px"}}>

        {coordView==="dashboard"&&(<>

          {/* ── Selector de rango de fechas ── */}
          <div style={{background:"#0f1f35",border:"1px solid #1e2d45",borderRadius:14,padding:"14px 18px",marginBottom:14}}>
            <div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap",marginBottom:10}}>
              <div style={{fontSize:11,color:"#4f7096",textTransform:"uppercase",letterSpacing:"0.06em",whiteSpace:"nowrap"}}>Rango de fechas</div>
              <div style={{display:"flex",alignItems:"center",gap:8,flex:1,flexWrap:"wrap"}}>
                <input type="date" value={rangoDesde} onChange={e=>setRangoDesde(e.target.value)}
                  style={{...inp,width:150,fontSize:12,colorScheme:"dark"}}/>
                <span style={{fontSize:12,color:"#4f7096"}}>→</span>
                <input type="date" value={rangoHasta} onChange={e=>setRangoHasta(e.target.value)}
                  style={{...inp,width:150,fontSize:12,colorScheme:"dark"}}/>
              </div>
            </div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {[{l:"Hoy",d:0},{l:"Ayer",d:1,solo:true},{l:"Esta semana",d:6},{l:"Este mes",d:29},{l:"Trimestre",d:89},{l:"Semestre",d:179},{l:"Este año",d:364}].map(q=>(
                <button key={q.l} onClick={()=>{
                  if(q.solo){ setRangoDesde(diasAtras(1)); setRangoHasta(diasAtras(1)); }
                  else { setRangoDesde(diasAtras(q.d)); setRangoHasta(hoy); }
                }} style={{
                  background: rangoDesde===diasAtras(q.solo?1:q.d)&&rangoHasta===(q.solo?diasAtras(1):hoy)?"#4F8EF722":"#1e2d45",
                  color: rangoDesde===diasAtras(q.solo?1:q.d)&&rangoHasta===(q.solo?diasAtras(1):hoy)?"#4F8EF7":"#8faec4",
                  border:"1px solid #2a3d55",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:11,fontWeight:600
                }}>{q.l}</button>
              ))}
            </div>
          </div>

          {/* ── KPIs globales del período ── */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:10,marginBottom:16}}>
            {[
              {label:"Ingresos totales", val:kpiPeriodo.totalI, color:"#00C9A7", sub:"en el período"},
              {label:"Seguimientos totales", val:kpiPeriodo.totalS, color:"#F7B731", sub:"en el período"},
              {label:"Cumpl. promedio", val:avgPctGlobal+"%", color:"#4F8EF7", sub:"del período"},
              {label:"Ingresos hoy", val:totalIHoy, color:"#26DE81", sub:`de ${totalMeta} meta`},
              {label:"Auditores", val:listaAuditores.length, color:"#e8f0fe", sub:"activas"},
            ].map(k=>(
              <div key={k.label} style={{background:"#0f1f35",border:"1px solid #1e2d45",borderRadius:12,padding:"12px 14px"}}>
                <div style={{fontSize:10,color:"#4f7096",textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:5}}>{k.label}</div>
                <div style={{fontSize:28,fontWeight:800,color:k.color,lineHeight:1}}>{k.val}</div>
                <div style={{fontSize:10,color:"#4f7096",marginTop:3}}>{k.sub}</div>
              </div>
            ))}
          </div>

          {/* ── Tarjetas por Auditor(a) (% = promedio del período) ── */}
          <div style={{fontSize:11,color:"#4f7096",marginBottom:10,textTransform:"uppercase",letterSpacing:"0.06em"}}>
            Desempeño por auditor(a) — {rangoDesde} → {rangoHasta}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:12,marginBottom:20}}>
            {listaAuditores.map(([id,a],i)=>{
              const color=COLORS[i%COLORS.length];
              const diaHoy=(historial[hoy]&&historial[hoy][id])||{ingresos:0,seguimientos:0};
              const ingHoy=diaHoy.ingresos||0;
              const segHoy=diaHoy.seguimientos||0;
              const meta=a.meta||30;
              const pctHoy=meta>0?Math.round((ingHoy/meta)*100):0;
              const {avgPct,avgIngresos,avgSeguimientos,diasContados,totalIngresos,totalSeguimientos}=calcPromedio(historial,id,{[id]:a},rangoDesde,rangoHasta);
              const pctShow=diasContados>0?avgPct:pctHoy;
              return(
                <div key={id} style={{background:"linear-gradient(145deg,#0f1f35,#0d1a2d)",border:"1px solid #1e2d45",borderRadius:16,padding:"16px 18px"}}>
                  {/* Nombre + radial */}
                  <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:10}}>
                    <div>
                      <div style={{fontSize:10,color,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:4}}>{a.nombre}</div>
                      <div style={{fontSize:42,fontWeight:800,lineHeight:1,letterSpacing:"-1px",color:pctShow>=100?"#26DE81":pctShow>=70?"#F7B731":"#e8f0fe"}}>{pctShow}%</div>
                      <div style={{fontSize:10,color:"#4f7096",marginTop:2}}>
                        {diasContados>0?"cumpl. prom. período":"cumpl. hoy"} · meta {meta}
                      </div>
                    </div>
                    <div style={{position:"relative"}}>
                      <RadialProgress pct={pctShow} color={pctShow>=100?"#26DE81":color} size={64}/>
                      <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,color:pctShow>=100?"#26DE81":color}}>{pctShow}%</div>
                    </div>
                  </div>

                  {/* Métricas del período */}
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:8}}>
                    <div style={{background:"#0b1523",borderRadius:9,padding:"7px 10px",border:"1px solid #1e2d45"}}>
                      <div style={{fontSize:9,color:"#00C9A7",textTransform:"uppercase",fontWeight:700}}>Ingresos (I)</div>
                      <div style={{fontSize:22,fontWeight:800,color:"#00C9A7",lineHeight:1,marginTop:2}}>{diasContados>0?totalIngresos:ingHoy}</div>
                      <div style={{fontSize:9,color:"#4f7096",marginTop:1}}>{diasContados>0?`prom. ${avgIngresos}/día`:`de ${meta} hoy`}</div>
                    </div>
                    <div style={{background:"#0b1523",borderRadius:9,padding:"7px 10px",border:"1px solid #1e2d45"}}>
                      <div style={{fontSize:9,color:"#F7B731",textTransform:"uppercase",fontWeight:700}}>Seguim. (S)</div>
                      <div style={{fontSize:22,fontWeight:800,color:"#F7B731",lineHeight:1,marginTop:2}}>{diasContados>0?totalSeguimientos:segHoy}</div>
                      <div style={{fontSize:9,color:"#4f7096",marginTop:1}}>{diasContados>0?`prom. ${avgSeguimientos}/día`:"hoy"}</div>
                    </div>
                  </div>

                  {/* Barra de progreso del período */}
                  <div style={{height:5,background:"#1e2d45",borderRadius:99,overflow:"hidden",marginBottom:8}}>
                    <div style={{height:"100%",borderRadius:99,background:pctShow>=100?"#26DE81":color,width:`${Math.min(pctShow,100)}%`,transition:"width 0.5s ease"}}/>
                  </div>

                  {/* Promedios del período */}
                  {diasContados>0&&(
                    <div style={{background:"#0b152366",border:"1px solid #1e2d4555",borderRadius:8,padding:"6px 10px",marginBottom:8}}>
                      <div style={{fontSize:9,color:"#4f7096",textTransform:"uppercase",marginBottom:4}}>Promedios del período ({diasContados} días)</div>
                      <div style={{display:"flex",gap:12}}>
                        <div><div style={{fontSize:14,fontWeight:700,color:"#4F8EF7"}}>{avgPct}%</div><div style={{fontSize:9,color:"#4f7096"}}>% cumpl.</div></div>
                        <div><div style={{fontSize:14,fontWeight:700,color:"#4F8EF7"}}>{avgIngresos}</div><div style={{fontSize:9,color:"#4f7096"}}>I/día</div></div>
                        <div><div style={{fontSize:14,fontWeight:700,color:"#4f7096"}}>{avgSeguimientos}</div><div style={{fontSize:9,color:"#4f7096"}}>S/día</div></div>
                      </div>
                    </div>
                  )}

                  {/* Ajuste manual */}
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <span style={{fontSize:10,color:"#4f7096",flex:1}}>Ajuste ingresos hoy:</span>
                    <button onClick={()=>ajustarConteo(id,-1)} style={{background:"#1e2d45",color:"#FC5C65",border:"none",borderRadius:7,padding:"5px 13px",cursor:"pointer",fontSize:16,fontWeight:700}}>-</button>
                    <button onClick={()=>ajustarConteo(id,1)} style={{background:"#1e2d45",color:"#26DE81",border:"none",borderRadius:7,padding:"5px 13px",cursor:"pointer",fontSize:16,fontWeight:700}}>+</button>
                  </div>
                  {pctHoy>=100&&<div style={{marginTop:7,textAlign:"center",fontSize:11,color:"#26DE81",fontWeight:700}}>Meta cumplida hoy</div>}
                </div>
              );
            })}
          </div>

          {/* ── Tabla resumen de revisiones ── */}
          <div style={{background:"#0f1f35",border:"1px solid #1e2d45",borderRadius:14,padding:"16px 18px"}}>
            <div style={{fontSize:12,fontWeight:700,color:"#4F8EF7",marginBottom:12,textTransform:"uppercase",letterSpacing:"0.06em"}}>
              Resumen de revisiones — {rangoDesde} → {rangoHasta}
            </div>
            {/* Filtros tabla */}
            <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
              <select value={filtroAud} onChange={e=>setFiltroAud(e.target.value)} style={{...inp,width:"auto",fontSize:12}}>
                <option value="todas">Todas las Auditores</option>
                {listaAuditores.map(([id,a])=><option key={id} value={id}>{a.nombre}</option>)}
              </select>
            </div>
            {/* Tabla */}
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                <thead>
                  <tr style={{borderBottom:"1px solid #1e2d45"}}>
                    {["Auditor(a)","Ingresos (I)","Seguim. (S)","Total","% Cumpl. prom.","I prom./día","S prom./día","Días activos","Estado"].map(h=>(
                      <th key={h} style={{padding:"6px 10px",textAlign:"left",fontSize:10,color:"#4f7096",textTransform:"uppercase",letterSpacing:"0.05em",fontWeight:600,whiteSpace:"nowrap"}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(filtroAud==="todas"?listaAuditores:listaAuditores.filter(([id])=>id===filtroAud)).map(([id,a],i)=>{
                    const {avgPct,avgIngresos,avgSeguimientos,diasContados,totalIngresos,totalSeguimientos}=calcPromedio(historial,id,{[id]:a},rangoDesde,rangoHasta);
                    const estado=avgPct>=80?{label:"En meta",bg:"#0d2a1e",color:"#26DE81"}:avgPct>=50?{label:"Parcial",bg:"#2a1f0d",color:"#F7B731"}:{label:"Por debajo",bg:"#2a1010",color:"#FC5C65"};
                    return(
                      <tr key={id} style={{borderBottom:"1px solid #1e2d4555"}}>
                        <td style={{padding:"10px",fontWeight:600,color:"#e8f0fe"}}>{a.nombre}</td>
                        <td style={{padding:"10px",color:"#00C9A7",fontWeight:700}}>{totalIngresos}</td>
                        <td style={{padding:"10px",color:"#F7B731",fontWeight:700}}>{totalSeguimientos}</td>
                        <td style={{padding:"10px",color:"#e8f0fe",fontWeight:700}}>{totalIngresos+totalSeguimientos}</td>
                        <td style={{padding:"10px"}}>
                          <span style={{color:avgPct>=80?"#26DE81":avgPct>=50?"#F7B731":"#FC5C65",fontWeight:700}}>{avgPct}%</span>
                        </td>
                        <td style={{padding:"10px",color:"#4f7096"}}>{avgIngresos}</td>
                        <td style={{padding:"10px",color:"#4f7096"}}>{avgSeguimientos}</td>
                        <td style={{padding:"10px",color:"#4f7096"}}>{diasContados}</td>
                        <td style={{padding:"10px"}}>
                          <span style={{background:estado.bg,color:estado.color,borderRadius:6,padding:"3px 8px",fontSize:10,fontWeight:700}}>{estado.label}</span>
                        </td>
                      </tr>
                    );
                  })}
                  {/* Fila de totales */}
                  {filtroAud==="todas"&&(()=>{
                    const tots=listaAuditores.reduce((acc,[id,a])=>{
                      const p=calcPromedio(historial,id,{[id]:a},rangoDesde,rangoHasta);
                      acc.i+=p.totalIngresos; acc.s+=p.totalSeguimientos; acc.pct+=p.avgPct;
                      return acc;
                    },{i:0,s:0,pct:0});
                    return(
                      <tr style={{borderTop:"2px solid #1e2d45",background:"#0b1a2a"}}>
                        <td style={{padding:"10px",fontWeight:700,color:"#4f7096",fontSize:10,textTransform:"uppercase"}}>Total general</td>
                        <td style={{padding:"10px",color:"#00C9A7",fontWeight:800}}>{tots.i}</td>
                        <td style={{padding:"10px",color:"#F7B731",fontWeight:800}}>{tots.s}</td>
                        <td style={{padding:"10px",color:"#e8f0fe",fontWeight:800}}>{tots.i+tots.s}</td>
                        <td style={{padding:"10px",color:"#4F8EF7",fontWeight:800}}>{listaAuditores.length>0?Math.round(tots.pct/listaAuditores.length):0}%</td>
                        <td colSpan={4} style={{padding:"10px",color:"#4f7096",fontSize:10}}>promedio grupal del período</td>
                      </tr>
                    );
                  })()}
                </tbody>
              </table>
            </div>
          </div>

        </>)}

        {coordView==="log"&&(()=>{
          const logFiltrado = log.filter(e=>{
            if(e.tipoReg==="reset") return false;
            if(filtroLogAud!=="todas" && e.Auditor(a)Id!==filtroLogAud) return false;
            if(filtroLogTipo!=="todos" && e.tipoReg!==filtroLogTipo) return false;
            if(filtroLogFecha && (e.fecha||"")!==filtroLogFecha) return false;
            return true;
          });
          return(
          <div>
            <div style={{fontSize:14,fontWeight:700,marginBottom:12,color:"#4F8EF7"}}>📝 Registros individuales</div>

            {/* Leyenda */}
            <div style={{fontSize:12,color:"#4f7096",marginBottom:10}}>
              <span style={{background:"#00C9A722",color:"#00C9A7",borderRadius:5,padding:"2px 7px",marginRight:6,fontWeight:700}}>I</span>Ingreso — meta
              <span style={{background:"#F7B73122",color:"#F7B731",borderRadius:5,padding:"2px 7px",marginLeft:10,marginRight:6,fontWeight:700}}>S</span>Seguimiento
            </div>

            {/* Filtros */}
            <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap",background:"#0f1f35",border:"1px solid #1e2d45",borderRadius:12,padding:"12px 14px"}}>
              <div style={{display:"flex",flexDirection:"column",gap:4,flex:1,minWidth:140}}>
                <div style={{fontSize:10,color:"#4f7096",textTransform:"uppercase"}}>Auditor(a)</div>
                <select value={filtroLogAud} onChange={e=>setFiltroLogAud(e.target.value)} style={{...inp,fontSize:12}}>
                  <option value="todas">Todas</option>
                  {listaAuditores.map(([id,a])=><option key={id} value={id}>{a.nombre}</option>)}
                </select>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:4,minWidth:120}}>
                <div style={{fontSize:10,color:"#4f7096",textTransform:"uppercase"}}>Tipo</div>
                <select value={filtroLogTipo} onChange={e=>setFiltroLogTipo(e.target.value)} style={{...inp,fontSize:12}}>
                  <option value="todos">Todos</option>
                  <option value="I">Ingreso (I)</option>
                  <option value="S">Seguimiento (S)</option>
                </select>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:4,minWidth:140}}>
                <div style={{fontSize:10,color:"#4f7096",textTransform:"uppercase"}}>Fecha especifica</div>
                <input type="date" value={filtroLogFecha} onChange={e=>setFiltroLogFecha(e.target.value)}
                  style={{...inp,fontSize:12,colorScheme:"dark"}}/>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:4,justifyContent:"flex-end"}}>
                <button onClick={()=>{setFiltroLogFecha("");setFiltroLogAud("todas");setFiltroLogTipo("todos");}}
                  style={{...mkBtn("#1e2d45","#4f7096"),fontSize:11,padding:"8px 12px"}}>
                  Limpiar filtros
                </button>
              </div>
            </div>

            {/* Contador */}
            <div style={{fontSize:11,color:"#4f7096",marginBottom:8}}>
              Mostrando <strong style={{color:"#e8f0fe"}}>{logFiltrado.length}</strong> de {log.filter(e=>e.tipoReg!=="reset").length} registros
              {filtroLogFecha&&<span style={{marginLeft:6,color:"#4F8EF7"}}>· {fechaHumana(filtroLogFecha)}</span>}
            </div>

            {/* Lista */}
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {logFiltrado.map((entry,i)=>{
                const idx=listaAuditores.findIndex(([id])=>id===entry.Auditor(a)Id);
                const color=COLORS[idx>=0?idx%COLORS.length:0];
                const esI=entry.tipoReg==="I";
                return(
                  <div key={entry._id||i} style={{background:"#0f1f35",border:"1px solid #1e2d45",borderLeft:`4px solid ${color}`,borderRadius:10,padding:"10px 14px",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                    <div style={{flex:1,minWidth:160}}>
                      <div style={{display:"flex",alignItems:"center",gap:7}}>
                        <span style={{fontSize:10,fontWeight:800,background:esI?"#00C9A722":"#F7B73122",color:esI?"#00C9A7":"#F7B731",borderRadius:5,padding:"1px 6px"}}>{esI?"I":"S"}</span>
                        <span style={{fontSize:12,fontWeight:700,color:"#e8f0fe"}}>{entry.nombre}</span>
                      </div>
                      <div style={{fontSize:11,color:"#4f7096",marginTop:2}}>
                        {fechaHumana(entry.fecha||hoy)} · {entry.ts} · {entry.servicio||"—"} / {entry.unidad||"—"}{entry.numero?` · ${entry.numero}`:""}
                        {entry.esAjuste&&<span style={{marginLeft:6,background:"#F7B73122",color:"#F7B731",borderRadius:4,padding:"1px 5px",fontSize:9}}>Ajuste</span>}
                      </div>
                    </div>
                    <div style={{display:"flex",gap:5}}>
                      <button onClick={()=>setModalEditLog(entry)} style={mkBtn("#1e2d45","#4F8EF7")}>✏</button>
                      <button onClick={()=>eliminarLogEntry(entry)} style={{...mkBtn("#1e1530","#FC5C65"),border:"1px solid #3d1f2b"}}>🗑</button>
                    </div>
                  </div>
                );
              })}
              {logFiltrado.length===0&&(
                <div style={{fontSize:13,color:"#4f7096",textAlign:"center",padding:"30px 0"}}>
                  {log.filter(e=>e.tipoReg!=="reset").length===0
                    ?"No hay registros aun."
                    :"Ningun registro coincide con los filtros aplicados."}
                </div>
              )}
            </div>
          </div>
          );
        })()}

        {coordView==="historial"&&(
          <div>
            <div style={{fontSize:14,fontWeight:700,marginBottom:12,color:"#4F8EF7"}}>📅 Historial y promedios</div>
            <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
              <select value={filtroAud} onChange={e=>setFiltroAud(e.target.value)} style={{...inp,flex:1,maxWidth:260}}>
                <option value="todas">Todos los auditor(es)</option>
                {listaAuditores.map(([id,a])=><option key={id} value={id}>{a.nombre}</option>)}
              </select>
              <select value={filtroRango} onChange={e=>setFiltroRango(e.target.value)} style={{...inp,width:160}}>
                {PERIODOS.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </div>
            {filtroAud!=="todas"&&Auditores[filtroAud]&&(()=>{
              const histDesde=diasAtras(PERIODOS.find(p=>p.id===filtroRango)?.dias||7);
              const {avgPct,avgIngresos,avgSeguimientos,diasContados}=calcPromedio(historial,filtroAud,{[filtroAud]:Auditores[filtroAud]},histDesde,hoy);
              return(
                <div style={{background:"#0f1f35",border:"1px solid #4F8EF733",borderRadius:12,padding:"12px 16px",marginBottom:12,display:"flex",gap:16,flexWrap:"wrap"}}>
                  <div><div style={{fontSize:10,color:"#4f7096",textTransform:"uppercase"}}>Prom. % cumplimiento</div><div style={{fontSize:22,fontWeight:800,color:"#4F8EF7"}}>{avgPct}%</div></div>
                  <div><div style={{fontSize:10,color:"#4f7096",textTransform:"uppercase"}}>Prom. ingresos/dia</div><div style={{fontSize:22,fontWeight:800,color:"#00C9A7"}}>{avgIngresos}</div></div>
                  <div><div style={{fontSize:10,color:"#4f7096",textTransform:"uppercase"}}>Dias con actividad</div><div style={{fontSize:22,fontWeight:800,color:"#e8f0fe"}}>{diasContados}</div></div>
                </div>
              );
            })()}
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {getHistFiltrado().map(([dia,diaData])=>{
                const entradas=filtroAud==="todas"?Object.entries(diaData):Object.entries(diaData).filter(([id])=>id===filtroAud);
                if(entradas.length===0) return null;
                const totI=entradas.reduce((s,[,d])=>s+(d.ingresos||0),0);
                const totS=entradas.reduce((s,[,d])=>s+(d.seguimientos||0),0);
                return(
                  <div key={dia} style={{background:"#0f1f35",border:"1px solid #1e2d45",borderRadius:12,padding:"12px 16px"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,flexWrap:"wrap",gap:6}}>
                      <div style={{fontSize:12,color:"#4F8EF7",fontWeight:700}}>{fechaLarga(dia)}</div>
                      <div style={{display:"flex",gap:10}}>
                        <span style={{fontSize:12,color:"#00C9A7",fontWeight:700}}>{totI} ingresos</span>
                        <span style={{fontSize:12,color:"#F7B731",fontWeight:700}}>{totS} seguim.</span>
                      </div>
                    </div>
                    {entradas.map(([audId,datos])=>{
                      const idx=listaAuditores.findIndex(([id])=>id===audId);
                      const color=COLORS[idx>=0?idx%COLORS.length:0];
                      const meta=Auditores[audId]?.meta||30, ing=datos.ingresos||0;
                      const pct=meta>0?Math.round((ing/meta)*100):0;
                      return(
                        <div key={audId} style={{marginBottom:7,paddingLeft:8,borderLeft:`3px solid ${color}`}}>
                          <div style={{display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:4}}>
                            <span style={{fontSize:12,color:"#e8f0fe",fontWeight:600}}>{Auditores[audId]?.nombre||audId}</span>
                            <div style={{display:"flex",gap:8}}>
                              <span style={{fontSize:11,color:"#00C9A7"}}>I: <strong>{ing}</strong> ({pct}%)</span>
                              <span style={{fontSize:11,color:"#F7B731"}}>S: <strong>{datos.seguimientos||0}</strong></span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
              {getHistFiltrado().length===0&&<div style={{fontSize:13,color:"#4f7096",textAlign:"center",padding:"30px 0"}}>No hay datos para el periodo.</div>}
            </div>
          </div>
        )}

        {coordView==="config"&&(
          <div style={{maxWidth:560}}>
            <div style={{fontSize:14,fontWeight:700,marginBottom:14,color:"#4F8EF7"}}>⚙ Configuracion</div>
            <div style={{background:"#0f1f35",border:"1px solid #1e2d45",borderRadius:13,padding:"15px 17px",marginBottom:13}}>
              <div style={{fontSize:11,color:"#4f7096",marginBottom:10,textTransform:"uppercase"}}>🖼 Logo</div>
              {config.logoUrl&&(<div style={{marginBottom:10,display:"flex",alignItems:"center",gap:10}}>
                <img src={config.logoUrl} alt="Logo" style={{width:60,height:60,borderRadius:10,objectFit:"contain",background:"#fff",padding:4}}/>
                <div><div style={{fontSize:11,color:"#26DE81",marginBottom:6}}>Logo activo</div><button onClick={quitarLogo} style={{...mkBtn("#1e1530","#FC5C65"),fontSize:11,border:"1px solid #3d1f2b"}}>Quitar</button></div>
              </div>)}
              <div style={{display:"flex",gap:7}}><input value={logoInput} onChange={e=>setLogoInput(e.target.value)} placeholder="URL del logo (https://...)" style={{...inp,flex:1}}/><button onClick={guardarLogo} style={mkBtn("#4F8EF7","#fff")}>Guardar</button></div>
              {logoMsg&&<div style={{fontSize:12,color:"#26DE81",marginTop:7}}>{logoMsg}</div>}
              <div style={{fontSize:10,color:"#4f7096",marginTop:6}}>Sube tu logo en imgbb.com y pega el enlace directo.</div>
            </div>
            <div style={{background:"#0f1f35",border:"1px solid #1e2d45",borderRadius:13,padding:"15px 17px",marginBottom:13}}>
              <div style={{fontSize:11,color:"#4f7096",marginBottom:10,textTransform:"uppercase"}}>🏥 Institucion</div>
              <div style={{display:"flex",flexDirection:"column",gap:7}}>
                <input key={"i"+config.institucion} defaultValue={config.institucion} placeholder="Nombre de la institucion" onBlur={e=>guardarConfig("institucion",e.target.value)} style={inp}/>
                <input key={"a"+config.area} defaultValue={config.area} placeholder="Area (ej. Auditoria Clinica)" onBlur={e=>guardarConfig("area",e.target.value)} style={inp}/>
              </div>
              <div style={{fontSize:10,color:"#4f7096",marginTop:5}}>Se guarda al salir del campo</div>
            </div>
            <div style={{background:"#0f1f35",border:"1px solid #1e2d45",borderRadius:13,padding:"15px 17px",marginBottom:13}}>
              <div style={{fontSize:11,color:"#4f7096",marginBottom:10,textTransform:"uppercase"}}>🔐 Cambiar PIN</div>
              <div style={{display:"flex",gap:7}}><input type="password" value={newPin} onChange={e=>setNewPin(e.target.value)} placeholder="Nuevo PIN (min. 4 caracteres)" style={{...inp,flex:1}}/><button onClick={cambiarPin} style={mkBtn("#4F8EF7","#fff")}>Guardar</button></div>
              {pinMsg&&<div style={{fontSize:12,color:"#26DE81",marginTop:7}}>{pinMsg}</div>}
            </div>
            <div style={{background:"#0f1f35",border:"1px solid #1e2d45",borderRadius:13,padding:"15px 17px",marginBottom:13}}>
              <div style={{fontSize:11,color:"#4f7096",marginBottom:10,textTransform:"uppercase"}}>🏷 Servicios</div>
              <div style={{display:"flex",gap:7,marginBottom:10}}><input value={nuevoSvc} onChange={e=>setNuevoSvc(e.target.value)} placeholder="Ej: Urgencias, UCI..." onKeyDown={e=>e.key==="Enter"&&agregarSvc()} style={{...inp,flex:1}}/><button onClick={agregarSvc} style={mkBtn("#00C9A7")}>+ Agregar</button></div>
              <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                {listaServicios.map(([sid,s])=>(<div key={sid} style={{display:"flex",alignItems:"center",gap:5,background:"#0b1523",border:"1px solid #1e2d45",borderRadius:7,padding:"4px 9px"}}><span style={{fontSize:12}}>{s.nombre}</span><button onClick={()=>eliminarSvc(sid)} style={{background:"none",border:"none",color:"#FC5C65",cursor:"pointer",fontSize:11,padding:0}}>x</button></div>))}
                {listaServicios.length===0&&<div style={{fontSize:12,color:"#4f7096"}}>Agrega el primer servicio.</div>}
              </div>
            </div>
            <div style={{background:"#0f1f35",border:"1px solid #1e2d45",borderRadius:13,padding:"15px 17px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:11}}>
                <div style={{fontSize:11,color:"#4f7096",textTransform:"uppercase"}}>👩‍⚕️ Auditores</div>
                <button onClick={abrirNueva} style={mkBtn("#00C9A7")}>+ Nueva</button>
              </div>
              {listaAuditores.map(([id,a],i)=>{
                const color=COLORS[i%COLORS.length];
                return(<div key={id} style={{borderLeft:`4px solid ${color}`,background:"#0b1523",border:"1px solid #1e2d45",borderRadius:9,padding:"10px 13px",marginBottom:7}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                    <div>
                      <div style={{fontWeight:700,fontSize:13}}>{a.nombre}</div>
                      <div style={{fontSize:11,color:"#4f7096",marginTop:1}}>Meta Ingresos: {a.meta} · {(a.servicios||[]).length} servicios</div>
                      <div style={{display:"flex",flexWrap:"wrap",gap:3,marginTop:4}}>
                        {listaServicios.filter(([sid])=>(a.servicios||[]).includes(sid)).map(([sid,s])=>(<span key={sid} style={{fontSize:9,background:`${color}22`,color,border:`1px solid ${color}44`,borderRadius:4,padding:"2px 5px"}}>{s.nombre}</span>))}
                      </div>
                    </div>
                    <div style={{display:"flex",gap:5}}>
                      <button onClick={()=>abrirEditar(id)} style={mkBtn("#1e2d45","#e8f0fe")}>✏</button>
                      <button onClick={()=>eliminarAud(id)} style={{...mkBtn("#1e1530","#FC5C65"),border:"1px solid #3d1f2b"}}>🗑</button>
                    </div>
                  </div>
                </div>);
              })}
              {listaAuditores.length===0&&<div style={{fontSize:12,color:"#4f7096"}}>Agrega la primera Auditor(a).</div>}
            </div>
          </div>
        )}
      </div>

      {modalEditLog&&(<Modal title="Editar registro" onClose={()=>setModalEditLog(null)}>
        <EditLogForm entry={modalEditLog} listaServicios={listaServicios} onSave={c=>guardarEdicionLog(modalEditLog._id,c)} onCancel={()=>setModalEditLog(null)}/>
      </Modal>)}

      {modalAud!==null&&(<Modal title={modalAud==="new"?"Nueva Auditor(a)":"Editar Auditor(a)"} onClose={()=>setModalAud(null)}>
        <div style={{display:"flex",flexDirection:"column",gap:11}}>
          <input value={formAud.nombre} onChange={e=>setFormAud(f=>({...f,nombre:e.target.value}))} placeholder="Nombre completo" style={inp}/>
          <div style={{display:"flex",alignItems:"center",gap:9}}><span style={{fontSize:12,color:"#4f7096",whiteSpace:"nowrap"}}>Meta diaria Ingresos:</span><input type="number" value={formAud.meta} onChange={e=>setFormAud(f=>({...f,meta:e.target.value}))} style={{...inp,width:80}}/></div>
          <div>
            <div style={{fontSize:11,color:"#4f7096",marginBottom:8,textTransform:"uppercase"}}>Servicios asignados</div>
            {listaServicios.length===0?<div style={{fontSize:12,color:"#4f7096"}}>Primero agrega servicios.</div>
              :<div style={{display:"flex",flexDirection:"column",gap:7}}>
                {listaServicios.map(([sid,s])=>(<label key={sid} style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:13}}><input type="checkbox" checked={(formAud.servicios||[]).includes(sid)} onChange={()=>toggleSvc(sid)} style={{accentColor:"#00C9A7",width:15,height:15}}/>{s.nombre}</label>))}
              </div>}
          </div>
          <button onClick={guardarAud} style={{...mkBtn("linear-gradient(135deg,#00C9A7,#4F8EF7)","#fff"),padding:"11px 0",fontSize:14,borderRadius:10,marginTop:4}}>Guardar</button>
        </div>
      </Modal>)}
    </div>
  );
}

export default function App(){
  const [config,setConfig]=useState({institucion:"",area:"",pin:DEFAULT_PIN,logoUrl:""});
  const [Auditores,setAuditores]=useState({});
  const [servicios,setServicios]=useState({});
  const [historial,setHistorial]=useState({});
  const [log,setLog]=useState([]);
  const [connected,setConnected]=useState(true);
  const [pantalla,setPantalla]=useState("portada");

  useEffect(()=>{
    const pairs=[
      [ref(db,"config"),s=>setConfig(s.val()||{institucion:"",area:"",pin:DEFAULT_PIN,logoUrl:""})],
      [ref(db,"Auditores"),s=>{setAuditores(s.val()||{});setConnected(true);}],
      [ref(db,"servicios"),s=>setServicios(s.val()||{})],
      [ref(db,"historial"),s=>setHistorial(s.val()||{})],
      [ref(db,"log"),s=>{const d=s.val();setLog(d?Object.entries(d).map(([id,v])=>({...v,_id:id})).sort((a,b)=>b.ts_ms-a.ts_ms).slice(0,2000):[]); }],
    ];
    const unsubs=pairs.map(([r,cb])=>onValue(r,cb,()=>setConnected(false)));
    return()=>unsubs.forEach(u=>u());
  },[]);

  if(pantalla==="portada") return <Portada config={config} onSelectRol={rol=>setPantalla(rol==="Auditor(a)"?"Auditor(a)":"login-coord")}/>;
  if(pantalla==="Auditor(a)") return <VistaAuditor(a) config={config} Auditores={Auditores} servicios={servicios} historial={historial} connected={connected} onBack={()=>setPantalla("portada")}/>;
  if(pantalla==="login-coord") return <LoginCoordinador onLogin={()=>setPantalla("coord")} onBack={()=>setPantalla("portada")}/>;
  if(pantalla==="coord") return <VistaCoordinador config={config} Auditores={Auditores} servicios={servicios} historial={historial} log={log} connected={connected} onBack={()=>setPantalla("portada")}/>;
  return null;
}
