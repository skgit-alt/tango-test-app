export default function RankingLoading() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center gap-3">
          <div className="w-5 h-5 bg-gray-200 rounded animate-pulse" />
          <div className="h-5 w-24 bg-gray-200 rounded animate-pulse" />
        </div>
      </header>
      <div className="max-w-lg mx-auto px-4 py-6 flex justify-center pt-20">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-400">ランキング読み込み中...</p>
        </div>
      </div>
    </div>
  )
}
