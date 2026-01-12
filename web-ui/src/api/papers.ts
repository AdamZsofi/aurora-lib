import { Paper } from "../types/paper"

export async function fetchPapers(): Promise<Paper[]> {
  const r = await fetch("/api/papers")
  const j = await r.json()
  return j.papers || []
}

export async function deletePaper(id: string) {
  if (!confirm("Delete paper? This is irreversible.")) return
  await fetch(`/api/papers/${encodeURIComponent(id)}`, { method: "DELETE" })
  window.location.reload()
}
