/**
 * Whether the uploader is allowed to send.
 *
 * Three levers with deliberately different reach, because they answer different
 * questions and conflating them gets one of them wrong:
 *
 * - the **build flag** means "the collector is in trouble, stop sending". Logs
 *   keep accumulating so they can go out once it recovers.
 * - the **device opt-out** means "do not collect on this device". Continuing to
 *   write entries to disk under an opt-out would defeat the point, so it gates
 *   collection itself and the existing queue is discarded.
 * - the **hold toggle** means "keep accumulating, just do not send", and is what
 *   turns the queue into a monitoring view: nothing drains it, so an engineer
 *   reproducing a bug can read back what the device produced. It is a debugging
 *   lever, not a privacy one — that distinction is the whole reason it is not
 *   folded into the opt-out.
 *
 * All are read live so flipping any of them takes effect without a reload.
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
/** Set to '1' to hold batches in the queue instead of sending them. */
export const LOG_UPLOAD_HOLD_KEY = '@chatic/web.log.upload.hold';

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
 * Whether the app shell is holding uploads.
 *
 * Injected as a window global by the native side (see mobile
 * `injectionScripts.ts`), the same way the debug-mode unlock crosses that
 * boundary. It is a separate reading from the localStorage key rather than a
 * write into it: the app owns its toggle's persistence, the web owns its own,
 * and each stays truthful about the lever it actually controls. Either one being
 * on holds — a hold is a hold, whoever asked for it.
 */
export const isLogUploadHeldByApp = (): boolean =>
    (window as unknown as { CHATIC_APP_LOG_UPLOAD_HOLD?: boolean }).CHATIC_APP_LOG_UPLOAD_HOLD === true;

/** Whether batches stay in the queue instead of being sent. */
export const isLogUploadHeld = (): boolean => readFlag(LOG_UPLOAD_HOLD_KEY) || isLogUploadHeldByApp();

/**
 * Flips the web-owned hold. The app's injected flag is not writable from here —
 * that toggle belongs to the app's debug menu, and pretending otherwise would
 * leave the UI claiming it turned off a hold that is still on.
 */
export const setLogUploadHold = (hold: boolean): void => {
    try {
        if (hold) localStorage.setItem(LOG_UPLOAD_HOLD_KEY, '1');
        else localStorage.removeItem(LOG_UPLOAD_HOLD_KEY);
    } catch {
        // Same reasoning as `readFlag`: a blocked store must not break the
        // debug tooling that reads it.
    }
};

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
        // Checked before the force flag on purpose: forcing answers "the build
        // disabled this, send anyway", which is not an answer to a hold someone
        // switched on just now. Letting it win would make the hold toggle
        // silently do nothing on exactly the devices being debugged.
        if (isLogUploadHeld()) return false;
        if (readFlag(LOG_UPLOAD_FORCED_KEY)) return true;
        return !disabledByBuild;
    };
