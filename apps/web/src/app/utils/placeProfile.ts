import { logger } from '@chatic/bridges';
import type { DomainProfile } from '@chatic/runtime-react';

export interface MyPlaceProfileReader {
    getMyProfile(): Promise<DomainProfile | null>;
}

export const isPlaceProfileAbsent = async (reader: MyPlaceProfileReader): Promise<boolean> => {
    let profile: DomainProfile | null;
    try {
        profile = await reader.getMyProfile();
    } catch (error) {
        logger.warn('PROFILE', '[isPlaceProfileAbsent] get-mine failed; treating the profile as present', { error });
        return false;
    }

    if (profile?.nick?.trim()) return false;
    return profile?.active === false;
};
