import { logger } from '@chatic/logger';
import { Coalescer, Throttle } from '@chatic/auth';
import { getRelaySessionUser, getSessionAuthSnapshot, subscribeSessionSignal } from '@chatic/session';
import { userGateway } from '@chatic/transport';

import { foregroundPlatform } from '../session/foreground';
import { PushRegistrationRecord, type NativeRecordMirror, type RegistrationIdentity } from './registrationRecord';

export interface DeviceTokenDelegate {
    fetchDeviceToken: () => Promise<string | null>;
    platform: string;
    installId?: string;
    application?: string;
    stage?: string;
    subscribeTokenChange?: (onChange: () => void) => () => void;
    nativeRecordMirror?: NativeRecordMirror;
}

export interface PushDeviceIds {
    deviceId: string | null | undefined;
    firebaseInstallationId?: string;
}

export interface PushRegistrationOptions {
    delegate: () => DeviceTokenDelegate | null;
    deviceIds: () => PushDeviceIds;
}

type RegisterReason = 'auth' | 'focus' | 'token-change';

const DEFAULT_APPLICATION = 'chatic';
const BURST_FLOOR_MS = 60_000;

const isAuthenticated = (): boolean => getSessionAuthSnapshot().isAuthenticated;

export class PushRegistration {
    private readonly attempt = new Coalescer<void>();
    private readonly floor = new Throttle({ intervalMs: BURST_FLOOR_MS });
    private readonly record = new PushRegistrationRecord();
    private liveStarts = 0;

    constructor(private readonly options: PushRegistrationOptions) {}

    start(): () => void {
        const foreground = foregroundPlatform.ports();
        this.liveStarts += 1;
        let stopped = false;

        const registerOnAuth = (): void => {
            if (stopped || !isAuthenticated()) return;
            this.floor.reset();
            this.register('auth');
        };
        registerOnAuth();
        let wasAuthenticated = isAuthenticated();
        const unsubscribeSession = subscribeSessionSignal(() => {
            const now = isAuthenticated();
            const signedIn = !wasAuthenticated && now;
            wasAuthenticated = now;
            if (signedIn) void Promise.resolve().then(registerOnAuth);
        });

        const unsubscribeForeground = foreground.subscribe(() => this.notifyForeground());

        const subscribeTokenChange = this.options.delegate()?.subscribeTokenChange;
        const unsubscribeTokenChange = subscribeTokenChange
            ? subscribeTokenChange(() => {
                  if (stopped) return;
                  this.floor.reset();
                  this.register('token-change');
              })
            : () => undefined;

        return () => {
            if (stopped) return;
            stopped = true;
            this.liveStarts -= 1;
            unsubscribeSession();
            unsubscribeForeground();
            unsubscribeTokenChange();
        };
    }

    notifyForeground(): void {
        if (this.liveStarts === 0 || !foregroundPlatform.ports().read()) return;
        this.register('focus');
    }

    private resolveIdentity(platform: string): RegistrationIdentity | null {
        const user = getRelaySessionUser() as { id?: string; uid?: string } | null;
        const uid = user?.id ?? user?.uid;
        const deviceId = this.options.deviceIds().deviceId;
        if (!uid || !deviceId) return null;
        return { uid, deviceId, platform };
    }

    private register(reason: RegisterReason): void {
        const delegate = this.options.delegate();
        if (!delegate || !isAuthenticated()) return;

        const identity = this.resolveIdentity(delegate.platform);

        if (reason === 'focus' && identity && this.record.read(identity)) return;

        if (!this.floor.tryAcquire()) return;

        void this.attempt.run(() =>
            Promise.all([this.record.hydrate(delegate.nativeRecordMirror), delegate.fetchDeviceToken()])
                .then(([, deviceToken]) => {
                    if (!deviceToken) throw new Error('empty device token');
                    if (identity && this.record.read(identity) === deviceToken) return undefined;
                    const { deviceId, firebaseInstallationId } = this.options.deviceIds();
                    return userGateway()
                        .registerDevice(
                            {
                                deviceId: deviceId ?? undefined,
                                deviceToken,
                                platform: delegate.platform,
                                installId: delegate.installId ?? firebaseInstallationId,
                                application: delegate.application ?? DEFAULT_APPLICATION,
                                stage: delegate.stage,
                            },
                            { force: true }
                        )
                        .then(() => {
                            if (identity) this.record.write(identity, deviceToken, delegate.nativeRecordMirror);
                        });
                })
                .then(() => undefined)
                .catch((error: unknown) => {
                    this.floor.reset();
                    const emptyToken = error instanceof Error && error.message === 'empty device token';
                    const context = { error, data: { reason, platform: delegate.platform } };
                    if (emptyToken) logger.debug('NOTIFICATION', '[PushRegistration] no device token yet', context);
                    else logger.warn('NOTIFICATION', '[PushRegistration] registration did not go through', context);
                })
        );
    }
}
