/**
 * Layout principal — Sidebar deslizable estilo web
 * Usa Slot de expo-router para renderizar la pantalla activa.
 * El sidebar replica el diseño del AppShell web: dark navy, secciones,
 * badge Pro, usuario y logout.
 */
import {
  Animated, Dimensions, StyleSheet, Text, Linking,
  TouchableOpacity, TouchableWithoutFeedback, View,
} from "react-native"
import { Slot, usePathname, useRouter } from "expo-router"
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context"
import { Ionicons } from "@expo/vector-icons"
import { useRef, useState, useCallback, useEffect } from "react"
import { useQuery } from "@tanstack/react-query"
import { getMe, getProfile } from "@safpro/api/users"
import * as SecureStore from "expo-secure-store"
import { getAuthStore } from "@safpro/stores"
import { clearPushToken } from "@safpro/api/notifications"

// ── Design tokens ─────────────────────────────────────────────────────────────
const SIDEBAR_BG = "#0d1426"
const BG         = "#070c18"
const INDIGO     = "#6366f1"
const INDIGO_DIM = "rgba(99,102,241,0.15)"
const TEXT       = "#f1f5f9"
const MUTED      = "rgba(255,255,255,0.55)"
const DIM        = "rgba(255,255,255,0.28)"
const BORDER     = "rgba(255,255,255,0.07)"
const SIDEBAR_W  = 248
const TOKEN_KEY  = "safpro_access_token"

// ── Nav structure ─────────────────────────────────────────────────────────────
type NavItem = {
  route: string
  label: string
  icon: string
  iconFocused: string
  pro?: boolean
  admin?: boolean
}

const NAV_SECTIONS: { label: string; items: NavItem[] }[] = [
  {
    label: "Principal",
    items: [
      { route: "/(tabs)/dashboard", label: "Dashboard",          icon: "home-outline",          iconFocused: "home" },
      { route: "/(tabs)/upload",    label: "Subir estado",       icon: "cloud-upload-outline",  iconFocused: "cloud-upload" },
      { route: "/(tabs)/manual",    label: "Entrada Manual",     icon: "pencil-outline",        iconFocused: "pencil" },
      { route: "/(tabs)/cuentas",   label: "Cuentas y Metas",    icon: "wallet-outline",        iconFocused: "wallet" },
    ],
  },
  {
    label: "Análisis",
    items: [
      { route: "/(tabs)/analysis",  label: "Mis análisis",   icon: "bar-chart-outline",  iconFocused: "bar-chart" },
      { route: "/(tabs)/budget",    label: "Mi Presupuesto", icon: "pie-chart-outline",  iconFocused: "pie-chart" },
    ],
  },
  {
    label: "Inteligencia",
    items: [
      { route: "/(tabs)/retrain",      label: "Entrenamiento", icon: "sparkles-outline",   iconFocused: "sparkles",    pro: true },
      { route: "/(tabs)/simulaciones", label: "Simulaciones",  icon: "flask-outline",      iconFocused: "flask",       pro: true },
      { route: "/(tabs)/kb",           label: "Knowledge Base", icon: "library-outline",   iconFocused: "library",     admin: true },
    ],
  },
  {
    label: "Soporte",
    items: [
      { route: "/(tabs)/ayuda",  label: "Ayuda y FAQ",    icon: "help-circle-outline", iconFocused: "help-circle" },
      { route: "/(tabs)/admin",  label: "Panel Admin",    icon: "shield-outline",       iconFocused: "shield",       admin: true },
    ],
  },
]

// ── Sidebar component ─────────────────────────────────────────────────────────
function Sidebar({
  open,
  onClose,
  slideAnim,
}: {
  open: boolean
  onClose: () => void
  slideAnim: Animated.Value
}) {
  const router   = useRouter()
  const pathname = usePathname()
  const insets   = useSafeAreaInsets()
  const { data: user } = useQuery({ queryKey: ["me"], queryFn: getMe })

  const plan     = user?.plan ?? "free"
  const isPro    = plan === "pro"
  const isFF     = plan === "friends_and_family"
  const isAdmin  = user?.is_admin === true
  const initials = user?.full_name
    ? user.full_name.split(" ").map((n: string) => n[0]).slice(0, 2).join("").toUpperCase()
    : "?"

  function navigate(route: string) {
    onClose()
    router.push(route as any)
  }

  async function handleLogout() {
    onClose()
    // Borrar push token del servidor antes de eliminar el JWT local
    clearPushToken().catch(() => {})
    await SecureStore.deleteItemAsync(TOKEN_KEY)
    getAuthStore().getState().logout()
    router.replace("/(auth)/login")
  }

  function isActive(route: string) {
    // match by the last segment of the route
    const segment = route.split("/").pop()
    return pathname.includes(segment ?? "")
  }

  return (
    <>
      {/* Overlay */}
      {open && (
        <TouchableWithoutFeedback onPress={onClose}>
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              styles.overlay,
              { opacity: slideAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) },
            ]}
          />
        </TouchableWithoutFeedback>
      )}

      {/* Sidebar panel */}
      <Animated.View
        style={[
          styles.sidebar,
          { paddingTop: insets.top },
          {
            transform: [{
              translateX: slideAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [-SIDEBAR_W, 0],
              }),
            }],
          },
        ]}
        pointerEvents={open ? "auto" : "none"}
      >
        {/* Logo */}
        <View style={styles.sidebarHeader}>
          <View style={styles.logoChip}>
            <Ionicons name="trending-up" size={14} color="#fff" />
          </View>
          <View>
            <Text style={styles.logoTitle}>SAFPRO</Text>
            <Text style={styles.logoSub}>FINANCIAL AI</Text>
          </View>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Ionicons name="close" size={20} color={MUTED} />
          </TouchableOpacity>
        </View>

        {/* Nav sections */}
        <View style={{ flex: 1 }}>
          {NAV_SECTIONS.map((section) => (
            <View key={section.label}>
              <Text style={styles.sectionLabel}>{section.label}</Text>
              {section.items
              .filter((item) => !item.admin || isAdmin)
              .map((item) => {
                const active = isActive(item.route)
                return (
                  <TouchableOpacity
                    key={item.route}
                    style={[styles.navItem, active && styles.navItemActive]}
                    onPress={() => navigate(item.route)}
                    activeOpacity={0.75}
                  >
                    <Ionicons
                      name={(active ? item.iconFocused : item.icon) as any}
                      size={17}
                      color={active ? "#a5b4fc" : MUTED}
                    />
                    <Text style={[styles.navLabel, active && styles.navLabelActive]}>
                      {item.label}
                    </Text>
                    {item.pro && plan === "free" && (
                      <Ionicons name="lock-closed" size={12} color={DIM} />
                    )}
                    {item.admin && (
                      <Ionicons name="shield-checkmark" size={12} color="#fbbf24" />
                    )}
                  </TouchableOpacity>
                )
              })}
            </View>
          ))}
        </View>

        {/* Plan badge */}
        {isPro && (
          <TouchableOpacity
            style={styles.planBadge}
            onPress={() => { onClose(); Linking.openURL("https://safpro.us/upgrade") }}
            activeOpacity={0.8}
          >
            <Ionicons name="star" size={14} color="#fbbf24" />
            <View>
              <Text style={styles.planBadgeTitle}>Plan Pro activo</Text>
              <Text style={styles.planBadgeSub}>Gestionar suscripción →</Text>
            </View>
          </TouchableOpacity>
        )}
        {isFF && (
          <View style={[styles.planBadge, { borderColor: "rgba(139,92,246,0.25)" }]}>
            <Ionicons name="flash" size={14} color="#a78bfa" />
            <View>
              <Text style={styles.planBadgeTitle}>Friends & Family</Text>
              <Text style={styles.planBadgeSub}>Acceso completo ✓</Text>
            </View>
          </View>
        )}
        {plan === "free" && (
          <TouchableOpacity
            style={[styles.planBadge, { borderColor: "rgba(224,92,25,0.3)", backgroundColor: "rgba(224,92,25,0.08)" }]}
            onPress={() => { onClose(); Linking.openURL("https://safpro.us/upgrade") }}
            activeOpacity={0.8}
          >
            <Ionicons name="flash" size={14} color="#f97316" />
            <View>
              <Text style={[styles.planBadgeTitle, { color: "#fb923c" }]}>Actualiza a Pro</Text>
              <Text style={styles.planBadgeSub}>Desde $5/mes — sin límites</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* User + logout */}
        <View style={[styles.sidebarFooter, { paddingBottom: insets.bottom || 16 }]}>
          <TouchableOpacity
            style={styles.userRow}
            onPress={() => navigate("/(tabs)/account")}
            activeOpacity={0.8}
          >
            <View style={styles.userAvatar}>
              <Text style={styles.userAvatarText}>{initials}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.userName} numberOfLines={1}>{user?.full_name ?? "Usuario"}</Text>
              <Text style={styles.userEmail} numberOfLines={1}>{user?.email}</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity style={styles.logoutRow} onPress={handleLogout} activeOpacity={0.7}>
            <Ionicons name="log-out-outline" size={16} color={MUTED} />
            <Text style={styles.logoutText}>Cerrar sesión</Text>
          </TouchableOpacity>
          <Text style={styles.privacyLink}>Política de Privacidad</Text>
        </View>
      </Animated.View>
    </>
  )
}

// ── Shell header ──────────────────────────────────────────────────────────────
function AppHeader({ onOpen }: { onOpen: () => void }) {
  const insets = useSafeAreaInsets()
  return (
    <View style={[styles.appHeader, { paddingTop: insets.top }]}>
      <TouchableOpacity onPress={onOpen} style={styles.hamburger} activeOpacity={0.7}>
        <Ionicons name="menu" size={24} color={MUTED} />
      </TouchableOpacity>
      <View style={styles.appHeaderLogo}>
        <View style={styles.logoChipSmall}>
          <Ionicons name="trending-up" size={12} color="#fff" />
        </View>
        <Text style={styles.appHeaderTitle}>SAFPRO</Text>
      </View>
    </View>
  )
}

// ── Root layout ───────────────────────────────────────────────────────────────
export default function AppShellLayout() {
  const router    = useRouter()
  const [open, setOpen] = useState(false)
  const slideAnim = useRef(new Animated.Value(0)).current

  // ── Redirect to onboarding if not completed yet ──────────────────────────
  const { data: profile } = useQuery({
    queryKey: ["profile"],
    queryFn: getProfile,
    staleTime: 1000 * 60 * 5,
    retry: 1,
  })

  useEffect(() => {
    if (profile && profile.onboarding_completed === false) {
      router.replace("/onboarding")
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.onboarding_completed])

  const openSidebar = useCallback(() => {
    setOpen(true)
    Animated.spring(slideAnim, {
      toValue: 1,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start()
  }, [slideAnim])

  const closeSidebar = useCallback(() => {
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 220,
      useNativeDriver: true,
    }).start(() => setOpen(false))
  }, [slideAnim])

  return (
    <View style={styles.root}>
      {/* Header fijo */}
      <AppHeader onOpen={openSidebar} />

      {/* Contenido de la pantalla activa */}
      <View style={styles.content}>
        <Slot />
      </View>

      {/* Sidebar (overlay) */}
      <Sidebar open={open} onClose={closeSidebar} slideAnim={slideAnim} />
    </View>
  )
}

// ── Estilos ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: BG },
  content: { flex: 1 },

  // App header (top bar con hamburger)
  appHeader: {
    backgroundColor: SIDEBAR_BG,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    gap: 12,
  },
  hamburger:      { padding: 4 },
  appHeaderLogo:  { flexDirection: "row", alignItems: "center", gap: 8 },
  logoChipSmall: {
    width: 24, height: 24, borderRadius: 6,
    backgroundColor: INDIGO,
    alignItems: "center", justifyContent: "center",
  },
  appHeaderTitle: { color: TEXT, fontSize: 14, fontWeight: "700", letterSpacing: 1.5 },

  // Overlay
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
    zIndex: 40,
  },

  // Sidebar panel
  sidebar: {
    position: "absolute",
    top: 0,
    left: 0,
    bottom: 0,
    width: SIDEBAR_W,
    backgroundColor: SIDEBAR_BG,
    zIndex: 50,
    borderRightWidth: 1,
    borderRightColor: BORDER,
  },
  sidebarHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  logoChip: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: INDIGO,
    alignItems: "center", justifyContent: "center",
  },
  logoTitle: { color: TEXT,  fontSize: 13, fontWeight: "800", letterSpacing: 1 },
  logoSub:   { color: DIM as string, fontSize: 9, fontWeight: "600", letterSpacing: 2 },
  closeBtn:  { marginLeft: "auto" },

  // Nav
  sectionLabel: {
    fontSize: 10, fontWeight: "700", letterSpacing: 1.5,
    textTransform: "uppercase",
    color: DIM as string,
    paddingHorizontal: 14,
    paddingTop: 16,
    paddingBottom: 5,
  },
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 9,
    paddingHorizontal: 12,
    marginHorizontal: 6,
    borderRadius: 8,
    marginBottom: 2,
    borderWidth: 1,
    borderColor: "transparent",
  },
  navItemActive: {
    backgroundColor: INDIGO_DIM,
    borderColor: "rgba(99,102,241,0.25)",
  },
  navLabel: {
    color: MUTED as string, fontSize: 14, fontWeight: "500", flex: 1,
  },
  navLabelActive: {
    color: "#a5b4fc", fontWeight: "600",
  },

  // Plan badge
  planBadge: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginHorizontal: 8,
    marginBottom: 6,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(99,102,241,0.25)",
    backgroundColor: "rgba(99,102,241,0.1)",
  },
  planBadgeTitle: { color: MUTED as string, fontSize: 12, fontWeight: "700", lineHeight: 16 },
  planBadgeSub:   { color: DIM as string,  fontSize: 10, lineHeight: 14 },

  // Footer
  sidebarFooter: {
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingHorizontal: 8,
    paddingTop: 8,
  },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 8,
    borderRadius: 8,
    marginBottom: 2,
  },
  userAvatar: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: INDIGO,
    alignItems: "center", justifyContent: "center",
  },
  userAvatarText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  userName:       { color: TEXT,  fontSize: 12, fontWeight: "700", lineHeight: 16 },
  userEmail:      { color: DIM as string, fontSize: 11, lineHeight: 14 },
  logoutRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 8,
    borderRadius: 8,
    marginBottom: 2,
  },
  logoutText:   { color: MUTED as string, fontSize: 14, fontWeight: "500" },
  privacyLink:  { color: DIM as string, fontSize: 10, paddingHorizontal: 8, paddingBottom: 4 },
})
