'use client'

import { createClient } from '@/lib/supabase/client'
import { useState } from 'react'
import Link from 'next/link'

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

// 認証エラー（IDorパスワード違い）かサーバーエラーかを判定
function isAuthError(msg: string) {
  return msg.includes('Invalid login') || msg.includes('invalid_grant') || msg.includes('Email not confirmed')
}

export default function StudentLoginPage() {
  const [studentId, setStudentId] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  const supabase = createClient()

  const handleLogin = async () => {
    const id = studentId.trim().toLowerCase()
    if (!id || !password) {
      setError('IDとパスワードを入力してください')
      return
    }

    setLoading(true)
    setError('')
    setRetryCount(0)

    // ジッター: 0〜2秒のランダム遅延で同時アクセスを分散
    await sleep(Math.random() * 2000)

    const email = `${id}@school.local`
    const MAX_RETRIES = 3

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        setRetryCount(attempt)
        await sleep(attempt * 1500)  // 1.5秒 → 3秒と段階的に待つ
      }

      try {
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password })

        if (signInError) {
          // IDorパスワード違いは即終了（リトライしても意味がない）
          if (isAuthError(signInError.message)) {
            setError('IDまたはパスワードが正しくありません')
            setLoading(false)
            setRetryCount(0)
            return
          }
          // サーバーエラーはリトライ
          if (attempt < MAX_RETRIES - 1) continue
          setError('サーバーが混雑しています。しばらくしてからもう一度お試しください。')
          setLoading(false)
          setRetryCount(0)
          return
        }

        if (!signInData?.user) {
          setError('IDまたはパスワードが正しくありません')
          setLoading(false)
          setRetryCount(0)
          return
        }

        // must_change_password を確認
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
        return

      } catch {
        if (attempt < MAX_RETRIES - 1) continue
        setError('通信エラーが発生しました。もう一度お試しください。')
        setLoading(false)
        setRetryCount(0)
        return
      }
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
          {loading
            ? retryCount > 0
              ? `再接続中... (${retryCount}/${3})`
              : 'ログイン中...'
            : 'ログイン'
          }
        </button>

        <Link href="/auth/login" className="text-xs text-gray-400 hover:text-gray-600 transition text-center">
          ← ログイン画面に戻る
        </Link>
      </div>
    </div>
  )
}
