/**
 * contact.ts — Formulario de contacto público.
 * Endpoint: POST /contact (sin auth JWT).
 */
import { getApiClient } from "./client"

export interface ContactFormData {
  name: string
  email: string
  message: string
}

export interface ContactResponse {
  status: string
  message: string
}

export async function sendContactForm(data: ContactFormData): Promise<ContactResponse> {
  const client = getApiClient()
  const res = await client.post<ContactResponse>("/contact", data)
  return res.data
}
