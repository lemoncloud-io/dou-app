/**
 * The two numbers every audio surface prints — a length and a size — formatted in one place, so the
 * bubble, the mini player, the detail screen and a file list row never disagree about "35:47" or
 * "17.0MB".
 */

/**
 * A length or a position in seconds as `m:ss`, or `h:mm:ss` from an hour up (`0:07`, `35:47`,
 * `1:12:05`). Fractions are dropped, not rounded, so a clock never shows a second that has not been
 * played. Anything not a finite positive number reads `0:00`.
 */
export const formatAudioClock = (seconds: number | undefined): string => {
    const total = seconds !== undefined && Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const rest = String(total % 60).padStart(2, '0');
    return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`;
};

/**
 * A byte count in megabytes with one decimal (`17.0MB`, `0.3MB`). The design writes every audio size
 * this way, whatever its magnitude, so a 300 KB voice note reads `0.3MB` rather than switching units.
 * Absent or negative sizes return `undefined`, so a caller can leave the part out.
 */
export const formatAudioSize = (bytes: number | undefined): string | undefined => {
    if (bytes === undefined || !Number.isFinite(bytes) || bytes < 0) return undefined;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
};

/**
 * The line under an audio file's name before it plays: `length · size`, or whichever of the two is
 * known. The length is unknown until the file's header has been read, which is usually on first play.
 */
export const formatAudioMeta = (durationSeconds: number | undefined, bytes: number | undefined): string =>
    [
        durationSeconds !== undefined && durationSeconds > 0 ? formatAudioClock(durationSeconds) : undefined,
        formatAudioSize(bytes),
    ]
        .filter(Boolean)
        .join(' · ');
