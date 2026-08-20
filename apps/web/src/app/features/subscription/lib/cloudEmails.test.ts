import type { CloudView } from '@lemoncloud/chatic-backend-api';

import { findCloudByEmail, findUnboundClouds, normalizeEmail, unboundCloudLabel } from './cloudEmails';

const clouds = [
    { id: 'CL1', status: 'active', email: 'Owner@Example.com' },
    { id: 'CL2', status: 'suspended', email: 'second@example.com' },
    { id: 'CL3', status: 'expired', email: 'released@example.com' },
] as CloudView[];

describe('normalizeEmail', () => {
    it('공백과 대소문자를 정규화한다', () => {
        expect(normalizeEmail('  Owner@Example.COM ')).toBe('owner@example.com');
        expect(normalizeEmail(undefined)).toBe('');
    });
});

describe('findCloudByEmail', () => {
    it('대소문자·공백이 달라도 이미 쓰는 이메일로 잡아낸다', () => {
        expect(findCloudByEmail(clouds, ' owner@example.com ')?.id).toBe('CL1');
    });

    it('비활성(suspended) 클라우드의 이메일도 여전히 점유 상태다', () => {
        expect(findCloudByEmail(clouds, 'second@example.com')?.id).toBe('CL2');
    });

    it('해제된(expired) 클라우드의 이메일은 다시 쓸 수 있다 — 백엔드 포인터가 정리된 상태다', () => {
        expect(findCloudByEmail(clouds, 'released@example.com')).toBeUndefined();
    });

    it('처음 쓰는 이메일은 통과한다', () => {
        expect(findCloudByEmail(clouds, 'fresh@example.com')).toBeUndefined();
    });

    it('빈 입력은 조회하지 않는다', () => {
        expect(findCloudByEmail(clouds, '   ')).toBeUndefined();
    });
});

describe('findUnboundClouds', () => {
    it('이메일이 없는 클라우드를 찾는다 — 결제/추가 시 인증을 건너뛴 흔적', () => {
        const withGap = [...clouds, { id: 'CL4', status: 'active', createdAt: 100 } as CloudView];
        expect(findUnboundClouds(withGap).map(c => c.id)).toEqual(['CL4']);
    });

    it('여러 개면 전부, 가장 오래된 것부터 — 하나만 알리면 고친 뒤 또 같은 경고를 본다', () => {
        const unbound = [
            { id: 'newer', status: 'active', createdAt: 200 } as CloudView,
            { id: 'older', status: 'reserved', createdAt: 100 } as CloudView,
        ];
        expect(findUnboundClouds(unbound).map(c => c.id)).toEqual(['older', 'newer']);
    });

    it('해제된(expired) 클라우드는 이메일이 없어도 대상이 아니다', () => {
        expect(findUnboundClouds([{ id: 'CL5', status: 'expired' } as CloudView])).toEqual([]);
    });

    it('모든 클라우드에 이메일이 있으면 빈 목록이다', () => {
        expect(findUnboundClouds(clouds)).toEqual([]);
    });

    it('입력 배열을 정렬로 뒤집지 않는다', () => {
        const source = [
            { id: 'newer', status: 'active', createdAt: 200 } as CloudView,
            { id: 'older', status: 'active', createdAt: 100 } as CloudView,
        ];
        findUnboundClouds(source);
        expect(source.map(c => c.id)).toEqual(['newer', 'older']);
    });
});

describe('unboundCloudLabel', () => {
    it('이름으로 어떤 클라우드인지 알린다', () => {
        expect(unboundCloudLabel({ id: 'CL1', name: '내 클라우드' } as CloudView)).toBe('내 클라우드');
    });

    it('이름이 없으면 id를 쓴다 — 이메일은 애초에 없는 상태라 대체할 수 없다', () => {
        expect(unboundCloudLabel({ id: 'CL1', name: '   ' } as CloudView)).toBe('CL1');
        expect(unboundCloudLabel({ id: 'CL1' } as CloudView)).toBe('CL1');
    });
});
