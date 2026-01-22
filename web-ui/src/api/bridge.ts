import { Paper } from "../types/paper"

type PywebviewApi = {
  health: () => Promise<{ status: string }>
  get_lib: () => Promise<{ library: string | null }>
  get_libs: () => Promise<{ libraries: string[] }>
  set_lib: (library: string) => Promise<{ ok: boolean; library: string }>
  get_papers: (library?: string | null) => Promise<{ papers: Paper[] }>
  get_paper: (paper_id: string, library?: string | null) => Promise<{ paper: any }>
  resolve: (doi: string) => Promise<any>
  resolve_bib: (file_name: string, file_base64: string) => Promise<{ count: number; items: any[] }>
  resolve_dois: (dois: Array<string | null>) => Promise<{ count: number; items: any[] }>
  add_paper: (
    metadata: any,
    file_base64?: string | null,
    file_name?: string | null,
    library?: string | null
  ) => Promise<any>
  delete_paper: (paper_id: string, library?: string | null) => Promise<{ ok: boolean; id: string }>
  get_tags: (library?: string | null) => Promise<{ tags: string[] }>
  set_paper_tags: (
    paper_id: string,
    tags: string[],
    library?: string | null
  ) => Promise<{ ok: boolean; paper: any }>
  add_paper_note: (
    paper_id: string,
    author: string,
    text: string,
    library?: string | null
  ) => Promise<{ ok: boolean; paper: any }>
  get_note_authors: (library?: string | null) => Promise<{ authors: string[] }>
  add_pdf: (
    paper_id: string,
    file_base64: string,
    file_name: string,
    library?: string | null
  ) => Promise<{ ok: boolean; paper: any }>
  get_pdf: (paper_id: string, library?: string | null) => Promise<{ mime: string; data: string }>
}

type PywebviewWindow = Window & { pywebview?: { api?: PywebviewApi } }

function getPywebviewApi(): PywebviewApi | null {
  if (typeof window === "undefined") return null
  const w = window as PywebviewWindow
  return w.pywebview?.api ?? null
}

function withLibrary(url: string, library?: string | null) {
  if (!library) return url
  const joiner = url.includes("?") ? "&" : "?"
  return `${url}${joiner}library=${encodeURIComponent(library)}`
}

async function readErrorDetail(response: Response) {
  try {
    const j = await response.json()
    return j?.detail || response.statusText || "Request failed"
  } catch {
    return response.statusText || "Request failed"
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer)
  const chunkSize = 0x8000
  let binary = ""
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
}

async function fileToBase64(file: File) {
  const buffer = await file.arrayBuffer()
  return arrayBufferToBase64(buffer)
}

export async function apiHealth() {
  const api = getPywebviewApi()
  if (api) return api.health()
  const r = await fetch("/api/health")
  return r.json()
}

export async function apiGetLib() {
  const api = getPywebviewApi()
  if (api) return api.get_lib()
  const r = await fetch("/api/lib")
  return r.json()
}

export async function apiGetLibs() {
  const api = getPywebviewApi()
  if (api) return api.get_libs()
  const r = await fetch("/api/libs")
  return r.json()
}

export async function apiSetLib(library: string) {
  const api = getPywebviewApi()
  if (api) return api.set_lib(library)
  const r = await fetch("/api/lib", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ library }),
  })
  if (!r.ok) throw new Error(await readErrorDetail(r))
  return r.json()
}

export async function apiGetPapers(library?: string | null) {
  const api = getPywebviewApi()
  if (api) return api.get_papers(library)
  const r = await fetch(withLibrary("/api/papers", library))
  return r.json()
}

export async function apiGetPaper(id: string, library?: string | null) {
  const api = getPywebviewApi()
  if (api) return api.get_paper(id, library)
  const url = withLibrary(`/api/papers/${encodeURIComponent(id)}`, library)
  const r = await fetch(url)
  return r.json()
}

export async function apiResolveDoi(doi: string) {
  const api = getPywebviewApi()
  if (api) return api.resolve(doi)
  const r = await fetch(`/api/resolve?doi=${encodeURIComponent(doi)}`)
  if (!r.ok) throw new Error(await readErrorDetail(r))
  return r.json()
}

export async function apiResolveBib(file: File) {
  const api = getPywebviewApi()
  if (api) {
    const base64 = await fileToBase64(file)
    return api.resolve_bib(file.name, base64)
  }
  const form = new FormData()
  form.append("file", file)
  const r = await fetch("/api/resolve-bib", { method: "POST", body: form })
  if (!r.ok) throw new Error(await readErrorDetail(r))
  return r.json()
}

export async function apiResolveDois(dois: Array<string | null>) {
  const api = getPywebviewApi()
  if (api) return api.resolve_dois(dois)
  const r = await fetch("/api/resolve-dois", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dois }),
  })
  if (!r.ok) throw new Error(await readErrorDetail(r))
  return r.json()
}

export async function apiAddPaper(metadata: any, file: File | null, library?: string | null) {
  const api = getPywebviewApi()
  if (api) {
    const base64 = file ? await fileToBase64(file) : null
    return api.add_paper(metadata, base64, file?.name ?? null, library)
  }
  const form = new FormData()
  form.append("metadata", JSON.stringify(metadata))
  if (file) form.append("file", file)
  const url = withLibrary("/api/papers", library)
  const r = await fetch(url, { method: "POST", body: form })
  if (!r.ok) throw new Error(await readErrorDetail(r))
  return r.json()
}

export async function apiDeletePaper(id: string, library?: string | null) {
  const api = getPywebviewApi()
  if (api) return api.delete_paper(id, library)
  await fetch(withLibrary(`/api/papers/${encodeURIComponent(id)}`, library), { method: "DELETE" })
  return { ok: true, id }
}

export async function apiGetTags(library?: string | null) {
  const api = getPywebviewApi()
  if (api) return api.get_tags(library)
  const r = await fetch(withLibrary("/api/tags", library))
  return r.json()
}

export async function apiSetPaperTags(id: string, tags: string[], library?: string | null) {
  const api = getPywebviewApi()
  if (api) return api.set_paper_tags(id, tags, library)
  const url = withLibrary(`/api/papers/${encodeURIComponent(id)}/tags`, library)
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tags }),
  })
  if (!r.ok) throw new Error(await readErrorDetail(r))
  return r.json()
}

export async function apiAddPaperNote(
  id: string,
  author: string,
  text: string,
  library?: string | null
) {
  const api = getPywebviewApi()
  if (api) return api.add_paper_note(id, author, text, library)
  const url = withLibrary(`/api/papers/${encodeURIComponent(id)}/notes`, library)
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ author, text }),
  })
  if (!r.ok) throw new Error(await readErrorDetail(r))
  return r.json()
}

export async function apiGetNoteAuthors(library?: string | null) {
  const api = getPywebviewApi()
  if (api) return api.get_note_authors(library)
  const url = withLibrary("/api/note-authors", library)
  const r = await fetch(url)
  return r.json()
}

export async function apiAddPdfToPaper(
  id: string,
  file: File,
  library?: string | null
) {
  const api = getPywebviewApi()
  if (api) {
    const base64 = await fileToBase64(file)
    return api.add_pdf(id, base64, file.name, library)
  }
  const form = new FormData()
  form.append("file", file)
  const url = withLibrary(`/api/papers/${encodeURIComponent(id)}/pdf`, library)
  const r = await fetch(url, {
    method: "POST",
    body: form,
  })
  if (!r.ok) throw new Error(await readErrorDetail(r))
  return r.json()
}

export async function apiGetPdfUrl(
  id: string,
  library?: string | null
): Promise<{ url: string; revoke?: () => void }> {
  const api = getPywebviewApi()
  if (api) {
    const { mime, data } = await api.get_pdf(id, library)
    const binary = atob(data)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    const blob = new Blob([bytes], { type: mime || "application/pdf" })
    const url = URL.createObjectURL(blob)
    return { url, revoke: () => URL.revokeObjectURL(url) }
  }
  const url = withLibrary(`/api/papers/${encodeURIComponent(id)}/pdf`, library)
  return { url }
}
