import React from 'react'

/**
 * [U]...[/U] マークアップを <span className="underline"> に変換する
 * TestClient.tsx / review page など複数箇所で共有
 */
export function renderUnderline(text: string): React.ReactNode {
  // 隣接する [/U][U] をマージして細切れの下線を防ぐ
  const merged = text.replace(/\[\/U\]\[U\]/g, '')
  const parts = merged.split(/(\[U\][\s\S]*?\[\/U\])/)
  return (
    <>
      {parts.map((part, i) => {
        const m = part.match(/^\[U\]([\s\S]*)\[\/U\]$/)
        if (m) {
          return (
            <span key={i} className="underline decoration-2 underline-offset-2">
              {m[1]}
            </span>
          )
        }
        return <span key={i}>{part}</span>
      })}
    </>
  )
}
