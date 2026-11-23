import type { SlotKey } from '@chatic/transport';
import type { AuthRegistration } from '../session/sessionAuthAdapter';

export interface SocketSessionDelegate {
    getAuthRegistration(slot: SlotKey): Promise<AuthRegistration | null>;
    signAuth(slot: SlotKey, token: string, target?: string): Promise<{ signature: string; current: string }>;
    commitRefreshedToken(slot: SlotKey, view: unknown): Promise<void> | void;
    onAuthExpired?(slot: SlotKey): Promise<void> | void;
    onAuthenticated?(slot: SlotKey): Promise<void> | void;
}

export type ReauthDelegate = Pick<SocketSessionDelegate, 'getAuthRegistration' | 'signAuth'>;
