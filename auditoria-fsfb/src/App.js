import { useState, useEffect } from "react";
import { db } from "./firebase";
import { ref, onValue, set, update, push, remove } from "firebase/database";
import * as XLSX from "xlsx";

const COLORS = ["#00C9A7","#4F8EF7","#F7B731","#FC5C65","#45AAF2","#A55EEA","#FD9644","#26DE81"];
const TIPOS = ["Urgencias", "Hospitalización", "Ambulatorio", "UCI", "Quirúrgico", "Otro"];

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

export default function App() {
  const [auditoras, setAuditoras] = useState({});
  const [log, setLog] = useState([]);
  const [view, setView] = useState("dashboard");
  const [pulse, setPulse] = useState(null);
  const [newNombre, setNewNombre] = useState("");
  const [newMeta, setNewMeta] = useState(30);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editMeta, setEditMeta] = useState("");
  const [selectedTipo, setSelectedTipo] = useState({});
  const [connected, setConnected] = useState(true);

  // Escuchar auditoras en tiempo real
  useEffect(() => {
    const audRef = ref(db, "auditoras");
    const unsub = onValue(audRef, (snap) => {
      setAuditoras(snap.val() || {});
      setConnected(true);
    }, () => setConnected(false));
    return () => unsub();
  }, []);

  // Escuchar log en tiempo real
  useEffect(() => {
    const logRef = ref(db, "log");
    const unsub = onValue(logRef, (snap) => {
      const data = snap.val();
      if (data) {
        const arr = Object.values(data).sort((a, b) => b.ts_ms - a.ts_ms).slice(0, 50);
        setLog(arr);
      } else {
        setLog([]);
      }
    });
    return () => unsub();
  }, []);

  const ts = () => new Date().toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const fecha = () => new Date().toLocaleDateString("es-CO", { day: "2-digit", month: "2-digit", year: "numeric" });

  const registrar = async (id, delta) => {
    const a = auditoras[id];
    if (!a) return;
    const tipo = selectedTipo[id] || "Sin clasificar";
    const nuevas = Math.max(0, (a.historias || 0) + delta);
    await update(ref(db, `auditoras/${id}`), { historias: nuevas });

    // Log por tipo
    const tiposActual = { ...(a.tipos || {}) };
    if (delta > 0) tiposActual[tipo] = (tiposActual[tipo] || 0) + 1;
    await update(ref(db, `auditoras/${id}`), { tipos: tiposActual });

    await push(ref(db, "log"), {
      ts: ts(), ts_ms: Date.now(),
      nombre: a.nombre, delta, total: nuevas, tipo
    });
    setPulse(id);
    setTimeout(() => setPulse(null), 600);
  };

  const agregarAuditora = async () => {
    if (!newNombre.trim()) return;
    const newRef = push(ref(db, "auditoras"));
    await set(newRef, {
      nombre: newNombre.trim(),
      meta: parseInt(newMeta) || 30,
      historias: 0,
      tipos: {}
    });
    setNewNombre("");
    setNewMeta(30);
  };

  const eliminarAuditora = async (id) => {
    if (!window.confirm("¿Eliminar esta auditora?")) return;
    await remove(ref(db, `auditoras/${id}`));
  };

  const guardarEdicion = async () => {
    await update(ref(db, `auditoras/${editingId}`), {
      nombre: editName,
      meta: parseInt(editMeta) || 30
    });
    setEditingId(null);
  };

  const resetAll = async () => {
    if (!window.confirm("¿Reiniciar todos los conteos?")) return;
    const updates = {};
    Object.keys(auditoras).forEach(id => {
      updates[`auditoras/${id}/historias`] = 0;
      updates[`auditoras/${id}/tipos`] = {};
    });
    await update(ref(db), updates);
    await push(ref(db, "log"), {
      ts: ts(), ts_ms: Date.now(),
      nombre: "Sistema", delta: 0, total: 0, tipo: "reset"
    });
  };

  const exportToExcel = () => {
    const hoy = fecha();
    const ahora = ts();
    const listaAuditoras = Object.values(auditoras);
    const wb = XLSX.utils.book_new();

    // Hoja 1: Resumen
    const resumenRows = [
      ["FUNDACIÓN SANTA FE DE BOGOTÁ"],
      ["Reporte de Auditoría Concurrente — Revisión de Historias Clínicas"],
      [`Fecha: ${hoy}     Hora: ${ahora}`],
      [],
      ["Auditora", "Total Historias", "Meta", "% Cumplimiento", "Estado",
        ...TIPOS.map(t => t)],
      ...listaAuditoras.map(a => {
        const pct = a.meta > 0 ? a.historias / a.meta : 0;
        return [
          a.nombre,
          a.historias || 0,
          a.meta || 30,
          pct,
          pct >= 1 ? "✅ Meta cumplida" : pct >= 0.7 ? "🟡 En progreso" : "🔴 Por debajo",
          ...TIPOS.map(t => (a.tipos && a.tipos[t]) || 0)
        ];
      }),
      [],
      ["TOTAL",
        listaAuditoras.reduce((s, a) => s + (a.historias || 0), 0),
        listaAuditoras.reduce((s, a) => s + (a.meta || 30), 0),
        "",
        "",
        ...TIPOS.map(t => listaAuditoras.reduce((s, a) => s + ((a.tipos && a.tipos[t]) || 0), 0))
      ]
    ];
    const ws1 = XLSX.utils.aoa_to_sheet(resumenRows);
    ws1["!cols"] = [
      { wch: 28 }, { wch: 16 }, { wch: 10 }, { wch: 16 }, { wch: 20 },
      ...TIPOS.map(() => ({ wch: 16 }))
    ];
    // Formato % columna D
    listaAuditoras.forEach((_, i) => {
      const cell = `D${6 + i}`;
      if (ws1[cell]) ws1[cell].z = "0.0%";
    });
    XLSX.utils.book_append_sheet(wb, ws1, "Resumen");

    // Hoja 2: Log
    if (log.length > 0) {
      const logRows = [
        ["REGISTRO DE ACTIVIDAD"],
        [`Fecha: ${hoy}`],
        [],
        ["Hora", "Auditora", "Tipo de Historia", "Cambio", "Total acumulado"],
        ...log.map(e => [
          e.ts, e.nombre,
          e.tipo === "reset" ? "—" : e.tipo,
          e.tipo === "reset" ? "Reinicio" : e.delta > 0 ? `+${e.delta}` : `${e.delta}`,
          e.tipo === "reset" ? "—" : e.total
        ])
      ];
      const ws2 = XLSX.utils.aoa_to_sheet(logRows);
      ws2["!cols"] = [{ wch: 12 }, { wch: 28 }, { wch: 18 }, { wch: 10 }, { wch: 18 }];
      XLSX.utils.book_append_sheet(wb, ws2, "Registro de Actividad");
    }

    const fileName = `Auditoria_FSFB_${hoy.replace(/\//g, "-")}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  const listaAuditoras = Object.entries(auditoras);
  const total = listaAuditoras.reduce((s, [, a]) => s + (a.historias || 0), 0);
  const totalMeta = listaAuditoras.reduce((s, [, a]) => s + (a.meta || 30), 0);
  const pctGlobal = totalMeta > 0 ? Math.round((total / totalMeta) * 100) : 0;

  return (
    <div style={{ minHeight: "100vh", background: "#0b1523", fontFamily: "'DM Sans','Segoe UI',sans-serif", color: "#e8f0fe" }}>

      {/* Header */}
      <div style={{
        background: "linear-gradient(135deg,#0f1f35,#0b1523)",
        borderBottom: "1px solid #1e2d45", padding: "16px 24px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        flexWrap: "wrap", gap: 10, position: "sticky", top: 0, zIndex: 100
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: "linear-gradient(135deg,#00C9A7,#4F8EF7)",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18
          }}>📋</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Monitor de Auditoría Concurrente</div>
            <div style={{ fontSize: 11, color: "#4f7096" }}>Fundación Santa Fe de Bogotá · Historias Clínicas</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{
            fontSize: 11, padding: "4px 10px", borderRadius: 6,
            background: connected ? "#0d2a1e" : "#2a1010",
            color: connected ? "#26DE81" : "#FC5C65",
            border: `1px solid ${connected ? "#1a4a30" : "#4a1a1a"}`
          }}>
            {connected ? "● En línea" : "● Sin conexión"}
          </div>
          <button onClick={exportToExcel} style={{
            background: "linear-gradient(135deg,#26DE81,#00C9A7)", color: "#0b1523",
            border: "none", borderRadius: 8, padding: "7px 14px",
            cursor: "pointer", fontSize: 12, fontWeight: 700
          }}>📥 Exportar Excel</button>
          <button onClick={() => setView(view === "config" ? "dashboard" : "config")} style={{
            background: view === "config" ? "#4F8EF7" : "#1e2d45",
            color: "#e8f0fe", border: "none", borderRadius: 8,
            padding: "7px 14px", cursor: "pointer", fontSize: 12, fontWeight: 600
          }}>{view === "config" ? "← Dashboard" : "⚙ Configurar"}</button>
          <button onClick={resetAll} style={{
            background: "#1e1530", color: "#FC5C65",
            border: "1px solid #3d1f2b", borderRadius: 8,
            padding: "7px 12px", cursor: "pointer", fontSize: 12
          }}>↺ Reiniciar</button>
        </div>
      </div>

      {view === "dashboard" ? (
        <div style={{ padding: "20px 24px" }}>

          {/* Resumen global */}
          <div style={{
            background: "linear-gradient(135deg,#0f1f35,#111f33)",
            border: "1px solid #1e2d45", borderRadius: 16,
            padding: "22px 28px", marginBottom: 20,
            display: "flex", alignItems: "center", justifyContent: "space-between",
            flexWrap: "wrap", gap: 20
          }}>
            <div>
              <div style={{ fontSize: 12, color: "#4f7096", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
                Total historias revisadas hoy
              </div>
              <div style={{ fontSize: 50, fontWeight: 800, color: "#00C9A7", lineHeight: 1, letterSpacing: "-2px" }}>
                {total}
                <span style={{ fontSize: 18, color: "#4f7096", fontWeight: 400, marginLeft: 8 }}>/ {totalMeta}</span>
              </div>
              <div style={{ marginTop: 10, height: 6, background: "#1e2d45", borderRadius: 99, width: 260, overflow: "hidden" }}>
                <div style={{
                  height: "100%", borderRadius: 99,
                  background: pctGlobal >= 100 ? "#26DE81" : "linear-gradient(90deg,#00C9A7,#4F8EF7)",
                  width: `${Math.min(pctGlobal, 100)}%`, transition: "width 0.6s ease"
                }}/>
              </div>
              <div style={{ fontSize: 12, color: "#4f7096", marginTop: 6 }}>{pctGlobal}% de la meta grupal</div>
            </div>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              {[
                { label: "Auditoras", val: listaAuditoras.length, icon: "👩‍⚕️" },
                { label: "Promedio", val: listaAuditoras.length > 0 ? Math.round(total / listaAuditoras.length) : 0, icon: "📊" },
                { label: "Mejor marca", val: listaAuditoras.length > 0 ? Math.max(...listaAuditoras.map(([,a]) => a.historias || 0)) : 0, icon: "🏆" },
              ].map(s => (
                <div key={s.label} style={{
                  background: "#0b1523", border: "1px solid #1e2d45",
                  borderRadius: 12, padding: "14px 18px", textAlign: "center", minWidth: 90
                }}>
                  <div style={{ fontSize: 20 }}>{s.icon}</div>
                  <div style={{ fontSize: 26, fontWeight: 800, color: "#e8f0fe", marginTop: 4 }}>{s.val}</div>
                  <div style={{ fontSize: 10, color: "#4f7096", marginTop: 2 }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Tarjetas auditoras */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 16 }}>
            {listaAuditoras.map(([id, a], i) => {
              const color = COLORS[i % COLORS.length];
              const pct = (a.meta || 30) > 0 ? Math.round(((a.historias || 0) / a.meta) * 100) : 0;
              const isPulsing = pulse === id;
              return (
                <div key={id} style={{
                  background: "linear-gradient(145deg,#0f1f35,#0d1a2d)",
                  border: `1px solid ${isPulsing ? color : "#1e2d45"}`,
                  borderRadius: 16, padding: "18px 20px",
                  transition: "all 0.3s",
                  transform: isPulsing ? "scale(1.025)" : "scale(1)",
                  boxShadow: isPulsing ? `0 0 20px ${color}44` : "none"
                }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                    <div>
                      <div style={{ fontSize: 11, color, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>
                        {a.nombre}
                      </div>
                      <div style={{ fontSize: 42, fontWeight: 800, color: "#e8f0fe", lineHeight: 1, letterSpacing: "-1px" }}>
                        {a.historias || 0}
                      </div>
                      <div style={{ fontSize: 12, color: "#4f7096", marginTop: 2 }}>
                        de {a.meta || 30} · {pct}%
                      </div>
                    </div>
                    <div style={{ position: "relative" }}>
                      <RadialProgress pct={pct} color={color} size={70}/>
                      <div style={{
                        position: "absolute", inset: 0, display: "flex",
                        alignItems: "center", justifyContent: "center",
                        fontSize: 11, fontWeight: 700, color
                      }}>{pct}%</div>
                    </div>
                  </div>

                  {/* Selector tipo historia */}
                  <select
                    value={selectedTipo[id] || "Urgencias"}
                    onChange={e => setSelectedTipo(prev => ({ ...prev, [id]: e.target.value }))}
                    style={{
                      width: "100%", marginTop: 12,
                      background: "#0b1523", border: "1px solid #1e2d45",
                      borderRadius: 8, padding: "7px 10px",
                      color: "#e8f0fe", fontSize: 12, outline: "none"
                    }}
                  >
                    {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>

                  {/* Mini desglose por tipo */}
                  {a.tipos && Object.keys(a.tipos).length > 0 && (
                    <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {Object.entries(a.tipos).map(([tipo, cnt]) => (
                        <span key={tipo} style={{
                          fontSize: 10, background: `${color}22`, color,
                          border: `1px solid ${color}44`, borderRadius: 6,
                          padding: "2px 7px"
                        }}>{tipo}: {cnt}</span>
                      ))}
                    </div>
                  )}

                  {/* Barra progreso */}
                  <div style={{ marginTop: 12, height: 4, background: "#1e2d45", borderRadius: 99, overflow: "hidden" }}>
                    <div style={{
                      height: "100%", borderRadius: 99,
                      background: pct >= 100 ? "#26DE81" : color,
                      width: `${Math.min(pct, 100)}%`, transition: "width 0.5s ease"
                    }}/>
                  </div>

                  {/* Botones */}
                  <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                    <button onClick={() => registrar(id, -1)} style={{
                      flex: 1, padding: "10px 0", background: "#1e2d45",
                      color: "#e8f0fe", border: "1px solid #2a3d55",
                      borderRadius: 10, fontSize: 18, cursor: "pointer", fontWeight: 700
                    }}>−</button>
                    <button onClick={() => registrar(id, 1)} style={{
                      flex: 2, padding: "10px 0",
                      background: `${color}22`, color,
                      border: `1px solid ${color}55`,
                      borderRadius: 10, fontSize: 13, cursor: "pointer", fontWeight: 700
                    }}>+ Registrar</button>
                  </div>
                  {pct >= 100 && (
                    <div style={{ marginTop: 10, textAlign: "center", fontSize: 11, color: "#26DE81", fontWeight: 700 }}>
                      ✅ Meta cumplida
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Log */}
          {log.length > 0 && (
            <div style={{
              marginTop: 20, background: "#0f1f35",
              border: "1px solid #1e2d45", borderRadius: 16, padding: "16px 20px"
            }}>
              <div style={{ fontSize: 11, color: "#4f7096", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                📜 Actividad reciente
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5, maxHeight: 160, overflowY: "auto" }}>
                {log.slice(0, 15).map((e, i) => (
                  <div key={i} style={{
                    display: "flex", gap: 10, fontSize: 12, color: "#8faec4",
                    padding: "3px 0", borderBottom: "1px solid #1e2d4533"
                  }}>
                    <span style={{ color: "#4f7096", minWidth: 68 }}>{e.ts}</span>
                    <span style={{ fontWeight: 600, color: "#e8f0fe", minWidth: 120 }}>{e.nombre}</span>
                    {e.tipo !== "reset" ? (
                      <>
                        <span style={{ color: "#4f7096", minWidth: 100 }}>{e.tipo}</span>
                        <span style={{ color: e.delta > 0 ? "#26DE81" : "#FC5C65" }}>
                          {e.delta > 0 ? "+" : ""}{e.delta}
                        </span>
                        <span>→ <strong style={{ color: "#00C9A7" }}>{e.total}</strong></span>
                      </>
                    ) : <span style={{ color: "#F7B731" }}>🔄 Reinicio</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

      ) : (
        /* Configuración */
        <div style={{ padding: "20px 24px", maxWidth: 560 }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 18, color: "#4F8EF7" }}>⚙ Configuración de auditoras</div>

          {/* Nueva auditora */}
          <div style={{ background: "#0f1f35", border: "1px solid #1e2d45", borderRadius: 14, padding: "16px 18px", marginBottom: 18 }}>
            <div style={{ fontSize: 11, color: "#4f7096", marginBottom: 10, textTransform: "uppercase" }}>Agregar auditora</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input value={newNombre} onChange={e => setNewNombre(e.target.value)}
                placeholder="Nombre completo"
                onKeyDown={e => e.key === "Enter" && agregarAuditora()}
                style={{ flex: 2, minWidth: 160, background: "#0b1523", border: "1px solid #1e2d45", borderRadius: 8, padding: "8px 12px", color: "#e8f0fe", fontSize: 13 }}/>
              <input type="number" value={newMeta} onChange={e => setNewMeta(e.target.value)}
                placeholder="Meta"
                style={{ width: 70, background: "#0b1523", border: "1px solid #1e2d45", borderRadius: 8, padding: "8px 10px", color: "#e8f0fe", fontSize: 13 }}/>
              <button onClick={agregarAuditora} style={{
                background: "#00C9A7", color: "#0b1523", border: "none",
                borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontWeight: 700, fontSize: 13
              }}>+ Agregar</button>
            </div>
          </div>

          {listaAuditoras.map(([id, a], i) => {
            const color = COLORS[i % COLORS.length];
            return (
              <div key={id} style={{
                background: "#0f1f35", borderLeft: `4px solid ${color}`,
                border: "1px solid #1e2d45", borderRadius: 12, padding: "14px 18px", marginBottom: 10
              }}>
                {editingId === id ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <input value={editName} onChange={e => setEditName(e.target.value)}
                      style={{ background: "#0b1523", border: "1px solid #4F8EF7", borderRadius: 8, padding: "8px 12px", color: "#e8f0fe", fontSize: 13 }}/>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span style={{ fontSize: 12, color: "#4f7096" }}>Meta:</span>
                      <input type="number" value={editMeta} onChange={e => setEditMeta(e.target.value)}
                        style={{ width: 80, background: "#0b1523", border: "1px solid #4F8EF7", borderRadius: 8, padding: "7px 10px", color: "#e8f0fe", fontSize: 13 }}/>
                      <button onClick={guardarEdicion} style={{ background: "#00C9A7", color: "#0b1523", border: "none", borderRadius: 8, padding: "7px 14px", cursor: "pointer", fontWeight: 700, fontSize: 12 }}>Guardar</button>
                      <button onClick={() => setEditingId(null)} style={{ background: "#1e2d45", color: "#e8f0fe", border: "none", borderRadius: 8, padding: "7px 12px", cursor: "pointer", fontSize: 12 }}>Cancelar</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div>
                      <div style={{ fontWeight: 700 }}>{a.nombre}</div>
                      <div style={{ fontSize: 12, color: "#4f7096", marginTop: 2 }}>Meta: {a.meta} · Revisadas: {a.historias || 0}</div>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => { setEditingId(id); setEditName(a.nombre); setEditMeta(a.meta); }} style={{ background: "#1e2d45", color: "#e8f0fe", border: "none", borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontSize: 12 }}>✏ Editar</button>
                      <button onClick={() => eliminarAuditora(id)} style={{ background: "#1e1530", color: "#FC5C65", border: "1px solid #3d1f2b", borderRadius: 8, padding: "6px 10px", cursor: "pointer", fontSize: 12 }}>🗑</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
