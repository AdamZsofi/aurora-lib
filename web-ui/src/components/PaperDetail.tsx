import { useEffect, useState } from "react"
import { deletePaper } from "../api/papers"

type PaperDetailProps = {
  id: string
  paper: any | null
  loading: boolean
  onClose: () => void
  onRefresh: () => void
  onUpdatePaper?: (paper: any) => void
  library?: string | null
}

export function PaperDetail({
  id,
  paper,
  loading,
  onClose,
  onRefresh,
  onUpdatePaper,
  library,
}: PaperDetailProps) {
  const [showMeta, setShowMeta] = useState(false)
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [uploadingPdf, setUploadingPdf] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [existingTags, setExistingTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState("")
  const [tags, setTags] = useState<string[]>([])
  const [savingTags, setSavingTags] = useState(false)
  const [tagError, setTagError] = useState<string | null>(null)
  const [readState, setReadState] = useState<string>("unread")
  const [savingState, setSavingState] = useState(false)
  const [stateError, setStateError] = useState<string | null>(null)

  const pdfExists = Array.isArray(paper?.files)
    ? paper.files.some((f: string) => f.toLowerCase().endsWith(".pdf"))
    : false

  useEffect(() => {
    setTags(Array.isArray(paper?.tags) ? paper.tags : [])
    const nextState = paper?.read_state || paper?.raw?.aurora_read_state || "unread"
    setReadState(nextState)
  }, [paper])

  useEffect(() => {
    const url = library ? `/api/tags?library=${encodeURIComponent(library)}` : "/api/tags"
    fetch(url)
      .then((r) => r.json())
      .then((j) => setExistingTags(j.tags || []))
      .catch(() => setExistingTags([]))
  }, [library])

  function tagColor(tag: string) {
    let hash = 0
    for (let i = 0; i < tag.length; i++) hash = (hash * 31 + tag.charCodeAt(i)) >>> 0
    const hue = hash % 360
    const backgroundColor = `hsl(${hue} 80% 85%)`
    const color = "#0f172a"
    return { backgroundColor, color }
  }

  async function saveTags(nextTags: string[]) {
    setSavingTags(true)
    setTagError(null)
    try {
      const url = library
        ? `/api/papers/${encodeURIComponent(id)}/tags?library=${encodeURIComponent(library)}`
        : `/api/papers/${encodeURIComponent(id)}/tags`
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags: nextTags }),
      })
      if (!r.ok) {
        const j = await r.json().catch(() => ({}))
        throw new Error(j.detail || "Failed to save tags")
      }
      const j = await r.json()
      if (j?.paper) {
        onUpdatePaper?.(j.paper)
        setTags(Array.isArray(j.paper.tags) ? j.paper.tags : nextTags)
      }
    } catch (e: any) {
      setTagError(e.message || "Failed to save tags")
    } finally {
      setSavingTags(false)
    }
  }

  const readStateOptions = [
    { value: "unread", label: "⚪ Unread" },
    { value: "want_to_read", label: "⭐ Want to read" },
    { value: "read_abstract", label: "📄 Read: abstract" },
    { value: "read_shallow", label: "📘 Read: shallow" },
    { value: "read_deep", label: "📚 Read: deep" },
  ]

  async function saveReadState(nextState: string) {
    setSavingState(true)
    setStateError(null)
    try {
      const url = library
        ? `/api/papers/${encodeURIComponent(id)}/state?library=${encodeURIComponent(library)}`
        : `/api/papers/${encodeURIComponent(id)}/state`
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: nextState }),
      })
      if (!r.ok) {
        const j = await r.json().catch(() => ({}))
        throw new Error(j.detail || "Failed to save read state")
      }
      const j = await r.json()
      if (j?.paper) {
        onUpdatePaper?.(j.paper)
        setReadState(j.paper.read_state || nextState)
      } else {
        setReadState(nextState)
      }
    } catch (e: any) {
      setStateError(e.message || "Failed to save read state")
    } finally {
      setSavingState(false)
    }
  }


  async function handleUploadPdf() {
    if (!pdfFile) return
    setUploadingPdf(true)
    try {
      const form = new FormData()
      form.append("file", pdfFile)
      const url = library
        ? `/api/papers/${encodeURIComponent(id)}/pdf?library=${encodeURIComponent(library)}`
        : `/api/papers/${encodeURIComponent(id)}/pdf`
      const r = await fetch(url, {
        method: "POST",
        body: form,
      })
      if (!r.ok) {
        const j = await r.json().catch(() => ({}))
        throw new Error(j.detail || "Failed to upload PDF")
      }
      const j = await r.json().catch(() => ({}))
      setPdfFile(null)
      if (j?.paper) {
        onUpdatePaper?.(j.paper)
      } else {
        onRefresh()
      }
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
                deletePaper(id, library)
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
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-lg font-semibold">{paper.title}</h3>
              <button
                className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800"
                title="Copy title"
                onClick={() => paper.title && navigator.clipboard.writeText(paper.title)}
              >
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              </button>
            </div>
            <div className="mb-1">
              <strong>Authors:</strong>{" "}
              {Array.isArray(paper.authors)
                ? paper.authors.join(", ")
                : paper.authors}
            </div>
            <div className="mb-1">
              <strong>DOI:</strong>{" "}
              {paper.doi ? (
                <a
                  className="text-aurora-700 hover:underline break-all"
                  href={paper.raw?.URL || paper.raw?.url || paper.raw?.link || `https://doi.org/${encodeURIComponent(paper.doi)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {paper.doi}
                </a>
              ) : (
                "(none)"
              )}
              {paper.doi && (
                <span className="inline-flex items-center gap-2 ml-2">
                  <button
                    className="text-xs px-2 py-0.5 rounded border border-aurora-400 text-aurora-700 hover:bg-aurora-50 dark:hover:bg-zinc-800 transition-colors"
                    onClick={() => {
                      const doi = encodeURIComponent(paper.doi)
                      window.open(`https://inciteful.xyz/p/${doi}`, "_blank", "noopener,noreferrer")
                    }}
                    title="Open in Inciteful"
                  >
                    Inciteful
                  </button>
                  <button
                    className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    title="Copy DOI"
                    onClick={() => navigator.clipboard.writeText(paper.doi)}
                  >
                    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                  </button>
                </span>
              )}
            </div>
            <div className="mb-1">
              <strong>Year:</strong> {paper.year || "(unknown)"}
            </div>
            <div className="mt-2">
              <div className="text-sm font-semibold mb-1">Tags</div>
              <div className="flex flex-wrap gap-2 mb-2">
                {tags.length === 0 && (
                  <span className="text-xs text-zinc-500">No tags yet</span>
                )}
                {tags.map((t) => (
                  <span key={t} className="px-2 py-0.5 rounded text-xs" style={tagColor(t)}>
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
              <div className="flex items-center gap-2">
                <input
                  className="border border-zinc-300 dark:border-zinc-700 rounded px-2 py-1 w-full max-w-xs bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                  placeholder="Add tag"
                  list="tag-suggestions"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      const clean = tagInput.trim().toLowerCase()
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
                    const clean = tagInput.trim().toLowerCase()
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
                <pre className="bg-zinc-100 dark:bg-zinc-800 p-2 max-h-100 overflow-auto rounded text-xs mt-2">
                  {JSON.stringify(paper.raw || paper, null, 2)}
                </pre>
              )}
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <div className="mb-2">
              <div className="text-sm font-semibold mb-1">Reading status</div>
              <div className="flex flex-wrap items-center gap-2">
                {readStateOptions.map((o) => (
                  <button
                    key={o.value}
                    className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                      readState === o.value
                        ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                        : "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 border-zinc-300 dark:border-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                    }`}
                    onClick={() => saveReadState(o.value)}
                    disabled={savingState}
                  >
                    {o.label}
                  </button>
                ))}
                {savingState && <span className="text-xs text-zinc-500">Saving...</span>}
              </div>
              {stateError && <div className="text-xs text-rose-500 mt-1">{stateError}</div>}
            </div>
            <strong>PDF preview:</strong>
            {pdfExists ? (
              <div className="h-150 border border-zinc-200 dark:border-zinc-700 mt-1 rounded">
                <iframe
                  src={library
                    ? `/api/papers/${encodeURIComponent(id)}/pdf?library=${encodeURIComponent(library)}`
                    : `/api/papers/${encodeURIComponent(id)}/pdf`}
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
                    <span className="text-xs text-zinc-500 truncate max-w-60">{pdfFile.name}</span>
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
