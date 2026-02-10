# Aurora Lib (systemd user service package)

This packaging bundle installs Aurora Lib as a user-level systemd service (no Docker).
It builds the web UI and serves it directly from FastAPI.

## Install

1. Run the installer from the repo root:

   ./packaging/install.sh

2. Open:

   http://localhost:5173/

## Uninstall

./packaging/uninstall.sh

## Customize

Edit the environment file:

~/.config/aurora-lib/aurora-lib.env

You can change host/port/log level:

- AURORA_HOST
- AURORA_PORT
- AURORA_LOG_LEVEL

## Docker (single image)

Build and run a single container that serves the UI on localhost:5173.

Start (requires a vault path on the host):

./packaging/docker/start.sh /absolute/path/to/vault

Stop:

./packaging/docker/stop.sh

Notes:

- The mounted path is treated as the Obsidian vault (or to-be-created vault).
- Only one vault can be active when using the Docker setup (single mount at /data).
