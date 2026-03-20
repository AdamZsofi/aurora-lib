import { useEffect, useState } from "react"
import { tagColor } from "../utils/tags"

type BatchItem = {
  id: string
  doi?: string | null
  title?: string | null
  author?: string | null
  year?: string | null
  url?: string | null
  ok: boolean
  resolved?: boolean
  metadata?: any
  error?: string
  selected: boolean
  file?: File | null
  tags?: string[]
  contexts?: string[]
  metaOpen?: boolean
  status?: "idle" | "adding" | "done" | "error"
}

export function AddPaper({
  onClose,
  onAdded,
  library,
}: {
  onClose: () => void
  onAdded: () => void
  library?: string | null
}) {
  const [mode, setMode] = useState<"single" | "batch">("single")

  // Single add
  const [doi, setDoi] = useState("")
  const [metadata, setMetadata] = useState<any | null>(null)
  const [metaOpen, setMetaOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null)
  const [existingTags, setExistingTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState("")
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [existingContexts, setExistingContexts] = useState<string[]>([])
  const [contextInput, setContextInput] = useState("")
  const [selectedContexts, setSelectedContexts] = useState<string[]>([])

  // Batch add
  const [bibFile, setBibFile] = useState<File | null>(null)
  const [batchItems, setBatchItems] = useState<BatchItem[]>([])
  const [batchStatus, setBatchStatus] = useState<string | null>(null)
  const [batchWorking, setBatchWorking] = useState(false)
  const [batchTagInput, setBatchTagInput] = useState("")
  const [batchTags, setBatchTags] = useState<string[]>([])
  const [batchContextInput, setBatchContextInput] = useState("")
  const [batchContexts, setBatchContexts] = useState<string[]>([])

  function metaSummary(meta: any) {
    const rawTitle = meta?.title || meta?.message?.title || "(no title)"
    const title = Array.isArray(rawTitle) ? rawTitle[0] : rawTitle
    const authorsRaw = meta?.author_list || meta?.author || meta?.message?.author
    const authors = Array.isArray(authorsRaw)
      ? authorsRaw
          .map((a: any) =>
            typeof a === "string"
              ? a
              : [a.given, a.family].filter(Boolean).join(" ")
          )
          .filter(Boolean)
          .join(", ")
      : authorsRaw
    const year = meta?.year || meta?.issued || meta?.message?.issued
    const url = meta?.URL || meta?.url || meta?.message?.URL || meta?.message?.url || meta?.link
    return { title, authors, year, url }
  }

  function addTag(tag: string, setTags: (tags: string[]) => void, current: string[]) {
    const clean = tag.trim().toLowerCase()
    if (!clean) return
    if (!current.includes(clean)) setTags([...current, clean])
  }

  async function fetchMeta() {
    setStatus("fetching")
    setMetadata(null)
    try {
      const r = await fetch(`/api/resolve?doi=${encodeURIComponent(doi)}`)
      if (!r.ok) {
        setStatus("not found")
        return
      }
      const j = await r.json()
      setMetadata(j)
      const metaTags = Array.isArray(j?.tags) ? j.tags : []
      if (metaTags.length) {
        const normalized = metaTags
          .filter((t: any) => typeof t === "string")
          .map((t: string) => t.trim().toLowerCase())
          .filter(Boolean)
        setSelectedTags((prev) => Array.from(new Set([...prev, ...normalized])))
      }
      setMetaOpen(false)
      setStatus("fetched")
    } catch {
      setStatus("error")
    }
  }

  async function submitAdd() {
    if (!metadata) return
    setStatus("adding")
    try {
      const form = new FormData()
      const metaWithTags = selectedTags.length
        ? { ...metadata, tags: Array.from(new Set([...(metadata.tags || []), ...selectedTags])) }
        : metadata
      const metaWithContexts = selectedContexts.length
        ? { ...metaWithTags, contexts: Array.from(new Set([...(metaWithTags.contexts || []), ...selectedContexts])) }
        : metaWithTags
      form.append("metadata", JSON.stringify(metaWithContexts))
      if (file) form.append("file", file)

      const url = library ? `/api/papers?library=${encodeURIComponent(library)}` : "/api/papers"
      const r = await fetch(url, { method: "POST", body: form })
      if (!r.ok) {
        const j = await r.json().catch(() => ({}))
        throw new Error(j.detail || "Failed to add paper")
      }
      setStatus("done")
      onAdded()
    } catch (e: any) {
      setStatus(e.message || "error")
    }
  }

  async function resolveBib() {
    if (!bibFile) {
      setBatchStatus("Choose a .bib file")
      return
    }
    setBatchWorking(true)
    setBatchStatus("Parsing BibTeX...")
    setBatchItems([])
    try {
      const form = new FormData()
      form.append("file", bibFile)
      const r = await fetch("/api/resolve-bib", { method: "POST", body: form })
      const j = await r.json()
      const items = (j.items || []).map((item: any, i: number) => ({
        id: item.id || `entry-${i}`,
        doi: item.doi,
        title: item.title,
        author: item.author,
        year: item.year,
        url: item.url,
        ok: !!item.doi,
        resolved: false,
        metadata: null,
        error: item.doi ? undefined : "Missing DOI",
        selected: !!item.doi,
        status: "idle" as const,
        metaOpen: false,
        file: null,
      }))
      setBatchItems(items)
      setBatchStatus(`Parsed ${items.length} entry(ies)`)
    } catch (e: any) {
      setBatchStatus(e.message || "Failed to parse bib")
    } finally {
      setBatchWorking(false)
    }
  }

  async function resolveSelectedMetadata() {
    const selected = batchItems.filter((i) => i.selected && i.doi)
    if (!selected.length) {
      setBatchStatus("No items selected")
      return
    }
    setBatchWorking(true)
    setBatchStatus("Fetching metadata for selected...")
    try {
      const r = await fetch("/api/resolve-dois", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dois: selected.map((i) => i.doi) }),
      })
      const j = await r.json()
      const items = j.items || []
      setBatchItems((prev) =>
        prev.map((it) => {
          const resolved = items.find((i: any) => i.doi === it.doi)
          if (!resolved) return it
          const summary = resolved.metadata ? metaSummary(resolved.metadata) : null
          return {
            ...it,
            ok: !!resolved.ok,
            resolved: true,
            metadata: resolved.metadata || null,
            title: summary?.title || it.title,
            author: summary?.authors || it.author,
            year: summary?.year || it.year,
            url: summary?.url || it.url,
            tags: Array.isArray(resolved.metadata?.tags) ? resolved.metadata.tags : it.tags,
            contexts: Array.isArray(resolved.metadata?.contexts)
              ? resolved.metadata.contexts
              : Array.isArray(resolved.metadata?.projects)
                ? resolved.metadata.projects
                : it.contexts,
            error: resolved.error,
          }
        })
      )
      setBatchStatus("Metadata fetched")
    } catch (e: any) {
      setBatchStatus(e.message || "Failed to fetch metadata")
    } finally {
      setBatchWorking(false)
    }
  }

  async function addSelected() {
    const selected = batchItems.filter((i) => i.selected && i.ok && i.metadata)
    if (!selected.length) {
      setBatchStatus("No resolved items selected")
      return
    }
    setBatchWorking(true)
    setBatchStatus("Adding selected papers...")

    for (const item of selected) {
      setBatchItems((prev) =>
        prev.map((it) => (it.id === item.id ? { ...it, status: "adding" } : it))
      )
      try {
        const form = new FormData()
        const baseTags = Array.isArray(item.tags)
          ? item.tags
          : Array.isArray(item.metadata?.tags)
            ? item.metadata.tags
            : []
        const baseContexts = Array.isArray(item.contexts)
          ? item.contexts
          : Array.isArray(item.metadata?.contexts)
            ? item.metadata.contexts
            : Array.isArray(item.metadata?.projects)
              ? item.metadata.projects
              : []
        const metaWithTags = {
          ...item.metadata,
          tags: Array.from(new Set([...(baseTags || []), ...batchTags])),
        }
        const metaWithContexts = {
          ...metaWithTags,
          contexts: Array.from(new Set([...(baseContexts || []), ...batchContexts])),
        }
        form.append("metadata", JSON.stringify(metaWithContexts))
        if (item.file) form.append("file", item.file)
        const url = library ? `/api/papers?library=${encodeURIComponent(library)}` : "/api/papers"
        const r = await fetch(url, { method: "POST", body: form })
        if (!r.ok) {
          const j = await r.json().catch(() => ({}))
          throw new Error(j.detail || "Failed to add paper")
        }
        setBatchItems((prev) =>
          prev.map((it) => (it.id === item.id ? { ...it, status: "done" } : it))
        )
      } catch (e: any) {
        setBatchItems((prev) =>
          prev.map((it) => (it.id === item.id ? { ...it, status: "error", error: e.message } : it))
        )
      }
    }

    setBatchStatus("Done")
    setBatchWorking(false)
    onAdded()
  }

  useEffect(() => {
    const url = library ? `/api/tags?library=${encodeURIComponent(library)}` : "/api/tags"
    fetch(url)
      .then((r) => r.json())
      .then((j) => setExistingTags(j.tags || []))
      .catch(() => setExistingTags([]))
  }, [library])

  useEffect(() => {
    const url = library ? `/api/contexts?library=${encodeURIComponent(library)}` : "/api/contexts"
    fetch(url)
      .then((r) => r.json())
      .then((j) => setExistingContexts(j.contexts || []))
      .catch(() => setExistingContexts([]))
  }, [library])

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
      className="fixed left-4 right-4 top-6 bottom-6 bg-white dark:bg-zinc-900 rounded-lg p-6 shadow-2xl z-50 overflow-auto overflow-x-hidden flex flex-col gap-4 outline-none border border-zinc-200 dark:border-zinc-700"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose()
      }}
    >
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">Add paper</h2>
        <button
          className="px-3 py-1 rounded border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-100 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
          onClick={onClose}
        >
          Close
        </button>
      </div>

      <div className="flex gap-2 border-b border-zinc-200 dark:border-zinc-800 pb-2">
        <button
          className={`px-3 py-1 rounded ${mode === "single" ? "bg-aurora-600 text-white" : "bg-zinc-100 dark:bg-zinc-800"}`}
          onClick={() => setMode("single")}
        >
          Single DOI
        </button>
        <button
          className={`px-3 py-1 rounded ${mode === "batch" ? "bg-aurora-600 text-white" : "bg-zinc-100 dark:bg-zinc-800"}`}
          onClick={() => setMode("batch")}
        >
          Batch (BibTeX)
        </button>
      </div>

      {mode === "single" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-2">
          <div className="min-w-0">
            <div className="mb-2 flex flex-col sm:flex-row sm:items-center gap-2">
              <label className="flex items-center gap-2 w-full">
                DOI:
                <input
                  className="border border-zinc-300 dark:border-zinc-700 rounded px-2 py-1 w-full max-w-md bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                  value={doi}
                  onChange={(e) => {
                    setDoi(e.target.value)
                    setMetadata(null)
                    setStatus(null)
                  }}
                />
              </label>
              <button
                className="px-3 py-1 rounded bg-aurora-700 text-white font-semibold shadow hover:bg-aurora-900 transition-colors disabled:opacity-50 whitespace-nowrap"
                onClick={fetchMeta}
                disabled={!doi}
              >
                Fetch metadata
              </button>
            </div>

            {metadata && (
              <div className="mb-2 p-3 rounded border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800">
                <div className="font-semibold">{metaSummary(metadata).title}</div>
                <div className="text-sm text-zinc-500">
                  {metaSummary(metadata).authors ? "Authors: " + metaSummary(metadata).authors : ""}
                </div>
                <div className="text-sm text-zinc-500">Year: {metaSummary(metadata).year || "(unknown)"}</div>
                <div className="text-sm text-zinc-500">Source: {metadata?.source || "crossref"}</div>
                {metaSummary(metadata).url && (
                  <div className="text-sm text-aurora-700 truncate">
                    <a href={metaSummary(metadata).url} target="_blank" rel="noreferrer">
                      {metaSummary(metadata).url}
                    </a>
                  </div>
                )}
              </div>
            )}

            <div className="mb-2">
              <div className="flex items-center gap-2">
                <input
                  className="border border-zinc-300 dark:border-zinc-700 rounded px-2 py-1 w-full max-w-md bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                  placeholder="Add tag"
                  list="tag-suggestions"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      addTag(tagInput, setSelectedTags, selectedTags)
                      setTagInput("")
                    }
                  }}
                />
                <button
                  className="px-3 py-1 rounded bg-aurora-700 text-white font-semibold shadow hover:bg-aurora-900 transition-colors"
                  onClick={() => {
                    addTag(tagInput, setSelectedTags, selectedTags)
                    setTagInput("")
                  }}
                >
                  Add tag
                </button>
                <datalist id="tag-suggestions">
                  {existingTags.map((t) => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
              </div>
              {selectedTags.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {selectedTags.map((t) => (
                    <span key={t} className="px-2 py-0.5 rounded text-xs" style={tagColor(t)}>
                      {t}
                      <button
                        className="ml-1 text-xs"
                        onClick={() => setSelectedTags(selectedTags.filter((x) => x !== t))}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="mb-2">
              <div className="flex items-center gap-2">
                <input
                  className="border border-zinc-300 dark:border-zinc-700 rounded px-2 py-1 w-full max-w-md bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                  placeholder="Add context"
                  list="context-suggestions"
                  value={contextInput}
                  onChange={(e) => setContextInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      addTag(contextInput, setSelectedContexts, selectedContexts)
                      setContextInput("")
                    }
                  }}
                />
                <button
                  className="px-3 py-1 rounded bg-aurora-700 text-white font-semibold shadow hover:bg-aurora-900 transition-colors"
                  onClick={() => {
                    addTag(contextInput, setSelectedContexts, selectedContexts)
                    setContextInput("")
                  }}
                >
                  Add context
                </button>
                <datalist id="context-suggestions">
                  {existingContexts.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>
              {selectedContexts.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {selectedContexts.map((c) => (
                    <span key={c} className="px-2 py-0.5 rounded text-xs" style={tagColor(c)}>
                      {c}
                      <button
                        className="ml-1 text-xs"
                        onClick={() => setSelectedContexts(selectedContexts.filter((x) => x !== c))}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {metadata && (
              <div className="mb-2">
                <button
                  className="text-sm text-aurora-700 hover:underline"
                  onClick={() => setMetaOpen((s) => !s)}
                >
                  {metaOpen ? "Hide metadata" : "Show metadata"}
                </button>
                {metaOpen && (
                  <pre className="bg-zinc-100 dark:bg-zinc-800 p-2 max-h-75 overflow-auto rounded text-xs mt-2">
                    {JSON.stringify(metadata, null, 2)}
                  </pre>
                )}
              </div>
            )}

            <div className="flex items-center gap-3 mt-2">
              <button
                className="px-4 py-2 rounded bg-aurora-700 text-white font-semibold shadow hover:bg-aurora-800 transition-colors disabled:opacity-50"
                onClick={submitAdd}
                disabled={!metadata}
              >
                Add to library
              </button>

              <span className="ml-3 text-sm text-zinc-500 dark:text-zinc-400">
                {status}
              </span>
            </div>
          </div>

          <div className="min-w-0">
            <div className="mb-2">
              <div className="flex items-center gap-3">
                <span className="text-sm">Optional PDF:</span>
                <label className="px-3 py-1 rounded border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-100 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors cursor-pointer">
                  <input
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  />
                  {file ? "Change PDF" : "Choose PDF"}
                </label>
                {file && (
                  <span className="text-xs text-zinc-500 truncate max-w-60">{file.name}</span>
                )}
              </div>
              <div className="text-xs text-zinc-500 mt-1">You can add a PDF now or later.</div>
            </div>
            {filePreviewUrl && (
              <iframe
                src={filePreviewUrl}
                className="w-full h-130 border border-zinc-200 dark:border-zinc-700 rounded"
              />
            )}
          </div>
        </div>
      )}

      {mode === "batch" && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <label className="px-3 py-1 rounded border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-100 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors cursor-pointer">
              <input
                type="file"
                accept=".bib"
                className="hidden"
                onChange={(e) => setBibFile(e.target.files?.[0] ?? null)}
              />
              {bibFile ? "Change .bib" : "Choose .bib"}
            </label>
            {bibFile && (
              <span className="text-xs text-zinc-500 truncate max-w-60">{bibFile.name}</span>
            )}
            <button
              className="px-3 py-1 rounded bg-aurora-700 text-white font-semibold shadow hover:bg-aurora-900 transition-colors disabled:opacity-50"
              onClick={resolveBib}
              disabled={!bibFile || batchWorking}
            >
              {batchWorking ? "Working..." : "Parse BibTeX"}
            </button>
            <span className="text-sm text-zinc-500">{batchStatus}</span>
          </div>

          {batchItems.length > 0 && (
            <div className="flex items-center gap-2">
              <button
                className="text-sm text-aurora-700 hover:underline"
                onClick={() => setBatchItems((prev) => prev.map((i) => ({ ...i, selected: i.ok })))}
              >
                Select all
              </button>
              <button
                className="text-sm text-aurora-700 hover:underline"
                onClick={() => setBatchItems((prev) => prev.map((i) => ({ ...i, selected: false })))}
              >
                Clear
              </button>
              <button
                className="ml-auto px-3 py-1 rounded bg-aurora-600 text-white font-semibold shadow hover:bg-aurora-700 transition-colors disabled:opacity-50"
                onClick={resolveSelectedMetadata}
                disabled={batchWorking}
              >
                Fetch metadata for selected
              </button>
              <button
                className="px-3 py-1 rounded bg-aurora-700 text-white font-semibold shadow hover:bg-aurora-800 transition-colors disabled:opacity-50"
                onClick={addSelected}
                disabled={batchWorking}
              >
                Add selected
              </button>
            </div>
          )}

          {batchItems.length > 0 && (
            <div className="border border-zinc-200 dark:border-zinc-700 rounded p-3 bg-white dark:bg-zinc-900">
              <div className="text-sm font-semibold mb-2">Batch tags</div>
              <div className="flex items-center gap-2">
                <input
                  className="border border-zinc-300 dark:border-zinc-700 rounded px-2 py-1 w-full max-w-md bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                  placeholder="Add tag for all selected"
                  list="tag-suggestions"
                  value={batchTagInput}
                  onChange={(e) => setBatchTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      addTag(batchTagInput, setBatchTags, batchTags)
                      setBatchTagInput("")
                    }
                  }}
                />
                <button
                  className="px-3 py-1 rounded bg-aurora-700 text-white font-semibold shadow hover:bg-aurora-900 transition-colors"
                  onClick={() => {
                    addTag(batchTagInput, setBatchTags, batchTags)
                    setBatchTagInput("")
                  }}
                >
                  Add tag
                </button>
              </div>
              {batchTags.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {batchTags.map((t) => (
                    <span key={t} className="px-2 py-0.5 rounded text-xs" style={tagColor(t)}>
                      {t}
                      <button
                        className="ml-1 text-xs"
                        onClick={() => setBatchTags(batchTags.filter((x) => x !== t))}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}

              <div className="text-sm font-semibold mt-3 mb-2">Batch contexts</div>
              <div className="flex items-center gap-2">
                <input
                  className="border border-zinc-300 dark:border-zinc-700 rounded px-2 py-1 w-full max-w-md bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                  placeholder="Add context for all selected"
                  list="context-suggestions"
                  value={batchContextInput}
                  onChange={(e) => setBatchContextInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      addTag(batchContextInput, setBatchContexts, batchContexts)
                      setBatchContextInput("")
                    }
                  }}
                />
                <button
                  className="px-3 py-1 rounded bg-aurora-700 text-white font-semibold shadow hover:bg-aurora-900 transition-colors"
                  onClick={() => {
                    addTag(batchContextInput, setBatchContexts, batchContexts)
                    setBatchContextInput("")
                  }}
                >
                  Add context
                </button>
              </div>
              {batchContexts.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {batchContexts.map((c) => (
                    <span key={c} className="px-2 py-0.5 rounded text-xs" style={tagColor(c)}>
                      {c}
                      <button
                        className="ml-1 text-xs"
                        onClick={() => setBatchContexts(batchContexts.filter((x) => x !== c))}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex flex-col gap-2">
            {batchItems.map((item) => (
              <div key={item.id} className="border border-zinc-200 dark:border-zinc-700 rounded p-3 bg-zinc-50 dark:bg-zinc-800">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={item.selected}
                    disabled={!item.ok}
                    onChange={(e) =>
                      setBatchItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, selected: e.target.checked } : i)))
                    }
                  />
                  <div className="flex-1">
                    <div className="font-semibold">
                      {item.title || item.doi || "(no title)"}
                    </div>
                    <div className="text-sm text-zinc-500">DOI: {item.doi || "(missing)"}</div>
                    {item.author && (
                      <div className="text-sm text-zinc-500">Authors: {item.author}</div>
                    )}
                    {item.year && (
                      <div className="text-sm text-zinc-500">Year: {item.year}</div>
                    )}
                    <div className="text-sm text-zinc-500">Source: {item.metadata?.source || (item.resolved ? "crossref" : "-")}</div>
                    {item.url && (
                      <div className="text-sm text-aurora-700 truncate">
                        <a href={item.url} target="_blank" rel="noreferrer">
                          {item.url}
                        </a>
                      </div>
                    )}
                    {item.error && <div className="text-sm text-rose-500">{item.error}</div>}
                  </div>
                  <div className="text-sm text-zinc-400">
                    {item.resolved ? "Resolved" : "Unresolved"}
                    {item.status === "adding" && " · Adding..."}
                    {item.status === "done" && " · Added"}
                    {item.status === "error" && " · Failed"}
                  </div>
                </div>

                {item.ok && (
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <label className="px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-100 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors cursor-pointer text-xs">
                      <input
                        type="file"
                        accept="application/pdf"
                        className="hidden"
                        onChange={(e) =>
                          setBatchItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, file: e.target.files?.[0] ?? null } : i)))
                        }
                      />
                      {item.file ? "Change PDF" : "Optional PDF"}
                    </label>
                    {item.file && (
                      <span className="text-xs text-zinc-500 truncate max-w-60">{item.file.name}</span>
                    )}
                    <input
                      className="border border-zinc-300 dark:border-zinc-700 rounded px-2 py-1 text-sm bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                      placeholder="Add tag"
                      list="tag-suggestions"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault()
                          const value = (e.currentTarget as HTMLInputElement).value
                          const clean = value.trim().toLowerCase()
                          if (!clean) return
                          setBatchItems((prev) => prev.map((i) =>
                            i.id === item.id
                              ? { ...i, tags: Array.from(new Set([...(i.tags || []), clean])) }
                              : i
                          ))
                          e.currentTarget.value = ""
                        }
                      }}
                    />
                    {Array.isArray(item.tags) && item.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {item.tags.map((t) => (
                          <span key={t} className="px-2 py-0.5 rounded text-xs" style={tagColor(t)}>
                            {t}
                            <button
                              className="ml-1 text-xs"
                              onClick={() =>
                                setBatchItems((prev) => prev.map((i) =>
                                  i.id === item.id
                                    ? { ...i, tags: (i.tags || []).filter((x) => x !== t) }
                                    : i
                                ))
                              }
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                    <input
                      className="border border-zinc-300 dark:border-zinc-700 rounded px-2 py-1 text-sm bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                      placeholder="Add context"
                      list="context-suggestions"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault()
                          const value = (e.currentTarget as HTMLInputElement).value
                          const clean = value.trim().toLowerCase()
                          if (!clean) return
                          setBatchItems((prev) => prev.map((i) =>
                            i.id === item.id
                              ? { ...i, contexts: Array.from(new Set([...(i.contexts || []), clean])) }
                              : i
                          ))
                          e.currentTarget.value = ""
                        }
                      }}
                    />
                    {Array.isArray(item.contexts) && item.contexts.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {item.contexts.map((c) => (
                          <span key={c} className="px-2 py-0.5 rounded text-xs" style={tagColor(c)}>
                            {c}
                            <button
                              className="ml-1 text-xs"
                              onClick={() =>
                                setBatchItems((prev) => prev.map((i) =>
                                  i.id === item.id
                                    ? { ...i, contexts: (i.contexts || []).filter((x) => x !== c) }
                                    : i
                                ))
                              }
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                    {item.resolved && (
                      <button
                        className="text-sm text-aurora-700 hover:underline"
                        onClick={() =>
                          setBatchItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, metaOpen: !i.metaOpen } : i)))
                        }
                      >
                        {item.metaOpen ? "Hide metadata" : "Show metadata"}
                      </button>
                    )}
                  </div>
                )}

                {item.metaOpen && item.metadata && (
                  <pre className="bg-zinc-100 dark:bg-zinc-900 p-2 max-h-50 overflow-auto rounded text-xs mt-2">
                    {JSON.stringify(item.metadata, null, 2)}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
