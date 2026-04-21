// Categorías de presupuesto — lista canónica compartida entre TransactionsPage y RetrainPage

export const BUDGET_CATEGORIES = [
  // Necesidades (gasto)
  "alimentacion", "supermercado", "alquiler", "hipoteca", "servicios",
  "agua", "luz", "internet", "telefono", "transporte", "gasolina",
  "salud", "educacion", "hogar", "seguro",
  // Deseos (gasto)
  "restaurantes", "entretenimiento", "compras", "suscripciones", "ocio",
  "ropa", "tecnologia", "deporte", "streaming", "cafe", "bares", "mascotas",
  // Financiero (gasto)
  "cargo_financiero", "deuda",
  // Ingresos laborales
  "salario", "honorarios", "comision", "bono",
  // Ingresos por negocio
  "negocio", "venta",
  // Ingresos pasivos
  "alquiler_cobrado", "dividendos", "rendimiento",
  // Ingresos varios
  "reembolso", "regalo", "pension",
  // Ambos tipos
  "ahorro", "inversion", "transferencias",
  // Otro
  "otros", "otros_ingresos",
] as const

export type BudgetCategory = typeof BUDGET_CATEGORIES[number]

/** Relación tipo de registro → categorías permitidas */
export const CATEGORIES_BY_TYPE: Record<"gasto" | "ingreso" | "ambos", string[]> = {
  gasto: [
    "alimentacion", "supermercado", "alquiler", "hipoteca", "servicios",
    "agua", "luz", "internet", "telefono", "transporte", "gasolina",
    "salud", "educacion", "hogar", "seguro",
    "restaurantes", "entretenimiento", "compras", "suscripciones", "ocio",
    "ropa", "tecnologia", "deporte", "streaming", "cafe", "bares", "mascotas",
    "cargo_financiero", "deuda", "ahorro", "inversion", "transferencias", "otros",
  ],
  ingreso: [
    "salario", "honorarios", "comision", "bono",
    "negocio", "venta",
    "alquiler_cobrado", "dividendos", "rendimiento",
    "reembolso", "regalo", "pension",
    "ahorro", "inversion", "transferencias", "otros_ingresos",
  ],
  ambos: ["ahorro", "inversion", "transferencias"],
}
