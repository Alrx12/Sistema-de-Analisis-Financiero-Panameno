/**
 * billing.ts — Cliente de pagos y suscripciones para mobile.
 *
 * Espeja frontend/src/api/billing.ts con soporte adicional para:
 *   - available_processor: procesador activo de la plataforma (para mostrar precios)
 *   - return_url en createCheckoutSession: deep link de retorno post-pago
 */
import { getApiClient } from "./client";

// ── Tipos ─────────────────────────────────────────────────────────────────────

export type BillingInterval = "monthly" | "annual";
export type BillingProcessor = "paypal" | "dlocalgo" | null;

export interface BillingStatus {
  plan: string;
  subscription_expires_at: string | null;
  has_active_subscription: boolean;
  /** Procesador con el que el usuario tiene la suscripción activa. */
  processor: BillingProcessor;
  /** Procesador activo en la plataforma (determina qué precios mostrar). */
  available_processor: BillingProcessor;
}

export interface CheckoutResponse {
  checkout_url: string;
  processor: string;
}

// ── Precios por procesador ────────────────────────────────────────────────────

/**
 * Tabla de precios reales por procesador.
 *
 * PayPal ($6.50/mes): cubre comisiones PayPal (~3.5%) + ITBMS (7%) + margen.
 * dLocal Go ($5.00/mes): comisiones más bajas permiten precio base.
 */
export const PROCESSOR_PRICES: Record<
  "paypal" | "dlocalgo",
  { monthly: number; annual: number; annualDiscountPct: number }
> = {
  paypal:   { monthly: 6.50, annual: 56.00, annualDiscountPct: 28 },
  dlocalgo: { monthly: 5.00, annual: 45.00, annualDiscountPct: 25 },
};

/** Fallback seguro: si no hay procesador detectado, usa precios PayPal. */
export const DEFAULT_PRICES = PROCESSOR_PRICES.paypal;

export function getPrices(processor: BillingProcessor) {
  if (processor === "dlocalgo") return PROCESSOR_PRICES.dlocalgo;
  return PROCESSOR_PRICES.paypal;
}

// ── API ───────────────────────────────────────────────────────────────────────

/**
 * GET /billing/status
 *
 * Devuelve el plan activo del usuario + qué procesador está disponible
 * en la plataforma (para mostrar precios correctos antes de suscribirse).
 */
export async function getBillingStatus(): Promise<BillingStatus> {
  const api = getApiClient();
  const { data } = await api.get<BillingStatus>("/billing/status");
  return data;
}

/**
 * POST /billing/create-checkout-session
 *
 * @param interval   "monthly" | "annual"
 * @param returnUrl  Deep link de retorno tras el pago (ej. "safpro://payment-success").
 *                   Si se omite, el backend usa la URL web por defecto.
 */
export async function createCheckoutSession(
  interval: BillingInterval,
  returnUrl?: string,
): Promise<CheckoutResponse> {
  const api = getApiClient();
  const body: { interval: BillingInterval; return_url?: string } = { interval };
  if (returnUrl) body.return_url = returnUrl;
  const { data } = await api.post<CheckoutResponse>(
    "/billing/create-checkout-session",
    body,
  );
  return data;
}
