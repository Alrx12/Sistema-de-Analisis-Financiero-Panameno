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
} from "lucide-react"
import { useState } from "react"
import { useAuthStore } from "@/stores/authStore"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/upload", label: "Subir estado de cuenta", icon: Upload, end: false },
  { to: "/analysis", label: "Mis análisis", icon: BarChart2, end: false },
  { to: "/kb", label: "Knowledge Base", icon: Brain, end: false },
]

export default function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const logout = useAuthStore((s) => s.logout)
  const user = useAuthStore((s) => s.user)
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate("/login")
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      {/* Overlay móvil */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 flex w-60 flex-col border-r bg-white transition-transform duration-200 lg:static lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Logo */}
        <div className="flex h-16 items-center gap-2 border-b px-4">
          <TrendingUp className="h-6 w-6 text-primary" />
          <span className="text-lg font-bold text-primary">SAFPRO</span>
          <button
            className="ml-auto lg:hidden"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        {/* Navegación */}
        <nav className="flex flex-1 flex-col gap-1 p-3">
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Footer del sidebar: usuario + logout */}
        <div className="border-t p-3">
          {user && (
            <div className="mb-2 px-3 py-1">
              <p className="text-xs font-medium text-foreground truncate">{user.full_name}</p>
              <p className="text-xs text-muted-foreground truncate">{user.email}</p>
            </div>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-3 text-muted-foreground"
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4" />
            Cerrar sesión
          </Button>
        </div>
      </aside>

      {/* Contenido principal */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header móvil */}
        <header className="flex h-16 items-center border-b px-4 lg:hidden">
          <button onClick={() => setSidebarOpen(true)}>
            <Menu className="h-5 w-5" />
          </button>
          <span className="ml-3 font-semibold text-primary">SAFPRO</span>
        </header>

        {/* Área de contenido con scroll */}
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
