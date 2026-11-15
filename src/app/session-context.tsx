import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import type { SessionUser } from '@/types/session'

type SessionContextValue = {
  user: SessionUser | null
  signOut: () => void
}

const referenceSessionUser: SessionUser = {
  name: 'Dewi Lestari',
  username: 'dewi',
  role: 'cashier',
}

const SessionContext = createContext<SessionContextValue | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(() =>
    import.meta.env.DEV ? referenceSessionUser : null,
  )
  const signOut = useCallback(() => setUser(null), [])
  const value = useMemo(() => ({ user, signOut }), [user, signOut])

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext)

  if (!context) {
    throw new Error('useSession must be used within SessionProvider')
  }

  return context
}
