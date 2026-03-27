import { useQuery } from "@tanstack/react-query"
import { Link } from "react-router-dom"
import { Upload, BarChart2, Building2, ArrowRight } from "lucide-react"
import { listAnalysis } from "@/api/analysis"
import { Button } from "@/components/ui/button"
import { formatCurrency, formatPeriod, formatDate } from "@/lib/utils"

// ─── Badge de banco con color ─────────────────────────────────────────────────
const BANK_COLORS: Record<string, string> = {
  "Banco General":  "#1a3a8f",
  "BAC Credomatic": "#e31837",
  "Banistmo":       "#00843d",
}

function BankChip({ bankName, last4 }: { bankName: string; last4?: string | null }) {
  const color = BANK_COLORS[bankName] ?? "#6b7280"
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs font-medium text-foreground">
      <span style={{ background: color, width: 7, height: 7, borderRadius: "50%", display: "inline-block", flexShrink: 0 }} />
      {bankName}{last4 ? ` ····${last4}` : ""}
    </span>
  )
}

function AmountBadge({ value }: { value: number }) {
  const positive = value >= 0
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
      positive ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"
    }`}>
      {positive ? "+" : ""}{formatCurrency(value)}
    </span>
  )
}

export default function AnalysisListPage() {
  const { data: snapshots, isLoading, isError } = useQuery({
    queryKey: ["analysis"],
    queryFn: listAnalysis,
  })

  if (isLoading) return <PageSpinner />
  if (isError)   return <ErrorMsg />

  if (!snapshots?.length) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
        <div className="rounded-full bg-primary/10 p-6">
          <BarChart2 className="h-10 w-10 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Aún no hay análisis guardados</h2>
          <p className="mt-1 text-sm text-muted-foreground">Sube tu primer estado de cuenta para comenzar</p>
        </div>
        <Button asChild><Link to="/upload"><Upload className="h-4 w-4" />Subir estado de cuenta</Link></Button>
      </div>
    )
  }

  return (
    <div className="space-y-5 pb-8">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Mis análisis</h1>
          <p className="page-subtitle">{snapshots.length} estados de cuenta procesados</p>
        </div>
        <Button asChild size="sm">
          <Link to="/upload"><Upload className="h-4 w-4" />Subir nuevo</Link>
        </Button>
      </div>

      {/* Tabla */}
      <div className="overflow-hidden rounded-xl border border-border bg-white shadow-sm">
        <table className="zoho-table">
          <thead>
            <tr>
              <th>Período</th>
              <th>Banco</th>
              <th>Ingresos</th>
              <th>Gastos</th>
              <th>Balance</th>
              <th>Ahorro</th>
              <th>Txs</th>
              <th>Procesado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {snapshots.map((s) => {
              const savingsRate = s.total_income > 0
                ? ((s.balance / s.total_income) * 100).toFixed(1)
                : "0.0"

              return (
                <tr key={s.snapshot_id}>
                  {/* Período */}
                  <td>
                    <span className="font-semibold text-foreground">
                      {formatPeriod(s.period_start, s.period_end)}
                    </span>
                  </td>

                  {/* Banco */}
                  <td>
                    {s.bank_account ? (
                      <BankChip bankName={s.bank_account.bank_name} last4={s.bank_account.account_last4} />
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <Building2 className="h-3 w-3" />Sin banco
                      </span>
                    )}
                  </td>

                  {/* Ingresos */}
                  <td className="text-green-600 font-semibold">{formatCurrency(s.total_income)}</td>

                  {/* Gastos */}
                  <td className="text-red-500 font-semibold">{formatCurrency(s.total_expenses)}</td>

                  {/* Balance */}
                  <td><AmountBadge value={s.balance} /></td>

                  {/* Ahorro % */}
                  <td>
                    <span className={`text-sm font-semibold ${Number(savingsRate) >= 20 ? "text-green-600" : "text-yellow-600"}`}>
                      {savingsRate}%
                    </span>
                  </td>

                  {/* Total txs */}
                  <td className="text-muted-foreground">{s.total_transactions}</td>

                  {/* Fecha */}
                  <td className="text-muted-foreground text-xs">{formatDate(s.created_at)}</td>

                  {/* Acción */}
                  <td>
                    <Button variant="outline" size="sm" asChild className="h-7 px-3 text-xs gap-1">
                      <Link to={`/analysis/${s.snapshot_id}`}>
                        Ver <ArrowRight className="h-3 w-3" />
                      </Link>
                    </Button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
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
