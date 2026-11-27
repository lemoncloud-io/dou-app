import { engineCandidates, engineLocal, engineShell, settleSessionOwner } from '@chatic/runtime-hybrid-web';
import type { SessionOwnerChoice, SessionOwnerOptions } from '@chatic/runtime-hybrid-web';

import { setLaunchSessionOwner } from '../../app/runtime/launchSessionOwner';

export const settleAndRecordOwner = async (options: SessionOwnerOptions): Promise<SessionOwnerChoice> => {
    const choice = await settleSessionOwner(options);
    setLaunchSessionOwner(choice.sessionOwner ?? undefined);
    return choice;
};

export const engineMirrorRecorded = (disabled: boolean) =>
    engineCandidates('engine.mirror', [engineShell({ disabled, settle: settleAndRecordOwner }), engineLocal]);
