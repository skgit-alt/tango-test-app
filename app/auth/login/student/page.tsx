'use client'

import { createClient } from '@/lib/supabase/client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function StudentLoginPage() {
  const [studentId, setStudentId] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const supabase = createClient()
  const router = useRouter()

  const handleLogin = async () => {
    const id = studentId.trim().toLowerCase()
    if (!id || !password) {
      setError('IDとパスワードを入力してください')
      return
    }

    setLoading(true)
    setError('')

    const email = `${id}@school.local`
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password })

    if (signInError || !signInData.user) {
      setError('IDまたはパスワードが正しくありません')
      setLoading(false)
      return
    }

    // must_change_password を確認（ログインしたユーザーのIDで絞り込む）
    const { data: student } = await supabase
      .from('students')
      .select('must_change_password')
      .eq('id', signInData.user.id)
      .single()

    if (student?.must_change_password) {
      window.location.href = '/student/change-password'
    } else {
      window.location.href = '/student'
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-blue-50 p-4">
      <div className="bg-white rounded-2xl shadow-lg p-10 w-full max-w-sm flex flex-col gap-6">
        <div className="text-center space-y-1">
          <div className="text-5xl mb-2">🎓</div>
          <p className="text-xs font-semibold text-blue-500 uppercase tracking-widest">生徒用ログイン</p>
          <h1 className="text-2xl font-bold text-gray-800">単語テストアプリ</h1>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">生徒ID</label>
            <input
              type="text"
              value={studentId}
              onChange={(e) => { setStudentId(e.target.value); setError('') }}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              placeholder="例: tkd250001"
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoCapitalize="none"
              autoCorrect="off"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">パスワード</label>
            <input
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError('') }}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              placeholder="パスワードを入力"
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {error && (
          <div className="bg-red-50 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>
        )}

        <button
          onClick={handleLogin}
          disabled={loading}
          className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold text-lg hover:bg-blue-700 active:scale-95 transition disabled:opacity-50"
        >
          {loading ? 'ログイン中...' : 'ログイン'}
        </button>

        <Link href="/auth/login" className="text-xs text-gray-400 hover:text-gray-600 transition text-center">
          ← ログイン画面に戻る
        </Link>
      </div>
    </div>
  )
}
