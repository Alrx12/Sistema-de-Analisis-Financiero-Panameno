/**
 * UploadScreen — seleccionar Excel y subirlo
 * Tema: dark navy
 */
import { useState, useEffect, useRef } from "react"
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, ScrollView,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import * as DocumentPicker from "expo-document-picker"
import { useQueryClient } from "@tanstack/react-query"
import { Ionicons } from "@expo/vector-icons"
import { uploadFile, getJob } from "@safpro/api/files"
import type { JobStatus } from "@safpro/types"

// ── Design tokens ─────────────────────────────────────────────────────────────
const BG     = "#070c18"
const CARD   = "#0d1426"
const BORDER = "rgba(255,255,255,0.07)"
const TEXT   = "#f1f5f9"
const MUTED  = "rgba(255,255,255,0.45)"
const INDIGO = "#6366f1"

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

export default function UploadScreen() {
  const queryClient = useQueryClient()
  const [uploading, setUploading]   = useState(false)
  const [jobId, setJobId]           = useState<string | null>(null)
  const [jobStatus, setJobStatus]   = useState<JobStatus | null>(null)
  const [errorMsg, setErrorMsg]     = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!jobId || jobStatus === "success" || jobStatus === "error") return
    pollRef.current = setInterval(async () => {
      try {
        const job = await getJob(jobId)
        setJobStatus(job.status)
        if (job.status === "success") {
          queryClient.invalidateQueries({ queryKey: ["aggregated"] })
          queryClient.invalidateQueries({ queryKey: ["analysis"] })
          clearInterval(pollRef.current!)
        } else if (job.status === "error") {
          setErrorMsg(job.error_message ?? "Error desconocido")
          clearInterval(pollRef.current!)
        }
      } catch { /* ignorar errores de red en polling */ }
    }, 2000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [jobId, jobStatus])

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
      setUploading(true)
      setJobId(null); setJobStatus(null); setErrorMsg(null)
      const res = await uploadFile({ uri: file.uri, name: file.name, type: file.mimeType ?? "application/octet-stream" })
      setJobId(res.job_id)
      setJobStatus("queued")
    } catch (err: unknown) {
      Alert.alert("Error", err instanceof Error ? err.message : "Error al subir el archivo")
    } finally {
      setUploading(false)
    }
  }

  function reset() { setJobId(null); setJobStatus(null); setErrorMsg(null) }

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      {/* Page header */}
      <View style={styles.header}>
        <Text style={styles.title}>Subir Estado de Cuenta</Text>
        <Text style={styles.subtitle}>
          Exporta tu estado de cuenta desde tu banca en línea y súbelo aquí.
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {/* Bancos */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Bancos soportados</Text>
          {BANKS.map((b) => (
            <View key={b.name} style={styles.bankRow}>
              <View style={[styles.bankDot, { backgroundColor: b.color }]} />
              <Text style={styles.bankName}>{b.name}</Text>
            </View>
          ))}
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
            {errorMsg && <Text style={styles.errorText}>{errorMsg}</Text>}
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
            style={[styles.uploadBtn, uploading && { opacity: 0.6 }]}
            onPress={handlePickAndUpload}
            disabled={uploading}
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
          ⚡ SAFPRO nunca almacena tus credenciales bancarias.
          Solo analizamos el archivo que tú exportas.
        </Text>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: BG },
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
  bankName:  { color: TEXT, fontSize: 14 },

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
  errorText:  { color: "#ef4444", marginTop: 8, fontSize: 13 },
  resetBtn:   { marginTop: 12, backgroundColor: "rgba(255,255,255,0.07)", borderRadius: 8, padding: 10, alignItems: "center" },
  resetBtnText: { color: TEXT, fontWeight: "600" },

  disclaimer: { color: MUTED, fontSize: 12, textAlign: "center", lineHeight: 18 },
})
