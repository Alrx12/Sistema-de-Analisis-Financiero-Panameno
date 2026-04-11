import { type ReactNode, lazy, Suspense } from "react"
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { useAuthStore } from "@/stores/authStore"
import AppShell from "@/components/AppShell"

// ─── Lazy imports — cada página genera su propio chunk ────────────────────────
// Auth / públicas (raramente se necesitan si ya estás logueado)
const LoginPage           = lazy(() => import("@/pages/LoginPage"))
const RegisterPage        = lazy(() => import("@/pages/RegisterPage"))
const ForgotPasswordPage  = lazy(() => import("@/pages/ForgotPasswordPage"))
const ResetPasswordPage   = lazy(() => import("@/pages/ResetPasswordPage"))
const VerifyEmailPage     = lazy(() => import("@/pages/VerifyEmailPage"))
const OAuthCallbackPage   = lazy(() => import("@/pages/OAuthCallbackPage"))
const PrivacyPolicyPage   = lazy(() => import("@/pages/PrivacyPolicyPage"))
const TermsPage           = lazy(() => import("@/pages/TermsPage"))
const FaqPage             = lazy(() => import("@/pages/FaqPage"))
const ContactPage         = lazy(() => import("@/pages/ContactPage"))

// Onboarding / billing — pantalla completa, fuera del AppShell
const OnboardingPage      = lazy(() => import("@/pages/OnboardingPage"))
const UpgradePage         = lazy(() => import("@/pages/UpgradePage"))
const PaymentSuccessPage  = lazy(() => import("@/pages/PaymentSuccessPage"))

// Rutas dentro del AppShell
const DashboardPage       = lazy(() => import("@/pages/DashboardPage"))
const UploadPage          = lazy(() => import("@/pages/UploadPage"))
const ManualEntryPage     = lazy(() => import("@/pages/ManualEntryPage"))
const CuentasPage         = lazy(() => import("@/pages/CuentasPage"))
const AnalysisListPage    = lazy(() => import("@/pages/AnalysisListPage"))
const AnalysisDetailPage  = lazy(() => import("@/pages/AnalysisDetailPage"))
const TransactionsPage    = lazy(() => import("@/pages/TransactionsPage"))
const KBPage              = lazy(() => import("@/pages/KBPage"))
const BudgetPage          = lazy(() => import("@/pages/BudgetPage"))
const RetrainPage         = lazy(() => import("@/pages/RetrainPage"))
const SimulacionesPage    = lazy(() => import("@/pages/SimulacionesPage"))
const AyudaPage           = lazy(() => import("@/pages/AyudaPage"))
const AccountPage         = lazy(() => import("@/pages/AccountPage"))
const AdminDashboardPage  = lazy(() => import("@/pages/AdminDashboardPage"))
const TwoFactorSetupPage  = lazy(() => import("@/pages/TwoFactorSetupPage"))

// ─── Fallback de carga ────────────────────────────────────────────────────────
function PageLoader() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        background: "#0f1117",
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: "50%",
          border: "3px solid rgba(255,255,255,0.1)",
          borderTopColor: "#e05c19",
          animation: "spin 0.7s linear infinite",
        }}
      />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

// ─── Guards ───────────────────────────────────────────────────────────────────
function ProtectedRoute({ children }: { children: ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />
}

function PublicRoute({ children }: { children: ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  return isAuthenticated ? <Navigate to="/" replace /> : <>{children}</>
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* Rutas públicas */}
          <Route path="/login"           element={<PublicRoute><LoginPage /></PublicRoute>} />
          <Route path="/register"        element={<PublicRoute><RegisterPage /></PublicRoute>} />
          <Route path="/forgot-password" element={<PublicRoute><ForgotPasswordPage /></PublicRoute>} />
          <Route path="/reset-password"  element={<PublicRoute><ResetPasswordPage /></PublicRoute>} />
          <Route path="/verify-email"    element={<VerifyEmailPage />} />
          <Route path="/oauth-callback"  element={<OAuthCallbackPage />} />
          <Route path="/privacy"         element={<PrivacyPolicyPage />} />
          <Route path="/terms"           element={<TermsPage />} />
          <Route path="/faq"             element={<FaqPage />} />
          <Route path="/contacto"        element={<ContactPage />} />

          {/* Onboarding — protegida, pantalla completa */}
          <Route path="/onboarding"      element={<ProtectedRoute><OnboardingPage /></ProtectedRoute>} />

          {/* Upgrade / Billing — protegidas, pantalla completa */}
          <Route path="/upgrade"         element={<ProtectedRoute><UpgradePage /></ProtectedRoute>} />
          <Route path="/upgrade/success" element={<ProtectedRoute><PaymentSuccessPage /></ProtectedRoute>} />

          {/* Rutas protegidas — dentro del AppShell con sidebar */}
          <Route path="/" element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
            <Route index                              element={<DashboardPage />} />
            <Route path="upload"                     element={<UploadPage />} />
            <Route path="manual"                     element={<ManualEntryPage />} />
            <Route path="cuentas"                    element={<CuentasPage />} />
            <Route path="analysis"                   element={<AnalysisListPage />} />
            <Route path="analysis/:id"               element={<AnalysisDetailPage />} />
            <Route path="analysis/:id/transactions"  element={<TransactionsPage />} />
            <Route path="kb"                         element={<KBPage />} />
            <Route path="budget"                     element={<BudgetPage />} />
            <Route path="retrain"                    element={<RetrainPage />} />
            <Route path="simulaciones"               element={<SimulacionesPage />} />
            <Route path="ayuda"                      element={<AyudaPage />} />
            <Route path="cuenta"                     element={<AccountPage />} />
            <Route path="admin"                      element={<AdminDashboardPage />} />
            <Route path="2fa-setup"                  element={<TwoFactorSetupPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
