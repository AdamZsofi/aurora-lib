#!/usr/bin/env bash
# Run the test suite in a container.
#
# The repo is mounted read-only and the container has no network, so the tests
# cannot change this machine or call external services. Arguments go to pytest:
#
#   scripts/test.sh               # everything except live tests
#   scripts/test.sh -x -k doi     # stop at the first failure, only "doi" tests
#
# Uses podman if available, else docker. Set CONTAINER_RUNTIME to choose.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE_NAME="aurora-lib-test"
RUNTIME="${CONTAINER_RUNTIME:-$(command -v podman || command -v docker || true)}"

if [[ -z "${RUNTIME}" ]]; then
  echo "Error: podman or docker is required to run the tests in a container." >&2
  exit 1
fi

echo "Building test image (cached after the first run)..." >&2
"${RUNTIME}" build -q -f "${ROOT_DIR}/packaging/docker/Dockerfile" --target test \
  -t "${IMAGE_NAME}" "${ROOT_DIR}" >/dev/null

TTY_ARGS=()
if [[ -t 1 ]]; then
  TTY_ARGS=(-t)
fi

exec "${RUNTIME}" run --rm "${TTY_ARGS[@]}" --network none \
  -v "${ROOT_DIR}:/app:ro" -w /app \
  "${IMAGE_NAME}" python -m pytest -p no:cacheprovider "$@"
