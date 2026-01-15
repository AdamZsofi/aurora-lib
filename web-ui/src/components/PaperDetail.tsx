import { useEffect, useState } from "react"
import { deletePaper } from "../api/papers"

export function PaperDetail({
  id,
  paper,
  loading,
  onClose,
  onRefresh,
  onUpdatePaper,
}: {
  id: string
  paper: any | null
  loading: boolean
  onClose: () => void
  onRefresh: () => void
  onUpdatePaper?: (paper: any) => void
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
  const [notes, setNotes] = useState<Array<{ author: string; text: string }>>([])
  const [noteAuthor, setNoteAuthor] = useState("")
  const [noteText, setNoteText] = useState("")
  const [savingNote, setSavingNote] = useState(false)
  const [noteError, setNoteError] = useState<string | null>(null)

  const pdfExists = Array.isArray(paper?.files)
    ? paper.files.some((f: string) => f.toLowerCase().endsWith(".pdf"))
    : false

  useEffect(() => {
    setTags(Array.isArray(paper?.tags) ? paper.tags : [])
    setNotes(Array.isArray(paper?.user_notes) ? paper.user_notes : [])
  }, [paper])

  useEffect(() => {
    fetch("/api/tags")
      .then((r) => r.json())
      .then((j) => setExistingTags(j.tags || []))
      .catch(() => setExistingTags([]))
  }, [])

  function tagColor(tag: string) {
    let hash = 0
    for (let i = 0; i < tag.length; i++) hash = (hash * 31 + tag.charCodeAt(i)) >>> 0
    const hue = hash % 360
    const bg = `hsl(${hue} 70% 60%)`
    const text = "#0f172a"
    return { backgroundColor: bg, color: text }
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

  async function addNote() {
    const author = noteAuthor.trim()
    const text = noteText.trim()
    if (!author || !text) return
    setSavingNote(true)
    setNoteError(null)
    try {
      const r = await fetch(`/api/papers/${encodeURIComponent(id)}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ author, text }),
      })
      if (!r.ok) {
        const j = await r.json().catch(() => ({}))
        throw new Error(j.detail || "Failed to add note")
      }
      const j = await r.json()
      if (j?.paper) {
        onUpdatePaper?.(j.paper)
        setNotes(Array.isArray(j.paper.user_notes) ? j.paper.user_notes : [])
      }
      setNoteText("")
    } catch (e: any) {
      setNoteError(e.message || "Failed to add note")
    } finally {
      setSavingNote(false)
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
            {paper.raw?.URL || paper.raw?.url || paper.raw?.link ? (
              <div className="mb-1">
                <strong>URL:</strong>{" "}
                <a
                  className="text-aurora-700 hover:underline break-all"
                  href={paper.raw?.URL || paper.raw?.url || paper.raw?.link}
                  target="_blank"
                  rel="noreferrer"
                >
                  {paper.raw?.URL || paper.raw?.url || paper.raw?.link}
                </a>
              </div>
            ) : null}

            <div className="mt-2">
              <div className="text-sm font-semibold mb-1">Tags</div>
              <div className="flex flex-wrap gap-2">
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

            <div className="mt-4">
              <div className="text-sm font-semibold mb-1">Notes</div>
              {notes.length === 0 && (
                <div className="text-xs text-zinc-500">No notes yet</div>
              )}
              {notes.length > 0 && (
                <div className="flex flex-col gap-2">
                  {notes.map((n, idx) => (
                    <div key={idx} className="rounded border border-zinc-200 dark:border-zinc-700 p-2">
                      <div className="text-xs text-zinc-500">{n.author}</div>
                      <div className="text-sm whitespace-pre-wrap">{n.text}</div>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-2 flex flex-col gap-2">
                <input
                  className="border border-zinc-300 dark:border-zinc-700 rounded px-2 py-1 w-full max-w-xs bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                  placeholder="Your name"
                  value={noteAuthor}
                  onChange={(e) => setNoteAuthor(e.target.value)}
                />
                <textarea
                  className="border border-zinc-300 dark:border-zinc-700 rounded px-2 py-1 w-full bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                  placeholder="Write a note..."
                  rows={3}
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                />
                <button
                  className="px-3 py-1 rounded bg-aurora-700 text-white font-semibold shadow hover:bg-aurora-900 transition-colors disabled:opacity-50 w-fit"
                  onClick={addNote}
                  disabled={savingNote || !noteAuthor.trim() || !noteText.trim()}
                >
                  {savingNote ? "Saving..." : "Add note"}
                </button>
                {noteError && <div className="text-xs text-rose-500">{noteError}</div>}
              </div>
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
