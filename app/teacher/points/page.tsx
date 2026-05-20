'use client'

import { useEffect, useState } from 'react'
import * as XLSX from 'xlsx'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import {
  DEFAULT_POINT_RULES, ruleLabel, type PointRule,
  DEFAULT_MEDAL_RULES, type MedalRule,
} from '@/lib/supabase/types'

// ─── 型定義 ──────────────────────────────────────────────────────────────────

interface RankEntry {
  rank: number
  student_id: string
  name: string
  class_name: string
  seat_number: number
  test_name: string
  roundValues: Record<string, number>
  total: number
}

interface Settings {
  from_round: number
  to_round: number
  label: string
  ranking_type: string      // 'points' | 'score'
  max_rank: number
  point_rules?: PointRule[]
  medals_enabled?: boolean
  medal_rules?: MedalRule[]
}

interface ClassAvg {
  round: number
  classes: Record<string, number>
}

interface RankingData {
  settings: Settings | null
  rounds: number[]
  ranking: RankEntry[]
  classAverages: ClassAvg[]
}

const COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6', '#06b6d4']

// ─── 集計期間設定パネル ──────────────────────────────────────────────────────

function SettingsPanel({
  settings,
  activeMode,
  onSaved,
}: {
  settings: Settings | null
  activeMode: 50 | 20
  onSaved: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [fromRound, setFromRound] = useState('')
  const [toRound, setToRound] = useState('')
  const [label, setLabel] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (settings) {
      setFromRound(String(settings.from_round))
      setToRound(String(settings.to_round))
      setLabel(settings.label ?? '')
    }
  }, [settings])

  const handleSave = async () => {
    const from = parseInt(fromRound)
    const to = parseInt(toRound)
    if (isNaN(from) || isNaN(to) || from > to || from < 1) {
      alert('正しい回数を入力してください')
      return
    }
    setSaving(true)
    const res = await fetch('/api/teacher/ranking-data', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from_round: from,
        to_round: to,
        label: label || `第${from}回〜第${to}回`,
        mode: activeMode,
      }),
    })
    if (res.ok) {
      setEditing(false)
      onSaved()
    } else {
      alert('保存に失敗しました')
    }
    setSaving(false)
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-gray-800">ランキング集計期間</h2>
          {settings && !editing && (
            <p className="text-sm text-gray-500 mt-0.5">
              {settings.label || `第${settings.from_round}回〜第${settings.to_round}回`}
              <span className="text-gray-400 ml-2">
                （{settings.to_round - settings.from_round + 1}回分）
              </span>
            </p>
          )}
        </div>
        {!editing && (
          <button
            onClick={() => setEditing(true)}
            className="text-sm text-blue-600 border border-blue-300 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg font-medium transition"
          >
            期間を変更
          </button>
        )}
      </div>

      {editing && (
        <div className="space-y-4 pt-2 border-t border-gray-100">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">第</span>
              <input
                type="number"
                min={1}
                value={fromRound}
                onChange={(e) => setFromRound(e.target.value)}
                className="w-20 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-600">回 〜 第</span>
              <input
                type="number"
                min={1}
                value={toRound}
                onChange={(e) => setToRound(e.target.value)}
                className="w-20 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-600">回</span>
            </div>
            {fromRound && toRound &&
              !isNaN(parseInt(fromRound)) && !isNaN(parseInt(toRound)) &&
              parseInt(fromRound) <= parseInt(toRound) && (
                <span className="text-xs text-gray-400">
                  → {parseInt(toRound) - parseInt(fromRound) + 1}回分で集計
                </span>
              )}
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">表示名（任意）</label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={`第${fromRound || '?'}回〜第${toRound || '?'}回`}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="bg-blue-600 text-white px-5 py-2 rounded-xl text-sm font-semibold hover:bg-blue-700 transition disabled:opacity-50"
            >
              {saving ? '保存中...' : '保存して再集計'}
            </button>
            <button
              onClick={() => setEditing(false)}
              className="border border-gray-300 text-gray-600 px-4 py-2 rounded-xl text-sm hover:bg-gray-50 transition"
            >
              キャンセル
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── 各種設定パネル ───────────────────────────────────────────────────────────

function AdvancedSettingsPanel({
  settings,
  activeMode,
  onSaved,
  onClose,
}: {
  settings: Settings | null
  activeMode: 50 | 20
  onSaved: () => void
  onClose: () => void
}) {
  const [rankingType, setRankingType] = useState<'points' | 'score'>('points')
  const [maxRank, setMaxRank] = useState('30')
  const [pointRules, setPointRules] = useState<PointRule[]>(DEFAULT_POINT_RULES)
  const [medalsEnabled, setMedalsEnabled] = useState(true)
  const [medalRules, setMedalRules] = useState<MedalRule[]>(DEFAULT_MEDAL_RULES)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (settings) {
      setRankingType((settings.ranking_type as 'points' | 'score') ?? (activeMode === 20 ? 'score' : 'points'))
      setMaxRank(String(settings.max_rank ?? 30))
      setPointRules(settings.point_rules ?? DEFAULT_POINT_RULES)
      setMedalsEnabled(settings.medals_enabled !== false)
      setMedalRules(settings.medal_rules ?? DEFAULT_MEDAL_RULES)
    }
  }, [settings, activeMode])

  const updateMedalRule = (i: number, field: keyof MedalRule, value: string) => {
    setMedalRules(prev => prev.map((r, idx) => {
      if (idx !== i) return r
      if (field === 'emoji') return { ...r, emoji: value }
      const n = parseInt(value)
      if (isNaN(n) || n < 1) return r
      return { ...r, [field]: n }
    }))
  }
  const removeMedalRule = (i: number) => setMedalRules(prev => prev.filter((_, idx) => idx !== i))
  const addMedalRule = () => setMedalRules(prev => [...prev, { rank_from: 1, rank_to: 1, emoji: '🎖️' }])

  const updateRule = (i: number, field: keyof PointRule, raw: string) => {
    const n = parseInt(raw)
    if (isNaN(n) || n < 0 || n > 100) return
    setPointRules(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: n } : r))
  }
  const updatePoints = (i: number, raw: string) => {
    const n = parseInt(raw)
    if (isNaN(n) || n < 0) return
    setPointRules(prev => prev.map((r, idx) => idx === i ? { ...r, points: n } : r))
  }
  const removeRule = (i: number) => setPointRules(prev => prev.filter((_, idx) => idx !== i))
  const addRule = () => setPointRules(prev => [...prev, { min: 0, max: 0, points: 0 }])

  const handleSave = async () => {
    const maxR = parseInt(maxRank)
    if (isNaN(maxR) || maxR < 1 || maxR > 200) {
      alert('表示順位数は1〜200で入力してください')
      return
    }
    setSaving(true)
    const res = await fetch('/api/teacher/ranking-data', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from_round: settings?.from_round ?? 1,
        to_round: settings?.to_round ?? 1,
        label: settings?.label ?? '',
        mode: activeMode,
        ranking_type: rankingType,
        max_rank: maxR,
        point_rules: rankingType === 'points' ? pointRules : undefined,
        medals_enabled: activeMode === 50 ? medalsEnabled : undefined,
        medal_rules: activeMode === 50 && medalsEnabled ? medalRules : undefined,
      }),
    })
    if (res.ok) {
      onSaved()
      onClose()
    } else {
      alert('保存に失敗しました')
    }
    setSaving(false)
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-5 shadow-md">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-gray-800">
          各種設定 <span className="text-sm text-gray-400 font-normal ml-1">（{activeMode === 50 ? '50問' : '20問'}ランキング）</span>
        </h2>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 text-xl leading-none transition"
          aria-label="閉じる"
        >
          ×
        </button>
      </div>

      <div className="space-y-5 pt-1 border-t border-gray-100">
        {/* ランキング表示方法 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">ランキング表示方法</label>
          <p className="text-xs text-gray-400 mb-3">合計値を「ポイント換算」か「点数そのまま」かを選びます</p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setRankingType('points')}
              className={`flex-1 py-3 rounded-xl text-sm font-semibold border-2 transition ${
                rankingType === 'points'
                  ? 'bg-green-600 text-white border-green-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
              }`}
            >
              ⭐ ポイント（pt）
            </button>
            <button
              type="button"
              onClick={() => setRankingType('score')}
              className={`flex-1 py-3 rounded-xl text-sm font-semibold border-2 transition ${
                rankingType === 'score'
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
              }`}
            >
              📊 点数（点）
            </button>
          </div>
        </div>

        {/* 表示順位数 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">表示順位数</label>
          <p className="text-xs text-gray-400 mb-3">何位まで表示するかを設定します（同率タイはその位内に全員表示）</p>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600">上位</span>
            <input
              type="number"
              min={1}
              max={200}
              value={maxRank}
              onChange={(e) => setMaxRank(e.target.value)}
              className="w-24 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-center font-bold"
            />
            <span className="text-sm text-gray-600">位まで表示</span>
          </div>
        </div>
      </div>

        {/* ポイント割り振り設定（ポイントランキング選択時のみ） */}
        {rankingType === 'points' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">ポイント割り振り設定</label>
            <p className="text-xs text-gray-400 mb-3">
              スコアの範囲（最低点〜最高点）と獲得ポイントを設定します。<br />
              上から順に判定し、最初に当てはまったルールが適用されます。
            </p>
            <div className="space-y-2 mb-3">
              <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr_auto] gap-1.5 items-center text-xs text-gray-400 px-1">
                <span className="text-center">最低点</span>
                <span></span>
                <span className="text-center">最高点</span>
                <span></span>
                <span className="text-center">ポイント</span>
                <span></span>
              </div>
              {pointRules.map((rule, i) => (
                <div key={i} className="grid grid-cols-[1fr_auto_1fr_auto_1fr_auto] gap-1.5 items-center">
                  <input
                    type="number" min={0} max={100} value={rule.min}
                    onChange={(e) => updateRule(i, 'min', e.target.value)}
                    className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <span className="text-gray-400 text-sm text-center">〜</span>
                  <input
                    type="number" min={0} max={100} value={rule.max}
                    onChange={(e) => updateRule(i, 'max', e.target.value)}
                    className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <span className="text-gray-500 text-sm">→</span>
                  <div className="flex items-center gap-1">
                    <input
                      type="number" min={0} value={rule.points}
                      onChange={(e) => updatePoints(i, e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <span className="text-gray-500 text-xs whitespace-nowrap">pt</span>
                  </div>
                  <button
                    onClick={() => removeRule(i)}
                    className="text-red-400 hover:text-red-600 text-lg leading-none px-1 transition"
                    aria-label="削除"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={addRule}
              className="text-sm text-blue-600 border border-blue-300 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition"
            >
              ＋ 行を追加
            </button>
          </div>
        )}

        {/* 勲章機能設定（50問のみ） */}
        {activeMode === 50 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <label className="block text-sm font-medium text-gray-700">勲章機能</label>
                <p className="text-xs text-gray-400 mt-0.5">ランキング確定時に勲章を付与するか設定します</p>
              </div>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setMedalsEnabled(true)}
                  className={`px-4 py-1.5 rounded-lg text-sm font-semibold border-2 transition ${
                    medalsEnabled
                      ? 'bg-yellow-500 text-white border-yellow-500'
                      : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                  }`}
                >
                  ON
                </button>
                <button
                  type="button"
                  onClick={() => setMedalsEnabled(false)}
                  className={`px-4 py-1.5 rounded-lg text-sm font-semibold border-2 transition ${
                    !medalsEnabled
                      ? 'bg-gray-400 text-white border-gray-400'
                      : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                  }`}
                >
                  OFF
                </button>
              </div>
            </div>

            {medalsEnabled && (
              <div>
                <p className="text-xs text-gray-400 mb-3">
                  順位の範囲ごとに付与する絵文字を設定します。<br />
                  範囲外の順位には勲章が付きません。
                </p>
                <div className="space-y-2 mb-3">
                  <div className="grid grid-cols-[2rem_auto_3.5rem_auto_3.5rem_auto] gap-1.5 items-center text-xs text-gray-400 px-1">
                    <span className="text-center">絵文字</span>
                    <span></span>
                    <span className="text-center">開始順位</span>
                    <span></span>
                    <span className="text-center">終了順位</span>
                    <span></span>
                  </div>
                  {medalRules.map((rule, i) => (
                    <div key={i} className="grid grid-cols-[2rem_auto_3.5rem_auto_3.5rem_auto] gap-1.5 items-center">
                      <input
                        type="text"
                        value={rule.emoji}
                        onChange={(e) => updateMedalRule(i, 'emoji', e.target.value)}
                        className="border border-gray-300 rounded-lg px-1 py-1.5 text-base text-center focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <span className="text-gray-400 text-xs text-center">を</span>
                      <input
                        type="number"
                        min={1}
                        value={rule.rank_from}
                        onChange={(e) => updateMedalRule(i, 'rank_from', e.target.value)}
                        className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <span className="text-gray-500 text-sm text-center">〜</span>
                      <input
                        type="number"
                        min={1}
                        value={rule.rank_to}
                        onChange={(e) => updateMedalRule(i, 'rank_to', e.target.value)}
                        className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <button
                        onClick={() => removeMedalRule(i)}
                        className="text-red-400 hover:text-red-600 text-lg leading-none px-1 transition"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  onClick={addMedalRule}
                  className="text-sm text-blue-600 border border-blue-300 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition"
                >
                  ＋ 行を追加
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex gap-2 pt-1">
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-blue-600 text-white px-6 py-2.5 rounded-xl text-sm font-semibold hover:bg-blue-700 transition disabled:opacity-50"
        >
          {saving ? '保存中...' : '保存して再集計'}
        </button>
        <button
          onClick={onClose}
          className="border border-gray-300 text-gray-600 px-4 py-2.5 rounded-xl text-sm hover:bg-gray-50 transition"
        >
          キャンセル
        </button>
      </div>
    </div>
  )
}

// ─── ランキングテーブル ─────────────────────────────────────────────────────

function RankingTable({
  ranking,
  rounds,
  loading,
  is20,
  settings,
}: {
  ranking: RankEntry[]
  rounds: number[]
  loading: boolean
  is20: boolean
  settings: Settings | null
}) {
  const unit = settings?.ranking_type === 'score' ? '点' : (is20 ? '点' : 'pt')
  const noDataMsg = is20
    ? 'テストに「第何回」を設定してください'
    : 'テストに「第何回」を設定し、ポイントが記録されるとここに表示されます'

  const [medalLoading, setMedalLoading] = useState(false)
  const [medalSuccess, setMedalSuccess] = useState(false)
  const [medalError, setMedalError] = useState<string | null>(null)
  // テストネーム修正依頼
  const [requestingId, setRequestingId] = useState<string | null>(null)
  const [requestedIds, setRequestedIds] = useState<Set<string>>(new Set())

  // 全回分に実際にスコアが入っているか判定（50問のみ）
  // rounds.length ではなく、各回に実際に1人以上スコアがある回数で判定する
  const totalExpected = settings ? (settings.to_round - settings.from_round + 1) : 0
  const roundsWithData = rounds.filter(r =>
    ranking.some(entry => entry.roundValues[String(r)] != null)
  )
  const allRoundsFilled = !is20 && totalExpected > 0 && roundsWithData.length >= totalExpected
  const medalsOn = settings?.medals_enabled !== false
  const canAward = medalsOn && allRoundsFilled && !loading && !medalSuccess

  const handleRequestNameChange = async (studentId: string) => {
    setRequestingId(studentId)
    try {
      const res = await fetch('/api/teacher/request-test-name-change', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id: studentId }),
      })
      if (res.ok) {
        setRequestedIds((prev) => new Set([...prev, studentId]))
      }
    } catch {
      // 無視
    } finally {
      setRequestingId(null)
    }
  }

  const handleAwardMedal = async () => {
    if (!settings) return
    if (!confirm(`第${settings.from_round}回〜第${settings.to_round}回の勲章を確定します。\nよろしいですか？`)) return
    setMedalLoading(true)
    setMedalError(null)
    try {
      const res = await fetch('/api/teacher/medals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from_round: settings.from_round,
          to_round: settings.to_round,
          preview: false,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMedalError(data.error ?? 'エラーが発生しました')
      } else {
        setMedalSuccess(true)
      }
    } catch {
      setMedalError('通信エラーが発生しました')
    } finally {
      setMedalLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-4">
        <h2 className="font-semibold text-gray-800">
          個人ランキング（上位{settings?.max_rank ?? 30}名）
        </h2>
        {!is20 && medalsOn && (
          <div className="flex items-center gap-3">
            {medalSuccess && (
              <span className="text-green-600 text-sm font-medium">✅ 勲章を付与しました！</span>
            )}
            {medalError && (
              <span className="text-red-500 text-sm">{medalError}</span>
            )}
            <button
              onClick={handleAwardMedal}
              disabled={!canAward || medalLoading}
              title={!allRoundsFilled ? `全${totalExpected}回分のスコアが揃うとアクティブになります（現在${roundsWithData.length}回分）` : ''}
              className={`px-4 py-2 rounded-xl text-sm font-bold transition whitespace-nowrap ${
                canAward
                  ? 'bg-yellow-500 text-white hover:bg-yellow-600 cursor-pointer'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}
            >
              {medalLoading ? '処理中...' : '👑 勲章を確定させる'}
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="py-12 text-center text-gray-400">読み込み中...</div>
      ) : ranking.length === 0 ? (
        <div className="py-12 text-center text-gray-400">
          <p>該当するデータがありません</p>
          <p className="text-xs mt-1">{noDataMsg}</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="px-3 py-3 text-center w-14">順位</th>
                <th className="px-3 py-3 text-left">テストネーム</th>
                {rounds.map((r) => (
                  <th key={r} className="px-3 py-3 text-right whitespace-nowrap">
                    第{r}回
                  </th>
                ))}
                <th className="px-3 py-3 text-right font-bold">合計</th>
                <th className="px-3 py-3 text-left">クラス</th>
                <th className="px-3 py-3 text-left">名前</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {ranking.map((r) => {
                const bg =
                  r.rank === 1
                    ? 'bg-yellow-50'
                    : r.rank === 2
                    ? 'bg-gray-50'
                    : r.rank === 3
                    ? 'bg-amber-50'
                    : ''
                const rankColor =
                  r.rank === 1
                    ? 'text-yellow-500 text-base'
                    : r.rank === 2
                    ? 'text-gray-400'
                    : r.rank === 3
                    ? 'text-amber-600'
                    : 'text-gray-400 text-xs'
                return (
                  <tr key={r.student_id} className={`hover:bg-gray-50 ${bg}`}>
                    <td className="px-3 py-3 text-center">
                      <span className={`font-bold ${rankColor}`}>{r.rank}位</span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-gray-700 font-medium">{r.test_name}</span>
                        {requestedIds.has(r.student_id) ? (
                          <span className="text-xs text-orange-500 font-medium whitespace-nowrap">依頼済</span>
                        ) : (
                          <button
                            onClick={() => handleRequestNameChange(r.student_id)}
                            disabled={requestingId === r.student_id}
                            className="text-xs text-gray-400 border border-gray-300 px-1.5 py-0.5 rounded hover:text-orange-600 hover:border-orange-400 transition whitespace-nowrap disabled:opacity-50"
                            title="テストネームの変更を依頼する"
                          >
                            {requestingId === r.student_id ? '...' : '修正依頼'}
                          </button>
                        )}
                      </div>
                    </td>
                    {rounds.map((round) => (
                      <td key={round} className="px-3 py-3 text-right text-gray-600">
                        {r.roundValues[String(round)] != null
                          ? `${r.roundValues[String(round)]}${unit}`
                          : '-'}
                      </td>
                    ))}
                    <td className="px-3 py-3 text-right font-bold text-blue-600">
                      {r.total}{unit}
                    </td>
                    <td className="px-3 py-3 text-gray-600">{r.class_name}</td>
                    <td className="px-3 py-3 text-gray-700">{r.name}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── クラス平均点グラフ ─────────────────────────────────────────────────────

function ClassAveragesChart({
  classAverages,
  rounds,
  loading,
  is20,
}: {
  classAverages: ClassAvg[]
  rounds: number[]
  loading: boolean
  is20: boolean
}) {
  if (loading || classAverages.length === 0) return null

  // Recharts 用データ形式に変換: [{ name: '第1回', A組: 85.5, B組: 78.2 }, ...]
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
    <div className="bg-white rounded-2xl border border-gray-200 p-5">
      <h2 className="font-semibold text-gray-800 mb-4">クラス別平均点推移</h2>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" />
          <YAxis domain={[0, is20 ? 20 : 100]} />
          <Tooltip />
          <Legend />
          {allClasses.map((cls, i) => (
            <Line
              key={cls}
              type="monotone"
              dataKey={cls}
              stroke={COLORS[i % COLORS.length]}
              strokeWidth={2}
              dot={{ r: 4 }}
              activeDot={{ r: 6 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// ─── メインコンポーネント ─────────────────────────────────────────────────────

export default function PointsPage() {
  const [activeTab, setActiveTab] = useState<50 | 20>(50)
  const [data50, setData50] = useState<RankingData>({ settings: null, rounds: [], ranking: [], classAverages: [] })
  const [data20, setData20] = useState<RankingData>({ settings: null, rounds: [], ranking: [], classAverages: [] })
  const [loading50, setLoading50] = useState(true)
  const [loading20, setLoading20] = useState(true)
  const [showAdvanced, setShowAdvanced] = useState(false)

  const fetchData = async (mode: 50 | 20) => {
    const setter = mode === 50 ? setData50 : setData20
    const loadSetter = mode === 50 ? setLoading50 : setLoading20
    loadSetter(true)
    const res = await fetch(`/api/teacher/ranking-data?mode=${mode}`, { cache: 'no-store' })
    if (res.ok) {
      const json = await res.json()
      setter({
        settings: json.settings ?? null,
        rounds: json.rounds ?? [],
        ranking: json.ranking ?? [],
        classAverages: json.classAverages ?? [],
      })
    }
    loadSetter(false)
  }

  useEffect(() => {
    fetchData(50)
    fetchData(20)
  }, [])

  const activeData = activeTab === 50 ? data50 : data20
  const activeLoading = activeTab === 50 ? loading50 : loading20

  const handleDownload = () => {
    const { ranking, rounds, settings } = activeData
    const unit = settings?.ranking_type === 'score' ? '点' : (activeTab === 20 ? '点' : 'pt')

    const rows = ranking.map((r) => {
      const base: Record<string, string | number> = {
        順位: r.rank,
        テストネーム: r.test_name,
      }
      for (const round of rounds) {
        base[`第${round}回`] =
          r.roundValues[String(round)] != null
            ? `${r.roundValues[String(round)]}${unit}`
            : '-'
      }
      base['合計'] = `${r.total}${unit}`
      base['クラス'] = r.class_name
      base['名前'] = r.name
      return base
    })

    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(rows)
    const sheetName = activeTab === 50 ? '50問ポイントランキング' : '20問スコアランキング'
    XLSX.utils.book_append_sheet(wb, ws, sheetName)
    XLSX.writeFile(wb, `${sheetName}_${settings?.label ?? ''}.xlsx`)
  }

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">ランキング管理</h1>
        <div className="flex gap-2">
          {activeTab === 50 && data50.ranking.length > 0 && (
            <a
              href="/api/teacher/ranking-excel"
              download
              className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 transition flex items-center gap-1.5"
            >
              📊 掲示用Excelダウンロード
            </a>
          )}
          {activeData.ranking.length > 0 && (
            <button
              onClick={handleDownload}
              className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-xl text-sm font-medium hover:bg-gray-50 transition"
            >
              Excelダウンロード
            </button>
          )}
        </div>
      </div>

      {/* タブ + 各種設定ボタン */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setActiveTab(50)}
          className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${
            activeTab === 50
              ? 'bg-blue-600 text-white'
              : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}
        >
          ⚡ 50問ポイントランキング
        </button>
        <button
          onClick={() => setActiveTab(20)}
          className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${
            activeTab === 20
              ? 'bg-emerald-600 text-white'
              : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}
        >
          📄 20問スコアランキング
        </button>
        <button
          onClick={() => setShowAdvanced((v) => !v)}
          className={`ml-auto px-4 py-2 rounded-xl text-sm font-semibold border transition flex items-center gap-1.5 ${
            showAdvanced
              ? 'bg-gray-700 text-white border-gray-700'
              : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
          }`}
        >
          ⚙️ 各種設定
        </button>
      </div>

      {/* 各種設定パネル */}
      {showAdvanced && (
        <AdvancedSettingsPanel
          settings={activeData.settings}
          activeMode={activeTab}
          onSaved={() => fetchData(activeTab)}
          onClose={() => setShowAdvanced(false)}
        />
      )}

      {/* 集計期間設定 */}
      <SettingsPanel
        settings={activeData.settings}
        activeMode={activeTab}
        onSaved={() => fetchData(activeTab)}
      />

      {/* ポイント早見表（50問かつポイントランキングのみ） */}
      {activeTab === 50 && activeData.settings?.ranking_type !== 'score' && (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-2.5 bg-green-700">
            <p className="text-xs font-bold text-white">ポイント早見表</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-center text-sm">
              <thead>
                <tr className="bg-green-600 text-white">
                  {(activeData.settings?.point_rules ?? DEFAULT_POINT_RULES)
                    .slice().sort((a, b) => b.min - a.min)
                    .map((r) => (
                      <th key={`${r.min}-${r.max}`} className="px-2 py-2 font-medium whitespace-nowrap border-r border-green-500 last:border-r-0 text-xs">
                        {ruleLabel(r)}
                      </th>
                    ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  {(activeData.settings?.point_rules ?? DEFAULT_POINT_RULES)
                    .slice().sort((a, b) => b.min - a.min)
                    .map((r) => (
                      <td key={`pt-${r.min}-${r.max}`} className="px-2 py-3 font-bold text-green-700 text-base border-r border-gray-100 last:border-r-0">
                        {r.points}p
                      </td>
                    ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* クラス平均点グラフ */}
      <ClassAveragesChart
        classAverages={activeData.classAverages}
        rounds={activeData.rounds}
        loading={activeLoading}
        is20={activeTab === 20}
      />

      {/* ランキングテーブル */}
      <RankingTable
        ranking={activeData.ranking}
        rounds={activeData.rounds}
        loading={activeLoading}
        is20={activeTab === 20}
        settings={activeData.settings}
      />
    </div>
  )
}
