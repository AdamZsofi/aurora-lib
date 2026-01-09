Service (backend)
=================

This is a minimal FastAPI service that exposes a tiny JSON API for the web UI.

Quick start (recommended in a virtualenv):

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

API endpoints:
- `GET /api/health` — returns `{status: "ok"}`
- `GET /api/papers` — attempts to run `papis list --json`; falls back to sample data if papis not present.
- `GET /api/papers/{paper_id}/pdf?variant=clean|annotated` — serves a matching PDF from `context-info/example-papers` if present.

Note: This is a scaffold. The service tries to call `papis` if it exists in the PATH, but does not require it to run.
