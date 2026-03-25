/**
 * Toast mínimo — no usa Radix para evitar dependencias extras de proveedor.
 * Se muestra en la esquina inferior derecha con auto-dismiss.
 * Uso: import { useToast, Toaster } from "@/components/ui/toast"
 */
import { useState, useCallback, useEffect } from "react"
import { X, CheckCircle2, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"

export type ToastVariant = "success" | "error" | "info"

interface ToastItem {
  id: number
  message: string
  variant: ToastVariant
}

// Singleton store — simple global state without Zustand
let _listeners: Array<(toasts: ToastItem[]) => void> = []
let _toasts: ToastItem[] = []
let _nextId = 0

function notify(toasts: ToastItem[]) {
  _toasts = toasts
  _listeners.forEach((l) => l(toasts))
}

export function toast(message: string, variant: ToastVariant = "info") {
  const id = _nextId++
  notify([..._toasts, { id, message, variant }])
  setTimeout(() => {
    notify(_toasts.filter((t) => t.id !== id))
  }, 4000)
}

export function useToastStore() {
  const [toasts, setToasts] = useState<ToastItem[]>(_toasts)
  useEffect(() => {
    _listeners.push(setToasts)
    return () => {
      _listeners = _listeners.filter((l) => l !== setToasts)
    }
  }, [])
  const dismiss = useCallback((id: number) => {
    notify(_toasts.filter((t) => t.id !== id))
  }, [])
  return { toasts, dismiss }
}

const icons: Record<ToastVariant, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: AlertCircle,
  info: AlertCircle,
}

const variantClasses: Record<ToastVariant, string> = {
  success: "bg-green-50 text-green-800 border-green-200",
  error: "bg-red-50 text-red-800 border-red-200",
  info: "bg-blue-50 text-blue-800 border-blue-200",
}

export function Toaster() {
  const { toasts, dismiss } = useToastStore()

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-full max-w-sm">
      {toasts.map((t) => {
        const Icon = icons[t.variant]
        return (
          <div
            key={t.id}
            className={cn(
              "flex items-start gap-3 rounded-lg border px-4 py-3 shadow-md text-sm animate-in slide-in-from-bottom-4",
              variantClasses[t.variant]
            )}
          >
            <Icon className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="flex-1">{t.message}</span>
            <button onClick={() => dismiss(t.id)} className="ml-1 shrink-0 opacity-60 hover:opacity-100">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
