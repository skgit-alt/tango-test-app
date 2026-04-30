'use client'

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'

// ─── 型定義 ──────────────────────────────────────────────────────────────────

export interface RankEntry {
  rank: number
  student_id: string
  test_name: string
  class_name: string
  seat_number: number
  name: string
  roundValues: Record<string, number>
  total: number
}

export interface Settings {
  from_round: number
  to_round: number
  label: string
}

export interface ClassAvg {
  round: number
  classes: Record<string, number>
}

export interface RankingViewProps {
  mode: 50 | 20
  settings: Settings | null
  rounds: number[]
  ranking: RankEntry[]
  classAverages: ClassAvg[]
  myTestName: string
  label: string
  medalsByStudentId?: Record<string, string>
}

const COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6', '#06b6d4']

// ─── コンポーネント ───────────────────────────────────────────────────────────

export default function RankingView({
  mode,
  settings,
  rounds,
  ranking,
  classAverages,
  myTestName,
  label,
  medalsByStudentId = {},
}: RankingViewProps) {
  const unit = mode === 20 ? '点' : 'pt'

  // 自分の順位
  const myEntry = ranking.find((r) => r.test_name === myTestName)

  // グラフ用データ
  const allClasses = Array.from(
    new Set(classAverages.flatMap((ca) => Object.keys(ca.classes)))
  ).sort()

  const chartData = rounds.map((round) => {
    const ca = classAverages.find((c) => c.round === round)
    const entry: Record<string, string | number> = { name: `第${round}回` }
    for (const cls of allClasses) {
      entry[cls] = ca?.classes[cls] ?? 0
    }
    return entry
  })

  return (
    <div className="space-y-5">
      {/* タイトル */}
      <div className="text-center">
        <h2 className="text-lg font-bold text-gray-800">{label}</h2>
        {settings && (
          <p className="text-xs text-gray-400 mt-0.5">
            {settings.label || `第${settings.from_round}回〜第${settings.to_round}回`}の集計
          </p>
        )}
      </div>

      {/* 自分の成績バナー */}
      {myEntry && (
        <div className="bg-blue-600 text-white rounded-2xl p-4">
          <p className="text-blue-200 text-xs mb-1">あなたの成績 ({myTestName})</p>
          <div className="flex items-center gap-6">
            <div>
              <p className="text-2xl font-bold">{myEntry.rank}位</p>
              <p className="text-blue-200 text-xs">順位</p>
            </div>
            <div>
              <p className="text-2xl font-bold">
                {myEntry.total}{unit}
              </p>
              <p className="text-blue-200 text-xs">合計</p>
            </div>
          </div>
        </div>
      )}

      {/* ランキングテーブル */}
      {ranking.length > 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-3 py-3 text-center w-12">順位</th>
                  <th className="px-3 py-3 text-left w-10">クラス</th>
                  <th className="px-3 py-3 text-left">テストネーム</th>
                  {rounds.map((r) => (
                    <th key={r} className="px-3 py-3 text-right whitespace-nowrap">
                      第{r}回
                    </th>
                  ))}
                  <th className="px-3 py-3 text-right font-bold">合計</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {ranking.map((r) => {
                  const isMe = r.test_name === myTestName
                  const rankColor =
                    r.rank === 1
                      ? 'text-yellow-500 text-base'
                      : r.rank === 2
                      ? 'text-gray-400'
                      : r.rank === 3
                      ? 'text-amber-600'
                      : 'text-gray-400 text-xs'
                  const rowBg =
                    isMe
                      ? 'bg-blue-50'
                      : r.rank === 1
                      ? 'bg-yellow-50'
                      : r.rank === 2
                      ? 'bg-gray-50'
                      : r.rank === 3
                      ? 'bg-amber-50'
                      : ''
                  return (
                    <tr key={r.student_id} className={rowBg}>
                      <td className="px-3 py-3 text-center">
                        <span className={`font-bold ${rankColor}`}>{r.rank}</span>
                      </td>
                      <td className="px-3 py-3 text-gray-500 text-xs whitespace-nowrap">
                        {r.class_name}
                      </td>
                      <td className={`px-3 py-3 font-medium ${isMe ? 'text-blue-700' : 'text-gray-800'}`}>
                        {r.test_name}
                        {medalsByStudentId[r.student_id] && (
                          <span className="ml-1 text-base">{medalsByStudentId[r.student_id]}</span>
                        )}
                        {isMe && (
                          <span className="text-xs text-blue-400 ml-1">（あなた）</span>
                        )}
                      </td>
                      {rounds.map((round) => (
                        <td key={round} className="px-3 py-3 text-right text-gray-600">
                          {r.roundValues[String(round)] != null
                            ? `${r.roundValues[String(round)]}${unit}`
                            : '-'}
                        </td>
                      ))}
                      <td className={`px-3 py-3 text-right font-bold ${isMe ? 'text-blue-600' : 'text-gray-800'}`}>
                        {r.total}{unit}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center text-gray-400">
          <p>まだランキングデータがありません</p>
        </div>
      )}

      {/* クラス平均点グラフ */}
      {classAverages.length > 0 && allClasses.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          <h3 className="font-semibold text-gray-800 mb-3 text-sm">クラス別平均点推移</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {allClasses.map((cls, i) => (
                <Line
                  key={cls}
                  type="monotone"
                  dataKey={cls}
                  stroke={COLORS[i % COLORS.length]}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
