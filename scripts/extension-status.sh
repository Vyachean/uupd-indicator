#!/usr/bin/env bash
set -euo pipefail

UUID="uupd-indicator@projectbluefin.io"
XDG_DATA_HOME_VALUE="${XDG_DATA_HOME:-$HOME/.local/share}"
TARGET_DIR="$XDG_DATA_HOME_VALUE/gnome-shell/extensions/$UUID"

print_kv() {
  printf '%-28s %s\n' "$1" "$2"
}

has_command() {
  command -v "$1" >/dev/null 2>&1
}

command_status() {
  local tool="$1"
  if has_command "$tool"; then
    printf 'available'
  else
    printf 'unavailable'
  fi
}

systemd_unit_exists() {
  local unit="$1"

  if ! has_command systemctl; then
    return 2
  fi

  if systemctl list-unit-files "$unit" --no-legend --no-pager >/dev/null 2>&1; then
    if systemctl list-unit-files "$unit" --no-legend --no-pager | grep -Fq "$unit"; then
      return 0
    fi
  fi

  if systemctl status "$unit" --no-pager >/dev/null 2>&1; then
    return 0
  fi

  return 1
}

systemd_unit_state() {
  local subcommand="$1"
  local unit="$2"
  local result

  if ! has_command systemctl; then
    printf 'systemctl unavailable'
    return 0
  fi

  if result="$(systemctl "$subcommand" "$unit" 2>/dev/null)"; then
    printf '%s' "$result"
    return 0
  fi

  case "$subcommand" in
    is-enabled)
      printf 'disabled or unknown'
      ;;
    is-active)
      printf 'inactive or unknown'
      ;;
    *)
      printf 'unknown'
      ;;
  esac
}

gnome_seen_status="gnome-extensions unavailable"
gnome_enabled_status="gnome-extensions unavailable"

if has_command gnome-extensions; then
  if gnome-extensions list 2>/dev/null | grep -Fxq "$UUID"; then
    gnome_seen_status="yes"
  else
    gnome_seen_status="no"
  fi

  if gnome-extensions list --enabled 2>/dev/null | grep -Fxq "$UUID"; then
    gnome_enabled_status="yes"
  else
    gnome_enabled_status="no"
  fi
fi

print_kv "Install path" "$TARGET_DIR"
if [ -d "$TARGET_DIR" ]; then
  print_kv "Installed" "yes"
else
  print_kv "Installed" "no"
fi
print_kv "gnome-extensions" "$(command_status gnome-extensions)"
print_kv "GNOME sees extension" "$gnome_seen_status"
print_kv "Extension enabled" "$gnome_enabled_status"
print_kv "systemctl" "$(command_status systemctl)"

if systemd_unit_exists "uupd.timer"; then
  print_kv "uupd.timer exists" "yes"
else
  print_kv "uupd.timer exists" "no"
fi
print_kv "uupd.timer enabled" "$(systemd_unit_state is-enabled uupd.timer)"
print_kv "uupd.timer active" "$(systemd_unit_state is-active uupd.timer)"

if systemd_unit_exists "uupd.service"; then
  print_kv "uupd.service exists" "yes"
else
  print_kv "uupd.service exists" "no"
fi
print_kv "uupd.service running" "$(systemd_unit_state is-active uupd.service)"
