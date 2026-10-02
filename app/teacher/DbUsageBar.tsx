const SQL_SETUP = `CREATE OR REPLACE FUNCTION public.get_db_size_bytes()
RETURNS bigint LANGUAGE sql SECURITY DEFINER AS $$
  SELECT pg_database_size(current_database());
$$;`

export default function DbUsageBar({ sizeBytes }: { sizeBytes: number | null }) {
  if (sizeBytes === null) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm mb-6">
        <p className="font-semibold text-amber-800 mb-1">📦 DB容量表示の初期設定が必要です</p>
        <p className="text-amber-700 text-xs mb-2">
          Supabase ダッシュボード → SQL Editor で以下を一度だけ実行してください：
        </p>
        <pre className="bg-amber-100 text-amber-900 rounded-lg p-3 text-xs overflow-x-auto font-mono whitespace-pre">
          {SQL_SETUP}
        </pre>
      </div>
    )
  }

  const sizeMB = Math.round(sizeBytes / 1024 / 1024)
  const limitMB = 500
  const percent = Math.round((sizeMB / limitMB) * 100)

  const barColor =
    percent >= 90 ? 'bg-red-500' :
    percent >= 80 ? 'bg-orange-500' :
    percent >= 60 ? 'bg-yellow-500' :
    'bg-green-500'
  const textColor =
    percent >= 80 ? 'text-red-600' :
    percent >= 60 ? 'text-orange-600' :
    'text-gray-700'

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6">
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm font-semibold text-gray-700">📦 データベース容量</span>
        <span className={`text-sm font-bold ${textColor}`}>
          {sizeMB} / {limitMB} MB（{percent}%）
        </span>
      </div>
      <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full ${barColor} rounded-full`}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
      {percent >= 80 && (
        <p className="text-xs text-red-600 mt-2">
          容量が逼迫しています。古いテストの「結果のみ削除」で空き容量を確保してください。
        </p>
      )}
    </div>
  )
}
