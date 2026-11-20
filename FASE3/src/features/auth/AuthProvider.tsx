import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import type { Profile } from '../../types/database'

interface AuthContextValue {
  session: Session | null
  user: User | null
  profile: Profile | null
  loading: boolean
  /** estado do carregamento do perfil (evita carregamento infinito quando a rede/servidor falha) */
  profileStatus: 'idle' | 'loading' | 'ready' | 'error'
  retryProfile: () => Promise<void>
  isAdmin: boolean
  refreshProfile: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  const [profileStatus, setProfileStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')

  const withTimeout = <T,>(p: PromiseLike<T>, ms: number) =>
    Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))])

  /**
   * Carrega o perfil com limite de tempo e 2 tentativas. Nunca deixa a tela presa: termina em 'ready' ou 'error'
   * (a tela de acesso mostra "Tentar novamente"). Se já havia perfil (atualização em segundo plano), uma falha
   * não derruba a sessão: mantém o perfil atual.
   */
  async function loadProfile(userId: string) {
    setProfileStatus((s) => (s === 'ready' ? s : 'loading'))
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const { data, error } = await withTimeout(supabase.from('profiles').select('*').eq('id', userId).maybeSingle(), 8000)
        if (!error && data) {
          setProfile(data as Profile)
          setProfileStatus('ready')
          return
        }
      } catch {
        /* tenta de novo / cai no erro abaixo */
      }
    }
    setProfileStatus((s) => (s === 'ready' ? s : 'error'))
  }

  async function refreshProfile() {
    if (session?.user.id) await loadProfile(session.user.id)
  }

  async function retryProfile() {
    if (session?.user.id) {
      setProfileStatus('loading')
      await loadProfile(session.user.id)
    }
  }

  useEffect(() => {
    let mounted = true

    // a tela só espera a SESSÃO (local); o perfil carrega em seguida com estado próprio (profileStatus)
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!mounted) return
        setSession(data.session)
        if (data.session?.user.id) void loadProfile(data.session.user.id)
      })
      .catch(() => {})
      .finally(() => {
        if (mounted) setLoading(false)
      })

    // sem await de chamadas ao Supabase dentro do callback (recomendação do Supabase: evita travar o cliente)
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
      if (newSession?.user.id) {
        setTimeout(() => void loadProfile(newSession.user.id), 0)
      } else {
        setProfile(null)
        setProfileStatus('idle')
      }
      setLoading(false)
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
    profileStatus,
    retryProfile,
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
