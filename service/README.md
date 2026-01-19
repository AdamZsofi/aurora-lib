Service (backend)
=================

This is a minimal FastAPI service that exposes a tiny JSON API for the web UI.

Quick start (recommended in a virtualenv):

```bash
./scripts/ensure-venv.sh
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Notes:
- The helper script uses your default system Python (python3 or python) and will recreate the venv if the default version changes.
- If you use pyenv, the included .python-version is set to "system" for this repo.
- Backend dependencies include a local editable install of papis from ../papis via requirements.txt.
