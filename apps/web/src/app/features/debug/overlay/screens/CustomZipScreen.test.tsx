import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { CustomZipScreen } from './CustomZipScreen';
import { resetUnsupportedCommands } from '../../hooks';

const applyCustomZip = jest.fn();
const disableCustomZip = jest.fn();
const fetchCustomZipStatus = jest.fn();

jest.mock('../../../../bridge', () => ({
    appBridge: {
        applyCustomZip: (u: string) => applyCustomZip(u),
        disableCustomZip: () => disableCustomZip(),
        fetchCustomZipStatus: () => fetchCustomZipStatus(),
    },
}));
jest.mock('@chatic/bridges', () => ({ logger: { warn: jest.fn(), info: jest.fn() } }));

const status = (over: Record<string, unknown> = {}) =>
    Promise.resolve({ data: { allowed: true, localRoot: null, serverUrl: null, ...over } });

describe('CustomZipScreen', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        resetUnsupportedCommands();
        fetchCustomZipStatus.mockImplementation(() => status());
    });

    it('지금 상태를 보여준다 — 없으면 기본 웹이라고 말한다', async () => {
        render(<CustomZipScreen />);

        expect(await screen.findByText('기본 웹')).toBeInTheDocument();
    });

    it('주소를 넣고 적용하면 앱에 그 주소를 보낸다', async () => {
        applyCustomZip.mockResolvedValue({ data: { success: true, serverUrl: 'http://127.0.0.1:8890' } });
        render(<CustomZipScreen />);
        await userEvent.type(screen.getByPlaceholderText(/web-build\.zip/), 'https://cdn/x.zip');

        await userEvent.click(screen.getByRole('button', { name: '적용' }));

        expect(applyCustomZip).toHaveBeenCalledWith('https://cdn/x.zip');
    });

    it('주소가 없으면 적용할 수 없다', () => {
        render(<CustomZipScreen />);

        expect(screen.getByRole('button', { name: '적용' })).toBeDisabled();
    });

    // 게이트는 앱이 정한다 — 이 화면은 앱이 말한 것을 표시할 뿐이다.
    it('앱이 허용하지 않으면 그 사실을 적고 적용을 잠근다', async () => {
        fetchCustomZipStatus.mockImplementation(() => status({ allowed: false }));
        render(<CustomZipScreen />);
        await screen.findByText(/적용할 수 없습니다/);

        await userEvent.type(screen.getByPlaceholderText(/web-build\.zip/), 'https://cdn/x.zip');

        expect(screen.getByRole('button', { name: '적용' })).toBeDisabled();
    });

    // PROD로 바뀐 기기가 갇히지 않도록 끄기는 막지 않는다.
    it('허용되지 않는 빌드에서도 켜져 있으면 끌 수 있다', async () => {
        fetchCustomZipStatus.mockImplementation(() => status({ allowed: false, serverUrl: 'http://127.0.0.1:8890' }));
        disableCustomZip.mockResolvedValue({ data: { success: true } });
        render(<CustomZipScreen />);
        await screen.findByText('http://127.0.0.1:8890');

        await userEvent.click(screen.getByRole('button', { name: '끄기' }));

        await waitFor(() => expect(disableCustomZip).toHaveBeenCalledTimes(1));
    });

    it('켜진 것이 없으면 끄기가 잠긴다', async () => {
        render(<CustomZipScreen />);
        await screen.findByText('기본 웹');

        expect(screen.getByRole('button', { name: '끄기' })).toBeDisabled();
    });

    it('구버전 앱이 명령을 모르면 버전 차이로 말한다', async () => {
        applyCustomZip.mockRejectedValue({ code: 'NOT_FOUND' });
        render(<CustomZipScreen />);
        await userEvent.type(screen.getByPlaceholderText(/web-build\.zip/), 'https://cdn/x.zip');

        await userEvent.click(screen.getByRole('button', { name: '적용' }));

        expect(await screen.findByText(/이 앱 버전이 지원하지 않습니다/)).toBeInTheDocument();
    });
});
