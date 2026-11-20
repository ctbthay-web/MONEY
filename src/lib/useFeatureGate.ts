import { useNavigate } from 'react-router-dom'
import { useAuth } from '../features/auth/AuthProvider'
import { useToast } from '../components/ui/Toast'
import { canUseFeature, featureMinPlan, type FeatureKey } from './plans'

/**
 * Uso: const guard = useFeatureGate(); onClick={() => guard('pdf') && abrir()}
 * Se o plano do usuário não inclui o recurso, avisa e leva para a tela de planos.
 */
export function useFeatureGate() {
  const { profile } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()

  return (feature: FeatureKey): boolean => {
    if (canUseFeature(profile, feature)) return true
    toast.info(`Este recurso está disponível a partir do plano ${featureMinPlan(feature).name}.`)
    navigate('/subscription')
    return false
  }
}
