import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { calcPoints, canSeeResult } from '@/lib/supabase/types'
import PracticeButton from './PracticeButton'

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
  // 練習セッションは is_practice=true で識別
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

  const DEFAULT_TEACHER_MESSAGE = '「単語・熟語の勉強は前日にちょっと頑張って７割取った！」みたいな勉強では短期記憶で身に付きません。スパイラルで繰り返して繰り返して勉強するしか知識として身に付きません。満点が取れるくらい繰り返して勉強してください。'

  // デフォルトメッセージをsettingsテーブルから取得
  const { data: settingsData } = await admin
    .from('settings')
    .select('value')
    .eq('key', 'teacher_message')
    .maybeSingle()
  const defaultMessage = settingsData?.value ?? DEFAULT_TEACHER_MESSAGE

  const test = session.tests as {
    id: string; title: string; mode: number; status: string; pass_score: number | null; teacher_message: string | null
  }
  const isPractice = (session as { is_practice?: boolean }).is_practice === true

  // 練習セッションは公開状態に関わらず閲覧可能
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!isPractice && !canSeeResult(test as any, student.class_name, student.id)) {
    redirect('/student/waiting-result')
  }

  const score = session.score ?? 0
  const mode = test.mode as 50 | 300
  const passed = test.pass_score !== null ? score >= test.pass_score : null
  // 練習モードではpt表示なし
  const pointsEarned = mode === 50 && !isPractice ? calcPoints(score) : null

  return (
    <div className="min-h-screen bg-blue-50 flex flex-col items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-sm overflow-hidden">
        {/* ヘッダー */}
        <div className={`p-6 text-center ${
          passed === true ? 'bg-green-500' :
          passed === false ? 'bg-red-400' :
          'bg-blue-600'
        } text-white`}>
          {isPractice && (
            <div className="mb-2 inline-block bg-white/20 text-white text-xs font-bold px-3 py-1 rounded-full">
              🔄 練習モード
            </div>
          )}
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
              pointsEarned >= 7 ? 'bg-yellow-50 border border-yellow-200' :
              pointsEarned >= 4 ? 'bg-blue-50 border border-blue-200' :
              pointsEarned > 0 ? 'bg-green-50 border border-green-200' :
              'bg-gray-50 border border-gray-200'
            }`}>
              {pointsEarned === 10 ? (
                <p className="text-yellow-700 font-bold">パーフェクト！ +10pt</p>
              ) : pointsEarned >= 7 ? (
                <p className="text-yellow-700 font-medium">素晴らしい！ +{pointsEarned}pt</p>
              ) : pointsEarned >= 4 ? (
                <p className="text-blue-700 font-medium">よくできました +{pointsEarned}pt</p>
              ) : pointsEarned > 0 ? (
                <p className="text-green-700 font-medium">ポイント獲得 +{pointsEarned}pt</p>
              ) : (
                <p className="text-gray-500 text-sm">72点以上でポイントが獲得できます</p>
              )}
            </div>
          )}

          {/* ポイント早見表（50問モードのみ） */}
          {pointsEarned !== null && (() => {
            // 50問×2点のため偶数点のみ存在する
            const table = [
              { label: '100点',    min: 100, max: 100, pts: 10 },
              { label: '96〜98点', min: 96,  max: 98,  pts: 7  },
              { label: '92〜94点', min: 92,  max: 94,  pts: 6  },
              { label: '88〜90点', min: 88,  max: 90,  pts: 5  },
              { label: '84〜86点', min: 84,  max: 86,  pts: 4  },
              { label: '80〜82点', min: 80,  max: 82,  pts: 3  },
              { label: '76〜78点', min: 76,  max: 78,  pts: 2  },
              { label: '72〜74点', min: 72,  max: 74,  pts: 1  },
              { label: '70点以下', min: 0,   max: 70,  pts: 0  },
            ]
            return (
              <div className="space-y-3">
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
                            <td className="px-3 py-2 text-center text-xs" style={isMyRow ? {} : { color: 'transparent' }}>
                              ← あなた
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

                {/* 先生からのメッセージ */}
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <p className="text-xs text-amber-800 leading-relaxed">
                    {test.teacher_message ?? defaultMessage}
                  </p>
                </div>
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
            <PracticeButton testId={test.id} />
            {!isPractice && (
              <Link
                href="/student/ranking"
                className="block w-full bg-white border border-gray-200 text-gray-700 py-3 rounded-xl font-semibold text-center hover:bg-gray-50 transition"
              >
                ランキングを見る
              </Link>
            )}
            {isPractice ? (
              <Link
                href="/student/practice"
                className="block w-full text-center text-amber-600 py-2 text-sm hover:text-amber-800 transition"
              >
                練習の結果一覧に戻る
              </Link>
            ) : (
              <Link
                href="/student/results"
                className="block w-full text-center text-gray-400 py-2 text-sm hover:text-gray-600 transition"
              >
                テスト結果一覧に戻る
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
