import { type ReactNode } from "react"
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { useAuthStore } from "@/stores/authStore"
import AppShell from "@/components/AppShell"
import LoginPage from "@/pages/LoginPage"
import RegisterPage from "@/pages/RegisterPage"
import ForgotPasswordPage from "@/pages/ForgotPasswordPage"
import ResetPasswordPage from "@/pages/ResetPasswordPage"
import VerifyEmailPage from "@/pages/VerifyEmailPage"
import OAuthCallbackPage from "@/pages/OAuthCallbackPage"
import TwoFactorSetupPage from "@/pages/TwoFactorSetupPage"
import DashboardPage from "@/pages/DashboardPage"
import UploadPage from "@/pages/UploadPage"
import AnalysisListPage from "@/pages/AnalysisListPage"
import AnalysisDetailPage from "@/pages/AnalysisDetailPage"
import TransactionsPage from "@/pages/TransactionsPage"
import KBPage from "@/pages/KBPage"
import BudgetPage from "@/pages/BudgetPage"
import OnboardingPage from "@/pages/OnboardingPage"
import RetrainPage from "@/pages/RetrainPage"
import ManualEntryPage from "@/pages/ManualEntryPage"
import CuentasPage from "@/pages/CuentasPage"
import AyudaPage from "@/pages/AyudaPage"
import FaqPage from "@/pages/FaqPage"

function ProtectedRoute({ children }: { children: ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />
}

function PublicRoute({ children }: { children: ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  return isAuthenticated ? <Navigate to="/" replace /> : <>{children}</>
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Rutas públicas */}
        <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
        <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />
        <Route path="/forgot-password" element={<PublicRoute><ForgotPasswordPage /></PublicRoute>} />
        <Route path="/reset-password" element={<PublicRoute><ResetPasswordPage /></PublicRoute>} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/oauth-callback" element={<OAuthCallbackPage />} />

        {/* Onboarding — protegida pero fuera del AppShell (pantalla completa) */}
        <Route path="/onboarding" element={<ProtectedRoute><OnboardingPage /></ProtectedRoute>} />

        {/* Rutas protegidas — dentro del AppShell con sidebar */}
        <Route path="/" element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
          <Route index element={<DashboardPage />} />
          <Route path="upload" element={<UploadPage />} />
          <Route path="manual" element={<ManualEntryPage />} />
          <Route path="cuentas" element={<CuentasPage />} />
          <Route path="analysis" element={<AnalysisListPage />} />
          <Route path="analysis/:id" element={<AnalysisDetailPage />} />
          <Route path="analysis/:id/transactions" element={<TransactionsPage />} />
          <Route path="kb" element={<KBPage />} />
          <Route path="budget" element={<BudgetPage />} />
          <Route path="retrain" element={<RetrainPage />} />
          <Route path="ayuda" element={<AyudaPage />} />
          <Route path="faq" element={<FaqPage />} />
          <Route path="2fa-setup" element={<TwoFactorSetupPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
