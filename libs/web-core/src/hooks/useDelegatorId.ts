import { useSessionIdentity } from '../session';

export const useDelegatorId = (): string | null => {
    return useSessionIdentity().delegatorId;
};
