import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { TrendingUp, Loader2, Lock, Eye, EyeOff, CheckCircle2 } from "lucide-react"
import { resetPassword } from "@/api/auth"
import { parseApiError } from "@/lib/utils"

const schema = z.object({
  password: z.string().min(8, "Mínimo 8 caracteres"),
  confirm: z.string(),
}).refine((d) => d.password === d.confirm, {
  message: "Las contraseñas no coinciden",
  path: ["confirm"],
})
type FormData = z.infer<typeof schema>

export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get("token") ?? ""
  const [apiError, setApiError] = useState("")
  const [done, setDone] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  async function onSubmit(data: FormData) {
    if (!token) {
      setApiError("Token de recuperación faltante o inválido")
      return
    }
    setApiError("")
    try {
      await resetPassword(token, data.password)
      setDone(true)
      setTimeout(() => navigate("/login"), 2500)
    } catch (err: unknown) {
      setApiError(parseApiError(err, "Token inválido o expirado"))
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
          <h1 className="text-2xl font-bold text-gray-800">Nueva contraseña</h1>
          <p className="text-sm text-gray-500 mt-1">Elige una contraseña segura para tu cuenta</p>
        </div>

        {!token && !done && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600 mb-4">
            Token de recuperación faltante. Verifica el enlace en tu correo.
          </div>
        )}

        {done ? (
          <div className="flex items-start gap-3 rounded-xl bg-green-50 border border-green-200 p-4 text-green-800">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-medium text-sm">Contraseña actualizada</p>
              <p className="text-sm mt-0.5">Redirigiendo al login…</p>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">

            {/* Nueva contraseña */}
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Nueva contraseña</label>
              <div className="auth-input-wrap">
                <Lock className="auth-input-icon" size={16} />
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Mínimo 8 caracteres"
                  className="auth-input auth-input-password"
                  {...register("password")}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="auth-eye-btn"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {errors.password && (
                <p className="text-xs text-red-500 mt-0.5">{errors.password.message}</p>
              )}
            </div>

            {/* Confirmar contraseña */}
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Confirmar contraseña</label>
              <div className="auth-input-wrap">
                <Lock className="auth-input-icon" size={16} />
                <input
                  type={showConfirm ? "text" : "password"}
                  placeholder="••••••••"
                  className="auth-input auth-input-password"
                  {...register("confirm")}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((v) => !v)}
                  className="auth-eye-btn"
                  tabIndex={-1}
                >
                  {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {errors.confirm && (
                <p className="text-xs text-red-500 mt-0.5">{errors.confirm.message}</p>
              )}
            </div>

            {apiError && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600">
                {apiError}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting || !token}
              className="auth-btn-primary w-full"
            >
              {isSubmitting
                ? <><Loader2 className="h-4 w-4 animate-spin inline mr-2" />Guardando...</>
                : "Guardar nueva contraseña"
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
