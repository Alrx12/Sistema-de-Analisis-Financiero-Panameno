import { useEffect, useState } from "react"
import { useSearchParams, useNavigate } from "react-router-dom"
import { TrendingUp, Loader2, XCircle } from "lucide-react"
import { getMe } from "@/api/users"
import { getProfile } from "@/api/profile"
import { useAuthStore } from "@/stores/authStore"

const ERROR_MESSAGES: Record<string, string> = {
  oauth_cancelled: "Cancelaste el inicio de sesión.",
  invalid_state: "La solicitud expiró. Intenta de nuevo.",
  oauth_error: "Ocurrió un error con el proveedor. Intenta de nuevo.",
  missing_profile: "No pudimos obtener tu email del proveedor.",
}

export default function OAuthCallbackPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const setToken = useAuthStore((s) => s.setToken)
  const setUser = useAuthStore((s) => s.setUser)
  const [errorMsg, setErrorMsg] = useState("")

  useEffect(() => {
    const token = searchParams.get("token")
    const error = searchParams.get("error")

    if (error) {
      setErrorMsg(ERROR_MESSAGES[error] || "Error desconocido. Intenta de nuevo.")
      return
    }

    if (!token) {
      setErrorMsg("No se recibió el token de autenticación.")
      return
    }

    // Guardar token y redirigir
    setToken(token)
    getMe()
      .then((me) => {
        setUser(me)
        return getProfile()
          .then((profile) => navigate(profile.onboarding_completed ? "/" : "/onboarding", { replace: true }))
          .catch(() => navigate("/", { replace: true }))
      })
      .catch(() => {
        setErrorMsg("Error al obtener tu información. Intenta de nuevo.")
      })
  }, [searchParams, navigate, setToken, setUser])

  return (
    <div className="auth-page auth-gradient flex items-center justify-center p-4">
      <div className="auth-card w-full max-w-sm text-center">

        <div className="auth-avatar-wrap">
          <div className="auth-avatar">
            <TrendingUp className="h-8 w-8 text-white" />
          </div>
        </div>

        {!errorMsg ? (
          <>
            <Loader2 className="h-10 w-10 animate-spin text-blue-500 mx-auto mb-4" />
            <h1 className="text-xl font-bold text-gray-800 mb-2">Iniciando sesión…</h1>
            <p className="text-sm text-gray-500">Verificando tu cuenta, un momento.</p>
          </>
        ) : (
          <>
            <XCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h1 className="text-xl font-bold text-gray-800 mb-2">Error al iniciar sesión</h1>
            <p className="text-sm text-gray-500 mb-6">{errorMsg}</p>
            <button
              onClick={() => navigate("/login")}
              className="auth-btn-primary w-full"
            >
              Volver al inicio de sesión
            </button>
          </>
        )}

      </div>
    </div>
  )
}
