'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase'
import { Eye, EyeOff, Lock, Mail, AlertCircle } from 'lucide-react'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = searchParams.get('next') || '/'

  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [attempts, setAttempts] = useState(0)
  const [resetSent, setResetSent] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    if (attempts >= 5) {
      setError('Too many failed attempts. Please wait a few minutes.')
      return
    }
    setLoading(true)
    setError('')
    const supabase = createSupabaseBrowserClient()
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
    if (authError) {
      setAttempts(a => a + 1)
      setError(attempts >= 4
        ? 'Account temporarily locked after 5 failed attempts. Try again in 10 minutes.'
        : 'Invalid email or password.')
      setLoading(false)
      return
    }
    router.push(next)
    router.refresh()
  }

  async function handleReset() {
    if (!email) { setError('Enter your email address first.'); return }
    setLoading(true)
    setError('')
    const supabase = createSupabaseBrowserClient()
    // FIX: Route through /auth/callback so the server can exchange the PKCE code
    // before redirecting to /auth/reset. Direct redirect to /auth/reset would
    // land a ?code= that the reset page cannot exchange (browser client ≠ SSR client).
    const { error: e } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset`,
    })
    setLoading(false)
    if (e) {
      setError(e.message)
    } else {
      setResetSent(true)
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow-2xl p-8">
      {resetSent ? (
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-100 mb-2">
            <Mail size={22} className="text-green-600" />
          </div>
          <h2 className="text-lg font-bold text-gray-900">Check your inbox</h2>
          <p className="text-sm text-gray-500">
            A password reset link was sent to <span className="font-medium">{email}</span>.
            Click the link in the email to set a new password.
          </p>
          <button
            onClick={() => setResetSent(false)}
            className="text-xs text-brand-500 hover:text-brand-700 underline mt-2">
            Back to sign in
          </button>
        </div>
      ) : (
        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
            <div className="relative">
              <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                required autoComplete="email" placeholder="your@email.com"
                className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
            <div className="relative">
              <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type={showPass ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                required autoComplete="current-password" placeholder="••••••••••••"
                className="w-full pl-9 pr-10 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent" />
              <button type="button" onClick={() => setShowPass(s => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-lg text-sm text-red-600">
              <AlertCircle size={14} className="shrink-0" />{error}
            </div>
          )}
          {attempts > 0 && attempts < 5 && (
            <p className="text-xs text-orange-500">{5 - attempts} attempt{5 - attempts !== 1 ? 's' : ''} remaining before temporary lock.</p>
          )}
          <button type="submit" disabled={loading || attempts >= 5}
            className="w-full bg-brand-500 hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg transition-colors text-sm">
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
          <div className="text-center">
            <button type="button" onClick={handleReset} disabled={loading}
              className="text-xs text-brand-500 hover:text-brand-700 underline">
              Forgot password? Send reset email
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-brand-500 mb-4">
            <Lock size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">JJ Property 10</h1>
          <p className="text-slate-400 text-sm mt-1">Management System — Secure Login</p>
        </div>
        <Suspense fallback={<div className="bg-white rounded-2xl p-8 text-center text-gray-400">Loading...</div>}>
          <LoginForm />
        </Suspense>
        <p className="text-center text-xs text-slate-500 mt-6">
          JJ Property 10 · Private System · Unauthorized access prohibited
        </p>
      </div>
    </div>
  )
}
