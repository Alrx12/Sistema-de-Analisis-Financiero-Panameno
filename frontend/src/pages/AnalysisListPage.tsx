import { useQuery } from "@tanstack/react-query"
import { Link } from "react-router-dom"
import { ArrowRight, Upload, BarChart2, Building2 } from "lucide-react"
import { listAnalysis } from "@/api/analysis"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { formatCurrency, formatPeriod, formatDate } from "@/lib/utils"

export default function AnalysisListPage() {
  const { data: snapshots, isLoading, isError } = useQuery({
    queryKey: ["analysis"],
    queryFn: listAnalysis,
  })

  if (isLoading) return <PageSpinner />
  if (isError) return <ErrorMsg />

  if (!snapshots?.length) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
        <BarChart2 className="h-10 w-10 text-muted-foreground" />
        <p className="text-muted-foreground">Aún no hay análisis guardados</p>
        <Button asChild><Link to="/upload"><Upload className="h-4 w-4" />Subir estado</Link></Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Mis análisis</h1>
        <Button asChild size="sm">
          <Link to="/upload"><Upload className="h-4 w-4" />Subir nuevo</Link>
        </Button>
      </div>

      <div className="space-y-3">
        {snapshots.map((s) => {
          const savingsRate = s.total_income > 0
            ? ((s.balance / s.total_income) * 100).toFixed(1)
            : "0.0"
          const isPositive = s.balance >= 0

          return (
            <Card key={s.snapshot_id} className="hover:shadow-md transition-shadow">
              <CardContent className="pt-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <p className="font-semibold">{formatPeriod(s.period_start, s.period_end)}</p>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      {s.bank_account && (
                        <span className="flex items-center gap-1">
                          <Building2 className="h-3 w-3" />
                          {s.bank_account.bank_name}
                          {s.bank_account.account_last4 && ` ••••${s.bank_account.account_last4}`}
                        </span>
                      )}
                      <span>Procesado {formatDate(s.created_at)}</span>
                      <span>· {s.total_transactions} transacciones</span>
                    </div>
                  </div>
                  <Badge variant={isPositive ? "success" : "destructive"}>
                    {isPositive ? "+" : ""}{formatCurrency(s.balance)}
                  </Badge>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                  <div>
                    <p className="text-xs text-muted-foreground">Ingresos</p>
                    <p className="text-sm font-semibold text-green-600">{formatCurrency(s.total_income)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Gastos</p>
                    <p className="text-sm font-semibold text-red-500">{formatCurrency(s.total_expenses)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Ahorro</p>
                    <p className="text-sm font-semibold text-purple-600">{savingsRate}%</p>
                  </div>
                </div>

                <div className="mt-4 flex justify-end">
                  <Button variant="outline" size="sm" asChild>
                    <Link to={`/analysis/${s.snapshot_id}`}>
                      Ver detalle <ArrowRight className="h-3 w-3" />
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

function PageSpinner() {
  return (
    <div className="flex h-64 items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  )
}

function ErrorMsg() {
  return (
    <div className="flex h-64 items-center justify-center text-muted-foreground">
      Error cargando análisis
    </div>
  )
}
