# GNOME 50 verification

Runtime verification for GNOME Shell 50 must be done in a real host GNOME session. Editing, static checks, JSON validation, shell syntax checks, and package build checks are useful in `distrobox`, but they do not prove that the extension works in GNOME Shell.

## Local symlink install

```bash
UUID="uupd-indicator@projectbluefin.io"
EXT_DIR="$HOME/.local/share/gnome-shell/extensions/$UUID"

rm -rf "$EXT_DIR"
ln -s "$PWD/$UUID" "$EXT_DIR"
```

## Extension status

```bash
gnome-extensions info uupd-indicator@projectbluefin.io
gnome-extensions enable uupd-indicator@projectbluefin.io
```

## GNOME Shell logs

```bash
journalctl -f -o cat /usr/bin/gnome-shell
```

Filtered version:

```bash
journalctl -f -o cat /usr/bin/gnome-shell | grep -Ei 'uupd|JS ERROR|extension'
```

## systemd / D-Bus checks

Host diagnostics on Bluefin GNOME 50 confirmed that `uupd.timer` and `uupd.service` are system units, while user-unit checks returned `LoadState=not-found`.

The extension intentionally reflects only systemd state that is available over D-Bus. Without changes in `uupd`, exact package-level progress or percentages are not available to the Shell extension. Failed automatic runs are surfaced as a warning icon, using `uupd.service` state plus best-effort `Result` and `ExecMainStatus` details when systemd exposes them.

The default visibility mode is `auto`: inactive or missing service state stays hidden, active or activating with the timer enabled shows a pulsing download icon, and failed runs show a warning icon until dismissed or until service state changes. An optional `always` mode keeps the indicator visible in a neutral idle state even when `uupd.service` is inactive or unavailable.

Primary checks:

```bash
systemctl show uupd.timer -p LoadState -p UnitFileState -p ActiveState -p SubState -p FragmentPath
systemctl show uupd.service -p LoadState -p UnitFileState -p ActiveState -p SubState -p FragmentPath
busctl --system get-property org.freedesktop.systemd1 /org/freedesktop/systemd1/unit/uupd_2etimer org.freedesktop.systemd1.Unit UnitFileState
busctl --system get-property org.freedesktop.systemd1 /org/freedesktop/systemd1/unit/uupd_2eservice org.freedesktop.systemd1.Unit ActiveState
```

Comparison checks:

```bash
systemctl --user show uupd.timer -p LoadState -p UnitFileState -p ActiveState -p SubState -p FragmentPath
systemctl --user show uupd.service -p LoadState -p UnitFileState -p ActiveState -p SubState -p FragmentPath
```

## Host diagnostic script

```bash
./scripts/collect-host-diagnostics.sh
```

The report is written to a timestamped Markdown file in the repository root.

The report also states whether the installed extension path resolves to this checkout, so a successful smoke test is not mistaken for another installed copy.

## CI

GitHub Actions runs two workflows:

- **`.github/workflows/ci.yml`** — required on every pull request and push to `main`. Runs `./scripts/ci-static.sh` inside a Fedora 44 container. A red check here means a deterministic project check failed.
- **`.github/workflows/smoke.yml`** — optional, triggered only by `workflow_dispatch`. Runs the GNOME Shell runtime smoke test. It is non-blocking and does not gate merges.

`scripts/ci-static.sh` is the local equivalent of required CI. Run it locally to reproduce what required CI checks.

### Testing matrix

| Path | What it validates | What it does not prove |
| --- | --- | --- |
| `required-static` (required) | `metadata.json` parses cleanly, GSettings schemas compile, GJS unit tests pass, shell scripts pass `bash -n`, known debug leftovers are rejected, `gnome-extensions pack` builds the packaged zip | No GNOME Shell runtime coverage |
| `smoke-fedora-container-probe` (optional, non-blocking, `workflow_dispatch` only) | Fedora 44 provides GNOME Shell 50 tooling, `gnome-shell-test-tool` exposes `--extension`, the packaged extension startup is attempted with fake provider state from `tests/smoke-extension.js` | No full GNOME host-session integration, no real systemd/logind/session-bus coverage, no real `uupd.service` behavior |
| Self-hosted Bluefin / GNOME 50 runner or manual host session | Real logged-in GNOME 50 host behavior, real D-Bus/session/system integration, real extension behavior on the target desktop | Not covered by GitHub-hosted container CI |

Hosted GitHub Fedora containers do not provide a full systemd/logind/system-bus desktop environment. GNOME Shell 50 tooling is available there, but Shell UI startup can still fail before the extension meaningfully runs because the container lacks the host services that a real GNOME session expects.

For that reason, `smoke-fedora-container-probe` is diagnostic only and intentionally non-blocking:

- it runs `gnome-shell-test-tool` against the packaged extension zip
- it targets a Fedora GNOME userspace inside a GitHub Actions job container
- it drives only fake provider state from `tests/smoke-extension.js`
- it does not start `uupd.service`
- it does not touch real systemd unit state
- it may fail because the hosted container does not provide full GNOME host-session services

The Fedora probe prints `gnome-shell --version`, prints `gnome-shell-test-tool --help`, prints whether `DBUS_SESSION_BUS_ADDRESS` is set, and prints the `XDG_RUNTIME_DIR` path and permissions before attempting startup. When no session bus is already available, the smoke runner starts `gnome-shell-test-tool` inside `dbus-run-session`.

Real host integration remains the responsibility of `./scripts/collect-host-diagnostics.sh` and a real GNOME 50 host session. The commented self-hosted Bluefin / GNOME 50 runner template in the smoke workflow is the correct path for real host integration checks once such a runner exists.

## Verification

### Static checks

Run the same script that required CI uses:

```bash
./scripts/ci-static.sh
```

This covers all deterministic checks: JSON validation, schema compilation, GJS unit tests, shell script syntax, debug symbol rejection, and extension packaging.

### Host diagnostics

```bash
./scripts/collect-host-diagnostics.sh
```

This remains the source of truth for real host systemd and D-Bus availability in the logged-in GNOME session.

### Automated smoke test

```bash
./scripts/run-smoke-test.sh
```

The smoke test:

- builds a packaged extension zip with `gnome-extensions pack`
- starts a separate `gnome-shell-test-tool` environment instead of restarting the real desktop session
- installs the packaged zip into that test environment
- drives the indicator through fake provider state only

The smoke test does not start `uupd.service` and does not trigger real system updates. It verifies extension loading, indicator registration, visibility changes for fake `active` / `activating` / `inactive` states, and actor cleanup on disable.

It also verifies the fake failed-state warning path, session-only dismiss behavior in `auto` mode, and the idle fallback path in `always` mode.

Real visual behavior during an actual host update still needs natural observation during a real update window or a separate manual runtime check.

### Warning

Do not start `uupd.service` manually as a test unless you understand what it will do on the current system. It may start a real update.

### GNOME 50 / Wayland

On GNOME 50 / Wayland, do not rely on `Alt+F2`, then `r`. A full reload usually requires logout/login or a separate nested shell or devkit session.
