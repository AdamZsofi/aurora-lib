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

*(or, after venv is set up, launch.json is available to start from vs code)*

## Architecture

Although I kept the web UI, it's important to emphasize that the project is developed to be run locally and to be accessed on localhost.

A local FastAPI backend (Uvicorn) exposes HTTP endpoints to manage Papis libraries, fetch metadata (Crossref/OpenAlex), and serve PDFs. A React Vite frontend calls those endpoints from the browser to list, add, and manage papers, tags, notes, and PDFs. Data lives in local Papis libraries (git-backed), with optional sample JSON fallback.

### Main libraries

FastAPI: HTTP API server exposing paper/library operations.
Uvicorn: ASGI server running the FastAPI app locally.
Papis: Core library/database for managing local reference libraries.
React: UI framework for the web frontend.
Vite: Frontend dev server and build tool.
TypeScript: Type-safe frontend codebase.
python-multipart: Handles file uploads (PDFs/BibTeX) in the API.

### Data Fetching

Mostly we just fetch crossref. But tags are from OpenAlex, which are fairly experimental, so keep an eye on them (you can remove and add tags manually as well).
