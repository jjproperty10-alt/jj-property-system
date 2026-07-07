'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Settings2, Users, Database, RefreshCw, CheckCircle, AlertCircle, KeyRound, Eye, EyeOff } from 'lucide-react'

type EmployeeConfig = { id: string; name: string; role: string; is_active: boolean }
type DbStatus = { table: string; count: number; status: 'ok' | 'empty' | 'error' }

export default function SettingsPage() {
  const [employees, setEmployees] = useState<EmployeeConfig[]>([])
  const [dbStatus, setDbStatus]   = useState<DbStatus[]>([])
  const [loading, setLoading]     = useState(true)
  const [tab, setTab]             = useState<'database' | 'employees' | 'system' | 'account'>('database')

  // Change password
  const [newPassword, setNewPassword]         = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPass, setShowPass]               = useState(false)
  const [pwLoading, setPwLoading]             = useState(false)
  const [pwError, setPwError]                 = useState('')
  const [pwSuccess, setPwSuccess]             = useState(false)

  async function loadAll() {
    setLoading(true)
    const [empRes, ...tableResults] = await Promise.all([
      supabase.from('employee_config').select('*').order('name'),
      supabase.from('transactions').select('id', { count: 'exact', head: true }),
      supabase.from('properties').select('id', { count: 'exact', head: true }),
      supabase.from('rental_contracts').select('id', { count: 'exact', head: true }),
      supabase.from('contacts').select('id', { count: 'exact', head: true }),
      supabase.from('property_ownership').select('id', { count: 'exact', head: true }),
    ])
    setEmployees((empRes.data ?? []) as EmployeeConfig[])
    const tables = ['transactions','properties','rental_contracts','contacts','property_ownership']
    setDbStatus(tableResults.map((r, i) => ({
      table: tables[i],
      count: r.count ?? 0,
      status: r.error ? 'error' : (r.count ?? 0) === 0 ? 'empty' : 'ok',
    })))
    setLoading(false)
  }
  useEffect(() => { loadAll() }, [])

  async function toggleEmployee(id: string, current: boolean) {
    await supabase.from('employee_config').update({ is_active: !current }).eq('id', id)
    loadAll()
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault()
    if (newPassword.length < 8) { setPwError('Minimum 8 characters.'); return }
    if (newPassword !== confirmPassword) { setPwError('Passwords do not match.'); return }
    setPwLoading(true); setPwError(''); setPwSuccess(false)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) { setPwError(error.message); setPwLoading(false); return }
    setPwSuccess(true); setNewPassword(''); setConfirmPassword('')
    setPwLoading(false)
  }

  const TABS = [
    { id: 'database', label: 'Database Status', icon: Database },
    { id: 'employees', label: 'Employees',       icon: Users },
    { id: 'system',   label: 'System Info',      icon: Settings2 },
    { id: 'account',  label: 'Account',           icon: KeyRound },
  ]

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          <p className="text-sm text-gray-500 mt-0.5">System configuration</p>
        </div>
        <button onClick={loadAll} disabled={loading} className="btn-secondary flex items-center gap-2 text-sm">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id as any)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t.id ? 'border-brand-500 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            <t.icon size={15} />
            {t.label}
          </button>
        ))}
      </div>

      {/* Database Status */}
      {tab === 'database' && (
        <div className="space-y-3">
          <h2 className="font-semibold text-gray-700 mb-3">Tables &amp; Views</h2>
          <div className="grid grid-cols-2 gap-3">
            {dbStatus.map(d => (
              <div key={d.table} className="card p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {d.status === 'ok' ? <CheckCircle size={16} className="text-green-500" /> :
                   d.status === 'empty' ? <AlertCircle size={16} className="text-orange-400" /> :
                   <AlertCircle size={16} className="text-red-500" />}
                  <div>
                    <div className="font-medium text-sm text-gray-900">{d.table}</div>
                    <div className="text-xs text-gray-400">{d.status}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-gray-700">{d.count.toLocaleString()}</div>
                  <div className="text-xs text-gray-400">rows</div>
                </div>
              </div>
            ))}
          </div>
          <div className="card p-5 mt-4 bg-blue-50 border border-blue-100">
            <h3 className="font-semibold text-blue-800 mb-2 text-sm">Supabase Views (12)</h3>
            <div className="grid grid-cols-3 gap-1">
              {['v_cashbox_audit','v_cash_positions','v_cash_movements','v_property_summary',
                'v_owner_balances','v_renovation_summary','v_airbnb_summary','v_ceo_summary',
                'v_money_location','v_settlement_verification','v_anastasia_clearing','v_possible_duplicates'
              ].map(v => (
                <div key={v} className="text-xs text-blue-700 flex items-center gap-1">
                  <CheckCircle size={10} className="text-blue-400 shrink-0" />
                  {v}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Employees */}
      {tab === 'employees' && (
        <div>
          <h2 className="font-semibold text-gray-700 mb-3">Employee Configuration</h2>
          <p className="text-xs text-gray-500 mb-4">
            Active employees appear in the Anastasia cashbox. Inactive employees are excluded.
            <span className="text-red-500 font-medium ml-1">Do not activate Fabi.</span>
          </p>
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Name</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Role</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">Active</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {employees.map(e => (
                  <tr key={e.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{e.name}</td>
                    <td className="px-4 py-3 text-gray-500 capitalize">{e.role}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`badge ${e.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {e.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => toggleEmployee(e.id, e.is_active)}
                        disabled={e.name.toLowerCase() === 'fabi'}
                        className={`text-xs px-3 py-1 rounded border transition-colors ${
                          e.name.toLowerCase() === 'fabi'
                            ? 'opacity-30 cursor-not-allowed border-gray-200 text-gray-400'
                            : e.is_active
                              ? 'border-red-200 text-red-600 hover:bg-red-50'
                              : 'border-green-200 text-green-600 hover:bg-green-50'
                        }`}>
                        {e.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* System Info */}
      {tab === 'system' && (
        <div className="space-y-4">
          <div className="card p-5">
            <h3 className="font-semibold text-gray-900 mb-3">System Information</h3>
            <div className="space-y-2 text-sm">
              {[
                { label: 'System Name',      value: 'JJ Property 10' },
                { label: 'Version',          value: '2.0 - June 2026' },
                { label: 'Database',         value: 'Supabase PostgreSQL' },
                { label: 'Frontend',         value: 'Next.js 14 + Tailwind CSS' },
                { label: 'Deployment',       value: 'Vercel' },
                { label: 'Company',          value: 'JJ Property Cyprus' },
                { label: 'Partners',         value: 'Yossi (50%) + Jacob (50%)' },
                { label: 'Special Property', value: 'Villa Mazotos: Avi 50%, Yossi 25%, Jacob 25%' },
              ].map(row => (
                <div key={row.label} className="flex justify-between border-b border-gray-50 pb-2">
                  <span className="text-gray-500">{row.label}</span>
                  <span className="text-gray-900 font-medium">{row.value}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="card p-5 bg-yellow-50 border border-yellow-100">
            <h3 className="font-semibold text-yellow-800 mb-2">Business Rules</h3>
            <ul className="text-xs text-yellow-700 space-y-1.5">
              <li>Contract != Payment: Purchase/Sale Contracts are deal values only, not cash flow</li>
              <li>Fabi = employee of Anastasia, not an independent cashbox. Keep inactive.</li>
              <li>Villa Mazotos = special ownership: Avi 50%, Yossi 25%, Jacob 25%</li>
              <li>JJ balance is split 50/50 between Yossi and Jacob in partner settlement</li>
            </ul>
          </div>
        </div>
      )}

      {/* Account - Change Password */}
      {tab === 'account' && (
        <div className="max-w-md">
          <div className="card p-6">
            <div className="flex items-center gap-2 mb-5">
              <KeyRound size={18} className="text-brand-500" />
              <h2 className="font-semibold text-gray-900">Change Password</h2>
            </div>
            <form onSubmit={changePassword} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">New Password</label>
                <div className="relative">
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    required minLength={8}
                    placeholder="Min. 8 characters"
                    className="input w-full pr-10"
                  />
                  <button type="button" onClick={() => setShowPass(s => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Confirm Password</label>
                <input
                  type={showPass ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  required minLength={8}
                  placeholder="Repeat password"
                  className="input w-full"
                />
              </div>
              {pwError && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-lg text-sm text-red-600">
                  <AlertCircle size={14} className="shrink-0" />{pwError}
                </div>
              )}
              {pwSuccess && (
                <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-100 rounded-lg text-sm text-green-700">
                  <CheckCircle size={14} className="shrink-0" /> Password changed successfully!
                </div>
              )}
              <button type="submit" disabled={pwLoading}
                className="btn-primary w-full text-sm py-2.5 disabled:opacity-50">
                {pwLoading ? 'Saving...' : 'Update Password'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

