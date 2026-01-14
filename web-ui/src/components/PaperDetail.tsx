import { useEffect, useState } from "react"
import { deletePaper } from "../api/papers"

export function PaperDetail({
  id,
  paper,
  loading,
  onClose,
  onRefresh,
}: {
  id: string
  paper: any | null
  loading: boolean
  onClose: () => void
  onRefresh: () => void
}) {
  const [showMeta, setShowMeta] = useState(false)
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [uploadingPdf, setUploadingPdf] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [existingTags, setExistingTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState("")
  const [tags, setTags] = useState<string[]>([])
  const [savingTags, setSavingTags] = useState(false)
  const [tagError, setTagError] = useState<string | null>(null)

  const pdfExists = Array.isArray(paper?.files)
    ? paper.files.some((f: string) => f.toLowerCase().endsWith(".pdf"))
    : false

  useEffect(() => {
    setTags(Array.isArray(paper?.tags) ? paper.tags : [])
  }, [paper])

  useEffect(() => {
    fetch("/api/tags")
      .then((r) => r.json())
      .then((j) => setExistingTags(j.tags || []))
      .catch(() => setExistingTags([]))
  }, [])

  function tagColor(tag: string) {
    const colors = [
      "bg-aurora-100 text-aurora-900",
      "bg-emerald-100 text-emerald-900",
      "bg-sky-100 text-sky-900",
      "bg-amber-100 text-amber-900",
      "bg-fuchsia-100 text-fuchsia-900",
      "bg-lime-100 text-lime-900",
    ]
    let hash = 0
    for (let i = 0; i < tag.length; i++) hash = (hash * 31 + tag.charCodeAt(i)) >>> 0
    return colors[hash % colors.length]
  }

  async function saveTags(nextTags: string[]) {
    setSavingTags(true)
    setTagError(null)
    try {
      const r = await fetch(`/api/papers/${encodeURIComponent(id)}/tags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags: nextTags }),
      })
      if (!r.ok) {
        const j = await r.json().catch(() => ({}))
        throw new Error(j.detail || "Failed to save tags")
      }
      onRefresh()
    } catch (e: any) {
      setTagError(e.message || "Failed to save tags")
    } finally {
      setSavingTags(false)
    }
  }

  async function handleUploadPdf() {
    if (!pdfFile) return
    setUploadingPdf(true)
    setUploadError(null)
    try {
      const form = new FormData()
      form.append("file", pdfFile)
      const r = await fetch(`/api/papers/${encodeURIComponent(id)}/pdf`, {
        method: "POST",
        body: form,
      })
      if (!r.ok) {
        const j = await r.json().catch(() => ({}))
        throw new Error(j.detail || "Failed to upload PDF")
      }
      setPdfFile(null)
      onRefresh()
    } catch (e: any) {
      setUploadError(e.message || "Failed to upload PDF")
    } finally {
      setUploadingPdf(false)
    }
  }

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
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold mb-1">{paper.title}</h3>
            <div className="mb-1">
              <strong>Authors:</strong>{" "}
              {Array.isArray(paper.authors)
                ? paper.authors.join(", ")
                : paper.authors}
            </div>
            <div className="mb-1">
              <strong>DOI:</strong> {paper.doi || "(none)"}
            </div>
            <div className="mb-1">
              <strong>Year:</strong> {paper.year || "(unknown)"}
            </div>

            <div className="mt-2">
              <div className="text-sm font-semibold mb-1">Tags</div>
              <div className="flex flex-wrap gap-2">
                {tags.length === 0 && (
                  <span className="text-xs text-zinc-500">No tags yet</span>
                )}
                {tags.map((t) => (
                  <span key={t} className={`px-2 py-0.5 rounded text-xs ${tagColor(t)}`}>
                    {t}
                    <button
                      className="ml-1 text-xs"
                      onClick={() => {
                        const next = tags.filter((x) => x !== t)
                        setTags(next)
                        saveTags(next)
                      }}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <input
                  className="border border-zinc-300 dark:border-zinc-700 rounded px-2 py-1 w-full max-w-xs bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                  placeholder="Add tag"
                  list="tag-suggestions"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      const clean = tagInput.trim()
                      if (clean && !tags.includes(clean)) {
                        const next = [...tags, clean]
                        setTags(next)
                        saveTags(next)
                        setTagInput("")
                      }
                    }
                  }}
                />
                <button
                  className="px-3 py-1 rounded bg-aurora-700 text-white font-semibold shadow hover:bg-aurora-900 transition-colors disabled:opacity-50"
                  onClick={() => {
                    const clean = tagInput.trim()
                    if (clean && !tags.includes(clean)) {
                      const next = [...tags, clean]
                      setTags(next)
                      saveTags(next)
                      setTagInput("")
                    }
                  }}
                  disabled={savingTags}
                >
                  Add
                </button>
                <datalist id="tag-suggestions">
                  {existingTags.map((t) => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
              </div>
              {tagError && <div className="text-xs text-rose-500 mt-1">{tagError}</div>}
            </div>

            <div className="mt-3">
              <button
                className="text-sm text-aurora-700 hover:underline"
                onClick={() => setShowMeta((s) => !s)}
              >
                {showMeta ? "Hide metadata" : "Show metadata"}
              </button>
              {showMeta && (
                <pre className="bg-zinc-100 dark:bg-zinc-800 p-2 max-h-[400px] overflow-auto rounded text-xs mt-2">
                  {JSON.stringify(paper.raw || paper, null, 2)}
                </pre>
              )}
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <strong>PDF preview:</strong>
            {pdfExists ? (
              <div className="h-[600px] border border-zinc-200 dark:border-zinc-700 mt-1 rounded">
                <iframe
                  src={`/api/papers/${encodeURIComponent(id)}/pdf`}
                  className="w-full h-full"
                />
              </div>
            ) : (
              <div className="mt-2 rounded border border-dashed border-zinc-300 dark:border-zinc-700 p-4 text-sm text-zinc-500 dark:text-zinc-400">
                No PDF attached. Upload one now or add it later.
                <div className="mt-3 flex items-center gap-3">
                  <label className="px-3 py-1 rounded border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-100 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors cursor-pointer">
                    <input
                      type="file"
                      accept="application/pdf"
                      className="hidden"
                      onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)}
                    />
                    {pdfFile ? "Change PDF" : "Choose PDF"}
                  </label>
                  {pdfFile && (
                    <span className="text-xs text-zinc-500 truncate max-w-[240px]">{pdfFile.name}</span>
                  )}
                  <button
                    className="px-3 py-1 rounded bg-aurora-700 text-white font-semibold shadow hover:bg-aurora-800 transition-colors disabled:opacity-50"
                    onClick={handleUploadPdf}
                    disabled={!pdfFile || uploadingPdf}
                  >
                    {uploadingPdf ? "Uploading..." : "Upload PDF"}
                  </button>
                </div>
                {uploadError && (
                  <div className="mt-2 text-rose-500">{uploadError}</div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {!loading && !paper && <div>Failed to load paper</div>}
    </div>
  )
}
