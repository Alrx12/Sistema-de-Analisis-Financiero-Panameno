import { Outlet, NavLink, useNavigate } from "react-router-dom"
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
  PenLine,
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
      { to: "/retrain", label: "Entrenamiento",   icon: Sparkles, end: false },
    ],
  },
]

export default function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const logout = useAuthStore((s) => s.logout)
  const user   = useAuthStore((s) => s.user)
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
          style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary">
            <TrendingUp className="h-4 w-4 text-white" />
          </div>
          <span className="text-base font-bold text-white tracking-tight">SAFPRO</span>
          <button
            className="ml-auto lg:hidden text-white/50 hover:text-white"
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
        </nav>

        {/* Footer: usuario + logout */}
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }} className="p-2">
          {user && (
            <div className="flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-white/5 cursor-default">
              {/* Avatar */}
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-white text-xs font-bold">
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-white leading-tight">{user.full_name}</p>
                <p className="truncate text-xs text-white/40 leading-tight">{user.email}</p>
              </div>
            </div>
          )}
          <button
            className="sidebar-nav-item w-full mt-1"
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4 shrink-0" />
            <span>Cerrar sesión</span>
          </button>
        </div>
      </aside>

      {/* ══════════ MAIN ══════════ */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header móvil */}
        <header
          className="flex h-14 items-center border-b bg-white px-4 lg:hidden"
          style={{ borderColor: "hsl(var(--border))" }}
        >
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-muted-foreground hover:text-foreground"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="ml-3 flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded bg-primary">
              <TrendingUp className="h-3.5 w-3.5 text-white" />
            </div>
            <span className="font-bold text-foreground">SAFPRO</span>
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
