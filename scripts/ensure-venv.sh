#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV_DIR="$ROOT_DIR/.venv"

pick_py() {
  if command -v python3 >/dev/null 2>&1; then
    echo "python3"
    return 0
  fi

  if command -v python >/dev/null 2>&1; then
    echo "python"
    return 0
  fi

  return 1
}

PY_BIN=""
if PY_BIN="$(pick_py)"; then
  :
else
  echo "Error: Python is required. Install a recent Python (preferably python3) and ensure it is on PATH." >&2
  exit 1
fi

PY_VER="$($PY_BIN -c 'import sys; print("%d.%d" % sys.version_info[:2])')"

if [[ -d "$VENV_DIR" ]]; then
  if [[ -f "$VENV_DIR/pyvenv.cfg" ]]; then
    VENV_VER="$(grep -E '^version = ' "$VENV_DIR/pyvenv.cfg" | awk '{print $3}' | awk -F. '{print $1"."$2}')"
  else
    VENV_VER=""
  fi

  if [[ "$VENV_VER" == "$PY_VER" ]]; then
    echo "Virtual environment already exists at $VENV_DIR (Python $VENV_VER)"
    exit 0
  fi

  echo "Recreating venv at $VENV_DIR to match Python $PY_VER (was ${VENV_VER:-unknown})"
  rm -rf "$VENV_DIR"
fi

"$PY_BIN" -m venv "$VENV_DIR"
echo "Created venv at $VENV_DIR using $PY_BIN (Python $PY_VER)"
echo "Activate with: source $VENV_DIR/bin/activate"