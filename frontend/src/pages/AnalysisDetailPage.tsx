import { useQuery } from "@tanstack/react-query"
import { useParams, Link } from "react-router-dom"
import {
  ArrowLeft, TrendingUp, TrendingDown, Wallet, AlertTriangle, List, Building2
} from "lucide-react"
import { getAnalysis, getConfidenceStats } from "@/api/analysis"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { formatCurrency, formatPeriod, capitalize } from "@/lib/utils"
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts"

const COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444",
  "#8b5cf6", "#06b6d4", "#f97316", "#84cc16", "#ec4899", "#14b8a6"
]

export default function AnalysisDetailPage() {
  const { id } = useParams<{ id: string }>()

  const { data: snapshot, isLoading } = useQuery({
    queryKey: ["analysis", id],
    queryFn: () => getAnalysis(id!),
    enabled: !!id,
  })

  const { data: stats } = useQuery({
    queryKey: ["confidence-stats", id],
    queryFn: () => getConfidenceStats(id!),
    enabled: !!id,
  })

  if (isLoading || !snapshot) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  const categoryData = Object.entries(snapshot.categories)
    .sort(([, a], [, b]) => b - a)
    .map(([name, value]) => ({ name: capitalize(name), value }))

  const savingsRate = snapshot.total_income > 0
    ? ((snapshot.balance / snapshot.total_income) * 100).toFixed(1)
    : "0.0"

  const highPriority = snapshot.recommendations.filter((r) => r.type === "critical")
  const requiresReview = stats?.requires_review ?? 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/analysis"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">
            {formatPeriod(snapshot.period_start, snapshot.period_end)}
          </h1>
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span>{snapshot.total_transactions} transacciones</span>
            {snapshot.bank_account && (
              <span className="flex items-center gap-1">
                <Building2 className="h-3.5 w-3.5" />
                {snapshot.bank_account.bank_name}
                {snapshot.bank_account.account_last4 && ` ••••${snapshot.bank_account.account_last4}`}
                {snapshot.bank_account.nickname && ` · ${snapshot.bank_account.nickname}`}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Alertas rápidas */}
      {(requiresReview > 0 || highPriority.length > 0) && (
        <div className="flex flex-wrap gap-2">
          {requiresReview > 0 && (
            <div className="flex items-center gap-1.5 rounded-md bg-yellow-50 px-3 py-2 text-sm text-yellow-700">
              <AlertTriangle className="h-4 w-4" />
              {requiresReview} transacciones requieren revisión
              <Button variant="link" size="sm" className="h-auto p-0 text-yellow-700 underline" asChild>
                <Link to={`/analysis/${id}/transactions?requires_review=true`}>Revisar</Link>
              </Button>
            </div>
          )}
          {highPriority.length > 0 && (
            <div className="flex items-center gap-1.5 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertTriangle className="h-4 w-4" />
              {highPriority.length} recomendación{highPriority.length > 1 ? "es" : ""} urgente{highPriority.length > 1 ? "s" : ""}
            </div>
          )}
        </div>
      )}

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Ingresos", value: formatCurrency(snapshot.total_income), icon: <TrendingUp className="h-4 w-4 text-green-600" />, cls: "text-green-600" },
          { label: "Gastos", value: formatCurrency(snapshot.total_expenses), icon: <TrendingDown className="h-4 w-4 text-red-500" />, cls: "text-red-500" },
          { label: "Balance", value: formatCurrency(snapshot.balance), icon: <Wallet className="h-4 w-4 text-primary" />, cls: snapshot.balance >= 0 ? "text-green-600" : "text-red-500" },
          { label: "Tasa de ahorro", value: `${savingsRate}%`, icon: <TrendingUp className="h-4 w-4 text-purple-600" />, cls: "text-purple-600" },
        ].map(({ label, value, icon, cls }) => (
          <Card key={label}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-muted-foreground">{label}</p>
                {icon}
              </div>
              <p className={`mt-2 text-2xl font-bold ${cls}`}>{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Pie chart de categorías */}
        <Card>
          <CardHeader>
            <CardTitle>Distribución de gastos</CardTitle>
            <CardDescription>Por categoría</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={categoryData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  label={({ name, percent }) =>
                    `${name} ${(percent * 100).toFixed(0)}%`
                  }
                  labelLine={false}
                >
                  {categoryData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Recomendaciones */}
        <Card>
          <CardHeader>
            <CardTitle>Recomendaciones</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {snapshot.recommendations.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin recomendaciones — todo en orden.</p>
            ) : (
              snapshot.recommendations.map((rec, i) => (
                <div key={i} className="flex items-start gap-2">
                  <Badge
                    variant={
                      rec.type === "critical" ? "destructive" :
                      rec.type === "warning" ? "outline" : "secondary"
                    }
                    className="shrink-0 mt-0.5"
                  >
                    {rec.type}
                  </Badge>
                  <p className="text-sm">{rec.message}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Botón a transacciones */}
      <div className="flex justify-end">
        <Button asChild>
          <Link to={`/analysis/${id}/transactions`}>
            <List className="h-4 w-4" />
            Ver todas las transacciones
          </Link>
        </Button>
      </div>
    </div>
  )
}
