/**
 * TwoFactorSetupScreen — Activar 2FA (TOTP) desde la app mobile
 *
 * Flujo:
 *  1. Llama POST /auth/2fa/setup → obtiene { secret, provisioning_uri }
 *  2. Muestra el secreto como texto seleccionable + instrucciones para Google Authenticator
 *  3. Campo OTP de 6 dígitos → POST /auth/2fa/enable → 2FA activado
 *  4. Pantalla de éxito con navegación de regreso
 *
 * Sin librerías de QR nativas — el usuario copia el secreto manualmente.
 */
import { useState, useEffect } from "react"
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, ScrollView, KeyboardAvoidingView,
  Platform, Clipboard,
} from "react-native"
import { useRouter } from "expo-router"
import { SafeAreaView } from "react-native-safe-area-context"
import { Ionicons } from "@expo/vector-icons"
import { setup2FA, enable2FA } from "@safpro/api/auth"
import { useQueryClient } from "@tanstack/react-query"
import type { TwoFactorSetupData } from "@safpro/api/auth"

// ── Design tokens ─────────────────────────────────────────────────────────────
const BG     = "#070c18"
const CARD   = "#0d1426"
const BORDER = "rgba(255,255,255,0.07)"
const TEXT   = "#f1f5f9"
const MUTED  = "rgba(255,255,255,0.45)"
const INDIGO = "#6366f1"
const GREEN  = "#22c55e"
const ORANGE = "#e05c19"

export default function TwoFactorSetupScreen() {
  const router = useRouter()
  const queryClient = useQueryClient()

  const [step, setStep] = useState<"loading" | "setup" | "verify" | "success">("loading")
  const [setupData, setSetupData] = useState<TwoFactorSetupData | null>(null)
  const [otp, setOtp] = useState("")
  const [verifying, setVerifying] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState("")

  // Load setup data on mount
  useEffect(() => {
    setup2FA()
      .then((data) => {
        setSetupData(data)
        setStep("setup")
      })
      .catch((err) => {
        const msg = err?.response?.data?.detail ?? err.message ?? "Error al iniciar setup de 2FA"
        Alert.alert("Error", msg, [{ text: "Volver", onPress: () => router.back() }])
      })
  }, [])

  function handleCopy() {
    if (!setupData) return
    Clipboard.setString(setupData.secret)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  async function handleVerify() {
    if (otp.length !== 6) { setError("El código debe tener 6 dígitos."); return }
    setError("")
    setVerifying(true)
    try {
      await enable2FA(otp)
      queryClient.invalidateQueries({ queryKey: ["me"] })
      setStep("success")
    } catch (err: unknown) {
      const msg = (err as any)?.response?.data?.detail ?? "Código incorrecto. Intenta de nuevo."
      setError(msg)
    } finally {
      setVerifying(false)
    }
  }

  // ── Loading ──
  if (step === "loading") {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.center}>
          <ActivityIndicator color={INDIGO} size="large" />
          <Text style={[s.muted, { marginTop: 16 }]}>Generando secreto TOTP…</Text>
        </View>
      </SafeAreaView>
    )
  }

  // ── Success ──
  if (step === "success") {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.center}>
          <View style={s.successCircle}>
            <Ionicons name="shield-checkmark" size={40} color={GREEN} />
          </View>
          <Text style={s.successTitle}>¡2FA activado!</Text>
          <Text style={s.successSub}>
            Tu cuenta ahora está protegida con autenticación de dos factores.
            En el próximo inicio de sesión se te pedirá el código OTP de 6 dígitos.
          </Text>
          <TouchableOpacity
            style={s.primaryBtn}
            onPress={() => router.back()}
            activeOpacity={0.8}
          >
            <Text style={s.primaryBtnText}>Volver a Mi Cuenta</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    )
  }

  // ── Setup + Verify ──
  return (
    <SafeAreaView style={s.safe} edges={["bottom"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="chevron-back" size={24} color={TEXT} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Activar 2FA</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 20, gap: 18 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Step indicator */}
          <View style={s.stepRow}>
            <StepDot n={1} active={step === "setup"} done={step === "verify"} />
            <View style={s.stepLine} />
            <StepDot n={2} active={step === "verify"} done={false} />
          </View>

          {step === "setup" && (
            <>
              {/* Instructions */}
              <View style={s.card}>
                <Text style={s.cardTitle}>
                  <Ionicons name="phone-portrait-outline" size={15} color={INDIGO} /> Paso 1 — Configura tu app
                </Text>
                <Text style={s.cardText}>
                  Abre <Text style={s.bold}>Google Authenticator</Text>, <Text style={s.bold}>Authy</Text> u otra app compatible con TOTP y agrega una cuenta manualmente.
                </Text>
                <Text style={[s.cardText, { marginTop: 8 }]}>
                  Ingresa la siguiente clave secreta cuando la app te lo solicite:
                </Text>
              </View>

              {/* Secret */}
              <View style={s.secretCard}>
                <Text style={s.secretLabel}>Clave secreta TOTP</Text>
                <TextInput
                  style={s.secretInput}
                  value={setupData?.secret ?? ""}
                  editable={false}
                  selectTextOnFocus
                  multiline
                />
                <TouchableOpacity
                  style={[s.copyBtn, copied && s.copyBtnDone]}
                  onPress={handleCopy}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name={copied ? "checkmark-outline" : "copy-outline"}
                    size={15}
                    color={copied ? GREEN : TEXT}
                  />
                  <Text style={[s.copyBtnText, copied && { color: GREEN }]}>
                    {copied ? "¡Copiado!" : "Copiar clave"}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Issuer hint */}
              <View style={s.hintBox}>
                <Ionicons name="information-circle-outline" size={15} color={MUTED} />
                <Text style={s.hintText}>
                  En la app de autenticación, el emisor aparecerá como <Text style={s.bold}>SAFPRO</Text> y el correo será el de tu cuenta.
                </Text>
              </View>

              <TouchableOpacity
                style={s.primaryBtn}
                onPress={() => setStep("verify")}
                activeOpacity={0.8}
              >
                <Text style={s.primaryBtnText}>Continuar →</Text>
              </TouchableOpacity>
            </>
          )}

          {step === "verify" && (
            <>
              <View style={s.card}>
                <Text style={s.cardTitle}>
                  <Ionicons name="key-outline" size={15} color={INDIGO} /> Paso 2 — Verificar código
                </Text>
                <Text style={s.cardText}>
                  Ingresa el código de 6 dígitos que muestra tu app de autenticación para confirmar que la configuración es correcta.
                </Text>
              </View>

              {/* OTP input */}
              <View style={s.otpWrapper}>
                <TextInput
                  style={s.otpInput}
                  placeholder="000000"
                  placeholderTextColor={MUTED}
                  keyboardType="number-pad"
                  maxLength={6}
                  value={otp}
                  onChangeText={(v) => { setOtp(v.replace(/\D/g, "")); setError("") }}
                  onSubmitEditing={handleVerify}
                  autoFocus
                />
              </View>

              {error ? (
                <View style={s.errorBox}>
                  <Ionicons name="alert-circle-outline" size={15} color="#fca5a5" />
                  <Text style={s.errorText}>{error}</Text>
                </View>
              ) : null}

              <TouchableOpacity
                style={[s.primaryBtn, (verifying || otp.length !== 6) && { opacity: 0.55 }]}
                onPress={handleVerify}
                disabled={verifying || otp.length !== 6}
                activeOpacity={0.8}
              >
                {verifying
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={s.primaryBtnText}>Activar 2FA</Text>
                }
              </TouchableOpacity>

              <TouchableOpacity
                style={s.backLink}
                onPress={() => { setStep("setup"); setOtp(""); setError("") }}
                activeOpacity={0.7}
              >
                <Ionicons name="chevron-back" size={13} color={MUTED} />
                <Text style={s.backLinkText}>Volver al paso anterior</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

// ── StepDot helper ────────────────────────────────────────────────────────────
function StepDot({ n, active, done }: { n: number; active: boolean; done: boolean }) {
  const bg = done ? INDIGO : active ? INDIGO : "rgba(255,255,255,0.1)"
  const textColor = (active || done) ? "#fff" : MUTED
  return (
    <View style={[s.stepDot, { backgroundColor: bg }]}>
      {done
        ? <Ionicons name="checkmark" size={12} color="#fff" />
        : <Text style={[s.stepDotText, { color: textColor }]}>{n}</Text>
      }
    </View>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: BG },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  muted:  { color: MUTED, fontSize: 14 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: CARD,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  headerTitle: { fontSize: 17, fontWeight: "700", color: TEXT },

  // Step indicator
  stepRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 4,
  },
  stepDot: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: "center", justifyContent: "center",
  },
  stepDotText: { fontSize: 13, fontWeight: "700" },
  stepLine: {
    height: 2,
    width: 48,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 1,
  },

  // Cards
  card: {
    backgroundColor: CARD,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: BORDER,
    gap: 6,
  },
  cardTitle: { fontSize: 14, fontWeight: "700", color: TEXT, marginBottom: 4 },
  cardText:  { color: MUTED, fontSize: 14, lineHeight: 20 },
  bold:      { color: TEXT, fontWeight: "700" },

  // Secret
  secretCard: {
    backgroundColor: CARD,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(99,102,241,0.3)",
    gap: 10,
  },
  secretLabel: { fontSize: 11, fontWeight: "700", color: MUTED, textTransform: "uppercase", letterSpacing: 0.5 },
  secretInput: {
    backgroundColor: BG,
    borderRadius: 8,
    padding: 12,
    color: "#a5b4fc",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    fontSize: 15,
    letterSpacing: 1,
    borderWidth: 1,
    borderColor: BORDER,
    lineHeight: 22,
  },
  copyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignSelf: "flex-start" as const,
  },
  copyBtnDone:    { borderColor: "rgba(34,197,94,0.3)", backgroundColor: "rgba(34,197,94,0.07)" },
  copyBtnText:    { color: TEXT, fontSize: 13, fontWeight: "600" },

  // Hint
  hintBox: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: 10,
    padding: 12,
  },
  hintText: { color: MUTED, fontSize: 13, flex: 1, lineHeight: 18 },

  // OTP
  otpWrapper: { alignItems: "center" },
  otpInput: {
    backgroundColor: CARD,
    borderWidth: 2,
    borderColor: INDIGO,
    borderRadius: 14,
    paddingHorizontal: 28,
    paddingVertical: 18,
    color: TEXT,
    fontSize: 32,
    fontWeight: "700",
    letterSpacing: 10,
    textAlign: "center",
    width: "100%",
  },

  // Error
  errorBox: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    backgroundColor: "rgba(239,68,68,0.08)",
    borderRadius: 10,
    padding: 12,
  },
  errorText: { color: "#fca5a5", fontSize: 13, flex: 1 },

  // Primary button
  primaryBtn: {
    backgroundColor: INDIGO,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },

  // Back link
  backLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 8,
  },
  backLinkText: { color: MUTED, fontSize: 13 },

  // Success
  successCircle: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: "rgba(34,197,94,0.12)",
    alignItems: "center", justifyContent: "center",
    marginBottom: 20,
  },
  successTitle: { fontSize: 24, fontWeight: "700", color: TEXT, marginBottom: 12, textAlign: "center" },
  successSub:   { color: MUTED, fontSize: 14, lineHeight: 22, textAlign: "center", marginBottom: 32, paddingHorizontal: 8 },
})
