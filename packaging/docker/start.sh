#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
IMAGE_NAME="aurora-lib:latest"
CONTAINER_NAME="aurora-lib"
HOST_LIBRARY_PATH="${1:-}"

if [[ -z "${HOST_LIBRARY_PATH}" ]]; then
  printf "Usage: %s /absolute/path/to/vault\n" "${0}" >&2
  exit 1
fi

cd "${ROOT_DIR}"

docker build -f packaging/docker/Dockerfile -t "${IMAGE_NAME}" .

docker rm -f "${CONTAINER_NAME}" >/dev/null 2>&1 || true

DOCKER_RUN_ARGS=(
  -d
  --name "${CONTAINER_NAME}"
  -p 5173:5173
)

DOCKER_RUN_ARGS+=(
  -v "${HOST_LIBRARY_PATH}:/data"
  -e "AURORA_DEFAULT_VAULT=/data"
  -e "AURORA_SINGLE_LIBRARY=1"
)

docker run "${DOCKER_RUN_ARGS[@]}" "${IMAGE_NAME}"

printf "Aurora Lib started.\nOpen: http://localhost:5173\n"
printf "Mounted vault path at /data inside the container.\n"
