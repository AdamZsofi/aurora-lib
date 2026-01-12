import { useEffect, useState } from "react"
import { deletePaper } from "../api/papers"

export function PaperDetail({
  id,
  onClose,
}: {
  id: string
  onClose: () => void
}) {
  const [paper, setPaper] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/papers/${encodeURIComponent(id)}`)
      .then((r) => r.json())
      .then((j) => setPaper(j.paper || j))
      .catch(() => setPaper(null))
      .finally(() => setLoading(false))
  }, [id])



  return (
    <div className="bg-white dark:bg-zinc-900 rounded-lg p-6 shadow flex flex-col gap-2 outline-none">
      <div className="flex justify-between items-center mb-2">
        <h2 className="text-xl font-bold">Paper detail</h2>
        <div className="flex gap-2">
          <button
            className="px-3 py-1 rounded bg-aurora-900 text-white hover:bg-aurora-600 transition-colors"
            onClick={() => {
              if (confirm("Delete paper?")) {
                deletePaper(id)
                onClose()
              }
            }}
          >
            Delete
          </button>
          <button
            className="px-3 py-1 rounded border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-100 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>

      {loading && <div>Loading...</div>}

      {!loading && paper && (
        <div className="flex gap-4">
          <div className="flex-1 min-w-[280px]">
            <h3 className="text-lg font-semibold mb-1">{paper.title}</h3>
            <div className="mb-1">
              <strong>Authors:</strong>{" "}
              {Array.isArray(paper.authors)
                ? paper.authors.join(", ")
                : paper.authors}
            </div>
            <div className="mb-1">
              <strong>DOI:</strong> {paper.doi}
            </div>

            <div className="mt-3">
              <strong>All Metadata:</strong>
              <pre className="bg-zinc-100 dark:bg-zinc-800 p-2 max-h-[400px] overflow-auto rounded text-xs mt-1">
                {JSON.stringify(paper.raw || paper, null, 2)}
              </pre>
            </div>
          </div>

          <div className="flex-1">
            <strong>PDF preview:</strong>
            <div className="h-[600px] border border-zinc-200 dark:border-zinc-700 mt-1 rounded">
              <iframe
                src={`/api/papers/${encodeURIComponent(id)}/pdf`}
                className="w-full h-full"
              />
            </div>
          </div>
        </div>
      )}

      {!loading && !paper && <div>Failed to load paper</div>}
    </div>
  )
}
