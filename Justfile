default:
  @just --list

alias reinstall := update
alias enable := _enable
alias disable := _disable

install:
  ./scripts/install-extension.sh install

update:
  ./scripts/install-extension.sh update

uninstall:
  ./scripts/uninstall-extension.sh

status:
  ./scripts/extension-status.sh

logs:
  ./scripts/extension-logs.sh

list:
  @just --list

[private]
_enable:
  ./scripts/install-extension.sh enable

[private]
_disable:
  ./scripts/uninstall-extension.sh disable-only
