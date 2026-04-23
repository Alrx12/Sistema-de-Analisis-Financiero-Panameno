/**
 * TermsScreen — Términos de Servicio (contenido estático).
 * Ruta: /terms (fuera de (tabs))
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

export default function TermsScreen() {
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
          <Text style={st.title}>Términos de Servicio</Text>
          <Text style={st.subtitle}>Vigentes desde Marzo 2026</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={st.content}>

        {/* Intro */}
        <View style={st.introBanner}>
          <Ionicons name="document-text-outline" size={20} color={INDIGO} />
          <Text style={st.introText}>
            Al usar SAFPRO aceptas estos términos. Si no estás de acuerdo, no uses el servicio.
            Estos términos forman un contrato entre tú y el responsable del servicio.
          </Text>
        </View>

        <Section title="1. Descripción del Servicio">
          <Para>
            SAFPRO ("el Servicio") es una plataforma de análisis financiero personal que procesa
            archivos Excel de estados de cuenta bancarios para categorizar transacciones y generar
            reportes. No presta servicios de asesoría financiera, contable ni legal.
          </Para>
        </Section>

        <Section title="2. Planes y Precios">
          <Para>
            <Text style={{ color: TEXT, fontWeight: "700" }}>Plan Gratuito:</Text>
            {" "}Hasta 5 análisis, todas las funciones básicas, sin costo.
          </Para>
          <Para>
            <Text style={{ color: TEXT, fontWeight: "700" }}>Plan Pro — Mensual:</Text>
            {" "}$6.50 / mes — análisis ilimitados y funciones avanzadas.
          </Para>
          <Para>
            <Text style={{ color: TEXT, fontWeight: "700" }}>Plan Pro — Anual:</Text>
            {" "}$56 / año (equivalente a $4.67/mes, ahorro del 28%).
          </Para>
          <Para>
            Los precios pueden cambiar con 30 días de aviso previo por correo.
          </Para>
        </Section>

        <Section title="3. Política de Reembolsos">
          <Para>
            Ofrecemos reembolso completo dentro de los primeros{" "}
            <Text style={{ color: ORANGE, fontWeight: "700" }}>7 días</Text>
            {" "}desde la suscripción, sin preguntas. Escríbenos a{" "}
            <Text style={{ color: ORANGE }}>admin@safpro.us</Text>
            {" "}con el asunto "Reembolso".
          </Para>
        </Section>

        <Section title="4. Uso Aceptable">
          <Para>Puedes usar SAFPRO para:</Para>
          <Bullet text="Analizar tus propios estados de cuenta bancarios" />
          <Bullet text="Gestionar tus finanzas personales y familiares" />
          <Bullet text="Exportar tus propios datos para uso personal" />
          <Para>No puedes usar SAFPRO para:</Para>
          <Bullet text="Subir estados de cuenta de terceros sin su consentimiento" />
          <Bullet text="Intentar acceder a datos de otros usuarios" />
          <Bullet text="Usar el servicio para actividades ilegales o fraudulentas" />
          <Bullet text="Intentar hacer ingeniería inversa del sistema" />
          <Bullet text="Revender o redistribuir el acceso al servicio" />
        </Section>

        <Section title="5. Privacidad y Datos">
          <Para>
            El tratamiento de tus datos personales se rige por nuestra{" "}
            <Text style={{ color: INDIGO }}>Política de Privacidad</Text>
            {" "}y la Ley 81 de 2019 de la República de Panamá. No vendemos ni compartimos
            tus datos financieros con terceros sin tu consentimiento.
          </Para>
        </Section>

        <Section title="6. Propiedad Intelectual">
          <Para>
            El software, diseño y contenido de SAFPRO son propiedad del responsable del servicio.
            Los datos que subes (tus estados de cuenta) son tuyos. Al subirlos nos otorgas
            una licencia limitada para procesarlos y mostrarte los resultados.
          </Para>
        </Section>

        <Section title="7. Limitación de Responsabilidad">
          <Para>
            SAFPRO es una herramienta de análisis, no un asesor financiero. Las categorías,
            recomendaciones y proyecciones son orientativas. No somos responsables de decisiones
            financieras tomadas basándose en la información de la plataforma.
          </Para>
          <Para>
            El servicio se ofrece "tal cual". No garantizamos disponibilidad ininterrumpida,
            aunque hacemos nuestro mejor esfuerzo por mantener el servicio disponible.
          </Para>
        </Section>

        <Section title="8. Cancelación y Terminación">
          <Bullet text="Puedes cancelar tu suscripción en cualquier momento desde Mi Cuenta" />
          <Bullet text="Al cancelar, mantienes acceso hasta el fin del período pagado" />
          <Bullet text="Puedes eliminar tu cuenta y todos tus datos en cualquier momento" />
          <Bullet text="Nos reservamos el derecho de suspender cuentas que violen estos términos" />
        </Section>

        <Section title="9. Cambios en el Servicio">
          <Para>
            Podemos modificar o discontinuar funciones con 30 días de aviso previo. Los cambios
            en precios se notificarán por correo. Al continuar usando el servicio después de
            los cambios, aceptas las nuevas condiciones.
          </Para>
        </Section>

        <Section title="10. Ley Aplicable">
          <Para>
            Estos términos se rigen por las leyes de la República de Panamá.
            Cualquier disputa se resolverá en los tribunales competentes de la Ciudad de Panamá.
          </Para>
        </Section>

        <Section title="11. Contacto e Identidad del Responsable">
          <Para>
            <Text style={{ color: TEXT, fontWeight: "700" }}>Alexis Antonio Pineda Del Cid</Text>
            {"\n"}Cédula: 8-916-525 · República de Panamá
            {"\n"}Correo: <Text style={{ color: ORANGE }}>admin@safpro.us</Text>
            {"\n"}Web: safpro.us
          </Para>
        </Section>

        <Text style={st.footer}>SAFPRO · safpro.us/terms · Última actualización: Marzo 2026</Text>
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
