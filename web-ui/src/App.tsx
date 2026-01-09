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
  const [showAdd, setShowAdd] = useState(false)

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((j) => setHealth(j.status))
      .catch(() => setHealth("unavailable"))

    fetchPapers()
  }, [])

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
    <div style={{ padding: 24, fontFamily: "sans-serif" }}>
      <h1>Ref Project UI — scaffold</h1>
      <p>Backend health: {health ?? "checking..."}</p>

      <div style={{ marginTop: 16, marginBottom: 16 }}>
        <button onClick={() => setShowAdd(true)}>Add paper</button>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>Title</th>
            <th style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>Authors</th>
            <th style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>DOI</th>
            <th style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>Papis ID</th>
          </tr>
        </thead>
        <tbody>
          {papers.map((p, i) => (
            <tr key={i}>
              <td style={{ padding: "8px 4px" }}>{p.title || p.id || "(no title)"}</td>
              <td style={{ padding: "8px 4px" }}>{Array.isArray(p.author) ? p.author.join(", ") : p.author}</td>
              <td style={{ padding: "8px 4px" }}>{p.doi || ""}</td>
              <td style={{ padding: "8px 4px" }}>{p.id || ""}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {showAdd && (
        <AddPaper
          onClose={() => setShowAdd(false)}
          onAdded={() => {
            setShowAdd(false)
            fetchPapers()
          }}
        />
      )}
    </div>
  )
}

function AddPaper({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [doi, setDoi] = useState("")
  const [metaText, setMetaText] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [status, setStatus] = useState<string | null>(null)

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

  return (
    <div style={{ position: "fixed", left: 20, right: 20, top: 40, bottom: 40, background: "white", border: "1px solid #ccc", padding: 20, overflow: "auto" }}>
      <h2>Add paper</h2>
      <div style={{ marginBottom: 8 }}>
        <label>DOI: <input value={doi} onChange={(e) => setDoi(e.target.value)} style={{ width: 400 }} /></label>
        <button onClick={fetchMeta} style={{ marginLeft: 8 }}>Fetch metadata</button>
      </div>

      <div style={{ marginBottom: 8 }}>
        <label>PDF file: <input type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></label>
      </div>

      <div style={{ marginBottom: 8 }}>
        <label>Metadata (JSON editable):</label>
        <textarea value={metaText} onChange={(e) => setMetaText(e.target.value)} rows={12} style={{ width: "100%" }} />
      </div>

      <div>
        <button onClick={submitAdd} disabled={!file}>Add to library</button>
        <button onClick={onClose} style={{ marginLeft: 8 }}>Cancel</button>
        <span style={{ marginLeft: 12 }}>{status}</span>
      </div>
    </div>
  )
}

export default App
