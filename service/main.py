from fastapi import FastAPI, HTTPException, Response
from fastapi import Form, File, UploadFile, Body
import json
from pathlib import Path
from typing import Optional
import shutil
import tempfile
import os
import re
import urllib.parse
import urllib.request
import webbrowser
import subprocess

app = FastAPI()

SAMPLE_FILE = Path(__file__).parent / "sample_papers.json"
UI_STATE_FILE = Path(__file__).parent / ".ui_state.json"
AURORA_CONFIG_FILE = Path(__file__).parent / ".aurora_config.json"
DEFAULT_NOTES_DIR = "paper-notes"
NOTE_BLOCK_BEGIN = "%% AURORA:BEGIN %%"
NOTE_BLOCK_END = "%% AURORA:END %%"
READ_STATE_VALUES = [
    "unread",
    "want_to_read",
    "read_abstract",
    "read_shallow",
    "read_deep",
]
READ_STATE_EMOJI = {
    "unread": "⚪",
    "want_to_read": "⭐",
    "read_abstract": "📄",
    "read_shallow": "📘",
    "read_deep": "📚",
}

def _set_library_from_param(library: Optional[str]) -> None:
    if not library:
        return
    if not papis_importable():
        raise HTTPException(status_code=500, detail="papis library not available in this environment")
    try:
        from papis.api import set_lib_from_name
        set_lib_from_name(library)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to select library: {e}")

def papis_importable() -> bool:
    try:
        import papis  # noqa: F401
        return True
    except Exception:
        return False


def _doc_to_json(doc) -> dict:
    # Convert a papis.Document into a stable JSON schema
    from papis.id import ID_KEY_NAME

    def _authors_from_doc(d):
        # Attempt to build a list of author strings (Given Family)
        try:
            from papis.document import split_authors_name
        except Exception:
            split_authors_name = None

        if "author_list" in d and isinstance(d["author_list"], list):
            out = []
            for a in d["author_list"]:
                given = a.get("given", "")
                family = a.get("family", "")
                name = " ".join(filter(None, [given, family])).strip()
                out.append(name or (family or given))
            return out

        if "author" in d and d["author"]:
            if split_authors_name:
                try:
                    parts = split_authors_name(d["author"])
                    return [" ".join(filter(None, [p.get("given"), p.get("family")])).strip() for p in parts]
                except Exception:
                    pass
            # fallback: split by 'and' or comma
            s = d["author"]
            return [a.strip() for a in s.replace(" and ", ",").split(",") if a.strip()]

        return []

    out = {
        "id": doc.get("papis_id") or doc.get("id") or (doc.get("ref") if "ref" in doc else None),
        "title": doc.get("title") or "",
        "authors": _authors_from_doc(doc),
        "doi": doc.get("doi") or "",
        "year": doc.get("year") or doc.get("issued") or "",
        "files": doc.get("files") or [],
        "tags": doc.get("tags") or [],
        "user_notes": doc.get("user_notes") or [],
        "read_state": doc.get("aurora_read_state") or "unread",
        "folder_name": None,
        "raw": dict(doc),
    }

    # try to get main folder name if available
    try:
        folder_name = doc.get_main_folder_name() if hasattr(doc, "get_main_folder_name") else None
        out["folder_name"] = folder_name
    except Exception:
        out["folder_name"] = None

    return out


def get_papis_list(library: Optional[str] = None):
    # Prefer importing papis as a library; fall back to subprocess if needed
    if papis_importable():
        try:
            _set_library_from_param(library)
            from papis.database import get_database
            db = get_database()
            docs = db.get_all_documents()
            return [ _doc_to_json(d) for d in docs ]
        except Exception:
            return None

    # fallback: try CLI
    try:
        import subprocess
        proc = subprocess.run(["papis", "list", "--json"], capture_output=True, text=True, check=True)
        return json.loads(proc.stdout)
    except Exception:
        return None


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/papers")
def papers(library: Optional[str] = None):
    data = get_papis_list(library)
    if data is not None:
        return {"source": "papis", "papers": data}
    if SAMPLE_FILE.exists():
        return {"source": "sample", "papers": json.loads(SAMPLE_FILE.read_text())}
    return {"source": "empty", "papers": []}


@app.post("/api/setup")
def setup_aurora(body: dict = Body(...)):
    """Set up a new Aurora repo with papis library + obsidian vault."""
    base = body.get("path") if isinstance(body, dict) else None
    if not base:
        raise HTTPException(status_code=400, detail="Missing 'path'")

    base_path = Path(base).expanduser().resolve()
    library_name = body.get("library") if isinstance(body, dict) else None
    vault_name = body.get("vault") if isinstance(body, dict) else None
    library_name = library_name or "aurora"
    vault_name = vault_name or "obsidian-vault"

    library_dir_name = safe_filename(library_name) or "aurora"
    library_path = base_path / library_dir_name
    vault_path = base_path / vault_name
    notes_path = _ensure_obsidian_dirs(vault_path)

    library_path.mkdir(parents=True, exist_ok=True)

    if not papis_importable():
        raise HTTPException(status_code=500, detail="papis library not available in this environment")

    try:
        import papis.config as papis_config

        config = papis_config.get_configuration()
        if not config.has_section(library_name):
            config.add_section(library_name)
        config[library_name]["dir"] = str(library_path)

        general_section = papis_config.get_general_settings_name()
        if not config.has_section(general_section):
            config.add_section(general_section)
        if "default-library" not in config[general_section]:
            config[general_section]["default-library"] = library_name

        config_folder = papis_config.get_config_folder()
        os.makedirs(config_folder, exist_ok=True)
        config_file = papis_config.get_config_file()
        with open(config_file, "w", encoding="utf-8") as configfile:
            config.write(configfile)

        papis_config.set_lib_from_name(library_name)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to configure papis: {e}")

    aurora_config = {
        "repo_path": str(base_path),
        "library_name": library_name,
        "library_path": str(library_path),
        "vault_name": vault_name,
        "vault_path": str(vault_path),
        "notes_path": str(notes_path),
    }
    try:
        _save_aurora_config(aurora_config)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to persist aurora config: {e}")

    return {
        "ok": True,
        "library": library_name,
        "library_path": str(library_path),
        "vault_path": str(vault_path),
        "notes_path": str(notes_path),
    }


@app.get("/api/ui-state")
def get_ui_state():
    """Return persisted UI state (tabs, activeTab)."""
    try:
        if not UI_STATE_FILE.exists():
            return {"ok": True, "state": {}}
        data = json.loads(UI_STATE_FILE.read_text())
        if not isinstance(data, dict):
            return {"ok": True, "state": {}}
        return {"ok": True, "state": data}
    except Exception:
        return {"ok": True, "state": {}}


@app.post("/api/ui-state")
def set_ui_state(body: dict = Body(...)):
    """Persist UI state (tabs, activeTab)."""
    if not isinstance(body, dict):
        raise HTTPException(status_code=400, detail="Invalid body")
    state = {
        "tabs": body.get("tabs") if isinstance(body.get("tabs"), list) else [],
        "activeTab": body.get("activeTab") if isinstance(body.get("activeTab"), str) else "__papers__",
    }
    try:
        UI_STATE_FILE.write_text(json.dumps(state))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to persist UI state: {e}")
    return {"ok": True, "state": state}


@app.get("/api/papers/{paper_id}")
def paper_detail(paper_id: str, library: Optional[str] = None):
    try:
        _set_library_from_param(library)
        from papis.database import get_database
        db = get_database()
        doc = db.find_by_id(paper_id)
        if doc is None:
            raise HTTPException(status_code=404, detail="Paper not found")
        return {"source": "papis", "paper": _doc_to_json(doc)}
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to read papis database")

@app.get("/api/resolve")
def resolve(doi: str):
    try:
        from papis.api import doi_to_data
        if doi is None or doi == "":
            raise RuntimeError("DOI is empty")
        data = doi_to_data(doi)
        tags = _openalex_keywords_for_doi(doi)
        if tags and isinstance(data, dict):
            existing = data.get("tags") if isinstance(data.get("tags"), list) else []
            data["tags"] = list(dict.fromkeys([*existing, *tags]))
        # convert to simple preview shape
        title = data.get("title") or (data.get("message", {}).get("title") if isinstance(data, dict) else "")
        authors = []
        if isinstance(data, dict):
            for a in data.get("author_list", []):
                name = " ".join(filter(None, [a.get("given"), a.get("family")]))
                authors.append(name)
        return data #{"title": title, "authors": authors, "doi": data.get("DOI") or data.get("doi"), "year": data.get("year") or data.get("issued"), "all": data}
    except Exception as e: 
        raise HTTPException(status_code=500, detail="Failed to resolve DOI via papis: " + str(e))


@app.get("/api/lib")
def get_current_library():
    """Return the name of the current papis library."""
    if not papis_importable():
        raise HTTPException(status_code=500, detail="papis library not available in this environment")
    try:
        from papis.api import get_lib_name
        name = get_lib_name()
        return {"library": name}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get current library: {e}")


@app.get("/api/libs")
def get_libraries():
    """Return a list of all libraries known to papis."""
    if not papis_importable():
        raise HTTPException(status_code=500, detail="papis library not available in this environment")
    try:
        from papis.api import get_libraries
        libs = get_libraries()
        return {"libraries": libs}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get libraries: {e}")


@app.get("/api/libs/details")
def get_library_details():
    """Return a list of library names and their paths."""
    if not papis_importable():
        raise HTTPException(status_code=500, detail="papis library not available in this environment")
    try:
        import papis.config as papis_config

        config = papis_config.get_configuration()
        libs = papis_config.get_libs()
        details = []

        for lib in libs:
            paths: list[str] = []
            if lib in config:
                section = config[lib]
                if "dir" in section:
                    paths = [os.path.expanduser(section["dir"])]
                elif "dirs" in section:
                    raw = section["dirs"]
                    if isinstance(raw, list):
                        paths = [os.path.expanduser(p) for p in raw]
                    else:
                        try:
                            parsed = eval(raw)
                            if isinstance(parsed, list):
                                paths = [os.path.expanduser(p) for p in parsed]
                        except Exception:
                            paths = []

            details.append({"name": lib, "paths": paths})

        return {"libraries": details}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get library details: {e}")


@app.post("/api/lib")
def set_library(body: dict):
    """Set the current papis library. Body: {'library': '<name_or_path>'} """
    if not papis_importable():
        raise HTTPException(status_code=500, detail="papis library not available in this environment")
    lib = body.get("library") if isinstance(body, dict) else None
    if not lib:
        raise HTTPException(status_code=400, detail="Missing 'library' in request body")
    try:
        from papis.api import set_lib_from_name
        set_lib_from_name(lib)
        return {"ok": True, "library": lib}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to set library: {e}")


@app.post("/api/cache/update")
def update_cache(library: Optional[str] = None):
    """Update papis cache for the selected library."""
    if not papis_importable():
        raise HTTPException(status_code=500, detail="papis library not available in this environment")
    try:
        _set_library_from_param(library)
        from papis.commands import cache as cache_cmd

        cache_cmd.update_newer(
            query="",
            doc_folder=(),
            _all=True,
            sort_field=None,
            sort_reverse=False,
        )
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update papis cache: {e}")

@app.get("/api/tags")
def get_tags(library: Optional[str] = None):
    """Return list of unique tags across the library."""
    if not papis_importable():
        raise HTTPException(status_code=500, detail="papis library not available in this environment")
    try:
        _set_library_from_param(library)
        from papis.database import get_database
        db = get_database()
        tags = set()
        for doc in db.get_all_documents():
            doc_tags = doc.get("tags") or []
            if isinstance(doc_tags, list):
                tags.update([t for t in doc_tags if isinstance(t, str) and t.strip()])
        return {"tags": sorted(tags)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read tags: {e}")

@app.post("/api/papers/{paper_id}/tags")
def set_paper_tags(paper_id: str, body: dict = Body(...), library: Optional[str] = None):
    """Set tags for a paper. Body: {'tags': ['tag1', 'tag2']}"""
    if not papis_importable():
        raise HTTPException(status_code=500, detail="papis library not available in this environment")
    tags = body.get("tags") if isinstance(body, dict) else None
    if not isinstance(tags, list):
        raise HTTPException(status_code=400, detail="Missing or invalid 'tags' list")
    tags = [_normalize_tag(t) for t in tags if isinstance(t, str) and t.strip()]
    try:
        _set_library_from_param(library)
        from papis.database import get_database
        from papis.api import save_doc

        db = get_database()
        doc = db.find_by_id(paper_id)
        if doc is None:
            raise HTTPException(status_code=404, detail="Paper not found")
        doc["tags"] = tags
        save_doc(doc)
        return {"ok": True, "paper": _doc_to_json(doc)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update tags: {e}")


@app.post("/api/papers/{paper_id}/state")
def set_paper_state(paper_id: str, body: dict = Body(...), library: Optional[str] = None):
    """Set read state for a paper. Body: {'state': '<value>'}"""
    if not papis_importable():
        raise HTTPException(status_code=500, detail="papis library not available in this environment")
    state = body.get("state") if isinstance(body, dict) else None
    if not isinstance(state, str) or state not in READ_STATE_VALUES:
        raise HTTPException(status_code=400, detail="Invalid 'state'")
    try:
        _set_library_from_param(library)
        from papis.database import get_database
        from papis.api import save_doc

        db = get_database()
        doc = db.find_by_id(paper_id)
        if doc is None:
            raise HTTPException(status_code=404, detail="Paper not found")
        doc["aurora_read_state"] = state
        save_doc(doc)
        doc_json = _doc_to_json(doc)
        config = _get_obsidian_config()
        if config:
            try:
                note_path = _write_note_if_missing(doc_json, library, config)
                if note_path:
                    _upsert_note_header(note_path, _note_header(doc_json, library))
            except Exception:
                pass
        return {"ok": True, "paper": doc_json}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update read state: {e}")

@app.post("/api/papers/{paper_id}/notes")
def add_paper_note(paper_id: str, body: dict = Body(...), library: Optional[str] = None):
    """Append a user note to a paper. Body: {'author': 'name', 'text': 'note'}"""
    if not papis_importable():
        raise HTTPException(status_code=500, detail="papis library not available in this environment")
    author = body.get("author") if isinstance(body, dict) else None
    text = body.get("text") if isinstance(body, dict) else None
    if not isinstance(author, str) or not author.strip():
        raise HTTPException(status_code=400, detail="Missing 'author'")
    if not isinstance(text, str) or not text.strip():
        raise HTTPException(status_code=400, detail="Missing 'text'")
    try:
        _set_library_from_param(library)
        from papis.database import get_database
        from papis.api import save_doc

        db = get_database()
        doc = db.find_by_id(paper_id)
        if doc is None:
            raise HTTPException(status_code=404, detail="Paper not found")
        notes = doc.get("user_notes") or []
        if not isinstance(notes, list):
            notes = []
        clean_author = author.strip()
        clean_text = text.strip()
        updated = False
        for n in notes:
            if isinstance(n, dict) and n.get("author") == clean_author:
                n["text"] = clean_text
                updated = True
                break
        if not updated:
            notes.append({"author": clean_author, "text": clean_text})
        doc["user_notes"] = notes
        save_doc(doc)
        return {"ok": True, "paper": _doc_to_json(doc)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to add note: {e}")

@app.get("/api/note-authors")
def get_note_authors(library: Optional[str] = None):
    """Return list of unique note authors across the library."""
    if not papis_importable():
        raise HTTPException(status_code=500, detail="papis library not available in this environment")
    try:
        _set_library_from_param(library)
        from papis.database import get_database
        db = get_database()
        authors = set()
        for doc in db.get_all_documents():
            notes = doc.get("user_notes") or []
            if isinstance(notes, list):
                for n in notes:
                    if isinstance(n, dict):
                        a = n.get("author")
                        if isinstance(a, str) and a.strip():
                            authors.add(a.strip())
        return {"authors": sorted(authors)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read note authors: {e}")

def run_papis_add(file_path: Optional[str], metadata: dict) -> dict:
    try:
        from papis.commands.add import run as papis_add_run
        # papis.commands.add.run signature: run(paths: list[str], data: dict|None = None, ...)
        paths = [str(file_path)] if file_path else []
        papis_add_run(paths, data=metadata, batch=True, confirm=False, edit=False)
        # attempt to find the created document by DOI or title
        from papis.database import get_database
        db = get_database()
        if metadata.get("doi"):
            results = db.query_dict({"doi": metadata.get("doi")})
            if results:
                return {"ok": True, "paper": _doc_to_json(results[0])}
        # try by title
        if metadata.get("title"):
            results = db.query_dict({"title": metadata.get("title")})
            if results:
                return {"ok": True, "paper": _doc_to_json(results[0])}
        # Last resort: return full list
        return {"ok": True, "papers": [ _doc_to_json(d) for d in db.get_all_documents() ]}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}

FILENAME_SAFE = re.compile(r"[^A-Za-z0-9._-]")

def safe_filename(value: str) -> str:
    value = value.strip()
    value = value.replace("/", "_")
    value = FILENAME_SAFE.sub("_", value)
    return value[:255]  # filesystem-safe length

def _note_slug(title: str) -> str:
    value = (title or "").strip().lower()
    value = re.sub(r"\s+", "-", value)
    value = re.sub(r"[^a-z0-9._-]", "-", value)
    value = re.sub(r"-+", "-", value).strip("-")
    return value[:255] or "paper"

def _load_aurora_config() -> dict:
    try:
        if not AURORA_CONFIG_FILE.exists():
            return {}
        data = json.loads(AURORA_CONFIG_FILE.read_text())
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}

def _save_aurora_config(data: dict) -> None:
    AURORA_CONFIG_FILE.write_text(json.dumps(data, indent=2))

def _get_obsidian_config() -> Optional[dict]:
    data = _load_aurora_config()
    vault_path = data.get("vault_path")
    notes_path = data.get("notes_path")
    if not vault_path or not notes_path:
        return None
    return data

def _ensure_obsidian_dirs(vault_path: Path) -> tuple[Path, Path]:
    notes_path = vault_path / DEFAULT_NOTES_DIR
    notes_path.mkdir(parents=True, exist_ok=True)
    return notes_path

def _note_header(doc: dict, library: Optional[str]) -> str:
    return "\n".join([
        _build_frontmatter(doc, library),
        "",
        "## Notes",
        "",
    ])

def _build_frontmatter(doc: dict, library: Optional[str]) -> str:
    def j(value):
        return json.dumps(value, ensure_ascii=False)

    authors = doc.get("authors") if isinstance(doc.get("authors"), list) else []
    raw_tags = doc.get("tags") if isinstance(doc.get("tags"), list) else []
    tags = [str(t).strip().replace(" ", "-") for t in raw_tags if str(t).strip()]
    read_state = doc.get("read_state") or "unread"
    read_state = read_state if read_state in READ_STATE_VALUES else "unread"

    return "\n".join([
        "---",
        f"title: {j(doc.get('title') or '')}",
        f"authors: {j(authors)}",
        f"doi: {j(doc.get('doi') or '')}",
        f"url: {j(doc.get('raw', {}).get('URL') or doc.get('raw', {}).get('url') or doc.get('raw', {}).get('link') or '')}",
        f"year: {j(doc.get('year') or '')}",
        f"tags: {j(tags)}",
        f"papis_id: {j(doc.get('id') or '')}",
        f"library: {j(library or '')}",
        f"read_state: {j(read_state)}",
        "---",
    ])

def _upsert_note_header(note_path: Path, header: str) -> None:
    if not note_path.exists():
        note_path.write_text(header, encoding="utf-8")
        return

    content = note_path.read_text(encoding="utf-8")
    body = _strip_frontmatter(content)
    body = _strip_generated_block(body)

    new_content = "\n".join([
        _build_frontmatter_from_header(header),
        "",
        _build_generated_from_header(header),
        "",
        body.lstrip("\n"),
    ])

    note_path.write_text(new_content, encoding="utf-8")

def _strip_frontmatter(content: str) -> str:
    if not content.startswith("---"):
        return content
    end_idx = content.find("\n---", 3)
    if end_idx == -1:
        return content
    end_idx += len("\n---")
    return content[end_idx:]

def _strip_generated_block(content: str) -> str:
    if NOTE_BLOCK_BEGIN in content and NOTE_BLOCK_END in content:
        start = content.index(NOTE_BLOCK_BEGIN)
        end = content.index(NOTE_BLOCK_END) + len(NOTE_BLOCK_END)
        return content[:start] + content[end:]
    return content

def _build_frontmatter_from_header(header: str) -> str:
    if header.startswith("---"):
        end_idx = header.find("\n---", 3)
        if end_idx != -1:
            return header[:end_idx + len("\n---")]
    return header

def _build_generated_from_header(header: str) -> str:
    if NOTE_BLOCK_BEGIN in header and NOTE_BLOCK_END in header:
        start = header.index(NOTE_BLOCK_BEGIN)
        end = header.index(NOTE_BLOCK_END) + len(NOTE_BLOCK_END)
        return header[start:end]
    return ""

def _write_note_if_missing(doc: dict, library: Optional[str], config: dict) -> Optional[Path]:
    notes_path = Path(config["notes_path"])
    notes_path.mkdir(parents=True, exist_ok=True)

    existing = _find_note_by_papis_id(notes_path, doc.get("id") or "")
    if existing is not None:
        _upsert_note_header(existing, _note_header(doc, library))
        return existing

    doi = doc.get("doi") or ""
    archived_by_doi = _find_note_by_doi(notes_path, doi)
    if archived_by_doi:
        restored = _unique_note_path(notes_path / archived_by_doi.name, [notes_path])
        archived_by_doi.replace(restored)
        _upsert_note_header(restored, _note_header(doc, library))
        return restored

    title = doc.get("title") or doc.get("id") or "paper"
    filename = f"{_note_slug(title)}.md"
    note_path = _unique_note_path(notes_path / filename, [notes_path])
    _upsert_note_header(note_path, _note_header(doc, library))
    return note_path

def _unique_note_path(path: Path, extra_paths: Optional[list[Path]] = None) -> Path:
    extra_paths = extra_paths or []
    if not path.exists() and not any((p / path.name).exists() for p in extra_paths):
        return path
    base = path.stem
    suffix = path.suffix
    parent = path.parent
    counter = 1
    while True:
        candidate = parent / f"{base}-{counter}{suffix}"
        if not candidate.exists() and not any((p / candidate.name).exists() for p in extra_paths):
            return candidate
        counter += 1

def _find_note_by_doi(notes_path: Path, doi: str) -> Optional[Path]:
    if not doi or not notes_path.exists():
        return None
    for path in notes_path.glob("*.md"):
        try:
            content = path.read_text(encoding="utf-8")
            extracted = _extract_doi_from_note(content)
            if extracted and extracted.lower() == doi.lower():
                return path
        except Exception:
            continue
    return None

def _extract_doi_from_note(content: str) -> Optional[str]:
    if not content.startswith("---"):
        return None
    end_idx = content.find("\n---", 3)
    if end_idx == -1:
        return None
    frontmatter = content[:end_idx + len("\n---")]
    m = re.search(r"^doi:\s*(.*)$", frontmatter, flags=re.MULTILINE)
    if not m:
        return None
    value = m.group(1).strip()
    value = value.strip('"')
    return value

def _find_note_by_papis_id(notes_path: Path, papis_id: str) -> Optional[Path]:
    if not papis_id or not notes_path.exists():
        return None
    for path in notes_path.glob("*.md"):
        try:
            content = path.read_text(encoding="utf-8")
            if f"papis_id: {json.dumps(papis_id)}" in content:
                return path
        except Exception:
            continue
    return None


def _launch_obsidian(path: Optional[str] = None, debug: bool = False) -> tuple[bool, dict]:
    def _build_env() -> dict:
        env = dict(os.environ)
        env.pop("ELECTRON_RUN_AS_NODE", None)
        path_value = env.get("PATH", "")
        for p in ["/usr/local/bin", "/usr/bin", "/bin"]:
            if p not in path_value.split(":" ):
                path_value = f"{p}:{path_value}" if path_value else p
        env["PATH"] = path_value
        return env

    def _run(args: list[str], env: dict) -> tuple[bool, dict]:
        if debug:
            result = subprocess.run(args, capture_output=True, text=True, env=env)
            info = {
                "method": "run",
                "args": args,
                "returncode": result.returncode,
                "stdout": result.stdout,
                "stderr": result.stderr,
            }
            return result.returncode == 0, info

        subprocess.Popen(
            args,
            start_new_session=True,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            env=env,
        )
        return True, {"method": "spawn", "args": args}

    if not shutil.which("gtk-launch"):
        return False, {"error": "gtk-launch not found"}

    env = _build_env()
    for desktop_id in ["obsidian", "md.obsidian.Obsidian"]:
        ok, info = _run(["gtk-launch", desktop_id], env)
        if ok:
            return True, info

    return False, {"error": "gtk-launch failed", "env": {
        "PATH": env.get("PATH"),
        "DISPLAY": env.get("DISPLAY"),
        "WAYLAND_DISPLAY": env.get("WAYLAND_DISPLAY"),
        "XDG_RUNTIME_DIR": env.get("XDG_RUNTIME_DIR"),
        "ELECTRON_RUN_AS_NODE": os.environ.get("ELECTRON_RUN_AS_NODE"),
    }}

def _normalize_tag(tag: str) -> str:
    tag = tag.strip().lower()
    tag = re.sub(r"\s*\([^)]*\)", "", tag)
    tag = re.sub(r"\s+", " ", tag).strip()
    return tag

def _select_pdf_path(files: list[str]) -> Optional[Path]:
    if not files:
        return None
    preferred = None
    for f in files:
        name = str(f).lower()
        if name.endswith(".pdf") and ("annotated" in name or "dirty" in name):
            preferred = Path(f)
            break
    if preferred:
        return preferred
    for f in files:
        if str(f).lower().endswith(".pdf"):
            return Path(f)
    return None

def _ensure_dual_pdfs(doc, source_file: Optional[Path]) -> None:
    try:
        doc_folder = doc.get_main_folder()
        if not doc_folder:
            return
        doc_folder = Path(doc_folder)
        doc_folder.mkdir(parents=True, exist_ok=True)

        existing_files = doc.get("files") or []
        source = None
        if source_file and source_file.exists():
            source = Path(source_file)
        else:
            for f in doc.get_files() or []:
                if str(f).lower().endswith(".pdf"):
                    source = Path(f)
                    break
        if source is None or not source.exists():
            return

        base = safe_filename(doc.get("doi") or doc.get("title") or "paper")
        clean_name = _unique_library_filename(doc_folder, f"{base}-clean.pdf")
        dirty_name = _unique_library_filename(doc_folder, f"{base}-annotated.pdf")

        clean_path = doc_folder / clean_name
        dirty_path = doc_folder / dirty_name

        if not clean_path.exists():
            shutil.copy(source, clean_path)
        if not dirty_path.exists():
            shutil.copy(source, dirty_path)

        if clean_name not in existing_files:
            existing_files.append(clean_name)
        if dirty_name not in existing_files:
            existing_files.append(dirty_name)

        doc["files"] = existing_files
        from papis.api import save_doc
        save_doc(doc)
    except Exception:
        return

def _unique_library_filename(folder: Path, name: str) -> str:
    path = folder / name
    if not path.exists():
        return name
    base = path.stem
    suffix = path.suffix
    counter = 1
    while True:
        candidate = folder / f"{base}-{counter}{suffix}"
        if not candidate.exists():
            return candidate.name
        counter += 1

def _openalex_keywords_for_doi(doi: str) -> list[str]:
    """Fetch keywords from OpenAlex for a DOI, return as tag list."""
    if not doi:
        return []
    try:
        doi_url = "https://doi.org/" + doi.strip()
        encoded = urllib.parse.quote(doi_url, safe="")
        url = f"https://api.openalex.org/works/{encoded}"
        with urllib.request.urlopen(url, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        tags: list[str] = []
        for kw in data.get("keywords", []) or []:
            name = kw.get("display_name") if isinstance(kw, dict) else None
            if name:
                tags.append(_normalize_tag(name))
        if not tags:
            for c in data.get("concepts", []) or []:
                name = c.get("display_name") if isinstance(c, dict) else None
                if name:
                    tags.append(_normalize_tag(name))
        return list(dict.fromkeys(tags))
    except Exception:
        return []

@app.post("/api/papers")
def add_paper(
    metadata: str = Form(...),
    file: Optional[UploadFile] = File(None),
    library: Optional[str] = None
):
    """Accepts multipart form with 'metadata' (JSON string) and 'file' (PDF).
    Uses `papis` to add the paper to the library.
    """
    meta = {}
    if metadata:
        try:
            meta = json.loads(metadata)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid metadata JSON")

    if isinstance(meta.get("tags"), list):
        meta["tags"] = [t for t in (_normalize_tag(x) for x in meta.get("tags")) if t]

    file_path = None
    if file is not None:
        if file.content_type != "application/pdf":
            raise HTTPException(status_code=400, detail="Only PDFs allowed")

        if not file.filename.lower().endswith(".pdf"):
            raise HTTPException(status_code=400, detail="Invalid file extension")

        tmpdir = Path(tempfile.mkdtemp(prefix="papis_add_"))
        doi = meta.get("doi")
        title = meta.get("title") or "paper"
        name = "paper-" + safe_filename(doi or title)
        file_path = tmpdir / f"{name}.pdf"

        with open(file_path, "wb") as f:
            shutil.copyfileobj(file.file, f)

    if not papis_importable():
        raise HTTPException(status_code=500, detail="papis library not available in this environment")

    _set_library_from_param(library)
    res = run_papis_add(str(file_path) if file_path else None, meta)
    if res.get("ok"):
        if file_path and res.get("paper"):
            try:
                _set_library_from_param(library)
                from papis.database import get_database
                db = get_database()
                doc = db.find_by_id(res.get("paper").get("id"))
                if doc is not None:
                    _ensure_dual_pdfs(doc, file_path)
            except Exception:
                pass

        config = _get_obsidian_config()
        if config and res.get("paper"):
            try:
                _write_note_if_missing(res.get("paper"), library, config)
            except Exception:
                pass
        return {"source": "papis", "result": res}

    raise HTTPException(status_code=500, detail=f"Failed to add paper: {res}")


@app.get("/api/papers/{paper_id}/pdf")
def get_pdf(paper_id: str, variant: str = "clean", library: Optional[str] = None):
    try:
        _set_library_from_param(library)
        from papis.database import get_database

        db = get_database()
        doc = db.find_by_id(paper_id)
        if doc is None:
            raise HTTPException(status_code=404, detail="Paper not found")

        files = doc.get_files()  # List[str] (absolute paths)
        pdf_path = _select_pdf_path(files)

        if pdf_path is None or not pdf_path.exists():
            raise HTTPException(status_code=404, detail="PDF not found")

        return Response(
            pdf_path.read_bytes(),
            media_type="application/pdf",
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail="Failed to read papis database",
        ) from e

@app.post("/api/papers/{paper_id}/pdf")
def add_pdf_to_paper(paper_id: str, file: UploadFile = File(...), library: Optional[str] = None):
    """Attach a PDF to an existing paper."""
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Only PDFs allowed")

    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Invalid file extension")

    if not papis_importable():
        raise HTTPException(status_code=500, detail="papis library not available in this environment")

    try:
        _set_library_from_param(library)
        from papis.database import get_database
        from papis.commands.addto import run as addto_run

        db = get_database()
        doc = db.find_by_id(paper_id)
        if doc is None:
            raise HTTPException(status_code=404, detail="Paper not found")

        tmpdir = Path(tempfile.mkdtemp(prefix="papis_addto_"))
        file_path = tmpdir / safe_filename(file.filename)
        with open(file_path, "wb") as f:
            shutil.copyfileobj(file.file, f)

        # create clean + dirty copies in the document folder
        _ensure_dual_pdfs(doc, file_path)

        # reload document
        doc = db.find_by_id(paper_id)
        return {"ok": True, "paper": _doc_to_json(doc)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to add PDF: {e}")

@app.post("/api/resolve-bib")
def resolve_bib(file: UploadFile = File(...)):
    """Parse BibTeX quickly and return basic fields (no metadata fetch)."""
    try:
        content = file.file.read().decode("utf-8", errors="ignore")
    except Exception:
        raise HTTPException(status_code=400, detail="Failed to read bib file")

    # naive entry parsing
    entries = re.findall(r"@\w+\s*\{[^@]*\}", content, flags=re.DOTALL)

    def _field(entry: str, name: str) -> Optional[str]:
        m = re.search(rf"{name}\s*=\s*(\{{[^\}}]*\}}|\"[^\"]*\"|[^,\n]+)", entry, flags=re.IGNORECASE)
        if not m:
            return None
        val = m.group(1).strip()
        if val.startswith("{") and val.endswith("}"):
            val = val[1:-1]
        if val.startswith("\"") and val.endswith("\""):
            val = val[1:-1]
        return val.strip()

    items = []
    for i, entry in enumerate(entries):
        doi = _field(entry, "doi")
        title = _field(entry, "title")
        author = _field(entry, "author")
        year = _field(entry, "year")
        url = _field(entry, "url") or _field(entry, "link")

        # fallback DOI regex if field missing
        if not doi:
            m = re.search(r"10\.\d{4,9}/[^\s\"\{\}<>]+", entry)
            doi = m.group(0).rstrip(".") if m else None

        items.append({
            "id": f"entry-{i}",
            "doi": doi,
            "title": title,
            "author": author,
            "year": year,
            "url": url,
        })

    return {"count": len(items), "items": items}

@app.post("/api/resolve-dois")
def resolve_dois(body: dict = Body(...)):
    """Resolve a list of DOIs to metadata only when needed."""
    if not papis_importable():
        raise HTTPException(status_code=500, detail="papis library not available in this environment")

    dois = body.get("dois") if isinstance(body, dict) else None
    if not isinstance(dois, list):
        raise HTTPException(status_code=400, detail="Expected 'dois' list")

    items = []
    try:
        from papis.api import doi_to_data
        for doi in dois:
            if not doi:
                items.append({"doi": doi, "ok": False, "error": "Missing DOI"})
                continue
            try:
                data = doi_to_data(doi)
                tags = _openalex_keywords_for_doi(doi)
                if tags and isinstance(data, dict):
                    existing = data.get("tags") if isinstance(data.get("tags"), list) else []
                    data["tags"] = list(dict.fromkeys([*existing, *tags]))
                items.append({"doi": doi, "ok": True, "metadata": data})
            except Exception as e:
                items.append({"doi": doi, "ok": False, "error": str(e)})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to resolve DOIs: {e}")

    return {"count": len(items), "items": items}

@app.delete("/api/papers/{paper_id}")
def delete_paper(paper_id: str, library: Optional[str] = None):
    """Delete a paper from the papis library by papis id."""
    if not papis_importable():
        raise HTTPException(status_code=500, detail="papis library not available in this environment")

    try:
        _set_library_from_param(library)
        from papis.database import get_database
        from papis.document import delete as delete_document, describe

        db = get_database()
        doc = db.find_by_id(paper_id)
        if doc is None:
            raise HTTPException(status_code=404, detail="Paper not found")

        doc_json = _doc_to_json(doc)
        config = _get_obsidian_config()

        # remove folder from filesystem
        delete_document(doc)
        # remove from papis database/cache
        db.delete(doc)

        return {"ok": True, "id": paper_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete paper: {e}")


@app.post("/api/papers/{paper_id}/open-note")
def open_note(paper_id: str, library: Optional[str] = None, debug: bool = False):
    config = _get_obsidian_config()
    if not config:
        raise HTTPException(status_code=400, detail="Obsidian vault not configured")

    try:
        _set_library_from_param(library)
        from papis.database import get_database
        db = get_database()
        doc = db.find_by_id(paper_id)
        if doc is None:
            raise HTTPException(status_code=404, detail="Paper not found")
        doc_json = _doc_to_json(doc)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to read papis database")

    note_path = _find_note_by_papis_id(Path(config["notes_path"]), doc_json.get("id") or "")
    if note_path is None:
        note_path = _write_note_if_missing(doc_json, library, config)
    if note_path is None:
        raise HTTPException(status_code=500, detail="Failed to create or locate note")

    vault_path = Path(config["vault_path"])
    vault_name = config.get("vault_name") or vault_path.name
    try:
        rel = note_path.relative_to(vault_path).as_posix()
    except Exception:
        rel = note_path.name

    opened, info = _launch_obsidian(str(note_path), debug=debug)
    if not opened:
        uri = f"obsidian://open?vault={urllib.parse.quote(vault_name)}&file={urllib.parse.quote(rel)}"
        try:
            opened = webbrowser.open(uri)
            if not opened:
                raise RuntimeError("Failed to open obsidian URI")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to open Obsidian: {e}")

    return {"ok": True, "note": str(note_path), "debug": info if debug else None}


@app.post("/api/obsidian/open-vault")
def open_obsidian_vault(debug: bool = False):
    config = _get_obsidian_config()
    if not config:
        raise HTTPException(status_code=400, detail="Obsidian vault not configured")

    vault_path = Path(config["vault_path"])
    if not vault_path.exists():
        raise HTTPException(status_code=404, detail="Vault path not found")

    _ensure_obsidian_dirs(vault_path)

    # Prefer opening by path (creates/opens vault). Fall back to vault name.
    opened, info = _launch_obsidian(str(vault_path), debug=debug)
    if not opened:
        uri = f"obsidian://open?path={urllib.parse.quote(str(vault_path))}"
        try:
            opened = webbrowser.open(uri)
            if not opened:
                raise RuntimeError("Failed to open obsidian URI")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to open Obsidian: {e}")

    return {"ok": True, "vault": str(vault_path), "debug": info if debug else None}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, log_level="info")
