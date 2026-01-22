import { useEffect, useState } from "react"
import { apiGetLibs } from "../api/bridge"

export function LibsPanel({ onPick }: { onPick: (l: string) => void }) {
  const [libs, setLibs] = useState<string[]>([])

  useEffect(() => {
    apiGetLibs()
      .then((j) => setLibs(j.libraries || []))
  }, [])

  return (
    <div className="flex flex-col gap-2">
      {libs.map((l) => (
        <button
          key={l}
          onClick={() => onPick(l)}
          className="px-3 py-1 rounded bg-aurora-400 text-white"
        >
          {l}
        </button>
      ))}
    </div>
  )
}
