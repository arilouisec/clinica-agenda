import { useState, useEffect, useCallback, useRef } from “react”;

// ─── Constants ────────────────────────────────────────────────────────────────
const CONSULTA_VALORES = { Particular: 300, Plano: 120, Retorno: 0 };
const FORMAS_PAGAMENTO = [“PIX”, “Dinheiro”, “Cartão”];
const STATUS_OPCOES = [“Agendado”, “Atendido”, “Faltou”];
const CLINICA_REPASSE = 0.15;
const STORAGE_KEY = “agenda_clinica_arianne_angela”;
const SYNC_INTERVAL = 5000; // 5 segundos

const USUARIOS = {
angela:  { senha: “angela123”,  perfil: “Secretária”, nome: “Ângela” },
arianne: { senha: “arianne123”, perfil: “Doutora”,    nome: “Arianne” },
};

const HORARIOS = [
“08:00”,“08:30”,“09:00”,“09:30”,“10:00”,“10:30”,
“11:00”,“11:30”,“13:00”,“13:30”,“14:00”,“14:30”,
“15:00”,“15:30”,“16:00”,“16:30”,“17:00”,“17:30”,
];

function hoje() {
return new Date().toISOString().split(“T”)[0];
}

function pacienteVazio(horario) {
return {
id: Date.now() + Math.random(),
horario,
nome: “”,
tipo: “Particular”,
valor: 300,
status: “Agendado”,
pago: false,
formaPagamento: “PIX”,
valorPago: 0,
data: hoje(),
};
}

function calcularResumo(agenda) {
const atendidos = agenda.filter(p => p.status === “Atendido”);
const pagos = atendidos.filter(p => p.pago);
const totalBruto = pagos.reduce((s, p) => s + (p.valorPago || 0), 0);
const repasse = totalBruto * CLINICA_REPASSE;
const liquido = totalBruto - repasse;
const particulares = pagos.filter(p => p.tipo === “Particular”).length;
const planos = pagos.filter(p => p.tipo === “Plano”).length;
const retornos = pagos.filter(p => p.tipo === “Retorno”).length;
const porForma = {};
FORMAS_PAGAMENTO.forEach(f => {
porForma[f] = pagos
.filter(p => p.formaPagamento === f)
.reduce((s, p) => s + (p.valorPago || 0), 0);
});
return { totalBruto, repasse, liquido, particulares, planos, retornos, porForma, totalAtendidos: atendidos.length, totalPagos: pagos.length };
}

// ─── Cloud Storage Hook ───────────────────────────────────────────────────────
function useCloudAgenda() {
const [agenda, setAgendaState] = useState([]);
const [syncStatus, setSyncStatus] = useState(“connecting”); // connecting | synced | saving | error
const [lastSync, setLastSync] = useState(null);
const lastVersionRef = useRef(null);

const storageKey = `${STORAGE_KEY}:${hoje()}`;

// Load from cloud
const loadFromCloud = useCallback(async (silent = false) => {
try {
if (!silent) setSyncStatus(“connecting”);
const result = await window.storage.get(storageKey, true);
const data = result ? JSON.parse(result.value) : [];
const version = result ? result.value : “[]”;
if (version !== lastVersionRef.current) {
lastVersionRef.current = version;
setAgendaState(data);
}
setSyncStatus(“synced”);
setLastSync(new Date());
} catch {
setSyncStatus(“synced”); // key might just not exist yet
setAgendaState([]);
}
}, [storageKey]);

// Save to cloud
const saveToCloud = useCallback(async (newAgenda) => {
try {
setSyncStatus(“saving”);
const value = JSON.stringify(newAgenda);
await window.storage.set(storageKey, value, true);
lastVersionRef.current = value;
setSyncStatus(“synced”);
setLastSync(new Date());
} catch {
setSyncStatus(“error”);
}
}, [storageKey]);

// Set agenda and persist
const setAgenda = useCallback((updater) => {
setAgendaState(prev => {
const next = typeof updater === “function” ? updater(prev) : updater;
saveToCloud(next);
return next;
});
}, [saveToCloud]);

// Initial load
useEffect(() => { loadFromCloud(); }, [loadFromCloud]);

// Poll for changes every 5s
useEffect(() => {
const interval = setInterval(() => loadFromCloud(true), SYNC_INTERVAL);
return () => clearInterval(interval);
}, [loadFromCloud]);

return { agenda, setAgenda, syncStatus, lastSync };
}

// ─── Login Screen ─────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
const [user, setUser] = useState(””);
const [senha, setSenha] = useState(””);
const [erro, setErro] = useState(””);

function handleLogin() {
const u = USUARIOS[user.toLowerCase().trim()];
if (u && u.senha === senha) onLogin(user.toLowerCase().trim(), u);
else setErro(“Usuário ou senha incorretos”);
}

return (
<div style={{
minHeight: “100vh”, display: “flex”, alignItems: “center”, justifyContent: “center”,
background: “linear-gradient(135deg, #0f1923 0%, #1a2a3a 50%, #0d1f2d 100%)”,
fontFamily: “‘DM Sans’, sans-serif”,
}}>
<div style={{
background: “rgba(255,255,255,0.04)”, border: “1px solid rgba(255,255,255,0.1)”,
borderRadius: 24, padding: “48px 40px”, width: 360,
boxShadow: “0 32px 80px rgba(0,0,0,0.5)”,
}}>
<div style={{ textAlign: “center”, marginBottom: 36 }}>
<div style={{ fontSize: 44, marginBottom: 10 }}>🏥</div>
<h1 style={{ color: “#e8f4f8”, fontSize: 22, fontWeight: 800, margin: 0 }}>Clínica</h1>
<p style={{ color: “#6b8fa3”, fontSize: 13, margin: “6px 0 0” }}>Sistema de Gestão · Nuvem</p>
</div>
<div style={{ display: “flex”, flexDirection: “column”, gap: 14 }}>
<input placeholder=“Usuário (arianne / angela)”
value={user} onChange={e => { setUser(e.target.value); setErro(””); }}
onKeyDown={e => e.key === “Enter” && handleLogin()} style={inputStyle} />
<input type=“password” placeholder=“Senha”
value={senha} onChange={e => { setSenha(e.target.value); setErro(””); }}
onKeyDown={e => e.key === “Enter” && handleLogin()} style={inputStyle} />
{erro && <p style={{ color: “#ff6b6b”, fontSize: 13, margin: 0, textAlign: “center” }}>{erro}</p>}
<button onClick={handleLogin} style={btnPrimary}>Entrar</button>
</div>
</div>
</div>
);
}

// ─── Sync Indicator ───────────────────────────────────────────────────────────
function SyncBadge({ status, lastSync }) {
const config = {
connecting: { color: “#ffb74d”, label: “conectando…” },
saving:     { color: “#4fc3f7”, label: “salvando…” },
synced:     { color: “#81c784”, label: “sincronizado” },
error:      { color: “#e57373”, label: “erro de sync” },
}[status] || { color: “#6b8fa3”, label: status };

return (
<div style={{ display: “flex”, alignItems: “center”, gap: 5 }}>
<div style={{
width: 7, height: 7, borderRadius: “50%”, background: config.color,
boxShadow: `0 0 6px ${config.color}`,
animation: status === “synced” ? “none” : “pulse 1s infinite”,
}} />
<span style={{ fontSize: 10, color: config.color, fontWeight: 600 }}>{config.label}</span>
{lastSync && status === “synced” && (
<span style={{ fontSize: 10, color: “#3d5a6b” }}>
{lastSync.toLocaleTimeString(“pt-BR”, { hour: “2-digit”, minute: “2-digit” })}
</span>
)}
</div>
);
}

// ─── Modal Paciente ───────────────────────────────────────────────────────────
function ModalPaciente({ horario, paciente, onSalvar, onFechar, onRemover, isSecretaria }) {
const [form, setForm] = useState(paciente || pacienteVazio(horario));

function set(k, v) {
setForm(f => {
const n = { …f, [k]: v };
if (k === “tipo”) { n.valor = CONSULTA_VALORES[v]; n.valorPago = CONSULTA_VALORES[v]; }
return n;
});
}

return (
<div style={{
position: “fixed”, inset: 0, background: “rgba(0,0,0,0.75)”, display: “flex”,
alignItems: “center”, justifyContent: “center”, zIndex: 1000, padding: 16,
}} onClick={onFechar}>
<div style={{
background: “#0f1923”, border: “1px solid rgba(255,255,255,0.12)”, borderRadius: 20,
padding: 28, width: “100%”, maxWidth: 440, maxHeight: “90vh”, overflowY: “auto”,
}} onClick={e => e.stopPropagation()}>
<div style={{ display: “flex”, justifyContent: “space-between”, alignItems: “center”, marginBottom: 22 }}>
<h3 style={{ color: “#e8f4f8”, margin: 0, fontSize: 16, fontWeight: 700 }}>
{horario} · {paciente ? “Editar” : “Novo Paciente”}
</h3>
<button onClick={onFechar} style={{ background: “none”, border: “none”, color: “#6b8fa3”, cursor: “pointer”, fontSize: 22, lineHeight: 1 }}>×</button>
</div>

```
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <label style={labelStyle}>Nome do paciente</label>
      <input value={form.nome} onChange={e => set("nome", e.target.value)}
        placeholder="Nome completo" style={inputStyle} disabled={!isSecretaria} />

      <label style={labelStyle}>Tipo de consulta</label>
      <div style={{ display: "flex", gap: 8 }}>
        {Object.keys(CONSULTA_VALORES).map(t => (
          <button key={t} onClick={() => isSecretaria && set("tipo", t)} style={{
            flex: 1, padding: "9px 0", borderRadius: 10, border: "1px solid",
            fontSize: 13, fontWeight: 600, cursor: isSecretaria ? "pointer" : "default",
            background: form.tipo === t ? "#1e88e5" : "transparent",
            borderColor: form.tipo === t ? "#1e88e5" : "rgba(255,255,255,0.12)",
            color: form.tipo === t ? "#fff" : "#6b8fa3",
          }}>{t}</button>
        ))}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <label style={labelStyle}>Valor automático</label>
        <span style={{ color: "#4fc3f7", fontWeight: 800, fontSize: 20 }}>R$ {form.valor.toFixed(2)}</span>
      </div>

      <label style={labelStyle}>Status</label>
      <div style={{ display: "flex", gap: 8 }}>
        {STATUS_OPCOES.map(s => (
          <button key={s} onClick={() => isSecretaria && set("status", s)} style={{
            flex: 1, padding: "9px 0", borderRadius: 10, border: "1px solid",
            fontSize: 12, fontWeight: 600, cursor: isSecretaria ? "pointer" : "default",
            background: form.status === s ? statusColor(s) : "transparent",
            borderColor: form.status === s ? statusColor(s) : "rgba(255,255,255,0.12)",
            color: form.status === s ? "#fff" : "#6b8fa3",
          }}>{s}</button>
        ))}
      </div>

      {form.status === "Atendido" && (<>
        <label style={labelStyle}>Pagamento</label>
        <button onClick={() => isSecretaria && set("pago", !form.pago)} style={{
          padding: "10px 18px", borderRadius: 10, border: "1px solid", width: "fit-content",
          fontSize: 13, fontWeight: 700, cursor: isSecretaria ? "pointer" : "default",
          background: form.pago ? "#43a047" : "transparent",
          borderColor: form.pago ? "#43a047" : "rgba(255,255,255,0.12)",
          color: form.pago ? "#fff" : "#6b8fa3",
        }}>{form.pago ? "✓ Pago" : "Não pago"}</button>

        {form.pago && (<>
          <label style={labelStyle}>Forma de pagamento</label>
          <div style={{ display: "flex", gap: 8 }}>
            {FORMAS_PAGAMENTO.map(f => (
              <button key={f} onClick={() => isSecretaria && set("formaPagamento", f)} style={{
                flex: 1, padding: "9px 0", borderRadius: 10, border: "1px solid",
                fontSize: 12, fontWeight: 600, cursor: isSecretaria ? "pointer" : "default",
                background: form.formaPagamento === f ? "#7c4dff" : "transparent",
                borderColor: form.formaPagamento === f ? "#7c4dff" : "rgba(255,255,255,0.12)",
                color: form.formaPagamento === f ? "#fff" : "#6b8fa3",
              }}>{f}</button>
            ))}
          </div>
          <label style={labelStyle}>Valor recebido</label>
          <input type="number" value={form.valorPago}
            onChange={e => isSecretaria && set("valorPago", parseFloat(e.target.value) || 0)}
            style={inputStyle} disabled={!isSecretaria} />
        </>)}
      </>)}

      {isSecretaria && (
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          {paciente && (
            <button onClick={() => onRemover(horario)} style={{
              flex: 1, padding: "11px", borderRadius: 12, border: "1px solid rgba(229,115,115,0.3)",
              background: "rgba(229,115,115,0.08)", color: "#e57373", fontWeight: 700, fontSize: 13, cursor: "pointer",
            }}>Remover</button>
          )}
          <button onClick={() => { if (form.nome.trim()) onSalvar(form); }} style={{ ...btnPrimary, flex: 2 }}>
            💾 Salvar na Nuvem
          </button>
        </div>
      )}
    </div>
  </div>
</div>
```

);
}

// ─── Fechamento ───────────────────────────────────────────────────────────────
function FechamentoDia({ agenda, onFechar }) {
const r = calcularResumo(agenda);
const data = new Date().toLocaleDateString(“pt-BR”, { weekday: “long”, year: “numeric”, month: “long”, day: “numeric” });

return (
<div style={{
position: “fixed”, inset: 0, background: “rgba(0,0,0,0.82)”, display: “flex”,
alignItems: “center”, justifyContent: “center”, zIndex: 1000, padding: 16,
}} onClick={onFechar}>
<div style={{
background: “#0f1923”, border: “1px solid rgba(255,255,255,0.12)”, borderRadius: 24,
padding: 32, width: “100%”, maxWidth: 460, maxHeight: “90vh”, overflowY: “auto”,
}} onClick={e => e.stopPropagation()}>
<div style={{ textAlign: “center”, marginBottom: 28 }}>
<div style={{ fontSize: 38 }}>📊</div>
<h2 style={{ color: “#e8f4f8”, margin: “8px 0 4px”, fontSize: 20, fontWeight: 800 }}>Fechamento do Dia</h2>
<p style={{ color: “#6b8fa3”, fontSize: 12, margin: 0, textTransform: “capitalize” }}>{data}</p>
</div>

```
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={cardStyle}>
        <p style={sectionLabel}>Consultas</p>
        <div style={{ display: "flex", gap: 8 }}>
          {[["Particulares", r.particulares, "#4fc3f7"], ["Planos", r.planos, "#81c784"], ["Retornos", r.retornos, "#ffb74d"]].map(([l, v, c]) => (
            <div key={l} style={{ flex: 1, textAlign: "center", padding: "10px 0", background: "rgba(255,255,255,0.04)", borderRadius: 10 }}>
              <div style={{ color: c, fontSize: 24, fontWeight: 800 }}>{v}</div>
              <div style={{ color: "#6b8fa3", fontSize: 11 }}>{l}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={cardStyle}>
        <p style={sectionLabel}>Recebimentos por forma</p>
        {FORMAS_PAGAMENTO.map(f => (
          <div key={f} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
            <span style={{ color: "#9ab5c4", fontSize: 13 }}>{f}</span>
            <span style={{ color: "#e8f4f8", fontWeight: 700, fontSize: 13 }}>R$ {r.porForma[f].toFixed(2)}</span>
          </div>
        ))}
      </div>

      <div style={{ ...cardStyle, background: "rgba(31,136,229,0.07)", border: "1px solid rgba(31,136,229,0.22)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
          <span style={{ color: "#9ab5c4" }}>Total bruto</span>
          <span style={{ color: "#e8f4f8", fontWeight: 700 }}>R$ {r.totalBruto.toFixed(2)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
          <span style={{ color: "#ff8a65" }}>Repasse clínica (15%)</span>
          <span style={{ color: "#ff8a65", fontWeight: 700 }}>− R$ {r.repasse.toFixed(2)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.1)" }}>
          <span style={{ color: "#81c784", fontSize: 16, fontWeight: 800 }}>Seu líquido</span>
          <span style={{ color: "#81c784", fontSize: 20, fontWeight: 800 }}>R$ {r.liquido.toFixed(2)}</span>
        </div>
      </div>
    </div>

    <button onClick={onFechar} style={{ ...btnPrimary, marginTop: 20 }}>Fechar</button>
  </div>
</div>
```

);
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
const [logado, setLogado] = useState(null);
const { agenda, setAgenda, syncStatus, lastSync } = useCloudAgenda();
const [modalHorario, setModalHorario] = useState(null);
const [modalPaciente, setModalPaciente] = useState(null);
const [showFechamento, setShowFechamento] = useState(false);
const [tab, setTab] = useState(“agenda”);

const isSecretaria = logado?.user === “angela”;
const resumo = calcularResumo(agenda);

function abrirHorario(h) {
const p = agenda.find(a => a.horario === h);
setModalHorario(h);
setModalPaciente(p || null);
}

function salvarPaciente(form) {
setAgenda(prev => {
const sem = prev.filter(p => p.horario !== form.horario);
return […sem, form].sort((a, b) => a.horario.localeCompare(b.horario));
});
setModalHorario(null);
setModalPaciente(null);
}

function removerPaciente(horario) {
setAgenda(prev => prev.filter(p => p.horario !== horario));
setModalHorario(null);
setModalPaciente(null);
}

if (!logado) return <LoginScreen onLogin={(user, info) => setLogado({ user, …info })} />;

const hojeLabel = new Date().toLocaleDateString(“pt-BR”, { weekday: “short”, day: “2-digit”, month: “short” });

return (
<div style={{ minHeight: “100vh”, background: “#0a1520”, fontFamily: “‘DM Sans’, sans-serif”, color: “#e8f4f8” }}>
<style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>

```
  {/* Header */}
  <div style={{
    background: "#0d1e2d", borderBottom: "1px solid rgba(255,255,255,0.07)",
    padding: "12px 16px", position: "sticky", top: 0, zIndex: 100,
  }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", maxWidth: 600, margin: "0 auto" }}>
      <div>
        <div style={{ fontSize: 16, fontWeight: 800 }}>🏥 Clínica · {logado.nome}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
          <span style={{ fontSize: 11, color: "#6b8fa3" }}>{hojeLabel}</span>
          <SyncBadge status={syncStatus} lastSync={lastSync} />
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 11, color: "#6b8fa3" }}>líquido</div>
          <div style={{ fontSize: 14, fontWeight: 800, color: "#81c784" }}>R$ {resumo.liquido.toFixed(0)}</div>
        </div>
        <button onClick={() => setLogado(null)} style={{
          background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 8, padding: "6px 10px", color: "#6b8fa3", cursor: "pointer", fontSize: 11,
        }}>Sair</button>
      </div>
    </div>
  </div>

  {/* Tabs */}
  <div style={{ display: "flex", borderBottom: "1px solid rgba(255,255,255,0.07)", background: "#0f1923" }}>
    {[["agenda", "🗓️ Agenda"], ["resumo", "📊 Resumo"]].map(([k, l]) => (
      <button key={k} onClick={() => setTab(k)} style={{
        flex: 1, padding: "12px 0", background: "none", border: "none",
        borderBottom: tab === k ? "2px solid #1e88e5" : "2px solid transparent",
        color: tab === k ? "#4fc3f7" : "#6b8fa3", cursor: "pointer", fontSize: 13, fontWeight: 600,
      }}>{l}</button>
    ))}
  </div>

  <div style={{ padding: 16, maxWidth: 600, margin: "0 auto" }}>

    {/* AGENDA */}
    {tab === "agenda" && (
      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {HORARIOS.map(h => {
          const p = agenda.find(a => a.horario === h);
          return (
            <div key={h} onClick={() => abrirHorario(h)} style={{
              display: "flex", alignItems: "center", gap: 12,
              background: p ? "rgba(255,255,255,0.045)" : "rgba(255,255,255,0.015)",
              border: `1px solid ${p ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.04)"}`,
              borderRadius: 13, padding: "11px 14px", cursor: "pointer",
            }}>
              <div style={{ width: 46, color: "#4fc3f7", fontWeight: 700, fontSize: 13, flexShrink: 0 }}>{h}</div>
              {p ? (<>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.nome}</div>
                  <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
                    <span style={{ fontSize: 11, color: tipoColor(p.tipo), fontWeight: 600 }}>{p.tipo}</span>
                    <span style={{ fontSize: 11, color: "#6b8fa3" }}>·</span>
                    <span style={{ fontSize: 11, color: "#9ab5c4" }}>R$ {p.valor}</span>
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 6,
                    background: statusBg(p.status), color: statusColor(p.status),
                  }}>{p.status}</span>
                  {p.pago && <span style={{ fontSize: 10, color: "#81c784", fontWeight: 600 }}>✓ {p.formaPagamento}</span>}
                </div>
              </>) : (
                <span style={{ color: "#3a5670", fontSize: 13 }}>{isSecretaria ? "+ Adicionar" : "Livre"}</span>
              )}
            </div>
          );
        })}
      </div>
    )}

    {/* RESUMO */}
    {tab === "resumo" && (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {[
            ["Atendidos", resumo.totalAtendidos, "#4fc3f7"],
            ["Pagos", resumo.totalPagos, "#81c784"],
            ["Total bruto", `R$ ${resumo.totalBruto.toFixed(0)}`, "#ffb74d"],
            ["Líquido", `R$ ${resumo.liquido.toFixed(0)}`, "#ce93d8"],
          ].map(([l, v, c]) => (
            <div key={l} style={{ ...cardStyle, textAlign: "center" }}>
              <div style={{ color: c, fontSize: 22, fontWeight: 800 }}>{v}</div>
              <div style={{ color: "#6b8fa3", fontSize: 12, marginTop: 2 }}>{l}</div>
            </div>
          ))}
        </div>

        <div style={cardStyle}>
          <p style={sectionLabel}>Por forma de pagamento</p>
          {FORMAS_PAGAMENTO.map(f => (
            <div key={f} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
              <span style={{ color: "#9ab5c4", fontSize: 13 }}>{f}</span>
              <span style={{ color: "#e8f4f8", fontWeight: 700, fontSize: 13 }}>R$ {resumo.porForma[f].toFixed(2)}</span>
            </div>
          ))}
        </div>

        <div style={{ ...cardStyle, background: "rgba(129,199,132,0.06)", border: "1px solid rgba(129,199,132,0.2)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ color: "#9ab5c4" }}>Repasse clínica (15%)</span>
            <span style={{ color: "#ff8a65", fontWeight: 700 }}>R$ {resumo.repasse.toFixed(2)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
            <span style={{ color: "#81c784", fontSize: 15, fontWeight: 700 }}>Seu líquido</span>
            <span style={{ color: "#81c784", fontSize: 18, fontWeight: 800 }}>R$ {resumo.liquido.toFixed(2)}</span>
          </div>
        </div>

        <button onClick={() => setShowFechamento(true)} style={{
          ...btnPrimary,
          background: isSecretaria ? "linear-gradient(135deg,#1565c0,#0d47a1)" : "rgba(255,255,255,0.06)",
          border: isSecretaria ? "none" : "1px solid rgba(255,255,255,0.12)",
          marginTop: 4, fontSize: 15, padding: "14px",
        }}>
          {isSecretaria ? "📋 Fechar Dia" : "📊 Ver Fechamento"}
        </button>
      </div>
    )}
  </div>

  {modalHorario && (
    <ModalPaciente
      horario={modalHorario} paciente={modalPaciente}
      onSalvar={salvarPaciente} onFechar={() => { setModalHorario(null); setModalPaciente(null); }}
      onRemover={removerPaciente} isSecretaria={isSecretaria}
    />
  )}
  {showFechamento && <FechamentoDia agenda={agenda} onFechar={() => setShowFechamento(false)} />}
</div>
```

);
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const inputStyle = {
background: “rgba(255,255,255,0.05)”, border: “1px solid rgba(255,255,255,0.1)”,
borderRadius: 10, padding: “11px 14px”, color: “#e8f4f8”, fontSize: 14,
outline: “none”, width: “100%”, boxSizing: “border-box”,
};
const btnPrimary = {
background: “linear-gradient(135deg,#1e88e5,#1565c0)”, border: “none”, borderRadius: 12,
padding: “12px”, color: “#fff”, fontWeight: 700, fontSize: 14, cursor: “pointer”, width: “100%”,
};
const labelStyle = { color: “#6b8fa3”, fontSize: 12, fontWeight: 600, marginBottom: -4 };
const cardStyle = {
background: “rgba(255,255,255,0.04)”, border: “1px solid rgba(255,255,255,0.08)”,
borderRadius: 14, padding: “14px 16px”,
};
const sectionLabel = {
color: “#6b8fa3”, fontSize: 11, fontWeight: 700, textTransform: “uppercase”,
letterSpacing: “1px”, marginTop: 0, marginBottom: 12,
};
function statusColor(s) { return s === “Atendido” ? “#81c784” : s === “Faltou” ? “#e57373” : “#ffb74d”; }
function statusBg(s) { return s === “Atendido” ? “rgba(129,199,132,0.15)” : s === “Faltou” ? “rgba(229,115,115,0.15)” : “rgba(255,183,77,0.15)”; }
function tipoColor(t) { return t === “Particular” ? “#4fc3f7” : t === “Plano” ? “#81c784” : “#ffb74d”; }
