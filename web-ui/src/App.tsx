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
  const libsDropdownRef = useRef<HTMLDivElement>(null)
  const tabsContainerRef = useRef<HTMLDivElement>(null)
  const [tabsOverflowOpen, setTabsOverflowOpen] = useState(false)
  const [tabsContainerWidth, setTabsContainerWidth] = useState(0)
  const { theme, setTheme } = useTheme()
  const [showSetup, setShowSetup] = useState(false)
  const [setupPath, setSetupPath] = useState("")
  const [setupLibraryName, setSetupLibraryName] = useState("paper-lib")
  const [setupVaultName, setSetupVaultName] = useState("notes")
  const [setupError, setSetupError] = useState<string | null>(null)
  const [setupWorking, setSetupWorking] = useState(false)
  const [setupDone, setSetupDone] = useState(false)
  const [openVaultError, setOpenVaultError] = useState<string | null>(null)
  const [openVaultWorking, setOpenVaultWorking] = useState(false)

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

  async function submitSetupLibrary() {
    if (!setupPath.trim()) {
      setSetupError("Please provide a base directory")
      return
    }
    setSetupWorking(true)
    setSetupError(null)
    try {
      const r = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: setupPath.trim(),
          library: setupLibraryName.trim() || "aurora",
          vault: setupVaultName.trim() || "obsidian-vault",
        }),
      })
      if (!r.ok) {
        const j = await r.json().catch(() => ({}))
        throw new Error(j.detail || "Failed to set up library")
      }
      const j = await r.json()
      if (j?.library) setLibrary(j.library)
      setSetupDone(true)
    } catch (e: any) {
      setSetupError(e.message || "Failed to set up library")
    } finally {
      setSetupWorking(false)
    }
  }

  async function openObsidianVault() {
    setOpenVaultError(null)
    setOpenVaultWorking(true)
    try {
      const r = await fetch("/api/obsidian/open-vault", { method: "POST" })
      if (!r.ok) {
        const j = await r.json().catch(() => ({}))
        throw new Error(j.detail || "Failed to open Obsidian")
      }
    } catch (e: any) {
      setOpenVaultError(e.message || "Failed to open Obsidian")
    } finally {
      setOpenVaultWorking(false)
    }
  }

  async function openObsidianFromHeader() {
    try {
      const r = await fetch("/api/obsidian/open-vault", { method: "POST" })
      if (!r.ok) {
        const j = await r.json().catch(() => ({}))
        throw new Error(j.detail || "Failed to open Obsidian")
      }
    } catch (e: any) {
      alert(e.message || "Failed to open Obsidian")
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-zinc-50 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 font-sans">
      {/* Header */}
      <header className="w-full px-6 py-4 flex justify-between items-center bg-white/80 dark:bg-zinc-900/80 shadow-sm border-b border-zinc-200 dark:border-zinc-800 sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <span className="text-2xl mr-2" aria-label="Aurora">🌌</span>
          <h1 className="text-3xl font-bold text-aurora-500 dark:text-aurora-400 m-0">Aurora Lib</h1>
        </div>
        <div className="flex items-center gap-3">
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
                    onSetup={() => {
                      setSetupError(null)
                      setSetupDone(false)
                      setOpenVaultError(null)
                      setShowLibs(false)
                      setShowSetup(true)
                    }}
                  />
              </div>
            )}
          </div>
          <button
            className="px-3 py-1 rounded border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-100 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors flex items-center gap-2"
            onClick={openObsidianFromHeader}
            title="Open Obsidian"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4 text-purple-500" fill="currentColor" aria-hidden="true">
              <path d="M16.85 3.15 12 1 7.15 3.15 4 8l1.5 7.5L12 23l6.5-7.5L20 8l-3.15-4.85ZM12 20.1l-4.95-5.7L6 8.4l2.6-3.95L12 3l3.4 1.45L18 8.4l-1.05 6.0L12 20.1Z" />
            </svg>
            Notes
          </button>
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

          {showSetup && (
            <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40">
              <div className="bg-white dark:bg-zinc-900 rounded-lg p-6 shadow-xl w-full max-w-xl">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-bold">Set up new Aurora lib</h2>
                  <button
                    className="text-zinc-400 hover:text-zinc-700"
                    onClick={() => setShowSetup(false)}
                    aria-label="Close"
                  >
                    ×
                  </button>
                </div>

                <div className="flex flex-col gap-3">
                  <label className="text-sm font-medium">Base directory</label>
                  <input
                    className="border border-zinc-300 dark:border-zinc-700 rounded px-3 py-2 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                    placeholder="/path/to/aurora-repo"
                    value={setupPath}
                    onChange={(e) => setSetupPath(e.target.value)}
                  />

                  <label className="text-sm font-medium">Library name</label>
                  <input
                    className="border border-zinc-300 dark:border-zinc-700 rounded px-3 py-2 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                    value={setupLibraryName}
                    onChange={(e) => setSetupLibraryName(e.target.value)}
                  />

                  <label className="text-sm font-medium">Obsidian vault folder</label>
                  <input
                    className="border border-zinc-300 dark:border-zinc-700 rounded px-3 py-2 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                    value={setupVaultName}
                    onChange={(e) => setSetupVaultName(e.target.value)}
                  />

                  {setupError && (
                    <div className="text-sm text-rose-500">{setupError}</div>
                  )}

                  {setupDone && (
                    <div className="mt-2 rounded border border-emerald-200 bg-emerald-50 text-emerald-900 p-3 text-sm">
                      Setup complete. Obidian sets up the vault when it is opened the first time. (Use button below.)
                    </div>
                  )}
                  {openVaultError && (
                    <div className="text-sm text-rose-500">{openVaultError}</div>
                  )}
                </div>

                <div className="flex justify-end gap-2 mt-6">
                  {setupDone && (
                    <div className="flex items-center gap-3">
                      <button
                        className="px-3 py-1 rounded border border-emerald-400 text-emerald-800 bg-emerald-50 hover:bg-emerald-100 transition-colors disabled:opacity-50"
                        onClick={openObsidianVault}
                        disabled={openVaultWorking}
                      >
                        {openVaultWorking ? "Opening..." : "Open in Obsidian"}
                      </button>
                    </div>
                  )}
                  <button
                    className="px-3 py-1 rounded border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-100 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                    onClick={() => setShowSetup(false)}
                  >
                    Close
                  </button>
                  <button
                    className="px-3 py-1 rounded bg-aurora-700 text-white font-semibold shadow hover:bg-aurora-800 transition-colors disabled:opacity-50"
                    onClick={submitSetupLibrary}
                    disabled={setupWorking || setupDone}
                  >
                    {setupWorking ? "Setting up..." : setupDone ? "Created" : "Create"}
                  </button>
                </div>
              </div>
            </div>
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
