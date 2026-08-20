import { fireEvent, render, screen } from '@testing-library/react';

import { InAppNotificationCard } from './InAppNotificationCard';

// Echo keys so assertions target the key, not the shipped Korean/English copy.
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));

const NOW_KEY = 'notifications.inApp.now';

beforeEach(() => jest.clearAllMocks());

describe('InAppNotificationCard', () => {
    it('제목·본문과 함께 "지금" 라벨을 렌더한다', () => {
        render(<InAppNotificationCard title="#general" body="안녕하세요" />);

        expect(screen.getByText('#general')).toBeTruthy();
        expect(screen.getByText('안녕하세요')).toBeTruthy();
        expect(screen.getByText(NOW_KEY)).toBeTruthy();
    });

    // 포그라운드 푸시는 정의상 방금 도착한 것이므로, 본문이 없는 푸시(제목만)에서도
    // 시각 라벨은 사라지지 않는다 — 상대 시간 계산이 아니라 고정 문구이기 때문이다.
    it('본문이 없으면 본문 줄만 빠지고 "지금" 라벨은 남는다', () => {
        render(<InAppNotificationCard title="#general" />);

        expect(screen.getByText('#general')).toBeTruthy();
        expect(screen.getByText(NOW_KEY)).toBeTruthy();
        // 제목 + 시각 라벨, 두 조각 외에 본문 노드는 없다.
        expect(screen.queryByText('안녕하세요')).toBeNull();
    });

    it('onClick이 있으면 버튼으로 노출되고 클릭·Enter·Space에 반응한다', () => {
        const onClick = jest.fn();
        render(<InAppNotificationCard title="#general" body="B" onClick={onClick} />);

        const banner = screen.getByRole('button');
        expect(banner.tabIndex).toBe(0);

        fireEvent.click(banner);
        fireEvent.keyDown(banner, { key: 'Enter' });
        fireEvent.keyDown(banner, { key: ' ' });

        expect(onClick).toHaveBeenCalledTimes(3);
    });

    it('onClick이 없으면 표시 전용이라 버튼 역할을 갖지 않는다', () => {
        render(<InAppNotificationCard title="#general" body="B" />);

        expect(screen.queryByRole('button')).toBeNull();
    });

    // 사진이 있으면 그 얼굴을, 없으면 기본 글리프를 쓴다. 사진은 alt=""로 장식 처리하므로
    // 접근성 트리에서 이름 없는 이미지로만 확인한다.
    it('아바타 사진이 오면 이미지로, 없으면 이미지 없이 기본 글리프로 그린다', () => {
        const { container, unmount } = render(
            <InAppNotificationCard title="#general" avatarUrl="https://example.com/a.png" />
        );
        expect(container.querySelector('img[src="https://example.com/a.png"]')).toBeTruthy();
        unmount();

        const { container: fallback } = render(<InAppNotificationCard title="#general" />);
        expect(fallback.querySelector('img')).toBeNull();
    });
});
