"""Regression tests for PDF selection in _note_pdf_link.

No framework: run it directly, it exits non-zero on failure.

    .venv/bin/python test/test_pdf_link.py

Covers two bugs fixed in 9934536. papis serves documents from a cache that is
not invalidated when a document folder disappears, so `files` can name PDFs
that are not on disk; the note builder used to link them anyway, and used to
rank the annotated/clean preference above whether the file existed at all.
"""

import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "service"))
import main  # noqa: E402

tmp = Path(tempfile.mkdtemp())
vault = tmp / "vault"
library = vault / "paper-lib"
folder = library / "abc123"
folder.mkdir(parents=True)

main._load_aurora_config = lambda: {
    "vault_path": str(vault),
    "library_path": str(library),
}

DOC = {"id": "abc123", "folder_name": "abc123",
       "files": ["p-clean.pdf", "p-annotated.pdf"]}

failures = 0


def place(*names: str) -> None:
    for existing in folder.glob("*.pdf"):
        existing.unlink()
    for name in names:
        (folder / name).write_bytes(b"%PDF-1.4\n")


def check(label: str, got, want) -> None:
    global failures
    if got == want:
        print(f"  PASS  {label}")
    else:
        failures += 1
        print(f"  FAIL  {label}\n          got={got!r}\n         want={want!r}")


def chosen():
    result = main._note_pdf_link(dict(DOC))
    return result[1].split("/")[-1] if result else None


place("p-clean.pdf", "p-annotated.pdf")
check("both present -> prefers annotated", chosen(), "p-annotated.pdf")

place("p-clean.pdf")
check("annotated missing -> falls back to clean", chosen(), "p-clean.pdf")

place()
check("none on disk -> no link at all", main._note_pdf_link(dict(DOC)), None)

place("p-clean.pdf", "p-annotated.pdf")
check("outside a git repo -> no GitHub link",
      main._github_pdf_url(folder / "p-annotated.pdf"), None)

print(f"\n{failures} failure(s)")
sys.exit(1 if failures else 0)
