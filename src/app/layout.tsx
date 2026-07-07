import type { Metadata } from 'next'
import Link from 'next/link'
import './globals.css'
import {
  LayoutDashboard, ArrowLeftRight, Building2, Users,
  FileText, Bell, PlusCircle, Settings, Home, ArrowRightLeft,
  PieChart, Wrench, BarChart3, ShieldCheck, TrendingUp, Wallet, LogOut,
} from 'lucide-react'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export const metadata: Metadata = {
  title: 'JJ Property 10',
  description: 'Real Estate Management System',
}

const NAV = [
  { href: '/master',           label: 'מסך ראשי',     icon: BarChart3 },
  { href: '/',                 label: 'CEO Dashboard', icon: LayoutDashboard },
  { href: '/transactions',     label: 'Transactions',  icon: ArrowLeftRight },
  { href: '/transactions/new', label: 'New Entry',     icon: PlusCircle },
  { href: '/properties',       label: 'Properties',    icon: Building2 },
  { href: '/airbnb',           label: 'Airbnb',        icon: Home },
  { href: '/management',       label: 'Management',    icon: Wrench },
  { href: '/contracts',        label: 'Contracts',     icon: FileText },
  { href: '/ownership',        label: 'Ownership',     icon: PieChart },
  { href: '/settlement',       label: 'Settlement',    icon: ArrowRightLeft },
  { href: '/client-report',  label: 'Owner Settlement',  icon: FileText },
  { href: '/open-balances',    label: 'Open Balances', icon: Wallet },
  { href: '/investor',         label: 'Investors',     icon: TrendingUp },
  { href: '/contacts',         label: 'Contacts',      icon: Users },
  { href: '/alerts',           label: 'Alerts',        icon: Bell },
  { href: '/validation',       label: 'Validation',    icon: ShieldCheck },
  { href: "/admin/entity-mapping",       label: 'Entity Mapping',    icon: ShieldCheck },
  { href: '/settings',         label: 'Settings',      icon: Settings },
]

async function getUser() {
  try {
    const cookieStore = cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll() {},
        },
      }
    )
    const { data: { user } } = await supabase.auth.getUser()
    return user
  } catch {
    return null
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser()

  return (
    <html lang="en">
      <body>
        <div className="flex min-h-screen">
          <aside className="w-56 bg-brand-900 text-white flex flex-col fixed h-full z-10">
            <div className="px-5 py-6 border-b border-brand-700">
              <div className="text-xl font-bold tracking-tight">JJ Property 10</div>
              <div className="text-xs text-brand-100 mt-0.5 opacity-70">Management System</div>
            </div>

            <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
              {NAV.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-brand-100 hover:bg-brand-700 hover:text-white transition-colors group"
                >
                  <Icon size={17} className="opacity-70 group-hover:opacity-100" />
                  {label}
                </Link>
              ))}
            </nav>

            <div className="px-4 py-4 border-t border-brand-700">
              {user ? (
                <>
                  <div className="text-xs text-brand-200 opacity-60">Logged in as</div>
                  <div className="text-sm font-semibold text-white mt-0.5 truncate">
                    {user.email?.split('@')[0] ?? 'User'}
                  </div>
                  <form action="/api/auth/logout" method="POST" className="mt-2">
                    <button
                      type="submit"
                      className="flex items-center gap-2 text-xs text-brand-300 hover:text-white transition-colors"
                    >
                      <LogOut size={13} />
                      Sign out
                    </button>
                  </form>
                </>
              ) : (
                <Link href="/login" className="text-xs text-brand-300 hover:text-white">
                  Sign in
                </Link>
              )}
            </div>
          </aside>

          <main className="ml-56 flex-1 min-h-screen">
            {children}
          </main>
        </div>
      </body>
    </html>
  )
}
