import type { CloudView } from '@lemoncloud/chatic-backend-api';

import { findCloudByEmail, normalizeEmail } from './cloudEmails';

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
