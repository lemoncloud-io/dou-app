import { logger } from '@chatic/logger';

import { reissueCloudTokens } from '../session/cloudTokens';
import { Coalescer } from '../utils/coalescer';

import { getSocketManager, slotKeyOf } from '@chatic/transport';
import { alignSessionSite } from './alignSessionSite';
import { reauthenticateActiveSocket } from './reauthenticateActiveSocket';
import { createReauthDelegate } from './reauthDelegate';

const run = async (cid: string): Promise<boolean> => {
    let landedSiteId: string | undefined;
    try {
        landedSiteId = (await reissueCloudTokens(cid)).cloudToken.$site?.id;
    } catch (error) {
        logger.warn('SESSION', '[renewCloudSession] cloud token re-issue failed', { error, data: { cid } });
        return false;
    }

    try {
        await reauthenticateActiveSocket({
            manager: getSocketManager(),
            delegate: createReauthDelegate(),
            slot: slotKeyOf(cid),
        });
    } catch (error) {
        logger.warn('SOCKET', '[renewCloudSession] cloud socket re-registration failed', { error, data: { cid } });
    }
    await alignSessionSite(cid, landedSiteId);
    return true;
};

const coalescers = new Map<string, Coalescer<boolean>>();

const coalescerFor = (cid: string): Coalescer<boolean> => {
    let coalescer = coalescers.get(cid);
    if (!coalescer) {
        coalescer = new Coalescer<boolean>();
        coalescers.set(cid, coalescer);
    }
    return coalescer;
};

export const renewCloudSession = (cid: string): Promise<boolean> => coalescerFor(cid).run(() => run(cid));
