# Universal Blue Update Indicator

`uupd-indicator` is a GNOME Shell extension for Universal Blue, Bluefin, and compatible systems that expose `uupd.service` and `uupd.timer`. By default it shows a pulsing download indicator only while automatic updates are running, a restart-required icon when an update is staged and waiting for reboot, and a warning icon when the last automatic run fails.

[screencast](https://github.com/user-attachments/assets/bfa39984-85b9-4b1c-b3bd-faae13dd6f76)

![total bar](/screenshots/screenshot1.png)
![detail](/screenshots/screenshot2.png)
![on click](/screenshots/screenshot3.png)

## Why this exists

Bluefin and other Universal Blue systems are designed around quiet, automatic background updates. This is intentional: routine system maintenance should happen without asking the user to manually manage updates.

However, invisible background work can be confusing on laptops. Automatic updates may temporarily use CPU, disk, network, and battery. When a laptop suddenly becomes warm, noisy, slower, or starts draining battery without any visible reason, the user has no simple way to tell whether the system is doing expected maintenance or whether something is wrong.

`uupd-indicator` exists to make that specific background activity visible.

It does not manage updates, trigger updates, block updates, or ask the user to take action. It only reflects the state of the existing `uupd.service` / `uupd.timer` workflow in the GNOME top bar.

The goal is deliberately modest:

- explain otherwise invisible update-related load;
- reduce confusion when a laptop heats up, slows down, or uses more battery during automatic maintenance;
- show when automatic update work is running or has failed;
- avoid requiring terminal commands just to understand what the system is doing;
- stay passive and avoid interrupting the user.

This keeps Bluefin's quiet automatic update model intact while giving users who want it a small amount of operational context.

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

`just install` copies the extension into your user-local GNOME Shell extensions directory, compiles the extension GSettings schema, enables it with `gnome-extensions`, and prints a reminder if GNOME Shell needs a logout/login cycle before the icon appears.

## Update

```bash
cd uupd-indicator
git pull
just update
```

`just update` refreshes the installed files from your current checkout, recompiles the extension schema, and re-enables the extension when possible.

## Uninstall

```bash
just uninstall
```

This removes only the installed copy from your user extensions directory. It does not delete the source repository.

## Usage

The extension watches `uupd.service` and `uupd.timer` over D-Bus. The default visibility mode is `Auto`, which keeps the current top-bar behavior: hidden while inactive, pulsing while updates run, showing a restart-required icon when a staged deployment requires reboot, and showing a warning icon when the last automatic run fails.

When the indicator is visible, update-related background work may be one reason for temporary CPU, disk, network, battery, or thermal activity.

An optional `Always` visibility mode is available in the extension preferences. In that mode the indicator remains visible in the top bar even while `uupd.service` is inactive, using a neutral `view-refresh-symbolic` idle icon without fake progress percentages unless a higher-priority updating, failed, or restart-required state applies.

## UX and status model

The extension shows the current systemd unit state that is available over D-Bus. It does not parse `journalctl`, it does not shell out for normal UI updates, and it does not invent exact package-level progress.

Because `uupd` does not currently expose exact update progress to the extension, the indicator can show that an automatic update is running, failed, staged for reboot, or is scheduled through `uupd.timer`, but it cannot show an exact percentage.

If the last automatic `uupd.service` run fails, the top bar shows a warning icon instead of silently hiding the problem. The popup includes the systemd result and exit status when systemd exposes them, and the warning can be dismissed for the current failed state.

Restart-required is derived separately from service activity. A successful `uupd.service` completion by itself is not treated as restart-required; that status must come from a dedicated deployment-status source.

The indicator state priority is:

1. `updating`
2. `failed` unless dismissed
3. `reboot-required` when the restart-required preference is enabled
4. `idle` in `Always` visibility mode
5. `hidden`

When `uupd.service` is inactive, the indicator stays hidden in `Auto` mode unless restart-required is active and enabled. In `Always` mode it stays visible as a neutral idle indicator and shows only a compact user-facing summary with status, automatic updates state, and the next scheduled check when systemd exposes it.

## Preferences

Open the GNOME Extensions app or run `gnome-extensions prefs uupd-indicator@projectbluefin.io`, then choose one of:

- `Auto`: show only while updates run or when an update fails
- `Always`: keep the indicator visible in the top bar
- `Show restart-required status`: keep the indicator visible when a staged deployment requires reboot; disable it to hide that state in `Auto` mode and fall back to idle in `Always` mode

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

- In the default `Auto` mode, make sure automatic updates are enabled with `ujust toggle-updates`.
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
