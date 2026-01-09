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
