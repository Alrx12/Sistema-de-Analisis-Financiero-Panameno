import axios from "axios"
import type { TokenResponse, User } from "@/types"

// ── Tipos ────────────────────────────────────────────────────────────────────

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

/** Login: puede retornar token directo o requerir paso de 2FA */
export async function login(email: string, password: string): Promise<LoginResponse> {
  const params = new URLSearchParams()
  params.append("username", email)
  params.append("password", password)

  const res = await axios.post<LoginResponse>("/api/v1/auth/login", params, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  })
  return res.data
}

export async function register(
  email: string,
  password: string,
  full_name: string
): Promise<User> {
  const res = await axios.post<User>("/api/v1/auth/register", {
    username: email,
    email,
    password,
    full_name,
  })
  return res.data
}

export async function forgotPassword(email: string): Promise<{ message: string; reset_token?: string }> {
  const res = await axios.post("/api/v1/auth/forgot-password", { email })
  return res.data
}

export async function resetPassword(token: string, new_password: string): Promise<void> {
  await axios.post("/api/v1/auth/reset-password", { reset_token: token, new_password })
}

// ── Verificación de email ────────────────────────────────────────────────────

export async function verifyEmail(token: string): Promise<{ message: string }> {
  const res = await axios.post("/api/v1/auth/verify-email", { token })
  return res.data
}

export async function resendVerification(): Promise<{ message: string }> {
  const res = await axios.post("/api/v1/auth/resend-verification")
  return res.data
}

// ── 2FA ──────────────────────────────────────────────────────────────────────

/** Genera el secreto TOTP. El usuario debe escanearlo con su app de autenticación. */
export async function setup2FA(): Promise<TwoFactorSetupData> {
  const res = await axios.post<TwoFactorSetupData>("/api/v1/auth/2fa/setup")
  return res.data
}

/** Activa el 2FA confirmando que la app ya tiene el código correcto. */
export async function enable2FA(code: string): Promise<{ message: string }> {
  const res = await axios.post("/api/v1/auth/2fa/enable", { code })
  return res.data
}

/** Desactiva el 2FA (requiere contraseña + código TOTP). */
export async function disable2FA(password: string, code: string): Promise<{ message: string }> {
  const res = await axios.post("/api/v1/auth/2fa/disable", { password, code })
  return res.data
}

/** Paso 2 del login: verifica el código TOTP y retorna el access_token real. */
export async function verify2FA(two_factor_token: string, code: string): Promise<TokenResponse> {
  const res = await axios.post<TokenResponse>("/api/v1/auth/2fa/verify", { two_factor_token, code })
  return res.data
}
