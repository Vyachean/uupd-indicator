import GLib from "gi://GLib";

export function formatTimestamp(usec) {
  if (!usec || usec <= 0)
    return null;

  try {
    return GLib.DateTime.new_from_unix_local(Math.floor(usec / 1000000))
      ?.format("%Y-%m-%d %H:%M:%S") ?? null;
  } catch (_error) {
    return null;
  }
}

export function formatElapsedDuration(usec) {
  if (!usec || usec <= 0)
    return null;

  const nowUsec = GLib.DateTime.new_now_local().to_unix() * 1000000;
  const elapsedSeconds = Math.max(0, Math.floor((nowUsec - usec) / 1000000));
  const hours = Math.floor(elapsedSeconds / 3600);
  const minutes = Math.floor((elapsedSeconds % 3600) / 60);
  const seconds = elapsedSeconds % 60;

  if (hours > 0)
    return `${hours}h ${minutes}m`;

  if (minutes > 0)
    return `${minutes}m ${seconds}s`;

  return `${seconds}s`;
}
