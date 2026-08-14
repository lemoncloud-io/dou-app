/**
 * 웹은 앱보다 먼저 배포된다. 그래서 "네이티브가 이 도메인을 저장할 수 있는가"는 웹 자신의 타입
 * 유니온으로 답할 수 없고(웹은 항상 자기가 도는 앱보다 많이 안다), 핸드셰이크 보고 + 동결된
 * legacy 집합으로만 답할 수 있다. 이 스위트는 그 판정 규칙을 고정한다 —
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

// 'invite'(ADR-0052)는 이 리포에 최초로 추가된 CacheType이라, 정의상 LEGACY_NATIVE_CACHE_TYPES
// 동결 집합 밖이고 핸드셰이크 보고로만 네이티브를 인정받는다 — 이 훅이 존재하는 이유 그 자체를
// 실제 타입으로 보여준다.
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

    // 보고는 타입을 더할 수만 있고 뺄 수는 없다: 앱이 목록을 빠뜨리는 버그가 따뜻한 네이티브 캐시를
    // 조용히 웹 저장소로 옮겨버리면 안 된다. legacy 집합이 판번호의 하한선(floor)인 이유.
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

// 판번호는 세 근거의 최댓값이다. 이 max가 전환을 무해하게 만든 장치라(이름만 보고하는 앱 = 1판),
// 근거끼리 서로를 낮추지 못한다는 것을 여기서 고정한다.
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

    // 이름 보고 = 1판 환산. 새 웹이 마주치는 앱은 대부분 이 형태다.
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

    // 전역 스키마 번호는 이제 판정에서 읽지 않는다 — 무관한 도메인의 마이그레이션이 기준값을
    // 밀어올리던 결함(ADR-0053 결함 2)이 사라진 지점.
    it('전역 cacheSchemaVersion은 판정에 영향을 주지 않는다', () => {
        REQUIRED_DOMAIN_VERSION.invite = 2;

        setNativeCacheSupport({ cacheSchemaVersion: 999, supportedCacheTypes: [FUTURE_TYPE] });
        expect(isNativeCacheTypeUsable(FUTURE_TYPE)).toBe(false);

        setNativeCacheSupport({ cacheSchemaVersion: 0, cacheDomainVersions: { invite: 2 } });
        expect(isNativeCacheTypeUsable(FUTURE_TYPE)).toBe(true);
    });
});

// 게이트의 실패 모드가 이 도메인에서만 "복구 가능한 내구성 하락"이 아니라 "복구 불가한 소실"이다.
// 하한선을 긋는 것 자체를 타입이 거부하므로(GateableCacheType), 여기서는 런타임 계약을 고정한다.
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
        // 이 집합에서 빠지면 미보고 앱의 invitecloud가 웹 저장소로 밀려 초대 클라우드가 소실된다.
        resetNativeCacheSupport();
        for (const type of LOCAL_AUTHORITY_CACHE_TYPES as readonly CacheType[]) {
            expect(isNativeCacheTypeUsable(type)).toBe(true);
        }
    });
});
