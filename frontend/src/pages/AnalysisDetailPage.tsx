import { useQuery } from "@tanstack/react-query"
import { useParams, Link, useNavigate } from "react-router-dom"
import {
  ArrowLeft, Building2, CheckCircle2,
} from "lucide-react"
import { getAnalysis, getConfidenceStats } from "@/api/analysis"
import { Button } from "@/components/ui/button"
import { formatCurrency, formatPeriod, capitalize } from "@/lib/utils"
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts"

// ─── Paleta de colores para el donut ─────────────────────────────────────────
const COLORS = [
  "#6366f1", "#10b981", "#f59e0b", "#ef4444",
  "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16",
  "#3b82f6", "#14b8a6", "#f97316", "#a855f7",
]

// ─── Emojis por categoría (igual que Dashboard) ───────────────────────────────
const CAT_EMOJI: Record<string, string> = {
  alimentacion: "🛒", comida: "🛒", supermercado: "🛒", mercado: "🛒",
  restaurantes: "🍽️", restaurante: "🍽️", cafe: "☕",
  transporte: "🚗", gasolina: "⛽",
  servicios: "💡", servicios_basicos: "💡", agua: "💧", luz: "💡",
  internet: "📶", telefono: "📱",
  entretenimiento: "🎮", ocio: "🎭", streaming: "📺",
  salud: "🏥", farmacia: "💊",
  educacion: "📚",
  vivienda: "🏠", alquiler: "🏠", hipoteca: "🏠",
  tecnologia: "💻",
  suscripciones: "🔔", suscripcion: "🔔",
  mascotas: "🐾",
  ropa: "👕",
  deporte: "⚽", gym: "🏋️",
  belleza: "💅",
  viajes: "✈️", viaje: "✈️",
  bares: "🍺",
  ahorro: "🐖", inversion: "📈",
  deuda: "💳", deudas: "💳",
  cargo_financiero: "🏦", gasto_financiero: "🏦", financiero: "🏦",
  comision: "💰", impuesto: "📋", comisiones: "💰", impuestos: "📋",
  transferencias: "↔️",
  consumo_desconocido: "⚠️",
  otros: "📦",
}

const BANK_COLORS: Record<string, string> = {
  "Banco General":  "#4f7ef0",
  "BAC Credomatic": "#fb7185",
  "Banistmo":       "#34d399",
  "Banesco":        "#fbbf24",
}

// ─── Tooltip del donut ────────────────────────────────────────────────────────
function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: { name: string; value: number; payload: { percent: number } }[]
}) {
  if (!active || !payload?.length) return null
  const { name, value, payload: p } = payload[0]
  return (
    <div
      style={{
        background: "#111829",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 10,
        padding: "8px 12px",
        fontSize: 12,
      }}
    >
      <p style={{ fontWeight: 700, color: "#f1f5f9", marginBottom: 2 }}>{name}</p>
      <p style={{ color: "rgba(255,255,255,0.5)" }}>{formatCurrency(value)}</p>
      <p style={{ color: "rgba(255,255,255,0.4)" }}>
        {(p.percent * 100).toFixed(1)}% del total
      </p>
    </div>
  )
}

// ─── Icono y color de recomendación según type ────────────────────────────────
function recStyle(type: string): { emoji: string; bg: string } {
  switch (type) {
    case "critical": return { emoji: "⚠️", bg: "rgba(244,63,94,0.15)" }
    case "warning":  return { emoji: "💡", bg: "rgba(245,158,11,0.12)" }
    case "positive": return { emoji: "💪", bg: "rgba(16,185,129,0.12)" }
    default:         return { emoji: "🔄", bg: "rgba(99,102,241,0.12)" }
  }
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function AnalysisDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { data: snapshot, isLoading } = useQuery({
    queryKey: ["analysis", id],
    queryFn: () => getAnalysis(id!),
    enabled: !!id,
  })

  const { data: stats } = useQuery({
    queryKey: ["confidence-stats", id],
    queryFn: () => getConfidenceStats(id!),
    enabled: !!id,
  })

  if (isLoading || !snapshot) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  // ── Datos del donut ──────────────────────────────────────────────────────────
  const sorted = Object.entries(snapshot.categories).sort(([, a], [, b]) => b - a)
  const top = sorted.slice(0, 10)
  const rest = sorted.slice(10)
  const othersVal = rest.reduce((s, [, v]) => s + v, 0)
  const chartData = [
    ...top.map(([name, value]) => ({ name: capitalize(name), rawKey: name, value })),
    ...(othersVal > 0 ? [{ name: "Otros", rawKey: "otros", value: othersVal }] : []),
  ]
  const total = chartData.reduce((s, d) => s + d.value, 0)

  // ── KPIs ─────────────────────────────────────────────────────────────────────
  const savingsRate = snapshot.total_income > 0
    ? ((snapshot.balance / snapshot.total_income) * 100).toFixed(1)
    : "0.0"

  const requiresReview = stats?.requires_review ?? 0
  const confidencePct  = stats
    ? (((stats.high_confidence + stats.medium_confidence) / Math.max(stats.total, 1)) * 100).toFixed(0)
    : null

  const bankColor = snapshot.bank_account
    ? (BANK_COLORS[snapshot.bank_account.bank_name] ?? "#6366f1")
    : "#6366f1"

  // ── Recomendaciones + alerta de revisión ─────────────────────────────────────
  const allRecs = [
    ...(requiresReview > 0
      ? [{
          type: "critical",
          message: `${requiresReview} transacciones requieren revisión — tu corrección entrena el sistema para el futuro.`,
          _isReview: true,
        }]
      : []),
    ...snapshot.recommendations.map((r) => ({ ...r, _isReview: false })),
  ]

  return (
    <div className="space-y-5 pb-10">

      {/* ── Breadcrumb: back + badges ── */}
      <div className="animate-fade-up anim-d0">
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
          <Button variant="ghost" size="sm" asChild style={{ gap: 4, paddingLeft: 6 }}>
            <Link to="/analysis">
              <ArrowLeft className="h-3.5 w-3.5" />
              Volver
            </Link>
          </Button>
          {snapshot.bank_account && (
            <span className="analysis-badge-primary">
              <span
                style={{
                  width: 7, height: 7,
                  borderRadius: "50%",
                  background: bankColor,
                  display: "inline-block",
                  flexShrink: 0,
                }}
              />
              <Building2 style={{ width: 11, height: 11, opacity: 0.7 }} />
              {snapshot.bank_account.bank_name}
              {snapshot.bank_account.account_last4 && ` ···${snapshot.bank_account.account_last4}`}
            </span>
          )}
          <span className="analysis-badge-muted">
            {formatPeriod(snapshot.period_start, snapshot.period_end)}
          </span>
        </div>

        {/* ── Page header ── */}
        <div className="page-header" style={{ marginBottom: 20 }}>
          <div>
            <h1 className="page-title">
              Análisis — {formatPeriod(snapshot.period_start, snapshot.period_end)}
            </h1>
            <p className="page-subtitle">
              {snapshot.total_transactions} transacciones
              {snapshot.bank_account && ` · ${snapshot.bank_account.bank_name}`}
            </p>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link to={`/analysis/${id}/transactions`}>
              Ver transacciones →
            </Link>
          </Button>
        </div>
      </div>

      {/* ── KPI metric cards ── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 animate-fade-up anim-d1">
        <div className="metric-card" style={{ "--mc-accent": "#10b981" } as React.CSSProperties}>
          <div className="metric-icon">💰</div>
          <div>
            <div className="metric-label">Ingresos</div>
            <div className="metric-value" style={{ color: "#34d399" }}>
              {formatCurrency(snapshot.total_income)}
            </div>
          </div>
        </div>

        <div className="metric-card" style={{ "--mc-accent": "#fb7185" } as React.CSSProperties}>
          <div className="metric-icon">💸</div>
          <div>
            <div className="metric-label">Gastos</div>
            <div className="metric-value" style={{ color: "#fb7185" }}>
              {formatCurrency(snapshot.total_expenses)}
            </div>
          </div>
        </div>

        <div className="metric-card" style={{ "--mc-accent": "#6366f1" } as React.CSSProperties}>
          <div className="metric-icon">⚖️</div>
          <div>
            <div className="metric-label">Balance</div>
            <div
              className="metric-value"
              style={{ color: snapshot.balance >= 0 ? "#a5b4fc" : "#fb7185" }}
            >
              {formatCurrency(snapshot.balance)}
            </div>
          </div>
        </div>

        <div className="metric-card" style={{ "--mc-accent": "#f59e0b" } as React.CSSProperties}>
          <div className="metric-icon">📊</div>
          <div>
            <div className="metric-label">
              {confidencePct != null ? "Confianza" : "Ahorro"}
            </div>
            <div
              className="metric-value"
              style={{
                color: confidencePct != null
                  ? (Number(confidencePct) >= 80 ? "#34d399" : "#fbbf24")
                  : (Number(savingsRate) >= 20 ? "#34d399" : "#fbbf24"),
              }}
            >
              {confidencePct != null ? `${confidencePct}%` : `${savingsRate}%`}
            </div>
          </div>
        </div>
      </div>

      {/* ── Main content: recommendations (left) + donut (right) ── */}
      <div className="grid-2-1 animate-fade-up anim-d2">

        {/* Recomendaciones */}
        <div>
          <div className="section-title">
            <div className="section-title-dot" />
            Recomendaciones
            {allRecs.length > 0 && (
              <span style={{
                marginLeft: "auto",
                fontSize: 11,
                color: "rgba(255,255,255,0.25)",
                fontWeight: 500,
                textTransform: "none",
                letterSpacing: 0,
              }}>
                {allRecs.length} observación{allRecs.length !== 1 ? "es" : ""}
              </span>
            )}
          </div>

          {allRecs.length === 0 ? (
            <div className="rec-card" style={{ justifyContent: "center", flexDirection: "column", alignItems: "center", padding: "32px 16px", textAlign: "center" }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>✅</div>
              <div className="rec-title" style={{ marginBottom: 4 }}>¡Todo en orden!</div>
              <div className="rec-desc">No hay recomendaciones para este período.</div>
            </div>
          ) : (
            allRecs.map((rec, i) => {
              const { emoji, bg } = recStyle(rec.type)
              return (
                <div key={i} className="rec-card">
                  <div className="rec-icon-wrap" style={{ background: bg }}>
                    {emoji}
                  </div>
                  <div>
                    <div className="rec-title">
                      {rec.type === "critical" && !rec._isReview && "Alerta crítica"}
                      {rec.type === "warning" && "Observación"}
                      {rec.type === "positive" && "Punto positivo"}
                      {rec.type === "info" && "Info"}
                      {rec._isReview && "Transacciones por revisar"}
                      {!["critical","warning","positive","info"].includes(rec.type) && !rec._isReview && capitalize(rec.type)}
                    </div>
                    <div className="rec-desc">{rec.message}</div>
                    {rec._isReview && (
                      <Link
                        to={`/analysis/${id}/transactions?requires_review=true`}
                        style={{
                          fontSize: 12,
                          color: "#a5b4fc",
                          textDecoration: "underline",
                          textUnderlineOffset: 2,
                          marginTop: 4,
                          display: "inline-block",
                        }}
                      >
                        Revisar ahora →
                      </Link>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Donut + categorías */}
        <div className="zoho-card" style={{ padding: "20px 20px 16px" }}>
          <div className="section-title">
            <div className="section-title-dot" style={{ background: "#f59e0b" }} />
            Distribución
          </div>

          {chartData.length === 0 ? (
            <div style={{ textAlign: "center", padding: "32px 0", color: "rgba(255,255,255,0.3)", fontSize: 13 }}>
              Sin gastos en este período
            </div>
          ) : (
            <>
              {/* Donut */}
              <div style={{ width: "100%", height: 180, marginBottom: 16 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={chartData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={52}
                      outerRadius={80}
                      paddingAngle={2}
                      strokeWidth={0}
                    >
                      {chartData.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Lista de categorías — estilo Parker */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {chartData.map((d, i) => {
                  const color = COLORS[i % COLORS.length]
                  const emoji = CAT_EMOJI[d.rawKey] ?? "📦"
                  const pct = total > 0 ? (d.value / total) * 100 : 0
                  const isUnknown = d.rawKey === "otros" || d.rawKey === "consumo_desconocido"
                  return (
                    <div
                      key={d.rawKey}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        borderRadius: 10,
                        border: "1px solid rgba(255,255,255,0.08)",
                        borderLeftWidth: 4,
                        borderLeftColor: color,
                        padding: "8px 10px",
                        background: "rgba(255,255,255,0.03)",
                      }}
                    >
                      {/* Emoji */}
                      <span style={{
                        display: "flex", alignItems: "center", justifyContent: "center",
                        width: 32, height: 32, borderRadius: "50%", flexShrink: 0, fontSize: 15,
                        background: `${color}22`,
                      }}>
                        {emoji}
                      </span>
                      {/* Nombre + sublabel */}
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "#f1f5f9", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {d.name}
                        </span>
                        {isUnknown && (
                          <span style={{ fontSize: 10, color: "#d97706" }}>Sin categoría — afecta tu presupuesto</span>
                        )}
                      </span>
                      {/* Monto + % */}
                      <span style={{ fontSize: 12, fontWeight: 700, color, flexShrink: 0 }}>
                        {formatCurrency(d.value)}
                      </span>
                      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", width: 28, textAlign: "right", flexShrink: 0 }}>
                        {pct.toFixed(0)}%
                      </span>
                      {/* Botón corregir para desconocidos */}
                      {isUnknown && (
                        <button
                          onClick={() => navigate("/retrain")}
                          style={{
                            flexShrink: 0, borderRadius: 6, padding: "3px 8px",
                            fontSize: 10, fontWeight: 700, color: "#fff",
                            background: "#d97706", border: "none", cursor: "pointer",
                          }}
                        >
                          Corregir
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </div>

    </div>
  )
}
