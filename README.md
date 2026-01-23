ref-project — Papis-backed Web UI (scaffold)

This repository contains an initial scaffold for a web UI built on top of papis.

Structure added by this scaffold:

- `service/` — minimal FastAPI backend that exposes a small JSON API and attempts to call `papis` if available.
- `web-ui/` — minimal React + Vite + TypeScript frontend scaffold.

See `service/README.md` and `web-ui/README.md` for local run instructions.

## Quickstart

```
./scripts/ensure-venv.sh
source .venv/bin/activate
pip install -r service/requirements.txt
```

```
source .venv/bin/activate
uvicorn main:app --reload --port 8000 --app-dir service
```

## Architecture

A local FastAPI backend (Uvicorn) exposes HTTP endpoints to manage Papis libraries, fetch metadata (Crossref/OpenAlex), and serve PDFs. A React Vite frontend calls those endpoints from the browser to list, add, and manage papers, tags, notes, and PDFs. Data lives in local Papis libraries (git-backed), with optional sample JSON fallback.

### Main libraries

FastAPI: HTTP API server exposing paper/library operations.
Uvicorn: ASGI server running the FastAPI app locally.
Papis: Core library/database for managing local reference libraries.
React: UI framework for the web frontend.
Vite: Frontend dev server and build tool.
TypeScript: Type-safe frontend codebase.
python-multipart: Handles file uploads (PDFs/BibTeX) in the API.
