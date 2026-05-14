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
