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

app = FastAPI()

SAMPLE_FILE = Path(__file__).parent / "sample_papers.json"

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


def get_papis_list():
    # Prefer importing papis as a library; fall back to subprocess if needed
    if papis_importable():
        try:
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
def papers():
    data = get_papis_list()
    if data is not None:
        return {"source": "papis", "papers": data}
    if SAMPLE_FILE.exists():
        return {"source": "sample", "papers": json.loads(SAMPLE_FILE.read_text())}
    return {"source": "empty", "papers": []}


@app.get("/api/papers/{paper_id}")
def paper_detail(paper_id: str):
    try:
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

@app.get("/api/tags")
def get_tags():
    """Return list of unique tags across the library."""
    if not papis_importable():
        raise HTTPException(status_code=500, detail="papis library not available in this environment")
    try:
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
def set_paper_tags(paper_id: str, body: dict = Body(...)):
    """Set tags for a paper. Body: {'tags': ['tag1', 'tag2']}"""
    if not papis_importable():
        raise HTTPException(status_code=500, detail="papis library not available in this environment")
    tags = body.get("tags") if isinstance(body, dict) else None
    if not isinstance(tags, list):
        raise HTTPException(status_code=400, detail="Missing or invalid 'tags' list")
    tags = [_normalize_tag(t) for t in tags if isinstance(t, str) and t.strip()]
    try:
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

@app.post("/api/papers/{paper_id}/notes")
def add_paper_note(paper_id: str, body: dict = Body(...)):
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
        from papis.database import get_database
        from papis.api import save_doc

        db = get_database()
        doc = db.find_by_id(paper_id)
        if doc is None:
            raise HTTPException(status_code=404, detail="Paper not found")
        notes = doc.get("user_notes") or []
        if not isinstance(notes, list):
            notes = []
        notes.append({"author": author.strip(), "text": text.strip()})
        doc["user_notes"] = notes
        save_doc(doc)
        return {"ok": True, "paper": _doc_to_json(doc)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to add note: {e}")

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

def _normalize_tag(tag: str) -> str:
    tag = tag.strip().lower()
    tag = re.sub(r"\s*\([^)]*\)", "", tag)
    tag = re.sub(r"\s+", " ", tag).strip()
    return tag

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
    file: Optional[UploadFile] = File(None)
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

    res = run_papis_add(str(file_path) if file_path else None, meta)
    if res.get("ok"):
        return {"source": "papis", "result": res}

    raise HTTPException(status_code=500, detail=f"Failed to add paper: {res}")


@app.get("/api/papers/{paper_id}/pdf")
def get_pdf(paper_id: str, variant: str = "clean"):
    try:
        from papis.database import get_database

        db = get_database()
        doc = db.find_by_id(paper_id)
        if doc is None:
            raise HTTPException(status_code=404, detail="Paper not found")

        files = doc.get_files()  # List[str] (absolute paths)

        pdf_path = next(
            (
                Path(f)
                for f in files
                if Path(f).suffix.lower() == ".pdf"
            ),
            None,
        )

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
def add_pdf_to_paper(paper_id: str, file: UploadFile = File(...)):
    """Attach a PDF to an existing paper."""
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Only PDFs allowed")

    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Invalid file extension")

    if not papis_importable():
        raise HTTPException(status_code=500, detail="papis library not available in this environment")

    try:
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

        addto_run(doc, [str(file_path)], link=False, git=False)

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
def delete_paper(paper_id: str):
    """Delete a paper from the papis library by papis id."""
    if not papis_importable():
        raise HTTPException(status_code=500, detail="papis library not available in this environment")

    try:
        from papis.database import get_database
        from papis.document import delete as delete_document, describe

        db = get_database()
        doc = db.find_by_id(paper_id)
        if doc is None:
            raise HTTPException(status_code=404, detail="Paper not found")

        # remove folder from filesystem
        delete_document(doc)
        # remove from papis database/cache
        db.delete(doc)

        return {"ok": True, "id": paper_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete paper: {e}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, log_level="info")
