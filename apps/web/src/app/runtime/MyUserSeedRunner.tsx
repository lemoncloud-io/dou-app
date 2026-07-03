import { useSeedMyUserCache } from '../hooks/useSeedMyUserCache';

/**
 * Headless runner: seeds the user cache from the session profile so profile readers (useMyUser)
 * never flash empty before the observed cache emits. Renders nothing.
 */
export const MyUserSeedRunner = (): null => {
    useSeedMyUserCache();
    return null;
};
