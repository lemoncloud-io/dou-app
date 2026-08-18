import '@testing-library/jest-dom';

import { render, screen } from '@testing-library/react';

import { UnreadTab } from './UnreadTab';
import { clearDebugObservation, publishDebugObservation } from '../sharedObservationStore';
import type { ActiveCloudData, OtherCloudUnread } from '../../../../hooks';

// The tab is mounted OUTSIDE the providers (see DebugOverlayHost), so what this suite pins is the
// contract that replaced the crash: read the mirror, and say so when nothing is mirrored yet.
const ACTIVE_CLOUD = {
    channels: [{ id: 'ch-1', name: '채널1', sid: 'site-1', chatNo: 10, metaNo: 10 }],
    isLoaded: true,
    myJoins: new Map([['ch-1', { readNo: 7, chatNo: 7, metaNo: 7 }]]),
    unreads: { byChannel: { 'ch-1': 3 }, byPlace: { 'site-1': 3 }, total: 3 },
} as unknown as ActiveCloudData;

const OTHER_CLOUD = { byCloud: { 'cloud-b': 2 }, total: 2, refresh: () => undefined } as OtherCloudUnread;

describe('UnreadTab — 오버레이 안읽음 인스펙터', () => {
    beforeEach(() => {
        clearDebugObservation();
    });

    it('공유 관측이 없으면 던지지 않고 아직 게시되지 않았다고 알린다', () => {
        // The provider-missing throw used to reach the app-wide boundary and blank the whole UI.
        expect(() => render(<UnreadTab />)).not.toThrow();
        expect(screen.getByText(/아직 게시되지 않았습니다/)).toBeInTheDocument();
    });

    it('게시된 관측의 합계·파생 입력을 그대로 보여준다', () => {
        publishDebugObservation({ activeCloud: ACTIVE_CLOUD, otherCloud: OTHER_CLOUD });
        render(<UnreadTab />);

        // 활성 3 + 비활성 2 = 앱 뱃지 5.
        expect(screen.getByText('5')).toBeInTheDocument();
        expect(screen.getByText('머리 10/10 · 커서 7/7 = 3')).toBeInTheDocument();
        expect(screen.getByText('cloud-b')).toBeInTheDocument();
    });

    it('비활성 클라우드 절반이 없어도 활성 숫자는 계속 보여준다', () => {
        // The two halves come from separate providers; a missing one must not hide the other.
        publishDebugObservation({ activeCloud: ACTIVE_CLOUD });
        render(<UnreadTab />);

        expect(screen.getByText('안읽음이 있는 비활성 클라우드가 없습니다')).toBeInTheDocument();
        expect(screen.getByText('머리 10/10 · 커서 7/7 = 3')).toBeInTheDocument();
    });
});
