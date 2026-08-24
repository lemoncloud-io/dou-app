import { toLogEntry } from './nativeLogSource';

import type { AppLogInfo } from '@chatic/app-messages';

describe('toLogEntry', () => {
    it('id와 발생 시점 컨텍스트를 그대로 복원한다', () => {
        // The uploader drains this buffer into its queue, which dedups on the
        // id; the context must stay the one captured when the entry was
        // written, not whatever is current at drain time.
        const info: AppLogInfo = {
            id: 'native-1',
            runId: 'run-3',
            uid: 'u-3',
            cid: 'c-3',
            sid: 's-3',
            route: '/home',
            appVersion: '0.22.0',
            os: 'android',
            model: 'Pixel 9',
            tag: 'PUSH_EVENT',
            message: 'received',
            level: 'info',
            timestamp: 555,
            source: 'native',
        };

        expect(toLogEntry(info)).toEqual(
            expect.objectContaining({
                id: 'native-1',
                runId: 'run-3',
                uid: 'u-3',
                cid: 'c-3',
                sid: 's-3',
                route: '/home',
                appVersion: '0.22.0',
                os: 'android',
                model: 'Pixel 9',
                timestamp: 555,
                source: 'native',
            })
        );
    });

    it('구버전 앱이 보낸 최소 필드도 정규화한다', () => {
        const entry = toLogEntry({ tag: 'APP' } as AppLogInfo);

        expect(entry).toEqual({ level: 'info', tag: 'APP', message: '', timestamp: 0 });
    });

    it('없는 컨텍스트 키는 아예 만들지 않는다', () => {
        expect(toLogEntry({ tag: 'APP', message: 'x', timestamp: 1 } as AppLogInfo)).not.toHaveProperty('runId');
    });
});
