import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Link } from "react-router-dom"
import { TrendingUp, Loader2, CheckCircle2 } from "lucide-react"
import { forgotPassword } from "@/api/auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { parseApiError } from "@/lib/utils"

const schema = z.object({
  email: z.string().email("Email inválido"),
})
type FormData = z.infer<typeof schema>

export default function ForgotPasswordPage() {
  const [apiError, setApiError] = useState("")
  const [sent, setSent] = useState(false)
  const [debugToken, setDebugToken] = useState<string | null>(null)

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  async function onSubmit(data: FormData) {
    setApiError("")
    try {
      const res = await forgotPassword(data.email)
      setSent(true)
      // En DEBUG=true el backend devuelve el token en el response
      if (res.reset_token) setDebugToken(res.reset_token)
    } catch (err: unknown) {
      setApiError(parseApiError(err, "Error al enviar el correo"))
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-8 w-8 text-primary" />
            <span className="text-2xl font-bold text-primary">SAFPRO</span>
          </div>
          <p className="text-sm text-muted-foreground">Sistema de Análisis Financiero</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Recuperar contraseña</CardTitle>
            <CardDescription>
              Ingresa tu email y te enviaremos un enlace para restablecer tu contraseña
            </CardDescription>
          </CardHeader>
          <CardContent>
            {sent ? (
              <div className="space-y-4">
                <div className="flex items-start gap-3 rounded-md bg-green-50 p-4 text-green-800">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
                  <div>
                    <p className="font-medium text-sm">Correo enviado</p>
                    <p className="text-sm mt-0.5">
                      Si ese email existe en nuestra base de datos, recibirás un enlace de recuperación en los próximos minutos.
                    </p>
                  </div>
                </div>
                {/* Solo en desarrollo (DEBUG=true) el backend devuelve el token directo */}
                {debugToken && (
                  <div className="rounded-md bg-yellow-50 p-3 text-xs text-yellow-800 space-y-1">
                    <p className="font-semibold">Modo DEBUG — token de reset:</p>
                    <code className="break-all font-mono">{debugToken}</code>
                    <p className="mt-1">
                      <Link
                        to={`/reset-password?token=${debugToken}`}
                        className="font-medium underline"
                      >
                        Usar este token →
                      </Link>
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="tu@email.com"
                    {...register("email")}
                  />
                  {errors.email && (
                    <p className="text-xs text-destructive">{errors.email.message}</p>
                  )}
                </div>

                {apiError && (
                  <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                    {apiError}
                  </div>
                )}

                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  Enviar enlace de recuperación
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-sm text-muted-foreground">
          <Link to="/login" className="font-medium text-primary hover:underline">
            ← Volver al login
          </Link>
        </p>
      </div>
    </div>
  )
}
