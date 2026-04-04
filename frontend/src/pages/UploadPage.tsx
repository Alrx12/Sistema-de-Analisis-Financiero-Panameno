import { useState, useRef, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { Upload, FileSpreadsheet, CheckCircle2, XCircle, Loader2, PenLine, Lock, ShieldCheck, X } from "lucide-react"
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
  const [showTrustLayer, setShowTrustLayer] = useState(false)
  const [trustAccepted, setTrustAccepted] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  function handleDropZoneClick() {
    if (state.phase === "uploading" || state.phase === "polling") return
    if (!trustAccepted) {
      setShowTrustLayer(true)
    } else {
      inputRef.current?.click()
    }
  }

  function handleTrustAccept() {
    setTrustAccepted(true)
    setShowTrustLayer(false)
    setTimeout(() => inputRef.current?.click(), 80)
  }

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
          <p className="page-subtitle">Archivos .xlsx o .xls de Banco General, BAC, Banistmo, Banesco o Credicorp Bank</p>
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
            onDrop={(e) => { if (!trustAccepted) { e.preventDefault(); setDragOver(false); setShowTrustLayer(true) } else { onDrop(e) } }}
            onClick={handleDropZoneClick}
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
            <div className="space-y-2">
              <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                {state.message}
              </div>
              <p className="text-xs text-muted-foreground px-1">
                ¿Problemas al subir el archivo?{" "}
                <Link to="/ayuda" className="text-primary underline underline-offset-2 hover:no-underline">
                  Consulta cómo exportar tu estado de cuenta
                </Link>{" "}
                desde tu banco.
              </p>
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
              { name: "Banesco",        color: "#f5a623" },
              { name: "Credicorp Bank", color: "#0057a8" },
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

      {/* ── Trust Layer Modal ───────────────────────────────────────────────── */}
      {showTrustLayer && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 50,
            background: "rgba(15,23,42,0.65)",
            backdropFilter: "blur(4px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "1rem",
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowTrustLayer(false) }}
        >
          <div
            style={{
              background: "#ffffff", borderRadius: "1rem", maxWidth: 520, width: "100%",
              maxHeight: "90vh", overflowY: "auto",
              boxShadow: "0 25px 60px rgba(0,0,0,0.35)",
            }}
          >
            {/* Header navy */}
            <div style={{ background: "#1c2b4b", borderRadius: "1rem 1rem 0 0", padding: "1.5rem" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  <div style={{
                    background: "rgba(255,255,255,0.12)", borderRadius: "50%",
                    width: 44, height: 44,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <ShieldCheck style={{ width: 22, height: 22, color: "#4ade80" }} />
                  </div>
                  <div>
                    <p style={{ color: "#ffffff", fontWeight: 700, fontSize: "1.05rem", margin: 0 }}>
                      Tus datos financieros están bajo tu control
                    </p>
                    <p style={{ color: "rgba(255,255,255,0.55)", fontSize: "0.8rem", margin: 0, marginTop: 2 }}>
                      SAFPRO analiza tu archivo SIN acceso a tu banca online
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowTrustLayer(false)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.5)", padding: 4 }}
                >
                  <X style={{ width: 18, height: 18 }} />
                </button>
              </div>
            </div>

            <div style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              {/* Checklist */}
              <div style={{ background: "#f0fdf4", borderRadius: "0.75rem", padding: "1rem 1.25rem" }}>
                {[
                  "No pedimos usuario ni contraseña bancaria",
                  "No tenemos acceso a tu cuenta bancaria",
                  "Solo analizamos el archivo que tú descargas y subes",
                  "Tus datos no se comparten con nadie",
                  "Puedes eliminar tu información en cualquier momento",
                ].map((item) => (
                  <div key={item} style={{ display: "flex", alignItems: "flex-start", gap: "0.6rem", marginBottom: "0.5rem" }}>
                    <CheckCircle2 style={{ width: 16, height: 16, color: "#16a34a", flexShrink: 0, marginTop: 2 }} />
                    <span style={{ fontSize: "0.875rem", color: "#166534" }}>{item}</span>
                  </div>
                ))}
              </div>

              {/* Qué estás subiendo */}
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
                  <FileSpreadsheet style={{ width: 16, height: 16, color: "#6366f1" }} />
                  <p style={{ fontWeight: 600, fontSize: "0.875rem", color: "#1e293b", margin: 0 }}>¿Qué estás subiendo realmente?</p>
                </div>
                <p style={{ fontSize: "0.84rem", color: "#475569", lineHeight: 1.6, margin: 0 }}>
                  Es el mismo archivo que <strong>tú descargaste de tu banco</strong>. SAFPRO solo lo lee para
                  organizar tus gastos automáticamente. No puede acceder a tu cuenta ni realizar movimientos.
                  Es idéntico al archivo que podrías abrir en Excel.
                </p>
              </div>

              {/* Disclaimer honesto */}
              <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: "0.75rem", padding: "1rem 1.25rem" }}>
                <p style={{ fontWeight: 600, fontSize: "0.84rem", color: "#92400e", margin: "0 0 0.4rem 0" }}>⚠️ Queremos ser honestos</p>
                <p style={{ fontSize: "0.82rem", color: "#78350f", lineHeight: 1.6, margin: 0 }}>
                  Sí, el archivo contiene información sensible — igual que cuando lo guardas en tu laptop
                  o lo adjuntas en un email. El riesgo no es el archivo en sí, sino <strong>cómo se maneja</strong>.
                  En SAFPRO no vendemos ni compartimos tus datos, no los usamos fuera de tu análisis y
                  no accedemos a ninguna otra información tuya.
                </p>
              </div>

              {/* Control del usuario */}
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
                  <Lock style={{ width: 15, height: 15, color: "#e05c19" }} />
                  <p style={{ fontWeight: 600, fontSize: "0.875rem", color: "#1e293b", margin: 0 }}>Tú tienes el control</p>
                </div>
                <ul style={{ margin: 0, paddingLeft: "1.1rem", fontSize: "0.84rem", color: "#475569", lineHeight: 1.8 }}>
                  <li>Puedes eliminar tus datos en <strong>Configuración → Zona peligrosa</strong></li>
                  <li>Nada se conecta automáticamente a tu banco</li>
                  <li>Puedes dejar de usar la app en cualquier momento</li>
                </ul>
              </div>

              {/* CTAs */}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", paddingTop: "0.25rem" }}>
                <button
                  onClick={handleTrustAccept}
                  style={{
                    background: "#e05c19", color: "#ffffff",
                    border: "none", borderRadius: "0.6rem",
                    padding: "0.75rem 1.5rem",
                    fontWeight: 700, fontSize: "0.95rem",
                    cursor: "pointer", width: "100%",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem",
                    transition: "background 0.15s",
                  }}
                  onMouseOver={(e) => (e.currentTarget.style.background = "#c94f13")}
                  onMouseOut={(e) => (e.currentTarget.style.background = "#e05c19")}
                >
                  <Upload style={{ width: 16, height: 16 }} />
                  Entiendo y quiero continuar
                </button>
                <Link
                  to="/privacy"
                  style={{ textAlign: "center", fontSize: "0.8rem", color: "#64748b", textDecoration: "underline" }}
                  onClick={() => setShowTrustLayer(false)}
                >
                  Ver política de privacidad completa
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
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


