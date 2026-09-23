"""Regression tests for PDF selection in _note_pdf_link.

Covers two bugs fixed in 9934536. papis serves documents from a cache that is
not invalidated when a document folder disappears, so `files` can name PDFs
that are not on disk; the note builder used to link them anyway, and used to
rank the annotated/clean preference above whether the file existed at all.
"""

import pytest

import main

DOC = {"id": "abc123", "folder_name": "abc123",
       "files": ["p-clean.pdf", "p-annotated.pdf"]}


@pytest.fixture
def folder(tmp_path, monkeypatch):
    """A paper folder inside a temporary vault, with Aurora pointed at it."""
    vault = tmp_path / "vault"
    library = vault / "paper-lib"
    folder = library / "abc123"
    folder.mkdir(parents=True)
    monkeypatch.setattr(main, "_load_aurora_config", lambda: {
        "vault_path": str(vault),
        "library_path": str(library),
    })
    return folder


def place(folder, *names):
    for name in names:
        (folder / name).write_bytes(b"%PDF-1.4\n")


def linked_pdf_name():
    result = main._note_pdf_link(dict(DOC))
    if result is None:
        return None
    return result[1].rsplit("/", 1)[-1]


@pytest.mark.parametrize("on_disk, expected", [
    (["p-clean.pdf", "p-annotated.pdf"], "p-annotated.pdf"),
    (["p-clean.pdf"], "p-clean.pdf"),
    ([], None),
], ids=["both present prefers annotated",
        "annotated missing falls back to clean",
        "none on disk gives no link"])
def test_note_links_best_pdf_on_disk(folder, on_disk, expected):
    place(folder, *on_disk)
    assert linked_pdf_name() == expected


def test_no_github_link_outside_a_git_repo(folder):
    place(folder, "p-clean.pdf", "p-annotated.pdf")
    assert main._github_pdf_url(folder / "p-annotated.pdf") is None
