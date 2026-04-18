import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { calcPoints, canSeeResult } from '@/lib/supabase/types'

export default async function ResultPage({
  searchParams,
}: {
  searchParams: Promise<{ sessionId?: string }>
}) {
  const { sessionId } = await searchParams

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/auth/login')

  const admin = createAdminClient()

  const { data: student } = await admin
    .from('students')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!student) redirect('/auth/login')

  // sessionIdが指定されていればそのセッションを、なければ最新を取得
  // is_submitted=true に限定しない（RPCやRLSの問題で未設定のまま終了した古いデータも拾う）
  let query = admin
    .from('sessions')
    .select('*, tests(*)')
    .eq('student_id', student.id)

  if (sessionId) {
    query = query.eq('id', sessionId)
  } else {
    // 提出済みを優先しつつ、なければ最後に開始したセッションを取得
    query = query.order('is_submitted', { ascending: false }).order('started_at', { ascending: false }).limit(1)
  }

  const { data: session } = await query.maybeSingle()

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-blue-50 p-4">
        <div className="bg-white rounded-2xl shadow p-8 text-center max-w-sm w-full space-y-3">
          <div className="text-4xl">📋</div>
          <p className="text-gray-600">まだ結果がありません</p>
          <a href="/student" className="text-blue-600 text-sm hover:underline">ホームに戻る</a>
        </div>
      </div>
    )
  }

  const test = session.tests as {
    id: string; title: string; mode: number; status: string; pass_score: number | null
  }

  if (!canSeeResult(test, student.class_name, student.id)) {
    redirect('/student/waiting-result')
  }

  const score = session.score ?? 0
  const mode = test.mode as 50 | 300
  const passed = test.pass_score !== null ? score >= test.pass_score : null
  const pointsEarned = mode === 50 ? calcPoints(score) : null

  return (
    <div className="min-h-screen bg-blue-50 flex flex-col items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-sm overflow-hidden">
        {/* ヘッダー */}
        <div className={`p-6 text-center ${
          passed === true ? 'bg-green-500' :
          passed === false ? 'bg-red-400' :
          'bg-blue-600'
        } text-white`}>
          <p className="text-sm font-medium opacity-90 mb-1">{test.title}</p>
          <h1 className="text-5xl font-bold">{score}</h1>
          <p className="text-lg opacity-90 mt-1">点</p>
          {passed !== null && (
            <div className={`mt-3 inline-block px-4 py-1 rounded-full text-sm font-bold ${
              passed ? 'bg-white text-green-600' : 'bg-white text-red-500'
            }`}>
              {passed ? '合格' : '不合格'}
            </div>
          )}
        </div>

        {/* 詳細 */}
        <div className="p-6 space-y-4">
          {/* 生徒情報 */}
          <div className="bg-gray-50 rounded-xl p-4 space-y-1">
            <p className="text-xs text-gray-400">受験者</p>
            <p className="font-bold text-gray-800">{student.name}</p>
            <p className="text-sm text-gray-500">{student.class_name} &nbsp; {student.seat_number}番</p>
          </div>

          {/* スコア詳細 */}
          <div className="space-y-3">
            <div className="flex justify-between items-center py-2 border-b border-gray-100">
              <span className="text-gray-600 text-sm">合計点</span>
              <span className="font-bold text-gray-800 text-lg">{score}点</span>
            </div>

            {test.pass_score !== null && (
              <div className="flex justify-between items-center py-2 border-b border-gray-100">
                <span className="text-gray-600 text-sm">合格点</span>
                <span className="text-gray-700">{test.pass_score}点以上</span>
              </div>
            )}

            {pointsEarned !== null && (
              <div className="flex justify-between items-center py-2 border-b border-gray-100">
                <span className="text-gray-600 text-sm">獲得ポイント</span>
                <span className="font-bold text-blue-600 text-lg">{pointsEarned}pt</span>
              </div>
            )}

            <div className="flex justify-between items-center py-2 border-b border-gray-100">
              <span className="text-gray-600 text-sm">提出時刻</span>
              <span className="text-gray-500 text-sm">
                {session.submitted_at
                  ? new Date(session.submitted_at).toLocaleTimeString('ja-JP')
                  : '-'}
              </span>
            </div>
          </div>

          {/* ポイントメッセージ */}
          {pointsEarned !== null && (
            <div className={`rounded-xl p-4 text-center ${
              pointsEarned >= 8 ? 'bg-yellow-50 border border-yellow-200' :
              pointsEarned >= 4 ? 'bg-blue-50 border border-blue-200' :
              pointsEarned > 0 ? 'bg-green-50 border border-green-200' :
              'bg-gray-50 border border-gray-200'
            }`}>
              {pointsEarned === 12 ? (
                <p className="text-yellow-700 font-bold">パーフェクト！ +12pt</p>
              ) : pointsEarned >= 8 ? (
                <p className="text-yellow-700 font-medium">素晴らしい！ +{pointsEarned}pt</p>
              ) : pointsEarned >= 4 ? (
                <p className="text-blue-700 font-medium">よくできました +{pointsEarned}pt</p>
              ) : pointsEarned > 0 ? (
                <p className="text-green-700 font-medium">ポイント獲得 +{pointsEarned}pt</p>
              ) : (
                <p className="text-gray-500 text-sm">84点以上でポイントが獲得できます</p>
              )}
            </div>
          )}

          {/* ポイント早見表（50問モードのみ） */}
          {pointsEarned !== null && (() => {
            // 50問×2点のため偶数点のみ存在する
            const table = [
              { label: '100点',   min: 100, max: 100, pts: 12 },
              { label: '98点',    min: 98,  max: 98,  pts: 8  },
              { label: '96点',    min: 96,  max: 96,  pts: 7  },
              { label: '94点',    min: 94,  max: 94,  pts: 6  },
              { label: '92点',    min: 92,  max: 92,  pts: 5  },
              { label: '90点',    min: 90,  max: 90,  pts: 4  },
              { label: '88点',    min: 88,  max: 88,  pts: 3  },
              { label: '86点',    min: 86,  max: 86,  pts: 2  },
              { label: '84点',    min: 84,  max: 84,  pts: 1  },
              { label: '82点以下', min: 0,  max: 82,  pts: 0  },
            ]
            return (
              <div className="rounded-xl border border-gray-200 overflow-hidden">
                <p className="text-xs font-bold text-gray-500 px-3 py-2 bg-gray-50 border-b border-gray-200">
                  ⭐ ポイント早見表
                </p>
                <table className="w-full text-sm">
                  <tbody>
                    {table.map((row) => {
                      const isMyRow = score >= row.min && score <= row.max
                      return (
                        <tr
                          key={row.label}
                          className={isMyRow
                            ? 'bg-blue-600 text-white font-bold'
                            : 'border-b border-gray-100 text-gray-700'}
                        >
                          <td className="px-3 py-2">{row.label}</td>
                          <td className="px-3 py-2 text-center text-gray-400 text-xs">
                            {isMyRow ? '← あなた' : ''}
                          </td>
                          <td className="px-3 py-2 text-right font-semibold">
                            {row.pts > 0 ? `+${row.pts}pt` : '0pt'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )
          })()}

          {/* アクションボタン */}
          <div className="space-y-2 pt-2">
            <Link
              href={`/student/review?sessionId=${session.id}`}
              className="block w-full bg-blue-600 text-white py-3 rounded-xl font-semibold text-center hover:bg-blue-700 transition"
            >
              回答を確認する
            </Link>
            <Link
              href="/student/ranking"
              className="block w-full bg-white border border-gray-200 text-gray-700 py-3 rounded-xl font-semibold text-center hover:bg-gray-50 transition"
            >
              ランキングを見る
            </Link>
            <Link
              href="/student"
              className="block w-full text-center text-gray-400 py-2 text-sm hover:text-gray-600 transition"
            >
              ホームに戻る
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
