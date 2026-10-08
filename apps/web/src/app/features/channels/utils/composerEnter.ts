const MOBILE_USER_AGENT = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;

// A mouse or trackpad drives the page. Asked of the primary pointer, so a phone that merely has a
// stylus or a paired mouse somewhere does not qualify.
const FINE_POINTER_QUERY = '(hover: hover) and (pointer: fine)';

/**
 * Whether Enter in the composer means "send" on this device, as opposed to a line break.
 *
 * A touch keyboard has no Shift+Enter, so there Enter has to stay a newline and the send button
 * sends. The user agent alone cannot tell: the iOS app running on a Mac — and an iPad on a
 * trackpad — still reports itself as an iPad while every key comes from a hardware keyboard. The
 * pointer is the better witness, so a mobile user agent only keeps Enter as a newline when nothing
 * finer than a finger drives the page.
 */
export const enterSendsMessage = (): boolean => {
    if (!MOBILE_USER_AGENT.test(navigator.userAgent)) return true;
    return window.matchMedia?.(FINE_POINTER_QUERY).matches === true;
};

/**
 * Whether this composer keydown should send the message: Enter without Shift, outside an IME
 * composition (that Enter only commits the composing syllable), on a device where Enter sends.
 */
export const isSendKey = (event: Pick<KeyboardEvent, 'key' | 'shiftKey' | 'isComposing'>): boolean =>
    event.key === 'Enter' && !event.shiftKey && !event.isComposing && enterSendsMessage();
