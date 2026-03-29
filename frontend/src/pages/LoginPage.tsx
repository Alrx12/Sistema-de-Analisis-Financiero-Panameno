import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Link, useNavigate } from "react-router-dom"
import { TrendingUp, Loader2, Mail, Lock, Eye, EyeOff } from "lucide-react"
import { login } from "@/api/auth"
import { getMe } from "@/api/users"
import { getProfile } from "@/api/profile"
import { useAuthStore } from "@/stores/authStore"
import { parseApiError } from "@/lib/utils"
import TwoFactorPage from "@/pages/TwoFactorPage"

const schema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(1, "Contraseña requerida"),
  remember: z.boolean().optional(),
})
type FormData = z.infer<typeof schema>

export default function LoginPage() {
  const navigate = useNavigate()
  const setToken = useAuthStore((s) => s.setToken)
  const setUser = useAuthStore((s) => s.setUser)
  const [apiError, setApiError] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [twoFactorToken, setTwoFactorToken] = useState<string | null>(null)

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  async function onSubmit(data: FormData) {
    setApiError("")
    try {
      const res = await login(data.email, data.password)

      if (res.requires_2fa && res.two_factor_token) {
        setTwoFactorToken(res.two_factor_token)
        return
      }

      if (!res.access_token) {
        setApiError("Respuesta inesperada del servidor.")
        return
      }

      setToken(res.access_token)
      const me = await getMe()
      setUser(me)
      try {
        const profile = await getProfile()
        navigate(profile.onboarding_completed ? "/" : "/onboarding")
      } catch {
        navigate("/")
      }
    } catch (err: unknown) {
      setApiError(parseApiError(err, "Credenciales incorrectas"))
    }
  }

  if (twoFactorToken) {
    return (
      <TwoFactorPage
        twoFactorToken={twoFactorToken}
        onCancel={() => setTwoFactorToken(null)}
      />
    )
  }

  return (
    <div className="auth-page flex" style={{ background: "#070c18" }}>

      {/* ══════ PANEL IZQUIERDO — Branding ══════ */}
      <div className="auth-panel-left hidden lg:flex" style={{ flex: "0 0 48%" }}>
        {/* Logo */}
        <div className="auth-brand-logo">
          <div className="auth-brand-icon">
            <TrendingUp className="h-5 w-5 text-white" />
          </div>
          <div>
            <div className="auth-brand-name">SAFPRO</div>
            <div className="auth-brand-sub">Financial AI</div>
          </div>
        </div>

        {/* Tagline */}
        <div className="auth-tagline">
          Tus finanzas,<br />
          <span className="auth-tagline-gradient">finalmente claras.</span>
        </div>
        <p className="auth-tagline-desc">
          Sube tu estado de cuenta y SAFPRO categoriza todo automáticamente — sin compartir claves bancarias.
        </p>

        {/* Features */}
        <div className="auth-feature-row">
          <span className="auth-feature-icon">🤖</span>
          <div className="auth-feature-text">
            <strong>IA que aprende contigo</strong>
            <span>Corriges una vez, recuerda para siempre</span>
          </div>
        </div>
        <div className="auth-feature-row">
          <span className="auth-feature-icon">🔒</span>
          <div className="auth-feature-text">
            <strong>Tus datos, solo tuyos</strong>
            <span>Sin acceso a tus credenciales bancarias</span>
          </div>
        </div>
        <div className="auth-feature-row">
          <span className="auth-feature-icon">🏦</span>
          <div className="auth-feature-text">
            <strong>4 bancos soportados</strong>
            <span>Banco General, BAC, Banistmo, Banesco</span>
          </div>
        </div>
      </div>

      {/* ══════ PANEL DERECHO — Formulario ══════ */}
      <div className="auth-panel-right" style={{ flex: 1 }}>
        <div className="auth-card" style={{ width: "100%", maxWidth: 360 }}>

          {/* Logo visible solo en móvil */}
          <div className="flex items-center gap-3 mb-8 lg:hidden">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-xl text-white"
              style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}
            >
              <TrendingUp className="h-5 w-5" />
            </div>
            <span className="text-lg font-bold" style={{ color: "#f1f5f9" }}>SAFPRO</span>
          </div>

          <div className="auth-form-title">Bienvenido de vuelta</div>
          <div className="auth-form-sub">Inicia sesión para continuar</div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">

            {/* Email */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.35)" }}>
                Correo electrónico
              </label>
              <div className="auth-input-wrap">
                <Mail className="auth-input-icon" size={15} />
                <input
                  type="email"
                  placeholder="tu@email.com"
                  className="auth-input"
                  {...register("email")}
                />
              </div>
              {errors.email && (
                <p className="text-xs mt-0.5" style={{ color: "#fb7185" }}>{errors.email.message}</p>
              )}
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.35)" }}>
                Contraseña
              </label>
              <div className="auth-input-wrap">
                <Lock className="auth-input-icon" size={15} />
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
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
                <p className="text-xs mt-0.5" style={{ color: "#fb7185" }}>{errors.password.message}</p>
              )}
            </div>

            {/* Remember + Forgot */}
            <div className="flex items-center justify-between pt-0.5">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="auth-checkbox"
                  {...register("remember")}
                />
                <span className="text-sm" style={{ color: "rgba(255,255,255,0.45)" }}>Recordarme</span>
              </label>
              <Link to="/forgot-password" className="text-sm font-medium auth-link">
                ¿Olvidaste tu contraseña?
              </Link>
            </div>

            {/* API Error */}
            {apiError && (
              <div
                className="rounded-lg px-3 py-2 text-sm"
                style={{ background: "rgba(244,63,94,0.1)", border: "1px solid rgba(244,63,94,0.25)", color: "#fb7185" }}
              >
                {apiError}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="auth-btn-primary w-full mt-1"
            >
              {isSubmitting
                ? <><Loader2 className="h-4 w-4 animate-spin inline mr-2" />Ingresando...</>
                : "Iniciar sesión"
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
              <svg width="15" height="15" viewBox="0 0 24 24" className="mr-2 flex-shrink-0">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Google
            </a>
            <a href="/api/v1/auth/github" className="auth-social-btn">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" className="mr-2 flex-shrink-0">
                <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
              </svg>
              GitHub
            </a>
          </div>

          {/* Register link */}
          <p className="text-center text-sm mt-5" style={{ color: "rgba(255,255,255,0.35)" }}>
            ¿No tienes una cuenta?{" "}
            <Link to="/register" className="font-semibold auth-link">
              Regístrate aquí
            </Link>
          </p>

          {/* Privacy link */}
          <p className="text-center text-xs mt-3" style={{ color: "rgba(255,255,255,0.2)" }}>
            <Link to="/privacy" className="auth-link" style={{ fontSize: "inherit" }}>
              Política de Privacidad
            </Link>
            {" · "}
            <Link to="/faq" className="auth-link" style={{ fontSize: "inherit" }}>
              Preguntas frecuentes
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
