/**
 * OnboardingScreen — 5 pasos, port del web OnboardingPage.tsx
 * Ruta: /onboarding  (safpro://onboarding)
 *
 * Paso 1: Industria
 * Paso 2: Ingreso mensual + preview 50/30/20
 * Paso 3: Metas financieras (multi-select)
 * Paso 4: Seguridad y privacidad
 * Paso 5: Cómo obtener el estado de cuenta → navega a /(tabs)/upload
 */
import { useState } from "react"
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform,
} from "react-native"
import { useRouter } from "expo-router"
import { useQueryClient } from "@tanstack/react-query"
import { Ionicons } from "@expo/vector-icons"
import { updateProfile } from "@safpro/api/users"

// ── Tipos ────────────────────────────────────────────────────────────────────
type Step = 1 | 2 | 3 | 4 | 5

type IndustryType =
  | "tecnologia" | "salud" | "educacion" | "finanzas" | "comercio"
  | "construccion" | "gobierno" | "transporte" | "servicios"
  | "entretenimiento" | "otro"

type GoalType =
  | "fondo_emergencia" | "ahorro_general" | "eliminar_deuda"
  | "invertir" | "meta_especifica"

// ── Datos ────────────────────────────────────────────────────────────────────
const INDUSTRIES: { value: IndustryType; label: string; emoji: string; independent?: boolean }[] = [
  { value: "tecnologia",      label: "Tecnología",               emoji: "💻" },
  { value: "salud",           label: "Salud",                    emoji: "🏥" },
  { value: "educacion",       label: "Educación",                emoji: "📚" },
  { value: "finanzas",        label: "Finanzas / Banca",         emoji: "🏦" },
  { value: "comercio",        label: "Comercio / Retail",        emoji: "🛒" },
  { value: "construccion",    label: "Construcción",             emoji: "🏗️" },
  { value: "gobierno",        label: "Gobierno / Público",       emoji: "🏛️" },
  { value: "transporte",      label: "Transporte / Logística",   emoji: "🚛" },
  { value: "servicios",       label: "Servicios profesionales",  emoji: "💼", independent: true },
  { value: "entretenimiento", label: "Entretenimiento / Creativo", emoji: "🎭", independent: true },
  { value: "otro",            label: "Otro",                     emoji: "⚡" },
]

const VARIABLE_INCOME: IndustryType[] = ["entretenimiento", "servicios"]

const GOALS: { value: GoalType; label: string; desc: string; emoji: string }[] = [
  { value: "fondo_emergencia", label: "Fondo de emergencia",  emoji: "🛡️", desc: "3–6 meses de gastos para imprevistos" },
  { value: "ahorro_general",   label: "Ahorrar más",          emoji: "🐖", desc: "Incrementar mi tasa de ahorro mes a mes" },
  { value: "eliminar_deuda",   label: "Eliminar deudas",      emoji: "✂️", desc: "Pagar tarjetas, préstamos u otras deudas" },
  { value: "invertir",         label: "Empezar a invertir",   emoji: "📈", desc: "Hacer que mi dinero trabaje para mí" },
  { value: "meta_especifica",  label: "Meta específica",      emoji: "🎯", desc: "Ahorrar para viaje, auto, casa…" },
]

const SECURITY_POINTS = [
  "No pedimos usuario ni contraseña bancaria",
  "No tenemos acceso a tu cuenta bancaria",
  "Solo analizamos el archivo que tú descargas y subes",
  "Tus datos no se comparten con nadie",
  "Puedes eliminar tu información en cualquier momento",
]

const BANKS = [
  {
    name: "Banco General",
    color: "#1a3a8f",
    steps: [
      "Entra a bgeneral.com → Banca en Línea",
      "Ve a Mis cuentas → Movimientos",
      "Selecciona el período deseado",
      "Descarga en formato Excel (.xlsx)",
    ],
  },
  {
    name: "BAC Credomatic",
    color: "#e31837",
    steps: [
      "Entra a bac.net → Banca en Línea",
      "Ve a Cuentas → Estado de cuenta",
      "Selecciona el período deseado",
      "Descarga en formato Excel (.xlsx)",
    ],
  },
  {
    name: "Banistmo",
    color: "#00843d",
    steps: [
      "Abre la app de Banistmo en tu celular",
      "Ve a Mis cuentas → Movimientos",
      "Selecciona el período deseado",
      "Usa la opción Descargar desde la app",
    ],
  },
]

// ── Design tokens ─────────────────────────────────────────────────────────────
const BG     = "#070c18"
const CARD   = "#0d1426"
const BORDER = "rgba(255,255,255,0.09)"
const WHITE  = "#ffffff"
const NAVY   = "#1c2b4b"
const INDIGO = "#6366f1"
const ORANGE = "#e05c19"
const MUTED  = "#64748b"
const TEXT   = "#e2e8f0"
const GREEN  = "#22c55e"

// ── Component ─────────────────────────────────────────────────────────────────
export default function OnboardingScreen() {
  const router      = useRouter()
  const queryClient = useQueryClient()

  const [step,     setStep]     = useState<Step>(1)
  const [industry, setIndustry] = useState<IndustryType | null>(null)
  const [income,   setIncome]   = useState("")
  const [goals,    setGoals]    = useState<GoalType[]>([])
  const [saving,   setSaving]   = useState(false)

  const toggleGoal = (g: GoalType) =>
    setGoals(prev => prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g])

  async function handleSaveAndContinue() {
    setSaving(true)
    try {
      await updateProfile({
        industry,
        expected_monthly_income: income ? parseFloat(income) : null,
        financial_goals: goals,
        onboarding_completed: true,
      })
      // Invalidar cache para que _layout.tsx no redirija de vuelta al onboarding
      await queryClient.invalidateQueries({ queryKey: ["profile"] })
    } catch { /* avanzar igualmente si falla */ }
    finally {
      setSaving(false)
      setStep(4)
    }
  }

  async function skipOnboarding() {
    // Marcar completado sin guardar selecciones
    try {
      await updateProfile({ onboarding_completed: true })
      await queryClient.invalidateQueries({ queryKey: ["profile"] })
    } catch { /* ignorar errores al saltar */ }
    router.replace("/(tabs)/upload")
  }

  const incomeNum  = parseFloat(income) || 0
  const canStep1   = industry !== null
  const canStep3   = goals.length > 0

  // ── Progress dots ────────────────────────────────────────────────────────────
  const ProgressDots = () => (
    <View style={s.dots}>
      {[1, 2, 3, 4, 5].map(n => (
        <View key={n} style={[
          s.dot,
          n < step  && s.dotPast,
          n === step && s.dotActive,
          { width: n === step ? 28 : 8 },
        ]} />
      ))}
    </View>
  )

  // ── Nav buttons ──────────────────────────────────────────────────────────────
  const BackBtn = ({ to }: { to: Step }) => (
    <TouchableOpacity onPress={() => setStep(to)} style={s.btnGhost}>
      <Text style={s.btnGhostText}>← Atrás</Text>
    </TouchableOpacity>
  )

  const NextBtn = ({ to, disabled = false, label = "Continuar →" }: {
    to?: Step; disabled?: boolean; label?: string; onPress?: () => void
  }) => (
    <TouchableOpacity
      onPress={() => to && setStep(to)}
      disabled={disabled}
      style={[s.btnPrimary, disabled && s.btnDisabled]}
    >
      <Text style={s.btnPrimaryText}>{label}</Text>
    </TouchableOpacity>
  )

  return (
    <KeyboardAvoidingView
      style={s.root}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      {/* Header */}
      <View style={s.header}>
        <View style={s.logoBox}>
          <Text style={s.logoText}>S</Text>
        </View>
        <Text style={s.logoLabel}>SAFPRO</Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <ProgressDots />

        {/* ═══════════════════════════════════════════════════════════════════
            PASO 1 — Industria
        ═══════════════════════════════════════════════════════════════════ */}
        {step === 1 && (
          <View style={s.stepWrap}>
            <View style={s.stepIcon}><Text style={{ fontSize: 26 }}>💼</Text></View>
            <Text style={s.stepTitle}>¿En qué industria trabajas?</Text>
            <Text style={s.stepSub}>
              Esto nos ayuda a contextualizar tus ingresos y darte recomendaciones más relevantes.
            </Text>

            <View style={s.grid}>
              {INDUSTRIES.map(({ value, label, emoji, independent }) => {
                const sel = industry === value
                return (
                  <TouchableOpacity
                    key={value}
                    onPress={() => setIndustry(value)}
                    style={[s.industryBtn, sel && s.industryBtnSel]}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Text style={s.industryEmoji}>{emoji}</Text>
                      {sel && <Ionicons name="checkmark-circle" size={14} color={INDIGO} />}
                    </View>
                    <Text style={[s.industryLabel, sel && s.industryLabelSel]} numberOfLines={2}>
                      {label}
                    </Text>
                    {independent && (
                      <View style={[s.badge, sel && s.badgeSel]}>
                        <Text style={[s.badgeText, sel && s.badgeTextSel]}>
                          Independiente
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>
                )
              })}
            </View>

            <View style={s.navRow}>
              <TouchableOpacity onPress={skipOnboarding} style={s.btnGhost}>
                <Text style={s.btnGhostText}>Omitir</Text>
              </TouchableOpacity>
              <NextBtn to={2} disabled={!canStep1} />
            </View>
          </View>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            PASO 2 — Ingreso
        ═══════════════════════════════════════════════════════════════════ */}
        {step === 2 && (
          <View style={s.stepWrap}>
            <View style={s.stepIcon}><Text style={{ fontSize: 26 }}>💵</Text></View>
            <Text style={s.stepTitle}>¿Cuánto ganas al mes?</Text>
            <Text style={s.stepSub}>
              Usamos esto para calcular tu meta de ahorro. El dato es solo tuyo.
            </Text>

            <View style={s.card}>
              <Text style={s.label}>Ingreso mensual neto</Text>

              {industry && VARIABLE_INCOME.includes(industry) && (
                <View style={s.tipBox}>
                  <Text style={s.tipText}>
                    💡 <Text style={{ fontWeight: "700" }}>Ingreso variable:</Text> usa el promedio
                    de tus últimos 3 meses como referencia.
                  </Text>
                </View>
              )}

              <View style={s.inputRow}>
                <Text style={s.inputPrefix}>$</Text>
                <TextInput
                  style={s.incomeInput}
                  keyboardType="numeric"
                  placeholder="0.00"
                  placeholderTextColor="#4b5563"
                  value={income}
                  onChangeText={setIncome}
                />
              </View>
              <Text style={s.hint}>Opcional — puedes completarlo después en tu perfil.</Text>

              {incomeNum > 0 && (
                <View style={s.budgetPreview}>
                  <Text style={s.budgetTitle}>Con ${incomeNum.toLocaleString()} al mes:</Text>
                  <Text style={s.budgetLine}>
                    <Text style={{ color: ORANGE }}>50%</Text> necesidades → ${(incomeNum * 0.5).toFixed(0)}
                  </Text>
                  <Text style={s.budgetLine}>
                    <Text style={{ color: INDIGO }}>30%</Text> deseos → ${(incomeNum * 0.3).toFixed(0)}
                  </Text>
                  <Text style={s.budgetLine}>
                    <Text style={{ color: GREEN }}>20%</Text> ahorro → ${(incomeNum * 0.2).toFixed(0)}
                  </Text>
                </View>
              )}
            </View>

            <View style={s.navRow}>
              <BackBtn to={1} />
              <NextBtn to={3} />
            </View>
          </View>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            PASO 3 — Metas financieras
        ═══════════════════════════════════════════════════════════════════ */}
        {step === 3 && (
          <View style={s.stepWrap}>
            <View style={s.stepIcon}><Text style={{ fontSize: 26 }}>🎯</Text></View>
            <Text style={s.stepTitle}>¿Cuáles son tus metas financieras?</Text>
            <Text style={s.stepSub}>
              Selecciona una o varias. Personalizaremos las recomendaciones para ti.
            </Text>

            {GOALS.map(({ value, label, desc, emoji }) => {
              const sel = goals.includes(value)
              return (
                <TouchableOpacity
                  key={value}
                  onPress={() => toggleGoal(value)}
                  style={[s.goalBtn, sel && s.goalBtnSel]}
                >
                  <Text style={s.goalEmoji}>{emoji}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.goalLabel, sel && s.goalLabelSel]}>{label}</Text>
                    <Text style={s.goalDesc}>{desc}</Text>
                  </View>
                  {sel && <Text style={{ color: INDIGO, fontSize: 18 }}>✓</Text>}
                </TouchableOpacity>
              )
            })}

            <View style={s.navRow}>
              <BackBtn to={2} />
              <TouchableOpacity
                onPress={handleSaveAndContinue}
                disabled={!canStep3 || saving}
                style={[s.btnPrimary, (!canStep3 || saving) && s.btnDisabled]}
              >
                {saving
                  ? <ActivityIndicator color={WHITE} size="small" />
                  : <Text style={s.btnPrimaryText}>Continuar →</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            PASO 4 — Seguridad y privacidad
        ═══════════════════════════════════════════════════════════════════ */}
        {step === 4 && (
          <View style={s.stepWrap}>
            {/* Navy header */}
            <View style={[s.securityHeader, { backgroundColor: NAVY }]}>
              <Text style={{ fontSize: 38 }}>🛡️</Text>
              <Text style={[s.stepTitle, { color: WHITE, textAlign: "center" }]}>
                Tu seguridad, primero
              </Text>
              <Text style={{ color: "rgba(255,255,255,0.75)", fontSize: 13, textAlign: "center", lineHeight: 20 }}>
                Antes de subir tu estado de cuenta, queremos ser completamente transparentes contigo.
              </Text>
            </View>

            {/* Checklist */}
            <View style={s.card}>
              {SECURITY_POINTS.map((point, i) => (
                <View key={i} style={s.checkRow}>
                  <View style={s.checkCircle}>
                    <Text style={{ color: GREEN, fontSize: 12, fontWeight: "700" }}>✓</Text>
                  </View>
                  <Text style={s.checkText}>{point}</Text>
                </View>
              ))}
            </View>

            {/* Qué es lo que subes */}
            <View style={s.card}>
              <Text style={s.cardTitle}>¿Qué estás subiendo realmente?</Text>
              <Text style={s.cardBody}>
                Un archivo Excel con el <Text style={{ color: TEXT, fontWeight: "600" }}>
                historial de tus transacciones</Text> — el mismo que tu banco te deja
                descargar desde la banca en línea. No contiene contraseñas ni acceso a tu cuenta.
              </Text>
            </View>

            {/* Disclaimer */}
            <View style={s.warningBox}>
              <Text style={s.warningTitle}>⚠️ Honestidad ante todo</Text>
              <Text style={s.warningText}>
                El archivo viaja cifrado (HTTPS) y se almacena en un servidor seguro.
                Si prefieres no subir el archivo, también puedes ingresar tus gastos
                <Text style={{ fontWeight: "700" }}> manualmente</Text> desde el menú.
              </Text>
            </View>

            <View style={s.navRow}>
              <BackBtn to={3} />
              <TouchableOpacity
                onPress={() => setStep(5)}
                style={[s.btnPrimary, { backgroundColor: ORANGE }]}
              >
                <Text style={s.btnPrimaryText}>Lo entiendo →</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            PASO 5 — Cómo obtener el estado de cuenta
        ═══════════════════════════════════════════════════════════════════ */}
        {step === 5 && (
          <View style={s.stepWrap}>
            <View style={s.stepIcon}><Text style={{ fontSize: 26 }}>📖</Text></View>
            <Text style={s.stepTitle}>¿Cómo obtener tu estado de cuenta?</Text>
            <Text style={s.stepSub}>
              Descarga tu estado de cuenta desde la banca en línea de tu banco.
            </Text>

            {BANKS.map(({ name, color, steps }) => (
              <View key={name} style={s.bankCard}>
                <View style={s.bankHeader}>
                  <View style={[s.bankDot, { backgroundColor: color }]} />
                  <Text style={s.bankName}>{name}</Text>
                </View>
                {steps.map((step, i) => (
                  <Text key={i} style={s.bankStep}>
                    <Text style={{ color: INDIGO, fontWeight: "700" }}>{i + 1}. </Text>
                    {step}
                  </Text>
                ))}
              </View>
            ))}

            {/* Tip manual entry */}
            <View style={s.tipBoxIndigo}>
              <Text style={s.tipTextIndigo}>
                💡 <Text style={{ fontWeight: "700" }}>Tip:</Text> También puedes ingresar tus
                gastos manualmente desde la opción{" "}
                <Text style={{ fontWeight: "700" }}>"Entrada Manual"</Text> en el menú lateral.
              </Text>
            </View>

            <View style={s.navRow}>
              <BackBtn to={4} />
              <TouchableOpacity
                onPress={() => router.replace("/(tabs)/upload")}
                style={[s.btnPrimary, { backgroundColor: ORANGE }]}
              >
                <Text style={s.btnPrimaryText}>Subir estado de cuenta →</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: Platform.OS === "ios" ? 54 : 40,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    backgroundColor: CARD,
  },
  logoBox: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: INDIGO,
    alignItems: "center", justifyContent: "center",
  },
  logoText: { color: WHITE, fontWeight: "800", fontSize: 16 },
  logoLabel: { color: WHITE, fontWeight: "800", fontSize: 18, letterSpacing: 2 },

  scroll: { padding: 20 },

  dots: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8, marginBottom: 28 },
  dot: { height: 8, borderRadius: 4, backgroundColor: BORDER },
  dotActive: { backgroundColor: INDIGO },
  dotPast: { backgroundColor: INDIGO, opacity: 0.4 },

  stepWrap: { gap: 16 },
  stepIcon: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: "rgba(99,102,241,0.12)",
    alignItems: "center", justifyContent: "center",
    alignSelf: "center",
  },
  stepTitle: {
    fontSize: 22, fontWeight: "700", color: TEXT, textAlign: "center",
  },
  stepSub: {
    fontSize: 14, color: MUTED, textAlign: "center", lineHeight: 20,
  },

  // Grid industrias
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  industryBtn: {
    width: "47%",
    flexDirection: "column", alignItems: "flex-start", gap: 4,
    padding: 12, borderRadius: 10,
    borderWidth: 1.5, borderColor: BORDER,
    backgroundColor: CARD,
  },
  industryBtnSel: {
    borderColor: INDIGO,
    backgroundColor: "rgba(99,102,241,0.12)",
  },
  industryEmoji: { fontSize: 18, lineHeight: 22 },
  industryLabel: { fontSize: 13, color: TEXT, flexShrink: 1 },
  industryLabelSel: { color: INDIGO, fontWeight: "600" },
  badge: {
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999,
    backgroundColor: "rgba(224,92,25,0.15)", marginTop: 2,
  },
  badgeSel: { backgroundColor: "rgba(99,102,241,0.2)" },
  badgeText: { fontSize: 10, color: ORANGE, fontWeight: "600" },
  badgeTextSel: { color: INDIGO },

  // Card genérico
  card: {
    backgroundColor: CARD, borderRadius: 14,
    padding: 16, borderWidth: 1, borderColor: BORDER, gap: 10,
  },
  cardTitle: { fontSize: 14, fontWeight: "600", color: TEXT },
  cardBody: { fontSize: 13, color: MUTED, lineHeight: 19 },

  // Ingreso
  label: { fontSize: 13, fontWeight: "500", color: TEXT },
  tipBox: {
    backgroundColor: "rgba(224,92,25,0.1)",
    borderRadius: 8, padding: 10,
    borderWidth: 1, borderColor: "rgba(224,92,25,0.25)",
  },
  tipText: { fontSize: 12, color: "#c47b4a", lineHeight: 17 },
  inputRow: { flexDirection: "row", alignItems: "center" },
  inputPrefix: { fontSize: 15, color: MUTED, marginRight: 6, marginLeft: 2 },
  incomeInput: {
    flex: 1, borderWidth: 1, borderColor: BORDER,
    borderRadius: 8, padding: 12,
    fontSize: 15, color: TEXT, backgroundColor: "#0a1120",
  },
  hint: { fontSize: 11, color: MUTED },
  budgetPreview: {
    backgroundColor: "rgba(99,102,241,0.08)",
    borderRadius: 10, padding: 12, gap: 4,
    borderWidth: 1, borderColor: "rgba(99,102,241,0.2)",
  },
  budgetTitle: { fontSize: 13, fontWeight: "600", color: INDIGO, marginBottom: 4 },
  budgetLine: { fontSize: 13, color: MUTED },

  // Metas
  goalBtn: {
    flexDirection: "row", alignItems: "flex-start", gap: 12,
    padding: 14, borderRadius: 12,
    borderWidth: 1.5, borderColor: BORDER,
    backgroundColor: CARD,
  },
  goalBtnSel: {
    borderColor: INDIGO,
    backgroundColor: "rgba(99,102,241,0.1)",
  },
  goalEmoji: { fontSize: 22, marginTop: 1 },
  goalLabel: { fontSize: 14, fontWeight: "600", color: TEXT },
  goalLabelSel: { color: INDIGO },
  goalDesc: { fontSize: 12, color: MUTED, marginTop: 2, lineHeight: 17 },

  // Seguridad
  securityHeader: {
    borderRadius: 14, padding: 20,
    alignItems: "center", gap: 10,
  },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  checkCircle: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: "rgba(34,197,94,0.12)",
    alignItems: "center", justifyContent: "center",
    flexShrink: 0,
  },
  checkText: { flex: 1, fontSize: 14, color: TEXT, lineHeight: 19 },
  warningBox: {
    backgroundColor: "rgba(251,191,36,0.08)",
    borderRadius: 10, padding: 14,
    borderWidth: 1, borderColor: "rgba(251,191,36,0.3)", gap: 4,
  },
  warningTitle: { fontSize: 13, fontWeight: "600", color: "#b45309" },
  warningText: { fontSize: 12, color: "#92400e", lineHeight: 18 },

  // Bancos
  bankCard: {
    backgroundColor: CARD, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: BORDER, gap: 6,
  },
  bankHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  bankDot: { width: 10, height: 10, borderRadius: 5 },
  bankName: { fontSize: 14, fontWeight: "600", color: TEXT },
  bankStep: { fontSize: 13, color: MUTED, lineHeight: 18, paddingLeft: 4 },
  tipBoxIndigo: {
    backgroundColor: "rgba(99,102,241,0.08)",
    borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: "rgba(99,102,241,0.2)",
  },
  tipTextIndigo: { fontSize: 13, color: INDIGO, lineHeight: 18 },

  // Nav
  navRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 },
  btnPrimary: {
    backgroundColor: INDIGO, borderRadius: 10,
    paddingHorizontal: 18, paddingVertical: 12,
    flexDirection: "row", alignItems: "center", gap: 6,
  },
  btnDisabled: { opacity: 0.45 },
  btnPrimaryText: { color: WHITE, fontWeight: "700", fontSize: 14 },
  btnGhost: { paddingHorizontal: 10, paddingVertical: 12 },
  btnGhostText: { color: MUTED, fontSize: 14 },
})
