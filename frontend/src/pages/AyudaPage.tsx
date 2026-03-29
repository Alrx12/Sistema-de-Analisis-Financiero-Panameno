import { Monitor, Smartphone, Download, Upload, BookOpen, PenLine, ChevronDown, ChevronUp } from "lucide-react"
import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { cn } from "@/lib/utils"

// ─── Datos de bancos ────────────────────────────────────────────────────────

const BANKS = [
  {
    name: "Banco General",
    color: "#1a3a8f",
    device: "desktop",
    steps: [
      <>Entra a <strong>bgeneral.com</strong> → <strong>Banca en Línea</strong></>,
      <>Ve a <strong>Mis cuentas → Movimientos</strong></>,
      <>Selecciona el período que deseas analizar</>,
      <>Descarga el estado de cuenta en formato <strong>Excel (.xlsx)</strong></>,
    ],
    tip: "Puedes descargar hasta 12 meses de movimientos en un solo archivo.",
  },
  {
    name: "BAC Credomatic",
    color: "#e31837",
    device: "desktop",
    steps: [
      <>Entra a <strong>bac.net</strong> → <strong>Banca en Línea</strong></>,
      <>Ve a <strong>Cuentas → Estado de cuenta</strong></>,
      <>Selecciona el período deseado</>,
      <>Descarga en formato <strong>Excel (.xls)</strong></>,
    ],
    tip: "BAC exporta el archivo con extensión .xls — SAFPRO lo detecta automáticamente.",
  },
  {
    name: "Banistmo",
    color: "#00843d",
    device: "mobile",
    steps: [
      <>Abre la <strong>app de Banistmo</strong> en tu celular</>,
      <>Ve a <strong>Mis cuentas → Movimientos</strong></>,
      <>Selecciona el período que deseas</>,
      <>Usa la opción <strong>Descargar</strong> directamente desde la app</>,
    ],
    tip: "También puedes descargarlo desde la web en banistmo.com → Banca en línea.",
  },
  {
    name: "Banesco",
    color: "#e30613",
    device: "desktop",
    steps: [
      <>Entra a <strong>banesco.com.pa</strong> → <strong>Banca en Línea</strong></>,
      <>Ve a <strong>Cuentas → Movimientos</strong></>,
      <>Selecciona el rango de fechas</>,
      <>Descarga el archivo — Banesco lo exporta como <strong>.xls</strong> (SAFPRO lo detecta)</>,
    ],
    tip: "Banesco usa un formato especial (.xls que en realidad es Excel moderno). SAFPRO lo maneja automáticamente.",
  },
]

// ─── Componente de tarjeta de banco ─────────────────────────────────────────

function BankCard({ bank }: { bank: typeof BANKS[0] }) {
  const [open, setOpen] = useState(true)
  return (
    <div className="zoho-card rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent/30 transition-colors"
      >
        <span
          style={{ background: bank.color, width: 10, height: 10, borderRadius: "50%", flexShrink: 0 }}
        />
        <span className="font-semibold text-sm flex-1 text-left">{bank.name}</span>
        {bank.device === "mobile"
          ? <Smartphone className="h-4 w-4 text-muted-foreground mr-1" />
          : <Monitor className="h-4 w-4 text-muted-foreground mr-1" />
        }
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-border">
          <ol className="space-y-2 mt-3">
            {bank.steps.map((step, i) => (
              <li key={i} className="flex items-start gap-3 text-sm">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold mt-0.5">
                  {i + 1}
                </span>
                <span className="text-muted-foreground leading-relaxed">{step}</span>
              </li>
            ))}
          </ol>
          {bank.tip && (
            <div className="rounded-lg bg-primary/5 border border-primary/20 px-3 py-2 flex items-start gap-2">
              <span className="text-primary text-sm">💡</span>
              <p className="text-xs text-primary leading-relaxed">{bank.tip}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Página principal ────────────────────────────────────────────────────────

export default function AyudaPage() {
  const navigate = useNavigate()

  return (
    <div className="mx-auto max-w-2xl space-y-8 animate-fade-up">

      {/* Header */}
      <div>
        <div className="page-header">
          <div>
            <h1 className="page-title">Centro de ayuda</h1>
            <p className="page-subtitle">Guías y recursos para sacarle el máximo provecho a SAFPRO</p>
          </div>
        </div>
      </div>

      {/* Sección: Cómo obtener tu estado de cuenta */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-primary" />
          <h2 className="text-base font-semibold">¿Cómo obtener tu estado de cuenta?</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Para analizar tus finanzas necesitas descargar el estado de cuenta de tu banco en formato Excel.
          Cada banco tiene un proceso ligeramente diferente — selecciona el tuyo:
        </p>
        <div className="space-y-3">
          {BANKS.map((bank) => (
            <BankCard key={bank.name} bank={bank} />
          ))}
        </div>
      </section>

      {/* Sección: Entrada manual */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <PenLine className="h-5 w-5 text-primary" />
          <h2 className="text-base font-semibold">¿No tienes acceso al estado de cuenta?</h2>
        </div>
        <div className="zoho-card rounded-xl p-4 space-y-3">
          <p className="text-sm text-muted-foreground">
            Si no puedes descargar el Excel de tu banco, puedes ingresar tus transacciones manualmente
            una por una desde <strong>Entrada Manual</strong>. No es lo ideal para grandes volúmenes,
            pero funciona perfecto para registrar gastos del día a día.
          </p>
          <button
            onClick={() => navigate("/manual")}
            className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
          >
            <PenLine className="h-4 w-4" />
            Ir a Entrada Manual →
          </button>
        </div>
      </section>

      {/* Sección: Subir el archivo */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Upload className="h-5 w-5 text-primary" />
          <h2 className="text-base font-semibold">¿Cómo subir el archivo?</h2>
        </div>
        <div className="zoho-card rounded-xl p-4 space-y-3">
          <ol className="space-y-2">
            {[
              'Ve a "Subir estado de cuenta" en el menú lateral',
              "Arrastra y suelta el archivo Excel, o haz clic para seleccionarlo",
              "SAFPRO detecta automáticamente el banco — no necesitas indicarlo",
              "El sistema procesa el archivo en segundo plano (usualmente en segundos)",
              'Cuando termine, verás el análisis completo en "Mis análisis"',
            ].map((step, i) => (
              <li key={i} className="flex items-start gap-3 text-sm">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold mt-0.5">
                  {i + 1}
                </span>
                <span className="text-muted-foreground">{step}</span>
              </li>
            ))}
          </ol>
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 flex items-start gap-2">
            <span className="text-amber-500 text-sm mt-0.5">⚠️</span>
            <p className="text-xs text-amber-700">
              Si subes el mismo archivo dos veces, SAFPRO lo detecta por su contenido y te avisa — no se
              crearán duplicados.
            </p>
          </div>
        </div>
      </section>

      {/* Sección: Tips adicionales */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Download className="h-5 w-5 text-primary" />
          <h2 className="text-base font-semibold">Tips para mejores resultados</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            {
              title: "Descarga mes a mes",
              desc: "Analizar períodos de 1 mes a la vez da resultados más precisos que descargar varios meses juntos.",
            },
            {
              title: "Corrige las categorías",
              desc: 'La primera vez el sistema puede cometer errores. Corrígelos en "Mis análisis" y no volverá a equivocarse.',
            },
            {
              title: "Sube archivos históricos",
              desc: "Puedes subir estados de cuenta de meses anteriores para ver la evolución de tus finanzas.",
            },
            {
              title: "Un archivo = una cuenta",
              desc: "Cada archivo debe corresponder a una sola cuenta bancaria. No combines cuentas en un mismo archivo.",
            },
          ].map((tip) => (
            <div key={tip.title} className="zoho-card rounded-xl p-4 space-y-1">
              <p className="text-sm font-medium">{tip.title}</p>
              <p className="text-xs text-muted-foreground leading-relaxed">{tip.desc}</p>
            </div>
          ))}
        </div>
      </section>

    </div>
  )
}
