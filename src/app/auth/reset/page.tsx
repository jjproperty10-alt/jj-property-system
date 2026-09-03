'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase'
import { Lock, Eye, EyeOff, CheckCircle, AlertCircle, Loader } from 'lucide-react'

/**
 * Must use the cookie-based browser client (same as /login).
 * resetPasswordForEmail stores a PKCE verifier in cookies; the email then
 * returns here with ?code=. A localStorage client cannot see that verifier,
 * so exchange fails and the page falsely reports "link expired".
 */
type SessionState = 'loading' | 'ready' | 'invalid'

function ResetForm() {
  const router = useRouter()
  const [password, setPassword]     = useState('')
  const [confirm, setConfirm]       = useState('')
  const [showPass, setShowPass]     = useState(false)
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState('')
  const [success, setSuccess]       = useState(false)
  const [sessionState, setSessionState] = useState<SessionState>('loading')

  useEffect(() => {
    const supabase = createSupabaseBrowserClient()
    let resolved = false

    function resolve(hasSession: boolean) {
      if (resolved) return
      resolved = true
      setSessionState(hasSession ? 'ready' : 'invalid')
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN')) {
        resolve(true)
      }
    })

    async function establishRecoverySession() {
      const params = new URLSearchParams(window.location.search)
      const code = params.get('code')

      // Wait for client init (detectSessionInUrl may already exchange ?code=)
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        if (code) window.history.replaceState({}, '', '/auth/reset')
        resolve(true)
        return
      }

      if (code) {
        const { data, error } = await supabase.auth.exchangeCodeForSession(code)
        if (!error && data.session) {
          window.history.replaceState({}, '', '/auth/reset')
          resolve(true)
          return
        }
      }

      resolve(false)
    }

    establishRecoverySession()

    const timeout = setTimeout(() => resolve(false), 8000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setLoading(true)
    setError('')
    const supabase = createSupabaseBrowserClient()
    const { error: err } = await supabase.auth.updateUser({ password })
    if (err) {
      setError(err.message)
      setLoading(false)
      return
    }
    setSuccess(true)
    setTimeout(() => router.push('/'), 2500)
  }

  /* ── Loading ────────────────────────────────────────────────────── */
  if (sessionState === 'loading') {
    return (
      <div className="bg-white rounded-2xl shadow-2xl p-8 text-center">
        <Loader size={24} className="animate-spin text-brand-500 mx-auto mb-3" />
        <p className="text-sm text-gray-500">Verifying your recovery link…</p>
      </div>
    )
  }

  /* ── Invalid / expired ──────────────────────────────────────────── */
  if (sessionState === 'invalid') {
    return (
      <div className="bg-white rounded-2xl shadow-2xl p-8 text-center">
        <AlertCircle size={36} className="text-red-400 mx-auto mb-4" />
        <h2 className="text-lg font-bold text-gray-900 mb-2">Link Expired or Invalid</h2>
        <p className="text-sm text-gray-500 mb-5">
          This password reset link has expired or has already been used.
          Please request a new reset email.
        </p>
        <a
          href="/login"
          className="inline-block bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold px-6 py-2.5 rounded-lg transition-colors">
          Back to Sign In
        </a>
      </div>
    )
  }

  /* ── Success ─────────────────────────────────────────────────────── */
  if (success) {
    return (
      <div className="bg-white rounded-2xl shadow-2xl p-8 text-center">
        <CheckCircle size={40} className="text-green-500 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-gray-900 mb-2">Password Updated!</h2>
        <p className="text-sm text-gray-500">Redirecting to dashboard…</p>
      </div>
    )
  }

  /* ── Form ───────────────────────────────────────────────────────── */
  return (
    <div className="bg-white rounded-2xl shadow-2xl p-8">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">New Password</label>
          <div className="relative">
            <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type={showPass ? 'text' : 'password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              required minLength={8}
              placeholder="Min. 8 characters"
              className="w-full pl-9 pr-10 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
            <button type="button" onClick={() => setShowPass(s => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Confirm Password</label>
          <div className="relative">
            <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type={showPass ? 'text' : 'password'}
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              required minLength={8}
              placeholder="Repeat password"
              className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
          </div>
        </div>
        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-lg text-sm text-red-600">
            <AlertCircle size={14} className="shrink-0" />{error}
          </div>
        )}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg transition-colors text-sm">
          {loading ? 'Saving…' : 'Set New Password'}
        </button>
      </form>
    </div>
  )
}

export default function ResetPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-brand-500 mb-4">
            <Lock size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Set New Password</h1>
          <p className="text-slate-400 text-sm mt-1">JJ Property 10</p>
        </div>
        <Suspense fallback={<div className="bg-white rounded-2xl p-8 text-center text-gray-400">Loading…</div>}>
          <ResetForm />
        </Suspense>
      </div>
    </div>
  )
}
