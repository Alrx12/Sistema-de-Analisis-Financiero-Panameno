/**
 * FaqScreen — Preguntas Frecuentes (contenido estático, sin internet).
 * Ruta: /faq (fuera de (tabs))
 */
import { useState } from "react"
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
const ORANGE = "#e05c19"
const INDIGO = "#6366f1"

const SECTIONS = [
  {
    title: "General",
    items: [
      {
        q: "¿Qué es SAFPRO?",
        a: "SAFPRO es una aplicación de análisis financiero personal para Panamá. Subes tu estado de cuenta bancario en Excel y el sistema extrae, categoriza y analiza tus transacciones automáticamente — sin pedirte acceso a tu banca en línea.",
      },
      {
        q: "¿Qué bancos son compatibles?",
        a: "Banco General, BAC Credomatic, Banistmo (estados de cuenta y movimientos ACH), Banesco y Credicorp Bank. El sistema detecta el banco automáticamente al subir el archivo.",
      },
      {
        q: "¿Cómo descargo mi estado de cuenta?",
        a: "Ingresa a tu banca en línea → Movimientos o Estado de cuenta → Exportar → Formato Excel (.xlsx o .xls). Cada banco lo llama diferente, pero todos ofrecen esa opción.",
      },
      {
        q: "¿La app funciona sin internet?",
        a: "No. SAFPRO necesita conexión para procesar archivos y mostrar tus datos. El análisis se realiza en nuestros servidores, no en tu dispositivo.",
      },
    ],
  },
  {
    title: "Privacidad y seguridad",
    items: [
      {
        q: "¿SAFPRO guarda mis contraseñas bancarias?",
        a: "Nunca. No pedimos ni almacenamos credenciales bancarias. Solo analizamos el archivo Excel que tú exportas manualmente. Tus claves jamás pasan por nuestros servidores.",
      },
      {
        q: "¿Están seguros mis datos financieros?",
        a: "Tus datos están cifrados en tránsito (SSL/TLS) y en reposo. Solo tú tienes acceso a tus transacciones — no las compartimos con terceros ni las usamos para publicidad.",
      },
      {
        q: "¿Puedo eliminar mi cuenta y mis datos?",
        a: "Sí. En Mi Cuenta → Zona peligrosa puedes borrar tus archivos, eliminar todos tus análisis, o eliminar tu cuenta y todos tus datos de forma permanente. Lo procesamos en menos de 24 horas.",
      },
    ],
  },
  {
    title: "Análisis y categorización",
    items: [
      {
        q: "¿Por qué algunas transacciones están mal categorizadas?",
        a: "El sistema aprende con el tiempo. La primera vez puede equivocarse con comercios desconocidos. Usa la pantalla de Entrenamiento para corregirlos — una sola corrección aplica a todas las transacciones del mismo comercio.",
      },
      {
        q: "¿Qué significa el porcentaje de confianza?",
        a: "Mide qué tan seguro está el sistema de su categorización. 90%+ es alta confianza. Menos del 70% se marca como 'requiere revisión'. Puedes mejorar la confianza entrenando el sistema en la pantalla de Entrenamiento.",
      },
      {
        q: "¿Qué es el Entrenamiento masivo?",
        a: "Es la pantalla donde corriges grupos de transacciones del mismo comercio de una sola vez. Cada corrección entrena al sistema para reconocerlas en el futuro, mejorando la precisión de todos los análisis.",
      },
      {
        q: "¿Qué pasa si subo el mismo archivo dos veces?",
        a: "El sistema detecta duplicados automáticamente mediante un hash del archivo y te avisa sin procesarlo de nuevo. No se crearán análisis duplicados.",
      },
    ],
  },
  {
    title: "Planes y pagos",
    items: [
      {
        q: "¿Cuántos archivos puedo subir?",
        a: "Plan gratuito: hasta 5 archivos. Plan Pro: ilimitado. Puedes subir estados de cuenta de diferentes meses y diferentes bancos — cada uno se analiza por separado.",
      },
      {
        q: "¿Qué incluye el Plan Pro?",
        a: "Análisis ilimitados, historial completo, Entrenamiento masivo de categorías, Simulaciones financieras avanzadas y presupuesto personalizado con ajustes según tu perfil.",
      },
      {
        q: "¿Puedo cancelar mi suscripción?",
        a: "Sí, en cualquier momento desde Mi Cuenta → Gestionar suscripción. No hay penalizaciones ni períodos mínimos de permanencia.",
      },
      {
        q: "¿Ofrecen reembolsos?",
        a: "Sí. Si no estás satisfecho dentro de los primeros 7 días, escríbenos a admin@safpro.us con asunto 'Reembolso' y lo procesamos sin preguntas.",
      },
    ],
  },
  {
    title: "Presupuesto 50/30/20",
    items: [
      {
        q: "¿Qué es el presupuesto 50/30/20?",
        a: "Es una guía de distribución del ingreso: 50% para necesidades (vivienda, comida, servicios), 30% para deseos (entretenimiento, restaurantes), y 20% para ahorro e inversión.",
      },
      {
        q: "¿SAFPRO ajusta las metas según mi situación?",
        a: "Sí. En Mi Cuenta puedes configurar tu perfil (dependientes, tipo de vivienda, empleo, deudas) y el sistema ajusta las metas automáticamente. Por ejemplo, si tienes dependientes, aumenta el % recomendado para necesidades.",
      },
    ],
  },
]

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <TouchableOpacity
      style={st.item}
      onPress={() => setOpen(o => !o)}
      activeOpacity={0.8}
    >
      <View style={st.itemHeader}>
        <Text style={st.question}>{q}</Text>
        <Ionicons
          name={open ? "chevron-up" : "chevron-down"}
          size={16}
          color="#9ca3af"
        />
      </View>
      {open && <Text style={st.answer}>{a}</Text>}
    </TouchableOpacity>
  )
}

export default function FaqScreen() {
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
          <Text style={st.title}>Preguntas Frecuentes</Text>
          <Text style={st.subtitle}>Todo lo que necesitas saber</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={st.content}>
        {SECTIONS.map((section) => (
          <View key={section.title} style={{ marginBottom: 20 }}>
            <Text style={st.sectionTitle}>{section.title}</Text>
            <View style={st.card}>
              {section.items.map((item, i) => (
                <FaqItem key={i} q={item.q} a={item.a} />
              ))}
            </View>
          </View>
        ))}

        {/* Contacto */}
        <View style={st.contactBox}>
          <Ionicons name="mail-outline" size={20} color={ORANGE} />
          <View style={{ flex: 1 }}>
            <Text style={st.contactTitle}>¿Tienes otra pregunta?</Text>
            <Text style={st.contactSub}>admin@safpro.us</Text>
          </View>
        </View>

        <Text style={st.footer}>SAFPRO · safpro.us</Text>
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

  content:      { padding: 16, paddingBottom: 40 },
  sectionTitle: { color: MUTED, fontSize: 12, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 8, marginLeft: 4 },

  card: {
    backgroundColor: CARD,
    borderRadius: 12,
    overflow: "hidden",
  },
  item: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  itemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  question: { color: TEXT, fontSize: 14, fontWeight: "700", flex: 1, lineHeight: 20 },
  answer:   { color: MUTED, fontSize: 13, lineHeight: 20, marginTop: 10 },

  contactBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: CARD,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "rgba(224,92,25,0.18)",
  },
  contactTitle: { color: TEXT, fontSize: 14, fontWeight: "700" },
  contactSub:   { color: ORANGE, fontSize: 13, marginTop: 2 },

  footer: { color: DIM, textAlign: "center", fontSize: 12 },
})
