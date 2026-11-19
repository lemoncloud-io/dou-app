import { engineMirror, settleSessionOwner } from '@chatic/runtime-web';
import type { SessionOwnerChoice, SessionOwnerOptions } from '@chatic/runtime-web';

import { setLaunchSessionOwner } from '../../app/runtime/launchSessionOwner';

/**
 * Settles who holds the session, as `engine.mirror` does by default, and records the answer for the
 * log context and the performance pipeline the moment it is known. The entry used to record it before
 * it booted the runtime, so every line the boot logs carried it; the engine now boots inside
 * `startRuntime`, and this is the last point before that boot that knows the owner.
 */
export const settleAndRecordOwner = async (options: SessionOwnerOptions): Promise<SessionOwnerChoice> => {
    const choice = await settleSessionOwner(options);
    setLaunchSessionOwner(choice.sessionOwner ?? undefined);
    return choice;
};

/**
 * `engine.mirror` for a page inside a shell: it mirrors the shell's runtime when the shell takes the
 * session, and runs its own otherwise. `disabled` is the web's own switch to stop asking
 * (`VITE_SESSION_MIRROR_DISABLED`).
 */
export const engineMirrorRecorded = (disabled: boolean) => engineMirror({ disabled, settle: settleAndRecordOwner });
