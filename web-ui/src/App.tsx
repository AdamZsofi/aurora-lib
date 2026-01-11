import React, { useEffect, useState } from "react"

type Paper = {
  id?: string
  title?: string
  author?: string | string[]
  doi?: string
}

function App() {
  const [health, setHealth] = useState<string | null>(null)
  const [papers, setPapers] = useState<Paper[]>([])
  const [library, setLibrary] = useState<string | null>(null)
  const [showLibs, setShowLibs] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [theme, setTheme] = useState<'dark'|'light'>(() => (localStorage.getItem('theme') === 'light' ? 'light' : 'dark'))

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((j) => setHealth(j.status))
      .catch(() => setHealth("unavailable"))
    fetch("/api/lib")
      .then((r) => r.json())
      .then((j) => setLibrary(j.library))
      .catch(() => setLibrary(null))
    fetchPapers()
    // apply theme from localStorage
    if (theme === 'light') document.documentElement.classList.remove('dark')
    else document.documentElement.classList.add('dark')
  }, [])

  // global escape handler to close modals
  useEffect(() => {
    function onKey(e: KeyboardEvent){
      if(e.key === 'Escape'){
        if(showAdd) setShowAdd(false)
        else if(detailId) setDetailId(null)
        else if(showLibs) setShowLibs(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showAdd, detailId, showLibs])

  function fetchPapers() {
    fetch("/api/papers")
      .then((r) => r.json())
      .then((j) => {
        const list = j.papers || []
        setPapers(list)
      })
      .catch(() => setPapers([]))
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 font-sans p-6">
      <h1 className="text-3xl font-bold mb-4 text-aurora-400 dark:text-aurora-200">Aurora Ref</h1>
      <div className="flex justify-between items-center gap-3 mb-4">
        <p className="m-0">Backend health: <span className="text-zinc-400 dark:text-zinc-400">{health ?? "checking..."}</span></p>
        <div className="relative flex gap-2 items-center">
          <button className="px-3 py-1 rounded bg-gradient-to-r from-aurora-400 to-aurora-600 text-white font-semibold shadow hover:from-aurora-500 hover:to-aurora-700 transition-colors" onClick={() => setShowLibs((s) => !s)}>Library: {library ?? "(unknown)"}</button>
          <button className="px-3 py-1 rounded border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-100 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors" onClick={() => { const next = theme === 'light' ? 'dark' : 'light'; setTheme(next); if(next === 'light') document.documentElement.classList.remove('dark'); else document.documentElement.classList.add('dark'); localStorage.setItem('theme', next) }}>{theme === 'light' ? '☀️ Light' : '🌌 Dark'}</button>
          {showLibs && (
            <div className="absolute top-full left-0 mt-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded shadow p-2 z-10 min-w-[160px]">
              <LibsPanel onPick={(l) => { setLibrary(l); setShowLibs(false) }} />
            </div>
          )}
        </div>
      </div>

      <div className="my-4">
        <button className="px-4 py-2 rounded bg-aurora-500 text-white font-semibold shadow hover:bg-aurora-600 transition-colors" onClick={() => setShowAdd(true)}>Add paper</button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse mt-3">
          <thead>
            <tr className="bg-zinc-100 dark:bg-zinc-800">
              <th className="text-left border-b border-zinc-300 dark:border-zinc-700 px-3 py-2">Title</th>
              <th className="text-left border-b border-zinc-300 dark:border-zinc-700 px-3 py-2">Authors</th>
              <th className="text-left border-b border-zinc-300 dark:border-zinc-700 px-3 py-2">DOI</th>
              <th className="text-left border-b border-zinc-300 dark:border-zinc-700 px-3 py-2">Papis ID</th>
              <th className="text-left border-b border-zinc-300 dark:border-zinc-700 px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {papers.map((p, i) => (
              <tr key={i} className="hover:bg-aurora-50 dark:hover:bg-aurora-900 cursor-pointer transition-colors" onClick={() => setDetailId(p.id || p.ref || "") }>
                <td className="px-3 py-2">{p.title || p.id || "(no title)"}</td>
                <td className="px-3 py-2">{Array.isArray(p.authors) ? p.authors.join(", ") : p.authors}</td>
                <td className="px-3 py-2">{p.doi || ""}</td>
                <td className="px-3 py-2">{p.id || ""}</td>
                <td className="px-3 py-2">
                  <button className="px-2 py-1 rounded bg-red-500 text-white hover:bg-red-600 transition-colors" onClick={(e) => { e.stopPropagation(); handleDelete(p.id || "") }}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <AddPaper
          onClose={() => setShowAdd(false)}
          onAdded={() => {
            setShowAdd(false)
            fetchPapers()
          }}
        />
      )}

      {detailId && (
        <PaperDetail id={detailId} onClose={() => setDetailId(null)} />
      )}
    </div>
  )
}

function AddPaper({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
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
    } catch (e) {
      setStatus("error")
    }
  }

  async function submitAdd() {
    setStatus("adding")
    const form = new FormData()
    form.append("metadata", metaText)
    if (file) form.append("file", file)
    try {
      const r = await fetch(`/api/papers`, { method: "POST", body: form })
      const j = await r.json()
      setStatus("done")
      onAdded()
    } catch (e) {
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
    <div className="fixed left-5 right-5 top-10 bottom-10 bg-white dark:bg-zinc-900 rounded-lg p-6 shadow-2xl z-50 overflow-auto flex flex-col gap-2 outline-none" tabIndex={0} onKeyDown={(e) => { if (e.key === "Escape") onClose() }}>
      <h2 className="text-xl font-bold mb-2">Add paper</h2>
      <div className="mb-2 flex items-center gap-2">
        <label className="flex items-center gap-2">DOI: <input className="border border-zinc-300 dark:border-zinc-700 rounded px-2 py-1 w-96 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100" value={doi} onChange={(e) => setDoi(e.target.value)} /></label>
        <button className="px-3 py-1 rounded bg-aurora-500 text-white font-semibold shadow hover:bg-aurora-600 transition-colors" onClick={fetchMeta}>Fetch metadata</button>
      </div>
      <div className="flex gap-4 mt-3">
        <div className="flex-1 min-w-[280px]">
          <div className="mb-2">
            <label className="flex items-center gap-2">PDF file: <input type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block" /></label>
          </div>
          <div className="mb-2">
            <label className="block mb-1">Metadata (JSON editable):</label>
            <textarea className="w-full border border-zinc-300 dark:border-zinc-700 rounded px-2 py-1 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100" value={metaText} onChange={(e) => setMetaText(e.target.value)} rows={20} />
          </div>
          <div className="flex items-center gap-3 mt-2">
            <button className="px-4 py-2 rounded bg-aurora-500 text-white font-semibold shadow hover:bg-aurora-600 transition-colors disabled:opacity-50" onClick={submitAdd} disabled={!file || status !== "fetched"}>Add to library</button>
            <button className="px-4 py-2 rounded border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-100 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors" onClick={onClose}>Cancel</button>
            <span className="ml-3 text-sm text-zinc-500 dark:text-zinc-400">{status}</span>
          </div>
        </div>
        <div className="flex-1">
          {filePreviewUrl && (
            <iframe src={filePreviewUrl} className="w-full h-[600px] border border-zinc-200 dark:border-zinc-700 rounded" />
          )}
        </div>
      </div>
    </div>
  )
}

// small component to pick libraries
function LibsPanel({ onPick }: { onPick: (l: string) => void }){
  const [libs, setLibs] = useState<string[]>([])
  useEffect(()=>{
    fetch('/api/libs').then(r=>r.json()).then(j=>setLibs(j.libraries || []))
  },[])
  return (
    <div className="flex flex-col gap-2">
      {libs.map((l)=> (
        <button key={l} className="px-3 py-1 rounded bg-aurora-400 text-white font-semibold hover:bg-aurora-500 transition-colors" onClick={() => { fetch('/api/lib', { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({library: l}) }).then(()=>onPick(l))}}>{l}</button>
      ))}
    </div>
  )
}

async function handleDelete(id: string){
  if(!id) return
  if(!confirm('Delete paper? This is irreversible.')) return
  try{
    await fetch(`/api/papers/${encodeURIComponent(id)}`, { method: 'DELETE' })
    // refresh
    window.location.reload()
  }catch(e){ alert('Failed to delete') }
}

function PaperDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const [paper, setPaper] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/papers/${encodeURIComponent(id)}`)
      .then((r) => r.json())
      .then((j) => {
        setPaper(j.paper || j)
      })
      .catch(() => setPaper(null))
      .finally(() => setLoading(false))
  }, [id])

  // Escape closes detail modal
  useEffect(() => {
    function onKey(e: KeyboardEvent){
      if(e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed left-5 right-5 top-10 bottom-10 bg-white dark:bg-zinc-900 rounded-lg p-6 shadow-2xl z-50 overflow-auto flex flex-col gap-2 outline-none">
      <div className="flex justify-between items-center mb-2">
        <h2 className="text-xl font-bold">Paper detail</h2>
        <div className="flex gap-2">
          <button className="px-3 py-1 rounded bg-red-500 text-white hover:bg-red-600 transition-colors" onClick={() => { if(confirm('Delete paper?')) { handleDelete(id); onClose(); } }}>Delete</button>
          <button className="px-3 py-1 rounded border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-100 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors" onClick={onClose}>Close</button>
        </div>
      </div>
      {loading && <div>Loading...</div>}
      {!loading && paper && (
        <div className="flex gap-4">
          <div className="flex-1 min-w-[280px]">
            <h3 className="text-lg font-semibold mb-1">{paper.title}</h3>
            <div className="mb-1"><strong>Authors:</strong> {Array.isArray(paper.authors) ? paper.authors.join(", ") : paper.authors}</div>
            <div className="mb-1"><strong>DOI:</strong> {paper.doi}</div>
            <div className="mt-3">
              <strong>All Metadata:</strong>
              <pre className="bg-zinc-100 dark:bg-zinc-800 p-2 max-h-[400px] overflow-auto rounded text-xs mt-1">{JSON.stringify(paper.raw || paper, null, 2)}</pre>
            </div>
          </div>
          <div className="flex-1">
            <strong>PDF preview:</strong>
            <div className="h-[600px] border border-zinc-200 dark:border-zinc-700 mt-1 rounded">
              <iframe src={`/api/papers/${encodeURIComponent(id)}/pdf`} className="w-full h-full" />
            </div>
          </div>
        </div>
      )}
      {!loading && !paper && <div>Failed to load paper</div>}
    </div>
  )
}

export default App
