const MOBILE_USER_AGENT = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;

const FINE_POINTER_QUERY = '(hover: hover) and (pointer: fine)';

export const typesOnSoftKeyboard = (): boolean => {
    if (!MOBILE_USER_AGENT.test(navigator.userAgent)) return false;
    return window.matchMedia?.(FINE_POINTER_QUERY).matches !== true;
};
