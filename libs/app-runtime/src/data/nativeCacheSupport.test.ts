/**
 * Web ships ahead of the app. So "can native store this domain" can't be answered from web's own
 * type union (web always knows more than the app it's running against) — it can only be answered by
 * the handshake report plus the frozen legacy set. This suite pins down that judgment rule —
 * libs/app-runtime/docs/data/cache-contract-versions.md.
 */
import type { CacheType } from '@chatic/app-messages';

import {
    LOCAL_AUTHORITY_CACHE_TYPES,
    REQUIRED_DOMAIN_VERSION,
    getNativeCacheSupport,
    isNativeCacheTypeUsable,
    resetNativeCacheSupport,
    setNativeCacheSupport,
} from './nativeCacheSupport';

jest.mock('@chatic/bridges', () => ({
    logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

// 'invite' (ADR-0052) is the first CacheType added to this repo after the fact, so by definition it's
// outside the frozen LEGACY_NATIVE_CACHE_TYPES set and can only be recognized as native through the
// handshake report — it's a real type that embodies the exact reason this hook exists.
const FUTURE_TYPE = 'invite';

beforeEach(() => {
    resetNativeCacheSupport();
});

describe('isNativeCacheTypeUsable', () => {
    it('보고가 없으면(구버전 앱·응답 대기) legacy 타입만 네이티브로 인정한다', () => {
        expect(getNativeCacheSupport()).toBeNull();
        expect(isNativeCacheTypeUsable('chat')).toBe(true);
        expect(isNativeCacheTypeUsable(FUTURE_TYPE)).toBe(false);
    });

    it('보고된 타입은 legacy가 아니어도 네이티브로 인정한다', () => {
        setNativeCacheSupport({ cacheSchemaVersion: 3, supportedCacheTypes: ['chat', FUTURE_TYPE] });

        expect(isNativeCacheTypeUsable(FUTURE_TYPE)).toBe(true);
    });

    // A report can only ADD types, never remove them: a bug where the app omits a type from its list
    // must not silently move a warm native cache over to web storage. This is why the legacy set is
    // the floor for the version number.
    it('legacy 타입은 앱이 목록에서도 판번호에서도 빠뜨려도 네이티브를 유지한다', () => {
        setNativeCacheSupport({ cacheSchemaVersion: 3, supportedCacheTypes: [], cacheDomainVersions: {} });

        expect(isNativeCacheTypeUsable('chat')).toBe(true);
        expect(isNativeCacheTypeUsable('channel')).toBe(true);
    });

    it('보고 스냅샷을 그대로 읽을 수 있다', () => {
        setNativeCacheSupport({
            cacheSchemaVersion: 5,
            supportedCacheTypes: ['chat'],
            cacheDomainVersions: { chat: 2 },
        });

        expect(getNativeCacheSupport()).toEqual({
            schemaVersion: 5,
            types: new Set(['chat']),
            domainVersions: { chat: 2 },
        });
    });

    it('필드가 없는 구버전 응답도 스냅샷으로 받아들인다', () => {
        setNativeCacheSupport({});

        expect(getNativeCacheSupport()).toEqual({ schemaVersion: null, types: new Set(), domainVersions: {} });
        expect(isNativeCacheTypeUsable('chat')).toBe(true);
        expect(isNativeCacheTypeUsable(FUTURE_TYPE)).toBe(false);
    });
});

// The version number is the max of three sources. This max is what makes the transition harmless
// (an app reporting only names counts as version 1) — this pins down that no source can pull the
// others' version down.
describe('도메인 판번호 (세 근거의 최댓값)', () => {
    afterEach(() => {
        delete REQUIRED_DOMAIN_VERSION.chat;
        delete REQUIRED_DOMAIN_VERSION.invite;
    });

    it('요구 판번호보다 앱 판번호가 낮으면 legacy 타입도 네이티브를 쓰지 않는다', () => {
        REQUIRED_DOMAIN_VERSION.chat = 2;

        setNativeCacheSupport({ supportedCacheTypes: ['chat'], cacheDomainVersions: { chat: 1 } });
        expect(isNativeCacheTypeUsable('chat')).toBe(false);

        setNativeCacheSupport({ supportedCacheTypes: ['chat'], cacheDomainVersions: { chat: 2 } });
        expect(isNativeCacheTypeUsable('chat')).toBe(true);
    });

    it('판번호를 보내지 않는 구버전 앱은 요구 2판인 타입에서 미달로 본다', () => {
        REQUIRED_DOMAIN_VERSION.chat = 2;

        setNativeCacheSupport({ cacheSchemaVersion: 99, supportedCacheTypes: ['chat'] });
        expect(isNativeCacheTypeUsable('chat')).toBe(false);
    });

    // Reporting only names counts as version 1. Most apps a new web build encounters are this shape.
    it('이름만 보고해도 요구 1판(기본값)은 통과한다', () => {
        setNativeCacheSupport({ supportedCacheTypes: [FUTURE_TYPE] });

        expect(isNativeCacheTypeUsable(FUTURE_TYPE)).toBe(true);
    });

    it('판번호가 이름 보고나 legacy 하한선을 끌어내리지 못한다', () => {
        setNativeCacheSupport({
            supportedCacheTypes: ['chat', FUTURE_TYPE],
            cacheDomainVersions: { chat: 0, invite: 0 },
        });

        expect(isNativeCacheTypeUsable('chat')).toBe(true);
        expect(isNativeCacheTypeUsable(FUTURE_TYPE)).toBe(true);
    });

    // The global schema number is no longer read for this judgment — the point where the defect of
    // an unrelated domain's migration bumping the baseline (ADR-0053 defect 2) went away.
    it('전역 cacheSchemaVersion은 판정에 영향을 주지 않는다', () => {
        REQUIRED_DOMAIN_VERSION.invite = 2;

        setNativeCacheSupport({ cacheSchemaVersion: 999, supportedCacheTypes: [FUTURE_TYPE] });
        expect(isNativeCacheTypeUsable(FUTURE_TYPE)).toBe(false);

        setNativeCacheSupport({ cacheSchemaVersion: 0, cacheDomainVersions: { invite: 2 } });
        expect(isNativeCacheTypeUsable(FUTURE_TYPE)).toBe(true);
    });
});

// For this domain alone, the gate's failure mode isn't a "recoverable durability drop" but an
// "unrecoverable loss". The type itself refuses to let a floor be drawn (GateableCacheType), so here
// we pin down the runtime contract.
describe('로컬 권위 도메인 (invitecloud)', () => {
    it('REQUIRED_DOMAIN_VERSION에 항목이 없다', () => {
        for (const type of LOCAL_AUTHORITY_CACHE_TYPES) {
            expect(REQUIRED_DOMAIN_VERSION).not.toHaveProperty(type);
        }
    });

    it('어떤 보고 형태에서도 네이티브를 유지한다', () => {
        const reports = [
            undefined,
            {},
            { supportedCacheTypes: [] },
            { cacheSchemaVersion: 0, supportedCacheTypes: [], cacheDomainVersions: {} },
            { cacheDomainVersions: { invitecloud: 0 } },
        ];

        for (const report of reports) {
            resetNativeCacheSupport();
            if (report) setNativeCacheSupport(report);
            for (const type of LOCAL_AUTHORITY_CACHE_TYPES) {
                expect(isNativeCacheTypeUsable(type)).toBe(true);
            }
        }
    });

    it('legacy 동결 집합에 속해 하한선이 1판으로 보장된다', () => {
        // Drop out of this set and a non-reporting app's invitecloud gets pushed to web storage,
        // losing the invited cloud.
        resetNativeCacheSupport();
        for (const type of LOCAL_AUTHORITY_CACHE_TYPES as readonly CacheType[]) {
            expect(isNativeCacheTypeUsable(type)).toBe(true);
        }
    });
});
