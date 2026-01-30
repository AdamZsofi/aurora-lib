#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
IMAGE_NAME="aurora-lib:latest"
CONTAINER_NAME="aurora-lib"

cd "${ROOT_DIR}"

docker build -f packaging/docker/Dockerfile -t "${IMAGE_NAME}" .

docker rm -f "${CONTAINER_NAME}" >/dev/null 2>&1 || true

docker run -d \
  --name "${CONTAINER_NAME}" \
  -p 5173:5173 \
  "${IMAGE_NAME}"

printf "Aurora Lib started.\nOpen: http://localhost:5173\n"
