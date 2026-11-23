import { useAppVisibility } from './useAppVisibility';

export const useAppForeground = (handler: () => void): void => {
    useAppVisibility(isForeground => {
        if (isForeground) handler();
    });
};
