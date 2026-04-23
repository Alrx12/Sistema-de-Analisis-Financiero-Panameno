/**
 * ContactoScreen — Formulario de contacto nativo.
 * Llama POST /contact directamente sin abrir el browser.
 * Ruta: /contacto (fuera de (tabs) — se navega con router.push desde ayuda)
 */
import { useState } from "react"
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, Alert,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { Ionicons } from "@expo/vector-icons"
import { useRouter } from "expo-router"
import { sendContactForm } from "@safpro/api/contact"

// ── Design tokens ─────────────────────────────────────────────────────────────
const BG      = "#070c18"
const CARD    = "#0d1426"
const INDIGO  = "#6366f1"
const ORANGE  = "#e05c19"
const TEXT    = "#f1f5f9"
const MUTED   = "rgba(255,255,255,0.55)"
const DIM     = "rgba(255,255,255,0.28)"
const BORDER  = "rgba(255,255,255,0.12)"

export default function ContactoScreen() {
  const router = useRouter()

  const [name,    setName]    = useState("")
  const [email,   setEmail]   = useState("")
  const [message, setMessage] = useState("")
  const [loading, setLoading] = useState(false)
  const [sent,    setSent]    = useState(false)

  const isValid = name.trim().length > 0 &&
                  email.trim().includes("@") &&
                  message.trim().length > 0

  async function handleSend() {
    if (!isValid || loading) return
    setLoading(true)
    try {
      await sendContactForm({
        name:    name.trim(),
        email:   email.trim(),
        message: message.trim(),
      })
      setSent(true)
    } catch (err: any) {
      const msg = err?.response?.data?.detail ?? "No se pudo enviar el mensaje. Inténtalo de nuevo."
      Alert.alert("Error al enviar", msg)
    } finally {
      setLoading(false)
    }
  }

  // ── Estado de éxito ──────────────────────────────────────────────────────────
  if (sent) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.backRow}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Ionicons name="arrow-back" size={20} color={TEXT} />
            <Text style={s.backLabel}>Volver</Text>
          </TouchableOpacity>
        </View>
        <View style={s.successWrap}>
          <View style={s.successIcon}>
            <Ionicons name="checkmark-circle" size={56} color="#22c55e" />
          </View>
          <Text style={s.successTitle}>¡Mensaje enviado!</Text>
          <Text style={s.successSub}>
            Gracias por escribirnos. Te responderemos a{"\n"}
            <Text style={{ color: ORANGE }}>{email}</Text>
            {"\n"}lo antes posible.
          </Text>
          <TouchableOpacity style={s.doneBtn} onPress={() => router.back()}>
            <Text style={s.doneBtnText}>Volver a Ayuda</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    )
  }

  // ── Formulario ───────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Ionicons name="arrow-back" size={20} color={TEXT} />
            <Text style={s.backLabel}>Volver</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>Contacto</Text>
            <Text style={s.subtitle}>Escríbenos — te responderemos pronto</Text>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={s.content}
          keyboardShouldPersistTaps="handled"
        >
          {/* Info banner */}
          <View style={s.infoBanner}>
            <Ionicons name="mail-outline" size={18} color={ORANGE} />
            <Text style={s.infoText}>
              También puedes escribirnos directo a{" "}
              <Text style={{ color: ORANGE }}>admin@safpro.us</Text>
            </Text>
          </View>

          {/* Formulario */}
          <View style={s.card}>
            {/* Nombre */}
            <Text style={s.label}>Nombre</Text>
            <TextInput
              style={s.input}
              placeholder="Tu nombre completo"
              placeholderTextColor={DIM}
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              returnKeyType="next"
            />

            {/* Email */}
            <Text style={[s.label, { marginTop: 16 }]}>Correo electrónico</Text>
            <TextInput
              style={s.input}
              placeholder="tu@email.com"
              placeholderTextColor={DIM}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              returnKeyType="next"
            />

            {/* Mensaje */}
            <Text style={[s.label, { marginTop: 16 }]}>Mensaje</Text>
            <TextInput
              style={[s.input, s.textarea]}
              placeholder="¿En qué podemos ayudarte?"
              placeholderTextColor={DIM}
              value={message}
              onChangeText={setMessage}
              multiline
              numberOfLines={6}
              textAlignVertical="top"
              returnKeyType="default"
            />

            <Text style={s.charCount}>{message.length} / 2000</Text>
          </View>

          {/* CTA */}
          <TouchableOpacity
            style={[s.sendBtn, (!isValid || loading) && s.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!isValid || loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="send-outline" size={18} color="#fff" />
                <Text style={s.sendBtnText}>Enviar mensaje</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Nota privacidad */}
          <Text style={s.privacyNote}>
            Al enviar este formulario aceptas nuestra{" "}
            <Text style={{ color: INDIGO }}>Política de Privacidad</Text>.
            No compartimos tu información con terceros.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: BG },
  header:  {
    backgroundColor: CARD,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 18,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  backBtn:   { flexDirection: "row", alignItems: "center", gap: 6, paddingBottom: 2 },
  backRow:   { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  backLabel: { color: TEXT, fontSize: 14 },
  title:     { color: TEXT, fontSize: 20, fontWeight: "700" },
  subtitle:  { color: MUTED, fontSize: 13, marginTop: 2 },

  content:   { padding: 16, paddingBottom: 40 },

  infoBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "rgba(224,92,25,0.08)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(224,92,25,0.2)",
    padding: 14,
    marginBottom: 16,
  },
  infoText:  { color: MUTED, fontSize: 13, flex: 1, lineHeight: 19 },

  card: {
    backgroundColor: CARD,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  label: { color: TEXT, fontSize: 13, fontWeight: "600", marginBottom: 6 },
  input: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BORDER,
    color: TEXT,
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  textarea: {
    minHeight: 120,
    paddingTop: 10,
  },
  charCount: {
    color: DIM,
    fontSize: 11,
    textAlign: "right",
    marginTop: 4,
  },

  sendBtn: {
    backgroundColor: ORANGE,
    borderRadius: 10,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 16,
  },
  sendBtnDisabled: { opacity: 0.45 },
  sendBtnText:     { color: "#fff", fontSize: 15, fontWeight: "700" },

  privacyNote: {
    color: DIM,
    fontSize: 12,
    textAlign: "center",
    lineHeight: 18,
  },

  // Success state
  successWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  successIcon:  { marginBottom: 20 },
  successTitle: { color: TEXT, fontSize: 22, fontWeight: "700", marginBottom: 12 },
  successSub:   { color: MUTED, fontSize: 14, textAlign: "center", lineHeight: 22 },
  doneBtn: {
    marginTop: 32,
    backgroundColor: INDIGO,
    borderRadius: 10,
    paddingVertical: 13,
    paddingHorizontal: 32,
  },
  doneBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
})
