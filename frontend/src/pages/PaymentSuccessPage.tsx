/**
 * PaymentSuccessPage.tsx — Pantalla de confirmación post-Stripe Checkout.
 *
 * Stripe redirige aquí después de un pago exitoso:
 *   /upgrade/success?session_id=cs_...
 *
 * Esta página:
 *   1. Invalida el query de billing-status para que el store refleje plan=pro
 *   2. Muestra un mensaje de éxito con animación
 *   3. Redirige al Dashboard después de 4 segundos
 */
import { useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { useQueryClient } from "@tanstack/react-query"
import { CheckCircle, Crown, ArrowRight } from "lucide-react"

export default function PaymentSuccessPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  useEffect(() => {
    // Invalidar cache para que el siguiente render tenga plan=pro
    queryClient.invalidateQueries({ queryKey: ["billing-status"] })
    queryClient.invalidateQueries({ queryKey: ["me"] })

    const timer = setTimeout(() => navigate("/"), 5000)
    return () => clearTimeout(timer)
  }, [navigate, queryClient])

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: "linear-gradient(135deg, #1c2b4b 0%, #2d4878 55%, #3a5a96 100%)" }}
    >
      <div
        className="text-center max-w-md w-full rounded-2xl p-10"
        style={{ background: "#ffffff", boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}
      >
        {/* Ícono de éxito */}
        <div
          className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full"
          style={{ background: "linear-gradient(135deg, #d1fae5, #a7f3d0)" }}
        >
          <CheckCircle className="h-10 w-10" style={{ color: "#16a34a" }} />
        </div>

        {/* Badge Pro */}
        <div className="flex items-center justify-center gap-2 mb-3">
          <Crown className="h-5 w-5" style={{ color: "#eab308" }} />
          <span
            className="text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full"
            style={{ background: "#fef3c7", color: "#92400e" }}
          >
            Plan Pro Activo
          </span>
        </div>

        <h1 className="text-2xl font-extrabold mb-2" style={{ color: "#111827" }}>
          ¡Pago confirmado!
        </h1>
        <p className="text-sm mb-6 leading-relaxed" style={{ color: "#6b7280" }}>
          Tu suscripción a <strong style={{ color: "#111827" }}>SAFPRO Pro</strong> está activa.
          En unos segundos recibirás un email de confirmación con los detalles.
        </p>

        {/* Features highlight */}
        <div
          className="rounded-xl p-4 mb-6 text-left"
          style={{ background: "#f9fafb" }}
        >
          <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: "#9ca3af" }}>
            Ahora tienes acceso a
          </p>
          {[
            "Archivos ilimitados cada mes",
            "Historial financiero completo",
            "Simulaciones y planificador",
            "Soporte prioritario",
          ].map((f) => (
            <div key={f} className="flex items-center gap-2 py-1">
              <CheckCircle className="h-3.5 w-3.5 shrink-0" style={{ color: "#22c55e" }} />
              <span className="text-sm" style={{ color: "#4b5563" }}>{f}</span>
            </div>
          ))}
        </div>

        <button
          onClick={() => navigate("/")}
          className="flex items-center justify-center gap-2 w-full py-3 rounded-xl font-bold text-sm transition-all"
          style={{ background: "#e05c19", color: "#fff" }}
        >
          Ir al Dashboard
          <ArrowRight className="h-4 w-4" />
        </button>

        <p className="text-xs mt-4" style={{ color: "#9ca3af" }}>
          Redirigiendo automáticamente en 5 segundos…
        </p>
      </div>
    </div>
  )
}
