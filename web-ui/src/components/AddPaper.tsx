import { useEffect, useState } from "react"

export function AddPaper({
  onClose,
  onAdded,
}: {
  onClose: () => void
  onAdded: () => void
}) {
  const [doi, setDoi] = useState("")
  const [metaText, setMetaText] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null)

  async function fetchMeta() {
    setStatus("fetching")
    try {
      const r = await fetch(`/api/resolve?doi=${encodeURIComponent(doi)}`)
      if (!r.ok) {
        setStatus("not found")
        return
      }
      const j = await r.json()
      setMetaText(JSON.stringify(j, null, 2))
      setStatus("fetched")
    } catch {
      setStatus("error")
    }
  }

  async function submitAdd() {
    setStatus("adding")
    const form = new FormData()
    form.append("metadata", metaText)
    if (file) form.append("file", file)

    try {
      await fetch(`/api/papers`, { method: "POST", body: form })
      setStatus("done")
      onAdded()
    } catch {
      setStatus("error")
    }
  }

  useEffect(() => {
    if (!file) {
      if (filePreviewUrl) {
        URL.revokeObjectURL(filePreviewUrl)
        setFilePreviewUrl(null)
      }
      return
    }
    const url = URL.createObjectURL(file)
    setFilePreviewUrl(url)
    return () => {
      URL.revokeObjectURL(url)
      setFilePreviewUrl(null)
    }
  }, [file])

  return (
    <div
      className="fixed left-5 right-5 top-10 bottom-10 bg-white dark:bg-zinc-900 rounded-lg p-6 shadow-2xl z-50 overflow-auto flex flex-col gap-2 outline-none"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose()
      }}
    >
      <h2 className="text-xl font-bold mb-2">Add paper</h2>
      
      <div className="flex gap-4 mt-3">
        <div className="flex-1">
          <div className="mb-2 flex items-center gap-2">
            <label className="flex items-center gap-2">
              DOI:
              <input
                className="border border-zinc-300 dark:border-zinc-700 rounded px-2 py-1 w-96 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                value={doi}
                onChange={(e) => setDoi(e.target.value)}
              />
            </label>
            <button
              className="px-3 py-1 rounded bg-aurora-700 text-white font-semibold shadow hover:bg-aurora-900 transition-colors"
              onClick={fetchMeta}
            >
              Fetch metadata
            </button>
          </div>

          <div className="mb-2">
            <label className="block mb-1">Metadata:</label>
            <textarea
              className="w-full border border-zinc-300 dark:border-zinc-700 rounded px-2 py-1 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
              value={metaText}
              onChange={(e) => setMetaText(e.target.value)}
              rows={20}
            />
          </div>

          <div className="flex items-center gap-3 mt-2">
            <button
              className="px-4 py-2 rounded bg-aurora-700 text-white font-semibold shadow hover:bg-aurora-800 transition-colors disabled:opacity-50"
              onClick={submitAdd}
              disabled={!file || status !== "fetched"}
            >
              Add to library
            </button>

            <button
              className="px-4 py-2 rounded border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-100 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
              onClick={onClose}
            >
              Cancel
            </button>

            <span className="ml-3 text-sm text-zinc-500 dark:text-zinc-400">
              {status}
            </span>
          </div>
        </div>

        <div className="flex-1">
          <div className="mb-2">
            <label className="flex items-center gap-2">
              PDF file:
              <input
                type="file"
                accept="application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="block"
              />
            </label>
          </div>
          {filePreviewUrl && (
            <iframe
              src={filePreviewUrl}
              className="w-full h-[600px] border border-zinc-200 dark:border-zinc-700 rounded"
            />
          )}
        </div>
      </div>
    </div>
  )
}
