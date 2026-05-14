#!/usr/bin/env bash
set -euo pipefail

UUID="uupd-indicator@projectbluefin.io"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
EXPECTED_ROOT="$REPO_ROOT"
SOURCE_DIR="$REPO_ROOT/$UUID"
XDG_DATA_HOME_VALUE="${XDG_DATA_HOME:-$HOME/.local/share}"
EXTENSIONS_DIR="$XDG_DATA_HOME_VALUE/gnome-shell/extensions"
TARGET_DIR="$EXTENSIONS_DIR/$UUID"
ACTION="${1:-install}"

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

info() {
  printf '%s\n' "$*"
}

require_repo_root() {
  local current_dir
  current_dir="$(pwd -P)"

  if [ "$current_dir" != "$EXPECTED_ROOT" ]; then
    fail "run this command from the repository root: $EXPECTED_ROOT"
  fi

  [ -d "$SOURCE_DIR" ] || fail "extension directory was not found: $SOURCE_DIR"
  [ -f "$SOURCE_DIR/metadata.json" ] || fail "metadata.json was not found in $SOURCE_DIR"
}

copy_extension_files() {
  mkdir -p "$EXTENSIONS_DIR"
  rm -rf "$TARGET_DIR"
  mkdir -p "$TARGET_DIR"
  cp -a "$SOURCE_DIR/." "$TARGET_DIR/"
}

has_gnome_extensions() {
  command -v gnome-extensions >/dev/null 2>&1
}

enable_extension() {
  local summary_verb="$1"

  if ! has_gnome_extensions; then
    info "$summary_verb $UUID in $EXTENSIONS_DIR."
    info "ERROR: gnome-extensions command was not found."
    info "Install GNOME Shell extension tools or run this on a GNOME system."
    info "If GNOME Shell does not detect the extension immediately, log out and log back in."
    exit 1
  fi

  if gnome-extensions enable "$UUID"; then
    info "$summary_verb $UUID in $EXTENSIONS_DIR."
    info "Extension enabled."
    info "If the icon does not appear, log out and log back in."
    return 0
  fi

  info "$summary_verb $UUID in $EXTENSIONS_DIR."
  info "WARNING: GNOME Shell did not enable the extension automatically."
  info "Try: gnome-extensions enable $UUID"
  info "If GNOME Shell still does not detect it, log out and log back in."
  exit 1
}

case "$ACTION" in
  install)
    require_repo_root
    copy_extension_files
    enable_extension "Installed"
    ;;
  update)
    require_repo_root
    if has_gnome_extensions; then
      if gnome-extensions disable "$UUID" >/dev/null 2>&1; then
        :
      fi
    fi
    copy_extension_files
    enable_extension "Updated"
    ;;
  enable)
    require_repo_root
    [ -d "$TARGET_DIR" ] || fail "extension is not installed in $TARGET_DIR"

    if ! has_gnome_extensions; then
      fail "gnome-extensions command was not found. Install GNOME Shell extension tools or run this on a GNOME system."
    fi

    if gnome-extensions enable "$UUID"; then
      info "Extension enabled."
      info "If the icon does not appear, log out and log back in."
    else
      fail "GNOME Shell could not enable $UUID. If the extension was just installed, try logging out and back in first."
    fi
    ;;
  *)
    fail "unknown action: $ACTION"
    ;;
esac
