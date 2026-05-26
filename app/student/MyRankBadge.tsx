'use client'

import { useEffect, useState } from 'react'

export default function MyRankBadge() {
  const [totalPoints, setTotalPoints] = useState<number | null>(null)
  const [rank, setRank] = useState<number | null>(null)

  useEffect(() => {
    fetch('/api/student/my-rank')
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data) {
          setTotalPoints(data.totalPoints)
          setRank(data.rank)
        }
      })
      .catch(() => {/* 取得失敗は無視 */})
  }, [])

  return (
    <div className="mt-4 pt-4 border-t border-gray-100 flex gap-6">
      <div className="text-center">
        <p className="text-2xl font-bold text-blue-600">
          {totalPoints === null ? '…' : `${totalPoints}pt`}
        </p>
        <p className="text-xs text-gray-500 mt-0.5">通算ポイント</p>
      </div>
      <div className="text-center">
        <p className="text-2xl font-bold text-purple-600">
          {rank === null ? '…' : rank > 0 ? `${rank}位` : '-'}
        </p>
        <p className="text-xs text-gray-500 mt-0.5">現在の順位</p>
      </div>
    </div>
  )
}
