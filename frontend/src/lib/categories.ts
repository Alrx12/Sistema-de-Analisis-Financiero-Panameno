// Categorías de presupuesto — lista canónica compartida entre TransactionsPage y RetrainPage

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
