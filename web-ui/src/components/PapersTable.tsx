import { useEffect, useState } from "react"
import { Paper } from "../types/paper"
import { deletePaper } from "../api/papers"
import { READ_STATE_OPTIONS, readStateEmoji, readStateLabel } from "../utils/readState"

export function PapersTable({
  papers,
  onSelect,
  library,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  showSelection,
  hideOpenPdf,
  sortKey,
  sortDir,
  onSort,
  onUpdateReadState,
}: {
  papers: Paper[]
  onSelect: (id: string) => void // now opens a tab in parent
  library?: string | null
  selectedIds: Set<string>
  onToggleSelect: (id: string, checked: boolean) => void
  onToggleSelectAll: (checked: boolean) => void
  showSelection: boolean
  hideOpenPdf?: boolean
  sortKey: "title" | "year" | "authors" | null
  sortDir: "asc" | "desc"
  onSort: (key: "title" | "year" | "authors") => void
  onUpdateReadState: (id: string, state: string) => void
}) {
  const sortIndicator = (key: "title" | "year" | "authors") => {
    if (sortKey !== key) return ""
    return sortDir === "asc" ? "↑" : "↓"
  }

  const [openReadStateFor, setOpenReadStateFor] = useState<string | null>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as HTMLElement
      if (target.closest(".read-state-menu") || target.closest(".read-state-toggle")) {
        return
      }
      setOpenReadStateFor(null)
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  async function openPdf(id: string) {
    const url = library
      ? `/api/papers/${encodeURIComponent(id)}/pdf/open?library=${encodeURIComponent(library)}`
      : `/api/papers/${encodeURIComponent(id)}/pdf/open`
    const r = await fetch(url, { method: "POST" })
    if (!r.ok) {
      const j = await r.json().catch(() => ({}))
      throw new Error(j.detail || "Failed to open PDF")
    }
  }

  return (
    <table className="w-full border-collapse mt-3">
      <thead>
        <tr className="bg-zinc-100 dark:bg-zinc-800">
          {showSelection && (
            <th className="px-3 py-2 text-left">
              <input
                type="checkbox"
                aria-label="Select all"
                checked={papers.length > 0 && papers.every((p) => selectedIds.has(p.id || p.ref || ""))}
                onChange={(e) => onToggleSelectAll(e.target.checked)}
                onClick={(e) => e.stopPropagation()}
              />
            </th>
          )}
          <th className="px-3 py-2 text-left">
            <button
              className="flex items-center gap-1 text-left w-full hover:text-aurora-700"
              onClick={() => onSort("title")}
              aria-sort={sortKey === "title" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
            >
              <span>Title</span>
              <span className="text-xs text-zinc-400">{sortIndicator("title")}</span>
            </button>
          </th>
          <th className="px-3 py-2 text-left">
            <button
              className="flex items-center gap-1 text-left w-full hover:text-aurora-700"
              onClick={() => onSort("year")}
              aria-sort={sortKey === "year" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
            >
              <span>Year</span>
              <span className="text-xs text-zinc-400">{sortIndicator("year")}</span>
            </button>
          </th>
          <th className="px-3 py-2 text-left">
            <button
              className="flex items-center gap-1 text-left w-full hover:text-aurora-700"
              onClick={() => onSort("authors")}
              aria-sort={sortKey === "authors" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
            >
              <span>Authors</span>
              <span className="text-xs text-zinc-400">{sortIndicator("authors")}</span>
            </button>
          </th>
          {/*<th className="px-3 py-2 text-left">DOI</th>*/}
          {/*<th className="px-3 py-2 text-left">Papis ID</th>*/}
          <th className="px-3 py-2 text-left">Status</th>
          <th className="px-3 py-2 text-left">Actions</th>
        </tr>
      </thead>
      <tbody>
        {papers.map((p, i) => (
          <tr
            key={i}
            className="hover:bg-aurora-100 dark:hover:bg-aurora-300 cursor-pointer"
            onClick={() => onSelect(p.id || p.ref || "")}
          >
            {showSelection && (
              <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  aria-label="Select paper"
                  checked={selectedIds.has(p.id || p.ref || "")}
                  onChange={(e) => onToggleSelect(p.id || p.ref || "", e.target.checked)}
                />
              </td>
            )}
            <td className="px-3 py-2 max-w-lg whitespace-normal wrap-break-word">
              {p.title || "(no title)"}
            </td>
            <td className="px-3 py-2 whitespace-nowrap">
              {p.year ?? ""}
            </td>
            <td className="px-3 py-2 whitespace-normal wrap-break-word">
              {Array.isArray(p.authors) ? p.authors.join(", ") : p.authors}
            </td>
            {/*<td className="px-3 py-2">{p.doi}</td>*/}
            {/*<td className="px-3 py-2">{p.id}</td>*/}
            <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
              <div className="relative inline-flex">
                <button
                  className="read-state-toggle text-lg"
                  title={readStateLabel(p.read_state || p.raw?.aurora_read_state || "unread")}
                  onClick={(e) => {
                    e.stopPropagation()
                    const id = p.id || p.ref || ""
                    setOpenReadStateFor((prev) => (prev === id ? null : id))
                  }}
                >
                  {readStateEmoji(p.read_state || p.raw?.aurora_read_state || "unread")}
                </button>
                {openReadStateFor === (p.id || p.ref || "") && (
                  <div className="read-state-menu absolute left-0 mt-2 z-20 w-44 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 shadow-lg">
                    {READ_STATE_OPTIONS.map((o) => (
                      <button
                        key={o.value}
                        className="w-full px-3 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-700"
                        onClick={(e) => {
                          e.stopPropagation()
                          onUpdateReadState(p.id || p.ref || "", o.value)
                          setOpenReadStateFor(null)
                        }}
                      >
                        <span className="mr-2">{o.emoji}</span>
                        {o.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </td>
            <td className="px-3 py-2">
              <div className="flex items-center gap-2">
                {!hideOpenPdf && (Array.isArray(p.files)
                  ? p.files.some((f) => f.toLowerCase().endsWith(".pdf"))
                  : false) && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      openPdf(p.id || "").catch((err) => alert(err.message || "Failed to open PDF"))
                    }}
                    className="px-1.5 py-1 rounded bg-aurora-400 text-white font-semibold shadow-sm transition-colors hover:bg-aurora-700"
                  >
                    Open PDF
                  </button>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    deletePaper(p.id || "", library)
                  }}
                  className="px-2 py-1 rounded bg-aurora-900 text-white transition-colors hover:bg-aurora-800"
                >
                  Delete
                </button>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
