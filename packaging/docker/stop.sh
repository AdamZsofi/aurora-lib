#!/usr/bin/env bash
set -euo pipefail

CONTAINER_NAME="aurora-lib"

docker stop "${CONTAINER_NAME}" >/dev/null 2>&1 || true
docker rm "${CONTAINER_NAME}" >/dev/null 2>&1 || true

printf "Aurora Lib stopped.\n"
