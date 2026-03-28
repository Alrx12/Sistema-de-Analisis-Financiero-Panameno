import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { TrendingUp, Loader2, CheckCircle2 } from "lucide-react"
import { resetPassword } from "@/api/auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { parseApiError } from "@/lib/utils"

const schema = z.object({
  password: z.string().min(8, "Mínimo 8 caracteres"),
  confirm: z.string(),
}).refine((d) => d.password === d.confirm, {
  message: "Las contraseñas no coinciden",
  path: ["confirm"],
})
type FormData = z.infer<typeof schema>

export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get("token") ?? ""
  const [apiError, setApiError] = useState("")
  const [done, setDone] = useState(false)

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  async function onSubmit(data: FormData) {
    if (!token) {
      setApiError("Token de recuperación faltante o inválido")
      return
    }
    setApiError("")
    try {
      await resetPassword(token, data.password)
      setDone(true)
      setTimeout(() => navigate("/login"), 2500)
    } catch (err: unknown) {
      setApiError(parseApiError(err, "Token inválido o expirado"))
    }
  }

  return (
    <div className="flex min-h-screen min-h-dvh items-center justify-center bg-muted/40 p-4">
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
            <CardTitle>Nueva contraseña</CardTitle>
            <CardDescription>Elige una contraseña segura para tu cuenta</CardDescription>
          </CardHeader>
          <CardContent>
            {!token && !done && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive mb-4">
                Token de recuperación faltante. Verifica el enlace en tu correo.
              </div>
            )}

            {done ? (
              <div className="flex items-start gap-3 rounded-md bg-green-50 p-4 text-green-800">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
                <div>
                  <p className="font-medium text-sm">Contraseña actualizada</p>
                  <p className="text-sm mt-0.5">Redirigiendo al login…</p>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="password">Nueva contraseña</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Mínimo 8 caracteres"
                    {...register("password")}
                  />
                  {errors.password && (
                    <p className="text-xs text-destructive">{errors.password.message}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="confirm">Confirmar contraseña</Label>
                  <Input
                    id="confirm"
                    type="password"
                    placeholder="••••••••"
                    {...register("confirm")}
                  />
                  {errors.confirm && (
                    <p className="text-xs text-destructive">{errors.confirm.message}</p>
                  )}
                </div>

                {apiError && (
                  <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                    {apiError}
                  </div>
                )}

                <Button type="submit" className="w-full" disabled={isSubmitting || !token}>
                  {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  Guardar nueva contraseña
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
