import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Link, useNavigate } from "react-router-dom"
import { TrendingUp, Loader2, Mail, Lock, Eye, EyeOff, User } from "lucide-react"
import { register as apiRegister } from "@/api/auth"
import { login } from "@/api/auth"
import { getMe } from "@/api/users"
import { getProfile } from "@/api/profile"
import { useAuthStore } from "@/stores/authStore"
import { parseApiError } from "@/lib/utils"

const schema = z.object({
  full_name: z.string().min(2, "Nombre muy corto"),
  email: z.string().email("Email inválido"),
  password: z.string().min(8, "Mínimo 8 caracteres"),
  confirm: z.string(),
}).refine((d) => d.password === d.confirm, {
  message: "Las contraseñas no coinciden",
  path: ["confirm"],
})
type FormData = z.infer<typeof schema>

export default function RegisterPage() {
  const navigate = useNavigate()
  const setToken = useAuthStore((s) => s.setToken)
  const setUser = useAuthStore((s) => s.setUser)
  const [apiError, setApiError] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  async function onSubmit(data: FormData) {
    setApiError("")
    try {
      await apiRegister(data.email, data.password, data.full_name)
      // Tras registrar, hacer login automático (nuevos usuarios no tienen 2FA)
      const tokenRes = await login(data.email, data.password)
      if (!tokenRes.access_token) throw new Error("Error al iniciar sesión automáticamente")
      setToken(tokenRes.access_token)
      const me = await getMe()
      setUser(me)
      // Los nuevos usuarios siempre van al onboarding
      try {
        const profile = await getProfile()
        if (!profile.onboarding_completed) {
          navigate("/onboarding")
        } else {
          navigate("/")
        }
      } catch {
        navigate("/onboarding")
      }
    } catch (err: unknown) {
      setApiError(parseApiError(err, "Error al crear la cuenta"))
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
          <h1 className="text-2xl font-bold text-gray-800">Crear cuenta</h1>
          <p className="text-sm text-gray-500 mt-1">Empieza a analizar tus finanzas hoy</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">

          {/* Nombre completo */}
          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700">Nombre completo</label>
            <div className="auth-input-wrap">
              <User className="auth-input-icon" size={16} />
              <input
                type="text"
                placeholder="Alexis Pineda"
                className="auth-input"
                {...register("full_name")}
              />
            </div>
            {errors.full_name && (
              <p className="text-xs text-red-500 mt-0.5">{errors.full_name.message}</p>
            )}
          </div>

          {/* Email */}
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

          {/* Contraseña */}
          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700">Contraseña</label>
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
                aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
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
                aria-label={showConfirm ? "Ocultar confirmación" : "Mostrar confirmación"}
              >
                {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            {errors.confirm && (
              <p className="text-xs text-red-500 mt-0.5">{errors.confirm.message}</p>
            )}
          </div>

          {/* API Error */}
          {apiError && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600">
              {apiError}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="auth-btn-primary w-full"
          >
            {isSubmitting
              ? <><Loader2 className="h-4 w-4 animate-spin inline mr-2" />Creando cuenta...</>
              : "Crear cuenta"
            }
          </button>
        </form>

        {/* Divider */}
        <div className="auth-divider">
          <span>O continuar con</span>
        </div>

        {/* Botones OAuth */}
        <div className="grid grid-cols-2 gap-3">
          <a href="/api/v1/auth/google" className="auth-social-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" className="mr-2 flex-shrink-0">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Google
          </a>
          <a href="/api/v1/auth/github" className="auth-social-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="mr-2 flex-shrink-0">
              <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
            </svg>
            GitHub
          </a>
        </div>

        {/* Login link */}
        <p className="text-center text-sm text-gray-500 mt-5">
          ¿Ya tienes una cuenta?{" "}
          <Link to="/login" className="font-semibold auth-link">
            Iniciar sesión
          </Link>
        </p>

        {/* Privacy link */}
        <p className="text-center text-xs mt-3" style={{ color: "rgba(255,255,255,0.25)" }}>
          Al registrarte aceptas nuestros{" "}
          <Link to="/terms" className="auth-link" style={{ fontSize: "inherit" }}>
            Términos de Uso
          </Link>
          {" "}y nuestra{" "}
          <Link to="/privacy" className="auth-link" style={{ fontSize: "inherit" }}>
            Política de Privacidad
          </Link>
        </p>
      </div>
    </div>
  )
}
