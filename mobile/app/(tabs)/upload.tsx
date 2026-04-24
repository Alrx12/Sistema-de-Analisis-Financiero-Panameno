/**
 * UploadScreen — seleccionar Excel y subirlo
 * v2: badge uploads restantes, manejo 409/429, validación MIME/extensión
 * Tema: dark navy
 */
import { useState, useEffect, useRef } from "react"
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, ScrollView, Modal,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import * as DocumentPicker from "expo-document-picker"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Ionicons } from "@expo/vector-icons"
import { uploadFile, getJob, getUploadStatus } from "@safpro/api/files"
import type { JobStatus } from "@safpro/types"

// ── Trust Layer Modal ─────────────────────────────────────────────────────────
const TRUST_KEY = "safpro_trust_seen_v1"

const TRUST_ITEMS = [
  {
    icon: "ban-outline" as const,
    color: "#22c55e",
    title: "Sin credenciales",
    desc: "SAFPRO nunca te pedirá tu usuario ni contraseña bancaria.",
  },
  {
    icon: "lock-closed-outline" as const,
    color: "#6366f1",
    title: "Cifrado SSL",
    desc: "Toda la comunicación viaja encriptada de extremo a extremo.",
  },
  {
    icon: "eye-off-outline" as const,
    color: "#a78bfa",
    title: "Solo tus datos",
    desc: "Tus archivos son privados y solo tú puedes verlos.",
  },
  {
    icon: "document-outline" as const,
    color: "#f59e0b",
    title: "¿Qué es el Excel?",
    desc: "Es el estado de cuenta que TÚ exportas desde tu banca en línea — no le damos acceso al banco.",
  },
]

function TrustModal({ visible, onDismiss }: { visible: boolean; onDismiss: () => void }) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onDismiss}
    >
      <View style={ts.overlay}>
        <View style={ts.sheet}>
          {/* Header */}
          <View style={ts.sheetHeader}>
            <View style={ts.shieldIcon}>
              <Ionicons name="shield-checkmark" size={24} color="#6366f1" />
            </View>
            <Text style={ts.sheetTitle}>¿Qué estás subiendo?</Text>
            <Text style={ts.sheetSub}>Antes de continuar, te explicamos en qué consiste el proceso.</Text>
          </View>

          {/* Items */}
          <View style={ts.itemsContainer}>
            {TRUST_ITEMS.map((item) => (
              <View key={item.title} style={ts.trustItem}>
                <View style={[ts.trustIconBox, { backgroundColor: `${item.color}22` }]}>
                  <Ionicons name={item.icon} size={18} color={item.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={ts.trustTitle}>{item.title}</Text>
                  <Text style={ts.trustDesc}>{item.desc}</Text>
                </View>
              </View>
            ))}
          </View>

          {/* CTA */}
          <TouchableOpacity style={ts.cta} onPress={onDismiss} activeOpacity={0.85}>
            <Ionicons name="checkmark-circle" size={18} color="#fff" />
            <Text style={ts.ctaText}>Entendido, continuar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

const ts = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.72)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#0d1426",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    borderBottomWidth: 0,
  },
  sheetHeader: {
    alignItems: "center",
    marginBottom: 22,
  },
  shieldIcon: {
    width: 52, height: 52, borderRadius: 16,
    backgroundColor: "rgba(99,102,241,0.15)",
    alignItems: "center", justifyContent: "center",
    marginBottom: 12,
  },
  sheetTitle: {
    fontSize: 20, fontWeight: "700", color: "#f1f5f9",
    marginBottom: 6, textAlign: "center",
  },
  sheetSub: {
    color: "rgba(255,255,255,0.45)", fontSize: 13,
    textAlign: "center", lineHeight: 18,
  },
  itemsContainer: { gap: 14, marginBottom: 24 },
  trustItem: {
    flexDirection: "row", alignItems: "flex-start", gap: 12,
  },
  trustIconBox: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: "center", justifyContent: "center",
    flexShrink: 0, marginTop: 1,
  },
  trustTitle: { color: "#f1f5f9", fontSize: 13, fontWeight: "700", marginBottom: 2 },
  trustDesc:  { color: "rgba(255,255,255,0.5)", fontSize: 12, lineHeight: 17 },
  cta: {
    backgroundColor: "#6366f1",
    borderRadius: 12, padding: 15,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
  },
  ctaText: { color: "#fff", fontSize: 15, fontWeight: "700" },
})

// ── Design tokens ─────────────────────────────────────────────────────────────
const BG     = "#070c18"
const CARD   = "#0d1426"
const BORDER = "rgba(255,255,255,0.07)"
const TEXT   = "#f1f5f9"
const MUTED  = "rgba(255,255,255,0.45)"
const INDIGO = "#6366f1"
const ORANGE = "#e05c19"

const STATUS_LABELS: Record<JobStatus, string> = {
  queued:     "En cola...",
  processing: "Procesando...",
  success:    "¡Análisis listo!",
  error:      "Error al procesar",
}
const STATUS_COLORS: Record<JobStatus, string> = {
  queued:     "#f59e0b",
  processing: "#3b82f6",
  success:    "#22c55e",
  error:      "#ef4444",
}

const BANKS = [
  { name: "Banco General",  color: "#e05c19" },
  { name: "BAC Credomatic", color: "#e02020" },
  { name: "Banistmo",       color: "#0057a8" },
  { name: "Banesco",        color: "#003087" },
  { name: "Credicorp Bank", color: "#0057a8" },
]

// ── Validación MIME/extensión ─────────────────────────────────────────────────
function isValidExcelFile(name: string, mimeType?: string | null): boolean {
  const lower = name.toLowerCase()
  if (!lower.endsWith(".xlsx") && !lower.endsWith(".xls")) return false
  // Si el picker informa un MIME claramente no-Excel, rechazar
  if (mimeType) {
    const bad = ["image/", "video/", "audio/", "text/html", "application/pdf",
                 "application/msword", "application/vnd.openxmlformats-officedocument.word"]
    if (bad.some(b => mimeType.startsWith(b))) return false
  }
  return true
}

// ── Screen ────────────────────────────────────────────────────────────────────
export default function UploadScreen() {
  const queryClient = useQueryClient()
  const [uploading, setUploading]   = useState(false)
  const [jobId, setJobId]           = useState<string | null>(null)
  const [jobStatus, setJobStatus]   = useState<JobStatus | null>(null)
  const [errorMsg, setErrorMsg]     = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Trust Layer — mostrar solo la primera vez ────────────────────────────
  const [trustVisible, setTrustVisible] = useState(false)
  const [trustChecked, setTrustChecked] = useState(false)
  useEffect(() => {
    AsyncStorage.getItem(TRUST_KEY)
      .then((val) => {
        if (!val) setTrustVisible(true)
      })
      .catch(() => {
        // Si AsyncStorage falla, mostrar el modal por defecto
        setTrustVisible(true)
      })
      .finally(() => setTrustChecked(true))
  }, [])
  function dismissTrust() {
    setTrustVisible(false)
    AsyncStorage.setItem(TRUST_KEY, "1").catch(() => {})
  }

  // ── Upload status (badge) ─────────────────────────────────────────────────
  const { data: uploadStatus, refetch: refetchStatus } = useQuery({
    queryKey: ["upload-status"],
    queryFn:  getUploadStatus,
    staleTime: 30_000,
  })

  const isPro        = uploadStatus ? !uploadStatus.is_free : false
  const remaining    = uploadStatus?.remaining ?? null
  const uploadCount  = uploadStatus?.upload_count ?? 0
  const uploadLimit  = uploadStatus?.upload_limit ?? 5
  const nearLimit    = !isPro && remaining !== null && remaining <= 1

  // ── Polling ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!jobId || jobStatus === "success" || jobStatus === "error") return
    pollRef.current = setInterval(async () => {
      try {
        const job = await getJob(jobId)
        setJobStatus(job.status)
        if (job.status === "success") {
          queryClient.invalidateQueries({ queryKey: ["aggregated"] })
          queryClient.invalidateQueries({ queryKey: ["agg"] })
          queryClient.invalidateQueries({ queryKey: ["analysis"] })
          refetchStatus()
          clearInterval(pollRef.current!)
        } else if (job.status === "error") {
          setErrorMsg(job.error_message ?? "Error desconocido")
          clearInterval(pollRef.current!)
        }
      } catch { /* ignorar errores de red en polling */ }
    }, 2000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [jobId, jobStatus])

  // ── Pick & upload ─────────────────────────────────────────────────────────
  async function handlePickAndUpload() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "application/vnd.ms-excel",
          "application/octet-stream",
        ],
        copyToCacheDirectory: true,
      })
      if (result.canceled) return
      const file = result.assets[0]

      // Validación MIME/extensión en cliente
      if (!isValidExcelFile(file.name, file.mimeType)) {
        Alert.alert(
          "Formato no válido",
          "Solo se aceptan archivos .xlsx o .xls (Excel). No se aceptan imágenes, PDFs ni otros formatos."
        )
        return
      }

      setUploading(true)
      setJobId(null); setJobStatus(null); setErrorMsg(null)

      const res = await uploadFile({
        uri:  file.uri,
        name: file.name,
        type: file.mimeType ?? "application/octet-stream",
      })
      setJobId(res.job_id)
      setJobStatus("queued")
      refetchStatus()

    } catch (err: any) {
      const status = err?.response?.status
      const detail = err?.response?.data?.detail

      if (status === 409) {
        const bank = detail?.detected_bank ?? "banco"
        const dateStr = detail?.uploaded_at
          ? new Date(detail.uploaded_at).toLocaleDateString("es-PA")
          : null
        Alert.alert(
          "Archivo duplicado",
          `Este archivo ya fue procesado${dateStr ? ` el ${dateStr}` : ""} (${bank}).\nSi subiste un nuevo extracto del mismo banco, verifica que el período sea diferente.`
        )
      } else if (status === 429) {
        Alert.alert(
          "Límite alcanzado",
          `Alcanzaste el límite de ${uploadLimit} uploads del plan gratuito. Actualiza a Pro para subir archivos ilimitados.`
        )
      } else {
        Alert.alert("Error", err instanceof Error ? err.message : "Error al subir el archivo")
      }
    } finally {
      setUploading(false)
    }
  }

  function reset() { setJobId(null); setJobStatus(null); setErrorMsg(null) }

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      {/* Trust Layer Modal */}
      <TrustModal visible={trustVisible} onDismiss={dismissTrust} />

      {/* Page header */}
      <View style={styles.header}>
        <Text style={styles.title}>Subir Estado de Cuenta</Text>
        <Text style={styles.subtitle}>
          Exporta tu estado de cuenta desde tu banca en línea y súbelo aquí.
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>

        {/* Badge uploads restantes */}
        {uploadStatus && (
          <View style={[
            styles.badge,
            isPro
              ? { backgroundColor: "rgba(99,102,241,0.1)", borderColor: "rgba(99,102,241,0.25)" }
              : nearLimit
                ? { backgroundColor: "rgba(239,68,68,0.1)", borderColor: "rgba(239,68,68,0.3)" }
                : { backgroundColor: "rgba(99,102,241,0.07)", borderColor: "rgba(99,102,241,0.2)" }
          ]}>
            <Ionicons
              name={isPro ? "star" : "cloud-upload-outline"}
              size={14}
              color={isPro ? "#fbbf24" : nearLimit ? "#ef4444" : INDIGO}
            />
            {isPro ? (
              <Text style={[styles.badgeText, { color: "#a5b4fc" }]}>
                ✦ Uploads ilimitados (Plan Pro)
              </Text>
            ) : (
              <Text style={[styles.badgeText, { color: nearLimit ? "#ef4444" : MUTED }]}>
                {uploadCount} de {uploadLimit} uploads usados
                {remaining !== null && remaining > 0
                  ? ` — ${remaining} restante${remaining !== 1 ? "s" : ""}`
                  : remaining === 0 ? " — Límite alcanzado" : ""}
              </Text>
            )}
          </View>
        )}

        {/* Alerta límite alcanzado */}
        {!isPro && remaining === 0 && (
          <View style={styles.limitAlert}>
            <Ionicons name="warning-outline" size={18} color={ORANGE} />
            <View style={{ flex: 1 }}>
              <Text style={styles.limitTitle}>Límite de uploads alcanzado</Text>
              <Text style={styles.limitText}>
                Actualiza a Pro para subir estados de cuenta ilimitados.
              </Text>
            </View>
          </View>
        )}

        {/* Bancos */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Bancos soportados</Text>
          {BANKS.map((b) => (
            <View key={b.name} style={styles.bankRow}>
              <View style={[styles.bankDot, { backgroundColor: b.color }]} />
              <Text style={styles.bankName}>{b.name}</Text>
            </View>
          ))}
          <Text style={styles.bankHint}>Solo .xlsx o .xls — no se aceptan imágenes ni PDFs</Text>
        </View>

        {/* Estado del job */}
        {jobStatus && (
          <View style={[styles.statusCard, { borderLeftColor: STATUS_COLORS[jobStatus] }]}>
            <Text style={[styles.statusText, { color: STATUS_COLORS[jobStatus] }]}>
              {STATUS_LABELS[jobStatus]}
            </Text>
            {(jobStatus === "queued" || jobStatus === "processing") && (
              <ActivityIndicator color={STATUS_COLORS[jobStatus]} style={{ marginTop: 8 }} />
            )}
            {errorMsg && (
              <Text style={styles.errorText}>{errorMsg}</Text>
            )}
            {(jobStatus === "success" || jobStatus === "error") && (
              <TouchableOpacity style={styles.resetBtn} onPress={reset}>
                <Text style={styles.resetBtnText}>Subir otro archivo</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Botón principal */}
        {!jobStatus && (
          <TouchableOpacity
            style={[
              styles.uploadBtn,
              (uploading || (!isPro && remaining === 0)) && { opacity: 0.5 },
            ]}
            onPress={handlePickAndUpload}
            disabled={uploading || (!isPro && remaining === 0)}
            activeOpacity={0.8}
          >
            {uploading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="cloud-upload" size={36} color={INDIGO} style={{ marginBottom: 10 }} />
                <Text style={styles.uploadBtnText}>Seleccionar archivo Excel</Text>
                <Text style={styles.uploadBtnSub}>Se abrirá el explorador de archivos</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        <Text style={styles.disclaimer}>
          ⚡ SAFPRO nunca almacena tus credenciales bancarias.{"\n"}
          Solo analizamos el archivo que tú exportas.
        </Text>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: BG },
  header: {
    backgroundColor: CARD,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 22,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  title:    { fontSize: 22, fontWeight: "700", color: TEXT },
  subtitle: { color: MUTED, marginTop: 4, lineHeight: 20, fontSize: 13 },
  container: { padding: 16, gap: 14 },

  // Upload badge
  badge: {
    flexDirection: "row", alignItems: "center", gap: 8,
    borderRadius: 10, padding: 12, borderWidth: 1,
  },
  badgeText: { fontSize: 13, fontWeight: "600", flex: 1 },

  // Limit alert
  limitAlert: {
    flexDirection: "row", alignItems: "flex-start", gap: 10,
    backgroundColor: "rgba(224,92,25,0.1)", borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: "rgba(224,92,25,0.25)",
  },
  limitTitle: { color: ORANGE, fontWeight: "700", fontSize: 14, marginBottom: 2 },
  limitText:  { color: MUTED, fontSize: 12, lineHeight: 17 },

  card: {
    backgroundColor: CARD,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: BORDER,
  },
  cardTitle: { fontWeight: "700", color: MUTED, fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 12 },
  bankRow:   { flexDirection: "row", alignItems: "center", paddingVertical: 6 },
  bankDot:   { width: 8, height: 8, borderRadius: 4, marginRight: 10 },
  bankName:  { color: TEXT, fontSize: 14, flex: 1 },
  bankHint:  { color: MUTED, fontSize: 11, marginTop: 10, fontStyle: "italic" },

  uploadBtn: {
    backgroundColor: CARD,
    borderRadius: 14,
    padding: 28,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(99,102,241,0.35)",
    borderStyle: "dashed",
  },
  uploadBtnText: { color: TEXT,  fontSize: 16, fontWeight: "700" },
  uploadBtnSub:  { color: MUTED, fontSize: 12, marginTop: 4 },

  statusCard: {
    backgroundColor: CARD,
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
    borderWidth: 1,
    borderColor: BORDER,
  },
  statusText: { fontWeight: "700", fontSize: 16 },
  errorText:  { color: "#ef4444", marginTop: 8, fontSize: 13, lineHeight: 18 },
  resetBtn:   { marginTop: 12, backgroundColor: "rgba(255,255,255,0.07)", borderRadius: 8, padding: 10, alignItems: "center" },
  resetBtnText: { color: TEXT, fontWeight: "600" },

  disclaimer: { color: MUTED, fontSize: 12, textAlign: "center", lineHeight: 18 },
})
