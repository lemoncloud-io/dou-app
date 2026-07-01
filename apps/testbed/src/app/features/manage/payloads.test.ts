import { describe, expect, it } from 'vitest';

import { buildChannelCreate, buildChannelUpdate, buildPlaceCreate, buildPlaceUpdate } from './payloads';

describe('buildChannelCreate', () => {
    it('이름을 트림하고 stereo=private로 생성 페이로드를 만든다', () => {
        expect(buildChannelCreate('  일반  ')).toEqual({ stereo: 'private', name: '일반' });
    });

    it('빈/공백 이름은 null을 반환한다', () => {
        expect(buildChannelCreate('   ')).toBeNull();
        expect(buildChannelCreate('')).toBeNull();
    });
});

describe('buildChannelUpdate', () => {
    it('channelId와 트림된 이름으로 수정 페이로드를 만든다', () => {
        expect(buildChannelUpdate('CH1', ' 새이름 ')).toEqual({ channelId: 'CH1', name: '새이름' });
    });

    it('channelId나 이름이 비면 null을 반환한다', () => {
        expect(buildChannelUpdate('', '이름')).toBeNull();
        expect(buildChannelUpdate('CH1', '  ')).toBeNull();
    });
});

describe('buildPlaceCreate', () => {
    it('트림된 이름으로 플레이스 생성 페이로드를 만든다', () => {
        expect(buildPlaceCreate(' 우리팀 ')).toEqual({ name: '우리팀' });
    });

    it('빈 이름은 null을 반환한다', () => {
        expect(buildPlaceCreate('   ')).toBeNull();
    });
});

describe('buildPlaceUpdate', () => {
    it('sid가 아니라 id 필드로 타겟을 지정한다', () => {
        expect(buildPlaceUpdate('SITE1', ' 새플레이스 ')).toEqual({ id: 'SITE1', name: '새플레이스' });
    });

    it('placeId나 이름이 비면 null을 반환한다', () => {
        expect(buildPlaceUpdate('', '이름')).toBeNull();
        expect(buildPlaceUpdate('SITE1', '')).toBeNull();
    });
});
