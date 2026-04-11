import { useState } from "react"
import { Link } from "react-router-dom"
import { Send, CheckCircle2, AlertCircle, Mail, User, MessageSquare } from "lucide-react"
import apiClient from "../api/client"

interface ContactFormData {
  name: string
  email: string
  message: string
}

interface FormState {
  status: "idle" | "submitting" | "success" | "error"
  errorMsg: string
}

export default function ContactPage() {
  const [form, setForm] = useState<ContactFormData>({ name: "", email: "", message: "" })
  const [state, setState] = useState<FormState>({ status: "idle", errorMsg: "" })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setState({ status: "submitting", errorMsg: "" })

    try {
      await apiClient.post("/contact", {
        name: form.name.trim(),
        email: form.email.trim(),
        message: form.message.trim(),
      })
      setState({ status: "success", errorMsg: "" })
      setForm({ name: "", email: "", message: "" })
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Error al enviar el mensaje. Por favor intenta de nuevo."
      setState({ status: "error", errorMsg: msg })
    }
  }

  const isSubmitting = state.status === "submitting"

  return (
    <div style={{ minHeight: "100vh", background: "#f4f5f7" }}>
      {/* Header */}
      <header
        style={{
          background: "linear-gradient(135deg, #1c2b4b 0%, #2d4878 55%, #3a5a96 100%)",
          padding: "20px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Link to="/login" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: "linear-gradient(135deg, #e05c19, #f07843)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 700,
              color: "#fff",
              fontSize: 16,
            }}
          >
            S
          </div>
          <span style={{ color: "#fff", fontWeight: 700, fontSize: 18, letterSpacing: "-0.3px" }}>SAFPRO</span>
        </Link>
        <nav style={{ display: "flex", gap: 20 }}>
          <Link to="/faq" style={{ color: "rgba(255,255,255,0.8)", textDecoration: "none", fontSize: 14 }}>
            Ayuda
          </Link>
          <Link to="/terms" style={{ color: "rgba(255,255,255,0.8)", textDecoration: "none", fontSize: 14 }}>
            Términos
          </Link>
          <Link to="/login" style={{ color: "#f07843", textDecoration: "none", fontSize: 14, fontWeight: 600 }}>
            Iniciar sesión
          </Link>
        </nav>
      </header>

      {/* Main */}
      <main
        style={{
          maxWidth: 640,
          margin: "0 auto",
          padding: "48px 24px",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 56,
              height: 56,
              borderRadius: 16,
              background: "linear-gradient(135deg, #1c2b4b, #2d4878)",
              marginBottom: 16,
            }}
          >
            <Mail size={26} color="#fff" />
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: "#1c2b4b", margin: "0 0 8px" }}>
            Contáctanos
          </h1>
          <p style={{ color: "#6b7280", fontSize: 15, margin: 0 }}>
            ¿Tienes alguna duda, sugerencia o problema? Escríbenos y te respondemos a la brevedad.
          </p>
        </div>

        {/* Direct contact info */}
        <div
          style={{
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            padding: "16px 20px",
            marginBottom: 24,
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <Mail size={18} color="#e05c19" />
          <div>
            <p style={{ margin: 0, fontSize: 13, color: "#6b7280" }}>Correo directo</p>
            <a
              href="mailto:admin@safpro.us"
              style={{ color: "#1c2b4b", fontWeight: 600, textDecoration: "none", fontSize: 15 }}
            >
              admin@safpro.us
            </a>
          </div>
        </div>

        {/* Success state */}
        {state.status === "success" && (
          <div
            style={{
              background: "#f0fdf4",
              border: "1px solid #86efac",
              borderRadius: 12,
              padding: 24,
              textAlign: "center",
              marginBottom: 24,
            }}
          >
            <CheckCircle2 size={40} color="#16a34a" style={{ marginBottom: 12 }} />
            <h2 style={{ fontSize: 18, fontWeight: 700, color: "#15803d", margin: "0 0 8px" }}>
              ¡Mensaje enviado!
            </h2>
            <p style={{ color: "#166534", fontSize: 14, margin: "0 0 16px" }}>
              Recibimos tu mensaje. Te responderemos en menos de 48 horas al correo que indicaste.
            </p>
            <button
              onClick={() => setState({ status: "idle", errorMsg: "" })}
              style={{
                background: "#16a34a",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                padding: "8px 20px",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Enviar otro mensaje
            </button>
          </div>
        )}

        {/* Form */}
        {state.status !== "success" && (
          <form
            onSubmit={handleSubmit}
            style={{
              background: "#fff",
              border: "1px solid #e5e7eb",
              borderRadius: 12,
              padding: 28,
              display: "flex",
              flexDirection: "column",
              gap: 20,
            }}
          >
            {/* Error banner */}
            {state.status === "error" && (
              <div
                style={{
                  background: "#fef2f2",
                  border: "1px solid #fca5a5",
                  borderRadius: 8,
                  padding: "12px 16px",
                  display: "flex",
                  gap: 10,
                  alignItems: "flex-start",
                }}
              >
                <AlertCircle size={18} color="#dc2626" style={{ marginTop: 1, flexShrink: 0 }} />
                <p style={{ margin: 0, color: "#dc2626", fontSize: 14 }}>{state.errorMsg}</p>
              </div>
            )}

            {/* Name */}
            <div>
              <label
                htmlFor="contact-name"
                style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}
              >
                Nombre completo
              </label>
              <div style={{ position: "relative" }}>
                <User
                  size={16}
                  color="#9ca3af"
                  style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }}
                />
                <input
                  id="contact-name"
                  type="text"
                  required
                  maxLength={120}
                  placeholder="Tu nombre"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  disabled={isSubmitting}
                  style={{
                    width: "100%",
                    padding: "10px 12px 10px 36px",
                    border: "1px solid #d1d5db",
                    borderRadius: 8,
                    fontSize: 14,
                    color: "#111827",
                    background: "#fff",
                    boxSizing: "border-box",
                    outline: "none",
                  }}
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <label
                htmlFor="contact-email"
                style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}
              >
                Correo electrónico
              </label>
              <div style={{ position: "relative" }}>
                <Mail
                  size={16}
                  color="#9ca3af"
                  style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }}
                />
                <input
                  id="contact-email"
                  type="email"
                  required
                  placeholder="tu@correo.com"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  disabled={isSubmitting}
                  style={{
                    width: "100%",
                    padding: "10px 12px 10px 36px",
                    border: "1px solid #d1d5db",
                    borderRadius: 8,
                    fontSize: 14,
                    color: "#111827",
                    background: "#fff",
                    boxSizing: "border-box",
                    outline: "none",
                  }}
                />
              </div>
            </div>

            {/* Message */}
            <div>
              <label
                htmlFor="contact-message"
                style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}
              >
                Mensaje
              </label>
              <div style={{ position: "relative" }}>
                <MessageSquare
                  size={16}
                  color="#9ca3af"
                  style={{ position: "absolute", left: 12, top: 12 }}
                />
                <textarea
                  id="contact-message"
                  required
                  maxLength={2000}
                  rows={5}
                  placeholder="Cuéntanos en qué podemos ayudarte..."
                  value={form.message}
                  onChange={(e) => setForm({ ...form, message: e.target.value })}
                  disabled={isSubmitting}
                  style={{
                    width: "100%",
                    padding: "10px 12px 10px 36px",
                    border: "1px solid #d1d5db",
                    borderRadius: 8,
                    fontSize: 14,
                    color: "#111827",
                    background: "#fff",
                    boxSizing: "border-box",
                    resize: "vertical",
                    outline: "none",
                    fontFamily: "inherit",
                  }}
                />
              </div>
              <p style={{ fontSize: 12, color: "#9ca3af", margin: "4px 0 0", textAlign: "right" }}>
                {form.message.length}/2000
              </p>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                background: isSubmitting ? "#9ca3af" : "linear-gradient(135deg, #e05c19, #f07843)",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                padding: "12px 24px",
                fontSize: 15,
                fontWeight: 600,
                cursor: isSubmitting ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                width: "100%",
              }}
            >
              {isSubmitting ? (
                <>
                  <span
                    style={{
                      width: 16,
                      height: 16,
                      border: "2px solid rgba(255,255,255,0.4)",
                      borderTopColor: "#fff",
                      borderRadius: "50%",
                      animation: "spin 0.8s linear infinite",
                      display: "inline-block",
                    }}
                  />
                  Enviando...
                </>
              ) : (
                <>
                  <Send size={16} />
                  Enviar mensaje
                </>
              )}
            </button>

            <p style={{ margin: 0, fontSize: 12, color: "#9ca3af", textAlign: "center" }}>
              Respondemos en menos de 48 horas hábiles.
            </p>
          </form>
        )}

        {/* Footer */}
        <footer style={{ textAlign: "center", marginTop: 40, paddingTop: 24, borderTop: "1px solid #e5e7eb" }}>
          <p style={{ color: "#9ca3af", fontSize: 13, margin: "0 0 8px" }}>
            SAFPRO · Sistema de Análisis Financiero Profesional
          </p>
          <p style={{ color: "#9ca3af", fontSize: 12, margin: 0 }}>
            Alexis Antonio Pineda Del Cid · Panamá ·{" "}
            <Link to="/terms" style={{ color: "#6b7280", textDecoration: "none" }}>Términos</Link>
            {" · "}
            <Link to="/privacy" style={{ color: "#6b7280", textDecoration: "none" }}>Privacidad</Link>
          </p>
        </footer>
      </main>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
