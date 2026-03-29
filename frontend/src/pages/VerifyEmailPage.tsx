import { useEffect, useState } from "react"
import { useSearchParams, Link } from "react-router-dom"
import { TrendingUp, CheckCircle, XCircle, Loader2 } from "lucide-react"
import { verifyEmail } from "@/api/auth"

type Status = "loading" | "success" | "error"

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams()
  const [status, setStatus] = useState<Status>("loading")
  const [message, setMessage] = useState("")

  useEffect(() => {
    const token = searchParams.get("token")
    if (!token) {
      setStatus("error")
      setMessage("No se encontró el token de verificación.")
      return
    }

    verifyEmail(token)
      .then((res: { message: string }) => {
        setStatus("success")
        setMessage(res.message || "¡Email verificado correctamente!")
      })
      .catch(() => {
        setStatus("error")
        setMessage("El enlace es inválido o ya expiró. Solicita un nuevo email de verificación.")
      })
  }, [searchParams])

  return (
    <div className="auth-page auth-gradient flex items-center justify-center p-4">
      <div className="auth-card w-full max-w-sm text-center">

        {/* Logo */}
        <div className="auth-avatar-wrap">
          <div className="auth-avatar">
            <TrendingUp className="h-8 w-8 text-white" />
          </div>
        </div>

        {status === "loading" && (
          <>
            <Loader2 className="h-10 w-10 animate-spin text-blue-500 mx-auto mb-4" />
            <h1 className="text-xl font-bold text-gray-800 mb-2">Verificando tu email…</h1>
            <p className="text-sm text-gray-500">Un momento por favor.</p>
          </>
        )}

        {status === "success" && (
          <>
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
            <h1 className="text-xl font-bold text-gray-800 mb-2">¡Email verificado!</h1>
            <p className="text-sm text-gray-500 mb-6">{message}</p>
            <Link to="/login" className="auth-btn-primary w-full inline-block text-center">
              Ir al inicio de sesión
            </Link>
          </>
        )}

        {status === "error" && (
          <>
            <XCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h1 className="text-xl font-bold text-gray-800 mb-2">Enlace inválido</h1>
            <p className="text-sm text-gray-500 mb-6">{message}</p>
            <Link to="/login" className="auth-btn-primary w-full inline-block text-center">
              Volver al inicio de sesión
            </Link>
          </>
        )}

      </div>
    </div>
  )
}
