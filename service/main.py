from fastapi import FastAPI, HTTPException, Response
from fastapi.responses import FileResponse
from fastapi import Form, File, UploadFile, Body
import json
from pathlib import Path
from typing import Optional
import uuid
import hashlib
import shutil
import tempfile
import os
import re
import urllib.parse
import urllib.request
import webbrowser
import subprocess
import sys

import platformdirs

app = FastAPI()

WEB_UI_DIST = Path(__file__).resolve().parents[1] / "web-ui" / "dist"

SAMPLE_FILE = Path(__file__).parent / "sample_papers.json"
# Machine-specific config and state live in the user's folders (on Linux
# ~/.config/aurora-lib and ~/.local/state/aurora-lib), not in the source tree.
AURORA_CONFIG_DIR = Path(platformdirs.user_config_dir("aurora-lib", appauthor=False))
AURORA_STATE_DIR = Path(platformdirs.user_state_dir("aurora-lib", appauthor=False))
UI_STATE_FILE = AURORA_STATE_DIR / "ui-state.json"
AURORA_CONFIG_FILE = AURORA_CONFIG_DIR / "config.json"
VAULT_CONFIG_FILENAME = ".aurora-lib.json"
AURORA_PAPIS_CONFIG_DIR = AURORA_STATE_DIR / "papis"
STRICT_UNIQUE_DOCUMENT_KEYS = ["doi", "eprint", "url", "doc_url"]
DEFAULT_NOTES_DIR = "paper-notes"
LEGACY_NOTE_BLOCK_BEGIN = "%% AURORA:BEGIN %%"
LEGACY_NOTE_BLOCK_END = "%% AURORA:END %%"
LEGACY_NOTE_BLOCK_BEGIN_HTML = "<!-- AURORA:BEGIN -->"
LEGACY_NOTE_BLOCK_END_HTML = "<!-- AURORA:END -->"
READ_STATE_VALUES = [
    "unread",
    "want_to_read",
    "reading",
    "read_abstract",
    "read_shallow",
    "read_deep",
]
READ_STATE_EMOJI = {
    "unread": "⚪",
    "want_to_read": "⭐",
    "reading": "📖",
    "read_abstract": "📄",
    "read_shallow": "📘",
    "read_deep": "📚",
}

# Aurora-scoped papis config root (override any system-wide papis config)
os.environ["PAPIS_CONFIG_DIR"] = str(AURORA_PAPIS_CONFIG_DIR)

def _is_single_library_mode() -> bool:
    return os.environ.get("AURORA_SINGLE_LIBRARY", "").lower() in {"1", "true", "yes", "on"}

def _is_docker_mode() -> bool:
    return os.environ.get("AURORA_DOCKER", "").lower() in {"1", "true", "yes", "on"}

def _single_library_vault_path() -> Optional[Path]:
    if not _is_single_library_mode():
        return None
    vault = os.environ.get("AURORA_DEFAULT_VAULT")
    if not vault:
        return None
    return Path(vault).expanduser().resolve()

def _enforce_single_library_path(vault_path: Path) -> None:
    expected = _single_library_vault_path()
    if expected and vault_path.resolve() != expected:
        raise HTTPException(status_code=400, detail="This instance is locked to a single vault path")


@app.on_event("startup")
def _aurora_startup() -> None:
    if not papis_importable():
        return
    try:
        import papis.config as papis_config

        AURORA_PAPIS_CONFIG_DIR.mkdir(parents=True, exist_ok=True)
        papis_config.reset_configuration()
    except Exception:
        pass

def _bootstrap_from_env() -> None:
    vault_path_env = os.environ.get("AURORA_DEFAULT_VAULT")
    if not vault_path_env:
        return
    vault_path = Path(vault_path_env).expanduser().resolve()
    if not vault_path.exists():
        return

    data = _load_aurora_config()
    existing_vault = data.get("vault_path") if isinstance(data, dict) else None
    if isinstance(existing_vault, str) and existing_vault.strip():
        try:
            existing_path = Path(existing_vault).expanduser().resolve()
        except Exception:
            existing_path = None
        if existing_path == vault_path:
            return
        # In single-library / docker mode, always prefer the configured env vault.
        if not (_is_single_library_mode() or _is_docker_mode()):
            return

    vault_cfg = _load_vault_config(vault_path) or {}
    library_uuid = vault_cfg.get("library_uuid")
    if not library_uuid:
        library_uuid = str(uuid.uuid4())
        vault_cfg["library_uuid"] = library_uuid
        try:
            _save_vault_config(vault_path, vault_cfg)
        except Exception:
            pass

    base_library_name = vault_cfg.get("library_name") or os.environ.get("AURORA_DEFAULT_LIBRARY") or "paper-lib"
    library_name = _with_library_hash(base_library_name, library_uuid)
    default_dir_name = safe_filename(base_library_name) or "paper-lib"
    if isinstance(vault_cfg.get("library_dir"), str) and vault_cfg.get("library_dir"):
        library_dir_name = str(vault_cfg.get("library_dir"))
    elif (vault_path / default_dir_name).exists():
        # Backward-compatible: if an existing plain folder is present (e.g. paper-lib), use it.
        library_dir_name = default_dir_name
    else:
        library_dir_name = safe_filename(library_name) or "paper-lib"
    library_path = vault_path / library_dir_name
    notes_path = _ensure_obsidian_dirs(vault_path)
    library_path.mkdir(parents=True, exist_ok=True)

    if papis_importable():
        try:
            import papis.config as papis_config

            config = papis_config.get_configuration()
            if not config.has_section(library_name):
                config.add_section(library_name)
            config[library_name]["dir"] = str(library_path)

            general_section = papis_config.get_general_settings_name()
            if not config.has_section(general_section):
                config.add_section(general_section)
            config[general_section]["default-library"] = library_name
            config[general_section]["unique-document-keys"] = repr(STRICT_UNIQUE_DOCUMENT_KEYS)

            config_folder = papis_config.get_config_folder()
            os.makedirs(config_folder, exist_ok=True)
            config_file = papis_config.get_config_file()
            with open(config_file, "w", encoding="utf-8") as configfile:
                config.write(configfile)

            papis_config.set_lib_from_name(library_name)
        except Exception:
            pass

    aurora_config = {
        "repo_path": str(vault_path),
        "library_name": library_name,
        "library_path": str(library_path),
        "vault_name": vault_path.name,
        "vault_path": str(vault_path),
        "notes_path": str(notes_path),
        "library_uuid": library_uuid,
    }
    try:
        _save_aurora_config(aurora_config)
        _save_vault_config(vault_path, {
            "library_name": base_library_name,
            "library_dir": library_dir_name,
            "library_uuid": library_uuid,
        })
    except Exception:
        pass

def _resolve_library_name(library: Optional[str]) -> str:
    if library:
        return library
    data = _load_aurora_config()
    name = data.get("library_name") if isinstance(data, dict) else None
    if name:
        return name
    raise HTTPException(status_code=400, detail="Library not configured. Please set up or import a library.")


def _set_library_from_param(library: Optional[str]) -> None:
    if not papis_importable():
        raise HTTPException(status_code=500, detail="papis library not available in this environment")
    libname = _resolve_library_name(library)
    try:
        from papis.api import set_lib_from_name
        set_lib_from_name(libname)
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
        "contexts": doc.get("contexts") or doc.get("projects") or [],
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
        _set_library_from_param(library)
        from papis.database import get_database
        import papis.config as papis_config

        aurora_cfg = _load_aurora_config()
        library_path = None
        if isinstance(aurora_cfg, dict):
            library_path = aurora_cfg.get("library_path")

        if library_path:
            try:
                info_name = papis_config.getstring("info-name") or "info.yaml"
                for _root, _dirs, files in os.walk(library_path):
                    if info_name in files:
                        break
                else:
                    try:
                        from papis.api import clear_lib_cache

                        clear_lib_cache()
                    except Exception:
                        pass
                    return []
            except Exception:
                pass

        db = get_database()
        docs = db.get_all_documents()
        return [_doc_to_json(d) for d in docs]

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
    return {"source": "empty", "papers": []}


@app.post("/api/setup")
def setup_aurora(body: dict = Body(...)):
    """Set up a new Aurora repo with papis library + obsidian vault."""
    base = body.get("path") if isinstance(body, dict) else None
    if not base:
        raise HTTPException(status_code=400, detail="Missing 'path'")

    base_path = Path(base).expanduser().resolve()
    _enforce_single_library_path(base_path)
    mode = body.get("mode") if isinstance(body, dict) else None
    library_name = body.get("library") if isinstance(body, dict) else None
    vault_name = body.get("vault") if isinstance(body, dict) else None
    library_name = library_name or "aurora"

    vault_path = base_path
    vault_name = base_path.name or (vault_name or "obsidian-vault")

    if mode == "import":
        vault_cfg = _load_vault_config(vault_path)
        if not vault_cfg:
            raise HTTPException(status_code=404, detail="No Aurora vault config found to import")
        library_uuid = vault_cfg.get("library_uuid")
        if not library_uuid:
            raise HTTPException(status_code=400, detail="Vault config missing library UUID")
        aurora_cfg = _load_aurora_config()
        if isinstance(aurora_cfg, dict):
            existing_uuid = aurora_cfg.get("library_uuid")
            existing_path = aurora_cfg.get("vault_path")
            if existing_uuid and existing_uuid == library_uuid:
                if existing_path and Path(existing_path).resolve() != vault_path:
                    raise HTTPException(status_code=409, detail="This library is already configured in another location")
        library_name = vault_cfg.get("library_name") or library_name
        library_dir_name = vault_cfg.get("library_dir") or safe_filename(library_name) or "aurora"
    else:
        library_dir_name = safe_filename(library_name) or "aurora"
        library_uuid = str(uuid.uuid4())

    library_name = _with_library_hash(library_name, library_uuid)
    library_path = vault_path / library_dir_name
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
        # Always set default library to the newly created one
        config[general_section]["default-library"] = library_name
        config[general_section]["unique-document-keys"] = repr(STRICT_UNIQUE_DOCUMENT_KEYS)

        config_folder = papis_config.get_config_folder()
        os.makedirs(config_folder, exist_ok=True)
        config_file = papis_config.get_config_file()
        with open(config_file, "w", encoding="utf-8") as configfile:
            config.write(configfile)

        papis_config.set_lib_from_name(library_name)
        try:
            from papis.api import clear_lib_cache

            clear_lib_cache()
        except Exception:
            pass
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to configure papis: {e}")

    aurora_config = {
        "repo_path": str(vault_path),
        "library_name": library_name,
        "library_path": str(library_path),
        "vault_name": vault_name,
        "vault_path": str(vault_path),
        "notes_path": str(notes_path),
        "library_uuid": library_uuid,
    }
    try:
        _save_aurora_config(aurora_config)
        _save_vault_config(vault_path, {
            "library_name": _strip_library_hash(library_name),
            "library_dir": library_dir_name,
            "library_uuid": library_uuid,
        })
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
        UI_STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
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
        doi = _normalize_doi(doi)
        if doi is None or doi == "":
            raise RuntimeError("DOI is empty")
        data = None
        try:
            from papis.api import doi_to_data
            data = doi_to_data(doi)
        except Exception:
            data = _datacite_doi_to_data(doi)

        tags = _openalex_keywords_for_doi(doi)
        if tags and isinstance(data, dict):
            existing = data.get("tags") if isinstance(data.get("tags"), list) else []
            data["tags"] = list(dict.fromkeys([*existing, *tags]))

        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to resolve DOI: " + str(e))


@app.get("/api/lib")
def get_current_library():
    """Return the name of the current papis library."""
    if not papis_importable():
        raise HTTPException(status_code=500, detail="papis library not available in this environment")
    try:
        data = _load_aurora_config()
        name = data.get("library_name") if isinstance(data, dict) else None
        return {"library": name}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get current library: {e}")


@app.get("/api/aurora/config")
def get_aurora_config():
    data = _load_aurora_config()
    single_mode = _is_single_library_mode()
    docker_mode = _is_docker_mode()
    single_path = _single_library_vault_path()
    if not data:
        return {
            "configured": False,
            "single_library": single_mode,
            "docker_mode": docker_mode,
            "default_vault": str(single_path) if single_path else None,
        }
    return {
        "configured": True,
        "config": data,
        "single_library": single_mode,
        "docker_mode": docker_mode,
        "default_vault": str(single_path) if single_path else None,
    }


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

        aurora_cfg = _load_aurora_config()
        aurora_name = aurora_cfg.get("library_name") if isinstance(aurora_cfg, dict) else None
        aurora_path = aurora_cfg.get("library_path") if isinstance(aurora_cfg, dict) else None
        if aurora_name and aurora_path:
            return {"libraries": [{"name": aurora_name, "paths": [aurora_path]}]}

        return {"libraries": []}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get library details: {e}")


@app.get("/api/papis/config")
def get_papis_config():
    if not papis_importable():
        raise HTTPException(status_code=500, detail="papis library not available in this environment")
    try:
        import papis.config as papis_config

        aurora_cfg = _load_aurora_config()
        aurora_name = aurora_cfg.get("library_name") if isinstance(aurora_cfg, dict) else None
        aurora_path = aurora_cfg.get("library_path") if isinstance(aurora_cfg, dict) else None
        return {
            "config_dir": papis_config.get_config_folder(),
            "config_file": papis_config.get_config_file(),
            "library_name": aurora_name,
            "library_path": aurora_path,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read papis config: {e}")


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

        update_fn = getattr(cache_cmd.update_newer, "callback", cache_cmd.update_newer)
        update_fn(
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


@app.get("/api/contexts")
def get_contexts(library: Optional[str] = None):
    """Return list of unique contexts across the library."""
    if not papis_importable():
        raise HTTPException(status_code=500, detail="papis library not available in this environment")
    try:
        _set_library_from_param(library)
        from papis.database import get_database
        db = get_database()
        contexts = set()
        for doc in db.get_all_documents():
            doc_contexts = doc.get("contexts") or doc.get("projects") or []
            if isinstance(doc_contexts, list):
                contexts.update([c for c in doc_contexts if isinstance(c, str) and c.strip()])
        return {"contexts": sorted(contexts)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read contexts: {e}")


@app.get("/api/projects")
def get_projects(library: Optional[str] = None):
    """Back-compat: Return list of unique contexts across the library."""
    return get_contexts(library)

@app.post("/api/notes/refresh")
def refresh_notes(library: Optional[str] = None):
    """Regenerate/update Obsidian note headers for all papers."""
    if not papis_importable():
        raise HTTPException(status_code=500, detail="papis library not available in this environment")
    config = _get_obsidian_config()
    if not config:
        raise HTTPException(status_code=400, detail="Obsidian vault not configured")
    try:
        _set_library_from_param(library)
        from papis.database import get_database
        db = get_database()
        updated = 0
        skipped = 0
        for doc in db.get_all_documents():
            try:
                doc_json = _doc_to_json(doc)
                note_path = _write_note_if_missing(doc_json, library, config)
                if note_path:
                    updated += 1
                else:
                    skipped += 1
            except Exception:
                skipped += 1
        return {"ok": True, "updated": updated, "skipped": skipped, "notes_path": config.get("notes_path")}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to refresh notes: {e}")

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
        raise HTTPException(status_code=500, detail=f"Failed to update tags: {e}")


@app.post("/api/papers/{paper_id}/contexts")
def set_paper_contexts(paper_id: str, body: dict = Body(...), library: Optional[str] = None):
    """Set contexts for a paper. Body: {'contexts': ['ctx1', 'ctx2']}"""
    if not papis_importable():
        raise HTTPException(status_code=500, detail="papis library not available in this environment")
    contexts = body.get("contexts") if isinstance(body, dict) else None
    if not isinstance(contexts, list):
        raise HTTPException(status_code=400, detail="Missing or invalid 'contexts' list")
    contexts = [_normalize_tag(c) for c in contexts if isinstance(c, str) and c.strip()]
    try:
        _set_library_from_param(library)
        from papis.database import get_database
        from papis.api import save_doc

        db = get_database()
        doc = db.find_by_id(paper_id)
        if doc is None:
            raise HTTPException(status_code=404, detail="Paper not found")
        doc["contexts"] = contexts
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
        raise HTTPException(status_code=500, detail=f"Failed to update contexts: {e}")


@app.post("/api/papers/{paper_id}/projects")
def set_paper_projects(paper_id: str, body: dict = Body(...), library: Optional[str] = None):
    """Back-compat: Set contexts for a paper. Body: {'projects': ['proj1', 'proj2']}"""
    if not isinstance(body, dict):
        raise HTTPException(status_code=400, detail="Invalid body")
    if "contexts" not in body:
        body = {**body, "contexts": body.get("projects")}
    return set_paper_contexts(paper_id, body, library)


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
        import papis.config as papis_config
        # papis.commands.add.run signature: run(paths: list[str], data: dict|None = None, ...)
        paths = [str(file_path)] if file_path else []
        base_path = None
        try:
            lib_dirs = papis_config.get_lib_dirs()
            base_path = lib_dirs[0] if lib_dirs else None
        except Exception:
            base_path = None

        if not base_path:
            aurora_config = _load_aurora_config()
            lib_path = aurora_config.get("library_path") if isinstance(aurora_config, dict) else None
            if lib_path:
                base_path = lib_path

        if not base_path:
            return {"ok": False, "error": "No library directory configured"}

        papis_add_run(
            paths,
            data=metadata,
            batch=True,
            confirm=False,
            edit=False,
            base_path=str(base_path),
        )
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

def _library_hash(library_uuid: str) -> str:
    digest = hashlib.sha1(library_uuid.encode("utf-8")).hexdigest()
    return digest[:8]

def _with_library_hash(name: str, library_uuid: str) -> str:
    base = (name or "").strip()
    suffix = _library_hash(library_uuid)
    if base.endswith(f"-{suffix}"):
        return base
    return f"{base}-{suffix}" if base else suffix

def _strip_library_hash(name: str) -> str:
    base = (name or "").strip()
    m = re.match(r"^(.*?)-[0-9a-f]{8}$", base)
    return m.group(1) if m else base

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
    AURORA_CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True)
    AURORA_CONFIG_FILE.write_text(json.dumps(data, indent=2))


def _vault_config_path(vault_path: Path) -> Path:
    return vault_path / VAULT_CONFIG_FILENAME


def _load_vault_config(vault_path: Path) -> dict | None:
    try:
        path = _vault_config_path(vault_path)
        if not path.exists():
            return None
        data = json.loads(path.read_text())
        return data if isinstance(data, dict) else None
    except Exception:
        return None


def _save_vault_config(vault_path: Path, data: dict) -> None:
    path = _vault_config_path(vault_path)
    path.write_text(json.dumps(data, indent=2))

def _get_obsidian_config() -> Optional[dict]:
    data = _load_aurora_config()
    vault_path = data.get("vault_path")
    notes_path = data.get("notes_path")
    if not vault_path or not notes_path:
        return None
    return data


def _ensure_obsidian_dirs(vault_path: Path) -> Path:
    notes_path = vault_path / DEFAULT_NOTES_DIR
    notes_path.mkdir(parents=True, exist_ok=True)
    return notes_path

def _note_header(doc: dict, library: Optional[str]) -> str:
    generated = _build_generated_note_block(doc)
    return "\n".join([
        _build_frontmatter(doc, library),
        "",
        generated,
        "",
        "## Notes",
        "",
    ])

def _build_generated_note_block(doc: dict) -> str:
    pdf_link = _note_pdf_link(doc)
    if not pdf_link:
        return ""
    label, rel_path, pdf_path = pdf_link
    line = f"**Link to pdf:** [{label}]({rel_path})"
    # The relative link only resolves where the library is checked out. The GitHub
    # one resolves anywhere, which is how PDFs stay reachable from a device that
    # syncs the vault but not the library (the phone).
    if pdf_path is not None and pdf_path.is_absolute():
        remote = _github_pdf_url(pdf_path)
        if remote:
            line += f" · [on GitHub]({remote})"
    return line


_GITHUB_BASE_CACHE: dict[str, Optional[str]] = {}


def _github_blob_base(repo_dir: Path) -> Optional[str]:
    """`https://github.com/<owner>/<repo>/blob/<branch>` for the repo at `repo_dir`.

    Returns None when it is not a git repo, has no origin, or origin is not GitHub.
    """
    key = str(repo_dir)
    if key in _GITHUB_BASE_CACHE:
        return _GITHUB_BASE_CACHE[key]

    base = None
    try:
        def _git(*args: str) -> Optional[str]:
            out = subprocess.run(
                ["git", "-C", key, *args],
                capture_output=True,
                text=True,
                timeout=5,
            )
            return out.stdout.strip() if out.returncode == 0 else None

        url = _git("remote", "get-url", "origin")
        branch = _git("rev-parse", "--abbrev-ref", "HEAD")
        if url and branch and branch != "HEAD":
            m = re.match(
                r"^(?:git@github\.com:|https://github\.com/)(.+?)(?:\.git)?$", url
            )
            if m:
                base = f"https://github.com/{m.group(1)}/blob/{branch}"
    except Exception:
        base = None

    _GITHUB_BASE_CACHE[key] = base
    return base


def _github_pdf_url(pdf_path: Path) -> Optional[str]:
    """Link to `pdf_path` on GitHub, or None if it is not in a GitHub-backed repo."""
    try:
        top = subprocess.run(
            ["git", "-C", str(pdf_path.parent), "rev-parse", "--show-toplevel"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if top.returncode != 0:
            return None
        toplevel = Path(top.stdout.strip())
        base = _github_blob_base(toplevel)
        if not base:
            return None
        rel = pdf_path.resolve().relative_to(toplevel.resolve()).as_posix()
    except Exception:
        return None
    return f"{base}/{urllib.parse.quote(rel)}"


def _note_pdf_link(doc: dict) -> Optional[tuple[str, str, Optional[Path]]]:
    files_raw = doc.get("files")
    files: list[str] = [str(f) for f in files_raw] if isinstance(files_raw, list) else []
    aurora_cfg = _load_aurora_config()
    vault_value = aurora_cfg.get("vault_path")
    library_value = aurora_cfg.get("library_path")
    vault_path = Path(vault_value) if isinstance(vault_value, str) else None
    library_path = Path(library_value) if isinstance(library_value, str) else None
    folder_name = (
        doc.get("folder_name")
        or doc.get("raw", {}).get("folder")
        or doc.get("raw", {}).get("dir")
        or doc.get("id")
    )

    def _materialize_path(value: str) -> Path:
        candidate = Path(value)
        if candidate.is_absolute():
            return candidate
        if library_path and folder_name:
            return library_path / str(folder_name) / candidate.name
        if library_path:
            return library_path / candidate.name
        return candidate

    candidates: list[Path] = []
    for f in files:
        if isinstance(f, str) and f.lower().endswith(".pdf"):
            candidates.append(_materialize_path(f))

    # If file list is stale or missing, fall back to scanning the document folder.
    if library_path and folder_name:
        folder = library_path / str(folder_name)
        if folder.exists():
            for p in sorted(folder.glob("*.pdf")):
                if p not in candidates:
                    candidates.append(p)

    if not candidates:
        return None

    def _score(p: Path) -> tuple[int, int]:
        name = p.name.lower()
        preferred = 0
        if "annotated" in name or "dirty" in name:
            preferred = 2
        elif name.endswith(".pdf"):
            preferred = 1
        exists = 1 if p.exists() else 0
        # Existence outranks the annotated/clean preference: a deleted -annotated.pdf
        # must not win over a -clean.pdf that is actually there.
        return (exists, preferred)

    candidates.sort(key=_score, reverse=True)
    pdf_path = candidates[0]

    # papis serves documents from a cache that is not invalidated when a document
    # folder disappears, so `files` can name PDFs that are no longer on disk.
    # Emitting a link to those leaves dead links in the notes; no link is better.
    if not pdf_path.exists():
        return None

    rel_path = None
    if pdf_path.is_absolute() and vault_path:
        try:
            rel_path = pdf_path.relative_to(vault_path)
        except Exception:
            rel_path = None
    if rel_path is None:
        if library_path and vault_path:
            try:
                library_rel = library_path.relative_to(vault_path)
            except Exception:
                library_rel = None
            if library_rel is not None:
                if folder_name:
                    rel_path = library_rel / str(folder_name) / pdf_path.name
                else:
                    rel_path = library_rel / pdf_path.name
        if rel_path is None:
            rel_path = Path(pdf_path.name)

    label = pdf_path.name
    return label, rel_path.as_posix(), pdf_path

def _build_frontmatter(doc: dict, library: Optional[str]) -> str:
    def j(value):
        return json.dumps(value, ensure_ascii=False)

    authors = doc.get("authors") if isinstance(doc.get("authors"), list) else []
    raw_tags = doc.get("tags")
    if not isinstance(raw_tags, list):
        raw_tags = []
    tags = [str(t).strip().replace(" ", "-") for t in raw_tags if str(t).strip()]
    raw_contexts = doc.get("contexts")
    if not isinstance(raw_contexts, list):
        raw_contexts = doc.get("projects")
    if not isinstance(raw_contexts, list):
        raw_contexts = []
    contexts = [str(c).strip().replace(" ", "-") for c in raw_contexts if str(c).strip()]
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
        f"contexts: {j(contexts)}",
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
    body = _strip_until_notes_heading(body)

    generated = _build_generated_from_header(header)
    parts = [
        _build_frontmatter_from_header(header),
        "",
    ]
    if generated:
        parts.extend([generated, ""])
    parts.extend([
        "## Notes",
        "",
        body.lstrip("\n"),
    ])
    new_content = "\n".join(parts)

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
    if LEGACY_NOTE_BLOCK_BEGIN in content and LEGACY_NOTE_BLOCK_END in content:
        start = content.index(LEGACY_NOTE_BLOCK_BEGIN)
        end = content.index(LEGACY_NOTE_BLOCK_END) + len(LEGACY_NOTE_BLOCK_END)
        return content[:start] + content[end:]
    if LEGACY_NOTE_BLOCK_BEGIN_HTML in content and LEGACY_NOTE_BLOCK_END_HTML in content:
        start = content.index(LEGACY_NOTE_BLOCK_BEGIN_HTML)
        end = content.index(LEGACY_NOTE_BLOCK_END_HTML) + len(LEGACY_NOTE_BLOCK_END_HTML)
        return content[:start] + content[end:]
    return content

def _strip_until_notes_heading(content: str) -> str:
    marker = "\n## Notes"
    idx = content.find(marker)
    if idx == -1:
        if content.lstrip().startswith("## Notes"):
            return content.lstrip()[len("## Notes"):].lstrip("\n")
        return content
    return content[idx + len(marker):].lstrip("\n")

def _build_frontmatter_from_header(header: str) -> str:
    if header.startswith("---"):
        end_idx = header.find("\n---", 3)
        if end_idx != -1:
            return header[:end_idx + len("\n---")]
    return header

def _build_generated_from_header(header: str) -> str:
    body = _strip_frontmatter(header)
    body = _strip_generated_block(body)
    marker = "\n## Notes"
    idx = body.find(marker)
    if idx == -1:
        return body.strip()
    return body[:idx].strip()

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

        allowed = {clean_name, dirty_name}

        # Remove any other PDF copies from the document folder
        for f in list(existing_files):
            try:
                name = Path(f).name
                if name in allowed:
                    continue
                if name.lower().endswith(".pdf"):
                    extra = doc_folder / name
                    if extra.exists():
                        extra.unlink()
            except Exception:
                continue

        # If source was an extra PDF in the folder, remove it
        try:
            if source.name not in allowed:
                if source.exists() and source.parent == doc_folder:
                    source.unlink()
        except Exception:
            pass

        doc["files"] = [f for f in existing_files if Path(f).name in allowed]
        if clean_name not in doc["files"]:
            doc["files"].append(clean_name)
        if dirty_name not in doc["files"]:
            doc["files"].append(dirty_name)
        from papis.api import save_doc
        save_doc(doc)
    except Exception:
        return

def _open_with_default_app(path: Path) -> None:
    if sys.platform.startswith("darwin"):
        subprocess.Popen(["open", str(path)])
    elif sys.platform.startswith("win"):
        subprocess.Popen(["cmd.exe", "/c", "start", "", str(path)])
    else:
        subprocess.Popen(["xdg-open", str(path)])

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
        doi_url = "https://doi.org/" + _normalize_doi(doi)
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

def _normalize_doi(doi: str) -> str:
    value = (doi or "").strip()
    if not value:
        return ""
    lower = value.lower()
    if lower.startswith("http://") or lower.startswith("https://"):
        try:
            parsed = urllib.parse.urlparse(value)
            if parsed.netloc.lower() in {"doi.org", "dx.doi.org"}:
                return parsed.path.lstrip("/")
        except Exception:
            return value
    return value

def _normalize_single_author(name: str) -> str:
    value = (name or "").strip()
    if not value:
        return ""
    value = re.sub(r"\s+", " ", value)
    if "," in value:
        parts = [p.strip() for p in value.split(",") if p.strip()]
        if len(parts) >= 2:
            family = parts[0]
            given = " ".join(parts[1:])
            return " ".join([given, family]).strip()
    return value

def _split_author_names(raw: str) -> list[str]:
    value = (raw or "").strip()
    if not value:
        return []
    value = re.sub(r"\s+", " ", value)
    parts = re.split(r"\s+(?:and|&)\s+|;|\|", value)
    if len(parts) > 1:
        names = [_normalize_single_author(p) for p in parts if p.strip()]
        return [n for n in names if n]

    if "," in value:
        comma_parts = [p.strip() for p in value.split(",") if p.strip()]
        if len(comma_parts) >= 4 and len(comma_parts) % 2 == 0:
            names = []
            for i in range(0, len(comma_parts), 2):
                family = comma_parts[i]
                given = comma_parts[i + 1]
                names.append(_normalize_single_author(f"{family}, {given}"))
            return [n for n in names if n]

        names = [_normalize_single_author(p) for p in comma_parts]
        return [n for n in names if n]

    return [_normalize_single_author(value)]

def _author_list_from_names(names: list[str]) -> list[dict]:
    out = []
    for name in names:
        if not name:
            continue
        value = name.strip()
        if "," in value:
            parts = [p.strip() for p in value.split(",") if p.strip()]
            if len(parts) >= 2:
                family = parts[0]
                given = " ".join(parts[1:])
                out.append({"given": given, "family": family})
                continue
        tokens = value.split()
        if len(tokens) == 1:
            out.append({"family": tokens[0]})
        else:
            out.append({"given": " ".join(tokens[:-1]), "family": tokens[-1]})
    return out

def _datacite_doi_to_data(doi: str) -> dict:
    """Resolve a DOI using DataCite API and map to papis-like metadata."""
    doi = _normalize_doi(doi)
    if not doi:
        raise RuntimeError("DOI is empty")
    encoded = urllib.parse.quote(doi.strip(), safe="")
    url = f"https://api.datacite.org/dois/{encoded}"
    with urllib.request.urlopen(url, timeout=10) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    attrs = data.get("data", {}).get("attributes", {}) if isinstance(data, dict) else {}
    titles = attrs.get("titles") if isinstance(attrs.get("titles"), list) else []
    title = ""
    if titles:
        first = titles[0]
        title = first.get("title") if isinstance(first, dict) else str(first)

    creators = attrs.get("creators") if isinstance(attrs.get("creators"), list) else []
    author_list = []
    author_names = []
    for c in creators:
        if isinstance(c, dict):
            given = c.get("givenName") or ""
            family = c.get("familyName") or c.get("name") or ""
            author_list.append({"given": given, "family": family})
            name = " ".join([x for x in [given, family] if x]).strip()
            if name:
                author_names.append(name)
        elif isinstance(c, str):
            author_list.append({"family": c})
            author_names.append(c)

    publication_year = attrs.get("publicationYear")
    url_value = attrs.get("url") or ""

    return {
        "title": title or "",
        "author_list": author_list,
        "author": " and ".join(author_names) if author_names else "",
        "year": publication_year or "",
        "doi": doi,
        "url": url_value,
        "source": "datacite",
    }

_bootstrap_from_env()

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
        raw_meta_tags = meta.get("tags") or []
        meta["tags"] = [t for t in (_normalize_tag(x) for x in raw_meta_tags) if t]
    if isinstance(meta.get("contexts"), list):
        raw_meta_contexts = meta.get("contexts") or []
        meta["contexts"] = [c for c in (_normalize_tag(x) for x in raw_meta_contexts) if c]
    elif isinstance(meta.get("projects"), list):
        raw_meta_projects = meta.get("projects") or []
        meta["contexts"] = [c for c in (_normalize_tag(x) for x in raw_meta_projects) if c]

    if isinstance(meta.get("author"), str):
        names = _split_author_names(meta.get("author"))
        if names:
            meta["author"] = " and ".join(names)
            if not isinstance(meta.get("author_list"), list):
                meta["author_list"] = _author_list_from_names(names)

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


@app.post("/api/papers/{paper_id}/pdf/open")
def open_pdf(paper_id: str, library: Optional[str] = None):
    if _is_docker_mode():
        raise HTTPException(status_code=400, detail="Open PDF is disabled in Docker mode")
    try:
        _set_library_from_param(library)
        from papis.database import get_database

        db = get_database()
        doc = db.find_by_id(paper_id)
        if doc is None:
            raise HTTPException(status_code=404, detail="Paper not found")

        files = doc.get_files()
        pdf_path = _select_pdf_path(files)
        if pdf_path is None or not pdf_path.exists():
            raise HTTPException(status_code=404, detail="PDF not found")

        _open_with_default_app(pdf_path)
        return {"ok": True, "path": str(pdf_path)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to open PDF: {e}")


def _export_bibtex_for_docs(docs) -> str:
    from papis.exporters.bibtex import exporter
    cleaned = []
    for doc in docs:
        try:
            copy = doc.copy() if hasattr(doc, "copy") else doc
            if isinstance(copy, dict):
                copy.pop("abstract", None)
                copy.pop("abstract_latex", None)
            cleaned.append(copy)
        except Exception:
            cleaned.append(doc)
    return exporter(cleaned)


@app.get("/api/papers/{paper_id}/bibtex")
def get_paper_bibtex(paper_id: str, library: Optional[str] = None):
    if not papis_importable():
        raise HTTPException(status_code=500, detail="papis library not available in this environment")
    try:
        _set_library_from_param(library)
        from papis.database import get_database

        db = get_database()
        doc = db.find_by_id(paper_id)
        if doc is None:
            raise HTTPException(status_code=404, detail="Paper not found")

        bibtex = _export_bibtex_for_docs([doc])
        if not bibtex:
            raise HTTPException(status_code=500, detail="Failed to export BibTeX")
        return {"bibtex": bibtex}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to export BibTeX: {e}")


@app.post("/api/papers/bibtex")
def export_bibtex(body: dict = Body(...), library: Optional[str] = None):
    if not papis_importable():
        raise HTTPException(status_code=500, detail="papis library not available in this environment")
    ids = body.get("ids") if isinstance(body, dict) else None
    if not isinstance(ids, list) or not ids:
        raise HTTPException(status_code=400, detail="Missing 'ids'")
    try:
        _set_library_from_param(library)
        from papis.database import get_database

        db = get_database()
        docs = [db.find_by_id(str(pid)) for pid in ids]
        docs = [d for d in docs if d is not None]
        if not docs:
            raise HTTPException(status_code=404, detail="No papers found")

        bibtex = _export_bibtex_for_docs(docs)
        if not bibtex:
            raise HTTPException(status_code=500, detail="Failed to export BibTeX")
        return {"bibtex": bibtex}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to export BibTeX: {e}")


@app.post("/api/papers/{paper_id}/metadata")
def update_metadata(paper_id: str, body: dict = Body(...), library: Optional[str] = None):
    if not papis_importable():
        raise HTTPException(status_code=500, detail="papis library not available in this environment")
    if not isinstance(body, dict):
        raise HTTPException(status_code=400, detail="Invalid body")
    try:
        _set_library_from_param(library)
        from papis.database import get_database
        from papis.api import save_doc

        db = get_database()
        doc = db.find_by_id(paper_id)
        if doc is None:
            raise HTTPException(status_code=404, detail="Paper not found")

        for key in ["title", "author", "year", "doi"]:
            if key in body:
                value = body.get(key)
                if value is None or (isinstance(value, str) and value.strip() == ""):
                    if key in doc:
                        del doc[key]
                    if key == "author" and "author_list" in doc:
                        del doc["author_list"]
                else:
                    doc[key] = value
                    if key == "author" and "author_list" in doc:
                        del doc["author_list"]

        save_doc(doc)
        return {"ok": True, "paper": _doc_to_json(doc)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update metadata: {e}")

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
                doi = _normalize_doi(doi)
                if not doi:
                    items.append({"doi": doi, "ok": False, "error": "Missing DOI"})
                    continue
                try:
                    data = doi_to_data(doi)
                except Exception:
                    data = _datacite_doi_to_data(doi)
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


# Register SPA routes last so they don't shadow API endpoints.
if WEB_UI_DIST.exists():
    @app.get("/")
    def serve_root():
        return FileResponse(WEB_UI_DIST / "index.html")

    @app.get("/{path:path}")
    def serve_spa(path: str):
        if path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not found")
        dist_root = WEB_UI_DIST.resolve()
        file_path = (dist_root / path).resolve()
        # Only serve files that stay inside the build dir. This blocks
        # path traversal (for example "../../etc/passwd").
        if file_path.is_relative_to(dist_root) and file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(dist_root / "index.html")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, log_level="info")
