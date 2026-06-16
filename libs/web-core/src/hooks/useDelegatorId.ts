import { useWebCoreStore } from '../stores/useWebCoreStore';

export const useDelegatorId = (): string | null => {
    return useWebCoreStore(s => s.delegatorId);
};
