/**
 * UpgradePage.tsx — Página de precios y upgrade a Plan Pro.
 *
 * Flujo:
 *   1. Usuario ve tabla Free vs Pro
 *   2. Elige intervalo (mensual / anual)
 *   3. Click en "Suscribirse" → POST /billing/create-checkout-session
 *   4. Redirige al Stripe Checkout externo
 *   5. Al completar, Stripe redirige a /upgrade/success
 */
import { useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { useQuery, useMutation } from "@tanstack/react-query"
import {
  Check,
  Zap,
  Crown,
  ArrowLeft,
  Loader2,
  AlertCircle,
  Settings,
} from "lucide-react"
import { getBillingStatus, createCheckoutSession, getPortalUrl, BillingInterval } from "@/api/billing"
import { useAuthStore } from "@/stores/authStore"

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

// ── Helpers ───────────────────────────────────────────────────────────────────
function planLabel(plan: string) {
  if (plan === "pro") return "Plan Pro"
  if (plan === "friends_and_family") return "Friends & Family"
  return "Plan Gratis"
}

export default function UpgradePage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const wasCancelled = searchParams.get("cancelled") === "1"
  const user = useAuthStore((s) => s.user)

  const [interval, setInterval] = useState<BillingInterval>("annual")
  const [portalLoading, setPortalLoading] = useState(false)

  // Estado de la suscripción
  const { data: billing, isLoading: billingLoading } = useQuery({
    queryKey: ["billing-status"],
    queryFn: getBillingStatus,
    staleTime: 1000 * 60,   // 1 minuto
  })

  // Crear checkout session
  const checkoutMutation = useMutation({
    mutationFn: (iv: BillingInterval) => createCheckoutSession(iv),
    onSuccess: (data) => {
      // Redirigir al Stripe Checkout (fuera de la SPA)
      window.location.href = data.checkout_url
    },
  })

  // Abrir Customer Portal
  async function openPortal() {
    setPortalLoading(true)
    try {
      const data = await getPortalUrl()
      window.location.href = data.portal_url
    } catch {
      // Si falla silenciosamente, el usuario verá que nada pasa
    } finally {
      setPortalLoading(false)
    }
  }

  const isPro = billing?.plan === "pro"
  const isFF = billing?.plan === "friends_and_family"

  const monthlyPrice = 5
  const annualPrice = 45
  const annualMonthly = (annualPrice / 12).toFixed(2)   // $3.75

  return (
    <div className="min-h-screen" style={{ background: "#f4f5f7" }}>
      {/* ── Header ── */}
      <div style={{ background: "var(--sidebar-bg)" }} className="px-6 py-4 flex items-center gap-4">
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

      <div className="max-w-5xl mx-auto px-4 py-10">
        {/* ── Título ── */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Elige tu plan
          </h1>
          <p className="text-gray-500 text-base">
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
                  Se renueva el{" "}
                  {new Date(billing.subscription_expires_at).toLocaleDateString("es-PA", {
                    day: "numeric", month: "long", year: "numeric",
                  })}
                </p>
              )}
            </div>
            {billing?.has_stripe_customer && (
              <button
                onClick={openPortal}
                disabled={portalLoading}
                className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                style={{ background: "rgba(255,255,255,0.12)", color: "#fff" }}
              >
                {portalLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Settings className="h-4 w-4" />
                )}
                Gestionar suscripción
              </button>
            )}
          </div>
        )}

        {/* ── Banner: Friends & Family ── */}
        {!billingLoading && isFF && (
          <div
            className="mb-8 rounded-xl p-4 flex items-center gap-3"
            style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}
          >
            <Zap className="h-6 w-6 text-white shrink-0" />
            <p className="text-white font-medium">
              Eres parte del grupo Friends & Family — tienes acceso completo sin costo.
            </p>
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
        {!isPro && !isFF && (
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
          <div className="zoho-card rounded-2xl p-6 flex flex-col">
            <div className="mb-4">
              <span className="text-xs font-bold uppercase tracking-widest text-gray-400">Plan Gratis</span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-4xl font-extrabold text-gray-900">$0</span>
                <span className="text-gray-400 text-sm">/mes</span>
              </div>
              <p className="text-gray-500 text-sm mt-1">Para empezar y probar el sistema.</p>
            </div>

            <ul className="space-y-2.5 flex-1 mb-6">
              {FREE_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2.5">
                  <Check className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                  <span className="text-gray-600 text-sm">{f}</span>
                </li>
              ))}
            </ul>

            {!isPro && !isFF && (
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
            {/* Badge "Recomendado" */}
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

            {isPro || isFF ? (
              <div
                className="text-center text-sm font-semibold py-3 rounded-xl"
                style={{ background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.7)" }}
              >
                {isPro ? "Plan activo ✓" : "Acceso incluido ✓"}
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
                    Redirigiendo a pago…
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
            { emoji: "📱", title: "Pagos seguros con Stripe", desc: "TLS, 3D Secure, PCI DSS." },
          ].map(({ emoji, title, desc }) => (
            <div key={title} className="zoho-card rounded-xl p-4">
              <div className="text-2xl mb-2">{emoji}</div>
              <p className="font-semibold text-gray-800 text-sm">{title}</p>
              <p className="text-gray-400 text-xs mt-1">{desc}</p>
            </div>
          ))}
        </div>

        {/* ── FAQ rápido ── */}
        <div className="mt-8 max-w-2xl mx-auto space-y-3">
          {[
            {
              q: "¿Qué pasa con mis datos si cancelo?",
              a: "Tus análisis e historial se conservan. Pasas al plan Gratis con límite de 5 archivos.",
            },
            {
              q: "¿Puedo cambiar de mensual a anual?",
              a: 'Sí, desde el portal de suscripción ("Gestionar suscripción") puedes cambiar el plan en cualquier momento.',
            },
            {
              q: "¿Emiten factura?",
              a: "Stripe genera una factura automática en cada cobro. La recibirás en tu email.",
            },
          ].map(({ q, a }) => (
            <details
              key={q}
              className="zoho-card rounded-xl px-4 py-3 cursor-pointer select-none group"
            >
              <summary className="font-semibold text-gray-800 text-sm list-none flex justify-between items-center">
                {q}
                <span className="text-gray-400 text-lg group-open:rotate-45 transition-transform">+</span>
              </summary>
              <p className="text-gray-500 text-sm mt-2">{a}</p>
            </details>
          ))}
        </div>
      </div>
    </div>
  )
}
