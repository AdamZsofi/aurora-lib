import { useEffect, useMemo, useRef, useState } from "react"
import { Paper } from "./types/paper"
import { fetchPapers } from "./api/papers"
import { useTheme } from "./hooks/useTheme"
import { PapersTable } from "./components/PapersTable"
import { LibsPanel } from "./components/LibsPanel"
import { AddPaper } from "./components/AddPaper"
import { PaperDetail } from "./components/PaperDetail"
import { tagColor } from "./utils/tags"

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
  const [showSettings, setShowSettings] = useState(false)
  const [settingsTab, setSettingsTab] = useState<"help" | "libraries" | "papis">("help")
  const [cacheUpdating, setCacheUpdating] = useState(false)
  const [cacheMessage, setCacheMessage] = useState<string | null>(null)
  const [libsDetails, setLibsDetails] = useState<Array<{ name: string; paths: string[] }>>([])
  const [libsLoading, setLibsLoading] = useState(false)
  const [libsError, setLibsError] = useState<string | null>(null)
  const [libraryOptions, setLibraryOptions] = useState<string[]>([])
  const [papisConfig, setPapisConfig] = useState<{ config_dir?: string; config_file?: string; library_name?: string; library_path?: string } | null>(null)
  const [papisConfigLoading, setPapisConfigLoading] = useState(false)
  const [papisConfigError, setPapisConfigError] = useState<string | null>(null)
  const [copiedPath, setCopiedPath] = useState<string | null>(null)
  const [paperSearch, setPaperSearch] = useState("")
  const [paperTagFilter, setPaperTagFilter] = useState<string[]>([])
  const [showFilters, setShowFilters] = useState(false)
  const [tagSearch, setTagSearch] = useState("")
  const [selectedPaperIds, setSelectedPaperIds] = useState<Set<string>>(() => new Set())
  const [exportBibStatus, setExportBibStatus] = useState<string | null>(null)
  const [exportBibMode, setExportBibMode] = useState(false)
  const [setupMode, setSetupMode] = useState<"create" | "import">("create")
  const [needsSetup, setNeedsSetup] = useState(false)
  const [singleLibrary, setSingleLibrary] = useState(false)
  const [defaultVaultPath, setDefaultVaultPath] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((j) => setHealth(j.status))
      .catch(() => setHealth("unavailable"))

    fetch("/api/aurora/config")
      .then((r) => r.json())
      .then((j) => {
        setSingleLibrary(Boolean(j?.single_library))
        setDefaultVaultPath(j?.default_vault || null)
        if (j?.configured && j?.config?.library_name) {
          setLibrary(j.config.library_name)
          setLibraryOptions([j.config.library_name])
          setNeedsSetup(false)
        } else {
          setLibrary(null)
          setLibraryOptions([])
          setNeedsSetup(true)
          if (j?.single_library && j?.default_vault) {
            setSetupPath(j.default_vault)
          }
        }
      })
      .catch(() => {
        setLibrary(null)
        setNeedsSetup(true)
      })
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
    if (library) {
      setLibraryOptions([library])
    } else if (!needsSetup) {
      setLibraryOptions([])
    }
  }, [library, needsSetup])

  useEffect(() => {
    if (library) {
      fetchPapers(library).then(setPapers)
    } else {
      setPapers([])
    }
    setPaperCache({})
    setPaperLoading({})
    setTabs(defaultTabs)
    setActiveTab("__papers__")
    setPaperSearch("")
    setPaperTagFilter([])
    setShowFilters(false)
    setTagSearch("")
    setSelectedPaperIds(new Set())
    setExportBibStatus(null)
    setExportBibMode(false)
    setNeedsSetup(!library)
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
        else if (showSettings) setShowSettings(false)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [showAdd, showLibs, showSettings])

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

  useEffect(() => {
    if (!showSettings) return
    setLibsLoading(true)
    setLibsError(null)
    fetch("/api/libs/details")
      .then((r) => r.json())
      .then((j) => setLibsDetails(Array.isArray(j.libraries) ? j.libraries : []))
      .catch(() => setLibsError("Failed to load libraries"))
      .finally(() => setLibsLoading(false))

    setPapisConfigLoading(true)
    setPapisConfigError(null)
    fetch("/api/papis/config")
      .then((r) => r.json())
      .then((j) => setPapisConfig(j))
      .catch(() => setPapisConfigError("Failed to load papis config"))
      .finally(() => setPapisConfigLoading(false))
  }, [showSettings])

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

  const availableTags = useMemo(() => {
    const tags = new Set<string>()
    papers.forEach((p) => {
      if (Array.isArray(p.tags)) {
        p.tags
          .filter((t) => typeof t === "string")
          .map((t) => t.trim().toLowerCase())
          .filter(Boolean)
          .forEach((t) => tags.add(t))
      }
    })
    return Array.from(tags).sort()
  }, [papers])

  const visibleTags = useMemo(() => {
    const q = tagSearch.trim().toLowerCase()
    if (!q) return availableTags
    return availableTags.filter((t) => t.includes(q))
  }, [availableTags, tagSearch])

  const filteredPapers = useMemo(() => {
    const q = paperSearch.trim().toLowerCase()
    const terms = q.split(/\s+/).filter(Boolean)
    const hasTagFilter = paperTagFilter.length > 0
    return papers.filter((p) => {
      const title = (p.title || "").toString().toLowerCase()
      const authors = Array.isArray(p.authors)
        ? p.authors.join(" ").toLowerCase()
        : (p.authors || "").toString().toLowerCase()
      const haystack = `${title} ${authors}`.trim()
      const matchesQuery =
        terms.length === 0 || terms.every((t) => haystack.includes(t))
      if (!matchesQuery) return false

      if (!hasTagFilter) return true
      const tags = Array.isArray(p.tags)
        ? p.tags.map((t) => t.toLowerCase())
        : []
      return paperTagFilter.some((t) => tags.includes(t))
    })
  }, [papers, paperSearch, paperTagFilter])

  async function exportSelectedBib() {
    if (selectedPaperIds.size === 0) return
    setExportBibStatus(null)
    try {
      const url = library ? `/api/papers/bibtex?library=${encodeURIComponent(library)}` : "/api/papers/bibtex"
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedPaperIds) }),
      })
      if (!r.ok) {
        const j = await r.json().catch(() => ({}))
        throw new Error(j.detail || "Failed to export BibTeX")
      }
      const j = await r.json()
      const bibtex = j.bibtex || ""
      if (!bibtex) throw new Error("Empty BibTeX export")

      try {
        await navigator.clipboard.writeText(bibtex)
      } catch {
        // ignore clipboard failure
      }

      const blob = new Blob([bibtex], { type: "text/x-bibtex" })
      const link = document.createElement("a")
      link.href = URL.createObjectURL(blob)
      link.download = "aurora-export.bib"
      link.click()
      URL.revokeObjectURL(link.href)

      setExportBibStatus(`Exported ${selectedPaperIds.size} entr${selectedPaperIds.size === 1 ? "y" : "ies"}.`)
    } catch (e: any) {
      setExportBibStatus(e.message || "Failed to export BibTeX")
    }
  }

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
    const lockedPath = singleLibrary && defaultVaultPath ? defaultVaultPath : setupPath
    if (!lockedPath.trim()) {
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
          path: lockedPath.trim(),
          library: setupLibraryName.trim() || "aurora",
          vault: setupVaultName.trim() || "obsidian-vault",
          mode: setupMode,
        }),
      })
      if (!r.ok) {
        const j = await r.json().catch(() => ({}))
        throw new Error(j.detail || "Failed to set up library")
      }
      const j = await r.json()
      if (j?.library) {
        setLibrary(j.library)
        setLibraryOptions([j.library])
      }
      setSetupDone(true)
      setNeedsSetup(false)
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

  async function updatePapisCache() {
    setCacheUpdating(true)
    setCacheMessage(null)
    try {
      const url = library
        ? `/api/cache/update?library=${encodeURIComponent(library)}`
        : "/api/cache/update"
      const r = await fetch(url, { method: "POST" })
      if (!r.ok) {
        const j = await r.json().catch(() => ({}))
        throw new Error(j.detail || "Failed to update cache")
      }
      setCacheMessage("Cache updated.")
      fetchPapers(library).then(setPapers)
    } catch (e: any) {
      setCacheMessage(e.message || "Failed to update cache")
    } finally {
      setCacheUpdating(false)
    }
  }

  async function copyPath(path: string) {
    try {
      await navigator.clipboard.writeText(path)
      setCopiedPath(path)
      setTimeout(() => setCopiedPath((p) => (p === path ? null : p)), 1500)
    } catch {
      window.prompt("Copy path:", path)
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
                    libraries={libraryOptions}
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
                    hideSetup={singleLibrary && !needsSetup}
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
        {needsSetup && !showSetup && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-white dark:bg-zinc-900 rounded-lg p-6 shadow-xl w-full max-w-md text-center">
              <h2 className="text-xl font-bold mb-2">Set up or import Aurora</h2>
              <p className="text-sm text-zinc-600 dark:text-zinc-300 mb-4">
                No library is configured yet. Set up a new vault or import an existing one.
              </p>
              <button
                className="px-4 py-2 rounded bg-aurora-600 text-white font-semibold shadow hover:bg-aurora-700 transition-colors"
                onClick={() => {
                  setSetupError(null)
                  setSetupDone(false)
                  setOpenVaultError(null)
                  setShowSetup(true)
                }}
              >
                Set up / Import
              </button>
            </div>
          </div>
        )}
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
              <div className="flex items-center gap-2">
                <button
                  className="px-4 py-2 rounded bg-aurora-600 text-white font-semibold shadow hover:bg-aurora-700 transition-colors"
                  onClick={() => setShowAdd(true)}
                >
                  Add paper
                </button>
                <button
                  className="px-3 py-2 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
                  onClick={() => setShowFilters((s) => !s)}
                >
                  {showFilters ? "Hide filters" : "Show filters"}
                </button>
              </div>
              <div className="flex items-center gap-2">
                {!exportBibMode ? (
                  <button
                    className="px-3 py-2 rounded bg-aurora-700 text-white font-semibold shadow hover:bg-aurora-800 transition-colors"
                    onClick={() => {
                      setExportBibMode(true)
                      setExportBibStatus(null)
                    }}
                  >
                    Export .bib
                  </button>
                ) : (
                  <>
                    <button
                      className="px-3 py-2 rounded bg-aurora-700 text-white font-semibold shadow hover:bg-aurora-800 transition-colors disabled:opacity-50"
                      onClick={exportSelectedBib}
                      disabled={selectedPaperIds.size === 0}
                    >
                      Export selected
                    </button>
                    <button
                      className="px-3 py-2 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
                      onClick={() => {
                        setExportBibMode(false)
                        setSelectedPaperIds(new Set())
                        setExportBibStatus(null)
                      }}
                    >
                      Cancel
                    </button>
                  </>
                )}
              </div>
            </div>
            {exportBibMode && (
              <div className="mb-2 text-sm text-zinc-500 dark:text-zinc-300">
                Select papers from the list, then export.
              </div>
            )}
            {exportBibStatus && (
              <div className="mb-2 text-sm text-zinc-600 dark:text-zinc-300">
                {exportBibStatus}
              </div>
            )}
            {showFilters && (
              <div className="mb-4 grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-4 items-start">
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium">Search (title or author)</label>
                  <input
                    className="border border-zinc-300 dark:border-zinc-700 rounded px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                    placeholder="e.g. diffusion models, smith"
                    value={paperSearch}
                    onChange={(e) => setPaperSearch(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">Filter by tags</label>
                    {paperTagFilter.length > 0 && (
                      <button
                        className="text-sm text-aurora-600 hover:text-aurora-700"
                        onClick={() => setPaperTagFilter([])}
                      >
                        Clear tags
                      </button>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {paperTagFilter.length === 0 && (
                      <span className="text-sm text-zinc-500">No tags selected</span>
                    )}
                    {paperTagFilter.map((tag) => (
                      <button
                        key={tag}
                        className="px-2 py-1 rounded text-sm border border-transparent"
                        style={tagColor(tag)}
                        onClick={() => setPaperTagFilter((prev) => prev.filter((t) => t !== tag))}
                        title="Remove tag"
                      >
                        {tag}
                      </button>
                    ))}
                  </div>

                  <input
                    className="border border-zinc-300 dark:border-zinc-700 rounded px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                    placeholder="Search tags"
                    value={tagSearch}
                    onChange={(e) => setTagSearch(e.target.value)}
                  />

                  <div className="max-h-44 overflow-y-auto border border-zinc-200 dark:border-zinc-700 rounded">
                    {visibleTags.length === 0 && (
                      <div className="px-3 py-2 text-sm text-zinc-500">No tags</div>
                    )}
                    {visibleTags.map((tag) => {
                      const active = paperTagFilter.includes(tag)
                      return (
                        <button
                          key={tag}
                          className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
                            active ? "bg-aurora-50 dark:bg-aurora-900" : ""
                          }`}
                          onClick={() =>
                            setPaperTagFilter((prev) =>
                              active ? prev.filter((t) => t !== tag) : [...prev, tag]
                            )
                          }
                        >
                          <span className="flex items-center gap-2">
                            <span className="inline-block w-3 h-3 rounded" style={tagColor(tag)} />
                            {tag}
                          </span>
                          {active && <span className="text-xs text-aurora-600">Selected</span>}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}
            <div className="overflow-x-auto">
              <PapersTable
                papers={filteredPapers}
                library={library}
                selectedIds={selectedPaperIds}
                showSelection={exportBibMode}
                onToggleSelect={(id, checked) => {
                  if (!id) return
                  setSelectedPaperIds((prev) => {
                    const next = new Set(prev)
                    if (checked) next.add(id)
                    else next.delete(id)
                    return next
                  })
                }}
                onToggleSelectAll={(checked) => {
                  setSelectedPaperIds((prev) => {
                    const next = new Set(prev)
                    if (checked) {
                      filteredPapers.forEach((p) => {
                        const id = p.id || p.ref || ""
                        if (id) next.add(id)
                      })
                    } else {
                      filteredPapers.forEach((p) => {
                        const id = p.id || p.ref || ""
                        if (id) next.delete(id)
                      })
                    }
                    return next
                  })
                }}
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
                  <h2 className="text-xl font-bold">Set up or import Aurora lib</h2>
                  <button
                    className="text-zinc-400 hover:text-zinc-700"
                    onClick={() => setShowSetup(false)}
                    aria-label="Close"
                  >
                    ×
                  </button>
                </div>

                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <button
                      className={`px-3 py-1 rounded border ${
                        setupMode === "create"
                          ? "bg-aurora-100 border-aurora-300 text-aurora-800"
                          : "bg-zinc-100 dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200"
                      }`}
                      onClick={() => setSetupMode("create")}
                    >
                      Create
                    </button>
                    <button
                      className={`px-3 py-1 rounded border ${
                        setupMode === "import"
                          ? "bg-aurora-100 border-aurora-300 text-aurora-800"
                          : "bg-zinc-100 dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200"
                      }`}
                      onClick={() => setSetupMode("import")}
                    >
                      Import
                    </button>
                  </div>

                  <label className="text-sm font-medium">Vault directory</label>
                  <input
                    className="border border-zinc-300 dark:border-zinc-700 rounded px-3 py-2 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                    placeholder="/path/to/vault"
                    value={setupPath}
                    onChange={(e) => setSetupPath(e.target.value)}
                    disabled={singleLibrary && Boolean(defaultVaultPath)}
                  />
                  {singleLibrary && defaultVaultPath && (
                    <div className="text-xs text-zinc-500">
                      This instance is locked to the mounted vault path.
                    </div>
                  )}

                  {setupMode === "create" && (
                    <>
                      <label className="text-sm font-medium">Library name</label>
                      <input
                        className="border border-zinc-300 dark:border-zinc-700 rounded px-3 py-2 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                        value={setupLibraryName}
                        onChange={(e) => setSetupLibraryName(e.target.value)}
                      />
                    </>
                  )}

                  {setupError && (
                    <div className="text-sm text-rose-500">{setupError}</div>
                  )}

                  {setupDone && (
                    <div className="mt-2 rounded border border-emerald-200 bg-emerald-50 text-emerald-900 p-3 text-sm">
                      {setupMode === "import"
                        ? "Import complete."
                        : "Setup complete. Obsidian sets up the vault when it is opened the first time. (Use button below.)"}
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

          {showSettings && (
            <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40">
              <div className="bg-white dark:bg-zinc-900 rounded-lg p-6 shadow-xl w-full max-w-2xl">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-bold">Settings</h2>
                  <button
                    className="text-zinc-400 hover:text-zinc-700"
                    onClick={() => setShowSettings(false)}
                    aria-label="Close"
                  >
                    ×
                  </button>
                </div>

                <div className="flex items-center gap-2 mb-4">
                  <button
                    className={`px-3 py-1 rounded border text-sm ${settingsTab === "help" ? "border-aurora-500 bg-aurora-50 text-aurora-800" : "border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800"}`}
                    onClick={() => setSettingsTab("help")}
                  >
                    Help
                  </button>
                  <button
                    className={`px-3 py-1 rounded border text-sm ${settingsTab === "papis" ? "border-aurora-500 bg-aurora-50 text-aurora-800" : "border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800"}`}
                    onClick={() => setSettingsTab("papis")}
                  >
                    Papis
                  </button>
                  <button
                    className={`px-3 py-1 rounded border text-sm ${settingsTab === "libraries" ? "border-aurora-500 bg-aurora-50 text-aurora-800" : "border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800"}`}
                    onClick={() => setSettingsTab("libraries")}
                  >
                    Libraries
                  </button>
                </div>

                {settingsTab === "papis" && (
                  <div className="space-y-3">
                    <p>Toggle Papis Cache Update</p>
                    <p className="text-sm text-zinc-600 dark:text-zinc-300">
                      Update the papis cache so changes on disk are reflected in Aurora.
                    </p>
                    <div className="flex items-center gap-3">
                      <button
                        className="px-3 py-1 rounded bg-aurora-700 text-white font-semibold shadow hover:bg-aurora-800 transition-colors disabled:opacity-50"
                        onClick={updatePapisCache}
                        disabled={cacheUpdating}
                      >
                        {cacheUpdating ? "Updating..." : "Update cache"}
                      </button>
                      {cacheMessage && (
                        <span className="text-sm text-zinc-500 dark:text-zinc-300">{cacheMessage}</span>
                      )}
                    </div>
                    <div className="space-y-2">
                      <p>Papis Config Paths</p>
                      <p className="text-sm text-zinc-600 dark:text-zinc-300">
                        Aurora uses a local papis config at the below path.
                      </p>
                      {papisConfigLoading && (
                        <div className="text-sm text-zinc-500">Loading...</div>
                      )}
                      {papisConfigError && (
                        <div className="text-sm text-rose-500">{papisConfigError}</div>
                      )}
                      {!papisConfigLoading && !papisConfigError && papisConfig && (
                        <div className="space-y-2">
                          {papisConfig.config_file && (
                            <button
                              className="w-full text-left text-sm px-2 py-1 rounded bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                              onClick={() => copyPath(papisConfig.config_file || "")}
                              title="Click to copy"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <span className="truncate">{papisConfig.config_file}</span>
                                <span className="text-xs text-zinc-400">
                                  {copiedPath === papisConfig.config_file ? "Copied" : "Copy"}
                                </span>
                              </div>
                            </button>
                          )}
                      </div>
                      )}
                    </div>
                  </div>
                )}

                {settingsTab === "libraries" && (
                  <div className="space-y-3">
                    <p className="text-sm text-zinc-600 dark:text-zinc-300">
                      Available Aurora libraries from your papis config. Click a path to copy it.
                    </p>
                    {libsLoading && <div className="text-sm text-zinc-500">Loading...</div>}
                    {libsError && <div className="text-sm text-rose-500">{libsError}</div>}
                    {!libsLoading && !libsError && libsDetails.length === 0 && (
                      <div className="text-sm text-zinc-500">No libraries found.</div>
                    )}
                    <div className="space-y-3">
                      {libsDetails.map((lib) => (
                        <div key={lib.name} className="border border-zinc-200 dark:border-zinc-700 rounded p-3">
                          <div className="font-semibold text-zinc-800 dark:text-zinc-100">{lib.name}</div>
                          {lib.paths.length === 0 && (
                            <div className="text-sm text-zinc-500">No paths configured.</div>
                          )}
                          {lib.paths.map((path) => (
                            <button
                              key={path}
                              className="mt-2 w-full text-left text-sm px-2 py-1 rounded bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                              onClick={() => copyPath(path)}
                              title="Click to copy"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <span className="truncate">{path}</span>
                                <span className="text-xs text-zinc-400">
                                  {copiedPath === path ? "Copied" : "Copy"}
                                </span>
                              </div>
                            </button>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {settingsTab === "help" && (
                  <div className="space-y-3 text-sm text-zinc-600 dark:text-zinc-300">
                    <p>
                      Aurora Lib is a lightweight UI and manager for your papis library and obsidian vault.
                    </p>
                    <ul className="list-disc pl-5 space-y-2">
                      <li>
                        Use the Library selector in the header to switch between papis libraries.
                      </li>
                      <li>
                        Add papers with the “Add paper” button; tabs keep paper details open while you browse.
                      </li>
                      <li>
                        Tags and reading state are editable in the paper detail view.
                      </li>
                      <li>
                        Use the Notes button to open your Obsidian vault.
                      </li>
                      <li>
                        If you edit files outside Aurora, update the cache from the Papis tab.
                      </li>
                    </ul>
                    <p>
                      Tip: You can version control your library if you set up a git repository and choose that to be your library.
                    </p>
                  </div>
                )}
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
        <div className="flex items-center gap-3">
          <button
            className="p-2 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500"
            onClick={() => {
              setSettingsTab("papis")
              setShowSettings(true)
            }}
            title="Settings"
            aria-label="Settings"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden="true">
              <path d="M19.14 12.94a7.43 7.43 0 0 0 .05-.94 7.43 7.43 0 0 0-.05-.94l2.03-1.58a.48.48 0 0 0 .12-.6l-1.92-3.32a.48.48 0 0 0-.58-.22l-2.39.96a7.02 7.02 0 0 0-1.63-.94l-.36-2.54A.5.5 0 0 0 13.93 1h-3.86a.5.5 0 0 0-.49.42l-.36 2.54c-.58.24-1.12.55-1.63.94l-2.39-.96a.48.48 0 0 0-.58.22L1.7 7.48a.48.48 0 0 0 .12.6l2.03 1.58c-.03.31-.05.63-.05.94 0 .31.02.63.05.94l-2.03 1.58a.48.48 0 0 0-.12.6l1.92 3.32c.13.23.39.32.62.22l2.39-.96c.5.39 1.05.7 1.63.94l.36 2.54c.04.24.25.42.49.42h3.86c.24 0 .45-.18.49-.42l.36-2.54c.58-.24 1.12-.55 1.63-.94l2.39.96c.23.1.49.01.62-.22l1.92-3.32a.48.48 0 0 0-.12-.6l-2.03-1.58Zm-7.14 2.56A3.5 3.5 0 1 1 15.5 12a3.5 3.5 0 0 1-3.5 3.5Z" />
            </svg>
          </button>
          <span className="text-zinc-300 dark:text-zinc-600">&copy; {new Date().getFullYear()} solarowl</span>
        </div>
      </footer>
    </div>
  )
}
