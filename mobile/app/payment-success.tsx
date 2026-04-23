/**
 * PaymentSuccessScreen — Pantalla de confirmación post-pago.
 *
 * Ruta: /payment-success  (fuera de (tabs))
 * Activada por: deep link safpro://payment-success
 *   → PayPal redirige a este deep link tras completar el pago en el browser.
 *
 * Responsabilidades:
 *   1. Invalidar ["me"] → re-fetch del usuario con el nuevo plan "pro"
 *   2. Invalidar ["billing-status"] → re-fetch del estado de suscripción
 *   3. Mostrar confirmación visual animada
 *   4. Permitir al usuario navegar al Dashboard
 *
 * Nota: el plan en DB se actualiza via webhook de PayPal (asíncrono).
 *   El re-fetch puede mostrar "free" por unos segundos hasta que el webhook
 *   llegue. El banner en esta pantalla lo explica al usuario.
 */
import { useEffect, useRef } from "react"
import {
  View, Text, StyleSheet, TouchableOpacity, Animated, Easing,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useRouter } from "expo-router"
import { useQueryClient } from "@tanstack/react-query"
import { Ionicons } from "@expo/vector-icons"

// ── Design tokens ─────────────────────────────────────────────────────────────
const BG     = "#070c18"
const CARD   = "#0d1426"
const BORDER = "rgba(255,255,255,0.07)"
const TEXT   = "#f1f5f9"
const MUTED  = "rgba(255,255,255,0.45)"
const INDIGO = "#6366f1"
const ORANGE = "#e05c19"
const GREEN  = "#22c55e"
const GOLD   = "#fbbf24"

// ── PaymentSuccessScreen ──────────────────────────────────────────────────────
export default function PaymentSuccessScreen() {
  const router       = useRouter()
  const queryClient  = useQueryClient()

  // Animaciones
  const scaleAnim   = useRef(new Animated.Value(0)).current
  const opacityAnim = useRef(new Animated.Value(0)).current
  const slideAnim   = useRef(new Animated.Value(30)).current

  useEffect(() => {
    // Invalidar queries para reflejar el nuevo plan
    queryClient.invalidateQueries({ queryKey: ["me"] })
    queryClient.invalidateQueries({ queryKey: ["billing-status"] })

    // Animación de entrada
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 450,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start()
  }, [])

  return (
    <SafeAreaView style={s.safe} edges={["top", "bottom"]}>
      <View style={s.container}>

        {/* Ícono animado */}
        <Animated.View
          style={[
            s.iconCircle,
            { transform: [{ scale: scaleAnim }], opacity: opacityAnim },
          ]}
        >
          <Ionicons name="checkmark" size={56} color={GREEN} />
        </Animated.View>

        {/* Texto principal */}
        <Animated.View
          style={{ opacity: opacityAnim, transform: [{ translateY: slideAnim }] }}
        >
          <Text style={s.title}>¡Pago recibido!</Text>
          <Text style={s.subtitle}>
            Tu suscripción Pro está siendo procesada.{"\n"}
            El plan se activará en unos segundos.
          </Text>

          {/* Banner informativo sobre el webhook */}
          <View style={s.infoBanner}>
            <Ionicons name="time-outline" size={18} color={GOLD} />
            <Text style={s.infoText}>
              PayPal confirma el pago en segundo plano. Si tu plan no se refleja inmediatamente, espera unos segundos y recarga la app.
            </Text>
          </View>

          {/* Detalles */}
          <View style={s.detailsCard}>
            {[
              { icon: "flash",            color: GOLD,   label: "Plan Pro activado",           desc: "Archivos ilimitados y todas las funciones" },
              { icon: "shield-checkmark", color: GREEN,  label: "Garantía de reembolso",        desc: "7 días sin preguntas — admin@safpro.us" },
              { icon: "lock-closed",      color: INDIGO, label: "Datos seguros",                desc: "Sin credenciales bancarias almacenadas" },
            ].map(({ icon, color, label, desc }) => (
              <View key={label} style={s.detailRow}>
                <View style={[s.detailIconBox, { backgroundColor: `${color}18` }]}>
                  <Ionicons name={icon as any} size={18} color={color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.detailLabel}>{label}</Text>
                  <Text style={s.detailDesc}>{desc}</Text>
                </View>
              </View>
            ))}
          </View>

          {/* CTA */}
          <TouchableOpacity
            style={s.ctaBtn}
            onPress={() => router.replace("/(tabs)/dashboard")}
            activeOpacity={0.85}
          >
            <Ionicons name="home" size={18} color="#fff" />
            <Text style={s.ctaBtnText}>Ir al Dashboard</Text>
          </TouchableOpacity>

          {/* Link de soporte */}
          <Text style={s.supportText}>
            ¿Problemas con tu pago?{" "}
            <Text
              style={{ color: INDIGO }}
              onPress={() => {
                const subject = encodeURIComponent("Problema con mi pago Pro")
                const body    = encodeURIComponent("Hola, acabo de intentar suscribirme al Plan Pro y tuve el siguiente problema:\n\n")
                const url     = `mailto:admin@safpro.us?subject=${subject}&body=${body}`
                // Linking importado inline para no romper el import principal
                const { Linking } = require("react-native")
                Linking.openURL(url)
              }}
            >
              Escríbenos
            </Text>
          </Text>
        </Animated.View>
      </View>
    </SafeAreaView>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: BG },
  container: {
    flex: 1, alignItems: "center", justifyContent: "center",
    paddingHorizontal: 24, paddingVertical: 32,
  },

  // Ícono
  iconCircle: {
    width: 120, height: 120, borderRadius: 60,
    backgroundColor: "rgba(34,197,94,0.12)",
    borderWidth: 2, borderColor: "rgba(34,197,94,0.3)",
    alignItems: "center", justifyContent: "center",
    marginBottom: 28,
    shadowColor: GREEN, shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4, shadowRadius: 20, elevation: 8,
  },

  // Texto
  title: {
    color: TEXT, fontSize: 28, fontWeight: "900",
    textAlign: "center", marginBottom: 10,
  },
  subtitle: {
    color: MUTED, fontSize: 14, textAlign: "center",
    lineHeight: 21, marginBottom: 20,
  },

  // Banner info
  infoBanner: {
    flexDirection: "row", gap: 10, alignItems: "flex-start",
    backgroundColor: "rgba(251,191,36,0.08)", borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: "rgba(251,191,36,0.2)", marginBottom: 20,
  },
  infoText: { color: "rgba(251,191,36,0.8)", fontSize: 12, lineHeight: 17, flex: 1 },

  // Detalles
  detailsCard: {
    backgroundColor: CARD, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: BORDER, gap: 14, marginBottom: 24, width: "100%",
  },
  detailRow:     { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  detailIconBox: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  detailLabel:   { color: TEXT, fontWeight: "700", fontSize: 13, marginBottom: 2 },
  detailDesc:    { color: MUTED, fontSize: 12, lineHeight: 16 },

  // CTA
  ctaBtn: {
    backgroundColor: ORANGE, borderRadius: 14,
    paddingVertical: 16, flexDirection: "row", alignItems: "center",
    justifyContent: "center", gap: 8, width: "100%", marginBottom: 16,
  },
  ctaBtnText: { color: "#fff", fontWeight: "800", fontSize: 16 },

  // Soporte
  supportText: {
    color: MUTED, fontSize: 13, textAlign: "center", lineHeight: 18,
  },
})
