import { typesOnSoftKeyboard } from '../../../utils/softKeyboard';

export const enterSendsMessage = (): boolean => !typesOnSoftKeyboard();

export const isSendKey = (event: Pick<KeyboardEvent, 'key' | 'shiftKey' | 'isComposing'>): boolean =>
    event.key === 'Enter' && !event.shiftKey && !event.isComposing && enterSendsMessage();
