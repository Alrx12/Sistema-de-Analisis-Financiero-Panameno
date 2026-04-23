/**
 * PrivacyScreen — Política de Privacidad (contenido estático).
 * Ruta: /privacy (fuera de (tabs))
 * Basada en la Ley 81 de Panamá de Protección de Datos Personales.
 */
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { Ionicons } from "@expo/vector-icons"
import { useRouter } from "expo-router"

const BG     = "#070c18"
const CARD   = "#0d1426"
const TEXT   = "#f1f5f9"
const MUTED  = "rgba(255,255,255,0.55)"
const DIM    = "rgba(255,255,255,0.28)"
const BORDER = "rgba(255,255,255,0.07)"
const INDIGO = "#6366f1"
const ORANGE = "#e05c19"

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={st.section}>
      <Text style={st.sectionTitle}>{title}</Text>
      <View style={st.card}>{children}</View>
    </View>
  )
}

function Para({ children }: { children: React.ReactNode }) {
  return <Text style={st.para}>{children}</Text>
}

function Bullet({ text }: { text: string }) {
  return (
    <View style={st.bulletRow}>
      <Text style={st.bulletDot}>•</Text>
      <Text style={st.bulletText}>{text}</Text>
    </View>
  )
}

export default function PrivacyScreen() {
  const router = useRouter()

  return (
    <SafeAreaView style={st.safe}>
      {/* Header */}
      <View style={st.header}>
        <TouchableOpacity onPress={() => router.back()} style={st.backBtn}>
          <Ionicons name="arrow-back" size={20} color={TEXT} />
          <Text style={st.backLabel}>Volver</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={st.title}>Política de Privacidad</Text>
          <Text style={st.subtitle}>Actualizada: Marzo 2026</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={st.content}>

        {/* Intro */}
        <View style={st.introBanner}>
          <Ionicons name="shield-checkmark-outline" size={20} color={INDIGO} />
          <Text style={st.introText}>
            SAFPRO respeta tu privacidad. Esta política describe cómo recopilamos, usamos y protegemos
            tu información personal de acuerdo con la <Text style={{ color: INDIGO }}>Ley 81 de 2019</Text> de
            Panamá sobre Protección de Datos Personales.
          </Text>
        </View>

        <Section title="1. Responsable del Tratamiento">
          <Para>
            <Text style={{ color: TEXT, fontWeight: "700" }}>Alexis Antonio Pineda Del Cid</Text>
            {"\n"}Cédula: 8-916-525 · República de Panamá
            {"\n"}Correo: admin@safpro.us
          </Para>
        </Section>

        <Section title="2. Datos que Recopilamos">
          <Para>Recopilamos únicamente los datos necesarios para prestarte el servicio:</Para>
          <Bullet text="Nombre completo y correo electrónico (al registrarte)" />
          <Bullet text="Archivos Excel de estados de cuenta que subes voluntariamente" />
          <Bullet text="Transacciones bancarias extraídas de esos archivos" />
          <Bullet text="Perfil financiero (industria, ingreso estimado, metas) — opcional" />
          <Bullet text="Datos de uso de la app (eventos de producto, con tu consentimiento)" />
          <Para style={{ marginTop: 10 }}>
            <Text style={{ color: ORANGE, fontWeight: "700" }}>No recopilamos</Text>
            {" "}contraseñas bancarias, credenciales de banca en línea, números de tarjeta completos ni datos biométricos.
          </Para>
        </Section>

        <Section title="3. Cómo Usamos tu Información">
          <Bullet text="Procesar y analizar tus estados de cuenta" />
          <Bullet text="Mostrarte tus KPIs, categorías y recomendaciones financieras" />
          <Bullet text="Enviarte correos transaccionales (verificación de cuenta, restablecimiento de contraseña)" />
          <Bullet text="Mejorar la precisión del sistema de categorización (de forma anónima)" />
          <Bullet text="Cumplir obligaciones legales y prevenir fraudes" />
        </Section>

        <Section title="4. Base Legal del Tratamiento">
          <Bullet text="Ejecución del contrato de servicio (Términos de Servicio aceptados al registrarte)" />
          <Bullet text="Consentimiento explícito para el perfil financiero opcional" />
          <Bullet text="Interés legítimo para prevención de fraudes y mejora del servicio" />
        </Section>

        <Section title="5. Compartir Información">
          <Para>
            <Text style={{ fontWeight: "700", color: TEXT }}>No vendemos ni alquilamos tus datos personales.</Text>
            {" "}Solo los compartimos cuando es estrictamente necesario:
          </Para>
          <Bullet text="Resend (envío de correos transaccionales) — bajo acuerdo de procesamiento" />
          <Bullet text="Cloudflare (hosting e infraestructura) — bajo acuerdo de procesamiento" />
          <Bullet text="Autoridades competentes si la ley lo exige" />
          <Para>
            Los nombres de comercios pueden ser compartidos de forma anónima para mejorar
            el Knowledge Base global de categorización. Nunca se comparte información personal identificable.
          </Para>
        </Section>

        <Section title="6. Seguridad de los Datos">
          <Bullet text="Transmisión cifrada con SSL/TLS (HTTPS)" />
          <Bullet text="Contraseñas almacenadas con hash seguro (nunca en texto plano)" />
          <Bullet text="Acceso restringido por autenticación JWT" />
          <Bullet text="Autenticación de dos factores (TOTP) disponible" />
          <Bullet text="Backups cifrados en Cloudflare R2 con retención de 30 días" />
          <Bullet text="Sin acceso a tus datos por parte de terceros sin tu autorización" />
        </Section>

        <Section title="7. Tus Derechos (Ley 81 de Panamá)">
          <Para>Tienes derecho a:</Para>
          <Bullet text="Acceder a tus datos personales en cualquier momento" />
          <Bullet text="Rectificar datos inexactos desde Mi Cuenta" />
          <Bullet text="Eliminar tu cuenta y todos tus datos (Mi Cuenta → Zona peligrosa)" />
          <Bullet text="Oponerte al tratamiento para fines de marketing" />
          <Bullet text="Portar tus datos en formato exportable" />
          <Para>
            Para ejercer cualquiera de estos derechos escríbenos a{" "}
            <Text style={{ color: ORANGE }}>admin@safpro.us</Text>.
          </Para>
        </Section>

        <Section title="8. Retención de Datos">
          <Bullet text="Datos de cuenta: mientras la cuenta esté activa" />
          <Bullet text="Archivos Excel: eliminados del servidor tras procesarse exitosamente" />
          <Bullet text="Transacciones analizadas: hasta que elimines el análisis o tu cuenta" />
          <Bullet text="Logs de seguridad: 90 días" />
          <Bullet text="Backups: 30 días" />
        </Section>

        <Section title="9. Cookies y Seguimiento">
          <Para>
            La app móvil no usa cookies. El sitio web (safpro.us) puede usar cookies técnicas
            estrictamente necesarias para la sesión. No usamos cookies de seguimiento ni publicidad.
          </Para>
        </Section>

        <Section title="10. Cambios a esta Política">
          <Para>
            Podemos actualizar esta política ocasionalmente. Te notificaremos por correo
            si realizamos cambios materiales. La versión vigente siempre estará disponible
            en safpro.us/privacy.
          </Para>
        </Section>

        <Section title="11. Contacto">
          <Para>
            Para consultas sobre privacidad o para ejercer tus derechos:
            {"\n\n"}
            <Text style={{ color: ORANGE }}>admin@safpro.us</Text>
            {"\n"}Alexis Antonio Pineda Del Cid
            {"\n"}República de Panamá
          </Para>
        </Section>

        <Text style={st.footer}>
          SAFPRO · safpro.us/privacy · Ley 81 de 2019 (Panamá)
        </Text>
      </ScrollView>
    </SafeAreaView>
  )
}

const st = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: BG },
  header:  {
    backgroundColor: CARD,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 18,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  backBtn:   { flexDirection: "row", alignItems: "center", gap: 6, paddingBottom: 2 },
  backLabel: { color: TEXT, fontSize: 14 },
  title:     { color: TEXT, fontSize: 20, fontWeight: "700" },
  subtitle:  { color: MUTED, fontSize: 13, marginTop: 2 },

  content: { padding: 16, paddingBottom: 40 },

  introBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "rgba(99,102,241,0.08)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(99,102,241,0.2)",
    padding: 14,
    marginBottom: 20,
  },
  introText: { color: MUTED, fontSize: 13, flex: 1, lineHeight: 20 },

  section:      { marginBottom: 16 },
  sectionTitle: { color: MUTED, fontSize: 12, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 8, marginLeft: 4 },
  card:         { backgroundColor: CARD, borderRadius: 12, padding: 16 },

  para: { color: MUTED, fontSize: 13, lineHeight: 20, marginBottom: 8 },

  bulletRow: { flexDirection: "row", gap: 8, marginBottom: 6 },
  bulletDot: { color: INDIGO, fontSize: 13, lineHeight: 20, marginTop: 1 },
  bulletText: { color: MUTED, fontSize: 13, lineHeight: 20, flex: 1 },

  footer: { color: DIM, textAlign: "center", fontSize: 11, marginTop: 8 },
})
