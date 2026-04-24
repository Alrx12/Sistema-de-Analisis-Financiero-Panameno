/**
 * AdminScreen — Panel de administración simplificado (mobile)
 * Tab 1: UserManager    — lista de usuarios con cambio de plan, suspender/reactivar
 * Tab 2: FailedJobs     — jobs fallidos con retry y descartar
 * Tab 3: Analytics      — FunnelCards + métricas de negocio
 * Tab 4: EmailComposer  — broadcast a segmentos de usuarios
 * Gate: solo accesible si user.is_admin === true
 */
import { useState } from "react"
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert, RefreshControl, TextInput,
  KeyboardAvoidingView, Platform,
} from "react-native"
import Svg, { Circle } from "react-native-svg"
import { SafeAreaView } from "react-native-safe-area-context"
import { Ionicons } from "@expo/vector-icons"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { getMe } from "@safpro/api/users"
import {
  getAdminUsers, getAdminJobs, getAdminAnalytics, sendEmailBroadcast,
  patchUserPlan, suspendUser, unsuspendUser,
  retryFailedJob, discardFailedFile,
  EMAIL_SEGMENT_LABELS,
} from "@safpro/api/admin"
import type {
  AdminUserItem, AdminFailedJob,
  AdminAnalyticsResponse, EmailSegment,
} from "@safpro/api/admin"

// ── Design tokens ─────────────────────────────────────────────────────────────
const BG     = "#070c18"
const CARD   = "#0d1426"
const BORDER = "rgba(255,255,255,0.07)"
const TEXT   = "#f1f5f9"
const MUTED  = "rgba(255,255,255,0.45)"
const DIM    = "rgba(255,255,255,0.28)"
const INDIGO = "#6366f1"
const ORANGE = "#e05c19"
const GREEN  = "#22c55e"
const RED    = "#ef4444"
const GOLD   = "#fbbf24"

const PLAN_COLORS: Record<string, string> = {
  pro:                "#a5b4fc",
  friends_and_family: "#c084fc",
  free:               "#94a3b8",
}
const PLAN_LABELS: Record<string, string> = {
  pro:                "Pro",
  friends_and_family: "F&F",
  free:               "Free",
}

// ── Gate: acceso admin ────────────────────────────────────────────────────────
function AccessGate() {
  return (
    <View style={s.gateContainer}>
      <Ionicons name="lock-closed" size={48} color={MUTED} style={{ marginBottom: 16 }} />
      <Text style={s.gateTitle}>Acceso restringido</Text>
      <Text style={s.gateSub}>Esta sección es solo para administradores.</Text>
    </View>
  )
}

// ── UserManager tab ───────────────────────────────────────────────────────────
function UserManager() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["admin-users", page],
    queryFn:  () => getAdminUsers(page, 30),
    staleTime: 30_000,
  })

  const planMut = useMutation({
    mutationFn: ({ userId, plan }: { userId: string; plan: string }) =>
      patchUserPlan(userId, plan),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-users"] }),
    onError: () => Alert.alert("Error", "No se pudo cambiar el plan."),
  })

  const suspendMut = useMutation({
    mutationFn: ({ userId, suspend }: { userId: string; suspend: boolean }) =>
      suspend ? suspendUser(userId) : unsuspendUser(userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-users"] }),
    onError: () => Alert.alert("Error", "No se pudo actualizar el estado del usuario."),
  })

  function confirmPlanChange(user: AdminUserItem) {
    const plans = ["free", "pro", "friends_and_family"]
    const options = plans
      .filter((p) => p !== user.plan)
      .map((p) => ({
        text: PLAN_LABELS[p] ?? p,
        onPress: () => planMut.mutate({ userId: user.user_id, plan: p }),
      }))
    Alert.alert(
      "Cambiar plan",
      `Usuario: ${user.email}\nPlan actual: ${PLAN_LABELS[user.plan] ?? user.plan}`,
      [...options, { text: "Cancelar", style: "cancel" as const }],
    )
  }

  function confirmSuspend(user: AdminUserItem) {
    const action = user.is_suspended ? "reactivar" : "suspender"
    Alert.alert(
      `¿${action.charAt(0).toUpperCase() + action.slice(1)} usuario?`,
      `${user.email}`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: action.charAt(0).toUpperCase() + action.slice(1),
          style: user.is_suspended ? "default" : "destructive",
          onPress: () => suspendMut.mutate({ userId: user.user_id, suspend: !user.is_suspended }),
        },
      ],
    )
  }

  if (isLoading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={INDIGO} />
      </View>
    )
  }

  const users = data?.items ?? []
  const total = data?.total ?? 0

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 14, gap: 10 }}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={INDIGO} />}
    >
      {/* Stats row */}
      <View style={s.statsRow}>
        <View style={s.statBox}>
          <Text style={s.statNum}>{total}</Text>
          <Text style={s.statLabel}>Total usuarios</Text>
        </View>
        <View style={s.statBox}>
          <Text style={[s.statNum, { color: "#a5b4fc" }]}>
            {users.filter((u) => u.plan === "pro").length}
          </Text>
          <Text style={s.statLabel}>Pro (pág. actual)</Text>
        </View>
        <View style={s.statBox}>
          <Text style={[s.statNum, { color: RED }]}>
            {users.filter((u) => u.is_suspended).length}
          </Text>
          <Text style={s.statLabel}>Suspendidos</Text>
        </View>
      </View>

      {/* User list */}
      {users.map((user) => (
        <View key={user.user_id} style={[s.userCard, user.is_suspended && s.userCardSuspended]}>
          {/* Header row */}
          <View style={s.userCardHeader}>
            <View style={s.userAvatar}>
              <Text style={s.userAvatarText}>
                {(user.full_name ?? user.email)[0].toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.userEmail} numberOfLines={1}>{user.email}</Text>
              {user.full_name && (
                <Text style={s.userName} numberOfLines={1}>{user.full_name}</Text>
              )}
            </View>
            {/* Badges */}
            <View style={{ flexDirection: "row", gap: 4 }}>
              {user.is_admin && (
                <View style={[s.badge, { backgroundColor: "rgba(251,191,36,0.15)" }]}>
                  <Ionicons name="shield-checkmark" size={10} color={GOLD} />
                </View>
              )}
              {user.is_suspended && (
                <View style={[s.badge, { backgroundColor: "rgba(239,68,68,0.15)" }]}>
                  <Ionicons name="ban" size={10} color={RED} />
                </View>
              )}
            </View>
          </View>

          {/* Info row */}
          <View style={s.userInfoRow}>
            <View style={[s.planChip, { borderColor: PLAN_COLORS[user.plan] ?? MUTED }]}>
              <Text style={[s.planChipText, { color: PLAN_COLORS[user.plan] ?? MUTED }]}>
                {PLAN_LABELS[user.plan] ?? user.plan}
              </Text>
            </View>
            <Text style={s.uploadCount}>
              <Ionicons name="cloud-upload-outline" size={11} color={DIM} /> {user.upload_count} uploads
            </Text>
            <Text style={s.joinedText}>
              {new Date(user.created_at).toLocaleDateString("es-PA", { month: "short", year: "numeric" })}
            </Text>
          </View>

          {/* Actions */}
          <View style={s.userActions}>
            <TouchableOpacity
              style={s.actionBtn}
              onPress={() => confirmPlanChange(user)}
              disabled={planMut.isPending}
              activeOpacity={0.7}
            >
              <Ionicons name="swap-horizontal-outline" size={13} color={INDIGO} />
              <Text style={[s.actionBtnText, { color: INDIGO }]}>Plan</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.actionBtn, { borderColor: user.is_suspended ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)" }]}
              onPress={() => confirmSuspend(user)}
              disabled={suspendMut.isPending}
              activeOpacity={0.7}
            >
              <Ionicons
                name={user.is_suspended ? "checkmark-circle-outline" : "ban-outline"}
                size={13}
                color={user.is_suspended ? GREEN : RED}
              />
              <Text style={[s.actionBtnText, { color: user.is_suspended ? GREEN : RED }]}>
                {user.is_suspended ? "Reactivar" : "Suspender"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}

      {/* Pagination */}
      {total > 30 && (
        <View style={s.pagination}>
          <TouchableOpacity
            style={[s.pageBtn, page === 1 && { opacity: 0.3 }]}
            onPress={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-back" size={16} color={TEXT} />
          </TouchableOpacity>
          <Text style={s.pageText}>Página {page} · {total} usuarios</Text>
          <TouchableOpacity
            style={[s.pageBtn, page * 30 >= total && { opacity: 0.3 }]}
            onPress={() => setPage((p) => p + 1)}
            disabled={page * 30 >= total}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-forward" size={16} color={TEXT} />
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  )
}

// ── FailedJobs tab ────────────────────────────────────────────────────────────
function FailedJobsTab() {
  const queryClient = useQueryClient()

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["admin-jobs"],
    queryFn:  () => getAdminJobs("error", 50),
    staleTime: 30_000,
  })

  const retryMut = useMutation({
    mutationFn: retryFailedJob,
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["admin-jobs"] })
      Alert.alert("Re-encolado", `Nuevo job: ${res.new_job_id.slice(0, 8)}…`)
    },
    onError: () => Alert.alert("Error", "No se pudo re-encolar el job."),
  })

  const discardMut = useMutation({
    mutationFn: discardFailedFile,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-jobs"] }),
    onError: () => Alert.alert("Error", "No se pudo descartar el archivo."),
  })

  function confirmRetry(job: AdminFailedJob) {
    Alert.alert(
      "Re-procesar",
      `¿Re-encolar "${job.original_filename ?? "archivo"}" de ${job.user_email}?`,
      [
        { text: "Cancelar", style: "cancel" },
        { text: "Re-procesar", onPress: () => retryMut.mutate(job.job_id) },
      ],
    )
  }

  function confirmDiscard(job: AdminFailedJob) {
    Alert.alert(
      "Descartar archivo",
      `¿Eliminar el archivo fallido de ${job.user_email}? El job queda en el historial.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Descartar",
          style: "destructive",
          onPress: () => discardMut.mutate(job.job_id),
        },
      ],
    )
  }

  if (isLoading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={INDIGO} />
      </View>
    )
  }

  const jobs = data?.jobs ?? []

  if (jobs.length === 0) {
    return (
      <View style={s.center}>
        <Ionicons name="checkmark-circle" size={48} color={GREEN} style={{ marginBottom: 12 }} />
        <Text style={s.emptyTitle}>Sin jobs fallidos</Text>
        <Text style={s.emptySub}>Todos los uploads procesaron correctamente.</Text>
      </View>
    )
  }

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 14, gap: 10 }}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={INDIGO} />}
    >
      <View style={s.statsRow}>
        <View style={s.statBox}>
          <Text style={[s.statNum, { color: RED }]}>{jobs.length}</Text>
          <Text style={s.statLabel}>Jobs fallidos</Text>
        </View>
        <View style={s.statBox}>
          <Text style={[s.statNum, { color: ORANGE }]}>
            {jobs.filter((j) => j.failed_file_exists).length}
          </Text>
          <Text style={s.statLabel}>Con archivo</Text>
        </View>
      </View>

      {jobs.map((job) => (
        <View key={job.job_id} style={s.jobCard}>
          {/* Header */}
          <View style={s.jobHeader}>
            <Ionicons name="warning" size={16} color={RED} style={{ marginTop: 1 }} />
            <View style={{ flex: 1 }}>
              <Text style={s.jobFilename} numberOfLines={1}>
                {job.original_filename ?? "archivo sin nombre"}
              </Text>
              <Text style={s.jobEmail} numberOfLines={1}>{job.user_email}</Text>
            </View>
            {job.failed_file_exists && (
              <View style={s.fileExistsBadge}>
                <Text style={s.fileExistsBadgeText}>Archivo</Text>
              </View>
            )}
          </View>

          {/* Error */}
          {job.error_message && (
            <View style={s.errorBox}>
              <Text style={s.errorText} numberOfLines={3}>{job.error_message}</Text>
            </View>
          )}

          {/* Date */}
          {job.created_at && (
            <Text style={s.jobDate}>
              {new Date(job.created_at).toLocaleDateString("es-PA", {
                day: "numeric", month: "short", year: "numeric",
                hour: "2-digit", minute: "2-digit",
              })}
            </Text>
          )}

          {/* Actions */}
          <View style={s.userActions}>
            {job.failed_file_exists && (
              <TouchableOpacity
                style={[s.actionBtn, { borderColor: "rgba(99,102,241,0.35)" }]}
                onPress={() => confirmRetry(job)}
                disabled={retryMut.isPending}
                activeOpacity={0.7}
              >
                <Ionicons name="refresh-outline" size={13} color={INDIGO} />
                <Text style={[s.actionBtnText, { color: INDIGO }]}>Re-procesar</Text>
              </TouchableOpacity>
            )}
            {job.failed_file_exists && (
              <TouchableOpacity
                style={[s.actionBtn, { borderColor: "rgba(239,68,68,0.3)" }]}
                onPress={() => confirmDiscard(job)}
                disabled={discardMut.isPending}
                activeOpacity={0.7}
              >
                <Ionicons name="trash-outline" size={13} color={RED} />
                <Text style={[s.actionBtnText, { color: RED }]}>Descartar</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      ))}
    </ScrollView>
  )
}

// ── FunnelCard (react-native-svg circular ring) ───────────────────────────────
function FunnelCard({
  label, count, total, color,
}: {
  label: string; count: number; total: number; color: string
}) {
  const SIZE   = 88
  const SW     = 8
  const radius = (SIZE - SW) / 2
  const circ   = 2 * Math.PI * radius
  const pct    = total > 0 ? Math.min(count / total, 1) : 0
  const offset = circ * (1 - pct)

  return (
    <View style={s.funnelCard}>
      <View style={{ width: SIZE, height: SIZE, alignItems: "center", justifyContent: "center" }}>
        <Svg width={SIZE} height={SIZE}>
          {/* background ring */}
          <Circle
            cx={SIZE / 2} cy={SIZE / 2} r={radius}
            stroke="rgba(255,255,255,0.07)"
            strokeWidth={SW}
            fill="none"
          />
          {/* progress arc */}
          <Circle
            cx={SIZE / 2} cy={SIZE / 2} r={radius}
            stroke={color}
            strokeWidth={SW}
            fill="none"
            strokeDasharray={circ}
            strokeDashoffset={offset}
            strokeLinecap="round"
            rotation={-90}
            origin={`${SIZE / 2},${SIZE / 2}`}
          />
        </Svg>
        {/* Center text */}
        <View style={{ position: "absolute", alignItems: "center" }}>
          <Text style={[s.funnelCount, { color }]}>{count}</Text>
          <Text style={s.funnelTotal}>/{total}</Text>
        </View>
      </View>
      <Text style={s.funnelLabel} numberOfLines={2}>{label}</Text>
      <Text style={[s.funnelPct, { color }]}>{Math.round(pct * 100)}%</Text>
    </View>
  )
}

// ── Analytics tab ─────────────────────────────────────────────────────────────
function AnalyticsTab() {
  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["admin-analytics"],
    queryFn:  getAdminAnalytics,
    staleTime: 60_000,
  })

  if (isLoading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={INDIGO} />
      </View>
    )
  }

  const o = data?.overview
  const r = data?.retention
  const q = data?.quality
  const banks = data?.top_banks ?? []

  const confPct = q ? Math.round(q.avg_confidence * 100) : 0
  const confColor = confPct >= 85 ? GREEN : confPct >= 65 ? GOLD : RED

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 14, gap: 14 }}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={INDIGO} />}
    >
      {/* ── Funnel rings ── */}
      <View style={s.sectionCard}>
        <Text style={s.sectionTitle}>Embudo de activación</Text>
        <View style={{ flexDirection: "row", justifyContent: "space-around", marginTop: 8 }}>
          <FunnelCard
            label="Emails verificados"
            count={o?.verified_users ?? 0}
            total={o?.total_users ?? 0}
            color={GREEN}
          />
          <FunnelCard
            label="Onboarding completo"
            count={o?.onboarding_completed ?? 0}
            total={o?.total_users ?? 0}
            color={INDIGO}
          />
          <FunnelCard
            label="Activados"
            count={o?.activated_users ?? 0}
            total={o?.total_users ?? 0}
            color={GOLD}
          />
        </View>
      </View>

      {/* ── Overview KPIs ── */}
      <View style={s.sectionCard}>
        <Text style={s.sectionTitle}>Resumen general</Text>
        <View style={s.kpiGrid}>
          <KpiBox label="Usuarios" value={o?.total_users ?? 0} />
          <KpiBox label="Uploads"  value={o?.total_uploads ?? 0} />
          <KpiBox label="Análisis" value={o?.total_analyses ?? 0} />
          <KpiBox label="Pro"      value={o?.users_by_plan?.["pro"] ?? 0} color="#a5b4fc" />
          <KpiBox label="F&F"      value={o?.users_by_plan?.["friends_and_family"] ?? 0} color="#c084fc" />
          <KpiBox label="Fallidos" value={o?.failed_jobs ?? 0} color={o?.failed_jobs ? RED : GREEN} />
        </View>
      </View>

      {/* ── Retention ── */}
      {r && (
        <View style={s.sectionCard}>
          <Text style={s.sectionTitle}>Retención</Text>
          <View style={s.kpiGrid}>
            <KpiBox label="1 análisis"   value={r.users_with_1_analysis} />
            <KpiBox label="2+ análisis"  value={r.users_with_2plus_analyses} color={GREEN} />
            <KpiBox label="Retención %"  value={`${Math.round(r.retention_rate)}%`} color={GREEN} />
            <KpiBox label="Avg análisis" value={r.avg_analyses_per_user.toFixed(1)} />
            <KpiBox label="Avg uploads"  value={r.avg_uploads_per_user.toFixed(1)} />
          </View>
        </View>
      )}

      {/* ── Quality ── */}
      {q && (
        <View style={s.sectionCard}>
          <Text style={s.sectionTitle}>Calidad de análisis</Text>
          <View style={s.kpiGrid}>
            <KpiBox label="Confianza avg" value={`${confPct}%`} color={confColor} />
            <KpiBox label="Transacciones" value={q.total_transactions} />
            <KpiBox label="Baja conf."    value={q.low_confidence_count} color={q.low_confidence_count > 0 ? RED : GREEN} />
            <KpiBox label="Ratio baja conf." value={`${Math.round(q.low_confidence_ratio)}%`} color={q.low_confidence_ratio > 20 ? RED : GREEN} />
          </View>

          {/* Confidence bar */}
          <View style={{ marginTop: 12 }}>
            <View style={s.confBarOuter}>
              <View style={[s.confBarFill, { width: `${confPct}%` as any, backgroundColor: confColor }]} />
            </View>
            <Text style={[s.confHint, { color: confColor }]}>
              {confPct >= 85 ? "Excelente calidad de categorización"
               : confPct >= 65 ? "Calidad aceptable — considera entrenar más"
               : "Calidad baja — entrena el KB"}
            </Text>
          </View>
        </View>
      )}

      {/* ── Top banks ── */}
      {banks.length > 0 && (
        <View style={s.sectionCard}>
          <Text style={s.sectionTitle}>Bancos más usados</Text>
          {banks.slice(0, 5).map((b, i) => {
            const maxCount = banks[0]?.count ?? 1
            const pct = b.count / maxCount
            return (
              <View key={b.bank} style={{ marginTop: i === 0 ? 8 : 6 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 3 }}>
                  <Text style={s.bankLabel}>{b.bank}</Text>
                  <Text style={s.bankCount}>{b.count} uploads</Text>
                </View>
                <View style={s.confBarOuter}>
                  <View style={[s.confBarFill, { width: `${Math.round(pct * 100)}%` as any, backgroundColor: INDIGO }]} />
                </View>
              </View>
            )
          })}
        </View>
      )}
    </ScrollView>
  )
}

// Small KPI box helper
function KpiBox({ label, value, color }: { label: string; value: number | string; color?: string }) {
  return (
    <View style={s.kpiBox}>
      <Text style={[s.kpiValue, color ? { color } : {}]}>{value}</Text>
      <Text style={s.kpiLabel}>{label}</Text>
    </View>
  )
}

// ── EmailComposer tab ─────────────────────────────────────────────────────────
const EMAIL_SEGMENTS: EmailSegment[] = [
  "all", "unverified", "no_onboarding", "active",
  "free", "pro", "friends_and_family", "specific",
]

function EmailComposerTab() {
  const [segment, setSegment] = useState<EmailSegment>("all")
  const [specificEmail, setSpecificEmail] = useState("")
  const [subject, setSubject] = useState("")
  const [body, setBody] = useState("")

  const sendMut = useMutation({
    mutationFn: () => sendEmailBroadcast({
      subject,
      body_html: body,
      segment,
      specific_email: segment === "specific" ? specificEmail : undefined,
    }),
    onSuccess: (res) => {
      Alert.alert(
        "✅ Email enviado",
        `Enviados: ${res.sent}\nFallidos: ${res.failed}\nSegmento: ${res.segment}`,
        [{ text: "OK", onPress: () => { setSubject(""); setBody("") } }],
      )
    },
    onError: () => Alert.alert("Error", "No se pudo enviar el broadcast."),
  })

  function handleSend() {
    if (!subject.trim()) { Alert.alert("Requerido", "Ingresa el asunto del email."); return }
    if (!body.trim())    { Alert.alert("Requerido", "Ingresa el cuerpo del email."); return }
    if (segment === "specific" && !specificEmail.trim()) {
      Alert.alert("Requerido", "Ingresa el email específico."); return
    }
    Alert.alert(
      "Confirmar envío",
      `Segmento: ${EMAIL_SEGMENT_LABELS[segment]}\nAsunto: ${subject}`,
      [
        { text: "Cancelar", style: "cancel" },
        { text: "Enviar", onPress: () => sendMut.mutate() },
      ],
    )
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={120}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 14, gap: 14 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Segment picker ── */}
        <View style={s.sectionCard}>
          <Text style={s.sectionTitle}>Segmento de destinatarios</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingTop: 10 }}
          >
            {EMAIL_SEGMENTS.map((seg) => (
              <TouchableOpacity
                key={seg}
                style={[s.segPill, segment === seg && s.segPillActive]}
                onPress={() => setSegment(seg)}
                activeOpacity={0.7}
              >
                <Text style={[s.segPillText, segment === seg && s.segPillTextActive]}>
                  {EMAIL_SEGMENT_LABELS[seg]}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Specific email field */}
          {segment === "specific" && (
            <TextInput
              style={[s.emailInput, { marginTop: 10 }]}
              placeholder="email@destino.com"
              placeholderTextColor={MUTED}
              keyboardType="email-address"
              autoCapitalize="none"
              value={specificEmail}
              onChangeText={setSpecificEmail}
            />
          )}
        </View>

        {/* ── Subject ── */}
        <View style={s.sectionCard}>
          <Text style={s.sectionTitle}>Asunto</Text>
          <TextInput
            style={[s.emailInput, { marginTop: 8 }]}
            placeholder="Asunto del email…"
            placeholderTextColor={MUTED}
            value={subject}
            onChangeText={setSubject}
            returnKeyType="next"
          />
        </View>

        {/* ── Body ── */}
        <View style={s.sectionCard}>
          <Text style={s.sectionTitle}>Cuerpo (HTML)</Text>
          <TextInput
            style={[s.emailInput, s.emailBody]}
            placeholder={"<p>Hola {{nombre}},</p>\n<p>Mensaje aquí…</p>"}
            placeholderTextColor={MUTED}
            value={body}
            onChangeText={setBody}
            multiline
            textAlignVertical="top"
          />
        </View>

        {/* ── Send button ── */}
        <TouchableOpacity
          style={[s.sendBtn, sendMut.isPending && { opacity: 0.6 }]}
          onPress={handleSend}
          disabled={sendMut.isPending}
          activeOpacity={0.8}
        >
          {sendMut.isPending
            ? <ActivityIndicator color="#fff" />
            : (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Ionicons name="mail-outline" size={18} color="#fff" />
                <Text style={s.sendBtnText}>Enviar broadcast</Text>
              </View>
            )
          }
        </TouchableOpacity>

        {/* Info banner */}
        <View style={s.infoBanner}>
          <Ionicons name="information-circle-outline" size={15} color={MUTED} />
          <Text style={s.infoBannerText}>
            El cuerpo se envía como HTML. Usa {"{{nombre}}"} para el nombre del usuario (si el template lo soporta).
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

// ── Tab definitions ───────────────────────────────────────────────────────────
type TabKey = "users" | "jobs" | "analytics" | "email"

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: "users",     label: "Usuarios",  icon: "people-outline"     },
  { key: "jobs",      label: "Jobs",      icon: "warning-outline"    },
  { key: "analytics", label: "Analytics", icon: "bar-chart-outline"  },
  { key: "email",     label: "Email",     icon: "mail-outline"       },
]

// ── Main screen ───────────────────────────────────────────────────────────────
export default function AdminScreen() {
  const [activeTab, setActiveTab] = useState<TabKey>("users")

  const { data: user, isLoading } = useQuery({
    queryKey: ["me"],
    queryFn:  getMe,
    staleTime: 60_000,
  })

  if (isLoading) {
    return (
      <SafeAreaView style={s.safe} edges={["bottom"]}>
        <View style={s.center}>
          <ActivityIndicator color={INDIGO} />
        </View>
      </SafeAreaView>
    )
  }

  if (!user?.is_admin) {
    return (
      <SafeAreaView style={s.safe} edges={["bottom"]}>
        <AccessGate />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={s.safe} edges={["bottom"]}>
      {/* Header */}
      <View style={s.header}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Ionicons name="shield-checkmark" size={20} color={GOLD} />
          <Text style={s.title}>Panel Admin</Text>
        </View>
        <Text style={s.subtitle}>Gestión de usuarios y sistema</Text>
      </View>

      {/* Tabs — scrollable row */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.tabScrollView}
        contentContainerStyle={s.tabRow}
      >
        {TABS.map(({ key, label, icon }) => (
          <TouchableOpacity
            key={key}
            style={[s.tab, activeTab === key && s.tabActive]}
            onPress={() => setActiveTab(key)}
            activeOpacity={0.7}
          >
            <Ionicons
              name={icon as any}
              size={15}
              color={activeTab === key ? "#a5b4fc" : MUTED}
            />
            <Text style={[s.tabText, activeTab === key && s.tabTextActive]}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Content */}
      <View style={{ flex: 1 }}>
        {activeTab === "users"     && <UserManager />}
        {activeTab === "jobs"      && <FailedJobsTab />}
        {activeTab === "analytics" && <AnalyticsTab />}
        {activeTab === "email"     && <EmailComposerTab />}
      </View>
    </SafeAreaView>
  )
}

// ── Estilos ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: BG },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },

  // Header
  header: {
    backgroundColor: CARD,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  title:    { fontSize: 20, fontWeight: "700", color: TEXT },
  subtitle: { color: MUTED, marginTop: 3, fontSize: 13 },

  // Gate
  gateContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
    backgroundColor: BG,
  },
  gateTitle: { fontSize: 18, fontWeight: "700", color: TEXT, marginBottom: 6 },
  gateSub:   { color: MUTED, fontSize: 14, textAlign: "center" },

  // Tabs
  tabScrollView: {
    backgroundColor: CARD,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    flexGrow: 0,
  },
  tabRow: {
    flexDirection: "row",
    paddingHorizontal: 4,
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabActive:     { borderBottomColor: INDIGO },
  tabText:       { color: MUTED, fontSize: 13, fontWeight: "600" },
  tabTextActive: { color: "#a5b4fc" },

  // Stats row
  statsRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 2,
  },
  statBox: {
    flex: 1,
    backgroundColor: CARD,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: "center",
  },
  statNum:   { fontSize: 22, fontWeight: "700", color: TEXT },
  statLabel: { fontSize: 10, color: MUTED, marginTop: 2, textAlign: "center" },

  // User cards
  userCard: {
    backgroundColor: CARD,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: BORDER,
  },
  userCardSuspended: {
    borderColor: "rgba(239,68,68,0.2)",
    backgroundColor: "rgba(239,68,68,0.04)",
  },
  userCardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 10,
  },
  userAvatar: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: INDIGO,
    alignItems: "center", justifyContent: "center",
    flexShrink: 0,
  },
  userAvatarText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  userEmail:      { color: TEXT, fontSize: 13, fontWeight: "600", lineHeight: 18 },
  userName:       { color: MUTED, fontSize: 11, lineHeight: 16 },

  badge: {
    width: 20, height: 20, borderRadius: 10,
    alignItems: "center", justifyContent: "center",
  },

  userInfoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  planChip: {
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  planChipText:  { fontSize: 11, fontWeight: "700" },
  uploadCount:   { color: DIM, fontSize: 11 },
  joinedText:    { color: DIM, fontSize: 11, marginLeft: "auto" as any },

  userActions: {
    flexDirection: "row",
    gap: 8,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(99,102,241,0.35)",
  },
  actionBtnText: { fontSize: 12, fontWeight: "600" },

  // Pagination
  pagination: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
  },
  pageBtn:  { padding: 8 },
  pageText: { color: MUTED, fontSize: 13 },

  // Job cards
  jobCard: {
    backgroundColor: CARD,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.2)",
  },
  jobHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 8,
  },
  jobFilename: { color: TEXT, fontSize: 13, fontWeight: "600", lineHeight: 18 },
  jobEmail:    { color: MUTED, fontSize: 11, lineHeight: 16 },
  fileExistsBadge: {
    backgroundColor: "rgba(34,197,94,0.15)",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  fileExistsBadgeText: { color: GREEN, fontSize: 10, fontWeight: "700" },
  errorBox: {
    backgroundColor: "rgba(239,68,68,0.08)",
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
  },
  errorText: { color: "#fca5a5", fontSize: 12, lineHeight: 17, fontFamily: "monospace" },
  jobDate:   { color: DIM, fontSize: 11, marginBottom: 10 },

  // Empty state
  emptyTitle: { fontSize: 16, fontWeight: "700", color: TEXT, marginBottom: 6 },
  emptySub:   { color: MUTED, fontSize: 14, textAlign: "center" },

  // FunnelCard
  funnelCard: {
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  funnelCount: { fontSize: 18, fontWeight: "700" },
  funnelTotal: { fontSize: 11, color: MUTED },
  funnelLabel: { fontSize: 11, color: MUTED, textAlign: "center", lineHeight: 15 },
  funnelPct:   { fontSize: 13, fontWeight: "700" },

  // Section card (Analytics + Email)
  sectionCard: {
    backgroundColor: CARD,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: BORDER,
  },
  sectionTitle: { fontSize: 13, fontWeight: "700", color: TEXT, textTransform: "uppercase", letterSpacing: 0.5 },

  // KPI grid
  kpiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
  },
  kpiBox: {
    backgroundColor: BG,
    borderRadius: 8,
    padding: 10,
    alignItems: "center",
    minWidth: 80,
    flex: 1,
  },
  kpiValue: { fontSize: 18, fontWeight: "700", color: TEXT },
  kpiLabel: { fontSize: 10, color: MUTED, marginTop: 2, textAlign: "center" },

  // Confidence bar
  confBarOuter: {
    height: 6,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 3,
    overflow: "hidden",
  },
  confBarFill: {
    height: 6,
    borderRadius: 3,
  },
  confHint: {
    fontSize: 11,
    marginTop: 4,
  },

  // Banks
  bankLabel: { color: TEXT, fontSize: 12, fontWeight: "600" },
  bankCount: { color: MUTED, fontSize: 11 },

  // Email composer
  segPill: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: BG,
  },
  segPillActive: {
    borderColor: INDIGO,
    backgroundColor: "rgba(99,102,241,0.15)",
  },
  segPillText:       { color: MUTED, fontSize: 12, fontWeight: "600" },
  segPillTextActive: { color: "#a5b4fc" },

  emailInput: {
    backgroundColor: BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    color: TEXT,
    fontSize: 14,
  },
  emailBody: {
    marginTop: 8,
    minHeight: 180,
    lineHeight: 20,
  },

  sendBtn: {
    backgroundColor: INDIGO,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },

  infoBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: 10,
    padding: 12,
  },
  infoBannerText: { color: MUTED, fontSize: 12, flex: 1, lineHeight: 17 },
})
