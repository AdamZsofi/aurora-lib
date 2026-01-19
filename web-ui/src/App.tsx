import { useEffect, useMemo, useRef, useState } from "react"
import { Paper } from "./types/paper"
import { fetchPapers } from "./api/papers"
import { useTheme } from "./hooks/useTheme"
import { PapersTable } from "./components/PapersTable"
import { LibsPanel } from "./components/LibsPanel"
import { AddPaper } from "./components/AddPaper"
import { PaperDetail } from "./components/PaperDetail"

export default function App() {
  const defaultTabs = [{ id: "__papers__", title: "📚" }]
  const [health, setHealth] = useState<string | null>(null)
  const [papers, setPapers] = useState<Paper[]>([])
  const [library, setLibrary] = useState<string | null>(() => {
    try {
      return localStorage.getItem("aurora.library")
    } catch {
      return null
    }
  })
  const [showLibs, setShowLibs] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const restoredRef = useRef(false)
  const [tabs, setTabs] = useState<Array<{ id: string, title: string }>>(() => {
    try {
      const raw = localStorage.getItem("aurora.tabs")
      if (raw) {
        const savedTabs = JSON.parse(raw)
        if (Array.isArray(savedTabs)) {
          const cleaned = savedTabs.filter((t) => t && t.id && t.id !== "__papers__")
          return [...defaultTabs, ...cleaned]
        }
      }
    } catch {
      // ignore
    }
    return defaultTabs
  })
  const [activeTab, setActiveTab] = useState<string>(() => {
    try {
      const rawActive = localStorage.getItem("aurora.activeTab")
      if (rawActive) return rawActive
    } catch {
      // ignore
    }
    return "__papers__"
  })
  const [paperCache, setPaperCache] = useState<Record<string, any>>({})
  const [paperLoading, setPaperLoading] = useState<Record<string, boolean>>({})
  const [username, setUsername] = useState<string>("")
  const [noteAuthors, setNoteAuthors] = useState<string[]>([])
  const libsDropdownRef = useRef<HTMLDivElement>(null)
  const tabsContainerRef = useRef<HTMLDivElement>(null)
  const [tabsOverflowOpen, setTabsOverflowOpen] = useState(false)
  const [tabsContainerWidth, setTabsContainerWidth] = useState(0)
  const { theme, setTheme } = useTheme()

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((j) => setHealth(j.status))
      .catch(() => setHealth("unavailable"))

    if (!library) {
      fetch("/api/lib")
        .then((r) => r.json())
        .then((j) => setLibrary(j.library))
        .catch(() => setLibrary(null))
    }
  }, [])

  useEffect(() => {
    try {
      if (library) localStorage.setItem("aurora.library", library)
      else localStorage.removeItem("aurora.library")
    } catch {
      // ignore
    }
  }, [library])

  useEffect(() => {
    fetchPapers(library).then(setPapers)
    setPaperCache({})
    setPaperLoading({})
    setTabs(defaultTabs)
    setActiveTab("__papers__")
    fetch(`/api/note-authors${library ? `?library=${encodeURIComponent(library)}` : ""}`)
      .then((r) => r.json())
      .then((j) => setNoteAuthors(j.authors || []))
      .catch(() => setNoteAuthors([]))
  }, [library])

  useEffect(() => {
    restoredRef.current = true
  }, [])

  // Persist tabs and active tab
  useEffect(() => {
    if (!restoredRef.current) return
    try {      
      const toSave = tabs.filter((t) => t.id !== "__papers__")
      localStorage.setItem("aurora.tabs", JSON.stringify(toSave))
      localStorage.setItem("aurora.activeTab", activeTab)
    } catch {
      // ignore
    }
  }, [tabs, activeTab])

  useEffect(() => {
    if (!tabs.some((t) => t.id === activeTab)) {
      setActiveTab("__papers__")
    }
  }, [tabs, activeTab])

  // Restore username from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem("aurora.username")
      if (raw) setUsername(raw)
    } catch {
      // ignore
    }
  }, [])

  // Persist username
  useEffect(() => {
    try {
      localStorage.setItem("aurora.username", username)
    } catch {
      // ignore
    }
  }, [username])

  // global escape handler to close modals and dropdown
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (showAdd) setShowAdd(false)
        else if (showLibs) setShowLibs(false)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [showAdd, showLibs])

  // close dropdown if clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        libsDropdownRef.current &&
        !libsDropdownRef.current.contains(event.target as Node)
      ) {
        setShowLibs(false)
      }
    }
    if (showLibs) {
      document.addEventListener("mousedown", handleClickOutside)
    } else {
      document.removeEventListener("mousedown", handleClickOutside)
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [showLibs])

  useEffect(() => {
    function handleResize() {
      setTabsContainerWidth(tabsContainerRef.current?.clientWidth ?? 0)
    }
    handleResize()
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [])

  const { visibleTabs, hiddenTabs } = useMemo(() => {
    const minTabWidth = 140
    const overflowButtonWidth = 48
    const totalTabs = tabs.length
    if (tabsContainerWidth <= 0 || totalTabs <= 1) {
      return { visibleTabs: tabs, hiddenTabs: [] as Array<{ id: string; title: string }> }
    }

    let available = tabsContainerWidth
    const needsOverflow = totalTabs * minTabWidth > tabsContainerWidth
    if (needsOverflow) available -= overflowButtonWidth
    const maxVisible = Math.max(1, Math.floor(available / minTabWidth))

    if (!needsOverflow || totalTabs <= maxVisible) {
      return { visibleTabs: tabs, hiddenTabs: [] as Array<{ id: string; title: string }> }
    }

    const initialVisible = tabs.slice(0, maxVisible)
    const rest = tabs.slice(maxVisible)
    if (initialVisible.some((t) => t.id === activeTab)) {
      return { visibleTabs: initialVisible, hiddenTabs: rest }
    }

    const active = tabs.find((t) => t.id === activeTab)
    if (!active) {
      return { visibleTabs: initialVisible, hiddenTabs: rest }
    }

    const nextVisible = [...initialVisible]
    nextVisible[nextVisible.length - 1] = active
    const hidden = tabs.filter((t) => !nextVisible.some((v) => v.id === t.id))
    return { visibleTabs: nextVisible, hiddenTabs: hidden }
  }, [tabs, activeTab, tabsContainerWidth])

  async function fetchPaper(id: string) {
    setPaperLoading((prev) => ({ ...prev, [id]: true }))
    try {
      const url = library
        ? `/api/papers/${encodeURIComponent(id)}?library=${encodeURIComponent(library)}`
        : `/api/papers/${encodeURIComponent(id)}`
      const r = await fetch(url)
      const j = await r.json()
      const paper = j.paper || j
      setPaperCache((prev) => ({ ...prev, [id]: paper }))
      if (paper?.title) {
        setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, title: paper.title } : t)))
      }
    } catch {
      setPaperCache((prev) => ({ ...prev, [id]: null }))
    } finally {
      setPaperLoading((prev) => ({ ...prev, [id]: false }))
    }
  }

  useEffect(() => {
    if (activeTab !== "__papers__" && paperCache[activeTab] === undefined) {
      fetchPaper(activeTab)
    }
  }, [activeTab, paperCache])

  return (
    <div className="min-h-screen flex flex-col bg-zinc-50 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 font-sans">
      {/* Header */}
      <header className="w-full px-6 py-4 flex justify-between items-center bg-white/80 dark:bg-zinc-900/80 shadow-sm border-b border-zinc-200 dark:border-zinc-800 sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <span className="text-2xl mr-2" aria-label="Aurora">🌌</span>
          <h1 className="text-3xl font-bold text-aurora-500 dark:text-aurora-400 m-0">Aurora Lib</h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-zinc-500">User</span>
            <input
              className="border border-zinc-300 dark:border-zinc-700 rounded px-2 py-1 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 w-40"
              placeholder="Your name"
              value={username}
              list="note-authors"
              onChange={(e) => setUsername(e.target.value)}
            />
            <datalist id="note-authors">
              {noteAuthors.map((a) => (
                <option key={a} value={a} />
              ))}
            </datalist>
          </div>
          <div className="relative" ref={libsDropdownRef}>
            <h2 className="sr-only">Library:</h2>
            <button
              className="px-3 py-1 rounded bg-linear-to-r from-aurora-400 to-aurora-500 text-white font-semibold shadow hover:from-aurora-500 hover:to-aurora-600 transition-colors min-w-40 flex items-center justify-between gap-2"
              onClick={() => setShowLibs((s) => !s)}
              aria-haspopup="listbox"
              aria-expanded={showLibs}
            >
              <span>{library ?? "(unknown)"}</span>
              <svg className={`w-4 h-4 ml-2 transition-transform ${showLibs ? "rotate-180" : "rotate-0"}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
            </button>
            {showLibs && (
              <div className="absolute right-0 mt-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded shadow-lg z-30 min-w-45 max-h-60 overflow-y-auto animate-fade-in">
                  <LibsPanel
                    onPick={(l) => {
                      setLibrary(l)
                      setShowLibs(false)
                    }}
                  />
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex flex-col flex-1">
        <div
          className="flex items-end border-b border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/80 px-6 pt-2 overflow-hidden"
          ref={tabsContainerRef}
        >
          {visibleTabs.map((tab) => (
            <div
              key={tab.id}
              className={`flex items-center px-3 py-2 mr-2 rounded-t-lg cursor-pointer select-none transition-colors w-fit max-w-55
                ${activeTab === tab.id
                  ? "bg-aurora-100 dark:bg-aurora-800 text-aurora-900 dark:text-aurora-100 font-semibold border-x border-t border-zinc-200 dark:border-zinc-800"
                  : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700"}
              `}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="truncate" title={tab.title}>{tab.title}</span>
              {tab.id !== "__papers__" && (
                <button
                  className="ml-2 text-zinc-400 hover:text-aurora-600 focus:outline-none shrink-0"
                  onClick={e => {
                    e.stopPropagation()
                    setTabs(tabs => tabs.filter(t => t.id !== tab.id))
                    // If closing active tab, go to papers tab
                    if (activeTab === tab.id) setActiveTab("__papers__")
                  }}
                  title="Close tab"
                >
                  ×
                </button>
              )}
            </div>
          ))}
          {hiddenTabs.length > 0 && (
            <div className="relative">
              <button
                className="px-2 py-2 rounded-t-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                onClick={() => setTabsOverflowOpen((s) => !s)}
                aria-haspopup="menu"
                aria-expanded={tabsOverflowOpen}
                title="More tabs"
              >
                •••
              </button>
              {tabsOverflowOpen && (
                <div className="absolute right-0 mt-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded shadow-lg z-30 min-w-48 max-h-60 overflow-y-auto">
                  {hiddenTabs.map((tab) => (
                    <div
                      key={tab.id}
                      className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-700"
                      onClick={() => {
                        setActiveTab(tab.id)
                        setTabsOverflowOpen(false)
                      }}
                    >
                      <span className="truncate" title={tab.title}>{tab.title}</span>
                      {tab.id !== "__papers__" && (
                        <button
                          className="ml-2 text-zinc-400 hover:text-aurora-600 focus:outline-none shrink-0"
                          onClick={(e) => {
                            e.stopPropagation()
                            setTabs(tabs => tabs.filter(t => t.id !== tab.id))
                            if (activeTab === tab.id) setActiveTab("__papers__")
                          }}
                          title="Close tab"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <main className="flex-1 px-6 py-4">
          {/* Papers tab */}
          <div className={activeTab === "__papers__" ? "block" : "hidden"}>
            <div className="my-4 flex justify-between items-center">
              <button
                className="px-4 py-2 rounded bg-aurora-600 text-white font-semibold shadow hover:bg-aurora-700 transition-colors"
                onClick={() => setShowAdd(true)}
              >
                Add paper
              </button>
            </div>
            <div className="overflow-x-auto">
              <PapersTable
                papers={papers}
                library={library}
                onSelect={(id) => {
                  // Open a new tab for this paper if not already open
                  setTabs(tabs => {
                    if (tabs.some(t => t.id === id)) return tabs
                    // Find paper title
                    const paper = papers.find(p => p.id === id || p.ref === id)
                    return [
                      ...tabs,
                      { id, title: paper?.title || "Paper" }
                    ]
                  })
                  setActiveTab(id)
                }}
              />
            </div>
          </div>

          {/* Detail tabs - keep mounted to prevent PDF reload */}
          {tabs.filter(t => t.id !== "__papers__").map((tab) => (
            <div key={tab.id} className={activeTab === tab.id ? "block" : "hidden"}>
              <PaperDetail
                id={tab.id}
                paper={paperCache[tab.id] ?? null}
                loading={paperLoading[tab.id] ?? false}
                onClose={() => {
                  setTabs(tabs => tabs.filter(t => t.id !== tab.id))
                  setActiveTab("__papers__")
                }}
                onRefresh={() => fetchPaper(tab.id)}
                library={library}
                username={username}
                onNoteAuthorsRefresh={() => {
                  fetch(`/api/note-authors${library ? `?library=${encodeURIComponent(library)}` : ""}`)
                    .then((r) => r.json())
                    .then((j) => setNoteAuthors(j.authors || []))
                    .catch(() => setNoteAuthors([]))
                }}
                onUpdatePaper={(paper) => {
                  if (!paper) return
                  setPaperCache((prev) => ({ ...prev, [tab.id]: paper }))
                  if (paper?.title) {
                    setTabs((prev) => prev.map((t) => (t.id === tab.id ? { ...t, title: paper.title } : t)))
                  }
                }}
              />
            </div>
          ))}

          {showAdd && (
            <AddPaper
              onClose={() => setShowAdd(false)}
              onAdded={() => {
                setShowAdd(false)
                fetchPapers(library).then(setPapers)
              }}
              library={library}
            />
          )}
        </main>
      </div>

      {/* Footer */}
      <footer className="w-full px-6 py-3 bg-white/80 dark:bg-zinc-900/80 border-t border-zinc-200 dark:border-zinc-800 text-sm flex justify-between items-center">
        <span className="text-zinc-400 dark:text-zinc-400">
          Backend health: {health ?? "checking..."}
        </span>
        <span className="text-zinc-300 dark:text-zinc-600">&copy; {new Date().getFullYear()} solarowl</span>
      </footer>
    </div>
  )
}
