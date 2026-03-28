import { useState, useRef, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { Upload, FileSpreadsheet, CheckCircle2, XCircle, Loader2, PenLine } from "lucide-react"
import { Link } from "react-router-dom"
import { uploadFile } from "@/api/files"
import { getJob } from "@/api/jobs"
import { getProfile } from "@/api/profile"
import type { JobStatus } from "@/types"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

type UploadState =
  | { phase: "idle" }
  | { phase: "uploading" }
  | { phase: "polling"; jobId: string }
  | { phase: "success" }
  | { phase: "error"; message: string }

export default function UploadPage() {
  const [state, setState] = useState<UploadState>({ phase: "idle" })
  const [file, setFile] = useState<File | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  // Auto-navegar 1.5s después de completar exitosamente.
  // Si es el primer análisis (onboarding_completed=false) → onboarding, si no → /analysis
  useEffect(() => {
    if (state.phase === "success") {
      const timer = setTimeout(async () => {
        try {
          const profile = await getProfile()
          if (!profile.onboarding_completed) {
            navigate("/onboarding")
          } else {
            navigate("/analysis")
          }
        } catch {
          navigate("/analysis")
        }
      }, 1500)
      return () => clearTimeout(timer)
    }
  }, [state, navigate])

  function handleFile(f: File) {
    if (!f.name.match(/\.(xlsx|xls)$/i)) {
      setState({ phase: "error", message: "Solo se aceptan archivos .xlsx o .xls" })
      return
    }
    setFile(f)
    setState({ phase: "idle" })
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }

  async function handleUpload() {
    if (!file) return
    setState({ phase: "uploading" })

    try {
      const res = await uploadFile(file)
      setState({ phase: "polling", jobId: res.job_id })
      setJobStatus("queued")
      pollJob(res.job_id)
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: Record<string, unknown> } }
      const status = e?.response?.status
      const data = e?.response?.data

      if (status === 409) {
        // El backend devuelve {error, message, original_filename, uploaded_at, detected_bank}
        const bank = data?.detected_bank ? ` (${data.detected_bank})` : ""
        const msg = typeof data?.message === "string"
          ? `${data.message}${bank}`
          : "Este archivo ya fue procesado anteriormente."
        setState({ phase: "error", message: msg })
      } else {
        // Otros errores: el detail puede ser string o array de errores de validación
        const detail = data?.detail
        const msg = Array.isArray(detail)
          ? (detail[0] as { msg?: string })?.msg ?? "Error al subir el archivo"
          : typeof detail === "string"
          ? detail
          : "Error al subir el archivo"
        setState({ phase: "error", message: msg })
      }
    }
  }

  function pollJob(jobId: string) {
    let attempts = 0
    const MAX = 60 // 60 * 3s = 3 minutos máximo

    const interval = setInterval(async () => {
      attempts++
      try {
        const job = await getJob(jobId)
        setJobStatus(job.status)

        if (job.status === "success") {
          clearInterval(interval)
          setState({ phase: "success" })
        } else if (job.status === "error") {
          clearInterval(interval)
          setState({ phase: "error", message: job.error_message ?? "Error procesando el archivo" })
        } else if (attempts >= MAX) {
          clearInterval(interval)
          setState({ phase: "error", message: "El procesamiento tardó demasiado. Intenta de nuevo." })
        }
      } catch {
        clearInterval(interval)
        setState({ phase: "error", message: "No se pudo verificar el estado del job" })
      }
    }, 3000)
  }

  const isProcessing = state.phase === "uploading" || state.phase === "polling"

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title">Subir estado de cuenta</h1>
          <p className="page-subtitle">Archivos .xlsx o .xls de Banco General, BAC o Banistmo</p>
        </div>
      </div>

      <Card className="zoho-card border-0">
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Seleccionar archivo</CardTitle>
          <CardDescription>
            El sistema detecta automáticamente el banco y extrae las transacciones
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Zona de drop */}
          <div
            className={cn(
              "relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 transition-colors cursor-pointer",
              dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50",
              isProcessing && "pointer-events-none opacity-60"
            )}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => !isProcessing && inputRef.current?.click()}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
            />
            <FileSpreadsheet className="h-10 w-10 text-muted-foreground" />
            {file ? (
              <div className="text-center">
                <p className="font-medium text-sm">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {(file.size / 1024).toFixed(0)} KB
                </p>
              </div>
            ) : (
              <div className="text-center">
                <p className="text-sm font-medium">Arrastra tu archivo aquí</p>
                <p className="text-xs text-muted-foreground">o haz clic para buscar</p>
              </div>
            )}
          </div>

          {/* Estado del procesamiento */}
          {state.phase === "polling" && (
            <StatusBar jobStatus={jobStatus} />
          )}

          {state.phase === "error" && (
            <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {state.message}
            </div>
          )}

          {state.phase === "success" && (
            <div className="flex items-center gap-2 rounded-md bg-green-50 p-3 text-sm text-green-700">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              ¡Procesado correctamente! Redirigiendo al análisis…
            </div>
          )}

          {/* Botón de acción */}
          {state.phase !== "success" && (
            <Button
              className="w-full"
              disabled={!file || isProcessing}
              onClick={handleUpload}
            >
              {state.phase === "uploading" && <Loader2 className="h-4 w-4 animate-spin" />}
              {state.phase === "polling" && <Loader2 className="h-4 w-4 animate-spin" />}
              {isProcessing ? "Procesando…" : "Procesar archivo"}
            </Button>
          )}

          {state.phase === "success" && (
            <Button className="w-full" onClick={() => navigate("/analysis")}>
              Ver mis análisis
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Alternativa: entrada manual */}
      <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
        <span>¿No tienes el estado de cuenta?</span>
        <Link
          to="/manual"
          className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline"
        >
          <PenLine className="h-3.5 w-3.5" />
          Ingresar gastos manualmente
        </Link>
      </div>

      {/* Bancos soportados */}
      <Card className="zoho-card border-0">
        <CardContent className="pt-5">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Bancos compatibles</p>
          <div className="flex flex-col gap-2">
            {[
              { name: "Banco General",  color: "#1a3a8f" },
              { name: "BAC Credomatic", color: "#e31837" },
              { name: "Banistmo",       color: "#00843d" },
            ].map(({ name, color }) => (
              <div key={name} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span style={{ background: color, width: 8, height: 8, borderRadius: "50%", display: "inline-block" }} />
                  <span className="text-sm font-medium">{name}</span>
                </div>
                <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-700">
                  Validado
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function StatusBar({ jobStatus }: { jobStatus: JobStatus | null }) {
  const steps: { status: JobStatus; label: string }[] = [
    { status: "queued", label: "En cola" },
    { status: "processing", label: "Procesando" },
    { status: "success", label: "Completado" },
  ]
  const currentIndex = steps.findIndex((s) => s.status === jobStatus)

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        {steps.map((step, i) => (
          <div key={step.status} className="flex flex-1 flex-col items-center gap-1">
            <div
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold",
                i < currentIndex
                  ? "bg-green-500 text-white"
                  : i === currentIndex
                  ? "bg-primary text-white"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {i < currentIndex ? "✓" : i + 1}
            </div>
            <span className="text-xs text-muted-foreground">{step.label}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        <span>
          {jobStatus === "queued" && "Esperando worker disponible…"}
          {jobStatus === "processing" && "Clasificando transacciones…"}
        </span>
      </div>
    </div>
  )
}


