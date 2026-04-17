'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

function validateTestName(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return 'テストネームを入力してください'
  if (trimmed.length < 3) return '3文字以上で入力してください'
  if (trimmed.length > 10) return '10文字以内で入力してください'
  if (/\s/.test(trimmed)) return '空白（スペース）は使用できません'
  if (new Set(trimmed.split('')).size === 1) return '同じ文字の繰り返しは使用できません'
  if (/(.)\1{2,}/.test(trimmed)) return '同じ文字を3回以上続けて使用できません'
  return ''
}

export default function ChangePasswordPage() {
  const router = useRouter()

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [testName, setTestName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    setError('')

    if (newPassword.length < 6) {
      setError('パスワードは6文字以上で入力してください')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('パスワードが一致しません')
      return
    }
    const testNameError = validateTestName(testName)
    if (testNameError) {
      setError(testNameError)
      return
    }

    setLoading(true)
    try {
      // サーバー側API経由でパスワード変更（Cookieは変化しない）
      const res = await fetch('/api/student/complete-setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: newPassword, testName: testName.trim() }),
      })

      const result = await res.json()
      if (!res.ok) {
        setError(result.error ?? '保存に失敗しました。もう一度お試しください。')
        return
      }

      // セッションはそのまま維持されているのでそのまま移動
      window.location.href = '/student'
    } catch (e) {
      console.error(e)
      setError('保存に失敗しました。もう一度お試しください。')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-blue-50 p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="text-4xl">🔑</div>
          <h1 className="text-xl font-bold text-gray-800">初回設定</h1>
          <p className="text-sm text-gray-500">
            新しいパスワードとテストネームを設定してください。
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">新しいパスワード</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => { setNewPassword(e.target.value); setError('') }}
              placeholder="6文字以上"
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">パスワード（確認）</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => { setConfirmPassword(e.target.value); setError('') }}
              placeholder="もう一度入力"
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">テストネーム</label>
            <input
              type="text"
              value={testName}
              onChange={(e) => { setTestName(e.target.value); setError('') }}
              placeholder="例: えいたろう（3〜10文字）"
              maxLength={10}
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-400 mt-1">ランキングに表示される名前です。一度設定すると変更できません。</p>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>
        )}

        <button
          onClick={handleSubmit}
          disabled={loading || !newPassword || !confirmPassword || !testName.trim()}
          className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 transition disabled:opacity-50"
        >
          {loading ? '保存中...' : '設定を完了する'}
        </button>
      </div>
    </div>
  )
}
