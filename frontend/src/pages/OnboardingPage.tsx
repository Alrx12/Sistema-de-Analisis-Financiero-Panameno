import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { TrendingUp, ChevronRight, ChevronLeft, Target, Briefcase, DollarSign, CheckCircle2, BookOpen, Smartphone, Monitor, Download } from "lucide-react"
import { updateProfile } from "@/api/profile"
import type { IndustryType, GoalType } from "@/types"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

// ─── Opciones de industria ─────────────────────────────────────────────────────

const INDUSTRIES: { value: IndustryType; label: string; emoji: string }[] = [
  { value: "tecnologia",   label: "Tecnología",          emoji: "💻" },
  { value: "salud",        label: "Salud",                emoji: "🏥" },
  { value: "educacion",    label: "Educación",            emoji: "📚" },
  { value: "finanzas",     label: "Finanzas / Banca",     emoji: "🏦" },
  { value: "comercio",     label: "Comercio / Retail",    emoji: "🛒" },
  { value: "construccion", label: "Construcción",         emoji: "🏗️" },
  { value: "gobierno",     label: "Gobierno / Sector público", emoji: "🏛️" },
  { value: "transporte",   label: "Transporte / Logística", emoji: "🚛" },
  { value: "servicios",    label: "Servicios profesionales", emoji: "💼" },
  { value: "otro",         label: "Otro",                 emoji: "⚡" },
]

// ─── Opciones de metas ─────────────────────────────────────────────────────────

const GOALS: { value: GoalType; label: string; description: string; emoji: string }[] = [
  {
    value: "fondo_emergencia",
    label: "Fondo de emergencia",
    description: "Tener 3–6 meses de gastos ahorrados para imprevistos",
    emoji: "🛡️",
  },
  {
    value: "ahorro_general",
    label: "Ahorrar más",
    description: "Incrementar mi tasa de ahorro mes a mes",
    emoji: "🐖",
  },
  {
    value: "eliminar_deuda",
    label: "Eliminar deudas",
    description: "Pagar tarjetas de crédito, préstamos u otras deudas",
    emoji: "✂️",
  },
  {
    value: "invertir",
    label: "Empezar a invertir",
    description: "Hacer que mi dinero trabaje para mí",
    emoji: "📈",
  },
  {
    value: "meta_especifica",
    label: "Meta específica",
    description: "Ahorrar para algo concreto: viaje, auto, casa",
    emoji: "🎯",
  },
]

// ─── Componente principal ──────────────────────────────────────────────────────

export default function OnboardingPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
  const [industry, setIndustry] = useState<IndustryType | null>(null)
  const [income, setIncome] = useState<string>("")
  const [goals, setGoals] = useState<GoalType[]>([])
  const [saving, setSaving] = useState(false)

  function toggleGoal(goal: GoalType) {
    setGoals((prev) =>
      prev.includes(goal) ? prev.filter((g) => g !== goal) : [...prev, goal]
    )
  }

  async function handleGoToHowTo() {
    // Guardar perfil y avanzar al paso 4
    setSaving(true)
    try {
      await updateProfile({
        industry,
        expected_monthly_income: income ? parseFloat(income) : null,
        financial_goals: goals,
        onboarding_completed: true,
      })
    } catch {
      // Si falla el guardado, igual avanzar
    } finally {
      setSaving(false)
      setStep(4)
    }
  }

  function handleSkip() {
    navigate("/upload")
  }

  const canContinueStep1 = industry !== null
  const canFinish = goals.length > 0

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 to-background flex flex-col">
      {/* Header */}
      <div className="flex h-16 items-center gap-2 px-6 border-b bg-white/80 backdrop-blur">
        <TrendingUp className="h-6 w-6 text-primary" />
        <span className="text-lg font-bold text-primary">SAFPRO</span>
      </div>

      {/* Contenido */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-lg mx-auto">
          {/* Progress dots */}
          <div className="flex items-center justify-center gap-2 mb-8">
            {[1, 2, 3, 4].map((s) => (
              <div
                key={s}
                className={cn(
                  "h-2 rounded-full transition-all duration-300",
                  s === step ? "w-8 bg-primary" : s < step ? "w-2 bg-primary/50" : "w-2 bg-muted"
                )}
              />
            ))}
          </div>

          {/* Paso 1: Industria */}
          {step === 1 && (
            <div className="space-y-6">
              <div className="text-center space-y-2">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 mb-2">
                  <Briefcase className="h-6 w-6 text-primary" />
                </div>
                <h1 className="text-2xl font-bold">¿En qué industria trabajas?</h1>
                <p className="text-muted-foreground text-sm">
                  Esto nos ayuda a contextualizar tus ingresos y darte recomendaciones más relevantes.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {INDUSTRIES.map(({ value, label, emoji }) => (
                  <button
                    key={value}
                    onClick={() => setIndustry(value)}
                    className={cn(
                      "flex items-center gap-2 rounded-lg border p-3 text-left text-sm transition-colors",
                      industry === value
                        ? "border-primary bg-primary/5 text-primary font-medium"
                        : "border-border hover:border-primary/40 hover:bg-accent"
                    )}
                  >
                    <span className="text-base">{emoji}</span>
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex justify-between pt-2">
                <Button variant="ghost" size="sm" onClick={handleSkip} className="text-muted-foreground">
                  Omitir por ahora
                </Button>
                <Button disabled={!canContinueStep1} onClick={() => setStep(2)}>
                  Continuar <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}

          {/* Paso 2: Ingreso esperado */}
          {step === 2 && (
            <div className="space-y-6">
              <div className="text-center space-y-2">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 mb-2">
                  <DollarSign className="h-6 w-6 text-primary" />
                </div>
                <h1 className="text-2xl font-bold">¿Cuánto ganas al mes?</h1>
                <p className="text-muted-foreground text-sm">
                  Usamos esto para comparar contra lo que realmente llega al banco y calcular tu meta de ahorro.
                  El dato es solo tuyo — no se comparte con nadie.
                </p>
              </div>
              <Card>
                <CardContent className="pt-6 space-y-4">
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Ingreso mensual neto (después de impuestos)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                      <input
                        type="number"
                        min="0"
                        step="50"
                        value={income}
                        onChange={(e) => setIncome(e.target.value)}
                        placeholder="0.00"
                        className="w-full rounded-md border border-input bg-background pl-7 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Opcional — puedes completarlo después en tu perfil.
                    </p>
                  </div>
                  {income && parseFloat(income) > 0 && (
                    <div className="rounded-md bg-primary/5 p-3 text-sm space-y-1">
                      <p className="font-medium text-primary">Con ${parseFloat(income).toLocaleString()} al mes:</p>
                      <p className="text-muted-foreground">
                        Meta 50/30/20: <span className="font-medium text-foreground">
                          ${(parseFloat(income) * 0.5).toLocaleString(undefined, { maximumFractionDigits: 0 })} necesidades /
                          ${(parseFloat(income) * 0.3).toLocaleString(undefined, { maximumFractionDigits: 0 })} deseos /
                          ${(parseFloat(income) * 0.2).toLocaleString(undefined, { maximumFractionDigits: 0 })} ahorro
                        </span>
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
              <div className="flex justify-between pt-2">
                <Button variant="ghost" size="sm" onClick={() => setStep(1)}>
                  <ChevronLeft className="h-4 w-4 mr-1" /> Atrás
                </Button>
                <Button onClick={() => setStep(3)}>
                  Continuar <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}

          {/* Paso 3: Metas financieras */}
          {step === 3 && (
            <div className="space-y-6">
              <div className="text-center space-y-2">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 mb-2">
                  <Target className="h-6 w-6 text-primary" />
                </div>
                <h1 className="text-2xl font-bold">¿Cuáles son tus metas financieras?</h1>
                <p className="text-muted-foreground text-sm">
                  Selecciona una o varias. Personalizaremos las recomendaciones para que apunten a lo que te importa.
                </p>
              </div>
              <div className="space-y-2">
                {GOALS.map(({ value, label, description, emoji }) => {
                  const selected = goals.includes(value)
                  return (
                    <button
                      key={value}
                      onClick={() => toggleGoal(value)}
                      className={cn(
                        "w-full flex items-start gap-3 rounded-lg border p-4 text-left transition-colors",
                        selected
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/40 hover:bg-accent"
                      )}
                    >
                      <span className="text-xl mt-0.5">{emoji}</span>
                      <div className="flex-1 min-w-0">
                        <p className={cn("text-sm font-medium", selected && "text-primary")}>{label}</p>
                        <p className="text-xs text-muted-foreground">{description}</p>
                      </div>
                      {selected && (
                        <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                      )}
                    </button>
                  )
                })}
              </div>
              <div className="flex justify-between pt-2">
                <Button variant="ghost" size="sm" onClick={() => setStep(2)}>
                  <ChevronLeft className="h-4 w-4 mr-1" /> Atrás
                </Button>
                <Button disabled={!canFinish || saving} onClick={handleGoToHowTo}>
                  {saving ? "Guardando…" : "Continuar"} <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}

          {/* Paso 4: Cómo obtener tu estado de cuenta */}
          {step === 4 && (
            <div className="space-y-6">
              <div className="text-center space-y-2">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 mb-2">
                  <BookOpen className="h-6 w-6 text-primary" />
                </div>
                <h1 className="text-2xl font-bold">¿Cómo obtener tu estado de cuenta?</h1>
                <p className="text-muted-foreground text-sm">
                  Para empezar, necesitas descargar tu estado de cuenta del banco. Aquí te explicamos cómo hacerlo según tu banco.
                </p>
              </div>

              <div className="space-y-3">
                {/* Banco General */}
                <div className="rounded-lg border border-border bg-white p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <span style={{ background: "#1a3a8f", width: 10, height: 10, borderRadius: "50%", display: "inline-block", flexShrink: 0 }} />
                    <p className="text-sm font-semibold">Banco General</p>
                    <Monitor className="h-4 w-4 text-muted-foreground ml-auto" />
                  </div>
                  <ol className="text-xs text-muted-foreground space-y-1 pl-4 list-decimal">
                    <li>Entra a <span className="font-medium text-foreground">bgeneral.com</span> → Banca en Línea</li>
                    <li>Ve a <span className="font-medium text-foreground">Mis cuentas → Movimientos</span></li>
                    <li>Selecciona el período que deseas analizar</li>
                    <li>Descarga el estado de cuenta en formato <span className="font-medium text-foreground">Excel (.xlsx)</span></li>
                  </ol>
                </div>

                {/* BAC Credomatic */}
                <div className="rounded-lg border border-border bg-white p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <span style={{ background: "#e31837", width: 10, height: 10, borderRadius: "50%", display: "inline-block", flexShrink: 0 }} />
                    <p className="text-sm font-semibold">BAC Credomatic</p>
                    <Monitor className="h-4 w-4 text-muted-foreground ml-auto" />
                  </div>
                  <ol className="text-xs text-muted-foreground space-y-1 pl-4 list-decimal">
                    <li>Entra a <span className="font-medium text-foreground">bac.net</span> → Banca en Línea</li>
                    <li>Ve a <span className="font-medium text-foreground">Cuentas → Estado de cuenta</span></li>
                    <li>Selecciona el período deseado</li>
                    <li>Descarga en formato <span className="font-medium text-foreground">Excel (.xlsx)</span></li>
                  </ol>
                </div>

                {/* Banistmo */}
                <div className="rounded-lg border border-border bg-white p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <span style={{ background: "#00843d", width: 10, height: 10, borderRadius: "50%", display: "inline-block", flexShrink: 0 }} />
                    <p className="text-sm font-semibold">Banistmo</p>
                    <Smartphone className="h-4 w-4 text-muted-foreground ml-auto" />
                  </div>
                  <ol className="text-xs text-muted-foreground space-y-1 pl-4 list-decimal">
                    <li>Abre la <span className="font-medium text-foreground">app de Banistmo</span> en tu celular</li>
                    <li>Ve a <span className="font-medium text-foreground">Mis cuentas → Movimientos</span></li>
                    <li>Selecciona el período que deseas</li>
                    <li>Usa la opción <span className="font-medium text-foreground">Descargar</span> directamente desde la app</li>
                  </ol>
                </div>

                <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 flex items-start gap-2">
                  <Download className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <p className="text-xs text-primary">
                    <span className="font-semibold">Tip:</span> También puedes ingresar tus gastos manualmente desde la opción <span className="font-semibold">"Entrada Manual"</span> en el menú lateral, si no tienes acceso al estado de cuenta en este momento.
                  </p>
                </div>
              </div>

              <div className="flex justify-between pt-2">
                <Button variant="ghost" size="sm" onClick={() => setStep(3)}>
                  <ChevronLeft className="h-4 w-4 mr-1" /> Atrás
                </Button>
                <Button onClick={() => navigate("/upload")}>
                  Ir a subir mi estado de cuenta <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
