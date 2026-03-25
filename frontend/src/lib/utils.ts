import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Extrae un mensaje legible de errores de la API.
 * FastAPI puede retornar `detail` como string (errores de negocio)
 * o como array de objetos [{type, loc, msg, input}] (errores de validación 422).
 */
export function parseApiError(err: unknown, fallback: string): string {
  const detail = (err as { response?: { data?: { detail?: unknown } } })
    ?.response?.data?.detail

  if (typeof detail === "string") return detail

  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0] as { msg?: string; loc?: string[] }
    if (typeof first?.msg === "string") {
      const field = first.loc?.slice(-1)[0]
      return field ? `${field}: ${first.msg}` : first.msg
    }
  }

  return fallback
}

// Formatea montos en USD (Panamá usa el dólar)
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("es-PA", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(amount)
}

// Formatea fecha ISO a "15 Mar 2026"
export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("es-PA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

// Formatea periodo "2026-02-01" → "Febrero 2026" (null-safe)
export function formatPeriod(start: string | null, end: string | null): string {
  if (!start && !end) return "Período sin fecha"
  if (!start || !end) {
    const d = new Date((start ?? end)!)
    return d.toLocaleDateString("es-PA", { month: "long", year: "numeric" })
  }
  const s = new Date(start)
  const e = new Date(end)
  if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) {
    return s.toLocaleDateString("es-PA", { month: "long", year: "numeric" })
  }
  return `${s.toLocaleDateString("es-PA", { month: "short" })} – ${e.toLocaleDateString("es-PA", { month: "short", year: "numeric" })}`
}

// Capitaliza primera letra
export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).replace(/_/g, " ")
}

// Trunca texto largo
export function truncate(str: string, maxLen = 40): string {
  return str.length > maxLen ? str.slice(0, maxLen) + "…" : str
}

// Color por nivel de confidence
export function confidenceColor(confidence: number): string {
  if (confidence >= 0.8) return "text-green-600"
  if (confidence >= 0.5) return "text-yellow-600"
  return "text-red-500"
}

// Clase de badge por economic_type
export function economicTypeBadgeClass(type: string): string {
  switch (type) {
    case "ingreso": return "bg-green-100 text-green-800"
    case "gasto": return "bg-red-100 text-red-800"
    case "cargo_financiero": return "bg-orange-100 text-orange-800"
    case "transferencia_propia": return "bg-blue-100 text-blue-800"
    case "transferencia_tercero": return "bg-purple-100 text-purple-800"
    case "reembolso": return "bg-teal-100 text-teal-800"
    default: return "bg-gray-100 text-gray-800"
  }
}
