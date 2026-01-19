ref-project — Papis-backed Web UI (scaffold)

This repository contains an initial scaffold for a web UI built on top of papis.

Structure added by this scaffold:

- `service/` — minimal FastAPI backend that exposes a small JSON API and attempts to call `papis` if available.
- `web-ui/` — minimal React + Vite + TypeScript frontend scaffold.

See `service/README.md` and `web-ui/README.md` for local run instructions.

## Quickstart

### Backend

```
./scripts/ensure-venv.sh
source .venv/bin/activate
pip install -r service/requirements.txt
```

Notes:
- The helper script uses your default system Python (python3 or python) and will recreate the venv if the default version changes.
- If you use pyenv, the included .python-version is set to "system" for this repo.

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