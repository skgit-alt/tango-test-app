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
  email: string
  name: string
  class_name: string
  seat_number: number
  test_name: string | null
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
  if (score === 100) return 12
  if (score >= 98) return 8
  if (score >= 96) return 7
  if (score >= 94) return 6
  if (score >= 92) return 5
  if (score >= 90) return 4
  if (score >= 88) return 3
  if (score >= 86) return 2
  if (score >= 84) return 1
  return 0
}
