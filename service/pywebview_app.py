import base64
import io
import json
import os
from pathlib import Path
from typing import Optional

import webview
from fastapi import HTTPException

import main as api_module


class UploadFileMock:
    def __init__(self, filename: str, content_type: str, data: bytes):
        self.filename = filename
        self.content_type = content_type
        self.file = io.BytesIO(data)


def _call(fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs)
    except HTTPException as exc:
        raise RuntimeError(str(exc.detail))


def _ensure_papis():
    if not api_module.papis_importable():
        raise RuntimeError("papis library not available in this environment")


class Api:
    def health(self):
        return _call(api_module.health)

    def get_lib(self):
        return _call(api_module.get_current_library)

    def get_libs(self):
        return _call(api_module.get_libraries)

    def set_lib(self, library: str):
        return _call(api_module.set_library, {"library": library})

    def get_papers(self, library: Optional[str] = None):
        return _call(api_module.papers, library)

    def get_paper(self, paper_id: str, library: Optional[str] = None):
        return _call(api_module.paper_detail, paper_id, library)

    def resolve(self, doi: str):
        return _call(api_module.resolve, doi)

    def resolve_bib(self, file_name: str, file_base64: str):
        data = base64.b64decode(file_base64)
        mock = UploadFileMock(file_name or "input.bib", "text/plain", data)
        return _call(api_module.resolve_bib, mock)

    def resolve_dois(self, dois):
        return _call(api_module.resolve_dois, {"dois": dois})

    def add_paper(
        self,
        metadata,
        file_base64: Optional[str] = None,
        file_name: Optional[str] = None,
        library: Optional[str] = None,
    ):
        meta_json = json.dumps(metadata or {})
        upload = None
        if file_base64:
            data = base64.b64decode(file_base64)
            upload = UploadFileMock(file_name or "paper.pdf", "application/pdf", data)
        return _call(api_module.add_paper, meta_json, upload, library)

    def delete_paper(self, paper_id: str, library: Optional[str] = None):
        return _call(api_module.delete_paper, paper_id, library)

    def get_tags(self, library: Optional[str] = None):
        return _call(api_module.get_tags, library)

    def set_paper_tags(self, paper_id: str, tags, library: Optional[str] = None):
        return _call(api_module.set_paper_tags, paper_id, {"tags": tags}, library)

    def add_paper_note(
        self,
        paper_id: str,
        author: str,
        text: str,
        library: Optional[str] = None,
    ):
        return _call(api_module.add_paper_note, paper_id, {"author": author, "text": text}, library)

    def get_note_authors(self, library: Optional[str] = None):
        return _call(api_module.get_note_authors, library)

    def add_pdf(
        self,
        paper_id: str,
        file_base64: str,
        file_name: str,
        library: Optional[str] = None,
    ):
        data = base64.b64decode(file_base64)
        upload = UploadFileMock(file_name or "paper.pdf", "application/pdf", data)
        return _call(api_module.add_pdf_to_paper, paper_id, upload, library)

    def get_pdf(self, paper_id: str, library: Optional[str] = None):
        _ensure_papis()
        api_module._set_library_from_param(library)
        from papis.database import get_database

        db = get_database()
        doc = db.find_by_id(paper_id)
        if doc is None:
            raise RuntimeError("Paper not found")

        files = doc.get_files()
        pdf_path = next(
            (Path(f) for f in files if Path(f).suffix.lower() == ".pdf"),
            None,
        )
        if pdf_path is None or not pdf_path.exists():
            raise RuntimeError("PDF not found")

        data = pdf_path.read_bytes()
        return {"mime": "application/pdf", "data": base64.b64encode(data).decode("utf-8")}


def _resolve_ui_url() -> str:
    url = os.environ.get("AURORA_UI_URL")
    if url:
        return url

    dist = os.environ.get("AURORA_UI_DIST")
    if dist:
        return Path(dist).expanduser().resolve().as_uri()

    root = Path(__file__).resolve().parents[1]
    index = root / "web-ui" / "dist" / "index.html"
    return index.as_uri()


def main():
    ui_url = _resolve_ui_url()
    api = Api()
    webview.create_window("Aurora Lib", ui_url, js_api=api, width=1200, height=800)
    webview.start()


if __name__ == "__main__":
    main()
