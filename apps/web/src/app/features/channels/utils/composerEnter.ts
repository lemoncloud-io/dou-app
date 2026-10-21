import { typesOnSoftKeyboard } from '../../../utils/softKeyboard';

/**
 * Whether Enter in the composer means "send" on this device, as opposed to a line break.
 *
 * A touch keyboard has no Shift+Enter, so there Enter has to stay a newline and the send button
 * sends.
 */
export const enterSendsMessage = (): boolean => !typesOnSoftKeyboard();

/**
 * Whether this composer keydown should send the message: Enter without Shift, outside an IME
 * composition (that Enter only commits the composing syllable), on a device where Enter sends.
 */
export const isSendKey = (event: Pick<KeyboardEvent, 'key' | 'shiftKey' | 'isComposing'>): boolean =>
    event.key === 'Enter' && !event.shiftKey && !event.isComposing && enterSendsMessage();
