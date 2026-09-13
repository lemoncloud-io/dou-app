import { beforeEach, describe, expect, it, vi } from 'vitest';

import { config } from '@chatic/config';

import { migrateLegacyFavorites } from './migrateLegacyFavorites';

vi.mock('@chatic/config', () => ({ config: { get: vi.fn(), set: vi.fn() } }));
const mockGet = vi.mocked(config.get);
const mockSet = vi.mocked(config.set);

const LEGACY_KEY = 'chatic-favorite-channels';
const SCOPE = 'cloud-1:place-1';

const writeLegacy = (ids: Record<string, true>) =>
    localStorage.setItem(LEGACY_KEY, JSON.stringify({ state: { ids }, version: 0 }));

const readLegacy = (): Record<string, true> | null => {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return null;
    return JSON.parse(raw)?.state?.ids ?? null;
};

beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
});

describe('migrateLegacyFavorites', () => {
    it('이 장소의 채널로 확인된 레거시 즐겨찾기를 스코프로 옮기고 빈 legacy 키는 지운다', () => {
        writeLegacy({ 'ch-1': true, 'ch-2': true });
        mockGet.mockReturnValue({});

        migrateLegacyFavorites(SCOPE, ['ch-1', 'ch-2', 'ch-3']);

        expect(mockSet).toHaveBeenCalledWith('ui.pinnedChannels', { [SCOPE]: ['ch-1', 'ch-2'] }, { lane: 'local' });
        expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
    });

    it('다른 장소의 id는 legacy 키에 남는다 — 그 장소를 열 때 옮겨진다', () => {
        writeLegacy({ 'ch-here': true, 'ch-there': true });
        mockGet.mockReturnValue({});

        migrateLegacyFavorites(SCOPE, ['ch-here']);

        expect(mockSet).toHaveBeenCalledWith('ui.pinnedChannels', { [SCOPE]: ['ch-here'] }, { lane: 'local' });
        expect(readLegacy()).toEqual({ 'ch-there': true });
    });

    it('이미 고정된 채널을 중복으로 넣지 않는다', () => {
        writeLegacy({ 'ch-1': true, 'ch-2': true });
        mockGet.mockReturnValue({ [SCOPE]: ['ch-1'] });

        migrateLegacyFavorites(SCOPE, ['ch-1', 'ch-2']);

        expect(mockSet).toHaveBeenCalledWith('ui.pinnedChannels', { [SCOPE]: ['ch-1', 'ch-2'] }, { lane: 'local' });
    });

    it('손상된 JSON이면 legacy 키를 지우고 아무것도 쓰지 않는다', () => {
        localStorage.setItem(LEGACY_KEY, '{broken');

        expect(() => migrateLegacyFavorites(SCOPE, ['ch-1'])).not.toThrow();

        expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
        expect(mockSet).not.toHaveBeenCalled();
    });

    it('레거시 키가 없으면 아무것도 하지 않는다', () => {
        migrateLegacyFavorites(SCOPE, ['ch-1']);

        expect(mockSet).not.toHaveBeenCalled();
        expect(mockGet).not.toHaveBeenCalled();
    });

    it('null 스코프(클라우드·플레이스 미확정)면 아무것도 쓰지 않는다', () => {
        writeLegacy({ 'ch-1': true });

        migrateLegacyFavorites(null, ['ch-1']);

        expect(mockSet).not.toHaveBeenCalled();
        expect(readLegacy()).toEqual({ 'ch-1': true });
    });

    it('다른 스코프의 고정 목록은 보존한다', () => {
        writeLegacy({ 'ch-1': true });
        mockGet.mockReturnValue({ 'cloud-2:place-2': ['ch-9'] });

        migrateLegacyFavorites(SCOPE, ['ch-1']);

        expect(mockSet).toHaveBeenCalledWith(
            'ui.pinnedChannels',
            { [SCOPE]: ['ch-1'], 'cloud-2:place-2': ['ch-9'] },
            { lane: 'local' }
        );
    });
});
