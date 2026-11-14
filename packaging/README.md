# Aurora Lib (systemd user service package)

This packaging bundle installs Aurora Lib as a user-level systemd service (no Docker).
It builds the web UI and serves it directly from FastAPI.

The service runs from this repo checkout. Keep the checkout in place after you install: moving or deleting it stops the service. A standalone release is not available yet.

## Install

1. Run the installer. It fetches the papis submodule if it is missing:

   ./packaging/install.sh

2. Open:

   http://localhost:8973/

## Uninstall

./packaging/uninstall.sh

## Customize

Edit the environment file:

~/.config/aurora-lib/aurora-lib.env

You can change host/port/log level:

- AURORA_HOST
- AURORA_PORT
- AURORA_LOG_LEVEL

## Where Aurora keeps its files

- `~/.config/aurora-lib/config.json` — the active vault and library.
- `~/.local/state/aurora-lib/` — UI state and the papis config that Aurora generates.

The vault itself holds only its portable settings, in `.aurora-lib.json`.

## Notes about user services

- The service runs as your user inside your login session. This allows GUI actions like opening PDFs.
- The installer also adds a GUI autostart entry (~/.config/autostart/aurora-lib-env.desktop) to import environment variables when you log into a desktop session.
- The service starts when you log in. If you want it to run at boot without logging in, enable lingering:

   loginctl enable-linger $USER

## Docker (single image)

Build and run a single container that serves the UI on localhost:8973.

Start (requires a vault path on the host):

./packaging/docker/start.sh /absolute/path/to/vault

Stop:

./packaging/docker/stop.sh

Persist across reboots (untested):

docker update --restart unless-stopped aurora-lib

Notes:

- The mounted path is treated as the Obsidian vault (or to-be-created vault).
- Only one vault can be active when using the Docker setup (single mount at /data).
- "Open PDF" is disabled in Docker mode (server-side desktop opening is not available in containers).
- The restart policy command above is currently untested.
