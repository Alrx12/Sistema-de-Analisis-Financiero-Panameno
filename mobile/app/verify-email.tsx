/**
 * VerifyEmailScreen — Deep link handler
 * Ruta: /verify-email   (safpro://verify-email?token=TOKEN)
 *
 * Cuando el usuario toca el enlace de verificación en su email,
 * esta pantalla recibe el token, llama a la API y muestra el resultado.
 *
 * Deep link custom scheme: safpro://verify-email?token=TOKEN
 * (configurado en app.json via scheme: "safpro")
 */
import { useEffect, useState } from "react"
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, Platform,
} from "react-native"
import { useLocalSearchParams, useRouter } from "expo-router"
import { verifyEmail } from "@safpro/api/auth"

type Status = "loading" | "success" | "error"

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "https://safpro.us/api/v1"

// ── Design tokens ─────────────────────────────────────────────────────────────
const BG     = "#070c18"
const CARD   = "#0d1426"
const BORDER = "rgba(255,255,255,0.09)"
const WHITE  = "#ffffff"
const INDIGO = "#6366f1"
const ORANGE = "#e05c19"
const MUTED  = "#64748b"
const TEXT   = "#e2e8f0"
const GREEN  = "#22c55e"
const RED    = "#ef4444"

export default function VerifyEmailScreen() {
  const router = useRouter()
  const { token } = useLocalSearchParams<{ token?: string }>()

  const [status,  setStatus]  = useState<Status>("loading")
  const [message, setMessage] = useState("")

  useEffect(() => {
    if (!token) {
      setStatus("error")
      setMessage("No se encontró el token de verificación en el enlace.")
      return
    }

    verifyEmail(API_URL, token as string)
      .then((res: { message: string }) => {
        setStatus("success")
        setMessage(res.message || "¡Email verificado correctamente!")
      })
      .catch(() => {
        setStatus("error")
        setMessage("El enlace es inválido o ya expiró. Solicita un nuevo email de verificación.")
      })
  }, [token])

  return (
    <View style={s.root}>
      {/* Header */}
      <View style={s.header}>
        <View style={s.logoBox}>
          <Text style={s.logoLetter}>S</Text>
        </View>
        <Text style={s.logoLabel}>SAFPRO</Text>
      </View>

      <View style={s.center}>
        <View style={s.card}>

          {/* ── Loading ── */}
          {status === "loading" && (
            <>
              <ActivityIndicator color={INDIGO} size="large" style={{ marginBottom: 16 }} />
              <Text style={s.title}>Verificando tu email…</Text>
              <Text style={s.sub}>Un momento por favor.</Text>
            </>
          )}

          {/* ── Success ── */}
          {status === "success" && (
            <>
              <View style={[s.iconCircle, { backgroundColor: "rgba(34,197,94,0.12)" }]}>
                <Text style={{ fontSize: 36 }}>✓</Text>
              </View>
              <Text style={[s.title, { color: GREEN }]}>¡Email verificado!</Text>
              <Text style={s.sub}>{message}</Text>
              <TouchableOpacity
                style={[s.btn, { backgroundColor: INDIGO }]}
                onPress={() => router.replace("/(auth)/login")}
              >
                <Text style={s.btnText}>Ir al inicio de sesión</Text>
              </TouchableOpacity>
            </>
          )}

          {/* ── Error ── */}
          {status === "error" && (
            <>
              <View style={[s.iconCircle, { backgroundColor: "rgba(239,68,68,0.12)" }]}>
                <Text style={{ fontSize: 36 }}>✕</Text>
              </View>
              <Text style={[s.title, { color: RED }]}>Enlace inválido</Text>
              <Text style={s.sub}>{message}</Text>
              <TouchableOpacity
                style={[s.btn, { backgroundColor: ORANGE }]}
                onPress={() => router.replace("/(auth)/login")}
              >
                <Text style={s.btnText}>Volver al inicio de sesión</Text>
              </TouchableOpacity>
            </>
          )}

        </View>

        {/* Hint deep link */}
        <Text style={s.hint}>
          Si abriste este enlace desde tu email,{"\n"}
          tu cuenta ya quedó verificada.
        </Text>
      </View>
    </View>
  )
}

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
  logoLetter: { color: WHITE, fontWeight: "800", fontSize: 16 },
  logoLabel:  { color: WHITE, fontWeight: "800", fontSize: 18, letterSpacing: 2 },

  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    gap: 16,
  },
  card: {
    backgroundColor: CARD,
    borderRadius: 20,
    padding: 28,
    width: "100%",
    maxWidth: 360,
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: BORDER,
  },
  iconCircle: {
    width: 72, height: 72, borderRadius: 36,
    alignItems: "center", justifyContent: "center",
    marginBottom: 4,
  },
  title: {
    fontSize: 20, fontWeight: "700", color: TEXT, textAlign: "center",
  },
  sub: {
    fontSize: 14, color: MUTED, textAlign: "center", lineHeight: 20,
  },
  btn: {
    marginTop: 8,
    borderRadius: 10, paddingHorizontal: 24, paddingVertical: 12,
    width: "100%", alignItems: "center",
  },
  btnText: {
    color: WHITE, fontWeight: "700", fontSize: 15,
  },
  hint: {
    fontSize: 12, color: MUTED, textAlign: "center", lineHeight: 18,
  },
})
