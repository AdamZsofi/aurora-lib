# Aurora Lib

Local-first web UI for managing a [papis](https://github.com/papis/papis) library that lives inside an Obsidian vault. FastAPI backend + React/Vite frontend, all operating directly on files in the vault (no separate DB). Runs as a Linux systemd user service in normal use.

## Layout

- `service/main.py` — the entire FastAPI backend (~2000 lines, single file).
- `web-ui/src/` — React + TypeScript UI. `App.tsx` is the shell; components in `components/`, shared bits in `utils/`, `hooks/`, `types/`, API calls in `api/papers.ts`.
- `packaging/` — `install.sh`/`uninstall.sh` (systemd user service), `systemd/`, `docker/`, `bin/aurora-lib` launcher.
- `papis/` — **git submodule, upstream GPL-3.0 code. Not ours — don't edit it.** Run `git submodule update --init` after cloning.
- `scripts/`, `test/` — helper script, Insomnia request collection, and `test_pdf_link.py` (a standalone regression script, run with `.venv/bin/python test/test_pdf_link.py`). No test framework or CI yet.

## Dev

Backend and frontend run separately in dev; Vite proxies `/api` to the backend.

```bash
./scripts/ensure-venv.sh && source .venv/bin/activate
pip install -r service/requirements.txt        # installs papis via -e ../papis (submodule must be present)
uvicorn service.main:app --reload --port 8000  # backend MUST be on 8000 (Vite proxies there)

cd web-ui && npm install && npm run dev          # UI on http://localhost:5173
```

Use the VSCode "Full Stack: Debug" compound launch config for both at once. Production (systemd / Docker) instead serves the built UI directly from FastAPI on port 8973.

## Things to know

- **Port:** backend = 8000 in dev (Vite proxy + `__main__` + launch.json all assume this).
- **papis is used in-process**, not via CLI: `from papis.database import get_database`, `papis.commands.add`, `papis.api.save_doc`, etc. Aurora forces its own papis config dir via `PAPIS_CONFIG_DIR` → `service/.papis/`.
- **Config/state files** (`service/.aurora_config.json`, `service/.ui_state.json`, `service/.papis/`) are runtime, gitignored, and machine-specific. Don't commit changes to them.
- **Data model:** papers are papis docs (`info.yaml` + files) inside the vault's library dir. Aurora adds custom keys: `aurora_read_state`, `tags`, `contexts`, `user_notes`. Obsidian notes are Markdown with a generated YAML frontmatter + PDF link header that Aurora upserts (`_upsert_note_header`), preserving everything under `## Notes`.
- **Modes:** env vars `AURORA_SINGLE_LIBRARY`, `AURORA_DOCKER`, `AURORA_DEFAULT_VAULT` lock the instance to one vault (used by Docker). Docker disables server-side "Open PDF".
- Error handling leans heavily on `except Exception` swallowing — when debugging backend behavior, add logging rather than trusting that failures surface.

## Known issues / open work

The pre-open-sourcing checklist is done: config files untracked, GPL-3.0 LICENSE added, SPA path traversal fixed, README ports fixed. Open work: a real test suite and CI.
