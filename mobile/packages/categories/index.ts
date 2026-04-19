// Categorías canónicas compartidas entre web y mobile

export const BUDGET_CATEGORIES = [
  // Necesidades
  "alimentacion", "supermercado", "alquiler", "hipoteca", "servicios",
  "agua", "luz", "internet", "telefono", "transporte", "gasolina",
  "salud", "educacion", "hogar", "seguro",
  // Deseos
  "restaurantes", "entretenimiento", "compras", "suscripciones", "ocio",
  "ropa", "tecnologia", "deporte", "streaming", "cafe", "bares", "mascotas",
  // Financiero
  "cargo_financiero", "deuda", "ahorro", "inversion",
  // Transferencias
  "transferencias",
  // Otro
  "otros",
] as const

export type BudgetCategory = typeof BUDGET_CATEGORIES[number]

export const NEEDS_CATEGORIES = new Set([
  "alimentacion", "supermercado", "alquiler", "hipoteca", "servicios",
  "agua", "luz", "internet", "telefono", "transporte", "gasolina",
  "salud", "educacion", "hogar", "seguro",
])

export const WANTS_CATEGORIES = new Set([
  "restaurantes", "entretenimiento", "compras", "suscripciones", "ocio",
  "ropa", "tecnologia", "deporte", "streaming", "cafe", "bares", "mascotas",
  "transferencias",
])

export const SAVINGS_CATEGORIES = new Set([
  "ahorro", "inversion", "deudas", "deuda", "comisiones", "impuestos",
])

export function classifyBucket(category: string): "needs" | "wants" | "savings" | "other" {
  const c = category.toLowerCase()
  if (NEEDS_CATEGORIES.has(c)) return "needs"
  if (WANTS_CATEGORIES.has(c)) return "wants"
  if (SAVINGS_CATEGORIES.has(c)) return "savings"
  return "other"
}

export function formatCurrency(amount: number): string {
  return `$${Math.abs(amount).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}
