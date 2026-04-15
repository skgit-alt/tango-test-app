'use client'

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts'

type Session300 = {
  id: string
  score: number | null
  submitted_at: string
  tests: { title: string; pass_score: number | null }
}

type Session50 = {
  id: string
  score: number | null
  submitted_at: string
  tests: { title: string }
  points: number
}

function formatDate(iso: string) {
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

// 300問グラフ
export function Chart300({ sessions }: { sessions: Session300[] }) {
  if (sessions.length === 0) return null

  const data = [...sessions].reverse().map((s) => ({
    label: formatDate(s.submitted_at),
    title: (s.tests as any).title,
    点数: s.score ?? 0,
  }))

  const passScore = (sessions[0].tests as any).pass_score as number | null

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5">
      <h3 className="text-sm font-bold text-gray-600 mb-4">📝 300問テスト 点数推移</h3>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
          <YAxis domain={[0, 300]} tick={{ fontSize: 11 }} width={36} />
          <Tooltip
            formatter={(value, name) => [`${value}点`, '点数']}
            labelFormatter={(label, payload) => payload?.[0]?.payload?.title ?? label}
          />
          {passScore !== null && (
            <ReferenceLine y={passScore} stroke="#ef4444" strokeDasharray="4 4"
              label={{ value: `合格点${passScore}`, position: 'insideTopRight', fontSize: 10, fill: '#ef4444' }} />
          )}
          <Line
            type="monotone" dataKey="点数"
            stroke="#3b82f6" strokeWidth={2}
            dot={{ r: 4, fill: '#3b82f6' }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// 50問グラフ（点数＋ポイントの2軸折れ線）
export function Chart50({ sessions }: { sessions: Session50[] }) {
  if (sessions.length === 0) return null

  const data = [...sessions].reverse().map((s) => ({
    label: formatDate(s.submitted_at),
    title: (s.tests as any).title,
    点数: s.score ?? 0,
    ポイント: s.points,
  }))

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5">
      <h3 className="text-sm font-bold text-gray-600 mb-4">⚡ 50問テスト 点数・ポイント推移</h3>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 8, right: 40, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
          {/* 左軸: 点数 0〜50 */}
          <YAxis yAxisId="score" domain={[0, 50]} tick={{ fontSize: 11 }} width={36} />
          {/* 右軸: ポイント 0〜12 */}
          <YAxis yAxisId="pt" orientation="right" domain={[0, 12]} tick={{ fontSize: 11 }} width={28}
            tickFormatter={(v) => `${v}pt`} />
          <Tooltip
            formatter={(value, name) => name === '点数' ? [`${value}点`, '点数'] : [`${value}pt`, 'ポイント']}
            labelFormatter={(label, payload) => payload?.[0]?.payload?.title ?? label}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line
            yAxisId="score" type="monotone" dataKey="点数"
            stroke="#3b82f6" strokeWidth={2}
            dot={{ r: 4, fill: '#3b82f6' }}
            activeDot={{ r: 6 }}
          />
          <Line
            yAxisId="pt" type="monotone" dataKey="ポイント"
            stroke="#f59e0b" strokeWidth={2}
            dot={{ r: 4, fill: '#f59e0b' }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
