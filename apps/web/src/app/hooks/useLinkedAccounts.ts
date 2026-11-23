import { useMyUser } from './useMyUser';

export type LinkedState = 'linked' | 'absent' | 'unknown';

export interface LinkedAccounts {
    phone: LinkedState;
    social: LinkedState;
    phoneHint?: string;
    socialProvider?: string;
}

export const useLinkedAccounts = (): LinkedAccounts => {
    const me = useMyUser();

    if (!me?.link$) return { phone: 'unknown', social: 'unknown' };

    const { phone, social } = me.link$;
    return {
        phone: phone ? 'linked' : 'absent',
        social: social ? 'linked' : 'absent',
        phoneHint: phone?.hint,
        socialProvider: social?.provider,
    };
};
