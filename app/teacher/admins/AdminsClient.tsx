'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Admin = {
  id: string
  email: string
  role: string
  created_at: string
}

const roleLabel: Record<string, string> = {
  admin: '管理者',
  teacher: '先生',
}
const roleColor: Record<string, string> = {
  admin: 'bg-purple-100 text-purple-700',
  teacher: 'bg-blue-100 text-blue-700',
}

export default function AdminsClient({ admins: initial, myEmail }: { admins: Admin[], myEmail: string }) {
  const supabase = createClient()
  const [admins, setAdmins] = useState<Admin[]>(initial)
  const [newEmail, setNewEmail] = useState('')
  const [newRole, setNewRole] = useState<'admin' | 'teacher'>('teacher')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const handleAdd = async () => {
    const email = newEmail.trim().toLowerCase()
    if (!email) { setError('メールアドレスを入力してください'); return }
    if (admins.some(a => a.email === email)) { setError('すでに登録されています'); return }

    setAdding(true)
    setError('')
    setSuccess('')

    const { data, error: err } = await supabase
      .from('admins')
      .insert({ email, role: newRole })
      .select()
      .single()

    if (err || !data) {
      setError('追加に失敗しました: ' + (err?.message ?? ''))
    } else {
      setAdmins(prev => [...prev, data as Admin])
      setNewEmail('')
      setSuccess(`${email} を${roleLabel[newRole]}として追加しました`)
    }
    setAdding(false)
  }

  const handleChangeRole = async (admin: Admin) => {
    const newR = admin.role === 'admin' ? 'teacher' : 'admin'
    const label = roleLabel[newR]
    const confirmed = confirm(`${admin.email} の役割を「${label}」に変更しますか？`)
    if (!confirmed) return

    const { error: err } = await supabase
      .from('admins')
      .update({ role: newR })
      .eq('id', admin.id)

    if (err) {
      setError('更新に失敗しました')
    } else {
      setAdmins(prev => prev.map(a => a.id === admin.id ? { ...a, role: newR } : a))
      setSuccess(`${admin.email} を${label}に変更しました`)
    }
  }

  const handleDelete = async (admin: Admin) => {
    if (admin.email === myEmail) { setError('自分自身は削除できません'); return }
    const confirmed = confirm(`${admin.email} をスタッフから削除しますか？`)
    if (!confirmed) return

    const { error: err } = await supabase
      .from('admins')
      .delete()
      .eq('id', admin.id)

    if (err) {
      setError('削除に失敗しました')
    } else {
      setAdmins(prev => prev.filter(a => a.id !== admin.id))
      setSuccess(`${admin.email} を削除しました`)
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-2xl font-bold text-gray-800">スタッフ管理</h1>

      {/* 新規追加フォーム */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
        <h2 className="font-semibold text-gray-700">スタッフを追加</h2>
        <div className="flex gap-3 flex-wrap">
          <input
            type="email"
            value={newEmail}
            onChange={e => { setNewEmail(e.target.value); setError('') }}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            placeholder="先生のGmailアドレス"
            className="flex-1 min-w-48 border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <select
            value={newRole}
            onChange={e => setNewRole(e.target.value as 'admin' | 'teacher')}
            className="border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
          >
            <option value="teacher">先生</option>
            <option value="admin">管理者</option>
          </select>
          <button
            onClick={handleAdd}
            disabled={adding}
            className="bg-blue-600 text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-blue-700 transition disabled:opacity-50"
          >
            {adding ? '追加中...' : '追加'}
          </button>
        </div>
        <p className="text-xs text-gray-400">
          先生：テスト開始ボタンのみ操作可　／　管理者：全機能＋スタッフ管理
        </p>
      </div>

      {error && <div className="bg-red-50 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>}
      {success && <div className="bg-green-50 text-green-700 rounded-xl px-4 py-3 text-sm">{success}</div>}

      {/* スタッフ一覧 */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">スタッフ一覧 ({admins.length}名)</h2>
        </div>
        {admins.length === 0 ? (
          <div className="py-12 text-center text-gray-400">スタッフがいません</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="px-5 py-3 text-left">メールアドレス</th>
                <th className="px-5 py-3 text-left">役割</th>
                <th className="px-5 py-3 text-left">追加日</th>
                <th className="px-5 py-3 text-center">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {admins.map(admin => (
                <tr key={admin.id} className={`hover:bg-gray-50 ${admin.email === myEmail ? 'bg-blue-50/50' : ''}`}>
                  <td className="px-5 py-3 text-gray-800">
                    {admin.email}
                    {admin.email === myEmail && (
                      <span className="ml-2 text-xs text-blue-500 font-medium">(あなた)</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`text-xs px-2 py-1 rounded-full font-semibold ${roleColor[admin.role] ?? 'bg-gray-100 text-gray-600'}`}>
                      {roleLabel[admin.role] ?? admin.role}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-gray-400 text-xs">
                    {new Date(admin.created_at).toLocaleDateString('ja-JP')}
                  </td>
                  <td className="px-5 py-3 text-center">
                    <div className="flex items-center justify-center gap-3">
                      {admin.email !== myEmail && (
                        <>
                          <button
                            onClick={() => handleChangeRole(admin)}
                            className="text-blue-600 hover:text-blue-800 text-xs font-medium hover:underline"
                          >
                            {admin.role === 'admin' ? '先生に変更' : '管理者に変更'}
                          </button>
                          <button
                            onClick={() => handleDelete(admin)}
                            className="text-red-500 hover:text-red-700 text-xs font-medium hover:underline"
                          >
                            削除
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
