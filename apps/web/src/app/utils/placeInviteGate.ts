export type PlaceInviteGate = 'hidden' | 'disabled' | 'ready';

export interface PlaceInviteGateInput {
    isExperimentEnabled: boolean;
    isDefaultCloud: boolean;
    isGuest: boolean;
    place: { id: string; isOwner?: boolean } | null | undefined;
    sessionSiteId: string | null | undefined;
    isSwitching?: boolean;
}

export const resolvePlaceInviteGate = ({
    isExperimentEnabled,
    isDefaultCloud,
    isGuest,
    place,
    sessionSiteId,
    isSwitching = false,
}: PlaceInviteGateInput): PlaceInviteGate => {
    if (!isExperimentEnabled || isDefaultCloud || isGuest || place?.isOwner !== true) return 'hidden';
    if (isSwitching || place.id !== sessionSiteId) return 'disabled';
    return 'ready';
};
