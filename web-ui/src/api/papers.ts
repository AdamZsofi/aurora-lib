import { Paper } from "../types/paper"

function withLibrary(url: string, library?: string | null) {
  if (!library) return url
  const joiner = url.includes("?") ? "&" : "?"
  return `${url}${joiner}library=${encodeURIComponent(library)}`
}

export async function fetchPapers(library?: string | null): Promise<Paper[]> {
  const r = await fetch(withLibrary("/api/papers", library))
  const j = await r.json()
  return j.papers || []
}

export async function deletePaper(id: string, library?: string | null) {
  if (!confirm("Delete paper? This is irreversible.")) return
  await fetch(withLibrary(`/api/papers/${encodeURIComponent(id)}`, library), { method: "DELETE" })
  window.location.reload()
}
