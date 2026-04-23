/**
 * UpgradeScreen — Pantalla completa de precios y upgrade a Plan Pro.
 *
 * Ruta: /upgrade  (fuera de (tabs) — pantalla modal full-screen)
 *
 * Flujo:
 *   1. Usuario ve tabla comparativa Free vs Pro
 *   2. Elige intervalo (mensual / anual)
 *   3. Toca "Suscribirse" → POST /billing/create-checkout-session
 *   4. Backend devuelve checkout_url → abre en browser con Linking.openURL
 *   5. Procesador redirige a safpro://payment-success → pantalla de confirmación
 *   6. Webhook notifica al backend → plan actualizado a "pro"
 *
 * Precios dinámicos: se derivan de GET /billing/status (available_processor).
 *   PayPal:   $6.50/mes · $56/año  (cubre comisiones ~3.5% + ITBMS 7%)
 *   dLocalGo: $5.00/mes · $45/año
 */
import { useState } from "react"
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Alert, ActivityIndicator, Linking,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useRouter } from "expo-router"
import { useQuery } from "@tanstack/react-query"
import { Ionicons } from "@expo/vector-icons"
import { getMe } from "@safpro/api/users"
import {
  getBillingStatus, createCheckoutSession, getPrices,
} from "@safpro/api/billing"

// ── Design tokens ─────────────────────────────────────────────────────────────
const BG     = "#070c18"
const CARD   = "#0d1426"
const NAVY   = "#1c2b4b"
const BORDER = "rgba(255,255,255,0.07)"
const TEXT   = "#f1f5f9"
const MUTED  = "rgba(255,255,255,0.45)"
const DIM    = "rgba(255,255,255,0.25)"
const INDIGO = "#6366f1"
const ORANGE = "#e05c19"
const GREEN  = "#22c55e"
const GOLD   = "#fbbf24"

// ── Deep link de retorno post-pago ────────────────────────────────────────────
const PAYMENT_RETURN_URL = "safpro://payment-success"

// ── Feature lists ─────────────────────────────────────────────────────────────
const FREE_FEATURES = [
  { icon: "checkmark-circle", text: "Hasta 5 archivos subidos" },
  { icon: "checkmark-circle", text: "Todos los bancos (BG, BAC, Banistmo, Banesco, Credicorp)" },
  { icon: "checkmark-circle", text: "Categorización automática con IA" },
  { icon: "checkmark-circle", text: "Knowledge Base personal" },
  { icon: "checkmark-circle", text: "Metas de ahorro y billeteras" },
]

const PRO_FEATURES = [
  { icon: "flash",            text: "Archivos ilimitados" },
  { icon: "flash",            text: "Historial financiero completo" },
  { icon: "flash",            text: "Knowledge Base avanzado (sin límite)" },
  { icon: "flash",            text: "Simulaciones y planificador de quincena" },
  { icon: "flash",            text: "Presupuesto personalizado 50/30/20" },
  { icon: "flash",            text: "Análisis de estacionalidad y runway" },
  { icon: "flash",            text: "Soporte prioritario" },
]

// ── FAQ data ──────────────────────────────────────────────────────────────────
const FAQ_ITEMS_PAYPAL = [
  {
    q: "¿Por qué el precio es $6.50 y no $5?",
    a: "PayPal cobra una comisión de procesamiento (~3.49% + $0.49 por transacción) más el ITBMS del 7% que aplica en Panamá. El precio de $6.50 está calculado para que SAFPRO sea sostenible después de esas deducciones. El costo neto equivale a $5/mes.",
    highlight: true,
  },
  {
    q: "¿Tienen política de reembolsos?",
    a: "Sí. Plan mensual: reembolso completo si lo solicitas dentro de los 7 días de tu primer pago — sin preguntas. Escríbenos a admin@safpro.us con el asunto \"Reembolso\". Plan anual: no reembolsable una vez procesado.",
  },
  {
    q: "¿Qué pasa con mis datos si cancelo?",
    a: "Tus análisis e historial se conservan. Pasas al plan Gratis con límite de 5 archivos. No se borra nada.",
  },
  {
    q: "¿Cómo cancelo mi suscripción?",
    a: "Escríbenos a admin@safpro.us con el asunto \"Cancelar suscripción\" y lo procesamos en menos de 24 horas. También puedes cancelar directamente desde tu cuenta PayPal.",
  },
  {
    q: "¿Puedo cambiar de mensual a anual?",
    a: "Cancela el plan actual y suscríbete al anual. Si estás dentro de los 7 días de reembolso del mes ya pagado, solicítalo a admin@safpro.us.",
  },
  {
    q: "¿SAFPRO guarda mis credenciales bancarias?",
    a: "No. Nunca pedimos acceso a tu banca en línea. Solo subes el Excel que tú exportas desde tu banco. Tus credenciales bancarias nunca pasan por SAFPRO.",
  },
]

const FAQ_ITEMS_DLOCALGO = [
  {
    q: "¿Tienen política de reembolsos?",
    a: "Sí. Plan mensual: reembolso completo si lo solicitas dentro de los 7 días de tu primer pago — sin preguntas. Escríbenos a admin@safpro.us con el asunto \"Reembolso\". Plan anual: no reembolsable una vez procesado.",
  },
  {
    q: "¿Qué pasa con mis datos si cancelo?",
    a: "Tus análisis e historial se conservan. Pasas al plan Gratis con límite de 5 archivos. No se borra nada.",
  },
  {
    q: "¿Cómo cancelo mi suscripción?",
    a: "Escríbenos a admin@safpro.us con el asunto \"Cancelar suscripción\" y lo procesamos en menos de 24 horas.",
  },
  {
    q: "¿Puedo cambiar de mensual a anual?",
    a: "Cancela el plan actual y suscríbete al anual. Si estás dentro de los 7 días de reembolso del mes ya pagado, solicítalo a admin@safpro.us.",
  },
  {
    q: "¿SAFPRO guarda mis credenciales bancarias?",
    a: "No. Nunca pedimos acceso a tu banca en línea. Solo subes el Excel que tú exportas desde tu banco. Tus credenciales bancarias nunca pasan por SAFPRO.",
  },
]

// ── FAQ Item colapsable ───────────────────────────────────────────────────────
function FaqItem({ q, a, highlight }: { q: string; a: string; highlight?: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <TouchableOpacity
      style={[s.faqItem, highlight && s.faqItemHighlight]}
      onPress={() => setOpen(v => !v)}
      activeOpacity={0.8}
    >
      <View style={s.faqRow}>
        <Text style={[s.faqQ, highlight && s.faqQHighlight]} numberOfLines={open ? undefined : 2}>
          {q}
        </Text>
        <Ionicons
          name={open ? "chevron-up" : "chevron-down"}
          size={16}
          color={highlight ? GOLD : MUTED as string}
        />
      </View>
      {open && (
        <Text style={s.faqA}>{a}</Text>
      )}
    </TouchableOpacity>
  )
}

// ── UpgradeScreen ─────────────────────────────────────────────────────────────
export default function UpgradeScreen() {
  const router  = useRouter()
  const [billingInterval, setBillingInterval] = useState<"monthly" | "annual">("monthly")
  const [loading, setLoading] = useState(false)

  const { data: user } = useQuery({ queryKey: ["me"], queryFn: getMe })
  const { data: billingStatus } = useQuery({
    queryKey: ["billing-status"],
    queryFn: getBillingStatus,
    staleTime: 30_000,
  })

  const plan  = user?.plan ?? "free"
  const isPro = plan === "pro"
  const isFF  = plan === "friends_and_family"

  // ── Precios dinámicos según procesador activo ──────────────────────────────
  const prices = getPrices(billingStatus?.available_processor ?? null)
  const monthlyPrice   = prices.monthly
  const annualPrice    = prices.annual
  const annualMonthly  = (annualPrice / 12).toFixed(2)
  const annualDiscount = prices.annualDiscountPct

  const processorLabel = billingStatus?.available_processor === "dlocalgo" ? "tarjeta o efectivo" : "PayPal"
  const faqItems = billingStatus?.available_processor === "dlocalgo"
    ? FAQ_ITEMS_DLOCALGO
    : FAQ_ITEMS_PAYPAL

  async function handleCheckout() {
    setLoading(true)
    try {
      const { checkout_url } = await createCheckoutSession(
        billingInterval,
        PAYMENT_RETURN_URL,   // ← deep link de retorno: safpro://payment-success
      )
      await Linking.openURL(checkout_url)
    } catch {
      Alert.alert(
        "Error al iniciar pago",
        "No se pudo conectar con el servidor de pagos. Verifica tu conexión e intenta de nuevo.",
        [{ text: "OK" }]
      )
    } finally {
      setLoading(false)
    }
  }

  const displayPrice  = billingInterval === "monthly"
    ? `$${monthlyPrice.toFixed(2)}`
    : `$${annualMonthly}`
  const displayPeriod = "/mes"
  const displaySub    = billingInterval === "annual"
    ? `Facturado $${annualPrice}/año — ahorras ${annualDiscount}%`
    : "Facturado mensualmente · Cancela cuando quieras"

  return (
    <SafeAreaView style={s.safe} edges={["top", "bottom"]}>

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={22} color={TEXT} />
        </TouchableOpacity>
        <View style={s.headerTitle}>
          <Ionicons name="star" size={18} color={GOLD} />
          <Text style={s.headerText}>Planes SAFPRO</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.scroll}
      >

        {/* Título */}
        <Text style={s.title}>Elige tu plan</Text>
        <Text style={s.subtitle}>
          Empieza gratis y actualiza cuando estés listo.{"\n"}
          Nunca pedimos credenciales bancarias.
        </Text>

        {/* Banner: ya eres Pro */}
        {isPro && (
          <View style={s.bannerPro}>
            <Ionicons name="star" size={20} color={GOLD} />
            <View style={{ flex: 1 }}>
              <Text style={s.bannerProTitle}>Tienes el Plan Pro activo</Text>
              <Text style={s.bannerProSub}>Gracias por apoyar SAFPRO 🙏</Text>
            </View>
          </View>
        )}

        {/* Banner: Friends & Family */}
        {isFF && (
          <View style={s.bannerFF}>
            <Ionicons name="people" size={18} color="#a78bfa" />
            <View style={{ flex: 1 }}>
              <Text style={s.bannerFFTitle}>Acceso Friends & Family activo</Text>
              <Text style={s.bannerFFSub}>
                Tienes acceso completo durante el beta. Suscríbete al Pro para mantenerlo cuando el período termine.
              </Text>
            </View>
          </View>
        )}

        {/* Toggle mensual / anual */}
        {!isPro && (
          <View style={s.toggle}>
            <TouchableOpacity
              style={[s.toggleBtn, billingInterval === "monthly" && s.toggleBtnActive]}
              onPress={() => setBillingInterval("monthly")}
              activeOpacity={0.8}
            >
              <Text style={[s.toggleText, billingInterval === "monthly" && s.toggleTextActive]}>
                Mensual
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.toggleBtn, billingInterval === "annual" && s.toggleBtnActive]}
              onPress={() => setBillingInterval("annual")}
              activeOpacity={0.8}
            >
              <Text style={[s.toggleText, billingInterval === "annual" && s.toggleTextActive]}>
                Anual
              </Text>
              <View style={s.discountBadge}>
                <Text style={s.discountBadgeText}>−{annualDiscount}%</Text>
              </View>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Tarjeta Plan Gratis ── */}
        <View style={s.card}>
          <Text style={s.planLabel}>Plan Gratis</Text>
          <View style={s.priceRow}>
            <Text style={s.priceAmount}>$0</Text>
            <Text style={s.pricePeriod}>/mes</Text>
          </View>
          <Text style={s.planDesc}>Para empezar y probar el sistema.</Text>

          <View style={s.divider} />

          {FREE_FEATURES.map((f) => (
            <View key={f.text} style={s.featureRow}>
              <Ionicons name="checkmark-circle" size={16} color={GREEN} />
              <Text style={s.featureText}>{f.text}</Text>
            </View>
          ))}

          {plan === "free" && (
            <View style={s.currentPlanBadge}>
              <Text style={s.currentPlanText}>Plan actual</Text>
            </View>
          )}
        </View>

        {/* ── Tarjeta Plan Pro ── */}
        <View style={s.cardPro}>
          <View style={s.recommendedBadge}>
            <Text style={s.recommendedText}>Recomendado</Text>
          </View>

          <Text style={s.planLabelPro}>Plan Pro</Text>
          <View style={s.priceRow}>
            <Text style={s.priceAmountPro}>{displayPrice}</Text>
            <Text style={s.pricePeriodPro}>{displayPeriod}</Text>
            {billingInterval === "annual" && (
              <Text style={s.priceAnnualNote}>(${annualPrice}/año)</Text>
            )}
          </View>
          <Text style={s.planDescPro}>{displaySub}</Text>

          <View style={[s.divider, { borderBottomColor: "rgba(255,255,255,0.1)" }]} />

          {PRO_FEATURES.map((f) => (
            <View key={f.text} style={s.featureRow}>
              <Ionicons name="flash" size={16} color={GOLD} />
              <Text style={[s.featureText, { color: "rgba(255,255,255,0.85)" }]}>{f.text}</Text>
            </View>
          ))}

          {isPro ? (
            <View style={s.currentPlanBadgePro}>
              <Text style={s.currentPlanTextPro}>✓ Plan activo</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={[s.ctaBtn, loading && { opacity: 0.6 }]}
              onPress={handleCheckout}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="flash" size={16} color="#fff" />
                  <Text style={s.ctaBtnText}>
                    Suscribirse — Plan Pro
                  </Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>

        {/* ── Garantías ── */}
        <Text style={s.sectionLabel}>GARANTÍAS</Text>
        <View style={s.guaranteesRow}>
          {[
            { icon: "lock-closed",      color: GREEN,  label: "Sin credenciales bancarias",  desc: "Solo tu Excel exportado" },
            { icon: "close-circle",     color: INDIGO, label: "Cancela cuando quieras",       desc: "Sin permanencia ni penalizaciones" },
            { icon: "shield-checkmark", color: ORANGE, label: `Pagos con ${processorLabel}`,  desc: "Visa, Mastercard y cuenta PayPal" },
          ].map(({ icon, color, label, desc }) => (
            <View key={label} style={s.guaranteeCard}>
              <Ionicons name={icon as any} size={22} color={color} />
              <Text style={s.guaranteeLabel}>{label}</Text>
              <Text style={s.guaranteeDesc}>{desc}</Text>
            </View>
          ))}
        </View>

        {/* ── Política de reembolso (destacada) ── */}
        <View style={s.refundBox}>
          <Ionicons name="refresh-circle" size={20} color={GREEN} />
          <View style={{ flex: 1 }}>
            <Text style={s.refundTitle}>Garantía de reembolso — 7 días</Text>
            <Text style={s.refundDesc}>
              Plan mensual: si no quedas satisfecho dentro de los primeros 7 días de tu primer pago, te devolvemos el 100%. Sin preguntas.{"\n"}
              Escríbenos a{" "}
              <Text
                style={{ color: INDIGO }}
                onPress={() => Linking.openURL("mailto:admin@safpro.us?subject=Reembolso")}
              >
                admin@safpro.us
              </Text>
              {" "}con el asunto "Reembolso".
            </Text>
          </View>
        </View>

        {/* ── FAQ ── */}
        <Text style={s.sectionLabel}>PREGUNTAS FRECUENTES</Text>
        <View style={s.faqContainer}>
          {faqItems.map((item) => (
            <FaqItem key={item.q} {...item} />
          ))}
        </View>

        {/* Footer legal */}
        <Text style={s.legalFooter}>
          Al suscribirte aceptas los{" "}
          <Text
            style={{ color: INDIGO }}
            onPress={() => Linking.openURL("https://safpro.us/terms")}
          >
            Términos de Servicio
          </Text>
          {" "}y la{" "}
          <Text
            style={{ color: INDIGO }}
            onPress={() => Linking.openURL("https://safpro.us/privacy")}
          >
            Política de Privacidad
          </Text>
          {" "}de SAFPRO. El precio incluye ITBMS (7%) y comisiones de procesamiento.
        </Text>

      </ScrollView>
    </SafeAreaView>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: BG },
  scroll: { paddingHorizontal: 16, paddingBottom: 48 },

  // Header
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: CARD, borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  backBtn:    { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: "rgba(255,255,255,0.06)" },
  headerTitle:{ flexDirection: "row", alignItems: "center", gap: 6 },
  headerText: { color: TEXT, fontWeight: "700", fontSize: 16 },

  // Intro
  title:    { color: TEXT, fontSize: 26, fontWeight: "800", textAlign: "center", marginTop: 24, marginBottom: 6 },
  subtitle: { color: MUTED, fontSize: 13, textAlign: "center", lineHeight: 20, marginBottom: 20 },

  // Banners
  bannerPro: {
    flexDirection: "row", gap: 12, alignItems: "center",
    backgroundColor: "rgba(28,43,75,0.8)", borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: "rgba(251,191,36,0.3)", marginBottom: 16,
  },
  bannerProTitle: { color: TEXT, fontWeight: "700", fontSize: 14 },
  bannerProSub:   { color: MUTED, fontSize: 12, marginTop: 2 },
  bannerFF: {
    flexDirection: "row", gap: 12, alignItems: "flex-start",
    backgroundColor: "rgba(99,102,241,0.12)", borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: "rgba(99,102,241,0.3)", marginBottom: 16,
  },
  bannerFFTitle: { color: "#c4b5fd", fontWeight: "700", fontSize: 14 },
  bannerFFSub:   { color: MUTED, fontSize: 12, lineHeight: 17, marginTop: 2 },

  // Toggle
  toggle: {
    flexDirection: "row", gap: 8, alignSelf: "center",
    backgroundColor: CARD, borderRadius: 50, padding: 4,
    borderWidth: 1, borderColor: BORDER, marginBottom: 16,
  },
  toggleBtn:       { paddingHorizontal: 20, paddingVertical: 8, borderRadius: 50, position: "relative" },
  toggleBtnActive: { backgroundColor: NAVY },
  toggleText:      { color: MUTED, fontWeight: "600", fontSize: 14 },
  toggleTextActive:{ color: TEXT },
  discountBadge: {
    position: "absolute", top: -8, right: -4,
    backgroundColor: ORANGE, borderRadius: 20,
    paddingHorizontal: 5, paddingVertical: 1,
  },
  discountBadgeText: { color: "#fff", fontSize: 9, fontWeight: "800" },

  // Plan cards
  card: {
    backgroundColor: CARD, borderRadius: 18, padding: 20,
    borderWidth: 1, borderColor: BORDER, marginBottom: 12,
  },
  cardPro: {
    borderRadius: 18, padding: 20, marginBottom: 20,
    backgroundColor: NAVY, borderWidth: 1.5, borderColor: INDIGO,
    shadowColor: INDIGO, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25, shadowRadius: 16, elevation: 8,
    position: "relative", overflow: "visible",
  },
  recommendedBadge: {
    position: "absolute", top: -12, right: 16,
    backgroundColor: ORANGE, borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 4,
    zIndex: 10,
  },
  recommendedText: { color: "#fff", fontSize: 11, fontWeight: "800" },

  planLabel:     { color: MUTED, fontSize: 11, fontWeight: "700", letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 6 },
  planLabelPro:  { color: "rgba(165,180,252,0.7)", fontSize: 11, fontWeight: "700", letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 6 },
  priceRow:      { flexDirection: "row", alignItems: "baseline", gap: 4, marginBottom: 4 },
  priceAmount:   { color: TEXT, fontSize: 40, fontWeight: "900" },
  priceAmountPro:{ color: "#fff", fontSize: 40, fontWeight: "900" },
  pricePeriod:   { color: MUTED, fontSize: 14 },
  pricePeriodPro:{ color: "rgba(255,255,255,0.45)", fontSize: 14 },
  priceAnnualNote: { color: "rgba(255,255,255,0.3)", fontSize: 12, marginLeft: 2 },
  planDesc:      { color: MUTED, fontSize: 12, marginBottom: 4 },
  planDescPro:   { color: "rgba(255,255,255,0.45)", fontSize: 12, marginBottom: 4 },

  divider:       { borderBottomWidth: 1, borderBottomColor: BORDER, marginVertical: 14 },

  featureRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 8 },
  featureText:{ color: MUTED, fontSize: 13, flex: 1, lineHeight: 18 },

  currentPlanBadge:     { backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 10, paddingVertical: 10, alignItems: "center", marginTop: 8 },
  currentPlanText:      { color: MUTED, fontSize: 13, fontWeight: "600" },
  currentPlanBadgePro:  { backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 10, paddingVertical: 10, alignItems: "center", marginTop: 12 },
  currentPlanTextPro:   { color: "rgba(255,255,255,0.6)", fontSize: 13, fontWeight: "600" },

  ctaBtn: {
    backgroundColor: ORANGE, borderRadius: 12,
    paddingVertical: 14, flexDirection: "row", alignItems: "center",
    justifyContent: "center", gap: 8, marginTop: 12,
  },
  ctaBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },

  // Garantías
  sectionLabel: { color: DIM as string, fontSize: 10, fontWeight: "700", letterSpacing: 1.4, textTransform: "uppercase", marginBottom: 10, marginTop: 4 },
  guaranteesRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  guaranteeCard: {
    flex: 1, backgroundColor: CARD, borderRadius: 14, padding: 12,
    alignItems: "center", gap: 6, borderWidth: 1, borderColor: BORDER,
  },
  guaranteeLabel: { color: TEXT, fontSize: 11, fontWeight: "700", textAlign: "center", lineHeight: 14 },
  guaranteeDesc:  { color: MUTED, fontSize: 10, textAlign: "center", lineHeight: 13 },

  // Refund box
  refundBox: {
    flexDirection: "row", gap: 12, alignItems: "flex-start",
    backgroundColor: "rgba(34,197,94,0.07)", borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: "rgba(34,197,94,0.2)", marginBottom: 20,
  },
  refundTitle: { color: TEXT, fontWeight: "700", fontSize: 13, marginBottom: 4 },
  refundDesc:  { color: MUTED, fontSize: 12, lineHeight: 18 },

  // FAQ
  faqContainer: { gap: 8, marginBottom: 24 },
  faqItem: {
    backgroundColor: CARD, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: BORDER,
  },
  faqItemHighlight: {
    backgroundColor: "rgba(251,191,36,0.06)",
    borderColor: "rgba(251,191,36,0.25)",
  },
  faqRow:      { flexDirection: "row", alignItems: "flex-start", gap: 8, justifyContent: "space-between" },
  faqQ:        { color: TEXT, fontWeight: "600", fontSize: 13, flex: 1, lineHeight: 18 },
  faqQHighlight: { color: GOLD },
  faqA:        { color: MUTED, fontSize: 12, lineHeight: 18, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: BORDER },

  // Footer legal
  legalFooter: {
    color: DIM as string, fontSize: 11, textAlign: "center", lineHeight: 16,
    marginTop: 4, marginBottom: 8,
  },
})
