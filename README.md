# Universal Blue Update Indicator

`uupd-indicator` is a GNOME Shell extension that shows a pulsing download indicator when `uupd.service` is downloading or applying system updates. It is intended for Universal Blue, Bluefin, and compatible systems that expose `uupd.service` and `uupd.timer`.

[screencast](https://github.com/user-attachments/assets/bfa39984-85b9-4b1c-b3bd-faae13dd6f76)

![total bar](/screenshots/screenshot1.png)
![detail](/screenshots/screenshot2.png)
![on click](/screenshots/screenshot3.png)

## Requirements

- GNOME Shell 49 or 50
- Universal Blue, Bluefin, or a compatible system with `uupd.service` and `uupd.timer`
- systemd
- `gnome-extensions` command
- `just`

## Quick install

```bash
git clone https://github.com/Vyachean/uupd-indicator.git
cd uupd-indicator
just install
```

`just install` copies the extension into your user-local GNOME Shell extensions directory, enables it with `gnome-extensions`, and prints a reminder if GNOME Shell needs a logout/login cycle before the icon appears.

## Update

```bash
cd uupd-indicator
git pull
just update
```

`just update` refreshes the installed files from your current checkout and re-enables the extension when possible.

## Uninstall

```bash
just uninstall
```

This removes only the installed copy from your user extensions directory. It does not delete the source repository.

## Usage

The extension watches `uupd.service` and `uupd.timer`. When automatic updates are enabled and an update is running, GNOME Shell shows the pulsing indicator in the top bar.

## UX and status model

The extension shows the current systemd unit state that is available over D-Bus. It does not parse `journalctl`, it does not shell out for normal UI updates, and it does not invent exact package-level progress.

Because `uupd` does not currently expose exact update progress to the extension, the indicator can show that an automatic update is running, failed, or is scheduled through `uupd.timer`, but it cannot show an exact percentage.

If the last automatic `uupd.service` run fails, the top bar shows a warning icon instead of silently hiding the problem. The popup includes the systemd result and exit status when systemd exposes them.

When `uupd.service` is inactive, the indicator stays hidden. The top bar appears only while an automatic update is actively running or when a failed run needs attention.

## Status and logs

Check whether the extension is installed and enabled, and whether the relevant systemd units exist:

```bash
just status
```

View recent GNOME Shell logs for troubleshooting:

```bash
just logs
```

List all available helper commands:

```bash
just
```

## Automatic updates

Enable or disable the host update timer with:

```bash
ujust toggle-updates
```

Run the same command again to toggle automatic updates off.

The extension does not update itself automatically. To update the installed extension files after new commits are pulled, run:

```bash
git pull
just update
```

## Troubleshooting

### The extension does not appear after install

- Run `just status` to confirm the extension is installed under your user extensions directory and visible to `gnome-extensions`.
- If GNOME Shell does not pick up the new files immediately, log out and log back in.
- If `gnome-extensions` is missing, install the GNOME Shell extension tools for your system and run `just install` again.

### The icon is not visible

- Make sure automatic updates are enabled with `ujust toggle-updates`.
- Confirm that `uupd.timer` exists and is enabled by running `just status`.
- If the extension was just installed or updated, log out and log back in before assuming GNOME Shell failed to load it.

### Updates are not detected

- Run `just status` and verify that `uupd.timer` exists and that `uupd.service` is visible to `systemctl`.
- Check the next scheduled timer run with `systemctl list-timers --all uupd.timer`.
- Use `just logs` to inspect recent GNOME Shell messages for extension errors.

### How to check status

```bash
just status
```

### How to view logs

```bash
just logs
```

### When logout/login is needed

- After a first install, GNOME Shell may not detect the new extension immediately.
- After an update, GNOME Shell may keep the old extension process until the next session restart.
- If `just install` or `just update` says the extension was copied and enabled but the icon still does not appear, log out and log back in.

## Development / verification

Development and verification notes, including GNOME 50 host checks, CI coverage, smoke-test limitations, and manual D-Bus/systemd debugging commands, live in [docs/gnome50-verification.md](docs/gnome50-verification.md).

## License

GPLv3

## Credits

- Based on the VanillaOS Update Check Extension
- Universal Blue Contributors

## Contributing

Contributions are welcome. Issues and pull requests are welcome too.
