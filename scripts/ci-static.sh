#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"

cd "$REPO_ROOT"

echo "==> Validate metadata JSON"
python3 -m json.tool uupd-indicator@projectbluefin.io/metadata.json >/dev/null

echo "==> Compile GSettings schemas"
glib-compile-schemas uupd-indicator@projectbluefin.io/schemas

echo "==> Run settings fallback test"
gjs -m tests/settings-fallback.js

echo "==> Run deployment status parser test"
gjs -m tests/deployment-status.js

echo "==> Run coordinator test"
gjs -m tests/coordinator.js

echo "==> Check shell scripts syntax"
while IFS= read -r -d '' script; do
  bash -n "$script"
done < <(find scripts -name '*.sh' -print0)

echo "==> Reject debug and legacy symbols"
if grep -R "console\.log\|_iconToggle\|GETTEXT_DOMAIN\|DBUS_MANAGER_INTERFACE" \
    -n uupd-indicator@projectbluefin.io; then
  echo "ERROR: unexpected debug or legacy symbol found"
  exit 1
fi

echo "==> Pack extension zip"
gnome-extensions pack uupd-indicator@projectbluefin.io --force

echo "==> All static checks passed"
