import axios from "axios"
import type { TokenResponse, User } from "@/types"

// Login usa form-urlencoded (OAuth2PasswordRequestForm en FastAPI)
export async function login(email: string, password: string): Promise<TokenResponse> {
  const params = new URLSearchParams()
  params.append("username", email)
  params.append("password", password)

  const res = await axios.post<TokenResponse>("/api/v1/auth/login", params, {
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
    username: email,   // el backend requiere username; usamos email como identificador único
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
  await axios.post("/api/v1/auth/reset-password", { token, new_password })
}
