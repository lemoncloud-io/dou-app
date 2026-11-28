import type { MiniAppLaunchParams } from '@chatic/bridge-messages';

import type { MiniAppLink } from './miniAppLinks';
import type { SubWebViewTrust } from './subWebViewTrust';

export interface MiniAppLaunchInput {
    cloud: { id: string; name: string };
    place: { id: string; name: string } | null;
    user: { id: string; placeNick?: string | null; profileName?: string | null };
    isOwner: boolean;
    miniApps?: readonly MiniAppLink[];
}

export const MINI_APP_NAME_LIMIT = 200;

const nameOf = (value: string | null | undefined): string => {
    const trimmed = value?.trim() ?? '';
    const chars = Array.from(trimmed);
    return chars.length > MINI_APP_NAME_LIMIT ? chars.slice(0, MINI_APP_NAME_LIMIT).join('') : trimmed;
};

export const buildMiniAppLaunchParams = (input: MiniAppLaunchInput, trust: SubWebViewTrust): MiniAppLaunchParams => {
    const name = nameOf(input.user.placeNick) || nameOf(input.user.profileName);
    const base = {
        cloud: { id: input.cloud.id, name: nameOf(input.cloud.name) },
        place: input.place ? { id: input.place.id, name: nameOf(input.place.name) } : null,
    };
    if (trust !== 'firstParty') return { ...base, user: { id: input.user.id, name } };
    return {
        ...base,
        user: { id: input.user.id, name, isOwner: input.isOwner },
        miniApps: (input.miniApps ?? []).map(link => ({ id: link.id, name: link.name, host: new URL(link.url).host })),
    };
};
