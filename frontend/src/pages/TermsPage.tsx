import { FileText, TrendingUp, Shield, CreditCard, AlertTriangle, Scale, Mail, UserCheck } from "lucide-react"
import { Link } from "react-router-dom"

export default function TermsPage() {
  return (
    <div style={{ minHeight: "100vh", width: "100%", background: "#f4f5f7", colorScheme: "light" }}>
      {/* Header */}
      <header
        className="flex items-center gap-3 px-6 py-4"
        style={{ background: "#1c2b4b", borderBottom: "1px solid rgba(255,255,255,0.08)" }}
      >
        <Link to="/" className="flex items-center gap-2.5 no-underline">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-lg text-white"
            style={{ background: "linear-gradient(135deg, #e05c19, #c0440e)" }}
          >
            <TrendingUp className="h-4 w-4" />
          </div>
          <span className="text-base font-bold text-white">SAFPRO</span>
        </Link>
        <span className="text-sm ml-2" style={{ color: "rgba(255,255,255,0.4)" }}>
          / Términos y Condiciones
        </span>
      </header>

      {/* Contenido */}
      <main style={{ maxWidth: "48rem", margin: "0 auto", padding: "2.5rem 1.5rem", display: "flex", flexDirection: "column", gap: "2rem" }}>

        {/* Título */}
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-xl"
              style={{ background: "linear-gradient(135deg, #1c2b4b, #2d4878)" }}
            >
              <FileText className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold" style={{ color: "#1c2b4b" }}>Términos y Condiciones de Uso</h1>
              <p className="text-sm" style={{ color: "#6b7280" }}>
                Última actualización: 29 de marzo de 2026 · Versión 1.0
              </p>
            </div>
          </div>
          <div
            className="rounded-xl p-4 flex items-start gap-3 mt-4"
            style={{ background: "#fff7ed", border: "1px solid #fed7aa" }}
          >
            <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" style={{ color: "#c2410c" }} />
            <p className="text-sm leading-relaxed" style={{ color: "#7c2d12" }}>
              Al usar SAFPRO, aceptas estos Términos. Si no estás de acuerdo con alguna parte,
              no deberás continuar usando el servicio. El uso continuado constituye aceptación.
            </p>
          </div>
        </div>

        {/* 1. Aceptación */}
        <section style={{ background: "#ffffff", borderRadius: "0.75rem", padding: "1.5rem", display: "flex", flexDirection: "column", gap: "0.75rem", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
          <h2 className="text-base font-bold flex items-center gap-2" style={{ color: "#1c2b4b" }}>
            <UserCheck className="h-4 w-4" style={{ color: "#e05c19" }} />
            1. Aceptación de los Términos
          </h2>
          <p className="text-sm leading-relaxed" style={{ color: "#374151" }}>
            Al acceder o utilizar SAFPRO, disponible en{" "}
            <a href="https://safpro.us" className="font-medium text-indigo-600 hover:underline">
              https://safpro.us
            </a>
            , usted acepta quedar vinculado por los presentes Términos y Condiciones de Uso.
            Si no está de acuerdo, no deberá utilizar el Servicio.
          </p>
          <p className="text-sm leading-relaxed" style={{ color: "#374151" }}>
            Le notificaremos cambios significativos mediante un aviso visible en la aplicación
            o por correo electrónico. El uso continuado del Servicio después de cualquier
            modificación constituye aceptación de los Términos modificados.
          </p>
        </section>

        {/* 2. Descripción */}
        <section style={{ background: "#ffffff", borderRadius: "0.75rem", padding: "1.5rem", display: "flex", flexDirection: "column", gap: "0.75rem", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
          <h2 className="text-base font-bold flex items-center gap-2" style={{ color: "#1c2b4b" }}>
            <TrendingUp className="h-4 w-4" style={{ color: "#e05c19" }} />
            2. Descripción del Servicio
          </h2>
          <p className="text-sm leading-relaxed" style={{ color: "#374151" }}>
            SAFPRO es una plataforma de análisis financiero personal que procesa estados de cuenta
            bancarios exportados manualmente por el usuario desde su banca en línea. El Servicio incluye:
          </p>
          <div className="space-y-2 mt-2">
            {[
              "Extracción automática de transacciones desde archivos Excel de Banco General, BAC Credomatic, Banistmo, Banesco y Credicorp Bank.",
              "Categorización automática con aprendizaje personalizado por usuario.",
              "Cálculo de KPIs financieros: ingresos, gastos, balance y distribución por categoría.",
              "Recomendaciones financieras personalizadas basadas en sus datos.",
              "Registro manual de gastos en efectivo y seguimiento de metas de ahorro.",
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-2 text-sm" style={{ color: "#374151" }}>
                <span
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white mt-0.5"
                  style={{ background: "#1c2b4b" }}
                >
                  {i + 1}
                </span>
                <span className="leading-relaxed">{item}</span>
              </div>
            ))}
          </div>
          <div
            className="rounded-lg p-3 mt-2 flex items-start gap-2"
            style={{ background: "#f0fdf4", border: "1px solid #bbf7d0" }}
          >
            <Shield className="h-4 w-4 shrink-0 mt-0.5" style={{ color: "#15803d" }} />
            <p className="text-xs leading-relaxed" style={{ color: "#166534" }}>
              <strong>SAFPRO no solicita, no almacena ni tiene acceso a sus credenciales bancarias
              (usuario y contraseña de banca en línea).</strong> El usuario exporta manualmente
              su estado de cuenta y lo sube al Servicio.
            </p>
          </div>
        </section>

        {/* 3. Cuenta */}
        <section style={{ background: "#ffffff", borderRadius: "0.75rem", padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1rem", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
          <h2 className="text-base font-bold flex items-center gap-2" style={{ color: "#1c2b4b" }}>
            <UserCheck className="h-4 w-4" style={{ color: "#e05c19" }} />
            3. Registro y Cuenta de Usuario
          </h2>
          {[
            {
              title: "3.1 Elegibilidad",
              text: "Para utilizar el Servicio debe ser mayor de 18 años y tener capacidad legal para celebrar contratos vinculantes en la República de Panamá.",
            },
            {
              title: "3.2 Responsabilidad de la cuenta",
              text: "Usted es responsable de mantener la confidencialidad de sus credenciales de acceso. Deberá notificarnos de inmediato ante cualquier uso no autorizado. SAFPRO no será responsable por pérdidas derivadas del uso no autorizado de su cuenta.",
            },
            {
              title: "3.3 Exactitud de la información",
              text: "Usted se compromete a proporcionar información verdadera y actualizada. SAFPRO se reserva el derecho de suspender cuentas con información falsa o engañosa.",
            },
          ].map((item) => (
            <div key={item.title}>
              <p className="text-sm font-semibold mb-1" style={{ color: "#1c2b4b" }}>{item.title}</p>
              <p className="text-sm leading-relaxed" style={{ color: "#374151" }}>{item.text}</p>
            </div>
          ))}
        </section>

        {/* 4. Planes y Pagos */}
        <section style={{ background: "#ffffff", borderRadius: "0.75rem", padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1rem", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
          <h2 className="text-base font-bold flex items-center gap-2" style={{ color: "#1c2b4b" }}>
            <CreditCard className="h-4 w-4" style={{ color: "#e05c19" }} />
            4. Planes y Pagos
          </h2>
          <div
            className="rounded-lg p-4"
            style={{ background: "#fff7ed", border: "1px solid #fed7aa" }}
          >
            <p className="text-sm font-semibold mb-1" style={{ color: "#c2410c" }}>Modelo de precios</p>
            <p className="text-sm leading-relaxed" style={{ color: "#7c2d12" }}>
              <strong>Plan Gratis:</strong> $0 — hasta 3 análisis históricos con funcionalidad completa, sin límite de tiempo.{" "}
              <strong>Plan Pro:</strong> $5/mes o $45/año ($3.75/mes) — análisis ilimitados, historial completo y KB personal avanzado.{" "}
              Los usuarios actuales de la fase Friends &amp; Family no están sujetos a cargo
              alguno hasta que activen formalmente su plan, con notificación previa de al menos{" "}
              <strong>15 días de anticipación</strong>.
            </p>
          </div>
          <div>
            <p className="text-sm font-semibold mb-1" style={{ color: "#1c2b4b" }}>4.2 Facturación</p>
            <p className="text-sm leading-relaxed" style={{ color: "#374151" }}>
              Los planes de pago se facturan mensual o anualmente según la opción seleccionada.
              SAFPRO utiliza proveedores de pago externos certificados; no almacenamos datos
              de tarjetas de crédito en nuestros servidores.
            </p>
          </div>
          <div>
            <p className="text-sm font-semibold mb-1" style={{ color: "#1c2b4b" }}>4.3 Cancelación y reembolsos</p>
            <p className="text-sm leading-relaxed" style={{ color: "#374151" }}>
              Puede cancelar su suscripción en cualquier momento desde la configuración de su cuenta.
              La cancelación surte efecto al final del período de facturación en curso.
              No se emiten reembolsos por períodos parciales, salvo que la ley aplicable
              establezca lo contrario.
            </p>
          </div>
        </section>

        {/* 5. Uso Aceptable */}
        <section style={{ background: "#ffffff", borderRadius: "0.75rem", padding: "1.5rem", display: "flex", flexDirection: "column", gap: "0.75rem", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
          <h2 className="text-base font-bold flex items-center gap-2" style={{ color: "#1c2b4b" }}>
            <AlertTriangle className="h-4 w-4" style={{ color: "#e05c19" }} />
            5. Uso Aceptable
          </h2>
          <p className="text-sm leading-relaxed" style={{ color: "#374151" }}>
            Al utilizar el Servicio, usted se compromete a <strong>NO</strong>:
          </p>
          <div className="space-y-2">
            {[
              "Subir archivos que no correspondan a estados de cuenta de su propia titularidad.",
              "Intentar acceder a datos de otros usuarios o a sistemas internos de SAFPRO.",
              "Realizar ingeniería inversa, descompilar o desensamblar cualquier componente.",
              "Usar el Servicio para actividades fraudulentas o que violen derechos de terceros.",
              "Sobrecargar intencionalmente la infraestructura (ataques DoS, scraping masivo).",
              "Revender o sublicenciar el acceso al Servicio sin autorización previa por escrito.",
            ].map((item, i) => (
              <div
                key={i}
                className="flex items-start gap-3 rounded-lg p-3"
                style={{ background: "#fef2f2", border: "1px solid #fecaca" }}
              >
                <span className="text-sm font-bold shrink-0 mt-0.5" style={{ color: "#ef4444" }}>✗</span>
                <p className="text-sm leading-relaxed" style={{ color: "#991b1b" }}>{item}</p>
              </div>
            ))}
          </div>
        </section>

        {/* 6. Datos y Privacidad */}
        <section style={{ background: "#ffffff", borderRadius: "0.75rem", padding: "1.5rem", display: "flex", flexDirection: "column", gap: "0.75rem", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
          <h2 className="text-base font-bold flex items-center gap-2" style={{ color: "#1c2b4b" }}>
            <Shield className="h-4 w-4" style={{ color: "#e05c19" }} />
            6. Datos y Privacidad
          </h2>
          <p className="text-sm leading-relaxed" style={{ color: "#374151" }}>
            Usted conserva la propiedad de todos los datos que sube al Servicio.
            SAFPRO no vende, alquila ni comparte su información financiera personal
            con terceros con fines comerciales.
          </p>
          <p className="text-sm leading-relaxed" style={{ color: "#374151" }}>
            El tratamiento de sus datos personales se rige por nuestra{" "}
            <Link to="/privacy" className="font-medium text-indigo-600 hover:underline">
              Política de Privacidad
            </Link>
            , la cual cumple con la Ley 81 de 2019 de la República de Panamá
            sobre Protección de Datos Personales y forma parte integral de estos Términos.
          </p>
        </section>

        {/* 7. Disponibilidad */}
        <section style={{ background: "#ffffff", borderRadius: "0.75rem", padding: "1.5rem", display: "flex", flexDirection: "column", gap: "0.75rem", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
          <h2 className="text-base font-bold flex items-center gap-2" style={{ color: "#1c2b4b" }}>
            <AlertTriangle className="h-4 w-4" style={{ color: "#e05c19" }} />
            7. Disponibilidad y Limitaciones
          </h2>
          <p className="text-sm leading-relaxed" style={{ color: "#374151" }}>
            SAFPRO realiza esfuerzos razonables para mantener el Servicio disponible. Sin embargo,
            no garantizamos disponibilidad ininterrumpida del 100%.
          </p>
          <div className="grid gap-2 sm:grid-cols-2 mt-2">
            {[
              { title: "Mantenimiento", desc: "El Servicio puede estar temporalmente inaccesible por mantenimiento o actualizaciones." },
              { title: "Formatos bancarios", desc: "Cambios en los formatos de exportación de los bancos pueden afectar temporalmente la funcionalidad." },
              { title: "Calidad del archivo", desc: "La exactitud del análisis depende de la calidad y formato del archivo Excel subido." },
              { title: "Solo orientativo", desc: "Las recomendaciones son informativas y no constituyen asesoría financiera, legal ni contable." },
            ].map((item) => (
              <div
                key={item.title}
                className="rounded-lg p-3"
                style={{ background: "#f8fafc", border: "1px solid #e2e8f0" }}
              >
                <p className="text-xs font-semibold" style={{ color: "#1c2b4b" }}>{item.title}</p>
                <p className="text-xs leading-relaxed mt-0.5" style={{ color: "#4b5563" }}>{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* 8. Propiedad Intelectual */}
        <section style={{ background: "#ffffff", borderRadius: "0.75rem", padding: "1.5rem", display: "flex", flexDirection: "column", gap: "0.75rem", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
          <h2 className="text-base font-bold flex items-center gap-2" style={{ color: "#1c2b4b" }}>
            <FileText className="h-4 w-4" style={{ color: "#e05c19" }} />
            8. Propiedad Intelectual
          </h2>
          <p className="text-sm leading-relaxed" style={{ color: "#374151" }}>
            Todos los derechos sobre el Servicio — incluyendo código fuente, diseño, marca, algoritmos
            de categorización y documentación — son propiedad exclusiva de SAFPRO y sus creadores.
          </p>
          <p className="text-sm leading-relaxed" style={{ color: "#374151" }}>
            Se le otorga una licencia limitada, no exclusiva, no transferible y revocable para usar
            el Servicio exclusivamente para sus fines personales de análisis financiero, sujeta al
            cumplimiento de estos Términos.
          </p>
        </section>

        {/* 9. Limitación de Responsabilidad */}
        <section style={{ background: "#ffffff", borderRadius: "0.75rem", padding: "1.5rem", display: "flex", flexDirection: "column", gap: "0.75rem", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
          <h2 className="text-base font-bold flex items-center gap-2" style={{ color: "#1c2b4b" }}>
            <Scale className="h-4 w-4" style={{ color: "#e05c19" }} />
            9. Limitación de Responsabilidad
          </h2>
          <p className="text-sm leading-relaxed" style={{ color: "#374151" }}>
            En la máxima medida permitida por la ley, SAFPRO no será responsable por:
          </p>
          <div className="space-y-2">
            {[
              "Pérdidas de datos derivadas de fallas técnicas o causas de fuerza mayor.",
              "Decisiones financieras tomadas basándose en los análisis o recomendaciones del Servicio.",
              "Acceso no autorizado derivado del uso inadecuado de sus credenciales.",
              "Daños indirectos, incidentales, especiales o consecuentes de cualquier naturaleza.",
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-2 text-sm" style={{ color: "#374151" }}>
                <span style={{ color: "#9ca3af" }}>·</span>
                <span className="leading-relaxed">{item}</span>
              </div>
            ))}
          </div>
          <p className="text-sm leading-relaxed mt-2" style={{ color: "#374151" }}>
            La responsabilidad total de SAFPRO no excederá el monto pagado por el usuario
            durante los <strong>tres (3) meses anteriores</strong> al evento que originó el reclamo.
          </p>
        </section>

        {/* 10. Modificaciones */}
        <section style={{ background: "#ffffff", borderRadius: "0.75rem", padding: "1.5rem", display: "flex", flexDirection: "column", gap: "0.75rem", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
          <h2 className="text-base font-bold" style={{ color: "#1c2b4b", marginBottom: 0 }}>10. Modificaciones al Servicio</h2>
          <p className="text-sm leading-relaxed" style={{ color: "#374151" }}>
            SAFPRO se reserva el derecho de modificar, suspender o discontinuar cualquier parte
            del Servicio. Le notificaremos cambios materiales con al menos{" "}
            <strong>quince (15) días de anticipación</strong> mediante aviso en la aplicación
            o correo electrónico al usuario registrado.
          </p>
        </section>

        {/* 11. Terminación */}
        <section style={{ background: "#ffffff", borderRadius: "0.75rem", padding: "1.5rem", display: "flex", flexDirection: "column", gap: "0.75rem", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
          <h2 className="text-base font-bold" style={{ color: "#1c2b4b" }}>11. Terminación</h2>
          <p className="text-sm leading-relaxed" style={{ color: "#374151" }}>
            Cualquiera de las partes puede terminar la relación en cualquier momento.
            El usuario puede cancelar su cuenta desde la configuración de la aplicación.
            SAFPRO puede suspender o cancelar el acceso sin previo aviso ante violaciones
            de estos Términos.
          </p>
          <p className="text-sm leading-relaxed" style={{ color: "#374151" }}>
            Tras la terminación, SAFPRO conservará los datos del usuario por un período de{" "}
            <strong>treinta (30) días</strong>, después de los cuales podrán ser eliminados
            de forma permanente.
          </p>
        </section>

        {/* 12. Ley Aplicable */}
        <section style={{ background: "#ffffff", borderRadius: "0.75rem", padding: "1.5rem", display: "flex", flexDirection: "column", gap: "0.75rem", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
          <h2 className="text-base font-bold flex items-center gap-2" style={{ color: "#1c2b4b" }}>
            <Scale className="h-4 w-4" style={{ color: "#e05c19" }} />
            12. Ley Aplicable y Resolución de Disputas
          </h2>
          <p className="text-sm leading-relaxed" style={{ color: "#374151" }}>
            Estos Términos se rigen por las leyes de la <strong>República de Panamá</strong>.
            Cualquier disputa será sometida a la jurisdicción exclusiva de los tribunales
            competentes de la Ciudad de Panamá.
          </p>
          <p className="text-sm leading-relaxed" style={{ color: "#374151" }}>
            Antes de iniciar cualquier procedimiento legal, las partes intentarán resolver la
            disputa de buena fe mediante comunicación directa por un período mínimo de
            treinta (30) días.
          </p>
        </section>

        {/* 13. Contacto */}
        <section
          className="rounded-xl p-6 space-y-3"
          style={{ background: "#1c2b4b" }}
        >
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Mail className="h-4 w-4" />
            13. Contacto
          </h2>
          <p className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.7)" }}>
            Para preguntas, reclamos o solicitudes relacionadas con estos Términos:
          </p>
          <a
            href="mailto:admin@safpro.us"
            className="inline-flex items-center gap-2 text-sm font-semibold text-white hover:underline"
          >
            <Mail className="h-4 w-4" />
            admin@safpro.us
          </a>
          <p className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.5)" }}>
            Haremos nuestro mejor esfuerzo para responder en un plazo razonable de tiempo hábil.
          </p>
        </section>

        {/* Footer */}
        <div className="flex items-center justify-between py-4 text-sm" style={{ color: "#9ca3af" }}>
          <span>© 2026 SAFPRO. Todos los derechos reservados.</span>
          <div className="flex gap-4">
            <Link to="/privacy" className="hover:text-indigo-600 transition-colors">Privacidad</Link>
            <Link to="/faq" className="hover:text-indigo-600 transition-colors">FAQ</Link>
            <Link to="/login" className="hover:text-indigo-600 transition-colors">Iniciar sesión</Link>
          </div>
        </div>

      </main>
    </div>
  )
}
