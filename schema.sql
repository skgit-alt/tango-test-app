-- ============================================================
-- 単語テストアプリ データベーススキーマ
--
-- 使い方：
-- 1. Supabaseダッシュボードの SQL Editor を開く
-- 2. このファイルの内容を全コピーして貼り付け
-- 3. 「Run」ボタンを押す
-- ============================================================

-- uuid 生成に必要な拡張機能を有効化
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- テーブル作成
-- ============================================================

-- 管理者テーブル（先生アカウント）
CREATE TABLE IF NOT EXISTS admins (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email       TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  role        TEXT NOT NULL DEFAULT 'teacher'
);

-- 生徒テーブル
CREATE TABLE IF NOT EXISTS students (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                  TEXT NOT NULL,
  class_name            TEXT NOT NULL,
  seat_number           INTEGER NOT NULL,
  test_name             TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  student_id            TEXT NOT NULL,
  must_change_password  BOOLEAN NOT NULL DEFAULT true,
  must_change_test_name BOOLEAN DEFAULT false
);

-- テストテーブル
CREATE TABLE IF NOT EXISTS tests (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title                   TEXT NOT NULL,
  mode                    INTEGER NOT NULL,
  status                  TEXT NOT NULL DEFAULT 'waiting',
  time_limit              INTEGER NOT NULL,
  pass_score              INTEGER,
  opened_at               TIMESTAMPTZ,
  published_at            TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  open_classes            TEXT[] DEFAULT '{}',
  round_number            INTEGER,
  scheduled_at            TIMESTAMPTZ,
  published_classes       TEXT[],
  published_student_ids   TEXT[],
  teacher_message         TEXT,
  scheduled_class_starts  JSONB DEFAULT '{}',
  cheats_confirmed_at     TIMESTAMPTZ
);

-- 問題テーブル
CREATE TABLE IF NOT EXISTS questions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  test_id         UUID NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  order_num       INTEGER NOT NULL,
  question_text   TEXT NOT NULL,
  choice1         TEXT NOT NULL,
  choice2         TEXT NOT NULL,
  choice3         TEXT NOT NULL,
  choice4         TEXT NOT NULL,
  choice5         TEXT,
  correct_answer  INTEGER NOT NULL,
  points          INTEGER NOT NULL DEFAULT 1
);

-- セッションテーブル（生徒ごとの受験記録）
CREATE TABLE IF NOT EXISTS sessions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  test_id         UUID NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  student_id      UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  started_at      TIMESTAMPTZ,
  submitted_at    TIMESTAMPTZ,
  score           INTEGER,
  is_submitted    BOOLEAN NOT NULL DEFAULT false,
  current_page    INTEGER NOT NULL DEFAULT 1,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  device_token    TEXT,
  device_token_at TIMESTAMPTZ,
  is_absent       BOOLEAN DEFAULT false,
  is_practice     BOOLEAN DEFAULT false
);

-- 回答テーブル
CREATE TABLE IF NOT EXISTS answers (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id      UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  question_id     UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  selected_answer INTEGER,
  is_correct      BOOLEAN,
  flagged         BOOLEAN DEFAULT false,
  UNIQUE (session_id, question_id)
);

-- 不正行為ログテーブル
CREATE TABLE IF NOT EXISTS cheat_logs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id  UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  event_type  TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ポイントテーブル
CREATE TABLE IF NOT EXISTS points (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id    UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  test_id       UUID NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  score         INTEGER NOT NULL,
  points_earned INTEGER NOT NULL DEFAULT 0,
  cycle         INTEGER NOT NULL DEFAULT 1,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- メダルテーブル（ランキング上位者）
CREATE TABLE IF NOT EXISTS medals (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  rank        INTEGER NOT NULL,
  from_round  INTEGER NOT NULL,
  to_round    INTEGER NOT NULL,
  awarded_at  TIMESTAMPTZ DEFAULT now()
);

-- ランキング設定テーブル
CREATE TABLE IF NOT EXISTS ranking_settings (
  id            INTEGER PRIMARY KEY DEFAULT 1,
  from_round    INTEGER NOT NULL DEFAULT 1,
  to_round      INTEGER NOT NULL DEFAULT 5,
  label         TEXT DEFAULT '第1回〜第5回',
  updated_at    TIMESTAMPTZ DEFAULT now(),
  ranking_type  TEXT NOT NULL DEFAULT 'points',  -- 'points' or 'score'
  max_rank      INTEGER NOT NULL DEFAULT 30,      -- 何位まで表示するか
  point_rules   JSONB                             -- ポイント割り振りルール（NULLの場合はデフォルト適用）
);

-- アプリ設定テーブル（汎用キーバリュー）
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- テストネーム変更申請テーブル
CREATE TABLE IF NOT EXISTS test_name_change_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id      UUID REFERENCES students(id) ON DELETE CASCADE,
  current_name    TEXT NOT NULL,
  requested_name  TEXT NOT NULL,
  status          TEXT DEFAULT 'pending',
  created_at      TIMESTAMPTZ DEFAULT now(),
  resolved_at     TIMESTAMPTZ,
  reject_reason   TEXT
);

-- ============================================================
-- 初期データ
-- ============================================================

-- ランキング設定の初期レコード
-- id=1: 50問ポイントランキング, id=2: 20問スコアランキング
INSERT INTO ranking_settings (id, from_round, to_round, label, ranking_type, max_rank)
VALUES
  (1, 1, 5, '第1回〜第5回', 'points', 30),
  (2, 1, 5, '第1回〜第5回', 'score',  30)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- ビュー
-- ============================================================

-- 不正行為ログ詳細ビュー（テスト名・クラス・生徒名付き）
CREATE OR REPLACE VIEW v_cheat_log_detail AS
SELECT
  cl.id,
  t.title AS test_title,
  st.class_name,
  st.name,
  st.test_name,
  cl.event_type,
  cl.occurred_at
FROM cheat_logs cl
JOIN sessions s  ON s.id  = cl.session_id
JOIN students st ON st.id = s.student_id
JOIN tests t     ON t.id  = s.test_id
ORDER BY cl.occurred_at DESC;

-- テスト進捗ビュー（管理画面のリアルタイム状況確認用）
CREATE OR REPLACE VIEW v_test_progress AS
SELECT
  t.id AS test_id,
  t.title,
  t.mode,
  t.status,
  s.id AS session_id,
  st.class_name,
  st.seat_number,
  st.name,
  st.test_name,
  s.started_at,
  s.submitted_at,
  s.score,
  s.is_submitted,
  s.current_page,
  (SELECT count(*) FROM cheat_logs cl WHERE cl.session_id = s.id) AS cheat_count
FROM tests t
JOIN sessions s  ON s.test_id = t.id
JOIN students st ON st.id     = s.student_id;

-- テストランキングビュー（50問テストの順位）
CREATE OR REPLACE VIEW v_test_ranking AS
SELECT
  t.id AS test_id,
  t.title,
  st.test_name,
  s.score,
  p.points_earned,
  rank() OVER (PARTITION BY t.id ORDER BY s.score DESC) AS rank
FROM sessions s
JOIN students st ON st.id    = s.student_id
JOIN tests t     ON t.id     = s.test_id
LEFT JOIN points p ON p.student_id = s.student_id AND p.test_id = s.test_id
WHERE s.is_submitted = true
  AND t.mode = 50
  AND t.status = 'published'
ORDER BY t.id, rank() OVER (PARTITION BY t.id ORDER BY s.score DESC);

-- 累計ランキングビュー（現在のサイクルの合計ポイント順位）
CREATE OR REPLACE VIEW v_cumulative_ranking AS
SELECT
  st.test_name,
  sum(p.points_earned) AS total_points,
  p.cycle,
  rank() OVER (PARTITION BY p.cycle ORDER BY sum(p.points_earned) DESC) AS rank
FROM points p
JOIN students st ON st.id = p.student_id
WHERE p.cycle = (SELECT max(cycle) FROM points)
GROUP BY st.test_name, p.cycle
ORDER BY sum(p.points_earned) DESC;

-- ============================================================
-- Row Level Security (RLS) の設定
--
-- このアプリはサービスロールキー（admin client）でRLSをバイパスする設計のため、
-- RLSは基本的にオフでも動作します。
-- セキュリティを強化したい場合は別途ポリシーを設定してください。
-- ============================================================
