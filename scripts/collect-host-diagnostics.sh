#!/usr/bin/env bash
set -u

UUID="${UUID:-uupd-indicator@projectbluefin.io}"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
EXT_SRC="$REPO_ROOT/$UUID"
EXT_DST="$HOME/.local/share/gnome-shell/extensions/$UUID"
REPORT="${REPORT:-$REPO_ROOT/host-diagnostics-$(date +%Y%m%d-%H%M%S).md}"
SINCE="${SINCE:-10 minutes ago}"

write() {
  printf '%s\n' "$*" >> "$REPORT"
}

section() {
  write ""
  write "## $*"
  write ""
}

run() {
  write ""
  write '```console'
  write "\$ $*"
  "$@" >> "$REPORT" 2>&1
  local status=$?
  write "exit=$status"
  write '```'
  return 0
}

run_shell() {
  write ""
  write '```console'
  write "\$ $*"
  bash -lc "$*" >> "$REPORT" 2>&1
  local status=$?
  write "exit=$status"
  write '```'
  return 0
}

: > "$REPORT"

write "# uupd-indicator host diagnostics"
write ""
write "- Date: $(date --iso-8601=seconds)"
write "- UUID: \`$UUID\`"
write "- Repository: \`$REPO_ROOT\`"
write "- Extension source: \`$EXT_SRC\`"
write "- Installed extension path: \`$EXT_DST\`"
write "- Journal window: \`$SINCE\`"

section "Environment"
run uname -a
run_shell 'cat /etc/os-release 2>/dev/null || true'
run_shell 'echo "XDG_SESSION_TYPE=${XDG_SESSION_TYPE:-}"'
run_shell 'echo "XDG_CURRENT_DESKTOP=${XDG_CURRENT_DESKTOP:-}"'
run_shell 'echo "DESKTOP_SESSION=${DESKTOP_SESSION:-}"'
run_shell 'gnome-shell --version 2>/dev/null || true'
run_shell 'gjs --version 2>/dev/null || true'
run_shell 'gnome-extensions version 2>/dev/null || true'

section "Repository files"
run_shell "test -d '$EXT_SRC' && find '$EXT_SRC' -maxdepth 1 -type f -printf '%f\n' | sort || true"
run_shell "python3 -m json.tool '$EXT_SRC/metadata.json' 2>/dev/null || cat '$EXT_SRC/metadata.json' 2>/dev/null || true"
run_shell "grep -R \"Gio.DBus\\.system\\|Gio.DBus\\.session\\|console\\.log\\|GETTEXT_DOMAIN\\|DBUS_MANAGER_INTERFACE\\|_iconToggle\" -n '$EXT_SRC' 2>/dev/null || true"

section "Installation state"
run_shell "ls -la '$EXT_DST' 2>/dev/null || true"
run_shell "readlink -f '$EXT_DST' 2>/dev/null || true"
run_shell "gnome-extensions list 2>/dev/null | grep -F '$UUID' || true"
run_shell "gnome-extensions info '$UUID' 2>&1 || true"

section "Enable/disable smoke test"
write "This section toggles only the GNOME extension state. It does not start uupd.service."
run_shell "gnome-extensions disable '$UUID' 2>&1 || true"
sleep 1
run_shell "gnome-extensions enable '$UUID' 2>&1 || true"
sleep 2
run_shell "gnome-extensions info '$UUID' 2>&1 || true"

section "uupd systemd state: user units"
run_shell "systemctl --user status uupd.timer uupd.service --no-pager 2>&1 || true"
run_shell "systemctl --user show uupd.timer -p LoadState -p UnitFileState -p ActiveState -p SubState -p FragmentPath 2>&1 || true"
run_shell "systemctl --user show uupd.service -p LoadState -p UnitFileState -p ActiveState -p SubState -p FragmentPath 2>&1 || true"

section "uupd systemd state: system units"
run_shell "systemctl status uupd.timer uupd.service --no-pager 2>&1 || true"
run_shell "systemctl show uupd.timer -p LoadState -p UnitFileState -p ActiveState -p SubState -p FragmentPath 2>&1 || true"
run_shell "systemctl show uupd.service -p LoadState -p UnitFileState -p ActiveState -p SubState -p FragmentPath 2>&1 || true"

section "D-Bus properties: user bus"
run_shell "busctl --user get-property org.freedesktop.systemd1 /org/freedesktop/systemd1/unit/uupd_2etimer org.freedesktop.systemd1.Unit UnitFileState 2>&1 || true"
run_shell "busctl --user get-property org.freedesktop.systemd1 /org/freedesktop/systemd1/unit/uupd_2eservice org.freedesktop.systemd1.Unit ActiveState 2>&1 || true"

section "D-Bus properties: system bus"
run_shell "busctl --system get-property org.freedesktop.systemd1 /org/freedesktop/systemd1/unit/uupd_2etimer org.freedesktop.systemd1.Unit UnitFileState 2>&1 || true"
run_shell "busctl --system get-property org.freedesktop.systemd1 /org/freedesktop/systemd1/unit/uupd_2eservice org.freedesktop.systemd1.Unit ActiveState 2>&1 || true"

section "GNOME Shell journal"
run_shell "journalctl --since '$SINCE' -o short-precise /usr/bin/gnome-shell 2>/dev/null | grep -Ei 'uupd|$UUID|JS ERROR|extension' || true"

section "Summary hints"
write "- If \`gnome-extensions info\` reports OUT_OF_DATE, metadata shell-version is still wrong."
write "- If only \`busctl --user\` works, the extension should use \`Gio.DBus.session\`."
write "- If only \`busctl --system\` works, the extension should use \`Gio.DBus.system\`."
write "- If both D-Bus checks fail, the unit path/name is probably wrong or uupd is not installed."
write "- This script does not start \`uupd.service\` and does not prove the visual indicator is visible during a real update."

printf 'Report written to: %s\n' "$REPORT"
