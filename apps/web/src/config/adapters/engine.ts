import { engineMirror, settleSessionOwner } from '@chatic/runtime-web';
import type { SessionOwnerChoice, SessionOwnerOptions } from '@chatic/runtime-web';

import { setLaunchSessionOwner } from '../../app/runtime/launchSessionOwner';

export const settleAndRecordOwner = async (options: SessionOwnerOptions): Promise<SessionOwnerChoice> => {
    const choice = await settleSessionOwner(options);
    setLaunchSessionOwner(choice.sessionOwner ?? undefined);
    return choice;
};

export const engineMirrorRecorded = (disabled: boolean) => engineMirror({ disabled, settle: settleAndRecordOwner });
