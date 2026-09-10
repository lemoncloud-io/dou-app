import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AppIconScreen } from './AppIconScreen';

const fetchAppIcon = jest.fn();
const fetchAppIconList = jest.fn();
const changeAppIcon = jest.fn();

jest.mock('../../../../bridge', () => ({
    appBridge: {
        fetchAppIcon: () => fetchAppIcon(),
        fetchAppIconList: () => fetchAppIconList(),
        changeAppIcon: (n: string | null) => changeAppIcon(n),
    },
}));
jest.mock('@chatic/bridges', () => ({ logger: { warn: jest.fn() } }));

describe('AppIconScreen', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        fetchAppIcon.mockResolvedValue({ data: { iconName: 'default', supported: true } });
        fetchAppIconList.mockResolvedValue({
            data: {
                availableIcons: [
                    { id: 'holiday', label: '연말' },
                    { id: null, label: '기본' },
                ],
            },
        });
    });

    it('사용 가능한 아이콘을 label로 보여준다', async () => {
        render(<AppIconScreen />);

        expect(await screen.findByRole('button', { name: '연말' })).toBeInTheDocument();
        expect(screen.getByText(/현재: default/)).toBeInTheDocument();
    });

    // AppIconOption의 id가 null이면 기본 아이콘 복원이다 — label을 보내면 앱이 못 알아본다.
    it('변경은 label이 아니라 id를 보낸다', async () => {
        changeAppIcon.mockResolvedValue({ data: { success: true } });
        render(<AppIconScreen />);
        await userEvent.click(await screen.findByRole('button', { name: '연말' }));

        await waitFor(() => expect(changeAppIcon).toHaveBeenCalledWith('holiday'));
    });

    it('기본 복원은 null을 보낸다', async () => {
        changeAppIcon.mockResolvedValue({ data: { success: true } });
        render(<AppIconScreen />);
        await userEvent.click(await screen.findByRole('button', { name: '기본' }));

        await waitFor(() => expect(changeAppIcon).toHaveBeenCalledWith(null));
    });

    it('지원하지 않는 플랫폼이면 그 사실을 적는다', async () => {
        fetchAppIcon.mockResolvedValue({ data: { iconName: 'default', supported: false } });
        render(<AppIconScreen />);

        expect(await screen.findByText(/지원하지 않습니다/)).toBeInTheDocument();
    });

    it('목록을 못 읽으면 비어 있다고만 말한다 — 브라우저 탭에서 고칠 수 없는 에러를 띄우지 않는다', async () => {
        fetchAppIconList.mockRejectedValue(new Error('NOT_FOUND'));
        render(<AppIconScreen />);

        expect(await screen.findByText(/대체 아이콘이 없습니다/)).toBeInTheDocument();
    });
});
