import { type ReactNode } from "react"
import { useQuery } from "@tanstack/react-query"
import { Link } from "react-router-dom"
import {
  TrendingUp, TrendingDown, Wallet, AlertTriangle,
  Upload, ArrowRight, BarChart2
} from "lucide-react"
import { listAnalysis } from "@/api/analysis"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { formatCurrency, formatPeriod, capitalize } from "@/lib/utils"
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell
} from "recharts"

const CATEGORY_COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444",
  "#8b5cf6", "#06b6d4", "#f97316", "#84cc16",
]

export default function DashboardPage() {
  const { data: snapshots, isLoading, isError } = useQuery({
    queryKey: ["analysis"],
    queryFn: listAnalysis,
  })

  const latest = snapshots?.[0]

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        Error cargando datos. Intenta de nuevo.
      </div>
    )
  }

  if (!latest) {
    return <EmptyState />
  }

  const savingsRate = latest.total_income > 0
    ? ((latest.balance / latest.total_income) * 100).toFixed(1)
    : "0.0"

  const categoryData = Object.entries(latest.categories)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)
    .map(([name, value]) => ({ name: capitalize(name), value }))

  const highPriority = latest.recommendations.filter((r) => r.type === "critical")

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            {formatPeriod(latest.period_start, latest.period_end)}
          </p>
        </div>
        <Button asChild size="sm">
          <Link to="/upload">
            <Upload className="h-4 w-4" />
            Subir estado
          </Link>
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Ingresos"
          value={formatCurrency(latest.total_income)}
          icon={<TrendingUp className="h-4 w-4 text-green-600" />}
          valueClass="text-green-600"
        />
        <KpiCard
          title="Gastos"
          value={formatCurrency(latest.total_expenses)}
          icon={<TrendingDown className="h-4 w-4 text-red-500" />}
          valueClass="text-red-500"
        />
        <KpiCard
          title="Balance"
          value={formatCurrency(latest.balance)}
          icon={<Wallet className="h-4 w-4 text-primary" />}
          valueClass={latest.balance >= 0 ? "text-green-600" : "text-red-500"}
        />
        <KpiCard
          title="Tasa de ahorro"
          value={`${savingsRate}%`}
          icon={<BarChart2 className="h-4 w-4 text-purple-600" />}
          valueClass="text-purple-600"
          sub={`${latest.total_transactions} transacciones`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Gráfica de categorías */}
        <Card>
          <CardHeader>
            <CardTitle>Gastos por categoría</CardTitle>
            <CardDescription>Top 8 categorías del período</CardDescription>
          </CardHeader>
          <CardContent>
            {categoryData.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin datos de categorías</p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={categoryData} layout="vertical" margin={{ left: 8 }}>
                  <XAxis type="number" tickFormatter={(v) => `$${v}`} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={100} />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {categoryData.map((_, i) => (
                      <Cell key={i} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Recomendaciones */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle>Recomendaciones</CardTitle>
            {highPriority.length > 0 && (
              <Badge variant="destructive">{highPriority.length} urgentes</Badge>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            {latest.recommendations.length === 0 ? (
              <p className="text-sm text-muted-foreground">Todo en orden 🎉</p>
            ) : (
              latest.recommendations.slice(0, 5).map((rec, i) => (
                <div key={i} className="flex items-start gap-2">
                  <AlertTriangle
                    className={`mt-0.5 h-4 w-4 shrink-0 ${
                      rec.type === "critical" ? "text-red-500" :
                      rec.type === "warning" ? "text-yellow-500" : "text-blue-500"
                    }`}
                  />
                  <p className="text-sm text-foreground">{rec.message}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Enlace al análisis completo */}
      <div className="flex justify-end">
        <Button variant="outline" asChild>
          <Link to={`/analysis/${latest.snapshot_id}`}>
            Ver análisis completo
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </div>
  )
}

function KpiCard({
  title, value, icon, valueClass, sub
}: {
  title: string
  value: string
  icon: ReactNode
  valueClass?: string
  sub?: string
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          {icon}
        </div>
        <p className={`mt-2 text-2xl font-bold ${valueClass}`}>{value}</p>
        {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
      <div className="rounded-full bg-muted p-6">
        <Upload className="h-10 w-10 text-muted-foreground" />
      </div>
      <div>
        <h2 className="text-xl font-semibold">Aún no hay análisis</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Sube tu primer estado de cuenta para empezar
        </p>
      </div>
      <Button asChild>
        <Link to="/upload">
          <Upload className="h-4 w-4" />
          Subir estado de cuenta
        </Link>
      </Button>
    </div>
  )
}
