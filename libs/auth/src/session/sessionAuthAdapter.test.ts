import { transportPlatform } from '@chatic/transport/platform';
import { fakeTransportPorts } from '@chatic/transport/testing/platform';
import type { UserTokenView } from '@lemoncloud/chatic-backend-api';

import { RELAY_CLOUD_ID } from '@chatic/data';

import { sessionAuthAdapter } from './sessionAuthAdapter';

const mockGetDelegationToken = jest.fn();
const mockSaveCloudToken = jest.fn();
const mockGetCloudToken = jest.fn();
const mockGetCloudTokenOf = jest.fn();
const mockPeekCachedCloudTokens = jest.fn();
const mockSetCachedCloudTokens = jest.fn();
const mockSetCloudIdentity = jest.fn();
const mockGetSelectedSiteId = jest.fn();
const mockGetIdentityToken = jest.fn();
const mockRebuildSessionIdentity = jest.fn();

const RELAY = RELAY_CLOUD_ID;
const CLOUD = 'cloud-1';

const mockRelaySaveRelayToken = jest.fn();
const mockRelayGetRelayToken = jest.fn();
const mockRelayGetIdentityToken = jest.fn();

const mockGetActiveServerContext = jest.fn();
const mockCalcSignature = jest.fn();

const mockNotifySessionStateChanged = jest.fn();
const mockLoggerWarn = jest.fn();

jest.mock('../signing', () => ({
    LemonHmacSigner: class {
        sign(payload: unknown, context: { current: string; userAgent: string }) {
            return {
                signature: mockCalcSignature(payload, context.current, context.userAgent),
                current: context.current,
            };
        }
    },
}));

jest.mock('@chatic/session/store/stores', () => ({
    cloudStore: {
        saveDelegationToken: jest.fn(),
        getDelegationToken: (...args: unknown[]) => mockGetDelegationToken(...args),
        saveCloudToken: (...args: unknown[]) => mockSaveCloudToken(...args),
        getCloudToken: (...args: unknown[]) => mockGetCloudToken(...args),
        getCloudTokenOf: (...args: unknown[]) => mockGetCloudTokenOf(...args),
        getCachedCloudTokens: jest.fn(),
        peekCachedCloudTokens: (...args: unknown[]) => mockPeekCachedCloudTokens(...args),
        setCachedCloudTokens: (...args: unknown[]) => mockSetCachedCloudTokens(...args),
        setCloudIdentity: (...args: unknown[]) => mockSetCloudIdentity(...args),
        saveSelectedCloudId: jest.fn(),
        getSelectedCloudId: jest.fn(),
        saveSelectedSiteId: jest.fn(),
        getSelectedSiteId: (...args: unknown[]) => mockGetSelectedSiteId(...args),
        clearSelectedSite: jest.fn(),
        clearDelegationToken: jest.fn(),
        clearSession: jest.fn(),
        getIdentityToken: (...args: unknown[]) => mockGetIdentityToken(...args),
        getBackend: jest.fn(),
        getWss: jest.fn(),
    },
    identityStore: {
        setDelegatorId: jest.fn(),
        setDeviceId: jest.fn(),
    },
    relayStore: {
        clearSelectedSite: jest.fn(),
        saveRelayToken: (...args: unknown[]) => mockRelaySaveRelayToken(...args),
        getRelayToken: (...args: unknown[]) => mockRelayGetRelayToken(...args),
        getIdentityToken: (...args: unknown[]) => mockRelayGetIdentityToken(...args),
    },
}));

jest.mock('@chatic/session/store', () => ({
    getCloudSessionSnapshot: jest.fn(),
    getActiveServerContext: (...args: unknown[]) => mockGetActiveServerContext(...args),
    setSessionIdentityState: jest.fn(),
    setSessionAuthenticated: jest.fn(),
    setSelectedSiteId: jest.fn(),
    getSelectedSiteId: (...args: unknown[]) => mockGetSelectedSiteId(...args),
    clearRelaySession: jest.fn(),
    rebuildSessionIdentity: (...args: unknown[]) => mockRebuildSessionIdentity(...args),
    sessionSignal: {
        emit: (...args: unknown[]) => mockNotifySessionStateChanged(...args),
        batch: (fn: () => unknown) => fn(),
        subscribe: jest.fn(() => () => undefined),
        registerInvalidator: jest.fn(),
    },
}));

jest.mock('@chatic/logger', () => ({
    ...jest.requireActual('@chatic/logger'),
    logger: {
        debug: jest.fn(),
        info: jest.fn(),
        error: jest.fn(),
        warn: (...args: unknown[]) => mockLoggerWarn(...args),
    },
}));

beforeEach(() => transportPlatform.configure(fakeTransportPorts()));

describe('session/auth/sessionAuthAdapter · per-server bridge helpers', () => {
    beforeEach(() => {
        jest.resetAllMocks();
        localStorage.clear();
    });

    it('getAuthRegistration seeds the authId per server (relay: $auth.id, a cloud: Token.authId)', async () => {
        mockRelayGetIdentityToken.mockReturnValue('relay-identity-token');
        mockRelayGetRelayToken.mockReturnValue({
            $auth: { id: 'relay-auth-id' },
            Token: { authId: 'http-id', accountId: 'relay-acct', identityId: 'relay-iid' },
        });
        await expect(sessionAuthAdapter.getAuthRegistration(RELAY)).resolves.toEqual({
            token: 'relay-identity-token',
            authId: 'relay-auth-id',
            signing: { accountId: 'relay-acct', identityId: 'relay-iid' },
        });

        mockGetCloudTokenOf.mockReturnValue({
            $auth: { id: 'cloud-auth-id' },
            Token: {
                authId: 'http-id',
                accountId: 'cloud-acct',
                identityId: 'cloud-iid',
                identityToken: 'cloud-identity-token',
            },
        });
        await expect(sessionAuthAdapter.getAuthRegistration(CLOUD)).resolves.toEqual({
            token: 'cloud-identity-token',
            authId: 'http-id',
            signing: { accountId: 'cloud-acct', identityId: 'cloud-iid' },
        });
        expect(mockGetCloudTokenOf).toHaveBeenCalledWith(CLOUD);
        expect(mockGetCloudToken).not.toHaveBeenCalled();

        expect(mockGetActiveServerContext).not.toHaveBeenCalled();
    });

    it('getAuthRegistration is null for a cloud with no token anywhere — register is deferred, not half-seeded', async () => {
        mockGetCloudTokenOf.mockReturnValue(null);

        await expect(sessionAuthAdapter.getAuthRegistration('cloud-9')).resolves.toBeNull();
    });

    it('sessionAuthAdapter.signAuth(cloud)는 Token.authId를 HMAC 키로 서명하고 target은 서명을 바꾸지 않는다', async () => {
        mockGetCloudTokenOf.mockReturnValue({
            $auth: { id: 'cloud-auth-id' },
            Token: { authId: 'http-id', accountId: 'acct', identityId: 'ident', identityToken: 'jwt' },
        });
        mockCalcSignature.mockReturnValue('cloud-sig');

        await sessionAuthAdapter.signAuth(CLOUD, 'uid@sid');

        expect(mockCalcSignature).toHaveBeenCalledWith(
            { authId: 'http-id', accountId: 'acct', identityId: 'ident' },
            expect.any(String),
            expect.any(String)
        );
        expect(mockGetActiveServerContext).not.toHaveBeenCalled();
        expect(mockGetCloudTokenOf).toHaveBeenCalledWith(CLOUD);
    });

    it('signAuth for a cloud with no token throws rather than signing with blanks', async () => {
        mockGetCloudTokenOf.mockReturnValue(null);

        await expect(sessionAuthAdapter.signAuth(CLOUD)).rejects.toThrow('Missing cloud token fields');
    });

    it("signs over the transport device port's user agent, not the page's navigator", async () => {
        transportPlatform.configure(fakeTransportPorts({ device: () => ({ userAgent: 'UA-from-the-port' }) }));
        mockRelayGetRelayToken.mockReturnValue({
            $auth: { id: 'relay-auth-id' },
            Token: { authId: 'http-id', accountId: 'r-acct', identityId: 'r-ident', identityToken: 'jwt' },
        });
        mockGetCloudTokenOf.mockReturnValue({
            Token: { authId: 'c-auth', accountId: 'c-acct', identityId: 'c-ident' },
        });

        await sessionAuthAdapter.signAuth(RELAY);
        await sessionAuthAdapter.signAuth(CLOUD);

        expect(mockCalcSignature.mock.calls.map(call => call[2])).toEqual(['UA-from-the-port', 'UA-from-the-port']);
    });

    it("signs over '' when the device port reports no user agent, and says so once", async () => {
        transportPlatform.configure(fakeTransportPorts({ device: () => ({}) }));
        mockRelayGetRelayToken.mockReturnValue({
            $auth: { id: 'relay-auth-id' },
            Token: { authId: 'http-id', accountId: 'r-acct', identityId: 'r-ident', identityToken: 'jwt' },
        });

        await sessionAuthAdapter.signAuth(RELAY);
        await sessionAuthAdapter.signAuth(RELAY);

        expect(mockCalcSignature.mock.calls.map(call => call[2])).toEqual(['', '']);
        const warnings = mockLoggerWarn.mock.calls.filter(([, message]) => String(message).includes('no user agent'));
        expect(warnings).toHaveLength(1);
    });

    it('sessionAuthAdapter.signAuth(relay)는 Token.authId가 아니라 $auth.id로 서명한다 (getTokenSignature 미사용)', async () => {
        mockRelayGetRelayToken.mockReturnValue({
            $auth: { id: 'relay-auth-id' },
            Token: { authId: 'http-id', accountId: 'r-acct', identityId: 'r-ident', identityToken: 'jwt' },
        });
        mockCalcSignature.mockReturnValue('relay-sig');

        const result = await sessionAuthAdapter.signAuth(RELAY);

        expect(mockCalcSignature).toHaveBeenCalledWith(
            { authId: 'relay-auth-id', accountId: 'r-acct', identityId: 'r-ident' },
            expect.any(String),
            expect.any(String)
        );
        expect(result.signature).toBe('relay-sig');
    });

    it('sessionAuthAdapter.signAuth(relay)는 accountId 를 $auth 에서 읽는다', async () => {
        mockRelayGetRelayToken.mockReturnValue({
            $auth: { id: 'relay-auth-id', accountId: 'from-auth' },
            Token: { accountId: 'from-token', identityId: 'r-ident' },
        });
        mockCalcSignature.mockReturnValue('sig');

        await sessionAuthAdapter.signAuth(RELAY);

        expect(mockCalcSignature).toHaveBeenCalledWith(
            expect.objectContaining({ accountId: 'from-auth' }),
            expect.any(String),
            expect.any(String)
        );
    });

    it('sessionAuthAdapter.signAuth(relay)는 $auth 에 accountId 가 없으면 Token 으로 폴백한다', async () => {
        mockRelayGetRelayToken.mockReturnValue({
            $auth: { id: 'relay-auth-id' },
            Token: { accountId: 'from-token', identityId: 'r-ident' },
        });
        mockCalcSignature.mockReturnValue('sig');

        await sessionAuthAdapter.signAuth(RELAY);

        expect(mockCalcSignature).toHaveBeenCalledWith(
            expect.objectContaining({ accountId: 'from-token' }),
            expect.any(String),
            expect.any(String)
        );
    });

    it('sessionAuthAdapter.signAuth(relay)는 $auth 와 Token 의 accountId 가 다르면 경고하고 $auth 를 쓴다', async () => {
        mockRelayGetRelayToken.mockReturnValue({
            $auth: { id: 'relay-auth-id', accountId: 'from-auth' },
            Token: { accountId: 'DIFFERENT', identityId: 'r-ident' },
        });
        mockCalcSignature.mockReturnValue('sig');

        await sessionAuthAdapter.signAuth(RELAY);

        expect(mockLoggerWarn).toHaveBeenCalledWith(
            'AUTH',
            '[signAuth] relay accountId differs between $auth and Token',
            expect.objectContaining({ data: expect.objectContaining({ auth: 'from-auth', token: 'DIFFERENT' }) })
        );
        expect(mockCalcSignature).toHaveBeenCalledWith(
            expect.objectContaining({ accountId: 'from-auth' }),
            expect.any(String),
            expect.any(String)
        );
    });

    it('sessionAuthAdapter.signAuth(relay)는 일치하면 경고하지 않는다', async () => {
        mockRelayGetRelayToken.mockReturnValue({
            $auth: { id: 'relay-auth-id', accountId: 'same' },
            Token: { accountId: 'same', identityId: 'r-ident' },
        });
        mockCalcSignature.mockReturnValue('sig');

        await sessionAuthAdapter.signAuth(RELAY);

        expect(mockLoggerWarn).not.toHaveBeenCalledWith(
            'AUTH',
            '[signAuth] relay accountId differs between $auth and Token',
            expect.anything()
        );
    });

    it('sessionAuthAdapter.signAuth(relay)는 $auth.id가 없으면 던진다', async () => {
        mockRelayGetRelayToken.mockReturnValue({ Token: { accountId: 'a', identityId: 'i' } });

        await expect(sessionAuthAdapter.signAuth(RELAY)).rejects.toThrow('Missing relay token fields');
    });

    it('commitServerRefreshedToken(relay)는 view에 identityToken이 있으면 그대로 relay store에 쓴다 (§6-6)', async () => {
        mockRelayGetRelayToken.mockReturnValue(null);
        const view = {
            id: 'u',
            Token: { identityToken: 'fresh', credential: { AccessKeyId: 'k', SecretKey: 's' } },
        } as unknown as UserTokenView;

        await sessionAuthAdapter.commitRefreshedToken(RELAY, view);

        expect(mockRelaySaveRelayToken).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'u', Token: expect.objectContaining({ identityToken: 'fresh' }) })
        );
        expect(mockSaveCloudToken).not.toHaveBeenCalled();
        expect(mockGetActiveServerContext).not.toHaveBeenCalled();
    });

    it('commitServerRefreshedToken(relay)는 refresh view가 identityToken을 생략하면 저장된 값을 보존한다', async () => {
        mockRelayGetRelayToken.mockReturnValue({ Token: { identityToken: 'kept', accountId: 'a' } } as UserTokenView);
        const view = {
            id: 'u',
            Token: { credential: { AccessKeyId: 'k', SecretKey: 's' } },
        } as unknown as UserTokenView;

        await sessionAuthAdapter.commitRefreshedToken(RELAY, view);

        expect(mockRelaySaveRelayToken).toHaveBeenCalledWith(
            expect.objectContaining({
                Token: expect.objectContaining({
                    identityToken: 'kept',
                    credential: { AccessKeyId: 'k', SecretKey: 's' },
                }),
            })
        );
    });

    it('commitServerRefreshedToken(relay)는 refresh view가 identityPoolId를 생략하면 저장된 값을 보존한다', async () => {
        mockRelayGetRelayToken.mockReturnValue({
            Token: { identityToken: 'kept', identityPoolId: 'pool-1' },
        } as UserTokenView);
        const view = {
            id: 'u',
            Token: { credential: { AccessKeyId: 'k', SecretKey: 's' } },
        } as unknown as UserTokenView;

        await sessionAuthAdapter.commitRefreshedToken(RELAY, view);

        expect(mockRelaySaveRelayToken).toHaveBeenCalledWith(
            expect.objectContaining({ Token: expect.objectContaining({ identityPoolId: 'pool-1' }) })
        );
    });

    it('commitServerRefreshedToken(relay)는 view가 identityPoolId를 주면 그 값을 쓴다', async () => {
        mockRelayGetRelayToken.mockReturnValue({ Token: { identityPoolId: 'old' } } as UserTokenView);
        const view = { Token: { identityToken: 't', identityPoolId: 'new' } } as unknown as UserTokenView;

        await sessionAuthAdapter.commitRefreshedToken(RELAY, view);

        expect(mockRelaySaveRelayToken).toHaveBeenCalledWith(
            expect.objectContaining({ Token: expect.objectContaining({ identityPoolId: 'new' }) })
        );
    });

    it('keeps the store write and warns when a relay refresh view carries no credential', async () => {
        mockRelayGetRelayToken.mockReturnValue({ Token: { identityToken: 'kept' } } as UserTokenView);
        const view = { id: 'u', Token: { identityToken: 'fresh' } } as unknown as UserTokenView;

        await sessionAuthAdapter.commitRefreshedToken(RELAY, view);

        expect(mockRelaySaveRelayToken).toHaveBeenCalledWith(
            expect.objectContaining({ Token: expect.objectContaining({ identityToken: 'fresh' }) })
        );
        expect(mockLoggerWarn).toHaveBeenCalledWith(
            'AUTH',
            '[commitServerRefreshedToken] refresh view carried no AWS credential',
            expect.objectContaining({ data: expect.objectContaining({ cid: RELAY }) })
        );
    });

    it('commitServerRefreshedToken(relay)는 view에 credential이 없으면 저장된 credential을 보존한다', async () => {
        const previous = { AccessKeyId: 'k', SecretKey: 's', Expiration: '2026-09-02T01:00:00.000Z' };
        mockRelayGetRelayToken.mockReturnValue({
            Token: { identityToken: 'kept', credential: previous },
        } as unknown as UserTokenView);
        const view = { id: 'u', Token: { identityToken: 'fresh' } } as unknown as UserTokenView;

        await sessionAuthAdapter.commitRefreshedToken(RELAY, view);

        expect(mockRelaySaveRelayToken).toHaveBeenCalledWith(
            expect.objectContaining({ Token: expect.objectContaining({ credential: previous }) })
        );
    });

    it('commitServerRefreshedToken(relay)는 저장된 $auth 를 지키고 버린 사실을 재료와 함께 경고한다', async () => {
        mockRelayGetRelayToken.mockReturnValue({
            $auth: { id: 'parent-auth' },
            Token: { identityToken: 'kept' },
        } as unknown as UserTokenView);
        const view = {
            id: 'u',
            $auth: { id: 'child-auth' },
            Token: { identityToken: 'fresh', accountId: 'acct', identityId: 'iid' },
        } as unknown as UserTokenView;

        await sessionAuthAdapter.commitRefreshedToken(RELAY, view);

        expect(mockRelaySaveRelayToken).toHaveBeenCalledWith(expect.objectContaining({ $auth: { id: 'parent-auth' } }));
        expect(mockLoggerWarn).toHaveBeenCalledWith(
            'AUTH',
            '[commitServerRefreshedToken] kept the stored $auth, dropped the served one',
            expect.objectContaining({
                data: expect.objectContaining({
                    held: 'parent-auth',
                    offered: 'child-auth',
                    accountId: 'acct',
                    identityId: 'iid',
                }),
            })
        );
    });

    it('commitServerRefreshedToken(relay)는 $auth 가 그대로면 경고하지 않는다', async () => {
        mockRelayGetRelayToken.mockReturnValue({
            $auth: { id: 'same-auth' },
            Token: { identityToken: 'kept' },
        } as unknown as UserTokenView);
        const view = {
            id: 'u',
            $auth: { id: 'same-auth' },
            Token: { identityToken: 'fresh' },
        } as unknown as UserTokenView;

        await sessionAuthAdapter.commitRefreshedToken(RELAY, view);

        expect(mockLoggerWarn).not.toHaveBeenCalledWith(
            'AUTH',
            '[commitServerRefreshedToken] kept the stored $auth, dropped the served one',
            expect.anything()
        );
    });

    it('commitServerRefreshedToken(relay)는 저장된 $auth 가 없으면 뷰의 것을 받고 경고하지 않는다', async () => {
        mockRelayGetRelayToken.mockReturnValue({ Token: { identityToken: 'kept' } } as unknown as UserTokenView);
        const view = {
            id: 'u',
            $auth: { id: 'first-auth' },
            Token: { identityToken: 'fresh' },
        } as unknown as UserTokenView;

        await sessionAuthAdapter.commitRefreshedToken(RELAY, view);

        expect(mockRelaySaveRelayToken).toHaveBeenCalledWith(expect.objectContaining({ $auth: { id: 'first-auth' } }));
        expect(mockLoggerWarn).not.toHaveBeenCalledWith(
            'AUTH',
            '[commitServerRefreshedToken] kept the stored $auth, dropped the served one',
            expect.anything()
        );
    });

    it('commitServerRefreshedToken(relay)는 credential이 반쪽(SecretKey 누락)이어도 재빌드하지 않는다', async () => {
        mockRelayGetRelayToken.mockReturnValue(null);
        const view = { id: 'u', Token: { credential: { AccessKeyId: 'k' } } } as unknown as UserTokenView;

        await sessionAuthAdapter.commitRefreshedToken(RELAY, view);

        expect(mockRelaySaveRelayToken).toHaveBeenCalled();
    });

    describe('commitRefreshedToken for a cloud — where it lands is decided at write time', () => {
        const delegationToken = { cloudId: CLOUD, delegationToken: 'd', backend: 'https://c', wss: 'wss://c' };
        const view = { id: 'u', Token: { identityToken: 'new' } } as unknown as UserTokenView;

        it('the committed cloud: merges the store (single write, no credential rebuild) and re-derives identity', async () => {
            mockGetDelegationToken.mockReturnValue(delegationToken);
            mockGetCloudToken.mockReturnValue({ id: 'u', Token: { identityToken: 'old' } });

            await sessionAuthAdapter.commitRefreshedToken(CLOUD, view);

            expect(mockSaveCloudToken).toHaveBeenCalledWith(
                expect.objectContaining({ Token: { identityToken: 'new' } })
            );
            expect(mockRebuildSessionIdentity).toHaveBeenCalled();
        });

        it('the committed cloud: the per-cloud cache is levelled too — a re-entry must not revive the pre-refresh credential', async () => {
            mockGetDelegationToken.mockReturnValue(delegationToken);
            mockGetCloudToken.mockReturnValue({ id: 'u', Token: { identityToken: 'old' } });

            await sessionAuthAdapter.commitRefreshedToken(CLOUD, view);

            expect(mockSetCachedCloudTokens).toHaveBeenCalledWith(CLOUD, {
                delegationToken,
                cloudToken: expect.objectContaining({ Token: { identityToken: 'new' } }),
            });
        });

        it('records the uid the refreshed token names for that cloud', async () => {
            mockGetDelegationToken.mockReturnValue(delegationToken);
            mockGetCloudToken.mockReturnValue({ uid: 'uid-1', Token: { identityToken: 'old' } });

            await sessionAuthAdapter.commitRefreshedToken(CLOUD, view);

            expect(mockSetCloudIdentity).toHaveBeenCalledWith(CLOUD, { uid: 'uid-1' });
        });

        it('a NON-committed cloud: merges into its cache entry only — store, identity and signal untouched', async () => {
            mockGetDelegationToken.mockReturnValue({ ...delegationToken, cloudId: 'other-cloud' });
            const cachedDelegation = { ...delegationToken, cloudId: CLOUD };
            mockPeekCachedCloudTokens.mockReturnValue({
                delegationToken: cachedDelegation,
                cloudToken: { uid: 'uid-in-cloud-1', name: 'kept', Token: { identityToken: 'old' } },
            });

            await sessionAuthAdapter.commitRefreshedToken(CLOUD, view);

            expect(mockPeekCachedCloudTokens).toHaveBeenCalledWith(CLOUD);
            expect(mockSetCachedCloudTokens).toHaveBeenCalledWith(CLOUD, {
                delegationToken: cachedDelegation,
                cloudToken: expect.objectContaining({ name: 'kept', Token: { identityToken: 'new' } }),
            });
            expect(mockSetCloudIdentity).toHaveBeenCalledWith(CLOUD, { uid: 'uid-in-cloud-1' });
            expect(mockSaveCloudToken).not.toHaveBeenCalled();
            expect(mockRebuildSessionIdentity).not.toHaveBeenCalled();
            expect(mockNotifySessionStateChanged).not.toHaveBeenCalled();
        });

        it('a NON-committed cloud with no cache entry: warns and writes nothing', async () => {
            mockGetDelegationToken.mockReturnValue({ ...delegationToken, cloudId: 'other-cloud' });
            mockPeekCachedCloudTokens.mockReturnValue(null);

            await sessionAuthAdapter.commitRefreshedToken(CLOUD, view);

            expect(mockSetCachedCloudTokens).not.toHaveBeenCalled();
            expect(mockSaveCloudToken).not.toHaveBeenCalled();
            expect(mockLoggerWarn).toHaveBeenCalledWith('AUTH', expect.stringContaining('writeback dropped'), {
                data: { cid: CLOUD },
            });
        });

        it('with no committed cloud at all, a cloud writeback is a cache write, never a store write', async () => {
            mockGetDelegationToken.mockReturnValue(null);
            mockPeekCachedCloudTokens.mockReturnValue({
                delegationToken: { ...delegationToken, cloudId: CLOUD },
                cloudToken: { id: 'u', Token: { identityToken: 'old' } },
            });

            await sessionAuthAdapter.commitRefreshedToken(CLOUD, view);

            expect(mockSetCachedCloudTokens).toHaveBeenCalledWith(CLOUD, expect.anything());
            expect(mockSaveCloudToken).not.toHaveBeenCalled();
        });
    });
});
