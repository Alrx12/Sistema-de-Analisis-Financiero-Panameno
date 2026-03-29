import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Link } from "react-router-dom"
import { TrendingUp, Loader2, Mail, CheckCircle2 } from "lucide-react"
import { forgotPassword } from "@/api/auth"
import { parseApiError } from "@/lib/utils"

const schema = z.object({
  email: z.string().email("Email inválido"),
})
type FormData = z.infer<typeof schema>

export default function ForgotPasswordPage() {
  const [apiError, setApiError] = useState("")
  const [sent, setSent] = useState(false)
  const [debugToken, setDebugToken] = useState<string | null>(null)

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  async function onSubmit(data: FormData) {
    setApiError("")
    try {
      const res = await forgotPassword(data.email)
      setSent(true)
      // En DEBUG=true el backend devuelve el token en el response
      if (res.reset_token) setDebugToken(res.reset_token)
    } catch (err: unknown) {
      setApiError(parseApiError(err, "Error al enviar el correo"))
    }
  }

  return (
    <div className="auth-page auth-gradient flex items-center justify-center p-4">
      {/* Card */}
      <div className="auth-card w-full max-w-sm">

        {/* Avatar */}
        <div className="auth-avatar-wrap">
          <div className="auth-avatar">
            <TrendingUp className="h-8 w-8 text-white" />
          </div>
        </div>

        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-gray-800">Recuperar contraseña</h1>
          <p className="text-sm text-gray-500 mt-1">
            Ingresa tu email y te enviaremos un enlace de recuperación
          </p>
        </div>

        {sent ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-xl bg-green-50 border border-green-200 p-4 text-green-800">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="font-medium text-sm">Correo enviado</p>
                <p className="text-sm mt-0.5">
                  Si ese email existe, recibirás un enlace de recuperación en los próximos minutos.
                </p>
              </div>
            </div>
            {/* Solo en desarrollo (DEBUG=true) el backend devuelve el token directo */}
            {debugToken && (
              <div className="rounded-xl bg-yellow-50 border border-yellow-200 p-3 text-xs text-yellow-800 space-y-1">
                <p className="font-semibold">Modo DEBUG — token de reset:</p>
                <code className="break-all font-mono">{debugToken}</code>
                <p className="mt-1">
                  <Link
                    to={`/reset-password?token=${debugToken}`}
                    className="font-medium auth-link underline"
                  >
                    Usar este token →
                  </Link>
                </p>
              </div>
            )}
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Correo electrónico</label>
              <div className="auth-input-wrap">
                <Mail className="auth-input-icon" size={16} />
                <input
                  type="email"
                  placeholder="tu@email.com"
                  className="auth-input"
                  {...register("email")}
                />
              </div>
              {errors.email && (
                <p className="text-xs text-red-500 mt-0.5">{errors.email.message}</p>
              )}
            </div>

            {apiError && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600">
                {apiError}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="auth-btn-primary w-full"
            >
              {isSubmitting
                ? <><Loader2 className="h-4 w-4 animate-spin inline mr-2" />Enviando...</>
                : "Enviar enlace de recuperación"
              }
            </button>
          </form>
        )}

        {/* Back to login */}
        <p className="text-center text-sm text-gray-500 mt-5">
          <Link to="/login" className="font-semibold auth-link">
            ← Volver al login
          </Link>
        </p>
      </div>
    </div>
  )
}
