#!/usr/bin/env bash
set -euo pipefail

SYSTEMD_USER_DIR="${HOME}/.config/systemd/user"
SERVICE_FILE="${SYSTEMD_USER_DIR}/aurora-lib.service"

systemctl --user stop aurora-lib.service || true
systemctl --user disable aurora-lib.service || true
rm -f "${SERVICE_FILE}"
systemctl --user daemon-reload

printf "Aurora Lib service removed.\n"
