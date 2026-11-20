import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './AuthProvider'
import { FullScreenLoader } from '../../components/ui/FullScreenLoader'

export function ProtectedRoute() {
  const { session, loading } = useAuth()
  const location = useLocation()

  if (loading) return <FullScreenLoader />
  if (!session) {
    // Dois fluxos independentes: quem JÁ usa o Money abre o link atual do app (a raiz "/" ou /login) e cai no login;
    // quem é cliente novo entra pela página de vendas (/vendas). Sem sessão, qualquer rota protegida (inclusive "/") vai ao login.
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  return <Outlet />
}

export function AdminRoute() {
  const { isAdmin, loading } = useAuth()

  if (loading) return <FullScreenLoader />
  if (!isAdmin) return <Navigate to="/" replace />

  return <Outlet />
}

export function PublicOnlyRoute() {
  const { session, loading } = useAuth()

  if (loading) return <FullScreenLoader />
  if (session) return <Navigate to="/" replace />

  return <Outlet />
}
