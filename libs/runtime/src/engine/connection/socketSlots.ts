import { logger } from '@chatic/logger';
import { RELAY_CLOUD_ID } from '@chatic/data';
import { getCommittedCloudId, getSocketSlotContext } from '@chatic/session';

import type { RuntimeSocketSlot, RuntimeSocketSlots } from './types';
import { readyBackgroundConfigs } from './backgroundSlots';

type SlotContext = ReturnType<typeof getSocketSlotContext>;

const relaySlotOf = (
    deviceId: string | null | undefined,
    relay: SlotContext['relay']
): RuntimeSocketSlot | undefined =>
    deviceId && relay.wss && relay.identityToken
        ? {
              config: { url: relay.wss, deviceId, wssType: 'relay' as const, cid: RELAY_CLOUD_ID },
              identityToken: relay.identityToken,
          }
        : undefined;

export const hasRelaySlot = (deviceId: string | null | undefined): boolean =>
    relaySlotOf(deviceId, getSocketSlotContext().relay) !== undefined;

export const deriveSocketSlots = (deviceId: string | null | undefined): RuntimeSocketSlots => {
    const { relay, cloud } = getSocketSlotContext();

    const relaySlot = relaySlotOf(deviceId, relay);
    const committedCloudId = getCommittedCloudId();
    const cloudActive = !!(deviceId && cloud.isActive && cloud.wss && cloud.identityToken);
    if (cloudActive && !committedCloudId) {
        logger.warn('SOCKET', '[deriveSocketSlots] cloud session is active but no cloud is committed — no cloud slot');
    }
    const cloudSlot =
        deviceId && cloudActive && committedCloudId && cloud.wss
            ? {
                  config: {
                      url: cloud.wss,
                      deviceId,
                      wssType: 'cloud' as const,
                      cid: committedCloudId,
                  },
              }
            : undefined;

    const background = deviceId && relaySlot ? readyBackgroundConfigs(deviceId).map(config => ({ config })) : [];

    return { relay: relaySlot, cloud: cloudSlot, background };
};
