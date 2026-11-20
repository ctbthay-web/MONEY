import { Outlet } from 'react-router-dom'
import { Sidebar } from '../components/ui/Sidebar'
import { BottomNav } from '../components/ui/BottomNav'
import { AccessBanner } from '../components/ui/AccessBanner'
import { useAutoPush } from '../lib/useAutoPush'
import { useThemeSync } from '../lib/useThemeSync'

export function AppShell() {
  useAutoPush()
  useThemeSync()
  return (
    <div className="flex min-h-svh w-full">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-28 pt-[calc(1.25rem+env(safe-area-inset-top,0px))] sm:px-6 md:pb-10 md:pt-8">
          <AccessBanner />
          <Outlet />
        </main>
      </div>
      <BottomNav />
    </div>
  )
}
