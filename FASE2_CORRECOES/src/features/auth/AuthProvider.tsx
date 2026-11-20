// PROPOSTA (M-04) — NÃO TESTADA e NÃO APLICADA. Diferenças em relação ao original:
//  * getSession()/loadProfile() em try/catch/finally: se a rede ou o Supabase falharem, o loading termina
//    (antes: loader infinito, porque setLoading(false) só rodava no caminho feliz);
//  * onAuthStateChange não faz `await` de chamada ao Supabase dentro do callback (padrão recomendado pelo
//    Supabase para evitar deadlock): o perfil é carregado fora do callback com setTimeout(0).
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import type { Profile } from '../../types/database'

interface AuthContextValue {
  session: Session | null
  user: User | null
  profile: Profile | null
  loading: boolean
  isAdmin: boolean
  refreshProfile: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  async function loadProfile(userId: string) {
    try {
      const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
      setProfile(data as Profile | null)
    } catch {
      /* mantém o perfil anterior; o app continua utilizável/recarregável */
    }
  }

  async function refreshProfile() {
    if (session?.user.id) await loadProfile(session.user.id)
  }

  useEffect(() => {
    let mounted = true

    supabase.auth
      .getSession()
      .then(async ({ data }) => {
        if (!mounted) return
        setSession(data.session)
        if (data.session?.user.id) await loadProfile(data.session.user.id)
      })
      .catch(() => {})
      .finally(() => {
        if (mounted) setLoading(false)
      })

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
      if (newSession?.user.id) {
        setTimeout(() => {
          void loadProfile(newSession.user.id).finally(() => mounted && setLoading(false))
        }, 0)
      } else {
        setProfile(null)
        setLoading(false)
      }
    })

    return () => {
      mounted = false
      subscription.subscription.unsubscribe()
    }
  }, [])

  async function signOut() {
    await supabase.auth.signOut()
    setProfile(null)
  }

  const value: AuthContextValue = {
    session,
    user: session?.user ?? null,
    profile,
    loading,
    isAdmin: profile?.role === 'admin',
    refreshProfile,
    signOut,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider')
  return ctx
}
