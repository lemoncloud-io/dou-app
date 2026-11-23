import { transportPlatform } from '../platform';
import { getSocketManager } from './runtime';

export interface LinkSignals {
    isBrowserOnline: boolean;
    hasVerifiedSocket: boolean;
}

export const isLinkDown = ({ isBrowserOnline, hasVerifiedSocket }: LinkSignals): boolean =>
    !isBrowserOnline && !hasVerifiedSocket;

export const readOnline = (): boolean => transportPlatform.ports().online.read();

export const subscribeOnline = (listener: () => void): (() => void) =>
    transportPlatform.ports().online.subscribe(listener);

export const hasAnyVerifiedSocket = (): boolean => {
    const manager = getSocketManager();
    return manager.getSlotKeys().some(key => manager.isSlotVerified(key));
};

export const isLinkKnownDown = (): boolean =>
    !readOnline() && isLinkDown({ isBrowserOnline: false, hasVerifiedSocket: hasAnyVerifiedSocket() });
