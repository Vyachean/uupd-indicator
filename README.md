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

## Development / verification

Development and verification notes, including GNOME 50 host checks, CI coverage, smoke-test limitations, and manual D-Bus/systemd debugging commands, live in [docs/gnome50-verification.md](docs/gnome50-verification.md).

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


## License

GPLv3

## Credits

- Based on the VanillaOS Update Check Extension
- Universal Blue Contributors

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.
