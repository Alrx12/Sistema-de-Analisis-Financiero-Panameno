import { useState, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { TrendingUp, Loader2, ShieldCheck } from "lucide-react"
import { verify2FA } from "@/api/auth"
import { getMe } from "@/api/users"
import { getProfile } from "@/api/profile"
import { useAuthStore } from "@/stores/authStore"
import { parseApiError } from "@/lib/utils"

interface Props {
  twoFactorToken: string
  onCancel: () => void
}

export default function TwoFactorPage({ twoFactorToken, onCancel }: Props) {
  const navigate = useNavigate()
  const setToken = useAuthStore((s) => s.setToken)
  const setUser = useAuthStore((s) => s.setUser)

  const [code, setCode] = useState(["", "", "", "", "", ""])
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const inputs = useRef<(HTMLInputElement | null)[]>([])

  function handleChange(index: number, value: string) {
    if (!/^\d*$/.test(value)) return
    const next = [...code]
    next[index] = value.slice(-1)
    setCode(next)
    if (value && index < 5) {
      inputs.current[index + 1]?.focus()
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !code[index] && index > 0) {
      inputs.current[index - 1]?.focus()
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault()
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6)
    if (pasted.length === 6) {
      setCode(pasted.split(""))
      inputs.current[5]?.focus()
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const fullCode = code.join("")
    if (fullCode.length < 6) {
      setError("Ingresa el código de 6 dígitos.")
      return
    }
    setError("")
    setLoading(true)
    try {
      const tokenRes = await verify2FA(twoFactorToken, fullCode)
      setToken(tokenRes.access_token)
      const me = await getMe()
      setUser(me)
      try {
        const profile = await getProfile()
        navigate(profile.onboarding_completed ? "/" : "/onboarding")
      } catch {
        navigate("/")
      }
    } catch (err: unknown) {
      setError(parseApiError(err, "Código incorrecto. Intenta de nuevo."))
      setCode(["", "", "", "", "", ""])
      inputs.current[0]?.focus()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page auth-gradient flex items-center justify-center p-4">
      <div className="auth-card w-full max-w-sm">

        {/* Avatar */}
        <div className="auth-avatar-wrap">
          <div className="auth-avatar">
            <TrendingUp className="h-8 w-8 text-white" />
          </div>
        </div>

        {/* Header */}
        <div className="text-center mb-6">
          <div className="flex justify-center mb-3">
            <ShieldCheck className="h-10 w-10 text-blue-500" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800">Autenticación de dos factores</h1>
          <p className="text-sm text-gray-500 mt-1">
            Ingresa el código de 6 dígitos de tu app de autenticación.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Código de 6 dígitos */}
          <div className="flex justify-center gap-2" onPaste={handlePaste}>
            {code.map((digit, i) => (
              <input
                key={i}
                ref={(el) => { inputs.current[i] = el }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                className="w-11 h-12 text-center text-xl font-bold border-2 border-gray-200 rounded-lg
                           focus:border-blue-500 focus:outline-none transition-colors
                           bg-white text-gray-800"
                autoFocus={i === 0}
              />
            ))}
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600 text-center">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || code.join("").length < 6}
            className="auth-btn-primary w-full"
          >
            {loading
              ? <><Loader2 className="h-4 w-4 animate-spin inline mr-2" />Verificando...</>
              : "Verificar código"
            }
          </button>

          <button
            type="button"
            onClick={onCancel}
            className="w-full text-sm text-gray-500 hover:text-gray-700 py-1"
          >
            ← Volver al inicio de sesión
          </button>
        </form>
      </div>
    </div>
  )
}
