import { useSeedMyUserCache } from '../hooks/useSeedMyUserCache';

export const MyUserSeedRunner = (): null => {
    useSeedMyUserCache();
    return null;
};
