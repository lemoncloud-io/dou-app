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

    // A foreground push has, by definition, just arrived, so even a push with no body
    // (title only) keeps the time label — it's a fixed phrase, not a relative-time calculation.
    it('본문이 없으면 본문 줄만 빠지고 "지금" 라벨은 남는다', () => {
        render(<InAppNotificationCard title="#general" />);

        expect(screen.getByText('#general')).toBeTruthy();
        expect(screen.getByText(NOW_KEY)).toBeTruthy();
        // Only two nodes — title + time label — no body node besides them.
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

    // If a photo is given, it renders that face; otherwise, the default glyph. The photo is
    // marked decorative with alt="", so it's checked in the accessibility tree only as a nameless image.
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
