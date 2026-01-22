import { Paper } from "../types/paper"
import { apiDeletePaper, apiGetPapers } from "./bridge"

export async function fetchPapers(library?: string | null): Promise<Paper[]> {
  const j = await apiGetPapers(library)
  return j.papers || []
}

export async function deletePaper(id: string, library?: string | null) {
  if (!confirm("Delete paper? This is irreversible.")) return
  await apiDeletePaper(id, library)
  window.location.reload()
}
