const MOBILE_USER_AGENT = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;

// A mouse or trackpad drives the page. Asked of the primary pointer, so a phone that merely has a
// stylus or a paired mouse somewhere does not qualify.
const FINE_POINTER_QUERY = '(hover: hover) and (pointer: fine)';

/**
 * Whether typing here happens on the on-screen (soft) keyboard rather than a hardware one.
 *
 * The user agent alone cannot tell: the iOS app running on a Mac — and an iPad on a trackpad —
 * still reports itself as an iPad while every key comes from a hardware keyboard. The pointer is
 * the better witness, so a mobile user agent only counts as a soft keyboard when nothing finer than
 * a finger drives the page.
 */
export const typesOnSoftKeyboard = (): boolean => {
    if (!MOBILE_USER_AGENT.test(navigator.userAgent)) return false;
    return window.matchMedia?.(FINE_POINTER_QUERY).matches !== true;
};
