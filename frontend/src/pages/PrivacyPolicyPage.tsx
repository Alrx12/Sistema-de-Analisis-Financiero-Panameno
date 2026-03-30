import { ShieldCheck, Lock, Database, Eye, Trash2, Mail, TrendingUp } from "lucide-react"
import { Link } from "react-router-dom"

export default function PrivacyPolicyPage() {
  return (
    <div style={{ minHeight: "100vh", width: "100%", background: "#f4f5f7", colorScheme: "light" }}>
      {/* Header simple */}
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
          / Política de Privacidad
        </span>
      </header>

      {/* Contenido */}
      <main style={{ maxWidth: "48rem", margin: "0 auto", padding: "2.5rem 1.5rem", display: "flex", flexDirection: "column", gap: "2rem" }}>

        {/* Título */}
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-xl"
              style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}
            >
              <ShieldCheck className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold" style={{ color: "#1c2b4b" }}>Política de Privacidad</h1>
              <p className="text-sm" style={{ color: "#6b7280" }}>
                Última actualización: 29 de marzo de 2026
              </p>
            </div>
          </div>
          <div
            className="rounded-xl p-4 flex items-start gap-3 mt-4"
            style={{ background: "#e8f5e9", border: "1px solid #a5d6a7" }}
          >
            <ShieldCheck className="h-5 w-5 shrink-0 mt-0.5" style={{ color: "#2e7d32" }} />
            <p className="text-sm leading-relaxed" style={{ color: "#1b5e20" }}>
              SAFPRO cumple con los principios de la <strong>Ley 81 de Protección de Datos Personales
              de la República de Panamá</strong> (2019). Tus datos financieros son de tu exclusiva
              propiedad y no se comparten ni comercializan con terceros.
            </p>
          </div>
        </div>

        {/* Sección 1 — Quiénes somos */}
        <section style={{ background: "#ffffff", borderRadius: "0.75rem", padding: "1.5rem", display: "flex", flexDirection: "column", gap: "0.75rem", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
          <h2 className="text-base font-bold flex items-center gap-2" style={{ color: "#1c2b4b" }}>
            <TrendingUp className="h-4 w-4 text-indigo-500" />
            1. ¿Quiénes somos?
          </h2>
          <p className="text-sm leading-relaxed" style={{ color: "#374151" }}>
            SAFPRO (Sistema de Análisis Financiero Profesional) es una plataforma de análisis financiero
            personal. Permite a los usuarios cargar estados de cuenta bancarios en formato Excel para
            obtener categorización automática de gastos, visualizaciones y recomendaciones personalizadas.
          </p>
          <p className="text-sm leading-relaxed" style={{ color: "#374151" }}>
            SAFPRO opera bajo la responsabilidad de su administrador. Para contacto relacionado con
            privacidad y protección de datos, escribe a:{" "}
            <a href="mailto:admin@safpro.us" className="font-medium text-indigo-600 hover:underline">
              admin@safpro.us
            </a>
          </p>
        </section>

        {/* Sección 2 — Qué datos recopilamos */}
        <section style={{ background: "#ffffff", borderRadius: "0.75rem", padding: "1.5rem", display: "flex", flexDirection: "column", gap: "0.75rem", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
          <h2 className="text-base font-bold flex items-center gap-2" style={{ color: "#1c2b4b" }}>
            <Database className="h-4 w-4 text-blue-500" />
            2. ¿Qué datos recopilamos?
          </h2>
          <p className="text-sm" style={{ color: "#374151" }}>
            SAFPRO recopila únicamente la información necesaria para brindarte el servicio:
          </p>
          <div className="space-y-3 mt-2">
            {[
              {
                title: "Datos de cuenta",
                desc: "Nombre completo y correo electrónico. La contraseña se almacena usando un algoritmo de hashing seguro — nunca en texto plano.",
              },
              {
                title: "Archivos de estados de cuenta",
                desc: "Los archivos Excel que decides subir voluntariamente. Estos archivos contienen tus transacciones bancarias. Nunca solicitamos tus credenciales bancarias (usuario y contraseña del banco).",
              },
              {
                title: "Datos derivados del análisis",
                desc: "Transacciones extraídas, categorías asignadas, y montos agregados. Estos datos se generan a partir de los archivos que tú subes y se almacenan en tu cuenta privada.",
              },
              {
                title: "Datos del perfil financiero",
                desc: "Información que proporcionas voluntariamente durante el proceso de configuración: industria laboral, ingreso mensual esperado y metas financieras. Todos opcionales.",
              },
              {
                title: "Datos técnicos",
                desc: "Estadísticas básicas de uso a través de Cloudflare Insights (servicio que SAFPRO usa para el hosting). No se usan cookies de seguimiento ni píxeles de terceros.",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="rounded-lg p-3 flex items-start gap-3"
                style={{ background: "#f8fafc", border: "1px solid #e2e8f0" }}
              >
                <div
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white mt-0.5"
                  style={{ background: "#6366f1" }}
                >
                  ·
                </div>
                <div>
                  <p className="text-sm font-semibold" style={{ color: "#1c2b4b" }}>{item.title}</p>
                  <p className="text-xs leading-relaxed mt-0.5" style={{ color: "#4b5563" }}>{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Sección 3 — Para qué usamos tus datos */}
        <section style={{ background: "#ffffff", borderRadius: "0.75rem", padding: "1.5rem", display: "flex", flexDirection: "column", gap: "0.75rem", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
          <h2 className="text-base font-bold flex items-center gap-2" style={{ color: "#1c2b4b" }}>
            <Eye className="h-4 w-4 text-purple-500" />
            3. ¿Para qué usamos tus datos?
          </h2>
          <p className="text-sm leading-relaxed" style={{ color: "#374151" }}>
            Tus datos se utilizan exclusivamente para:
          </p>
          <ul className="space-y-2 mt-2">
            {[
              "Procesar y analizar los archivos que subes para generar tu reporte financiero personal.",
              "Categorizar automáticamente tus transacciones y mejorar la precisión con el tiempo a través del aprendizaje supervisado.",
              "Mostrarte visualizaciones, tendencias y recomendaciones financieras basadas en tus propios datos.",
              "Enviarte correos relacionados con el servicio (como restablecimiento de contraseña) cuando los solicitas explícitamente.",
              "Mantener la seguridad e integridad de la plataforma.",
            ].map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm" style={{ color: "#374151" }}>
                <span
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white mt-0.5"
                  style={{ background: "#8b5cf6" }}
                >
                  {i + 1}
                </span>
                <span className="leading-relaxed">{item}</span>
              </li>
            ))}
          </ul>
          <div
            className="rounded-lg p-3 mt-2"
            style={{ background: "#fef3c7", border: "1px solid #fde68a" }}
          >
            <p className="text-xs leading-relaxed" style={{ color: "#92400e" }}>
              <strong>Nota sobre el Knowledge Base (KB) global:</strong> Cuando corriges la categoría
              de un comercio de alcance universal (como Spotify, Netflix, Uber), esa corrección puede
              contribuir al KB global compartido por todos los usuarios — de forma completamente anónima,
              sin incluir ningún dato personal ni montos de transacciones.
            </p>
          </div>
        </section>

        {/* Sección 4 — Compartición de datos */}
        <section style={{ background: "#ffffff", borderRadius: "0.75rem", padding: "1.5rem", display: "flex", flexDirection: "column", gap: "0.75rem", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
          <h2 className="text-base font-bold flex items-center gap-2" style={{ color: "#1c2b4b" }}>
            <Lock className="h-4 w-4 text-green-500" />
            4. ¿Compartimos tus datos?
          </h2>
          <p className="text-sm leading-relaxed" style={{ color: "#374151" }}>
            <strong>No.</strong> SAFPRO no vende, alquila, comparte ni transfiere tus datos personales
            o financieros a terceros con fines comerciales, publicitarios o de cualquier otra índole.
          </p>
          <p className="text-sm leading-relaxed" style={{ color: "#374151" }}>
            Tus datos pueden ser accedidos únicamente por el administrador de la plataforma en casos
            excepcionales de soporte técnico y siempre con tu conocimiento previo. No existen contratos
            con empresas de publicidad ni plataformas de análisis de datos de terceros que reciban
            información de tus transacciones.
          </p>
          <p className="text-sm leading-relaxed" style={{ color: "#374151" }}>
            SAFPRO utiliza la infraestructura de <strong>Cloudflare</strong> para el hosting y la
            seguridad del sitio web (incluyendo CDN, firewall y DDoS protection). Cloudflare puede
            procesar metadatos de red (dirección IP, user-agent) como parte de sus servicios de
            seguridad, bajo sus propias políticas de privacidad.
          </p>
        </section>

        {/* Sección 5 — Seguridad */}
        <section style={{ background: "#ffffff", borderRadius: "0.75rem", padding: "1.5rem", display: "flex", flexDirection: "column", gap: "0.75rem", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
          <h2 className="text-base font-bold flex items-center gap-2" style={{ color: "#1c2b4b" }}>
            <ShieldCheck className="h-4 w-4 text-blue-600" />
            5. ¿Cómo protegemos tus datos?
          </h2>
          <p className="text-sm leading-relaxed" style={{ color: "#374151" }}>
            SAFPRO implementa las siguientes medidas técnicas de seguridad:
          </p>
          <div className="grid gap-2 sm:grid-cols-2 mt-2">
            {[
              { title: "HTTPS / TLS", desc: "Toda comunicación está cifrada con TLS. Cloudflare gestiona los certificados SSL." },
              { title: "Contraseñas hasheadas", desc: "Las contraseñas se almacenan con algoritmos de hashing seguros (pwdlib). Nunca en texto plano." },
              { title: "JWT con expiración", desc: "Los tokens de sesión expiran en 24 horas y se transmiten de forma segura." },
              { title: "Rate limiting", desc: "Los endpoints de autenticación tienen límite de intentos para prevenir ataques de fuerza bruta." },
              { title: "Sin credenciales bancarias", desc: "SAFPRO nunca solicita ni almacena tus credenciales del banco. El proceso es de carga manual de archivos." },
              { title: "Headers de seguridad", desc: "El servidor aplica headers HTTP de seguridad: X-Frame-Options, X-Content-Type-Options, Content-Security-Policy." },
            ].map((item) => (
              <div
                key={item.title}
                className="rounded-lg p-3"
                style={{ background: "#f0fdf4", border: "1px solid #bbf7d0" }}
              >
                <p className="text-xs font-semibold" style={{ color: "#15803d" }}>{item.title}</p>
                <p className="text-xs leading-relaxed mt-0.5" style={{ color: "#166534" }}>{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Sección 6 — Derechos ARCO */}
        <section style={{ background: "#ffffff", borderRadius: "0.75rem", padding: "1.5rem", display: "flex", flexDirection: "column", gap: "0.75rem", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
          <h2 className="text-base font-bold flex items-center gap-2" style={{ color: "#1c2b4b" }}>
            <Trash2 className="h-4 w-4 text-red-500" />
            6. Tus derechos — ARCO (Ley 81 de Panamá)
          </h2>
          <p className="text-sm leading-relaxed" style={{ color: "#374151" }}>
            De acuerdo con la Ley 81 de Protección de Datos Personales de la República de Panamá,
            tienes los siguientes derechos:
          </p>
          <div className="space-y-2 mt-2">
            {[
              {
                right: "Acceso (A)",
                desc: "Tienes derecho a solicitar qué datos personales tenemos registrados sobre ti.",
              },
              {
                right: "Rectificación (R)",
                desc: "Puedes corregir datos incorrectos o incompletos directamente desde la configuración de tu perfil.",
              },
              {
                right: "Cancelación (C)",
                desc: "Puedes solicitar la eliminación completa de tu cuenta y todos los datos asociados (transacciones, análisis, perfil). La eliminación es permanente e irreversible.",
              },
              {
                right: "Oposición (O)",
                desc: "Puedes oponerte al tratamiento de tus datos para usos específicos. En SAFPRO, dado que solo usamos tus datos para prestarte el servicio solicitado, el único uso disponible es el análisis financiero propio.",
              },
            ].map((item) => (
              <div
                key={item.right}
                className="flex items-start gap-3 rounded-lg p-3"
                style={{ background: "#fef2f2", border: "1px solid #fecaca" }}
              >
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                  style={{ background: "#ef4444" }}
                >
                  {item.right[0]}
                </span>
                <div>
                  <p className="text-sm font-semibold" style={{ color: "#7f1d1d" }}>{item.right}</p>
                  <p className="text-xs leading-relaxed mt-0.5" style={{ color: "#991b1b" }}>{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="text-sm leading-relaxed mt-2" style={{ color: "#374151" }}>
            Para ejercer cualquiera de estos derechos, contacta al administrador vía correo electrónico.
            Las solicitudes serán atendidas en un plazo no mayor a 30 días hábiles.
          </p>
        </section>

        {/* Sección 7 — Retención de datos */}
        <section style={{ background: "#ffffff", borderRadius: "0.75rem", padding: "1.5rem", display: "flex", flexDirection: "column", gap: "0.75rem", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
          <h2 className="text-base font-bold" style={{ color: "#1c2b4b" }}>7. Retención de datos</h2>
          <p className="text-sm leading-relaxed" style={{ color: "#374151" }}>
            Tus datos se conservan mientras mantengas una cuenta activa en SAFPRO. Si solicitas la
            eliminación de tu cuenta, todos tus datos serán eliminados permanentemente de nuestros
            servidores en un plazo máximo de 30 días hábiles.
          </p>
          <p className="text-sm leading-relaxed" style={{ color: "#374151" }}>
            No realizamos copias de seguridad de larga duración con fines de análisis. Los backups
            del servidor existen únicamente con fines de recuperación ante desastres y se eliminan
            automáticamente según el ciclo de retención del sistema.
          </p>
        </section>

        {/* Sección 8 — Cookies */}
        <section style={{ background: "#ffffff", borderRadius: "0.75rem", padding: "1.5rem", display: "flex", flexDirection: "column", gap: "0.75rem", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
          <h2 className="text-base font-bold" style={{ color: "#1c2b4b" }}>8. Cookies y seguimiento</h2>
          <p className="text-sm leading-relaxed" style={{ color: "#374151" }}>
            SAFPRO <strong>no utiliza cookies de seguimiento</strong> ni píxeles de publicidad. La
            sesión de usuario se gestiona mediante tokens JWT almacenados en la memoria del navegador
            (localStorage de React), no en cookies de servidor.
          </p>
          <p className="text-sm leading-relaxed" style={{ color: "#374151" }}>
            Cloudflare, como proveedor de infraestructura, puede establecer cookies técnicas propias
            para funciones de seguridad (como protección DDoS). Estas cookies son estrictamente
            funcionales y no se usan con fines de marketing.
          </p>
        </section>

        {/* Sección 9 — Menores */}
        <section style={{ background: "#ffffff", borderRadius: "0.75rem", padding: "1.5rem", display: "flex", flexDirection: "column", gap: "0.75rem", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
          <h2 className="text-base font-bold" style={{ color: "#1c2b4b" }}>9. Menores de edad</h2>
          <p className="text-sm leading-relaxed" style={{ color: "#374151" }}>
            SAFPRO está dirigido exclusivamente a personas mayores de 18 años. No recopilamos
            conscientemente datos de menores de edad. Si tienes conocimiento de que un menor ha
            creado una cuenta, por favor contáctanos para eliminarla inmediatamente.
          </p>
        </section>

        {/* Sección 10 — Cambios */}
        <section style={{ background: "#ffffff", borderRadius: "0.75rem", padding: "1.5rem", display: "flex", flexDirection: "column", gap: "0.75rem", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
          <h2 className="text-base font-bold" style={{ color: "#1c2b4b" }}>10. Cambios a esta política</h2>
          <p className="text-sm leading-relaxed" style={{ color: "#374151" }}>
            Esta política puede actualizarse ocasionalmente para reflejar cambios en el servicio o en
            la legislación aplicable. La fecha de última actualización siempre aparece al inicio del
            documento. El uso continuado de SAFPRO después de publicar cambios implica la aceptación
            de la política actualizada.
          </p>
        </section>

        {/* Contacto */}
        <section
          className="rounded-xl p-6 space-y-3"
          style={{ background: "#1c2b4b" }}
        >
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Mail className="h-4 w-4" />
            Contacto para asuntos de privacidad
          </h2>
          <p className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.7)" }}>
            Para ejercer tus derechos ARCO, reportar un incidente de seguridad, o realizar cualquier
            consulta sobre el tratamiento de tus datos personales:
          </p>
          <a
            href="mailto:admin@safpro.us"
            className="inline-flex items-center gap-2 text-sm font-semibold text-white hover:underline"
          >
            <Mail className="h-4 w-4" />
            admin@safpro.us
          </a>
        </section>

        {/* Footer links */}
        <div className="flex items-center justify-between py-4 text-sm" style={{ color: "#9ca3af" }}>
          <span>© 2026 SAFPRO. Todos los derechos reservados.</span>
          <div className="flex gap-4">
            <Link to="/terms" className="hover:text-indigo-600 transition-colors">Términos</Link>
            <Link to="/faq" className="hover:text-indigo-600 transition-colors">FAQ</Link>
            <Link to="/login" className="hover:text-indigo-600 transition-colors">Iniciar sesión</Link>
          </div>
        </div>

      </main>
    </div>
  )
}
