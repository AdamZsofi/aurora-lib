#!/usr/bin/env bash
set -euo pipefail

SYSTEMD_USER_DIR="${HOME}/.config/systemd/user"
SERVICE_FILE="${SYSTEMD_USER_DIR}/aurora-lib.service"
CONFIG_DIR="${XDG_CONFIG_HOME:-${HOME}/.config}/aurora-lib"
STATE_DIR="${XDG_STATE_HOME:-${HOME}/.local/state}/aurora-lib"

systemctl --user stop aurora-lib.service || true
systemctl --user disable aurora-lib.service || true
rm -f "${SERVICE_FILE}"
systemctl --user daemon-reload

printf "Aurora Lib service removed.\n"
printf "Your settings stay in %s and %s.\n" "${CONFIG_DIR}" "${STATE_DIR}"
printf "Delete those folders to remove them too.\n"
