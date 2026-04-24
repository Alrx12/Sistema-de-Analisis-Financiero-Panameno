/**
 * SimulacionesScreen — Herramientas de planificación financiera
 * 4 tabs (igual que web):
 *   1. Días restantes (Runway)
 *   2. ¿Qué pasa si…? (Escenarios)
 *   3. Ciclos anuales (Estacionalidad)
 *   4. Planificador de quincena
 */
import { useState, useMemo } from "react"
import {
  View, Text, ScrollView, StyleSheet, TextInput,
  TouchableOpacity, ActivityIndicator, Alert, Modal, FlatList,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useQuery } from "@tanstack/react-query"
import { Ionicons } from "@expo/vector-icons"
import { getAggregatedSummary } from "@safpro/api/analysis"
import type { MonthTrendStat, MerchantStat } from "@safpro/types"

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatCurrency(n: number) {
  return "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function avg(arr: number[]): number {
  if (!arr.length) return 0
  return arr.reduce((a, b) => a + b, 0) / arr.length
}

function monthsUntil(dateStr: string): number {
  if (!dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) return 0
  const target = new Date(dateStr)
  const now = new Date()
  const diff = (target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth())
  return Math.max(diff, 1)
}

function fmtDate(d: string) {
  if (!d || !d.match(/^\d{4}-\d{2}-\d{2}$/)) return d
  const [y, m, day] = d.split("-")
  return `${day}/${m}/${y?.slice(2)}`
}

function uid() { return Math.random().toString(36).slice(2, 9) }

// ── QuincenaDateModal — selector compacto de fecha sin dependencias extra ──────
const MONTH_NAMES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"]

function QuincenaDateModal({ visible, onSelect, onClose }: {
  visible: boolean; onSelect: (d: string) => void; onClose: () => void
}) {
  const now = new Date()
  const [selYear,  setSelYear]  = useState(now.getFullYear())
  const [selMonth, setSelMonth] = useState(now.getMonth() + 1) // 1–12
  const [selDay,   setSelDay]   = useState(now.getDate())

  const years = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1]
  const daysInMonth = new Date(selYear, selMonth, 0).getDate()
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1)

  const BG2   = "#0d1426"
  const SEL   = "#6366f1"
  const MUT   = "rgba(255,255,255,0.45)"
  const TX    = "#f1f5f9"
  const BO    = "rgba(255,255,255,0.07)"

  function confirm() {
    const d = `${selYear}-${String(selMonth).padStart(2,"0")}-${String(selDay).padStart(2,"0")}`
    onSelect(d)
    onClose()
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" }} activeOpacity={1} onPress={onClose}>
        <View style={{ backgroundColor: BG2, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 12, paddingBottom: 40, borderTopWidth: 1, borderColor: BO }}>
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: BO, alignSelf: "center", marginBottom: 16 }} />
          <Text style={{ color: TX, fontSize: 16, fontWeight: "700", textAlign: "center", marginBottom: 16 }}>Seleccionar fecha</Text>

          {/* Year row */}
          <Text style={{ color: MUT, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1, paddingHorizontal: 20, marginBottom: 6 }}>Año</Text>
          <View style={{ flexDirection: "row", paddingHorizontal: 16, gap: 8, marginBottom: 12 }}>
            {years.map(y => (
              <TouchableOpacity key={y}
                style={{ flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: selYear === y ? SEL : "rgba(255,255,255,0.06)", alignItems: "center" }}
                onPress={() => setSelYear(y)}
              >
                <Text style={{ color: selYear === y ? "#fff" : MUT, fontWeight: "700" }}>{y}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Month row */}
          <Text style={{ color: MUT, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1, paddingHorizontal: 20, marginBottom: 6 }}>Mes</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingHorizontal: 16, marginBottom: 12 }} contentContainerStyle={{ gap: 6 }}>
            {MONTH_NAMES.map((m, i) => {
              const mn = i + 1
              return (
                <TouchableOpacity key={mn}
                  style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, backgroundColor: selMonth === mn ? SEL : "rgba(255,255,255,0.06)", minWidth: 52, alignItems: "center" }}
                  onPress={() => { setSelMonth(mn); if (selDay > new Date(selYear, mn, 0).getDate()) setSelDay(1) }}
                >
                  <Text style={{ color: selMonth === mn ? "#fff" : MUT, fontWeight: "700", fontSize: 12 }}>{m}</Text>
                </TouchableOpacity>
              )
            })}
          </ScrollView>

          {/* Day row */}
          <Text style={{ color: MUT, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1, paddingHorizontal: 20, marginBottom: 6 }}>Día</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingHorizontal: 16, marginBottom: 16 }} contentContainerStyle={{ gap: 5 }}>
            {days.map(d => (
              <TouchableOpacity key={d}
                style={{ width: 38, height: 38, borderRadius: 8, backgroundColor: selDay === d ? SEL : "rgba(255,255,255,0.06)", alignItems: "center", justifyContent: "center" }}
                onPress={() => setSelDay(d)}
              >
                <Text style={{ color: selDay === d ? "#fff" : MUT, fontWeight: "700", fontSize: 12 }}>{d}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Confirm */}
          <TouchableOpacity
            style={{ marginHorizontal: 20, backgroundColor: SEL, borderRadius: 12, paddingVertical: 14, alignItems: "center" }}
            onPress={confirm}
            activeOpacity={0.8}
          >
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>
              {`Seleccionar — ${String(selDay).padStart(2,"0")} ${MONTH_NAMES[selMonth-1]} ${selYear}`}
            </Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  )
}

// ── Tokens ────────────────────────────────────────────────────────────────────
const BG    = "#070c18"
const CARD  = "#0d1426"
const TEXT  = "#f1f5f9"
const MUTED = "rgba(255,255,255,0.45)"
const DIM   = "rgba(255,255,255,0.28)"
const BORDER = "rgba(255,255,255,0.07)"
const ORANGE = "#e05c19"
const GREEN  = "#22c55e"
const RED    = "#ef4444"
const AMBER  = "#f59e0b"

// ── Tab 1: Runway ──────────────────────────────────────────────────────────────

function RunwayTab({
  trend, totalExpenses, totalMonths,
}: {
  trend: MonthTrendStat[]
  totalExpenses: number
  totalMonths: number
}) {
  const [saldo, setSaldo]           = useState("")
  const [period, setPeriod]         = useState<3 | 6 | 12>(3)

  const avgMonthly = useMemo(() => {
    const slice = trend.slice(-period)
    if (!slice.length) return totalExpenses / Math.max(totalMonths, 1)
    return avg(slice.map(m => m.expenses))
  }, [trend, period, totalExpenses, totalMonths])

  const dailyAvg = avgMonthly / 30
  const saldoNum = parseFloat(saldo.replace(",", ".")) || 0
  const dias     = saldoNum > 0 && dailyAvg > 0 ? Math.floor(saldoNum / dailyAvg) : null

  const color = dias == null ? "#9ca3af"
    : dias < 15  ? RED
    : dias < 30  ? AMBER
    : GREEN

  const label = dias == null ? "—"
    : dias < 15  ? "Crítico"
    : dias < 30  ? "Ajustado"
    : "Cómodo"

  const pct = dias != null ? Math.min((dias / 60) * 100, 100) : 0

  return (
    <ScrollView contentContainerStyle={s.tabContent}>
      {/* Period selector */}
      <View style={s.periodRow}>
        <Text style={s.periodLabel}>Promedio basado en:</Text>
        {([3, 6, 12] as const).map(p => (
          <TouchableOpacity
            key={p}
            style={[s.periodBtn, period === p && s.periodBtnActive]}
            onPress={() => setPeriod(p)}
          >
            <Text style={[s.periodBtnText, period === p && { color: ORANGE }]}>
              {p} meses
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Stats */}
      <View style={s.statsRow}>
        <View style={s.statCard}>
          <Text style={s.statLabel}>Gasto prom/mes</Text>
          <Text style={s.statValue}>{formatCurrency(avgMonthly)}</Text>
        </View>
        <View style={s.statCard}>
          <Text style={s.statLabel}>Gasto prom/día</Text>
          <Text style={s.statValue}>{formatCurrency(dailyAvg)}</Text>
        </View>
      </View>

      {/* Input */}
      <View style={s.section}>
        <Text style={s.sectionLabel}>Tu saldo actual ($)</Text>
        <View style={s.inputRow}>
          <Text style={s.inputPrefix}>$</Text>
          <TextInput
            style={s.input}
            placeholder="ej: 800"
            keyboardType="decimal-pad"
            value={saldo}
            onChangeText={setSaldo}
            placeholderTextColor="#9ca3af"
          />
        </View>
      </View>

      {/* Result */}
      {saldoNum > 0 && dias !== null ? (
        <>
          <View style={[s.resultCard, { borderLeftColor: color }]}>
            <Text style={s.resultLabel}>Te alcanza para</Text>
            <Text style={[s.resultDays, { color }]}>{dias} días</Text>
            <View style={[s.statusBadge, { backgroundColor: color + "20" }]}>
              <Text style={[s.statusBadgeText, { color }]}>{label}</Text>
            </View>
          </View>
          <View style={s.barTrack}>
            <View style={[s.barFill, { width: `${pct}%` as `${number}%`, backgroundColor: color }]} />
          </View>
          <View style={s.barLabels}>
            <Text style={s.barLabel}>0</Text>
            <Text style={s.barLabel}>30 días</Text>
            <Text style={s.barLabel}>60 días</Text>
          </View>
          {dias < 15 && (
            <View style={s.alertBox}>
              <Ionicons name="warning-outline" size={14} color={RED} />
              <Text style={[s.alertText, { color: RED }]}>Menos de 15 días — considera reducir gastos esta semana</Text>
            </View>
          )}
          {dias >= 15 && dias < 30 && (
            <View style={[s.alertBox, { backgroundColor: AMBER + "15" }]}>
              <Ionicons name="alert-circle-outline" size={14} color={AMBER} />
              <Text style={[s.alertText, { color: AMBER }]}>Entre 15 y 30 días — revisa tus gastos antes de tu próxima fecha de cobro</Text>
            </View>
          )}
          <View style={s.section}>
            {[
              { label: "1 semana de runway", amount: dailyAvg * 7 },
              { label: "1 mes de runway",    amount: dailyAvg * 30 },
              { label: "3 meses de runway",  amount: dailyAvg * 90 },
            ].map(row => (
              <View key={row.label} style={s.breakdownRow}>
                <Text style={s.breakdownLabel}>{row.label}</Text>
                <Text style={s.breakdownValue}>{formatCurrency(row.amount)}</Text>
              </View>
            ))}
          </View>
        </>
      ) : (
        saldo.length === 0 && (
          <View style={s.emptyHint}>
            <Text style={s.emptyHintText}>Ingresa tu saldo actual para ver cuántos días te dura</Text>
          </View>
        )
      )}
      <View style={s.disclaimer}>
        <Text style={s.disclaimerText}>Estimación basada en datos históricos. No es asesoría financiera.</Text>
      </View>
    </ScrollView>
  )
}

// ── Tab 2: Escenarios ──────────────────────────────────────────────────────────

function EscenariosTab({
  categories,
  merchants,
  totalMonths,
}: {
  categories: Record<string, number>
  merchants: MerchantStat[]
  totalMonths: number
}) {
  const [reductions, setReductions] = useState<Record<string, number>>({})
  const [goalName,   setGoalName]   = useState("")
  const [goalAmount, setGoalAmount] = useState("")
  const [goalDate,   setGoalDate]   = useState("")
  const [showSubs,   setShowSubs]   = useState(true)

  const months = Math.max(totalMonths, 1)
  const STEPS  = [0, 10, 25, 50]

  const sortedCats = useMemo(() =>
    Object.entries(categories)
      .map(([k, v]) => [k, v / months] as [string, number])
      .filter(([, v]) => v > 5)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 12)
  , [categories, months])

  const totalMonthlySavings = sortedCats.reduce((sum, [cat, monthly]) => {
    return sum + monthly * ((reductions[cat] ?? 0) / 100)
  }, 0)

  const possibleSubs = useMemo(() =>
    merchants.filter(m => m.count >= 3).slice(0, 10)
  , [merchants])

  const goalAmountNum = parseFloat(goalAmount.replace(",", ".")) || 0
  const goalMonths    = goalDate ? monthsUntil(goalDate) : 0
  const monthlyForGoal = goalMonths > 0 ? goalAmountNum / goalMonths : 0
  const weeklyForGoal  = monthlyForGoal / 4.33

  function setReduction(cat: string, pct: number) {
    setReductions(prev => ({ ...prev, [cat]: pct }))
  }

  return (
    <ScrollView contentContainerStyle={s.tabContent}>

      {/* Category sliders */}
      <View style={s.card}>
        <Text style={s.cardTitle}>¿Qué pasa si reduzco mis gastos?</Text>
        <Text style={s.cardSubtitle}>Toca un porcentaje para simular cuánto ahorrarías</Text>
        {sortedCats.map(([cat, monthly]) => {
          const pct    = reductions[cat] ?? 0
          const saving = monthly * (pct / 100)
          return (
            <View key={cat} style={s.catCard}>
              <View style={s.catHeader}>
                <Text style={s.catName}>{cat.replace(/_/g, " ")}</Text>
                <Text style={s.catMonthly}>{formatCurrency(monthly)}/mes</Text>
              </View>
              <View style={s.stepsRow}>
                {STEPS.map(step => (
                  <TouchableOpacity
                    key={step}
                    style={[s.stepBtn, pct === step && s.stepBtnActive]}
                    onPress={() => setReduction(cat, step)}
                  >
                    <Text style={[s.stepBtnText, pct === step && s.stepBtnTextActive]}>
                      {step === 0 ? "Sin cambio" : `-${step}%`}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              {saving > 0 && (
                <Text style={s.catSaving}>
                  Ahorro: {formatCurrency(saving)}/mes · {formatCurrency(saving * 12)}/año
                </Text>
              )}
            </View>
          )
        })}
        {totalMonthlySavings > 0 && (
          <View style={s.savingsTotal}>
            <View style={s.savingsTotalItem}>
              <Text style={s.savingsTotalLabel}>Ahorro mensual</Text>
              <Text style={s.savingsTotalValue}>{formatCurrency(totalMonthlySavings)}</Text>
            </View>
            <View style={s.savingsTotalItem}>
              <Text style={s.savingsTotalLabel}>Ahorro anual</Text>
              <Text style={s.savingsTotalValue}>{formatCurrency(totalMonthlySavings * 12)}</Text>
            </View>
          </View>
        )}
      </View>

      {/* Gastos recurrentes */}
      {possibleSubs.length > 0 && (
        <View style={s.card}>
          <TouchableOpacity style={s.cardTitleRow} onPress={() => setShowSubs(v => !v)}>
            <View>
              <Text style={s.cardTitle}>Gastos recurrentes detectados</Text>
              <Text style={s.cardSubtitle}>Merchants que aparecen 3+ veces en tu historial</Text>
            </View>
            <Ionicons name={showSubs ? "chevron-up" : "chevron-down"} size={16} color={MUTED} />
          </TouchableOpacity>
          {showSubs && possibleSubs.map(m => {
            const monthly = m.amount / months
            return (
              <View key={m.name} style={s.breakdownRow}>
                <View>
                  <Text style={s.breakdownLabel}>{m.name.toLowerCase()}</Text>
                  <Text style={[s.breakdownLabel, { fontSize: 11, marginTop: 1 }]}>{m.count} veces · {formatCurrency(monthly)}/mes est.</Text>
                </View>
                <Text style={s.breakdownValue}>{formatCurrency(monthly * 12)}/año</Text>
              </View>
            )
          })}
          {showSubs && possibleSubs.length > 0 && (
            <Text style={{ color: DIM, fontSize: 12, textAlign: "center", marginTop: 8 }}>
              Total anual estimado en recurrentes:{" "}
              <Text style={{ fontWeight: "700" }}>
                {formatCurrency(possibleSubs.reduce((s, m) => s + (m.amount / months) * 12, 0))}
              </Text>
            </Text>
          )}
        </View>
      )}

      {/* Meta inversa */}
      <View style={s.card}>
        <Text style={s.cardTitle}>Meta de ahorro inversa</Text>
        <Text style={s.cardSubtitle}>¿Quieres ahorrar para algo? Calcula cuánto necesitas separar cada semana</Text>
        <TextInput
          style={s.metaInput}
          placeholder="¿Para qué? (ej: vacaciones)"
          placeholderTextColor="#9ca3af"
          value={goalName}
          onChangeText={setGoalName}
        />
        <View style={s.metaRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.metaFieldLabel}>Monto ($)</Text>
            <TextInput
              style={s.metaInput}
              placeholder="ej: 1000"
              keyboardType="decimal-pad"
              placeholderTextColor="#9ca3af"
              value={goalAmount}
              onChangeText={setGoalAmount}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.metaFieldLabel}>Fecha objetivo (AAAA-MM-DD)</Text>
            <TextInput
              style={s.metaInput}
              placeholder="2026-12-31"
              placeholderTextColor="#9ca3af"
              value={goalDate}
              onChangeText={setGoalDate}
            />
          </View>
        </View>
        {goalAmountNum > 0 && goalMonths > 0 && (
          <View style={s.goalResult}>
            <Text style={s.goalResultTitle}>
              {goalName ? `Para "${goalName}"` : "Para tu meta"} en {goalMonths} {goalMonths === 1 ? "mes" : "meses"}:
            </Text>
            <View style={s.goalResultRow}>
              <View style={s.goalResultItem}>
                <Text style={s.goalResultLabel}>Por semana</Text>
                <Text style={s.goalResultValue}>{formatCurrency(weeklyForGoal)}</Text>
              </View>
              <View style={s.goalResultItem}>
                <Text style={s.goalResultLabel}>Por mes</Text>
                <Text style={s.goalResultValue}>{formatCurrency(monthlyForGoal)}</Text>
              </View>
            </View>
            <Text style={s.goalTotal}>Total a ahorrar: {formatCurrency(goalAmountNum)}</Text>
          </View>
        )}
      </View>

      <View style={s.disclaimer}>
        <Text style={s.disclaimerText}>Proyección basada en promedios históricos. Los resultados reales pueden variar.</Text>
      </View>
    </ScrollView>
  )
}

// ── Tab 3: Estacionalidad ──────────────────────────────────────────────────────

function EstacionalidadTab({ trend }: { trend: MonthTrendStat[] }) {
  if (trend.length < 2) {
    return (
      <View style={s.emptyState}>
        <Ionicons name="calendar-outline" size={48} color="#9ca3af" />
        <Text style={s.emptyTitle}>Necesitas al menos 2 meses de datos</Text>
        <Text style={s.emptyText}>Sube más estados de cuenta para ver patrones de estacionalidad.</Text>
      </View>
    )
  }

  const avgExpenses = avg(trend.map(t => t.expenses))
  const avgIncome   = avg(trend.map(t => t.income))
  const avgSavings  = avgIncome - avgExpenses
  const peaks       = trend.filter(t => t.expenses > avgExpenses * 1.2)

  return (
    <ScrollView contentContainerStyle={s.tabContent}>
      {/* Stats */}
      <View style={s.statsRow}>
        <View style={s.statCard}>
          <Text style={s.statLabel}>Gasto prom/mes</Text>
          <Text style={s.statValue}>{formatCurrency(avgExpenses)}</Text>
        </View>
        <View style={s.statCard}>
          <Text style={s.statLabel}>Ingreso prom/mes</Text>
          <Text style={[s.statValue, { color: GREEN }]}>{formatCurrency(avgIncome)}</Text>
        </View>
      </View>
      <View style={[s.statCard, { marginHorizontal: 0, marginBottom: 16, alignItems: "center" }]}>
        <Text style={s.statLabel}>Ahorro promedio/mes</Text>
        <Text style={[s.statValue, { color: avgSavings >= 0 ? GREEN : RED }]}>
          {formatCurrency(avgSavings)}
        </Text>
      </View>

      {/* Tendencia mensual */}
      <View style={s.card}>
        <Text style={s.cardTitle}>Gastos por mes</Text>
        {trend.map(t => {
          const pct = avgExpenses > 0 ? Math.min((t.expenses / (avgExpenses * 1.5)) * 100, 100) : 0
          const isHigh = t.expenses > avgExpenses * 1.2
          return (
            <View key={t.month} style={s.trendRow}>
              <Text style={s.trendLabel}>{t.label}</Text>
              <View style={s.trendBarWrap}>
                <View style={[s.trendBarFill, {
                  width: `${pct}%` as `${number}%`,
                  backgroundColor: isHigh ? AMBER : "#1c2b4b",
                }]} />
              </View>
              <Text style={[s.trendValue, isHigh && { color: AMBER }]}>{formatCurrency(t.expenses)}</Text>
            </View>
          )
        })}
        <Text style={{ color: DIM, fontSize: 11, textAlign: "center", marginTop: 8 }}>
          Los meses en <Text style={{ color: AMBER }}>naranja</Text> tuvieron gastos 20%+ sobre el promedio
        </Text>
      </View>

      {/* Picos */}
      {peaks.length > 0 && (
        <View style={s.card}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <Ionicons name="warning-outline" size={16} color={AMBER} />
            <Text style={s.cardTitle}>Meses con gastos inusualmente altos</Text>
          </View>
          <Text style={s.cardSubtitle}>
            Si son recurrentes (seguros anuales, temporadas, etc.), considera reservar dinero con anticipación.
          </Text>
          {peaks.map(p => (
            <View key={p.month} style={s.breakdownRow}>
              <View>
                <Text style={s.breakdownLabel}>{p.label}</Text>
                <Text style={[s.breakdownLabel, { fontSize: 11, color: AMBER }]}>
                  {((p.expenses / avgExpenses - 1) * 100).toFixed(0)}% sobre el promedio
                </Text>
              </View>
              <Text style={[s.breakdownValue, { color: AMBER }]}>{formatCurrency(p.expenses)}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={s.disclaimer}>
        <Text style={s.disclaimerText}>Basado en tu historial. Los resultados reales pueden variar.</Text>
      </View>
    </ScrollView>
  )
}

// ── Tab 4: Planificador de quincena ────────────────────────────────────────────

interface IncomeEntry  { id: string; date: string; amount: string; label: string }
interface PaymentEntry { id: string; date: string; amount: string; label: string }

function QuincenaTab() {
  const [saldoInicial, setSaldoInicial] = useState("")
  const [ingresos,  setIngresos]  = useState<IncomeEntry[]>([])
  const [pagos,     setPagos]     = useState<PaymentEntry[]>([])

  const [iDate, setIDate] = useState("")
  const [iAmt,  setIAmt]  = useState("")
  const [iLbl,  setILbl]  = useState("")

  const [pDate, setPDate] = useState("")
  const [pAmt,  setPAmt]  = useState("")
  const [pLbl,  setPLbl]  = useState("")

  const [showDatePicker,  setShowDatePicker]  = useState(false)
  const [datePickerTarget, setDatePickerTarget] = useState<"ingreso" | "pago">("ingreso")

  // Deuda liquidador
  const [showDebt,   setShowDebt]   = useState(false)
  const [debtAmt,    setDebtAmt]    = useState("")
  const [debtMode,   setDebtMode]   = useState<"months" | "payment">("months")
  const [debtMonths, setDebtMonths] = useState("")
  const [debtPay,    setDebtPay]    = useState("")

  function addIngreso() {
    if (!iDate || !iAmt) {
      Alert.alert("Campos requeridos", "Completa la fecha y el monto.")
      return
    }
    setIngresos(p => [...p, { id: uid(), date: iDate, amount: iAmt, label: iLbl || "Quincena" }])
    setIDate(""); setIAmt(""); setILbl("")
  }

  function addPago() {
    if (!pDate || !pAmt) {
      Alert.alert("Campos requeridos", "Completa la fecha y el monto.")
      return
    }
    setPagos(p => [...p, { id: uid(), date: pDate, amount: pAmt, label: pLbl || "Pago" }])
    setPDate(""); setPAmt(""); setPLbl("")
  }

  type Event = { id: string; date: string; label: string; amount: number; type: "income" | "payment"; running: number }

  const timeline = useMemo<Event[]>(() => {
    const events: Omit<Event, "running">[] = [
      ...ingresos.map(e => ({ id: e.id, date: e.date, label: e.label, amount: parseFloat(e.amount) || 0, type: "income" as const })),
      ...pagos.map(e => ({ id: e.id, date: e.date, label: e.label, amount: -(parseFloat(e.amount) || 0), type: "payment" as const })),
    ].sort((a, b) => a.date.localeCompare(b.date))
    let running = parseFloat(saldoInicial.replace(",", ".")) || 0
    return events.map(e => { running += e.amount; return { ...e, running } })
  }, [ingresos, pagos, saldoInicial])

  const totalIngresos  = ingresos.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0)
  const totalPagos     = pagos.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0)
  const saldoFinal     = timeline.length ? timeline[timeline.length - 1].running : parseFloat(saldoInicial.replace(",", ".")) || 0
  const hasNegative    = timeline.some(e => e.running < 0)

  const debtAmtNum  = parseFloat(debtAmt.replace(",", ".")) || 0
  const debtMonthsN = parseInt(debtMonths) || 0
  const debtPayN    = parseFloat(debtPay.replace(",", ".")) || 0
  const quincenaPayment = debtMode === "months" && debtMonthsN > 0 ? debtAmtNum / (debtMonthsN * 2) : 0
  const quincenasNeeded = debtMode === "payment" && debtPayN > 0 ? Math.ceil(debtAmtNum / debtPayN) : 0
  const monthsNeeded    = Math.ceil(quincenasNeeded / 2)

  return (
    <ScrollView contentContainerStyle={s.tabContent}>

      {/* Saldo inicial */}
      <View style={[s.card, { flexDirection: "row", alignItems: "center", gap: 12 }]}>
        <Ionicons name="cash-outline" size={18} color={MUTED} />
        <View style={{ flex: 1 }}>
          <Text style={s.cardTitle}>Saldo inicial</Text>
          <Text style={s.cardSubtitle}>Cuánto tienes ahora (opcional)</Text>
        </View>
        <View style={[s.inputRow, { flex: 0, width: 130 }]}>
          <Text style={s.inputPrefix}>$</Text>
          <TextInput
            style={s.input}
            placeholder="0.00"
            keyboardType="decimal-pad"
            placeholderTextColor="#9ca3af"
            value={saldoInicial}
            onChangeText={setSaldoInicial}
          />
        </View>
      </View>

      {/* Ingresos */}
      <View style={s.card}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <Ionicons name="arrow-up-circle-outline" size={16} color={GREEN} />
          <Text style={s.cardTitle}>Ingresos esperados</Text>
        </View>
        <View style={s.qForm}>
          <TouchableOpacity style={[s.qInput, { flex: 1, justifyContent: "center" }]} onPress={() => { setDatePickerTarget("ingreso"); setShowDatePicker(true) }}>
            <Text style={{ color: iDate ? TEXT : "#9ca3af", fontSize: 12, fontWeight: iDate ? "600" : "400" }}>
              {iDate ? fmtDate(iDate) : "📅 Fecha"}
            </Text>
          </TouchableOpacity>
          <TextInput style={[s.qInput, { width: 90 }]} placeholder="$" keyboardType="decimal-pad" placeholderTextColor="#9ca3af" value={iAmt} onChangeText={setIAmt} />
          <TextInput style={[s.qInput, { flex: 1 }]} placeholder="Etiqueta" placeholderTextColor="#9ca3af" value={iLbl} onChangeText={setILbl} />
          <TouchableOpacity style={s.qAddBtn} onPress={addIngreso}>
            <Ionicons name="add" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
        {ingresos.length === 0
          ? <Text style={s.qEmpty}>Sin ingresos agregados</Text>
          : ingresos.map(e => (
            <View key={e.id} style={s.qListItem}>
              <View>
                <Text style={s.qListLabel}>{e.label}</Text>
                <Text style={s.qListDate}>{fmtDate(e.date)}</Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <Text style={{ color: GREEN, fontWeight: "700", fontSize: 13 }}>+{formatCurrency(parseFloat(e.amount) || 0)}</Text>
                <TouchableOpacity onPress={() => setIngresos(p => p.filter(x => x.id !== e.id))}>
                  <Ionicons name="trash-outline" size={16} color={RED} />
                </TouchableOpacity>
              </View>
            </View>
          ))
        }
      </View>

      {/* Pagos */}
      <View style={s.card}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <Ionicons name="arrow-down-circle-outline" size={16} color={RED} />
          <Text style={s.cardTitle}>Compromisos de pago</Text>
        </View>
        <View style={s.qForm}>
          <TouchableOpacity style={[s.qInput, { flex: 1, justifyContent: "center" }]} onPress={() => { setDatePickerTarget("pago"); setShowDatePicker(true) }}>
            <Text style={{ color: pDate ? TEXT : "#9ca3af", fontSize: 12, fontWeight: pDate ? "600" : "400" }}>
              {pDate ? fmtDate(pDate) : "📅 Fecha"}
            </Text>
          </TouchableOpacity>
          <TextInput style={[s.qInput, { width: 90 }]} placeholder="$" keyboardType="decimal-pad" placeholderTextColor="#9ca3af" value={pAmt} onChangeText={setPAmt} />
          <TextInput style={[s.qInput, { flex: 1 }]} placeholder="Etiqueta" placeholderTextColor="#9ca3af" value={pLbl} onChangeText={setPLbl} />
          <TouchableOpacity style={[s.qAddBtn, { backgroundColor: RED }]} onPress={addPago}>
            <Ionicons name="add" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
        {pagos.length === 0
          ? <Text style={s.qEmpty}>Sin pagos agregados</Text>
          : pagos.map(e => (
            <View key={e.id} style={s.qListItem}>
              <View>
                <Text style={s.qListLabel}>{e.label}</Text>
                <Text style={s.qListDate}>{fmtDate(e.date)}</Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <Text style={{ color: RED, fontWeight: "700", fontSize: 13 }}>−{formatCurrency(parseFloat(e.amount) || 0)}</Text>
                <TouchableOpacity onPress={() => setPagos(p => p.filter(x => x.id !== e.id))}>
                  <Ionicons name="trash-outline" size={16} color={RED} />
                </TouchableOpacity>
              </View>
            </View>
          ))
        }
      </View>

      {/* Timeline */}
      {timeline.length > 0 && (
        <View style={s.card}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <Text style={s.cardTitle}>Flujo proyectado</Text>
            {hasNegative && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Ionicons name="warning-outline" size={14} color={RED} />
                <Text style={{ color: RED, fontSize: 11, fontWeight: "700" }}>Saldo negativo</Text>
              </View>
            )}
          </View>
          {/* Header */}
          <View style={s.tlHeader}>
            <Text style={[s.tlCell, { flex: 1 }]}>Fecha</Text>
            <Text style={[s.tlCell, { flex: 2 }]}>Concepto</Text>
            <Text style={[s.tlCell, { flex: 1.2, textAlign: "right" }]}>Movimiento</Text>
            <Text style={[s.tlCell, { flex: 1.2, textAlign: "right" }]}>Saldo</Text>
          </View>
          {parseFloat(saldoInicial) > 0 && (
            <View style={s.tlRow}>
              <Text style={[s.tlDate, { flex: 1 }]}>Hoy</Text>
              <Text style={[s.tlLabel, { flex: 2, fontStyle: "italic", color: DIM }]}>Saldo inicial</Text>
              <Text style={[s.tlCell, { flex: 1.2, textAlign: "right" }]}> </Text>
              <Text style={[s.tlValue, { flex: 1.2, textAlign: "right" }]}>{formatCurrency(parseFloat(saldoInicial) || 0)}</Text>
            </View>
          )}
          {timeline.map(ev => {
            const isNeg = ev.running < 0
            return (
              <View key={ev.id} style={[s.tlRow, isNeg && { backgroundColor: RED + "12" }, ev.type === "income" && { backgroundColor: GREEN + "08" }]}>
                <Text style={[s.tlDate, { flex: 1 }]}>{fmtDate(ev.date)}</Text>
                <Text style={[s.tlLabel, { flex: 2 }]} numberOfLines={1}>
                  {ev.type === "income" ? "↑ " : "↓ "}{ev.label}
                </Text>
                <Text style={[{ flex: 1.2, textAlign: "right", fontSize: 12, fontWeight: "700" }, { color: ev.type === "income" ? GREEN : RED }]}>
                  {ev.type === "income" ? "+" : "−"}{formatCurrency(Math.abs(ev.amount))}
                </Text>
                <Text style={[{ flex: 1.2, textAlign: "right", fontSize: 12, fontWeight: "700" }, { color: isNeg ? RED : TEXT }]}>
                  {isNeg && "⚠ "}{formatCurrency(ev.running)}
                </Text>
              </View>
            )
          })}
          {/* Summary */}
          <View style={s.qSummary}>
            <View style={[s.qSummaryItem, { borderColor: GREEN + "40", backgroundColor: GREEN + "10" }]}>
              <Text style={[s.qSummaryLabel, { color: GREEN }]}>Ingresos</Text>
              <Text style={[s.qSummaryValue, { color: GREEN }]}>{formatCurrency(totalIngresos)}</Text>
            </View>
            <View style={[s.qSummaryItem, { borderColor: RED + "40", backgroundColor: RED + "10" }]}>
              <Text style={[s.qSummaryLabel, { color: RED }]}>Compromisos</Text>
              <Text style={[s.qSummaryValue, { color: RED }]}>{formatCurrency(totalPagos)}</Text>
            </View>
            <View style={[s.qSummaryItem, { borderColor: (saldoFinal >= 0 ? "#3b82f6" : RED) + "40", backgroundColor: (saldoFinal >= 0 ? "#3b82f6" : RED) + "10" }]}>
              <Text style={[s.qSummaryLabel, { color: saldoFinal >= 0 ? "#3b82f6" : RED }]}>Saldo final</Text>
              <Text style={[s.qSummaryValue, { color: saldoFinal >= 0 ? "#3b82f6" : RED }]}>{formatCurrency(saldoFinal)}</Text>
            </View>
          </View>
        </View>
      )}

      {timeline.length === 0 && (
        <View style={s.emptyHint}>
          <Text style={s.emptyHintText}>Agrega al menos un ingreso o pago para ver el flujo proyectado</Text>
        </View>
      )}

      {/* Date picker modal */}
      <QuincenaDateModal
        visible={showDatePicker}
        onSelect={(d) => { datePickerTarget === "ingreso" ? setIDate(d) : setPDate(d) }}
        onClose={() => setShowDatePicker(false)}
      />

      {/* Liquidador de deuda */}
      <View style={s.card}>
        <TouchableOpacity style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }} onPress={() => setShowDebt(v => !v)}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Ionicons name="card-outline" size={16} color={ORANGE} />
            <Text style={s.cardTitle}>Liquidador de deuda a tu ritmo</Text>
          </View>
          <Ionicons name={showDebt ? "chevron-up" : "chevron-down"} size={16} color={MUTED} />
        </TouchableOpacity>
        {showDebt && (
          <>
            <Text style={[s.cardSubtitle, { marginTop: 8, marginBottom: 12 }]}>
              Calcula cuánto pagar por quincena para liquidar una deuda, o en cuánto tiempo la liquidas.
            </Text>
            {/* Mode toggle */}
            <View style={s.debtToggle}>
              <TouchableOpacity
                style={[s.debtToggleBtn, debtMode === "months" && s.debtToggleBtnActive]}
                onPress={() => setDebtMode("months")}
              >
                <Text style={[s.debtToggleBtnText, debtMode === "months" && { color: "#fff" }]}>Pagarlo en X meses</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.debtToggleBtn, debtMode === "payment" && s.debtToggleBtnActive]}
                onPress={() => setDebtMode("payment")}
              >
                <Text style={[s.debtToggleBtnText, debtMode === "payment" && { color: "#fff" }]}>Pagar $X por quincena</Text>
              </TouchableOpacity>
            </View>
            <View style={s.metaRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.metaFieldLabel}>Total de la deuda ($)</Text>
                <TextInput style={s.metaInput} placeholder="ej: 2000" keyboardType="decimal-pad" placeholderTextColor="#9ca3af" value={debtAmt} onChangeText={setDebtAmt} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.metaFieldLabel}>{debtMode === "months" ? "Plazo (meses)" : "Pago por quincena ($)"}</Text>
                <TextInput
                  style={s.metaInput}
                  placeholder={debtMode === "months" ? "ej: 12" : "ej: 100"}
                  keyboardType="decimal-pad"
                  placeholderTextColor="#9ca3af"
                  value={debtMode === "months" ? debtMonths : debtPay}
                  onChangeText={debtMode === "months" ? setDebtMonths : setDebtPay}
                />
              </View>
            </View>
            {debtAmtNum > 0 && (
              debtMode === "months" && debtMonthsN > 0 ? (
                <View style={s.debtResult}>
                  <View style={s.debtResultItem}><Text style={s.debtResultLabel}>Pago por quincena</Text><Text style={s.debtResultValue}>{formatCurrency(quincenaPayment)}</Text></View>
                  <View style={s.debtResultItem}><Text style={s.debtResultLabel}>Pago mensual</Text><Text style={s.debtResultValue}>{formatCurrency(quincenaPayment * 2)}</Text></View>
                  <View style={s.debtResultItem}><Text style={s.debtResultLabel}>Quincenas totales</Text><Text style={s.debtResultValue}>{debtMonthsN * 2}</Text></View>
                </View>
              ) : debtMode === "payment" && debtPayN > 0 ? (
                <View style={s.debtResult}>
                  <View style={s.debtResultItem}><Text style={s.debtResultLabel}>Quincenas necesarias</Text><Text style={s.debtResultValue}>{quincenasNeeded}</Text></View>
                  <View style={s.debtResultItem}><Text style={s.debtResultLabel}>Meses aproximados</Text><Text style={s.debtResultValue}>{monthsNeeded}</Text></View>
                  <View style={s.debtResultItem}><Text style={s.debtResultLabel}>Total a pagar</Text><Text style={s.debtResultValue}>{formatCurrency(quincenasNeeded * debtPayN)}</Text></View>
                </View>
              ) : null
            )}
          </>
        )}
      </View>
    </ScrollView>
  )
}

// ── Pantalla principal ─────────────────────────────────────────────────────────

type TabId = "runway" | "escenarios" | "estacionalidad" | "quincena"

const TABS: { id: TabId; label: string; icon: string; desc: string }[] = [
  { id: "runway",         label: "Días restantes",        icon: "time-outline",       desc: "¿Cuánto te dura el saldo?" },
  { id: "escenarios",     label: "¿Qué pasa si…?",        icon: "options-outline",    desc: "Simula reducciones y metas" },
  { id: "estacionalidad", label: "Ciclos anuales",         icon: "calendar-outline",   desc: "Detecta patrones y proyecta" },
  { id: "quincena",       label: "Quincena",               icon: "cash-outline",       desc: "Proyecta ingresos y pagos" },
]

export default function SimulacionesScreen() {
  const [activeTab, setActiveTab] = useState<TabId>("runway")

  const { data: aggregated, isLoading } = useQuery({
    queryKey: ["aggregated"],
    queryFn: () => getAggregatedSummary({}),
  })

  const trend       = aggregated?.monthly_trend ?? []
  const totalMonths = trend.length || 1
  const noData      = !isLoading && (!aggregated || aggregated.total_transactions === 0)

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <Text style={s.title}>Simulaciones</Text>
        <Text style={s.subtitle}>Proyecta escenarios financieros basados en tus datos reales</Text>
      </View>

      {/* Disclaimer */}
      <View style={s.disclaimerBanner}>
        <Ionicons name="flask-outline" size={14} color="#92400e" />
        <Text style={s.disclaimerBannerText}>
          Solo educativo. No es asesoría financiera.
        </Text>
      </View>

      {/* Tab bar */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabBar} contentContainerStyle={s.tabBarContent}>
        {TABS.map(tab => (
          <TouchableOpacity
            key={tab.id}
            style={[s.tabBtn, activeTab === tab.id && s.tabBtnActive]}
            onPress={() => setActiveTab(tab.id)}
          >
            <Ionicons name={tab.icon as any} size={14} color={activeTab === tab.id ? ORANGE : MUTED} />
            <Text style={[s.tabBtnText, activeTab === tab.id && s.tabBtnTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {isLoading ? (
        <ActivityIndicator color={ORANGE} style={{ marginTop: 60 }} size="large" />
      ) : noData ? (
        <View style={s.emptyState}>
          <Ionicons name="flask-outline" size={56} color="#9ca3af" />
          <Text style={s.emptyTitle}>Sin datos aún</Text>
          <Text style={s.emptyText}>Sube un estado de cuenta para habilitar las simulaciones.</Text>
        </View>
      ) : activeTab === "runway" ? (
        <RunwayTab
          trend={trend}
          totalExpenses={aggregated!.total_expenses}
          totalMonths={totalMonths}
        />
      ) : activeTab === "escenarios" ? (
        <EscenariosTab
          categories={aggregated!.categories}
          merchants={aggregated!.top_merchants}
          totalMonths={totalMonths}
        />
      ) : activeTab === "estacionalidad" ? (
        <EstacionalidadTab trend={trend} />
      ) : (
        <QuincenaTab />
      )}
    </SafeAreaView>
  )
}

// ── Estilos ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: BG },
  header:  { backgroundColor: CARD, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: BORDER },
  title:   { color: TEXT, fontSize: 22, fontWeight: "700" },
  subtitle:{ color: "#93afd4", fontSize: 13, marginTop: 2 },

  disclaimerBanner: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#fef3c7", paddingHorizontal: 16, paddingVertical: 8 },
  disclaimerBannerText: { color: "#92400e", fontSize: 12, flex: 1 },

  tabBar:        { backgroundColor: CARD, maxHeight: 52, flexGrow: 0, flexShrink: 0, borderBottomWidth: 1, borderBottomColor: BORDER },
  tabBarContent: { paddingHorizontal: 8, gap: 4, alignItems: "center" },
  tabBtn:        { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 14, borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabBtnActive:  { borderBottomColor: ORANGE },
  tabBtnText:    { fontSize: 12, color: MUTED, fontWeight: "600" },
  tabBtnTextActive: { color: ORANGE },

  tabContent:  { padding: 16, paddingBottom: 48 },

  periodRow:   { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6, marginBottom: 16 },
  periodLabel: { color: MUTED, fontSize: 12, fontWeight: "600" },
  periodBtn:   { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD },
  periodBtnActive: { borderColor: ORANGE, backgroundColor: ORANGE + "15" },
  periodBtnText:   { color: MUTED, fontSize: 12 },

  statsRow:  { flexDirection: "row", gap: 10, marginBottom: 12 },
  statCard:  { flex: 1, backgroundColor: CARD, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: BORDER },
  statLabel: { color: MUTED, fontSize: 11, marginBottom: 4 },
  statValue: { color: TEXT, fontSize: 16, fontWeight: "700" },

  section:       { marginBottom: 12 },
  sectionLabel:  { color: TEXT, fontSize: 13, fontWeight: "700", marginBottom: 8 },
  inputRow:      { flexDirection: "row", alignItems: "center", backgroundColor: CARD, borderRadius: 10, borderWidth: 1, borderColor: BORDER, paddingHorizontal: 14, height: 48 },
  inputPrefix:   { fontSize: 18, color: TEXT, marginRight: 4 },
  input:         { flex: 1, fontSize: 18, color: TEXT, fontWeight: "600" },

  resultCard:    { backgroundColor: CARD, borderRadius: 12, padding: 20, borderLeftWidth: 4, marginBottom: 12, gap: 8 },
  resultLabel:   { fontSize: 13, color: MUTED, fontWeight: "600" },
  resultDays:    { fontSize: 40, fontWeight: "800" },
  statusBadge:   { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4, alignSelf: "flex-start" },
  statusBadgeText: { fontSize: 13, fontWeight: "700" },
  barTrack:      { height: 10, backgroundColor: BORDER, borderRadius: 5, marginBottom: 4, overflow: "hidden" },
  barFill:       { height: "100%", borderRadius: 5 },
  barLabels:     { flexDirection: "row", justifyContent: "space-between", marginBottom: 16 },
  barLabel:      { fontSize: 11, color: DIM },
  alertBox:      { flexDirection: "row", gap: 6, alignItems: "flex-start", backgroundColor: RED + "15", borderRadius: 8, padding: 10, marginBottom: 12 },
  alertText:     { fontSize: 12, flex: 1, lineHeight: 17 },
  breakdownRow:  { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: BORDER },
  breakdownLabel:{ color: MUTED, fontSize: 13 },
  breakdownValue:{ color: TEXT, fontWeight: "700", fontSize: 13 },

  emptyHint:     { backgroundColor: CARD, borderRadius: 10, padding: 20, alignItems: "center", marginBottom: 12 },
  emptyHintText: { color: MUTED, fontSize: 13, textAlign: "center" },
  disclaimer:    { borderRadius: 10, padding: 12, marginTop: 8 },
  disclaimerText:{ color: DIM, fontSize: 12, lineHeight: 18, textAlign: "center" },

  // Cards
  card:        { backgroundColor: CARD, borderRadius: 12, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: BORDER },
  cardTitle:   { color: TEXT, fontSize: 14, fontWeight: "700" },
  cardTitleRow:{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  cardSubtitle:{ color: MUTED, fontSize: 12, marginTop: 2, marginBottom: 8, lineHeight: 17 },

  // Escenarios
  catCard:     { backgroundColor: BG, borderRadius: 10, padding: 12, marginTop: 10, borderWidth: 1, borderColor: BORDER },
  catHeader:   { flexDirection: "row", justifyContent: "space-between", marginBottom: 10 },
  catName:     { fontSize: 13, fontWeight: "700", color: TEXT, textTransform: "capitalize", flex: 1, marginRight: 8 },
  catMonthly:  { fontSize: 12, color: MUTED },
  stepsRow:    { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  stepBtn:     { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1, borderColor: BORDER, backgroundColor: "#111827" },
  stepBtnActive:     { borderColor: ORANGE, backgroundColor: ORANGE + "15" },
  stepBtnText:       { fontSize: 11, color: MUTED, fontWeight: "600" },
  stepBtnTextActive: { color: ORANGE },
  catSaving:   { fontSize: 12, color: GREEN, fontWeight: "600", marginTop: 8 },
  savingsTotal:{ flexDirection: "row", gap: 10, marginTop: 14, backgroundColor: GREEN + "10", borderRadius: 10, padding: 12, borderWidth: 1, borderColor: GREEN + "30" },
  savingsTotalItem: { flex: 1, alignItems: "center" },
  savingsTotalLabel:{ color: GREEN, fontSize: 12 },
  savingsTotalValue:{ color: "#fff", fontSize: 20, fontWeight: "800" },

  // Meta inversa
  metaInput:    { backgroundColor: BG, borderRadius: 8, borderWidth: 1, borderColor: BORDER, color: TEXT, paddingHorizontal: 12, paddingVertical: 9, fontSize: 13, marginBottom: 8 },
  metaRow:      { flexDirection: "row", gap: 8 },
  metaFieldLabel: { color: MUTED, fontSize: 11, marginBottom: 4, fontWeight: "600" },
  goalResult:   { backgroundColor: "#eff6ff", borderRadius: 10, padding: 14, marginTop: 4 },
  goalResultTitle: { color: "#1d4ed8", fontSize: 13, fontWeight: "700", textAlign: "center", marginBottom: 10 },
  goalResultRow:   { flexDirection: "row", gap: 12 },
  goalResultItem:  { flex: 1, alignItems: "center" },
  goalResultLabel: { color: "#3b82f6", fontSize: 11 },
  goalResultValue: { color: "#1e40af", fontSize: 22, fontWeight: "800" },
  goalTotal:       { color: "#3b82f6", fontSize: 12, textAlign: "center", marginTop: 8 },

  // Estacionalidad trend
  trendRow:    { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: BORDER },
  trendLabel:  { color: MUTED, fontSize: 12, width: 52 },
  trendBarWrap:{ flex: 1, height: 8, backgroundColor: BORDER, borderRadius: 4, overflow: "hidden" },
  trendBarFill:{ height: "100%", borderRadius: 4 },
  trendValue:  { color: TEXT, fontSize: 12, fontWeight: "700", width: 68, textAlign: "right" },

  // Quincena
  qForm:       { flexDirection: "row", gap: 6, marginBottom: 10, alignItems: "center" },
  qInput:      { backgroundColor: BG, borderRadius: 8, borderWidth: 1, borderColor: BORDER, color: TEXT, paddingHorizontal: 10, paddingVertical: 8, fontSize: 12 },
  qAddBtn:     { width: 36, height: 36, borderRadius: 8, backgroundColor: GREEN, alignItems: "center", justifyContent: "center" },
  qEmpty:      { color: MUTED, fontSize: 12, textAlign: "center", paddingVertical: 12 },
  qListItem:   { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: BORDER },
  qListLabel:  { color: TEXT, fontSize: 13, fontWeight: "600" },
  qListDate:   { color: MUTED, fontSize: 11, marginTop: 1 },
  qSummary:    { flexDirection: "row", gap: 8, marginTop: 14 },
  qSummaryItem:{ flex: 1, borderWidth: 1, borderRadius: 8, padding: 8, alignItems: "center" },
  qSummaryLabel:{ fontSize: 10, fontWeight: "700", textTransform: "uppercase" },
  qSummaryValue:{ fontSize: 14, fontWeight: "800", marginTop: 2 },
  tlHeader:    { flexDirection: "row", paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: BORDER, marginBottom: 4 },
  tlRow:       { flexDirection: "row", paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: BORDER + "80" },
  tlCell:      { color: MUTED, fontSize: 10, fontWeight: "700", textTransform: "uppercase" },
  tlDate:      { color: MUTED, fontSize: 11 },
  tlLabel:     { color: TEXT, fontSize: 12, fontWeight: "600" },
  tlValue:     { color: TEXT, fontSize: 12, fontWeight: "700" },

  // Debt liquidator
  debtToggle:        { flexDirection: "row", borderRadius: 8, borderWidth: 1, borderColor: BORDER, overflow: "hidden", marginBottom: 12 },
  debtToggleBtn:     { flex: 1, paddingVertical: 8, alignItems: "center" },
  debtToggleBtnActive: { backgroundColor: ORANGE },
  debtToggleBtnText: { color: MUTED, fontSize: 12, fontWeight: "600" },
  debtResult:        { flexDirection: "row", gap: 8, marginTop: 12, backgroundColor: "#3730a320", borderRadius: 10, padding: 12, borderWidth: 1, borderColor: "#6366f130" },
  debtResultItem:    { flex: 1, alignItems: "center" },
  debtResultLabel:   { color: "#a5b4fc", fontSize: 11 },
  debtResultValue:   { color: "#fff", fontSize: 16, fontWeight: "800", marginTop: 2 },

  // Empty state
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40 },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: TEXT, marginTop: 16, marginBottom: 8 },
  emptyText:  { color: MUTED, textAlign: "center", lineHeight: 22 },
})
