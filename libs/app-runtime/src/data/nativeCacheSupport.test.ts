/**
 * 웹은 앱보다 먼저 배포된다. 그래서 "네이티브가 이 도메인을 저장할 수 있는가"는 웹 자신의 타입
 * 유니온으로 답할 수 없고(웹은 항상 자기가 도는 앱보다 많이 안다), 핸드셰이크 보고 + 동결된
 * legacy 집합으로만 답할 수 있다. 이 스위트는 그 판정 규칙을 고정한다.
 */
import {
    MIN_SCHEMA_VERSION_BY_TYPE,
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

    // 보고는 타입을 더할 수만 있고 뺄 수는 없다: 앱이 목록을 빠뜨리는 버그가 따뜻한 cold 캐시를
    // 조용히 웹 저장소로 옮겨버리면 안 된다.
    it('legacy 타입은 앱이 목록에서 빠뜨려도 네이티브를 유지한다', () => {
        setNativeCacheSupport({ cacheSchemaVersion: 3, supportedCacheTypes: [] });

        expect(isNativeCacheTypeUsable('chat')).toBe(true);
        expect(isNativeCacheTypeUsable('channel')).toBe(true);
    });

    it('보고 스냅샷을 그대로 읽을 수 있다', () => {
        setNativeCacheSupport({ cacheSchemaVersion: 5, supportedCacheTypes: ['chat'] });

        expect(getNativeCacheSupport()).toEqual({ schemaVersion: 5, types: new Set(['chat']) });
    });

    it('필드가 없는 구버전 응답도 스냅샷으로 받아들인다', () => {
        setNativeCacheSupport({});

        expect(getNativeCacheSupport()).toEqual({ schemaVersion: null, types: new Set() });
        expect(isNativeCacheTypeUsable('chat')).toBe(true);
        expect(isNativeCacheTypeUsable(FUTURE_TYPE)).toBe(false);
    });
});

// 프로덕션 맵은 비어 있다(모델에 필드를 더하는 변경은 blob 안이라 앱 릴리스가 필요 없다).
// 추출 컬럼·인덱스에 의존하게 되는 날을 위해 게이트 자체는 여기서 검증해 둔다.
describe('스키마 버전 요구', () => {
    afterEach(() => {
        delete MIN_SCHEMA_VERSION_BY_TYPE.chat;
    });

    it('요구 버전보다 앱 스키마가 낮으면 legacy 타입도 네이티브를 쓰지 않는다', () => {
        MIN_SCHEMA_VERSION_BY_TYPE.chat = 4;

        setNativeCacheSupport({ cacheSchemaVersion: 3, supportedCacheTypes: ['chat'] });
        expect(isNativeCacheTypeUsable('chat')).toBe(false);

        setNativeCacheSupport({ cacheSchemaVersion: 4, supportedCacheTypes: ['chat'] });
        expect(isNativeCacheTypeUsable('chat')).toBe(true);
    });

    it('버전을 보고하지 않는 앱은 요구가 있는 타입에서 미달로 본다', () => {
        MIN_SCHEMA_VERSION_BY_TYPE.chat = 1;

        expect(isNativeCacheTypeUsable('chat')).toBe(false);
    });
});
