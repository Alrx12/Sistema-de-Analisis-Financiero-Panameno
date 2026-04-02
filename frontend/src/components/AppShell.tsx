import { Outlet, NavLink, Link, useNavigate } from "react-router-dom"
import {
  LayoutDashboard,
  Upload,
  BarChart2,
  Brain,
  LogOut,
  TrendingUp,
  Menu,
  X,
  PiggyBank,
  Sparkles,
  FlaskConical,
  PenLine,
  Wallet,
  HelpCircle,
  MessageCircleQuestion,
  ShieldCheck,
  Crown,
  Zap,
} from "lucide-react"
import { useState } from "react"
import { useAuthStore } from "@/stores/authStore"
import { cn } from "@/lib/utils"

// ─── Nav structure con secciones ───────────────────────────────────────────────
const navSections = [
  {
    label: "Principal",
    items: [
      { to: "/",        label: "Dashboard",             icon: LayoutDashboard, end: true  },
      { to: "/upload",  label: "Subir estado de cuenta", icon: Upload,          end: false },
      { to: "/manual",  label: "Entrada Manual",          icon: PenLine,         end: false },
      { to: "/cuentas", label: "Cuentas y Metas",         icon: Wallet,          end: false },
    ],
  },
  {
    label: "Análisis",
    items: [
      { to: "/analysis", label: "Mis análisis",   icon: BarChart2, end: false },
      { to: "/budget",   label: "Mi Presupuesto", icon: PiggyBank, end: false },
    ],
  },
  {
    label: "Inteligencia",
    items: [
      { to: "/kb",      label: "Knowledge Base",  icon: Brain,    end: false },
      { to: "/retrain",      label: "Entrenamiento",  icon: Sparkles,      end: false },
      { to: "/simulaciones", label: "Simulaciones",   icon: FlaskConical,  end: false },
    ],
  },
  {
    label: "Soporte",
    items: [
      { to: "/ayuda", label: "Centro de ayuda",       icon: HelpCircle,          end: false },
      { to: "/faq",   label: "Preguntas frecuentes",  icon: MessageCircleQuestion, end: false },
    ],
  },
]

export default function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const logout   = useAuthStore((s) => s.logout)
  const user     = useAuthStore((s) => s.user)
  const isAdmin  = user?.is_admin === true
  const isFree   = user?.plan === "free"
  const isPro    = user?.plan === "pro"
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate("/login")
  }

  const initials = user?.full_name
    ? user.full_name.split(" ").map((n: string) => n[0]).slice(0, 2).join("").toUpperCase()
    : "U"

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      {/* Overlay móvil */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ══════════ SIDEBAR ══════════ */}
      <aside
        style={{ background: "var(--sidebar-bg)", width: "var(--sidebar-width)" }}
        className={cn(
          "fixed inset-y-0 left-0 z-30 flex flex-col transition-transform duration-200 lg:static lg:translate-x-0 shrink-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Logo */}
        <div
          className="flex h-14 items-center gap-2.5 px-4"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
        >
          <div
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white"
            style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)", boxShadow: "0 3px 10px rgba(99,102,241,0.35)" }}
          >
            <TrendingUp className="h-4 w-4" />
          </div>
          <div className="flex flex-col leading-none">
            <span className="text-sm font-bold text-white tracking-tight">SAFPRO</span>
            <span className="text-[9px] font-semibold tracking-widest uppercase" style={{ color: "rgba(255,255,255,0.28)" }}>Financial AI</span>
          </div>
          <button
            className="ml-auto lg:hidden text-white/40 hover:text-white"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Navegación con secciones */}
        <nav className="flex flex-1 flex-col overflow-y-auto px-2 pb-2">
          {navSections.map((section) => (
            <div key={section.label}>
              <div className="sidebar-section-label">{section.label}</div>
              {section.items.map(({ to, label, icon: Icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    cn("sidebar-nav-item", isActive && "active")
                  }
                  onClick={() => setSidebarOpen(false)}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{label}</span>
                </NavLink>
              ))}
            </div>
          ))}

          {/* Sección Admin — solo visible para is_admin=true */}
          {isAdmin && (
            <div>
              <div className="sidebar-section-label" style={{ color: "rgba(251,191,36,0.6)" }}>Admin</div>
              <NavLink
                to="/admin"
                end={false}
                className={({ isActive }) => cn("sidebar-nav-item", isActive && "active")}
                onClick={() => setSidebarOpen(false)}
                style={{ color: "rgba(251,191,36,0.85)" }}
              >
                <ShieldCheck className="h-4 w-4 shrink-0" />
                <span className="truncate">Dashboard Admin</span>
              </NavLink>
            </div>
          )}
        </nav>

        {/* ── Banner Plan Pro (solo para plan free) ── */}
        {isFree && (
          <div className="mx-2 mb-2">
            <Link
              to="/upgrade"
              onClick={() => setSidebarOpen(false)}
              className="flex items-start gap-2.5 rounded-xl p-3 transition-all"
              style={{
                background: "linear-gradient(135deg, rgba(224,92,25,0.18), rgba(224,92,25,0.08))",
                border: "1px solid rgba(224,92,25,0.3)",
                textDecoration: "none",
              }}
            >
              <Zap className="h-4 w-4 text-orange-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-white text-xs font-semibold leading-tight">
                  Actualiza a Pro
                </p>
                <p className="text-white/45 text-xs mt-0.5 leading-tight">
                  Desde $3.75/mes — sin límites
                </p>
              </div>
            </Link>
          </div>
        )}

        {/* Badge Pro activo (plan pro) */}
        {isPro && (
          <div className="mx-2 mb-2">
            <div
              className="flex items-center gap-2 rounded-xl px-3 py-2"
              style={{
                background: "linear-gradient(135deg, rgba(99,102,241,0.18), rgba(139,92,246,0.08))",
                border: "1px solid rgba(99,102,241,0.25)",
              }}
            >
              <Crown className="h-3.5 w-3.5 text-yellow-400 shrink-0" />
              <span className="text-white/60 text-xs font-semibold">Plan Pro activo</span>
            </div>
          </div>
        )}

        {/* Footer: usuario + logout */}
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }} className="p-2">
          {user && (
            <NavLink
              to="/cuenta"
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2.5 px-2 py-2 rounded-lg transition-colors",
                  isActive ? "bg-white/10" : "hover:bg-white/5"
                )
              }
              onClick={() => setSidebarOpen(false)}
            >
              {/* Avatar con gradiente */}
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white text-xs font-bold"
                style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}
              >
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-white leading-tight">{user.full_name}</p>
                <p className="truncate text-xs leading-tight" style={{ color: "rgba(255,255,255,0.32)" }}>{user.email}</p>
              </div>
            </NavLink>
          )}
          <button
            className="sidebar-nav-item w-full mt-1"
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4 shrink-0" />
            <span>Cerrar sesión</span>
          </button>
          <div className="px-2 pt-2 pb-1">
            <Link
              to="/privacy"
              className="text-xs hover:underline"
              style={{ color: "rgba(255,255,255,0.2)" }}
            >
              Política de Privacidad
            </Link>
          </div>
        </div>
      </aside>

      {/* ══════════ MAIN ══════════ */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header móvil */}
        <header
          className="flex h-14 items-center px-4 lg:hidden"
          style={{ background: "var(--sidebar-bg)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
        >
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-white/40 hover:text-white/80"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="ml-3 flex items-center gap-2">
            <div
              className="flex h-6 w-6 items-center justify-center rounded text-white"
              style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}
            >
              <TrendingUp className="h-3.5 w-3.5" />
            </div>
            <span className="text-sm font-bold text-white">SAFPRO</span>
          </div>
        </header>

        {/* Área de contenido */}
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
