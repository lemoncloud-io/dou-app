/**
 * Whether the uploader is allowed to send.
 *
 * Two levers with deliberately different reach, because they answer different
 * questions and conflating them gets one of them wrong:
 *
 * - the **build flag** means "the collector is in trouble, stop sending". Logs
 *   keep accumulating so they can go out once it recovers.
 * - the **device opt-out** means "do not collect on this device". Continuing to
 *   write entries to disk under an opt-out would defeat the point, so it gates
 *   collection itself and the existing queue is discarded.
 *
 * Both are read live so flipping either takes effect without a reload.
 *
 * Dynamic remote configuration is deliberately out of scope — this is the seam
 * a future remote config would write to, not the config itself.
 *
 * The build flag arrives as an argument rather than being read here: touching
 * `import.meta.env` in this module would make it, and everything importing it,
 * unloadable under the CommonJS test transform. main.tsx is the composition
 * root and reads it there.
 */

/** Set to '1' on a device to stop uploads there. */
export const LOG_UPLOAD_DISABLED_KEY = '@chatic/web.log.upload.disabled';
/** Set to '1' to upload even when the build disabled it. */
export const LOG_UPLOAD_FORCED_KEY = '@chatic/web.log.upload.forced';

const readFlag = (key: string): boolean => {
    try {
        return localStorage.getItem(key) === '1';
    } catch {
        // Private mode or a blocked store: fall back to the build-time answer.
        return false;
    }
};

/**
 * Whether this device collects logs at all. False means nothing is queued and
 * nothing is written to disk — the opt-out is a privacy control, not a send
 * pause.
 */
export const isLogCollectionEnabled = (): boolean => !readFlag(LOG_UPLOAD_DISABLED_KEY);

/**
 * Builds the predicate the uploader consults before each send.
 *
 * @param disabledByBuild whether this build shipped with sending switched off.
 */
export const createLogUploadSwitch =
    (disabledByBuild = false): (() => boolean) =>
    () => {
        // The device opt-out stops sending too — it stops everything.
        if (!isLogCollectionEnabled()) return false;
        if (readFlag(LOG_UPLOAD_FORCED_KEY)) return true;
        return !disabledByBuild;
    };
