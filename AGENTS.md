# Aurora Lib

Local-first web UI for managing a [papis](https://github.com/papis/papis) library that lives inside an Obsidian vault. FastAPI backend + React/Vite frontend, all operating directly on files in the vault (no separate DB). Runs as a Linux systemd user service in normal use.

## Layout

- `service/main.py` — the entire FastAPI backend (~2000 lines, single file).
- `web-ui/src/` — React + TypeScript UI. `App.tsx` is the shell; components in `components/`, shared bits in `utils/`, `hooks/`, `types/`, API calls in `api/papers.ts`.
- `packaging/` — `install.sh`/`uninstall.sh` (systemd user service), `systemd/`, `docker/`, `bin/aurora-lib` launcher.
- `papis/` — **git submodule, upstream GPL-3.0 code. Not ours — don't edit it.** Run `git submodule update --init` after cloning.
- `scripts/` — `ensure-venv.sh`, and `test.sh` (runs the tests in a container).
- `test/` — pytest suite (see Testing). `insomnia-requests.yaml` is a manual request collection.

## Dev

Backend and frontend run separately in dev; Vite proxies `/api` to the backend.

```bash
./scripts/ensure-venv.sh && source .venv/bin/activate
pip install -r service/requirements.txt        # installs papis via -e ../papis (submodule must be present)
uvicorn service.main:app --reload --port 8000  # backend MUST be on 8000 (Vite proxies there)

cd web-ui && npm install && npm run dev          # UI on http://localhost:5173
```

Use the VSCode "Full Stack: Debug" compound launch config for both at once. Production (systemd / Docker) instead serves the built UI directly from FastAPI on port 8973.

Supported versions: exactly one of each — Python 3.14 and Node 24 (`.nvmrc`, Dockerfile). Don't add compatibility code for older versions.

## Testing

```bash
scripts/test.sh                                  # default: all tests in a container (podman or docker), repo read-only, no network
.venv/bin/python -m pytest                       # on the host, e.g. to debug (pip install -r requirements-dev.txt first)
.venv/bin/python -m pytest -m "not integration"  # unit tests only
```

- `test/conftest.py` points `HOME` and all XDG folders at a temporary sandbox before it imports `main`, and aborts the run if any config or state path escapes it. Never weaken this: the installed service uses the same code paths on the real vault.
- Network access is blocked. Tests marked `live` (excluded by default) may call Crossref, DataCite and OpenAlex.
- App launches (Obsidian, `xdg-open`, browser) are recorded by the `launched` fixture instead of executed.
- API tests use the `client` fixture: fresh config, state and papis per test. papis keeps in-process global state (`papis.config.CURRENT_LIBRARY`, the `papis.database` cache), and the `aurora` fixture resets it.
- The test image is the `test` stage of `packaging/docker/Dockerfile`, so tests run on the same Python and dependencies as the Docker install.

## Things to know

- **Port:** backend = 8000 in dev (Vite proxy + `__main__` + launch.json all assume this).
- **papis is used in-process**, not via CLI: `from papis.database import get_database`, `papis.commands.add`, `papis.api.save_doc`, etc. Aurora forces its own papis config dir via `PAPIS_CONFIG_DIR` → `~/.local/state/aurora-lib/papis/`.
- **Config and state live outside the repo** (resolved with `platformdirs`): `~/.config/aurora-lib/config.json` holds the active vault and library, and `~/.local/state/aurora-lib/` holds `ui-state.json` and `papis/config`. The vault holds only portable settings, in `.aurora-lib.json`. The installed service still runs its code from the repo checkout.
- **Data model:** papers are papis docs (`info.yaml` + files) inside the vault's library dir. Aurora adds custom keys: `aurora_read_state`, `tags`, `contexts`, `user_notes`. Obsidian notes are Markdown with a generated YAML frontmatter + PDF link header that Aurora upserts (`_upsert_note_header`), preserving everything under `## Notes`.
- **Setup modes:** "Create" works on any folder, including an existing Obsidian vault. It adds the library folder, `paper-notes/` and `.aurora-lib.json`, and leaves other files alone. "Import" reconnects a vault that already has `.aurora-lib.json`, for example on a second machine.
- **Modes:** env vars `AURORA_SINGLE_LIBRARY`, `AURORA_DOCKER`, `AURORA_DEFAULT_VAULT` lock the instance to one vault (used by Docker). Docker disables server-side "Open PDF".
- Error handling leans heavily on `except Exception` swallowing — when debugging backend behavior, add logging rather than trusting that failures surface.

## Known issues / open work

The pre-open-sourcing checklist is done: config files untracked, GPL-3.0 LICENSE added, SPA path traversal fixed, README ports fixed.

Open work, roughly in order:

- Config move, stage B: store only the vault path in `config.json`, derive the rest from the vault's `.aurora-lib.json` at startup, regenerate the papis config on each start, and merge the duplicated setup logic in `setup_aurora` and `_bootstrap_from_env`. After that, `uninstall.sh` can delete the state folder.
- More tests: note handling, DOI and author parsing, an API lifecycle test, security regressions. Then CI, then a frontend type-check and Vitest.
- An install that works without the repo checkout, for example a Python package with the built UI inside.
