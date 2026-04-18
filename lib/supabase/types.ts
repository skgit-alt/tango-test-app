export type TestMode = 50 | 300
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
  current_page: number
  created_at: string
}

export interface Answer {
  id: string
  session_id: string
  question_id: string
  selected_answer: number | null
  is_correct: boolean | null
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

// ポイント換算
export function calcPoints(score: number): number {
  if (score === 100) return 10
  if (score >= 96) return 7
  if (score >= 92) return 6
  if (score >= 88) return 5
  if (score >= 84) return 4
  if (score >= 80) return 3
  if (score >= 76) return 2
  if (score >= 72) return 1
  return 0
}
