import { useState } from "react"
import { ChevronDown, ChevronUp, ShieldCheck, HelpCircle, Lock, Database, RefreshCw, FileText, AlertTriangle, Star } from "lucide-react"
import { Link } from "react-router-dom"
import { cn } from "@/lib/utils"

// ─── Datos de preguntas frecuentes ──────────────────────────────────────────

const FAQ_SECTIONS = [
  {
    title: "Seguridad y privacidad",
    icon: ShieldCheck,
    color: "text-green-600",
    bg: "bg-green-50",
    questions: [
      {
        q: "¿Es segura mi información financiera?",
        a: `Sí. Tu información financiera se almacena en una base de datos privada asociada únicamente a tu cuenta.
        Nadie más puede ver tus transacciones, ni otros usuarios ni el equipo de SAFPRO salvo en situaciones
        excepcionales de soporte técnico y con tu consentimiento previo.

        La comunicación entre tu navegador y el servidor está cifrada con HTTPS/TLS. Las contraseñas se almacenan
        usando un algoritmo de hashing seguro (nunca en texto plano).`,
      },
      {
        q: "¿SAFPRO se conecta directamente a mi banco?",
        a: `No. SAFPRO nunca solicita tus credenciales bancarias (usuario y clave del banco).
        El proceso es completamente manual: tú descargas el Excel desde la banca en línea de tu banco
        y lo subes a SAFPRO. En ningún momento SAFPRO accede a tu cuenta bancaria directamente.

        Esto es una ventaja importante frente a apps que piden tus claves bancarias — con SAFPRO,
        tus credenciales del banco nunca salen de tu control.`,
      },
      {
        q: "¿Mis datos se comparten con terceros?",
        a: `No. SAFPRO no vende, comparte ni transfiere tus datos personales o financieros a terceros con fines
        comerciales. Tus datos se usan exclusivamente para ofrecerte el servicio de análisis financiero.

        El sistema de Knowledge Base (KB) tiene una excepción: cuando corriges una categoría de un negocio
        de alcance global (como Spotify, Netflix, Uber), esa corrección puede beneficiar al KB global
        que usa todos los usuarios — pero de forma anónima, sin incluir ningún dato personal ni montos.`,
      },
      {
        q: "¿Cumple SAFPRO con la Ley 81 de Panamá?",
        a: `Sí. SAFPRO está diseñado considerando los principios de la Ley 81 de Protección de Datos
        Personales de la República de Panamá (Ley 81 de 2019 y sus reglamentos):

        • Consentimiento: Al registrarte aceptas los términos de uso que explican cómo se tratan tus datos.
        • Finalidad: Tus datos se usan exclusivamente para el análisis financiero personal que solicitaste.
        • Proporcionalidad: Solo se recopila la información necesaria para el servicio (email, nombre, y los archivos que tú decides subir).
        • Seguridad: Se implementan medidas técnicas para proteger la confidencialidad e integridad de tus datos.
        • Derechos ARCO: Puedes acceder, rectificar, cancelar u oponerte al tratamiento de tus datos contactando al administrador de la plataforma.

        SAFPRO es un servicio personal y no comercializa datos de sus usuarios.`,
      },
      {
        q: "¿Puedo eliminar mi cuenta y todos mis datos?",
        a: `Sí. Tienes derecho a solicitar la eliminación completa de tu cuenta y todos los datos asociados
        (transacciones, análisis, Knowledge Base personal, perfil).

        Para hacerlo, contacta al administrador de la plataforma. La eliminación es permanente e irreversible.`,
      },
    ],
  },
  {
    title: "Uso y funcionalidades",
    icon: HelpCircle,
    color: "text-blue-600",
    bg: "bg-blue-50",
    questions: [
      {
        q: "¿Con qué bancos es compatible SAFPRO?",
        a: `Actualmente SAFPRO soporta los siguientes bancos panameños:

        • Banco General (.xlsx)
        • BAC Credomatic (.xls)
        • Banistmo (.xlsx desde la app)
        • Banesco (.xls — formato especial OOXML)

        También soporta el reporte de transferencias ACH/Xpress de Banistmo.
        Si tienes otro banco y quieres que lo agreguemos, puedes solicitarlo al administrador.`,
      },
      {
        q: "¿Qué pasa si subo el mismo archivo dos veces?",
        a: `SAFPRO detecta duplicados automáticamente usando una firma digital (SHA-256) del contenido del archivo.
        Si intentas subir un archivo que ya procesaste antes, el sistema te avisará de inmediato y no creará
        un análisis duplicado — aunque el archivo tenga un nombre diferente.

        Si necesitas reanalizar el mismo período (por ejemplo, después de corregir muchas categorías),
        contacta al administrador para limpiar el registro y poder subir el archivo de nuevo.`,
      },
      {
        q: "¿Por qué algunas transacciones quedan categorizadas incorrectamente?",
        a: `Los descriptores que los bancos ponen en las transacciones son crípticos y abreviados (ej: "DB POS COMPRA MCD CTE-XXXX").
        La primera vez que el sistema ve un negocio nuevo, puede no reconocerlo.

        La solución es corregirlo: ve a "Mis análisis" → selecciona el análisis → filtra por
        "Requiere revisión" → y corrige las categorías que estén mal. El sistema aprende de
        cada corrección y no volverá a equivocarse con ese negocio.

        Con el tiempo, el porcentaje de transacciones sin categorizar baja significativamente.`,
      },
      {
        q: "¿Qué es el Knowledge Base (KB)?",
        a: `El Knowledge Base es la "memoria" del sistema de categorización. Cuando corriges una categoría,
        esa corrección se guarda en tu KB personal y se aplica automáticamente a todas las transacciones
        futuras del mismo negocio.

        Hay dos tipos:
        • KB Personal: solo aplica a tu cuenta. Ideal para negocios locales (ej: "Restaurante El Rincón").
        • KB Global: aplica a todos los usuarios. Se actualiza cuando corriges merchants universales (Spotify, Netflix, Uber, etc.).

        Puedes ver y administrar tu KB desde el menú "Knowledge Base".`,
      },
      {
        q: "¿Puedo subir estados de cuenta de varios meses?",
        a: `Sí. Puedes subir archivos de diferentes meses y SAFPRO los guarda como análisis separados.
        En el Dashboard puedes ver el consolidado de todos los períodos que hayas subido, con filtros
        por año, mes y banco.

        Recomendamos subir los archivos mes a mes (un archivo por mes) para obtener análisis más precisos.`,
      },
      {
        q: "¿Qué es el presupuesto 50/30/20?",
        a: `Es una regla financiera popular que divide tus ingresos en tres categorías:

        • 50% para necesidades (vivienda, comida, transporte, servicios básicos)
        • 30% para deseos (entretenimiento, restaurantes, suscripciones)
        • 20% para ahorro e inversión

        SAFPRO calcula automáticamente en qué categoría cae cada gasto y te muestra qué tan cerca
        estás de la distribución ideal. Puedes verlo en la sección "Mi Presupuesto".`,
      },
    ],
  },
  {
    title: "Problemas comunes",
    icon: AlertTriangle,
    color: "text-amber-600",
    bg: "bg-amber-50",
    questions: [
      {
        q: "El sistema no reconoce mi archivo, ¿qué hago?",
        a: `Verifica lo siguiente:

        1. Asegúrate de descargar el archivo en formato Excel (no PDF ni CSV).
        2. El archivo debe ser el estado de cuenta original tal como lo exporta el banco — no lo abras y lo vuelvas a guardar, ya que esto puede cambiar el formato.
        3. Verifica que tu banco esté en la lista de bancos compatibles.
        4. Si el archivo tiene contraseña, elimínala primero en Excel antes de subirlo.

        Si el problema persiste, contacta al administrador indicando el banco y el mensaje de error que ves.`,
      },
      {
        q: "El análisis muestra ingresos o gastos incorrectos, ¿por qué?",
        a: `Puede deberse a transacciones mal categorizadas. Por ejemplo, una transferencia entre tus
        propias cuentas podría estar contando como "ingreso" cuando en realidad es un movimiento interno.

        Para corregirlo, ve al análisis → filtra las transacciones → y reclasifica las que estén mal.
        Las transacciones de tipo "transferencia propia" (entre cuentas tuyas) se excluyen automáticamente
        de los totales una vez que el sistema las identifica correctamente.`,
      },
      {
        q: "¿Por qué el análisis tardó mucho en procesarse?",
        a: `El procesamiento ocurre en segundo plano y usualmente toma entre 5 y 30 segundos dependiendo
        del tamaño del archivo. Si el estado tarda más de 2 minutos, puede que haya un problema técnico.

        Puedes refrescar la página para ver si el estado cambió. Si sigue en "procesando" después de
        5 minutos, intenta subir el archivo de nuevo. Si el error persiste, contacta al administrador.`,
      },
    ],
  },
]

// ─── Componente de pregunta individual ──────────────────────────────────────

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={cn("border-b border-border last:border-0", open && "pb-2")}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-start justify-between gap-3 py-4 text-left hover:text-primary transition-colors"
      >
        <span className="text-sm font-medium leading-relaxed">{q}</span>
        {open
          ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
          : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
        }
      </button>
      {open && (
        <div className="pb-4 space-y-2">
          {a.trim().split("\n\n").map((para, i) => (
            <p key={i} className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
              {para.trim()}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Página principal ────────────────────────────────────────────────────────

export default function FaqPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-8 animate-fade-up">

      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Preguntas frecuentes</h1>
          <p className="page-subtitle">Todo lo que necesitas saber sobre SAFPRO</p>
        </div>
      </div>

      {/* Highlight: Ley 81 */}
      <div className="rounded-xl border border-green-200 bg-green-50 p-4 flex items-start gap-3">
        <ShieldCheck className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-green-800">Cumplimiento con la Ley 81 de Panamá</p>
          <p className="text-xs text-green-700 mt-0.5 leading-relaxed">
            SAFPRO aplica los principios de protección de datos de la Ley 81 de 2019: consentimiento,
            finalidad, proporcionalidad y seguridad. Tus datos financieros son tuyos y no se comparten
            ni comercializan.{" "}
            <Link to="/privacy" className="font-semibold underline text-green-800 hover:text-green-900">
              Ver Política de Privacidad completa →
            </Link>
          </p>
        </div>
      </div>

      {/* Secciones de FAQ */}
      {FAQ_SECTIONS.map((section) => {
        const Icon = section.icon
        return (
          <section key={section.title} className="space-y-1">
            <div className={cn("flex items-center gap-2 px-3 py-2 rounded-lg", section.bg)}>
              <Icon className={cn("h-4 w-4 shrink-0", section.color)} />
              <h2 className={cn("text-sm font-semibold", section.color)}>{section.title}</h2>
            </div>
            <div className="zoho-card rounded-xl px-4 divide-y divide-border">
              {section.questions.map((item) => (
                <FaqItem key={item.q} q={item.q} a={item.a} />
              ))}
            </div>
          </section>
        )
      })}

      {/* Footer */}
      <div className="rounded-xl border border-border bg-muted/30 p-4 flex items-start gap-3">
        <Star className="h-4 w-4 text-primary shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground leading-relaxed">
          ¿No encontraste respuesta a tu pregunta? Puedes contactar al administrador de la plataforma.
          SAFPRO es un proyecto en desarrollo activo y sus funcionalidades se expanden constantemente.
        </p>
      </div>

      {/* Footer links */}
      <div className="flex items-center justify-between py-4 text-sm" style={{ color: "#9ca3af" }}>
        <span>© 2026 SAFPRO. Todos los derechos reservados.</span>
        <div className="flex gap-4">
          <Link to="/privacy" className="hover:text-indigo-600 transition-colors">Privacidad</Link>
          <Link to="/terms" className="hover:text-indigo-600 transition-colors">Términos</Link>
          <Link to="/login" className="hover:text-indigo-600 transition-colors">Iniciar sesión</Link>
        </div>
      </div>

    </div>
  )
}
