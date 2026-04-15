'use client'

import { createClient } from '@/lib/supabase/client'
import { useState, useEffect } from 'react'

type Test = {
  id: string
  title: string
  mode: number
  status: string
  opened_at: string | null
  created_at: string
  open_classes: string[] | null
}

export default function MonitorClient({ tests: initialTests, classes }: { tests: Test[], classes: string[] }) {
  const [testList, setTestList] = useState(initialTests)
  const [loadingClass, setLoadingClass] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    const channel = supabase
      .channel('monitor-tests')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tests' }, (payload) => {
        if (payload.new) {
          setTestList(prev => prev.map(t => t.id === payload.new.id ? { ...t, ...payload.new } as Test : t))
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [supabase])

  const handleOpenClass = async (testId: string, className: string) => {
    const test = testList.find(t => t.id === testId)
    if (!test) return
    const current = test.open_classes ?? []
    const already = current.includes(className)
    if (already) return // 開始済みは再クリック不可

    setLoadingClass(`${testId}-${className}`)
    const newClasses = [...current, className]
    const { error } = await supabase
      .from('tests')
      .update({ open_classes: newClasses })
      .eq('id', testId)

    if (!error) {
      setTestList(prev => prev.map(t => t.id === testId ? { ...t, open_classes: newClasses } : t))
    }
    setLoadingClass(null)
  }

  const handleOpenAll = async (testId: string) => {
    const confirmed = confirm('全クラスのテストを開始しますか？')
    if (!confirmed) return

    const { error } = await supabase
      .from('tests')
      .update({ status: 'open', opened_at: new Date().toISOString() })
      .eq('id', testId)

    if (!error) {
      setTestList(prev => prev.map(t =>
        t.id === testId ? { ...t, status: 'open', opened_at: new Date().toISOString() } : t
      ))
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <h1 className="text-2xl font-bold mb-1">テスト開始</h1>
      <p className="text-gray-500 text-sm mb-6">クラスごとに開始するか、全クラス一括で開始できます</p>
      <div className="space-y-5 max-w-2xl">
        {testList.length === 0 && (
          <p className="text-gray-400">現在テストがありません</p>
        )}
        {testList.map(test => {
          const openClasses = test.open_classes ?? []
          const isAllOpen = test.status === 'open'

          return (
            <div key={test.id} className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-800">{test.title}</h2>
                <p className="text-sm text-gray-500">
                  {test.mode === 300 ? '300問モード・20分' : '50問モード・3分'}
                </p>
              </div>

              {isAllOpen ? (
                <div className="bg-green-100 text-green-700 rounded-xl px-4 py-3 text-sm font-semibold text-center">
                  ✅ 全クラス実施中
                </div>
              ) : (
                <div className="space-y-3">
                  {/* クラスごとのボタン */}
                  <div className="flex flex-wrap gap-2">
                    {classes.map(cls => {
                      const opened = openClasses.includes(cls)
                      const isLoading = loadingClass === `${test.id}-${cls}`
                      return (
                        <button
                          key={cls}
                          onClick={() => handleOpenClass(test.id, cls)}
                          disabled={opened || isLoading}
                          className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${
                            opened
                              ? 'bg-green-100 text-green-700 cursor-default'
                              : 'bg-blue-600 text-white hover:bg-blue-700 active:scale-95 disabled:opacity-50'
                          }`}
                        >
                          {isLoading ? '...' : opened ? `${cls} ✓` : `${cls} 開始`}
                        </button>
                      )
                    })}
                  </div>

                  {/* 全クラス一括ボタン */}
                  <button
                    onClick={() => handleOpenAll(test.id)}
                    className="w-full bg-green-600 text-white py-3 rounded-xl font-bold hover:bg-green-700 active:scale-95 transition"
                  >
                    全クラス一括開始
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
