#!/usr/bin/env bash
set -euo pipefail

UUID="uupd-indicator@projectbluefin.io"

info() {
  printf '%s\n' "$*"
}

if ! command -v journalctl >/dev/null 2>&1; then
  info "ERROR: journalctl command was not found."
  info "Try viewing GNOME Shell logs manually, for example:"
  info "journalctl --user --follow"
  exit 1
fi

tmp_log="$(mktemp)"
trap 'rm -f "$tmp_log"' EXIT

if ! journalctl --no-pager --since "2 hours ago" _COMM=gnome-shell >"$tmp_log" 2>/dev/null; then
  if ! journalctl --no-pager --since "2 hours ago" /usr/bin/gnome-shell >"$tmp_log" 2>/dev/null; then
    info "Could not query GNOME Shell logs automatically."
    info "Try one of these commands manually:"
    info "journalctl --follow /usr/bin/gnome-shell"
    info "journalctl --user --follow"
    exit 1
  fi
fi

if grep -Ei "$UUID|uupd-indicator|projectbluefin" "$tmp_log"; then
  exit 0
fi

info "No recent GNOME Shell log lines matched $UUID."
info "Showing the latest unfiltered GNOME Shell log lines instead."
tail -n 40 "$tmp_log"
info "For a live view, run: journalctl --follow /usr/bin/gnome-shell"
exit 0
