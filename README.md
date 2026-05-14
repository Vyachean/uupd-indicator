# Universal Blue Update Indicator

A GNOME Shell extension that shows a pulsing download indicator when system updates are being applied via `uupd.service` on Universal Blue systems.

## Features

- Shows a pulsing download icon in the system tray when updates are running
- Only active when automatic updates are enabled (`ujust toggle-updates`)
- Monitors system `uupd.service` and `uupd.timer` units through the systemd D-Bus API on the system bus
- Smooth opacity-based pulsing animation
- Metadata declares GNOME Shell 49 and 50 support

[screeencast](https://github.com/user-attachments/assets/bfa39984-85b9-4b1c-b3bd-faae13dd6f76)

![total bar](/screenshots/screenshot1.png)
![detail](/screenshots/screenshot2.png)
![on click](/screenshots/screenshot3.png)

## Installation

### Manual Installation

1. Clone this repository or download the source code
2. Copy the extension directory to your GNOME Shell extensions folder:

```bash
cp -r uupd-indicator@projectbluefin.io ~/.local/share/gnome-shell/extensions/
```

3. Set proper file permissions:

```bash
chmod 644 ~/.local/share/gnome-shell/extensions/uupd-indicator@projectbluefin.io/*
```

4. Log out and log back in

5. Enable the extension:

```bash
gnome-extensions enable uupd-indicator@projectbluefin.io
```

### From GNOME Extensions Website

*Coming soon*

## Usage

The extension automatically monitors the system `uupd.service` and `uupd.timer` units.

### Enable Automatic Updates

To enable automatic updates on Universal Blue:

```bash
ujust toggle-updates
```

When automatic updates are enabled, the extension will show a pulsing download icon in the system tray whenever updates are being downloaded or applied.

### Disable Automatic Updates

Run the same command again to disable:

```bash
ujust toggle-updates
```

When automatic updates are disabled, the extension will hide the indicator.

## Requirements

- GNOME Shell 49 or 50
- Universal Blue or any system using `uupd.service` and `uupd.timer`
- systemd

## Development

The extension monitors the following systemd units via the system bus:

- `uupd.service` - The update service (shows indicator when active/activating)
- `uupd.timer` - The timer that triggers automatic updates (extension only shows when enabled)

Production state reads are isolated in `SystemdUupdStateProvider`, while `UupdIndicator` owns the panel actor behavior. Smoke tests switch the actor to a fake provider state path, so they verify visibility and cleanup without starting `uupd.service` or triggering real system updates.

### File Structure

```
uupd-indicator@projectbluefin.io/
├── extension.js    # Main extension code
├── metadata.json   # Extension metadata
└── stylesheet.css  # Custom styles (if any)
```

## Troubleshooting

### Extension not showing up

- Make sure file permissions are set correctly (644)
- Log out and log back in to reload GNOME Shell
- Check that the extension is enabled: `gnome-extensions list --enabled`

### Icon not animating

- Verify that automatic updates are enabled and that the system units are present on the host.
- View extension logs: `journalctl /usr/bin/gnome-shell | grep uupd-indicator`

### Extension crashes or errors

Check the GNOME Shell logs for errors:

```bash
journalctl /usr/bin/gnome-shell -f
```

### Show triggering timestamps
```bash
systemctl list-timers --all uupd.timer
```

## GNOME 50 debug / verification

Runtime verification for GNOME Shell 50 must be done in the real host GNOME session. Editing, static checks, JSON validation, shell syntax checks, and package build checks are fine in `distrobox`, but they do not prove that the extension works in GNOME Shell.

The repository currently keeps `version` at `1`. This cleanup is aimed at development normalization, not at preparing a new packaged release zip.

### Local symlink install

```bash
UUID="uupd-indicator@projectbluefin.io"
EXT_DIR="$HOME/.local/share/gnome-shell/extensions/$UUID"

rm -rf "$EXT_DIR"
ln -s "$PWD/$UUID" "$EXT_DIR"
```

### Extension status

```bash
gnome-extensions info uupd-indicator@projectbluefin.io
gnome-extensions enable uupd-indicator@projectbluefin.io
```

### GNOME Shell logs

```bash
journalctl -f -o cat /usr/bin/gnome-shell
```

Filtered version:

```bash
journalctl -f -o cat /usr/bin/gnome-shell | grep -Ei 'uupd|JS ERROR|extension'
```

### systemd / D-Bus checks

Host diagnostics on Bluefin GNOME 50 confirmed that `uupd.timer` and `uupd.service` are system units, while user-unit checks returned `LoadState=not-found`. The extension therefore uses `Gio.DBus.system`.

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

### Host diagnostic script

Run:

```bash
./scripts/collect-host-diagnostics.sh
```

The report is written to a timestamped Markdown file in the repository root.

The report also states whether the installed extension path resolves to this checkout, so a successful smoke test is not mistaken for another installed copy.

## CI

GitHub Actions runs the required static checks for pull requests, pushes to `main`, and manual `workflow_dispatch` runs.

The Fedora smoke path remains experimental and non-blocking on purpose. It is useful as a GNOME 50 tooling probe, but it is not a substitute for a real GNOME host session.

### Testing matrix

| Path | What it validates | What it does not prove |
| --- | --- | --- |
| `static` (required) | `metadata.json` parses cleanly, shell helper scripts pass `bash -n`, known debug leftovers are rejected, `gnome-extensions pack` builds the packaged zip | No GNOME Shell runtime coverage |
| `smoke-fedora-container-probe` (experimental, non-blocking) | Fedora 44 provides GNOME Shell 50 tooling, `gnome-shell-test-tool` exposes `--extension`, the packaged extension startup is attempted with fake provider state from `tests/smoke-extension.js` | No full GNOME host-session integration, no real systemd/logind/session-bus coverage, no real `uupd.service` behavior |
| Self-hosted Bluefin / GNOME 50 runner or manual host session | Real logged-in GNOME 50 host behavior, real D-Bus/session/system integration, real extension behavior on the target desktop | Not covered by GitHub-hosted container CI |

Hosted GitHub Fedora containers do not provide a full systemd/logind/system-bus desktop environment. GNOME Shell 50 tooling is available there, but Shell UI startup can still fail before the extension meaningfully runs because the container lacks the host services that a real GNOME session expects.

For that reason, `smoke-fedora-container-probe` is diagnostic only:

- it runs `gnome-shell-test-tool` against the packaged extension zip
- it targets a Fedora GNOME userspace inside a GitHub Actions job container
- it drives only fake provider state from `tests/smoke-extension.js`
- it does not start `uupd.service`
- it does not touch real systemd unit state
- it may fail because the hosted container does not provide full GNOME host-session services

The Fedora probe prints `gnome-shell --version`, prints `gnome-shell-test-tool --help`, prints whether `DBUS_SESSION_BUS_ADDRESS` is set, and prints the `XDG_RUNTIME_DIR` path and permissions before attempting startup. When no session bus is already available, the smoke runner starts `gnome-shell-test-tool` inside `dbus-run-session`.

Real host integration remains the responsibility of `./scripts/collect-host-diagnostics.sh` and a real GNOME 50 host session. The commented self-hosted Bluefin / GNOME 50 runner template in CI is the correct path for real host integration checks once such a runner exists.

## Verification

### Static checks

```bash
python3 -m json.tool uupd-indicator@projectbluefin.io/metadata.json
bash -n scripts/collect-host-diagnostics.sh
bash -n scripts/run-smoke-test.sh
grep -R "console.log\|_iconToggle\|GETTEXT_DOMAIN\|DBUS_MANAGER_INTERFACE" -n uupd-indicator@projectbluefin.io || true
```

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

Real visual behavior during an actual host update still needs natural observation during a real update window or a separate manual runtime check.

### Warning

Do not start `uupd.service` manually as a test unless you understand what it will do on the current system. It may start a real update.

### GNOME 50 / Wayland

On GNOME 50 / Wayland, do not rely on `Alt+F2`, then `r`. A full reload usually requires logout/login or a separate nested shell or devkit session.

## License

GPLv3

## Credits

- Based on the VanillaOS Update Check Extension
- Universal Blue Contributors

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.
