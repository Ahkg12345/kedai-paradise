import { AppRouter } from '@/app/router'
import { SessionProvider } from '@/app/session-context'

export function App() {
  return (
    <SessionProvider>
      <AppRouter />
    </SessionProvider>
  )
}
