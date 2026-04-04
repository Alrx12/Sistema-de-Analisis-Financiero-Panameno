/**
 * ProGate — Componente de restricción de acceso para funciones Pro
 *
 * Uso (página completa):
 *   <ProGate feature="Simulaciones" description="...">
 *     <SimulacionesContent />
 *   </ProGate>
 *
 * Uso (sección parcial):
 *   <ProGate feature="Metas de Ahorro" description="..." variant="section">
 *     <GoalsSection />
 *   </ProGate>
 *
 * - Si el usuario es `pro` o `friends_and_family` → renderiza children normalmente.
 * - Si el usuario es `free` → children con blur + overlay de upgrade.
 */

import { Link } from "react-router-dom"
import { Lock, Zap } from "lucide-react"
import { useAuthStore } from "@/stores/authStore"

interface ProGateProps {
  /** Nombre visible de la función bloqueada */
  feature: string
  /** Descripción breve de lo que el usuario se está perdiendo */
  description?: string
  /** "page" = cubre toda la página (default) | "section" = solo la sección */
  variant?: "page" | "section"
  children: React.ReactNode
}

export default function ProGate({
  feature,
  description,
  variant = "page",
  children,
}: ProGateProps) {
  const user  = useAuthStore((s) => s.user)
  const plan  = user?.plan ?? "free"
  const isPaid = plan === "pro" || plan === "friends_and_family"

  // Usuario Pro/F&F → acceso completo, sin ningún cambio visual
  if (isPaid) return <>{children}</>

  // ── Usuario Free → blur + overlay ──────────────────────────────────────────

  const overlayCard = (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 10,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
        // Fondo semitransparente muy suave para que el blur de atrás sea visible
        background: "rgba(244, 245, 247, 0.55)",
        backdropFilter: "blur(2px)",
        WebkitBackdropFilter: "blur(2px)",
      }}
    >
      <div
        style={{
          background: "#ffffff",
          border: "1px solid #e5e7eb",
          borderRadius: "1rem",
          boxShadow: "0 20px 60px rgba(28,43,75,0.18)",
          padding: "2rem 2.5rem",
          maxWidth: "420px",
          width: "100%",
          textAlign: "center",
        }}
      >
        {/* Ícono de candado */}
        <div
          style={{
            width: "3.5rem",
            height: "3.5rem",
            borderRadius: "50%",
            background: "linear-gradient(135deg, #1c2b4b, #2d4878)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 1.25rem",
          }}
        >
          <Lock style={{ width: "1.4rem", height: "1.4rem", color: "#ffffff" }} />
        </div>

        {/* Badge "Plan Pro" */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.3rem",
            background: "rgba(224,92,25,0.1)",
            border: "1px solid rgba(224,92,25,0.3)",
            borderRadius: "9999px",
            padding: "0.2rem 0.75rem",
            marginBottom: "0.9rem",
          }}
        >
          <Zap style={{ width: "0.8rem", height: "0.8rem", color: "#e05c19" }} />
          <span style={{ fontSize: "0.7rem", fontWeight: 700, color: "#e05c19", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Plan Pro
          </span>
        </div>

        {/* Título */}
        <h3
          style={{
            fontSize: "1.15rem",
            fontWeight: 700,
            color: "#111827",
            marginBottom: "0.5rem",
            lineHeight: 1.3,
          }}
        >
          {feature} es exclusivo del Plan Pro
        </h3>

        {/* Descripción */}
        {description && (
          <p style={{ fontSize: "0.85rem", color: "#6b7280", marginBottom: "1.5rem", lineHeight: 1.55 }}>
            {description}
          </p>
        )}

        {/* CTA principal */}
        <Link
          to="/upgrade"
          style={{
            display: "block",
            background: "#e05c19",
            color: "#ffffff",
            fontWeight: 700,
            fontSize: "0.9rem",
            padding: "0.7rem 1.5rem",
            borderRadius: "0.6rem",
            textDecoration: "none",
            marginBottom: "0.75rem",
            transition: "opacity 0.15s",
          }}
        >
          Desbloquear con Plan Pro — $5/mes
        </Link>

        {/* Link secundario */}
        <p style={{ fontSize: "0.78rem", color: "#9ca3af" }}>
          Plan Gratis: hasta 5 análisis · Plan Pro: ilimitado +&nbsp;
          <Link to="/upgrade" style={{ color: "#1c2b4b", fontWeight: 600, textDecoration: "underline" }}>
            ver todo lo que incluye
          </Link>
        </p>
      </div>
    </div>
  )

  if (variant === "page") {
    return (
      <div style={{ position: "relative", minHeight: "100%" }}>
        {/* Contenido original borroso */}
        <div
          style={{
            filter: "blur(5px)",
            pointerEvents: "none",
            userSelect: "none",
            opacity: 0.6,
          }}
          aria-hidden="true"
        >
          {children}
        </div>
        {overlayCard}
      </div>
    )
  }

  // variant="section"
  return (
    <div style={{ position: "relative", borderRadius: "0.75rem", overflow: "hidden" }}>
      <div
        style={{
          filter: "blur(4px)",
          pointerEvents: "none",
          userSelect: "none",
          opacity: 0.5,
        }}
        aria-hidden="true"
      >
        {children}
      </div>
      {overlayCard}
    </div>
  )
}
