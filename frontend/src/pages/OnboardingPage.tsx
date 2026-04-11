import { useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  TrendingUp, ChevronRight, ChevronLeft, Target, Briefcase,
  DollarSign, CheckCircle2, BookOpen, Smartphone, Monitor, Download,
  ShieldCheck,
} from "lucide-react"
import { updateProfile } from "@/api/profile"
import type { IndustryType, GoalType } from "@/types"

// ─── Opciones ─────────────────────────────────────────────────────────────────

const INDUSTRIES: { value: IndustryType; label: string; emoji: string; independent?: boolean }[] = [
  { value: "tecnologia",     label: "Tecnología",                   emoji: "💻" },
  { value: "salud",          label: "Salud",                        emoji: "🏥" },
  { value: "educacion",      label: "Educación",                    emoji: "📚" },
  { value: "finanzas",       label: "Finanzas / Banca",             emoji: "🏦" },
  { value: "comercio",       label: "Comercio / Retail",            emoji: "🛒" },
  { value: "construccion",   label: "Construcción",                 emoji: "🏗️" },
  { value: "gobierno",       label: "Gobierno / Público",           emoji: "🏛️" },
  { value: "transporte",     label: "Transporte / Logística",       emoji: "🚛" },
  { value: "servicios",      label: "Servicios profesionales",      emoji: "💼" },
  { value: "entretenimiento",label: "Entretenimiento / Creativo",   emoji: "🎭", independent: true },
  { value: "otro",           label: "Otro",                         emoji: "⚡" },
]

// Industrias donde los ingresos suelen ser variables/por proyecto
const VARIABLE_INCOME_INDUSTRIES: IndustryType[] = ["entretenimiento", "servicios"]

const GOALS: { value: GoalType; label: string; description: string; emoji: string }[] = [
  { value: "fondo_emergencia", label: "Fondo de emergencia",  description: "Tener 3–6 meses de gastos ahorrados para imprevistos",      emoji: "🛡️" },
  { value: "ahorro_general",   label: "Ahorrar más",          description: "Incrementar mi tasa de ahorro mes a mes",                    emoji: "🐖" },
  { value: "eliminar_deuda",   label: "Eliminar deudas",      description: "Pagar tarjetas de crédito, préstamos u otras deudas",        emoji: "✂️" },
  { value: "invertir",         label: "Empezar a invertir",   description: "Hacer que mi dinero trabaje para mí",                        emoji: "📈" },
  { value: "meta_especifica",  label: "Meta específica",      description: "Ahorrar para algo concreto: viaje, auto, casa",              emoji: "🎯" },
]

// ─── Colores base (sin variables CSS) ─────────────────────────────────────────
const C = {
  primary:      "#6366f1",
  primaryLight: "rgba(99,102,241,0.08)",
  primaryMid:   "rgba(99,102,241,0.18)",
  navy:         "#1c2b4b",
  navyDark:     "#162038",
  text:         "#1e293b",
  muted:        "#64748b",
  border:       "#e2e8f0",
  bg:           "#f8fafc",
  white:        "#ffffff",
  disabled:     "#c7d2fe",
  success:      "#22c55e",
  successLight: "rgba(34,197,94,0.1)",
  orange:       "#e05c19",
  orangeLight:  "rgba(224,92,25,0.1)",
  yellow:       "#fbbf24",
  yellowLight:  "rgba(251,191,36,0.12)",
}

// ─── Estilos reutilizables ─────────────────────────────────────────────────────
const btnPrimary = (enabled: boolean): React.CSSProperties => ({
  display: "inline-flex", alignItems: "center", gap: 6,
  padding: "10px 22px", borderRadius: 10, border: "none",
  background: enabled ? C.primary : C.disabled,
  color: C.white, fontSize: 14, fontWeight: 600,
  cursor: enabled ? "pointer" : "default",
  transition: "background 0.15s",
})

const btnGhost: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 4,
  padding: "10px 14px", borderRadius: 10, border: "none",
  background: "transparent", color: C.muted,
  fontSize: 14, cursor: "pointer",
}

// ─── Componente principal ──────────────────────────────────────────────────────

export default function OnboardingPage() {
  const navigate = useNavigate()
  const [step,     setStep]     = useState<1 | 2 | 3 | 4 | 5>(1)
  const [industry, setIndustry] = useState<IndustryType | null>(null)
  const [income,   setIncome]   = useState("")
  const [goals,    setGoals]    = useState<GoalType[]>([])
  const [saving,   setSaving]   = useState(false)

  function toggleGoal(g: GoalType) {
    setGoals(prev => prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g])
  }

  async function handleGoToTrust() {
    setSaving(true)
    try {
      await updateProfile({
        industry,
        expected_monthly_income: income ? parseFloat(income) : null,
        financial_goals: goals,
        onboarding_completed: true,
      })
    } catch { /* avanzar igualmente si falla */ }
    finally { setSaving(false); setStep(4) }
  }

  const canStep1 = industry !== null
  const canStep3 = goals.length > 0

  // ── Wrapper raíz — position:fixed cubre el viewport sin importar el padre ──
  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 50,
      display: "flex", flexDirection: "column",
      background: `linear-gradient(135deg, #eef2ff 0%, ${C.bg} 100%)`,
      color: C.text, fontFamily: "inherit", overflow: "hidden",
    }}>

      {/* ── Header ── */}
      <div style={{
        height: 64, flexShrink: 0,
        display: "flex", alignItems: "center", gap: 10,
        padding: "0 24px",
        background: C.white, borderBottom: `1px solid ${C.border}`,
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: "linear-gradient(135deg,#6366f1,#8b5cf6)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <TrendingUp style={{ width: 18, height: 18, color: C.white }} />
        </div>
        <span style={{ fontSize: 18, fontWeight: 700, color: C.primary }}>SAFPRO</span>
      </div>

      {/* ── Área de scroll ── */}
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>

        {/* Centering wrapper — flex-1 garantiza altura completa para centrado vertical */}
        <div style={{
          flex: 1,
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: "32px 16px",
        }}>
          <div style={{ width: "100%", maxWidth: 520 }}>

            {/* Progress dots */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 32 }}>
              {[1, 2, 3, 4, 5].map(s => (
                <div key={s} style={{
                  height: 8, borderRadius: 999, transition: "all 0.3s",
                  width: s === step ? 32 : 8,
                  background: s < step ? C.primary : s === step ? C.primary : C.border,
                  opacity: s < step ? 0.5 : 1,
                }} />
              ))}
            </div>

            {/* ══ Paso 1: Industria ══ */}
            {step === 1 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{
                    display: "inline-flex", width: 52, height: 52, borderRadius: "50%",
                    background: C.primaryLight, alignItems: "center", justifyContent: "center",
                    marginBottom: 12,
                  }}>
                    <Briefcase style={{ width: 26, height: 26, color: C.primary }} />
                  </div>
                  <h1 style={{ margin: "0 0 8px", fontSize: 24, fontWeight: 700, color: C.text }}>
                    ¿En qué industria trabajas?
                  </h1>
                  <p style={{ margin: 0, fontSize: 14, color: C.muted, lineHeight: 1.5 }}>
                    Esto nos ayuda a contextualizar tus ingresos y darte recomendaciones más relevantes.
                  </p>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {INDUSTRIES.map(({ value, label, emoji, independent }) => {
                    const selected = industry === value
                    return (
                      <button key={value} onClick={() => setIndustry(value)} style={{
                        display: "flex", alignItems: "center", gap: 8,
                        padding: "11px 14px", borderRadius: 10, textAlign: "left",
                        border: `2px solid ${selected ? C.primary : C.border}`,
                        background: selected ? C.primaryLight : C.white,
                        color: selected ? C.primary : C.text,
                        fontSize: 14, fontWeight: selected ? 600 : 400,
                        cursor: "pointer", transition: "all 0.15s",
                        flexWrap: "wrap",
                      }}>
                        <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0 }}>{emoji}</span>
                        <span style={{ flex: 1 }}>{label}</span>
                        {independent && (
                          <span style={{
                            fontSize: 10, fontWeight: 600, letterSpacing: "0.02em",
                            padding: "2px 6px", borderRadius: 999,
                            background: selected ? "rgba(99,102,241,0.2)" : "rgba(224,92,25,0.1)",
                            color: selected ? C.primary : C.orange,
                            lineHeight: 1.6, flexShrink: 0,
                          }}>
                            Independiente
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 4 }}>
                  <button onClick={() => navigate("/upload")} style={btnGhost}>
                    Omitir por ahora
                  </button>
                  <button disabled={!canStep1} onClick={() => setStep(2)} style={btnPrimary(canStep1)}>
                    Continuar <ChevronRight style={{ width: 16, height: 16 }} />
                  </button>
                </div>
              </div>
            )}

            {/* ══ Paso 2: Ingreso ══ */}
            {step === 2 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{
                    display: "inline-flex", width: 52, height: 52, borderRadius: "50%",
                    background: C.primaryLight, alignItems: "center", justifyContent: "center",
                    marginBottom: 12,
                  }}>
                    <DollarSign style={{ width: 26, height: 26, color: C.primary }} />
                  </div>
                  <h1 style={{ margin: "0 0 8px", fontSize: 24, fontWeight: 700, color: C.text }}>
                    ¿Cuánto ganas al mes?
                  </h1>
                  <p style={{ margin: 0, fontSize: 14, color: C.muted, lineHeight: 1.5 }}>
                    Usamos esto para comparar contra lo que realmente llega al banco y calcular tu meta de ahorro.
                    El dato es solo tuyo — no se comparte con nadie.
                  </p>
                </div>

                <div style={{
                  background: C.white, border: `1px solid ${C.border}`,
                  borderRadius: 14, padding: 24,
                }}>
                  <label style={{ display: "block", fontSize: 14, fontWeight: 500, color: C.text, marginBottom: 8 }}>
                    Ingreso mensual neto (después de impuestos)
                  </label>
                  {industry && VARIABLE_INCOME_INDUSTRIES.includes(industry) && (
                    <div style={{
                      display: "flex", gap: 8, alignItems: "flex-start",
                      padding: "10px 12px", borderRadius: 8, marginBottom: 10,
                      background: C.orangeLight, border: `1px solid rgba(224,92,25,0.25)`,
                    }}>
                      <span style={{ fontSize: 16, flexShrink: 0, lineHeight: 1, marginTop: 1 }}>💡</span>
                      <p style={{ margin: 0, fontSize: 12, color: "#92400e", lineHeight: 1.5 }}>
                        <strong>Ingreso variable:</strong> Si trabajas por proyecto o de forma independiente,
                        usa el <strong>promedio de tus últimos 3 meses</strong> como referencia.
                        Puedes ajustarlo en cualquier momento desde tu perfil.
                      </p>
                    </div>
                  )}
                  <div style={{ position: "relative" }}>
                    <span style={{
                      position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)",
                      color: C.muted, fontSize: 14,
                    }}>$</span>
                    <input
                      type="number" min="0" step="50" placeholder="0.00"
                      value={income} onChange={e => setIncome(e.target.value)}
                      style={{
                        width: "100%", boxSizing: "border-box",
                        padding: "10px 12px 10px 28px", borderRadius: 8,
                        border: `1px solid ${C.border}`, fontSize: 14,
                        color: C.text, background: C.white, outline: "none",
                      }}
                    />
                  </div>
                  <p style={{ margin: "6px 0 0", fontSize: 12, color: C.muted }}>
                    Opcional — puedes completarlo después en tu perfil.
                  </p>

                  {income && parseFloat(income) > 0 && (
                    <div style={{
                      marginTop: 16, padding: 14, borderRadius: 10,
                      background: C.primaryLight, border: `1px solid ${C.primaryMid}`,
                    }}>
                      <p style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 600, color: C.primary }}>
                        Con ${parseFloat(income).toLocaleString()} al mes:
                      </p>
                      <p style={{ margin: 0, fontSize: 13, color: C.muted }}>
                        Meta 50/30/20:{" "}
                        <span style={{ fontWeight: 500, color: C.text }}>
                          ${(parseFloat(income) * 0.5).toLocaleString(undefined, { maximumFractionDigits: 0 })} necesidades /{" "}
                          ${(parseFloat(income) * 0.3).toLocaleString(undefined, { maximumFractionDigits: 0 })} deseos /{" "}
                          ${(parseFloat(income) * 0.2).toLocaleString(undefined, { maximumFractionDigits: 0 })} ahorro
                        </span>
                      </p>
                    </div>
                  )}
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <button onClick={() => setStep(1)} style={btnGhost}>
                    <ChevronLeft style={{ width: 16, height: 16 }} /> Atrás
                  </button>
                  <button onClick={() => setStep(3)} style={btnPrimary(true)}>
                    Continuar <ChevronRight style={{ width: 16, height: 16 }} />
                  </button>
                </div>
              </div>
            )}

            {/* ══ Paso 3: Metas financieras ══ */}
            {step === 3 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{
                    display: "inline-flex", width: 52, height: 52, borderRadius: "50%",
                    background: C.primaryLight, alignItems: "center", justifyContent: "center",
                    marginBottom: 12,
                  }}>
                    <Target style={{ width: 26, height: 26, color: C.primary }} />
                  </div>
                  <h1 style={{ margin: "0 0 8px", fontSize: 24, fontWeight: 700, color: C.text }}>
                    ¿Cuáles son tus metas financieras?
                  </h1>
                  <p style={{ margin: 0, fontSize: 14, color: C.muted, lineHeight: 1.5 }}>
                    Selecciona una o varias. Personalizaremos las recomendaciones para que apunten a lo que te importa.
                  </p>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {GOALS.map(({ value, label, description, emoji }) => {
                    const selected = goals.includes(value)
                    return (
                      <button key={value} onClick={() => toggleGoal(value)} style={{
                        display: "flex", alignItems: "flex-start", gap: 12,
                        padding: "14px 16px", borderRadius: 12, textAlign: "left", width: "100%",
                        border: `2px solid ${selected ? C.primary : C.border}`,
                        background: selected ? C.primaryLight : C.white,
                        cursor: "pointer", transition: "all 0.15s",
                      }}>
                        <span style={{ fontSize: 22, lineHeight: 1, marginTop: 1, flexShrink: 0 }}>{emoji}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ margin: "0 0 2px", fontSize: 14, fontWeight: 600, color: selected ? C.primary : C.text }}>{label}</p>
                          <p style={{ margin: 0, fontSize: 12, color: C.muted }}>{description}</p>
                        </div>
                        {selected && (
                          <CheckCircle2 style={{ width: 20, height: 20, color: C.primary, flexShrink: 0, marginTop: 2 }} />
                        )}
                      </button>
                    )
                  })}
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <button onClick={() => setStep(2)} style={btnGhost}>
                    <ChevronLeft style={{ width: 16, height: 16 }} /> Atrás
                  </button>
                  <button disabled={!canStep3 || saving} onClick={handleGoToTrust} style={btnPrimary(canStep3 && !saving)}>
                    {saving ? "Guardando…" : "Continuar"} <ChevronRight style={{ width: 16, height: 16 }} />
                  </button>
                </div>
              </div>
            )}

            {/* ══ Paso 4: Seguridad y privacidad ══ */}
            {step === 4 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                {/* Header con navy */}
                <div style={{
                  borderRadius: 16, overflow: "hidden",
                  border: `1px solid ${C.border}`,
                }}>
                  <div style={{
                    background: C.navy,
                    padding: "20px 24px",
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
                    textAlign: "center",
                  }}>
                    <div style={{
                      width: 56, height: 56, borderRadius: "50%",
                      background: "rgba(255,255,255,0.1)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <ShieldCheck style={{ width: 30, height: 30, color: C.white }} />
                    </div>
                    <div>
                      <h1 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 700, color: C.white }}>
                        Tu seguridad, primero
                      </h1>
                      <p style={{ margin: 0, fontSize: 13, color: "rgba(255,255,255,0.75)", lineHeight: 1.5 }}>
                        Antes de subir tu estado de cuenta, queremos ser completamente transparentes contigo.
                      </p>
                    </div>
                  </div>

                  {/* Checklist */}
                  <div style={{ background: C.white, padding: "20px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
                    {[
                      "No pedimos usuario ni contraseña bancaria",
                      "No tenemos acceso a tu cuenta bancaria",
                      "Solo analizamos el archivo que tú descargas y subes",
                      "Tus datos no se comparten con nadie",
                      "Puedes eliminar tu información en cualquier momento",
                    ].map((item, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{
                          width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
                          background: C.successLight,
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                          <CheckCircle2 style={{ width: 14, height: 14, color: C.success }} />
                        </div>
                        <span style={{ fontSize: 14, color: C.text, lineHeight: 1.4 }}>{item}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* ¿Qué estás subiendo? */}
                <div style={{
                  background: C.white, border: `1px solid ${C.border}`,
                  borderRadius: 12, padding: "16px 20px",
                }}>
                  <p style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 600, color: C.text }}>
                    ¿Qué estás subiendo realmente?
                  </p>
                  <p style={{ margin: "0 0 8px", fontSize: 13, color: C.muted, lineHeight: 1.5 }}>
                    Un archivo Excel con el <strong style={{ color: C.text }}>historial de tus transacciones</strong> —
                    el mismo que tu banco te deja descargar desde la banca en línea.
                    No contiene contraseñas ni acceso a tu cuenta.
                  </p>
                  <p style={{ margin: 0, fontSize: 13, color: C.muted, lineHeight: 1.5 }}>
                    SAFPRO <strong style={{ color: C.text }}>lee ese archivo localmente en el servidor</strong>,
                    extrae los montos y comercios, y los analiza para mostrarte tus patrones de gasto.
                    Nadie más ve esos datos.
                  </p>
                </div>

                {/* Disclaimer honesto */}
                <div style={{
                  display: "flex", gap: 12, padding: "14px 16px", borderRadius: 10,
                  background: C.yellowLight, border: `1px solid ${C.yellow}`,
                  alignItems: "flex-start",
                }}>
                  <span style={{ fontSize: 18, flexShrink: 0, lineHeight: 1, marginTop: 1 }}>⚠️</span>
                  <div>
                    <p style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 600, color: "#92400e" }}>
                      Honestidad ante todo
                    </p>
                    <p style={{ margin: 0, fontSize: 12, color: "#78350f", lineHeight: 1.5 }}>
                      El archivo viaja por internet cifrado (HTTPS) y se almacena en un servidor seguro.
                      Si prefieres no subir el archivo, también puedes ingresar tus gastos{" "}
                      <strong>manualmente</strong> desde el menú "Entrada manual".
                    </p>
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <button onClick={() => setStep(3)} style={btnGhost}>
                    <ChevronLeft style={{ width: 16, height: 16 }} /> Atrás
                  </button>
                  <button onClick={() => setStep(5)} style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    padding: "11px 24px", borderRadius: 10, border: "none",
                    background: C.orange, color: C.white,
                    fontSize: 14, fontWeight: 600, cursor: "pointer",
                  }}>
                    Lo entiendo, continuar <ChevronRight style={{ width: 16, height: 16 }} />
                  </button>
                </div>
              </div>
            )}

            {/* ══ Paso 5: Cómo obtener tu estado de cuenta ══ */}
            {step === 5 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{
                    display: "inline-flex", width: 52, height: 52, borderRadius: "50%",
                    background: C.primaryLight, alignItems: "center", justifyContent: "center",
                    marginBottom: 12,
                  }}>
                    <BookOpen style={{ width: 26, height: 26, color: C.primary }} />
                  </div>
                  <h1 style={{ margin: "0 0 8px", fontSize: 22, fontWeight: 700, color: C.text }}>
                    ¿Cómo obtener tu estado de cuenta?
                  </h1>
                  <p style={{ margin: 0, fontSize: 14, color: C.muted, lineHeight: 1.5 }}>
                    Descarga tu estado de cuenta desde la banca en línea de tu banco. Aquí te explicamos cómo hacerlo.
                  </p>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {/* Banco General */}
                  <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                      <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#1a3a8f", flexShrink: 0 }} />
                      <span style={{ fontSize: 14, fontWeight: 600, color: C.text, flex: 1 }}>Banco General</span>
                      <Monitor style={{ width: 16, height: 16, color: C.muted }} />
                    </div>
                    <ol style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
                      {["Entra a bgeneral.com → Banca en Línea","Ve a Mis cuentas → Movimientos","Selecciona el período que deseas analizar","Descarga en formato Excel (.xlsx)"].map((t, i) => (
                        <li key={i} style={{ fontSize: 13, color: C.muted }}>{t}</li>
                      ))}
                    </ol>
                  </div>

                  {/* BAC */}
                  <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                      <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#e31837", flexShrink: 0 }} />
                      <span style={{ fontSize: 14, fontWeight: 600, color: C.text, flex: 1 }}>BAC Credomatic</span>
                      <Monitor style={{ width: 16, height: 16, color: C.muted }} />
                    </div>
                    <ol style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
                      {["Entra a bac.net → Banca en Línea","Ve a Cuentas → Estado de cuenta","Selecciona el período deseado","Descarga en formato Excel (.xlsx)"].map((t, i) => (
                        <li key={i} style={{ fontSize: 13, color: C.muted }}>{t}</li>
                      ))}
                    </ol>
                  </div>

                  {/* Banistmo */}
                  <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                      <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#00843d", flexShrink: 0 }} />
                      <span style={{ fontSize: 14, fontWeight: 600, color: C.text, flex: 1 }}>Banistmo</span>
                      <Smartphone style={{ width: 16, height: 16, color: C.muted }} />
                    </div>
                    <ol style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
                      {["Abre la app de Banistmo en tu celular","Ve a Mis cuentas → Movimientos","Selecciona el período que deseas","Usa la opción Descargar directamente desde la app"].map((t, i) => (
                        <li key={i} style={{ fontSize: 13, color: C.muted }}>{t}</li>
                      ))}
                    </ol>
                  </div>

                  {/* Tip */}
                  <div style={{
                    display: "flex", gap: 10, padding: 14, borderRadius: 10,
                    background: C.primaryLight, border: `1px solid ${C.primaryMid}`,
                  }}>
                    <Download style={{ width: 16, height: 16, color: C.primary, flexShrink: 0, marginTop: 1 }} />
                    <p style={{ margin: 0, fontSize: 13, color: C.primary, lineHeight: 1.5 }}>
                      <strong>Tip:</strong> También puedes ingresar tus gastos manualmente desde la opción{" "}
                      <strong>"Entrada Manual"</strong> en el menú lateral.
                    </p>
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <button onClick={() => setStep(4)} style={btnGhost}>
                    <ChevronLeft style={{ width: 16, height: 16 }} /> Atrás
                  </button>
                  <button onClick={() => navigate("/upload")} style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    padding: "11px 24px", borderRadius: 10, border: "none",
                    background: C.orange, color: C.white,
                    fontSize: 14, fontWeight: 600, cursor: "pointer",
                  }}>
                    Subir mi estado de cuenta <ChevronRight style={{ width: 16, height: 16 }} />
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  )
}
