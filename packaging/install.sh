#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SYSTEMD_USER_DIR="${HOME}/.config/systemd/user"
AURORA_CONF_DIR="${HOME}/.config/aurora-lib"

mkdir -p "${SYSTEMD_USER_DIR}"
mkdir -p "${AURORA_CONF_DIR}"

if [[ ! -f "${AURORA_CONF_DIR}/aurora-lib.env" ]]; then
  cp "${ROOT_DIR}/packaging/systemd/aurora-lib.env" "${AURORA_CONF_DIR}/aurora-lib.env"
fi

if [[ ! -x "${ROOT_DIR}/packaging/bin/aurora-lib" ]]; then
  chmod +x "${ROOT_DIR}/packaging/bin/aurora-lib"
fi

if [[ ! -d "${ROOT_DIR}/.venv" ]]; then
  python3 -m venv "${ROOT_DIR}/.venv"
fi

"${ROOT_DIR}/.venv/bin/pip" install --upgrade pip
"${ROOT_DIR}/.venv/bin/pip" install -r "${ROOT_DIR}/service/requirements.txt"

pushd "${ROOT_DIR}/web-ui" >/dev/null
npm install
npm run build
popd >/dev/null

SERVICE_FILE="${SYSTEMD_USER_DIR}/aurora-lib.service"
cat "${ROOT_DIR}/packaging/systemd/aurora-lib.service.template" \
  | sed "s|__AURORA_ROOT__|${ROOT_DIR}|g" \
  > "${SERVICE_FILE}"

AUTOSTART_DIR="${HOME}/.config/autostart"
AUTOSTART_FILE="${AUTOSTART_DIR}/aurora-lib-env.desktop"
mkdir -p "${AUTOSTART_DIR}"
if [[ ! -f "${AUTOSTART_FILE}" ]]; then
  cat > "${AUTOSTART_FILE}" <<'EOF'
[Desktop Entry]
Type=Application
Name=Aurora Lib Env Import
Exec=systemctl --user import-environment DISPLAY WAYLAND_DISPLAY XDG_RUNTIME_DIR DBUS_SESSION_BUS_ADDRESS PATH && systemctl --user restart aurora-lib
X-GNOME-Autostart-enabled=true
NoDisplay=true
EOF
fi

systemctl --user import-environment DISPLAY WAYLAND_DISPLAY XDG_RUNTIME_DIR DBUS_SESSION_BUS_ADDRESS PATH
systemctl --user daemon-reload
systemctl --user enable aurora-lib.service
systemctl --user restart aurora-lib.service

printf "\nAurora Lib installed and started as a user service.\nOpen: http://localhost:5173\n"
printf "If you want it to run at boot without login, enable lingering:\n  loginctl enable-linger $USER\n"
