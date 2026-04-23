/**
 * AyudaScreen — FAQ y centro de ayuda
 */
import { useState } from "react"
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Linking,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { Ionicons } from "@expo/vector-icons"
import { useRouter } from "expo-router"

const FAQS = [
  {
    q: "¿Qué bancos son compatibles?",
    a: "Banco General, BAC Credomatic, Banistmo (estados de cuenta y movimientos), Banesco y Credicorp Bank. El sistema detecta el banco automáticamente al subir el archivo.",
  },
  {
    q: "¿Dónde descargo mi estado de cuenta?",
    a: "Ingresa a tu banca en línea → Movimientos o Estado de cuenta → Exportar → Formato Excel (.xlsx o .xls). Cada banco lo llama diferente, pero todos tienen esa opción.",
  },
  {
    q: "¿SAFPRO guarda mis contraseñas bancarias?",
    a: "No. Nunca pedimos acceso a tu banca. Solo analizamos el archivo que tú exportas manualmente. Tus credenciales bancarias jamás pasan por nuestros servidores.",
  },
  {
    q: "¿Por qué algunas transacciones están mal categorizadas?",
    a: "El sistema aprende con el tiempo. La primera vez puede equivocarse con comercios desconocidos. Usa la pantalla de Entrenamiento para corregirlos — una sola corrección sirve para todas las transacciones del mismo comercio.",
  },
  {
    q: "¿Cuántos archivos puedo subir?",
    a: "Plan gratuito: 5 archivos. Plan Pro: ilimitado. Puedes subir estados de cuenta de diferentes meses y diferentes bancos — todos se analizan por separado.",
  },
  {
    q: "¿Qué es el Entrenamiento masivo?",
    a: "Es la pantalla donde puedes corregir grupos de transacciones del mismo comercio de una sola vez. El sistema agrupa todas las transacciones de 'PEDIDOS YA' por ejemplo, y tú las clasificas en bloque. Cada corrección entrena al sistema para reconocerlas en el futuro.",
  },
  {
    q: "¿Qué significa el porcentaje de confianza?",
    a: "Es qué tan seguro está el sistema de su categorización. 90%+ es alta confianza. Por debajo de 70% se marca como 'requiere revisión'. Puedes mejorar la confianza entrenando el sistema en la pantalla de Entrenamiento.",
  },
  {
    q: "¿Qué es el presupuesto 50/30/20?",
    a: "Es una guía de distribución del ingreso: 50% para necesidades (vivienda, comida, servicios), 30% para deseos (entretenimiento, restaurantes), y 20% para ahorro e inversión. SAFPRO lo ajusta según tu perfil personal.",
  },
  {
    q: "¿La app funciona sin internet?",
    a: "No. SAFPRO necesita conexión para procesar los archivos y mostrar tus datos. Los archivos se procesan en nuestros servidores, no en tu dispositivo.",
  },
  {
    q: "¿Cómo cambio mi contraseña?",
    a: "En la web (safpro.us): Mi Cuenta → Cambiar contraseña. También puedes usar '¿Olvidaste tu contraseña?' en el login para recibir un enlace por correo.",
  },
]

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <TouchableOpacity
      style={styles.faqItem}
      onPress={() => setOpen(o => !o)}
      activeOpacity={0.8}
    >
      <View style={styles.faqHeader}>
        <Text style={styles.faqQ}>{q}</Text>
        <Ionicons
          name={open ? "chevron-up" : "chevron-down"}
          size={18}
          color="#9ca3af"
        />
      </View>
      {open && <Text style={styles.faqA}>{a}</Text>}
    </TouchableOpacity>
  )
}

export default function AyudaScreen() {
  const router = useRouter()

  // Mapa de rutas nativas para los links legales
  const LEGAL_LINKS: Array<{
    label: string
    icon: "shield-checkmark-outline" | "document-text-outline" | "help-circle-outline" | "mail-outline"
    route: string
    external?: boolean
  }> = [
    { label: "Política de Privacidad", icon: "shield-checkmark-outline", route: "/privacy" },
    { label: "Términos de Servicio",   icon: "document-text-outline",    route: "/terms" },
    { label: "Preguntas Frecuentes",   icon: "help-circle-outline",      route: "/faq" },
    { label: "Contacto",               icon: "mail-outline",             route: "/contacto" },
  ]

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>Ayuda</Text>
        <Text style={styles.subtitle}>Preguntas frecuentes</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Banner de contacto */}
        <TouchableOpacity
          style={styles.contactBanner}
          onPress={() => router.push("/contacto" as any)}
        >
          <Ionicons name="mail-outline" size={20} color="#e05c19" />
          <View style={{ flex: 1 }}>
            <Text style={styles.contactTitle}>¿No encuentras tu respuesta?</Text>
            <Text style={styles.contactSub}>admin@safpro.us</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
        </TouchableOpacity>

        {/* FAQs */}
        <View style={styles.faqList}>
          {FAQS.map((item, i) => (
            <FaqItem key={i} q={item.q} a={item.a} />
          ))}
        </View>

        {/* Bancos soportados */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Bancos soportados</Text>
          {[
            { name: "Banco General",   color: "#e05c19" },
            { name: "BAC Credomatic",  color: "#e02020" },
            { name: "Banistmo",        color: "#0057a8" },
            { name: "Banesco",         color: "#003087" },
            { name: "Credicorp Bank",  color: "#0057a8" },
          ].map(b => (
            <View key={b.name} style={styles.bankRow}>
              <View style={[styles.bankDot, { backgroundColor: b.color }]} />
              <Text style={styles.bankName}>{b.name}</Text>
            </View>
          ))}
        </View>

        {/* Legal y contacto */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Legal y contacto</Text>
          {LEGAL_LINKS.map(({ label, icon, route }) => (
            <TouchableOpacity
              key={route}
              style={styles.legalRow}
              onPress={() => router.push(route as any)}
              activeOpacity={0.7}
            >
              <Ionicons name={icon} size={16} color="#6366f1" />
              <Text style={styles.legalLabel}>{label}</Text>
              <Ionicons name="chevron-forward" size={13} color="rgba(255,255,255,0.28)" />
            </TouchableOpacity>
          ))}
        </View>

        {/* Footer */}
        <Text style={styles.footer}>SAFPRO v1.0.0 · safpro.us</Text>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#070c18" },
  header: {
    backgroundColor: "#0d1426",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
  },
  title:    { color: "#ffffff", fontSize: 22, fontWeight: "700" },
  subtitle: { color: "#93afd4", fontSize: 13, marginTop: 2 },
  content:  { padding: 16, paddingBottom: 40 },
  contactBanner: {
    backgroundColor: "#0d1426",
    borderRadius: 12,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  contactTitle: { fontSize: 14, fontWeight: "700", color: "#f1f5f9" },
  contactSub:   { fontSize: 13, color: "#e05c19", marginTop: 2 },
  faqList: {
    backgroundColor: "#0d1426",
    borderRadius: 12,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
    overflow: "hidden",
  },
  faqItem: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.07)",
  },
  faqHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  faqQ: {
    fontSize: 14,
    fontWeight: "700",
    color: "#f1f5f9",
    flex: 1,
    lineHeight: 20,
  },
  faqA: {
    fontSize: 13,
    color: "rgba(255,255,255,0.45)",
    lineHeight: 20,
    marginTop: 10,
  },
  section: {
    backgroundColor: "#0d1426",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionTitle: { fontWeight: "700", color: "#f1f5f9", marginBottom: 12, fontSize: 15 },
  bankRow:  { flexDirection: "row", alignItems: "center", paddingVertical: 6 },
  bankDot:  { width: 10, height: 10, borderRadius: 5, marginRight: 10 },
  bankName: { color: "#f1f5f9", fontSize: 14 },
  legalRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.07)",
  },
  legalLabel: { color: "#f1f5f9", fontSize: 14, flex: 1 },
  footer:   { color: "rgba(255,255,255,0.28)", textAlign: "center", fontSize: 12 },
})
