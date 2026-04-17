'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function RegisterPage() {
  const supabase = createClient()

  const [testName, setTestName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const validate = (value: string): string => {
    const trimmed = value.trim()
    if (!trimmed) return 'テストネームを入力してください'
    if (trimmed.length < 3) return '3文字以上で入力してください'
    if (trimmed.length > 10) return '10文字以内で入力してください'
    if (/\s/.test(trimmed)) return '空白（スペース）は使用できません'
    if (new Set(trimmed.split('')).size === 1) return '同じ文字の繰り返しは使用できません'
    if (/(.)\1{2,}/.test(trimmed)) return '同じ文字を3回以上続けて使用できません'
    return ''
  }

  const handleSubmit = async () => {
    const trimmed = testName.trim()
    const validationError = validate(trimmed)
    if (validationError) {
      setError(validationError)
      return
    }

    setLoading(true)
    setError('')

    try {
      // 重複チェック
      const { data: existing } = await supabase
        .from('students')
        .select('id')
        .eq('test_name', trimmed)
        .maybeSingle()

      if (existing) {
        setError('そのテストネームは既に使用されています。別のテストネームを選んでください。')
        setLoading(false)
        return
      }

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { window.location.href = '/auth/login'; return }

      const { error: updateError } = await supabase
        .from('students')
        .update({ test_name: trimmed })
        .eq('id', user.id)

      if (updateError) throw updateError

      window.location.href = '/student'
    } catch (err) {
      console.error(err)
      setError('登録に失敗しました。もう一度お試しください。')
    } finally {
      setLoading(false)
    }
  }

  const validationPreview = testName.trim() ? validate(testName.trim()) : ''

  return (
    <div className="min-h-screen flex items-center justify-center bg-blue-50 p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="text-4xl">✏️</div>
          <h1 className="text-xl font-bold text-gray-800">テストネームを登録</h1>
          <p className="text-sm text-gray-500">
            テスト中に表示される名前です。一度設定すると変更できません。
          </p>
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            テストネーム
          </label>
          <input
            type="text"
            value={testName}
            onChange={(e) => {
              setTestName(e.target.value)
              setError('')
            }}
            placeholder="例: えいたろう"
            maxLength={10}
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg"
            autoFocus
          />
          <div className="flex justify-between text-xs text-gray-400">
            <span>3〜10文字・空白・繰り返しNG</span>
            <span>{testName.trim().length}/10</span>
          </div>
        </div>

        {(error || validationPreview) && (
          <div className="bg-red-50 text-red-700 rounded-xl p-3 text-sm">
            {error || validationPreview}
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={loading || !testName.trim()}
          className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? '登録中...' : '登録する'}
        </button>
      </div>
    </div>
  )
}
