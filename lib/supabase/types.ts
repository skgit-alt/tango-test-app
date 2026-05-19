export type TestMode = number
export type TestStatus = 'waiting' | 'open' | 'finished' | 'published'
export type CheatEventType = 'tab_leave' | 'app_switch' | 'split_view'

export interface Admin {
  id: string
  email: string
  created_at: string
}

export interface Student {
  id: string
  student_id: string
  name: string
  class_name: string
  seat_number: number
  test_name: string | null
  must_change_password: boolean
  must_change_test_name: boolean
  created_at: string
}

export interface Test {
  id: string
  title: string
  mode: TestMode
  status: TestStatus
  time_limit: number
  pass_score: number | null
  opened_at: string | null
  published_at: string | null
  created_at: string
  open_classes: string[] | null
  round_number: number | null
  scheduled_at: string | null
  published_classes: string[] | null
  published_student_ids: string[] | null
  teacher_message: string | null
  scheduled_class_starts: Record<string, string> | null
  cheats_confirmed_at: string | null
}

/** 生徒がテスト結果を閲覧できるか判定 */
export function canSeeResult(
  test: Pick<Test, 'status' | 'published_classes' | 'published_student_ids'>,
  studentClass: string,
  studentId: string
): boolean {
  // 全員一括公開
  if (test.status === 'published') return true
  // クラス別・個人別公開（テストステータスに関わらず、明示的に公開されていれば閲覧可）
  if ((test.published_classes ?? []).includes(studentClass)) return true
  if ((test.published_student_ids ?? []).includes(studentId)) return true
  return false
}

export interface RankingSettings {
  id: number
  from_round: number
  to_round: number
  label: string
  updated_at: string
}

export interface Question {
  id: string
  test_id: string
  order_num: number
  question_text: string
  choice1: string
  choice2: string
  choice3: string
  choice4: string
  choice5: string | null
  correct_answer: number
  points: number
}

export interface Session {
  id: string
  test_id: string
  student_id: string
  started_at: string | null
  submitted_at: string | null
  score: number | null
  is_submitted: boolean
  is_absent: boolean
  is_practice: boolean
  current_page: number
  created_at: string
}

export interface Answer {
  id: string
  session_id: string
  question_id: string
  selected_answer: number | null
  is_correct: boolean | null
  flagged: boolean
}

export interface CheatLog {
  id: string
  session_id: string
  event_type: CheatEventType
  occurred_at: string
}

export interface Point {
  id: string
  student_id: string
  test_id: string
  score: number
  points_earned: number
  cycle: number
  created_at: string
}

// ポイント換算ルールの型
export interface PointRule {
  min: number    // このルールが適用されるスコアの下限
  max: number    // このルールが適用されるスコアの上限
  points: number // 獲得ポイント
}

// 勲章ルールの型
export interface MedalRule {
  rank_from: number  // 適用開始順位
  rank_to: number    // 適用終了順位
  emoji: string      // 表示する絵文字
}

// デフォルトの勲章ルール
export const DEFAULT_MEDAL_RULES: MedalRule[] = [
  { rank_from: 1, rank_to: 1,  emoji: '👑' },
  { rank_from: 2, rank_to: 30, emoji: '🎖️' },
]

// 勲章ルールからemoji文字列を取得（マッチしない場合は空文字）
export function getMedalEmoji(rank: number, rules: MedalRule[]): string {
  const rule = rules.find(r => rank >= r.rank_from && rank <= r.rank_to)
  return rule?.emoji ?? ''
}

// デフォルトのポイントルール（設定未登録のときに使用）
export const DEFAULT_POINT_RULES: PointRule[] = [
  { min: 100, max: 100, points: 10 },
  { min: 96,  max: 99,  points: 7  },
  { min: 92,  max: 95,  points: 6  },
  { min: 88,  max: 91,  points: 5  },
  { min: 84,  max: 87,  points: 4  },
  { min: 80,  max: 83,  points: 3  },
  { min: 76,  max: 79,  points: 2  },
  { min: 72,  max: 75,  points: 1  },
  { min: 0,   max: 71,  points: 0  },
]

// カスタムルールでポイントを計算（上から順に最初にマッチしたルールを使用）
export function calcPointsFromRules(score: number, rules: PointRule[]): number {
  for (const rule of rules) {
    if (score >= rule.min && score <= rule.max) return rule.points
  }
  return 0
}

// 後方互換のためデフォルトルールで計算する関数を残す
export function calcPoints(score: number): number {
  return calcPointsFromRules(score, DEFAULT_POINT_RULES)
}

// PointRuleから早見表ラベルを生成する
export function ruleLabel(rule: PointRule): string {
  if (rule.min === rule.max) return `${rule.min}点`
  if (rule.min === 0) return `${rule.max}点以下`
  return `${rule.max}〜${rule.min}点`
}
