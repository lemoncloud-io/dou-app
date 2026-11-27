import { hostProfile } from '@chatic/bridges';
import type { HostProfile } from '@chatic/bridges';
import type { WebHostFacts } from '@chatic/runtime-web';

export type { WebHostFacts } from '@chatic/runtime-web';

export interface WebHostFactsSources {
    profile?: HostProfile;
}

export const readWebHostFacts = ({ profile = hostProfile() }: WebHostFactsSources = {}): WebHostFacts =>
    Object.freeze({
        bridge: profile.bridge,
        platform: profile.globals.CHATIC_APP_PLATFORM,
        storageMedia: profile.storageMedia,
        runtimeOffer: profile.runtimeOffer,
        capabilities: profile.capabilities,
    });
