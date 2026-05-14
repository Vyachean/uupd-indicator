default:
  @just --list

alias reinstall := update
alias enable := _enable
alias disable := _disable

install:
  bash ./scripts/install-extension.sh install

update:
  bash ./scripts/install-extension.sh update

uninstall:
  bash ./scripts/uninstall-extension.sh

status:
  bash ./scripts/extension-status.sh

logs:
  bash ./scripts/extension-logs.sh

list:
  @just --list

[private]
_enable:
  bash ./scripts/install-extension.sh enable

[private]
_disable:
  bash ./scripts/uninstall-extension.sh disable-only
