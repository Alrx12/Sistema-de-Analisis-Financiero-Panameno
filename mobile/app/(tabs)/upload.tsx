/**
 * UploadScreen — seleccionar Excel desde Files/iCloud y subirlo
 * El backend recibe exactamente el mismo multipart/form-data que en web
 */
import { useState, useEffect, useRef } from "react"
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, ScrollView,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import * as DocumentPicker from "expo-document-picker"
import { useQueryClient } from "@tanstack/react-query"
import { uploadFile, getJob } from "@safpro/api/files"
import type { JobStatus } from "@safpro/types"

const STATUS_LABELS: Record<JobStatus, string> = {
  queued: "En cola...",
  processing: "Procesando...",
  success: "¡Análisis listo!",
  error: "Error al procesar",
}

const STATUS_COLORS: Record<JobStatus, string> = {
  queued: "#f59e0b",
  processing: "#3b82f6",
  success: "#22c55e",
  error: "#ef4444",
}

export default function UploadScreen() {
  const queryClient = useQueryClient()
  const [uploading, setUploading] = useState(false)
  const [jobId, setJobId] = useState<string | null>(null)
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Polling del estado del job
  useEffect(() => {
    if (!jobId || jobStatus === "success" || jobStatus === "error") return

    pollRef.current = setInterval(async () => {
      try {
        const job = await getJob(jobId)
        setJobStatus(job.status)
        if (job.status === "success") {
          // Invalidar queries para que el dashboard se actualice
          queryClient.invalidateQueries({ queryKey: ["aggregated"] })
          queryClient.invalidateQueries({ queryKey: ["analysis"] })
          clearInterval(pollRef.current!)
        } else if (job.status === "error") {
          setErrorMsg(job.error_message ?? "Error desconocido")
          clearInterval(pollRef.current!)
        }
      } catch {
        // ignorar errores de red en polling
      }
    }, 2000)

    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [jobId, jobStatus])

  async function handlePickAndUpload() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
          "application/vnd.ms-excel",  // .xls
          "application/octet-stream",  // genérico para .xls en algunos dispositivos
        ],
        copyToCacheDirectory: true,
      })

      if (result.canceled) return
      const file = result.assets[0]

      setUploading(true)
      setJobId(null)
      setJobStatus(null)
      setErrorMsg(null)

      const res = await uploadFile({
        uri: file.uri,
        name: file.name,
        type: file.mimeType ?? "application/octet-stream",
      })

      setJobId(res.job_id)
      setJobStatus("queued")
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al subir el archivo"
      Alert.alert("Error", msg)
    } finally {
      setUploading(false)
    }
  }

  function reset() {
    setJobId(null)
    setJobStatus(null)
    setErrorMsg(null)
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Subir Estado de Cuenta</Text>
          <Text style={styles.subtitle}>
            Exporta tu estado de cuenta desde tu banca en línea y súbelo aquí.
          </Text>
        </View>

        {/* Bancos soportados */}
        <View style={styles.banksCard}>
          <Text style={styles.banksTitle}>Bancos soportados</Text>
          {[
            { name: "Banco General", color: "#e05c19" },
            { name: "BAC Credomatic", color: "#e02020" },
            { name: "Banistmo", color: "#0057a8" },
            { name: "Banesco", color: "#003087" },
            { name: "Credicorp Bank", color: "#0057a8" },
          ].map((b) => (
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
            style={[styles.uploadBtn, uploading && styles.uploadBtnDisabled]}
            onPress={handlePickAndUpload}
            disabled={uploading}
          >
            {uploading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Text style={styles.uploadIcon}>📁</Text>
                <Text style={styles.uploadBtnText}>Seleccionar archivo Excel</Text>
                <Text style={styles.uploadBtnSub}>
                  Se abrirá el explorador de archivos del dispositivo
                </Text>
              </>
            )}
          </TouchableOpacity>
        )}

        <Text style={styles.disclaimer}>
          ⚡ SAFPRO nunca pide ni almacena tus credenciales bancarias.
          Solo analizamos el archivo que tú exportas.
        </Text>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f4f5f7" },
  container: { padding: 20 },
  header: { marginBottom: 20 },
  title: { fontSize: 22, fontWeight: "700", color: "#1c2b4b" },
  subtitle: { color: "#6b7280", marginTop: 4, lineHeight: 20 },
  banksCard: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  banksTitle: { fontWeight: "700", color: "#1c2b4b", marginBottom: 10 },
  bankRow: { flexDirection: "row", alignItems: "center", paddingVertical: 5 },
  bankDot: { width: 10, height: 10, borderRadius: 5, marginRight: 10 },
  bankName: { color: "#374151", fontSize: 14 },
  uploadBtn: {
    backgroundColor: "#1c2b4b",
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    marginBottom: 20,
    borderWidth: 2,
    borderColor: "#2d4878",
    borderStyle: "dashed",
  },
  uploadBtnDisabled: { opacity: 0.6 },
  uploadIcon: { fontSize: 40, marginBottom: 12 },
  uploadBtnText: { color: "#ffffff", fontSize: 16, fontWeight: "700" },
  uploadBtnSub: { color: "#93afd4", fontSize: 12, marginTop: 4 },
  statusCard: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderLeftWidth: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  statusText: { fontWeight: "700", fontSize: 16 },
  errorText: { color: "#ef4444", marginTop: 8, fontSize: 13 },
  resetBtn: {
    marginTop: 12,
    backgroundColor: "#f3f4f6",
    borderRadius: 8,
    padding: 10,
    alignItems: "center",
  },
  resetBtnText: { color: "#374151", fontWeight: "600" },
  disclaimer: {
    color: "#9ca3af",
    fontSize: 12,
    textAlign: "center",
    lineHeight: 18,
    marginTop: 8,
  },
})
