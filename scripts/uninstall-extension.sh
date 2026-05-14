#!/usr/bin/env bash
set -euo pipefail

UUID="uupd-indicator@projectbluefin.io"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
XDG_DATA_HOME_VALUE="${XDG_DATA_HOME:-$HOME/.local/share}"
EXTENSIONS_DIR="$XDG_DATA_HOME_VALUE/gnome-shell/extensions"
TARGET_DIR="$EXTENSIONS_DIR/$UUID"
ACTION="${1:-uninstall}"

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

info() {
  printf '%s\n' "$*"
}

has_gnome_extensions() {
  command -v gnome-extensions >/dev/null 2>&1
}

disable_extension_if_possible() {
  if ! has_gnome_extensions; then
    info "gnome-extensions command was not found. Skipping disable step."
    return 0
  fi

  if gnome-extensions disable "$UUID" >/dev/null 2>&1; then
    info "Extension disabled."
  else
    info "Extension was not enabled or GNOME Shell could not disable it from this session."
  fi
}

case "$ACTION" in
  uninstall)
    [ -d "$REPO_ROOT/$UUID" ] || fail "source repository does not contain $UUID"
    disable_extension_if_possible

    if [ -d "$TARGET_DIR" ]; then
      rm -rf "$TARGET_DIR"
      info "Removed installed extension from $TARGET_DIR."
    else
      info "Extension was not installed in $TARGET_DIR."
    fi
    ;;
  disable-only)
    disable_extension_if_possible
    ;;
  *)
    fail "unknown action: $ACTION"
    ;;
esac
