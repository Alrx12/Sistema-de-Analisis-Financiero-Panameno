import { useState } from "react"
import { TrendingUp, Loader2, ShieldCheck, ShieldOff, Copy, CheckCheck } from "lucide-react"
import { setup2FA, enable2FA, disable2FA } from "@/api/auth"
import { useAuthStore } from "@/stores/authStore"
import { parseApiError } from "@/lib/utils"
import type { TwoFactorSetupData } from "@/api/auth"

type Step = "idle" | "setup" | "confirm" | "done"

export default function TwoFactorSetupPage() {
  const user = useAuthStore((s) => s.user)
  const [step, setStep] = useState<Step>("idle")
  const [setupData, setSetupData] = useState<TwoFactorSetupData | null>(null)
  const [code, setCode] = useState("")
  const [password, setPassword] = useState("")
  const [disableCode, setDisableCode] = useState("")
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [showDisable, setShowDisable] = useState(false)

  // Obtener el estado 2FA del usuario (del token decodificado no es posible, así que
  // usamos el store. En una implementación real, refrescarías el perfil del usuario.)
  const has2FA = (user as { totp_enabled?: boolean } | null)?.totp_enabled ?? false

  async function handleSetup() {
    setError("")
    setLoading(true)
    try {
      const data = await setup2FA()
      setSetupData(data)
      setStep("setup")
    } catch (err: unknown) {
      setError(parseApiError(err, "Error al generar el código QR."))
    } finally {
      setLoading(false)
    }
  }

  async function handleEnable() {
    if (code.length !== 6) {
      setError("Ingresa el código de 6 dígitos.")
      return
    }
    setError("")
    setLoading(true)
    try {
      const res = await enable2FA(code)
      setSuccess(res.message)
      setStep("done")
    } catch (err: unknown) {
      setError(parseApiError(err, "Código incorrecto."))
    } finally {
      setLoading(false)
    }
  }

  async function handleDisable() {
    if (!password || disableCode.length !== 6) {
      setError("Completa contraseña y código de 6 dígitos.")
      return
    }
    setError("")
    setLoading(true)
    try {
      const res = await disable2FA(password, disableCode)
      setSuccess(res.message)
      setShowDisable(false)
      setPassword("")
      setDisableCode("")
    } catch (err: unknown) {
      setError(parseApiError(err, "Datos incorrectos."))
    } finally {
      setLoading(false)
    }
  }

  function copySecret() {
    if (setupData?.secret) {
      navigator.clipboard.writeText(setupData.secret)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="auth-page auth-gradient flex items-center justify-center p-4">
      <div className="auth-card w-full max-w-md">

        {/* Logo */}
        <div className="auth-avatar-wrap">
          <div className="auth-avatar">
            <TrendingUp className="h-8 w-8 text-white" />
          </div>
        </div>

        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-gray-800">Autenticación de dos factores</h1>
          <p className="text-sm text-gray-500 mt-1">
            Protege tu cuenta con un código que cambia cada 30 segundos.
          </p>
        </div>

        {/* Mensajes globales */}
        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600 mb-4">
            {error}
          </div>
        )}
        {success && (
          <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-700 mb-4">
            {success}
          </div>
        )}

        {/* Estado: idle (no activado) */}
        {step === "idle" && !has2FA && !showDisable && (
          <div className="space-y-4">
            <div className="rounded-xl bg-blue-50 border border-blue-100 p-4 text-sm text-blue-700">
              <strong>¿Qué es el 2FA?</strong> Al activarlo, necesitarás un código temporal de tu
              app de autenticación (Google Authenticator, Authy, etc.) cada vez que inicies sesión.
            </div>
            <button
              onClick={handleSetup}
              disabled={loading}
              className="auth-btn-primary w-full flex items-center justify-center gap-2"
            >
              {loading
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <ShieldCheck size={16} />
              }
              Activar 2FA
            </button>
          </div>
        )}

        {/* Estado: setup — mostrar QR / secreto */}
        {step === "setup" && setupData && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              <strong>1.</strong> Abre tu app de autenticación (Google Authenticator, Authy, etc.)
              y escanea el código QR, o agrega la cuenta manualmente con la clave de abajo.
            </p>

            {/* QR code via Google Charts — no expone el secreto directamente */}
            <div className="flex justify-center">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(setupData.provisioning_uri)}`}
                alt="Código QR para autenticador"
                className="rounded-xl border border-gray-200 shadow-sm"
                width={200}
                height={200}
              />
            </div>

            {/* Clave manual */}
            <div>
              <p className="text-xs text-gray-500 mb-1">O ingresa esta clave manualmente:</p>
              <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                <span className="font-mono text-sm text-gray-700 break-all flex-1 tracking-widest">
                  {setupData.secret}
                </span>
                <button
                  onClick={copySecret}
                  className="text-gray-400 hover:text-gray-600 flex-shrink-0"
                  title="Copiar clave"
                >
                  {copied ? <CheckCheck size={16} className="text-green-500" /> : <Copy size={16} />}
                </button>
              </div>
            </div>

            <p className="text-sm text-gray-600">
              <strong>2.</strong> Ingresa el código de 6 dígitos que muestra tu app para confirmar.
            </p>

            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="auth-input text-center text-xl tracking-widest font-bold"
            />

            <button
              onClick={handleEnable}
              disabled={loading || code.length < 6}
              className="auth-btn-primary w-full"
            >
              {loading
                ? <><Loader2 className="h-4 w-4 animate-spin inline mr-2" />Activando...</>
                : "Confirmar y activar"
              }
            </button>
            <button
              type="button"
              onClick={() => { setStep("idle"); setSetupData(null); setCode("") }}
              className="w-full text-sm text-gray-500 hover:text-gray-700 py-1"
            >
              Cancelar
            </button>
          </div>
        )}

        {/* Estado: done */}
        {step === "done" && (
          <div className="text-center space-y-4">
            <ShieldCheck className="h-14 w-14 text-green-500 mx-auto" />
            <p className="text-gray-700 font-medium">
              ¡2FA activado! Tu cuenta ahora está protegida con autenticación de dos factores.
            </p>
          </div>
        )}

        {/* Desactivar 2FA (si ya está activado) */}
        {has2FA && !showDisable && (
          <div className="space-y-4">
            <div className="rounded-xl bg-green-50 border border-green-100 p-4 text-sm text-green-700 flex items-center gap-2">
              <ShieldCheck size={18} />
              El 2FA está activado en tu cuenta.
            </div>
            <button
              onClick={() => { setShowDisable(true); setError("") }}
              className="w-full border border-red-300 text-red-600 rounded-xl py-2.5 text-sm font-medium
                         hover:bg-red-50 transition-colors flex items-center justify-center gap-2"
            >
              <ShieldOff size={16} /> Desactivar 2FA
            </button>
          </div>
        )}

        {showDisable && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600 font-medium">Confirma para desactivar el 2FA:</p>
            <input
              type="password"
              placeholder="Tu contraseña actual"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="auth-input"
            />
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="Código de 6 dígitos"
              value={disableCode}
              onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="auth-input text-center tracking-widest font-bold"
            />
            <button
              onClick={handleDisable}
              disabled={loading}
              className="w-full bg-red-600 text-white rounded-xl py-2.5 text-sm font-semibold
                         hover:bg-red-700 disabled:opacity-60 transition-colors"
            >
              {loading
                ? <><Loader2 className="h-4 w-4 animate-spin inline mr-2" />Desactivando...</>
                : "Confirmar desactivación"
              }
            </button>
            <button
              type="button"
              onClick={() => { setShowDisable(false); setError("") }}
              className="w-full text-sm text-gray-500 hover:text-gray-700 py-1"
            >
              Cancelar
            </button>
          </div>
        )}

      </div>
    </div>
  )
}
