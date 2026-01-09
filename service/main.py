from fastapi import FastAPI, HTTPException, Response
from fastapi import Form, File, UploadFile
import json
from pathlib import Path
from typing import Optional
import shutil
import tempfile
import os

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
        data = doi_to_data(doi)
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

def run_papis_add(file_path: str, metadata: dict) -> dict:
    try:
        from papis.commands.add import run as papis_add_run
        # papis.commands.add.run signature: run(paths: list[str], data: dict|None = None, ...)
        papis_add_run([str(file_path)], data=metadata, batch=True, confirm=False, edit=False)
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


@app.post("/api/papers")
def add_paper(
    metadata: str = Form(...),
    file: UploadFile = File(...)
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

    if file is None:
        raise HTTPException(status_code=400, detail="file is required")

    tmpdir = Path(tempfile.mkdtemp(prefix="papis_add_"))
    file_path = tmpdir / ( (meta.get("doi") or "paper") + ".pdf")
    with open(file_path, "wb") as f:
        f.write(file)

    if not papis_importable():
        raise HTTPException(status_code=500, detail="papis library not available in this environment")

    res = run_papis_add(str(file_path), meta)
    if res.get("ok"):
        return {"source": "papis", "result": res}

    raise HTTPException(status_code=500, detail=f"Failed to add paper: {res}")


@app.get("/api/papers/{paper_id}/pdf")
def get_pdf(paper_id: str, variant: str = "clean"):
    # Try to find a matching PDF in context-info/example-papers
    repo_root = Path(__file__).parent.parent
    example_dir = repo_root / "context-info" / "example-papers"
    if not example_dir.exists():
        raise HTTPException(status_code=404, detail="example-papers directory not found")
    candidates = list(example_dir.glob(f"*{paper_id}*.pdf"))
    if not candidates:
        raise HTTPException(status_code=404, detail="PDF not found")
    path = candidates[0]
    return Response(path.read_bytes(), media_type="application/pdf")


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
