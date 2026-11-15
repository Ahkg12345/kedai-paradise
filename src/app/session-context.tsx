import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase/client'
import { id } from '@/lib/i18n/id'
import type { SessionUser, UserRole } from '@/types/session'

type LoginResponse = {
  ok: boolean
  message?: string
  retryAfterSeconds?: number
  user?: SessionUser
  session?: {
    access_token: string
    refresh_token: string
  }
}

type LoginResult =
  | { ok: true; user: SessionUser }
  | { ok: false; message: string; retryAfterSeconds?: number }

type SessionContextValue = {
  user: SessionUser | null
  isLoading: boolean
  signIn: (username: string, password: string) => Promise<LoginResult>
  signOut: () => Promise<void>
}

const idleTimeoutMs = 30 * 60 * 1_000
const SessionContext = createContext<SessionContextValue | null>(null)

function sessionUserFromAuthUser(authUser: User): SessionUser | null {
  const metadata = authUser.app_metadata
  const role = metadata.role
  const username = metadata.username
  const name = metadata.name

  if (
    (role !== 'admin' && role !== 'cashier') ||
    typeof username !== 'string' ||
    typeof name !== 'string'
  ) {
    return null
  }

  return { name, username, role: role as UserRole }
}

async function readHttpError(error: unknown): Promise<LoginResponse | null> {
  if (typeof error !== 'object' || error === null || !('context' in error)) return null
  const context = (error as { context?: unknown }).context
  if (!(context instanceof Response)) return null

  try {
    return await context.clone().json() as LoginResponse
  } catch {
    return null
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return
      setUser(session ? sessionUserFromAuthUser(session.user) : null)
      setIsLoading(false)
    })

    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setUser(data.session ? sessionUserFromAuthUser(data.session.user) : null)
      setIsLoading(false)
    }).catch(() => {
      if (!mounted) return
      setUser(null)
      setIsLoading(false)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  const signIn = useCallback(async (username: string, password: string): Promise<LoginResult> => {
    try {
      const { data, error } = await supabase.functions.invoke<LoginResponse>('auth-login', {
        body: { username, password },
      })
      const response = error ? await readHttpError(error) : data

      if (!response?.ok || !response.user || !response.session) {
        return {
          ok: false,
          message: response?.message ?? id.errors.generic,
          retryAfterSeconds: response?.retryAfterSeconds,
        }
      }

      const { error: sessionError } = await supabase.auth.setSession(response.session)
      if (sessionError) return { ok: false, message: id.errors.generic }

      setUser(response.user)
      return { ok: true, user: response.user }
    } catch {
      return { ok: false, message: id.errors.generic }
    }
  }, [])

  const signOut = useCallback(async () => {
    try {
      await supabase.auth.signOut({ scope: 'local' })
    } catch {
      // The browser session must still expire when the network is unavailable.
    }
    setUser(null)
  }, [])

  useEffect(() => {
    if (!user) return

    let idleTimer = 0
    let lastResetAt = Date.now()
    const resetTimer = () => {
      window.clearTimeout(idleTimer)
      idleTimer = window.setTimeout(() => void signOut(), idleTimeoutMs)
    }
    const handleActivity = () => {
      const now = Date.now()
      if (now - lastResetAt < 1_000) return
      lastResetAt = now
      resetTimer()
    }
    const activityEvents = ['pointerdown', 'keydown', 'mousemove', 'touchstart', 'wheel'] as const

    resetTimer()
    activityEvents.forEach((eventName) => window.addEventListener(eventName, handleActivity, { passive: true }))

    return () => {
      window.clearTimeout(idleTimer)
      activityEvents.forEach((eventName) => window.removeEventListener(eventName, handleActivity))
    }
  }, [user, signOut])

  const value = useMemo(() => ({ user, isLoading, signIn, signOut }), [user, isLoading, signIn, signOut])

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext)

  if (!context) {
    throw new Error('useSession must be used within SessionProvider')
  }

  return context
}
