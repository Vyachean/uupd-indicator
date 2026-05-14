#!/usr/bin/env bash
set -euo pipefail

UUID="uupd-indicator@projectbluefin.io"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
EXT_DIR="$REPO_ROOT/$UUID"
TEST_SCRIPT="$REPO_ROOT/tests/smoke-extension.js"
BUILD_DIR="${BUILD_DIR:-$REPO_ROOT/.tmp/smoke-test}"
ZIP_PATH="$BUILD_DIR/$UUID.shell-extension.zip"
runtime_dir=""

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

cleanup() {
  if [ -n "$runtime_dir" ] && [ -d "$runtime_dir" ]; then
    rm -rf "$runtime_dir"
  fi
}

command -v gnome-extensions >/dev/null 2>&1 || fail "gnome-extensions is required"
command -v gnome-shell-test-tool >/dev/null 2>&1 || fail "gnome-shell-test-tool is not installed"

if ! gnome-shell-test-tool --help 2>&1 | grep -F -- "--extension" >/dev/null; then
  fail "gnome-shell-test-tool is installed, but this build does not support --extension. GNOME Shell 50 or newer tooling is required for the packaged-extension smoke test."
fi

[ -d "$EXT_DIR" ] || fail "extension directory not found: $EXT_DIR"
[ -f "$TEST_SCRIPT" ] || fail "smoke test script not found: $TEST_SCRIPT"

rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

gnome-extensions pack \
  --force \
  --quiet \
  --out-dir "$BUILD_DIR" \
  "$EXT_DIR"

[ -f "$ZIP_PATH" ] || fail "expected extension zip was not created: $ZIP_PATH"

if [ -z "${XDG_RUNTIME_DIR:-}" ]; then
  runtime_parent="${RUNNER_TEMP:-/tmp}"
  runtime_dir="$(mktemp -d "$runtime_parent/uupd-indicator-runtime.XXXXXX")"
  chmod 700 "$runtime_dir"
  export XDG_RUNTIME_DIR="$runtime_dir"
  trap cleanup EXIT
fi

command=(
  gnome-shell-test-tool
  --headless
  --extension "$ZIP_PATH"
  "$TEST_SCRIPT"
)

if [ -z "${DBUS_SESSION_BUS_ADDRESS:-}" ]; then
  command -v dbus-run-session >/dev/null 2>&1 || fail "dbus-run-session is required when no DBUS_SESSION_BUS_ADDRESS is set"
  dbus-run-session -- "${command[@]}"
else
  "${command[@]}"
fi
