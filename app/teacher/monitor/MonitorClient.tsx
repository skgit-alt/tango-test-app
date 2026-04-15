'use client'

import { createClient } from '@/lib/supabase/client'
import { useState } from 'react'

type Test = {
  id: string
  title: string
  mode: number
  status: string
  opened_at: string | null
  created_at: string
}

export default function MonitorClient({ tests }: { tests: Test[] }) {
  const [testList, setTestList] = useState(tests)
  const supabase = createClient()

  const handleOpenTest = async (testId: string) => {
    const confirmed = confirm('このテストを開始しますか？')
    if (!confirmed) return

    const { error } = await supabase
      .from('tests')
      .update({ status: 'open', opened_at: new Date().toISOString() })
      .eq('id', testId)

    if (!error) {
      setTestList(prev =>
        prev.map(t =>
          t.id === testId
            ? { ...t, status: 'open', opened_at: new Date().toISOString() }
            : t
        )
      )
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <h1 className="text-2xl font-bold mb-2">テスト開始</h1>
      <p className="text-gray-500 mb-6">開始するテストの「開始」ボタンを押してください</p>
      <div className="space-y-4 max-w-2xl">
        {testList.length === 0 && (
          <p className="text-gray-400">現在テストがありません</p>
        )}
        {testList.map(test => (
          <div
            key={test.id}
            className="bg-white rounded-lg shadow p-6 flex items-center justify-between"
          >
            <div>
              <h2 className="text-lg font-semibold">{test.title}</h2>
              <p className="text-sm text-gray-500">
                {test.mode === 300 ? '300問モード・20分' : '50問モード・3分'}
              </p>
            </div>
            {test.status === 'waiting' && (
              <button
                onClick={() => handleOpenTest(test.id)}
                className="bg-green-500 hover:bg-green-600 text-white px-6 py-2 rounded-lg font-semibold"
              >
                開始
              </button>
            )}
            {test.status === 'open' && (
              <span className="bg-blue-100 text-blue-700 px-4 py-2 rounded-lg text-sm font-medium">
                実施中
              </span>
            )}
            {test.status === 'finished' && (
              <span className="bg-gray-100 text-gray-500 px-4 py-2 rounded-lg text-sm font-medium">
                終了
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
