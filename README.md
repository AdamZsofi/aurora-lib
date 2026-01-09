ref-project — Papis-backed Web UI (scaffold)

This repository contains an initial scaffold for a web UI built on top of papis.

Structure added by this scaffold:

- `service/` — minimal FastAPI backend that exposes a small JSON API and attempts to call `papis` if available.
- `web-ui/` — minimal React + Vite + TypeScript frontend scaffold.

See `service/README.md` and `web-ui/README.md` for local run instructions.

## Quickstart

### Backend

```
python -m venv .venv
source .venv/bin/activate
pip install -r service/requirements.txt
```

```
source .venv/bin/activate
uvicorn main:app --reload --port 8000 --app-dir service
```

#### Testing

```
http://127.0.0.1:8000/api/health
http://127.0.0.1:8000/api/papers
http://127.0.0.1:8000/api/resolve?doi=10.1145/3368089.3409743
```

### Frontend

```
# use the repo-local .nvmrc value and install if necessary
cd ref-project
nvm install
nvm use

# start frontend dev server
cd web-ui
npm run dev
```