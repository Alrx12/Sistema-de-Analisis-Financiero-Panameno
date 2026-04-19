import axios from "axios"
import { getApiClient } from "./client"
import type { TokenResponse, User } from "@safpro/types"

export interface LoginResponse {
  access_token?: string
  token_type?: string
  requires_2fa?: boolean
  two_factor_token?: string
}

export interface TwoFactorSetupData {
  secret: string
  provisioning_uri: string
}

// ── Auth básico ──────────────────────────────────────────────────────────────

/**
 * Login con email y password.
 * Puede retornar JWT directo o solicitar 2FA.
 * Nota: usa axios base (sin interceptors) para no interferir con el 401-handler.
 */
export async function login(
  baseURL: string,
  email: string,
  password: string
): Promise<LoginResponse> {
  const params = new URLSearchParams()
  params.append("username", email)
  params.append("password", password)

  const res = await axios.post<LoginResponse>(`${baseURL}/auth/login`, params, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  })
  return res.data
}

export async function register(
  baseURL: string,
  email: string,
  password: string,
  full_name: string
): Promise<User> {
  const res = await axios.post<User>(`${baseURL}/auth/register`, {
    username: email,
    email,
    password,
    full_name,
  })
  return res.data
}

export async function forgotPassword(
  baseURL: string,
  email: string
): Promise<{ message: string; reset_token?: string }> {
  const res = await axios.post(`${baseURL}/auth/forgot-password`, { email })
  return res.data
}

export async function resetPassword(
  baseURL: string,
  token: string,
  new_password: string
): Promise<void> {
  await axios.post(`${baseURL}/auth/reset-password`, {
    reset_token: token,
    new_password,
  })
}

// ── 2FA ──────────────────────────────────────────────────────────────────────

export async function setup2FA(): Promise<TwoFactorSetupData> {
  const res = await getApiClient().post<TwoFactorSetupData>("/auth/2fa/setup")
  return res.data
}

export async function enable2FA(code: string): Promise<{ message: string }> {
  const res = await getApiClient().post("/auth/2fa/enable", { code })
  return res.data
}

export async function disable2FA(
  password: string,
  code: string
): Promise<{ message: string }> {
  const res = await getApiClient().post("/auth/2fa/disable", { password, code })
  return res.data
}

export async function verify2FA(
  baseURL: string,
  two_factor_token: string,
  code: string
): Promise<TokenResponse> {
  const res = await axios.post<TokenResponse>(`${baseURL}/auth/2fa/verify`, {
    two_factor_token,
    code,
  })
  return res.data
}

// ── Verificación de email ────────────────────────────────────────────────────

export async function verifyEmail(
  baseURL: string,
  token: string
): Promise<{ message: string }> {
  const res = await axios.post(`${baseURL}/auth/verify-email`, { token })
  return res.data
}
