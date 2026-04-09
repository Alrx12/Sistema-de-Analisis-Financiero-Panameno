/**
 * UpgradePage.tsx — Página de precios y upgrade a Plan Pro.
 *
 * Flujo con dLocal Go:
 *   1. Usuario ve tabla Free vs Pro
 *   2. Elige intervalo (mensual / anual)
 *   3. Click en "Suscribirse" → POST /billing/create-checkout-session
 *   4. Redirige al hosted checkout de dLocal Go
 *   5. Al completar, dLocal Go notifica al backend via webhook
 *   6. El plan se actualiza automáticamente a 'pro'
 */
import { useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Check,
  Zap,
  Crown,
  ArrowLeft,
  Loader2,
  AlertCircle,
  X,
  AlertTriangle,
} from "lucide-react"
import { getBillingStatus, createCheckoutSession, cancelSubscription } from "@/api/billing"
import type { BillingInterval } from "@/api/billing"
import { useAuthStore } from "@/stores/authStore"
import { toast } from "@/components/ui/toast"

// ── Feature list ──────────────────────────────────────────────────────────────
const FREE_FEATURES = [
  "Hasta 5 archivos subidos",
  "Todos los bancos soportados (BG, BAC, Banistmo, Banesco, Credicorp)",
  "Categorización automática con IA",
  "Knowledge Base personal",
  "Metas de ahorro y billeteras manuales",
]

const PRO_FEATURES = [
  "Archivos ilimitados",
  "Historial financiero completo",
  "Knowledge Base avanzado (sin límite de entradas)",
  "Simulaciones y planificador de quincena",
  "Presupuesto personalizado 50/30/20",
  "Análisis de estacionalidad y runway",
  "Soporte prioritario",
]

export default function UpgradePage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const wasCancelled = searchParams.get("cancelled") === "1"
  const user = useAuthStore((s) => s.user)

  const [interval, setInterval] = useState<BillingInterval>("monthly")
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)

  // Estado de la suscripción
  const { data: billing, isLoading: billingLoading } = useQuery({
    queryKey: ["billing-status"],
    queryFn: getBillingStatus,
    staleTime: 1000 * 60,
  })

  // Crear checkout session → redirigir a dLocal Go
  const checkoutMutation = useMutation({
    mutationFn: (iv: BillingInterval) => createCheckoutSession(iv),
    onSuccess: (data) => {
      window.location.href = data.checkout_url
    },
    onError: () => {
      toast("No se pudo iniciar el pago. Intenta de nuevo.", "error")
    },
  })

  // Cancelar suscripción activa
  const cancelMutation = useMutation({
    mutationFn: cancelSubscription,
    onSuccess: () => {
      toast("Suscripción cancelada. Tu plan ha bajado a Gratis.", "info")
      setShowCancelConfirm(false)
      queryClient.invalidateQueries({ queryKey: ["billing-status"] })
      queryClient.invalidateQueries({ queryKey: ["user"] })
    },
    onError: (err: Error) => {
      toast(err.message || "No se pudo cancelar la suscripción.", "error")
      setShowCancelConfirm(false)
    },
  })

  const isPro = billing?.plan === "pro"
  const isFF = billing?.plan === "friends_and_family"
  const hasActiveSub = billing?.has_active_subscription ?? false

  const monthlyPrice = 5
  const annualPrice = 45
  const annualMonthly = (annualPrice / 12).toFixed(2)

  return (
    <div style={{ minHeight: "100vh", background: "#f4f5f7", color: "#111827" }}>

      {/* ── Modal de confirmación de cancelación ── */}
      {showCancelConfirm && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.5)" }}
        >
          <div
            className="w-full max-w-md rounded-2xl p-6"
            style={{ background: "#ffffff", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-full" style={{ background: "#fef2f2" }}>
                <AlertTriangle className="h-5 w-5" style={{ color: "#dc2626" }} />
              </div>
              <h3 className="font-bold text-lg" style={{ color: "#111827" }}>
                ¿Cancelar el Plan Pro?
              </h3>
            </div>
            <p className="text-sm mb-1" style={{ color: "#4b5563" }}>
              Tu plan bajará a <strong>Gratis</strong> de inmediato. Conservarás todos
              tus análisis e historial, pero perderás acceso a:
            </p>
            <ul className="text-sm mt-2 mb-5 space-y-1 pl-4" style={{ color: "#6b7280" }}>
              <li>• Archivos ilimitados (límite de 5)</li>
              <li>• Simulaciones y planificador de quincena</li>
              <li>• Presupuesto personalizado</li>
            </ul>
            <div className="flex gap-3">
              <button
                onClick={() => setShowCancelConfirm(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors"
                style={{ background: "#f3f4f6", color: "#374151" }}
              >
                No, mantener Pro
              </button>
              <button
                onClick={() => cancelMutation.mutate()}
                disabled={cancelMutation.isPending}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
                style={{ background: "#dc2626", color: "#fff" }}
              >
                {cancelMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Sí, cancelar"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <div style={{ background: "var(--sidebar-bg)" }} className="px-6 py-4">
        <div style={{ maxWidth: "1024px", margin: "0 auto" }} className="flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-sm font-medium text-white/70 hover:text-white transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver
          </button>
          <div className="flex items-center gap-2">
            <Crown className="h-5 w-5 text-yellow-400" />
            <span className="text-white font-bold text-lg">Planes SAFPRO</span>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: "1024px", margin: "0 auto", padding: "2.5rem 1rem" }}>

        {/* ── Título ── */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2" style={{ color: "#111827" }}>
            Elige tu plan
          </h1>
          <p className="text-base" style={{ color: "#6b7280" }}>
            Empieza gratis y actualiza cuando estés listo.
            No pedimos credenciales bancarias, nunca.
          </p>
        </div>

        {/* ── Banner: ya eres Pro ── */}
        {!billingLoading && isPro && (
          <div
            className="mb-8 rounded-xl p-4 flex items-center gap-3"
            style={{ background: "linear-gradient(135deg, #1c2b4b, #2d4878)" }}
          >
            <Crown className="h-6 w-6 text-yellow-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-white font-semibold">Tienes el Plan Pro activo</p>
              {billing?.subscription_expires_at && (
                <p className="text-white/60 text-sm">
                  Próximo cobro el{" "}
                  {new Date(billing.subscription_expires_at).toLocaleDateString("es-PA", {
                    day: "numeric", month: "long", year: "numeric",
                  })}
                </p>
              )}
            </div>
            {hasActiveSub && (
              <button
                onClick={() => setShowCancelConfirm(true)}
                className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                style={{ background: "rgba(255,255,255,0.10)", color: "rgba(255,255,255,0.75)" }}
              >
                <X className="h-4 w-4" />
                Cancelar suscripción
              </button>
            )}
          </div>
        )}

        {/* ── Banner: Friends & Family ── */}
        {!billingLoading && isFF && (
          <div
            className="mb-8 rounded-xl p-4 flex items-start gap-3"
            style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}
          >
            <Zap className="h-5 w-5 text-white shrink-0 mt-0.5" />
            <div>
              <p className="text-white font-semibold text-sm">Acceso Friends & Family activo</p>
              <p className="text-white/70 text-sm mt-0.5">
                Tienes acceso completo durante el beta. Suscríbete al Plan Pro para mantener el acceso cuando el período termine.
              </p>
            </div>
          </div>
        )}

        {/* ── Banner: pago cancelado ── */}
        {wasCancelled && (
          <div
            className="mb-6 rounded-xl p-4 flex items-center gap-3"
            style={{ background: "#fff3cd", border: "1px solid #ffc107" }}
          >
            <AlertCircle className="h-5 w-5 text-yellow-600 shrink-0" />
            <p className="text-yellow-800 text-sm">
              Cancelaste el proceso de pago. Puedes intentarlo de nuevo cuando quieras.
            </p>
          </div>
        )}

        {/* ── Toggle intervalo ── */}
        {!isPro && (
          <div className="flex items-center justify-center gap-2 mb-8">
            <button
              onClick={() => setInterval("monthly")}
              className="px-5 py-2 rounded-full text-sm font-semibold transition-all"
              style={
                interval === "monthly"
                  ? { background: "#1c2b4b", color: "#fff" }
                  : { background: "#e5e7eb", color: "#374151" }
              }
            >
              Mensual
            </button>
            <button
              onClick={() => setInterval("annual")}
              className="px-5 py-2 rounded-full text-sm font-semibold transition-all relative"
              style={
                interval === "annual"
                  ? { background: "#1c2b4b", color: "#fff" }
                  : { background: "#e5e7eb", color: "#374151" }
              }
            >
              Anual
              <span
                className="absolute -top-2 -right-2 text-xs font-bold px-1.5 py-0.5 rounded-full"
                style={{ background: "#e05c19", color: "#fff" }}
              >
                −25%
              </span>
            </button>
          </div>
        )}

        {/* ── Tarjetas de plan ── */}
        <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">

          {/* Plan Gratis */}
          <div className="rounded-2xl p-6 flex flex-col" style={{ background: "#ffffff", boxShadow: "0 1px 6px rgba(0,0,0,0.08)" }}>
            <div className="mb-4">
              <span className="text-xs font-bold uppercase tracking-widest" style={{ color: "#9ca3af" }}>Plan Gratis</span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-4xl font-extrabold" style={{ color: "#111827" }}>$0</span>
                <span className="text-sm" style={{ color: "#9ca3af" }}>/mes</span>
              </div>
              <p className="text-sm mt-1" style={{ color: "#6b7280" }}>Para empezar y probar el sistema.</p>
            </div>
            <ul className="space-y-2.5 flex-1 mb-6">
              {FREE_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2.5">
                  <Check className="h-4 w-4 mt-0.5 shrink-0" style={{ color: "#22c55e" }} />
                  <span className="text-sm" style={{ color: "#4b5563" }}>{f}</span>
                </li>
              ))}
            </ul>
            {!isPro && (
              <div
                className="text-center text-sm font-semibold py-3 rounded-xl"
                style={{ background: "#f3f4f6", color: "#6b7280" }}
              >
                {user?.plan === "free" ? "Plan actual" : "Incluido al registrarse"}
              </div>
            )}
          </div>

          {/* Plan Pro */}
          <div
            className="rounded-2xl p-6 flex flex-col relative overflow-hidden"
            style={{
              background: "linear-gradient(145deg, #1c2b4b 0%, #2d4878 100%)",
              boxShadow: "0 8px 32px rgba(28,43,75,0.25)",
            }}
          >
            <div
              className="absolute top-4 right-4 text-xs font-bold px-2.5 py-1 rounded-full"
              style={{ background: "#e05c19", color: "#fff" }}
            >
              Recomendado
            </div>

            <div className="mb-4">
              <span className="text-xs font-bold uppercase tracking-widest text-white/50">Plan Pro</span>
              <div className="flex items-baseline gap-1 mt-1">
                {interval === "annual" ? (
                  <>
                    <span className="text-4xl font-extrabold text-white">${annualMonthly}</span>
                    <span className="text-white/50 text-sm">/mes</span>
                    <span className="text-white/40 text-xs ml-1">(${annualPrice}/año)</span>
                  </>
                ) : (
                  <>
                    <span className="text-4xl font-extrabold text-white">${monthlyPrice}</span>
                    <span className="text-white/50 text-sm">/mes</span>
                  </>
                )}
              </div>
              <p className="text-white/50 text-sm mt-1">
                {interval === "annual"
                  ? "Facturado $45 al año — ahorras $15"
                  : "Facturado mensualmente"}
              </p>
            </div>

            <ul className="space-y-2.5 flex-1 mb-6">
              {PRO_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2.5">
                  <Check className="h-4 w-4 text-yellow-400 mt-0.5 shrink-0" />
                  <span className="text-white/85 text-sm">{f}</span>
                </li>
              ))}
            </ul>

            {isPro ? (
              <div
                className="text-center text-sm font-semibold py-3 rounded-xl"
                style={{ background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.7)" }}
              >
                Plan activo ✓
              </div>
            ) : (
              <button
                onClick={() => checkoutMutation.mutate(interval)}
                disabled={checkoutMutation.isPending}
                className="flex items-center justify-center gap-2 w-full py-3 rounded-xl font-bold text-sm transition-all"
                style={{ background: "#e05c19", color: "#fff" }}
              >
                {checkoutMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Redirigiendo al pago…
                  </>
                ) : (
                  <>
                    <Zap className="h-4 w-4" />
                    Suscribirse — Plan Pro
                  </>
                )}
              </button>
            )}

            {checkoutMutation.isError && (
              <p className="text-red-300 text-xs text-center mt-2">
                Error al iniciar el pago. Intenta de nuevo.
              </p>
            )}
          </div>
        </div>

        {/* ── Garantías ── */}
        <div className="mt-10 grid sm:grid-cols-3 gap-4 max-w-3xl mx-auto text-center">
          {[
            { emoji: "🔒", title: "Sin credenciales bancarias", desc: "Solo subes tu Excel exportado." },
            { emoji: "🚫", title: "Cancela cuando quieras", desc: "Sin permanencia ni penalizaciones." },
            { emoji: "💳", title: "Pagos seguros con dLocal Go", desc: "Merchant oficial en Panamá. Visa y Mastercard." },
          ].map(({ emoji, title, desc }) => (
            <div key={title} className="rounded-xl p-4" style={{ background: "#ffffff", boxShadow: "0 1px 6px rgba(0,0,0,0.08)" }}>
              <div className="text-2xl mb-2">{emoji}</div>
              <p className="font-semibold text-sm" style={{ color: "#1f2937" }}>{title}</p>
              <p className="text-xs mt-1" style={{ color: "#9ca3af" }}>{desc}</p>
            </div>
          ))}
        </div>

        {/* ── FAQ rápido ── */}
        <div className="mt-8 max-w-2xl mx-auto space-y-3">
          {[
            {
              q: "¿Tienen política de reembolsos?",
              a: "Sí. Plan mensual: reembolso completo si lo solicitas dentro de los 7 días calendario de tu primer pago — sin preguntas. Escríbenos a admin@safpro.us con el asunto 'Reembolso'. Plan anual: no reembolsable una vez procesado el pago.",
            },
            {
              q: "¿Qué pasa con mis datos si cancelo?",
              a: "Tus análisis e historial se conservan. Pasas al plan Gratis con límite de 5 archivos.",
            },
            {
              q: "¿Cómo cancelo mi suscripción?",
              a: 'Desde esta página, si tienes el Plan Pro activo, verás el botón "Cancelar suscripción" en el banner superior. Tu plan baja a Gratis de inmediato.',
            },
            {
              q: "¿Puedo cambiar de mensual a anual?",
              a: "Cancela el plan actual y suscríbete al plan anual. Si estás dentro del período de reembolso de 7 días, puedes solicitar el reembolso del mes ya pagado.",
            },
            {
              q: "¿Emiten factura?",
              a: "dLocal Go genera una confirmación de pago por email en cada cobro. Para factura fiscal contáctanos a admin@safpro.us.",
            },
          ].map(({ q, a }) => (
            <details
              key={q}
              className="rounded-xl px-4 py-3 cursor-pointer select-none group"
              style={{ background: "#ffffff", boxShadow: "0 1px 6px rgba(0,0,0,0.08)" }}
            >
              <summary className="font-semibold text-sm list-none flex justify-between items-center" style={{ color: "#1f2937" }}>
                {q}
                <span className="text-lg group-open:rotate-45 transition-transform" style={{ color: "#9ca3af" }}>+</span>
              </summary>
              <p className="text-sm mt-2" style={{ color: "#6b7280" }}>{a}</p>
            </details>
          ))}
        </div>
      </div>
    </div>
  )
}
