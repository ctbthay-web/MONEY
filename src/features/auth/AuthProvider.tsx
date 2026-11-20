import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import { clearSessionPolicy, isIdleExpired, isRemembered, markActive, setLogoutReason } from '../../lib/sessionPolicy'
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
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
    setProfile(data as Profile | null)
  }

  async function refreshProfile() {
    if (session?.user.id) await loadProfile(session.user.id)
  }

  useEffect(() => {
    let mounted = true

    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return
      // "Manter conectado" desmarcado e muito tempo sem usar: encerra antes de mostrar qualquer dado
      if (data.session && isIdleExpired()) {
        setLogoutReason('idle')
        clearSessionPolicy()
        await supabase.auth.signOut({ scope: 'local' })
        if (!mounted) return
        setSession(null)
        setLoading(false)
        return
      }
      setSession(data.session)
      if (data.session?.user.id) await loadProfile(data.session.user.id)
      setLoading(false)
    })

    const { data: subscription } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setSession(newSession)
      if (newSession?.user.id) {
        await loadProfile(newSession.user.id)
      } else {
        setProfile(null)
      }
      setLoading(false)
    })

    return () => {
      mounted = false
      subscription.subscription.unsubscribe()
    }
  }, [])

  // enquanto o app está aberto: conta o uso e encerra por inatividade (só para quem não marcou "Manter conectado")
  const userId = session?.user.id
  useEffect(() => {
    if (!userId || isRemembered()) return
    let done = false
    const expire = async () => {
      if (done) return
      done = true
      setLogoutReason('idle')
      clearSessionPolicy()
      await supabase.auth.signOut({ scope: 'local' })
    }
    const onActivity = () => markActive()
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      if (isIdleExpired()) void expire()
      else markActive(true)
    }
    const events = ['pointerdown', 'keydown', 'scroll', 'touchstart'] as const
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }))
    document.addEventListener('visibilitychange', onVisible)
    const id = setInterval(() => {
      if (isIdleExpired()) void expire()
    }, 60_000)
    return () => {
      events.forEach((e) => window.removeEventListener(e, onActivity))
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(id)
    }
  }, [userId])

  async function signOut() {
    clearSessionPolicy()
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
