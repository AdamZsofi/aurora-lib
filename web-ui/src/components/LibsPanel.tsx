import { useEffect, useState } from "react"

export function LibsPanel({
  onPick,
  onSetup,
}: {
  onPick: (l: string) => void
  onSetup?: () => void
}) {
  const [libs, setLibs] = useState<string[]>([])

  useEffect(() => {
    fetch("/api/aurora/config")
      .then((r) => r.json())
      .then((j) => {
        if (j?.configured && j?.config?.library_name) {
          setLibs([j.config.library_name])
        } else {
          setLibs([])
        }
      })
      .catch(() => setLibs([]))
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
      {onSetup && (
        <button
          onClick={onSetup}
          className="mt-1 px-3 py-1 rounded border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-100 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
        >
          Set up or import library
        </button>
      )}
    </div>
  )
}
