import { config } from '@chatic/config';

/**
 * Whether the uploader is allowed to send.
 *
 * Three levers with deliberately different reach, because they answer different
 * questions and conflating them gets one of them wrong:
 *
 * - the **build flag** means "the collector is in trouble, stop sending". Logs
 *   keep accumulating so they can go out once it recovers.
 * - the **device opt-out** (`log.collection.enabled`) means "do not collect on this device".
 *   Continuing to write entries to disk under an opt-out would defeat the point, so it gates
 *   collection itself and the existing queue is discarded.
 * - the **hold toggle** (`log.upload.hold`) means "keep accumulating, just do not send", and is
 *   what turns the queue into a monitoring view: nothing drains it, so an engineer
 *   reproducing a bug can read back what the device produced. It is a debugging
 *   lever, not a privacy one — that distinction is the whole reason it is not
 *   folded into the opt-out.
 *
 * All are read live (a fresh `config.get()` each call) so flipping any of them takes effect
 * without a reload.
 *
 * The build flag arrives as an argument rather than being read here: touching
 * `import.meta.env` in this module would make it, and everything importing it,
 * unloadable under the CommonJS test transform. main.tsx is the composition
 * root and reads it there.
 *
 * `log.upload.enabled` folds what used to be a fourth, dedicated "force" key: forcing is now this
 * SAME key's `local` override (`writableBy: ['shell', 'local', 'server']`) — an explicit override,
 * whichever way it is set, wins outright over the build's own answer. Left unoverridden, the
 * registry's own `defaultValue: true` is not the fact that matters here — `envDefaultKey` has no way
 * to express "the opposite of this build value", so the build flag stays the deciding fact for the
 * unoverridden case, checked directly below instead of routed through the registry.
 */

/**
 * Whether this device collects logs at all. False means nothing is queued and
 * nothing is written to disk — the opt-out is a privacy control, not a send
 * pause.
 */
export const isLogCollectionEnabled = (): boolean => config.get<boolean>('log.collection.enabled') !== false;

/**
 * Whether the app shell is holding uploads.
 *
 * Injected as a window global by the native side (see mobile
 * `injectionScripts.ts`), the same way the debug-mode unlock crosses that
 * boundary. This is a native-owned signal independent of `log.upload.hold` (the app's own debug
 * menu does not yet write through the generic shell KV bridge — see ADR-0079 config-registry-track
 * "모바일 debugSettingsStore 통합"), so each stays truthful about the lever it actually controls.
 * Either one being on holds — a hold is a hold, whoever asked for it.
 */
export const isLogUploadHeldByApp = (): boolean =>
    (window as unknown as { CHATIC_APP_LOG_UPLOAD_HOLD?: boolean }).CHATIC_APP_LOG_UPLOAD_HOLD === true;

/** Whether batches stay in the queue instead of being sent. */
export const isLogUploadHeld = (): boolean => config.get<boolean>('log.upload.hold') === true || isLogUploadHeldByApp();

/**
 * Flips the web-owned hold. The app's injected flag is not writable from here —
 * that toggle belongs to the app's debug menu, and pretending otherwise would
 * leave the UI claiming it turned off a hold that is still on.
 */
export const setLogUploadHold = (hold: boolean): void => {
    config.set('log.upload.hold', hold, { lane: 'local' });
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
        // Checked before the forced-on override on purpose: forcing answers "the build
        // disabled this, send anyway", which is not an answer to a hold someone
        // switched on just now. Letting it win would make the hold toggle
        // silently do nothing on exactly the devices being debugged.
        if (isLogUploadHeld()) return false;

        const enabled = config.snapshot<boolean>('log.upload.enabled');
        if (enabled?.isOverridden) return enabled.value === true;
        return !disabledByBuild;
    };
