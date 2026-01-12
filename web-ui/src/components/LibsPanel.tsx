import { useEffect, useState } from "react"

export function LibsPanel({ onPick }: { onPick: (l: string) => void }) {
  const [libs, setLibs] = useState<string[]>([])

  useEffect(() => {
    fetch("/api/libs")
      .then((r) => r.json())
      .then((j) => setLibs(j.libraries || []))
  }, [])

  return (
    <div className="flex flex-col gap-2">
      {libs.map((l) => (
        <button
          key={l}
          onClick={() => {
            fetch("/api/lib", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ library: l }),
            }).then(() => onPick(l))
          }}
          className="px-3 py-1 rounded bg-aurora-400 text-white"
        >
          {l}
        </button>
      ))}
    </div>
  )
}
