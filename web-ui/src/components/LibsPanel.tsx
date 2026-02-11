
export function LibsPanel({
  libraries,
  onPick,
  onSetup,
  hideSetup,
}: {
  libraries: string[]
  onPick: (l: string) => void
  onSetup?: () => void
  hideSetup?: boolean
}) {
  const libs = libraries

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
      {onSetup && !hideSetup && (
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
