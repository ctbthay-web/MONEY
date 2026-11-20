import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './lib/queryClient'
import { ToastProvider } from './components/ui/Toast'
import { AuthProvider } from './features/auth/AuthProvider'
import { ProtectedRoute, AdminRoute, PublicOnlyRoute } from './features/auth/ProtectedRoute'
import { AppShell } from './app/AppShell'
import { AccessGate } from './features/auth/AccessGate'

import { LoginPage } from './pages/Login'
import { RegisterPage } from './pages/Register'
import { ForgotPasswordPage } from './pages/ForgotPassword'
import { ResetPasswordPage } from './pages/ResetPassword'
import { DashboardPage } from './pages/Dashboard'
import { TransactionsPage } from './pages/Transactions'
import { CategoriesPage } from './pages/Categories'
import { AccountsPage } from './pages/Accounts'
import { ReservesPage } from './pages/Reserves'
import { LoansPage } from './pages/Loans'
import { ReportsPage } from './pages/Reports'
import { PlanningPage } from './pages/Planning'
import { AssistantPage } from './pages/Assistant'
import { ProfilePage } from './pages/Profile'
import { SubscriptionPage } from './pages/Subscription'
import { AdminPage } from './pages/admin/AdminPage'
import { NotFoundPage } from './pages/NotFound'
import { PrivacyPage, TermsPage } from './pages/Legal'
import { LandingPage } from './pages/Landing'
import { PlansPage } from './pages/Plans'
import { ThankYouPage } from './pages/ThankYou'

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <div className="app-aurora" aria-hidden="true" />
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              <Route element={<PublicOnlyRoute />}>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/register" element={<RegisterPage />} />
                <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              </Route>
              {/* Cada página tem endereço próprio: /vendas (apresentação), /planos, /login (acesso) e o checkout da Kiwify (externo) */}
              <Route path="/vendas" element={<LandingPage />} />
              <Route path="/planos" element={<PlansPage />} />
              <Route path="/obrigado" element={<ThankYouPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route path="/termos" element={<TermsPage />} />
              <Route path="/privacidade" element={<PrivacyPage />} />

              <Route element={<ProtectedRoute />}>
                <Route element={<AccessGate />}>
                <Route element={<AppShell />}>
                  <Route path="/" element={<DashboardPage />} />
                  <Route path="/transactions" element={<TransactionsPage />} />
                  <Route path="/categories" element={<CategoriesPage />} />
                  <Route path="/accounts" element={<AccountsPage />} />
                  <Route path="/reserves" element={<ReservesPage />} />
                  <Route path="/loans" element={<LoansPage />} />
                  <Route path="/reports" element={<ReportsPage />} />
                  <Route path="/planning" element={<PlanningPage />} />
                  <Route path="/assistant" element={<AssistantPage />} />
                  <Route path="/profile" element={<ProfilePage />} />
                  <Route path="/subscription" element={<SubscriptionPage />} />
                  <Route element={<AdminRoute />}>
                    <Route path="/admin" element={<AdminPage />} />
                  </Route>
                </Route>
                </Route>
              </Route>

              <Route path="/404" element={<NotFoundPage />} />
              <Route path="*" element={<Navigate to="/404" replace />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  )
}
