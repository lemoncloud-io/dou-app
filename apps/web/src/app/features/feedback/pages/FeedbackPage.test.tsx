import '@testing-library/jest-dom';

import { act, fireEvent, render, screen } from '@testing-library/react';

const mockReportIssue = jest.fn();
const mockNavigate = jest.fn();
const mockToast = jest.fn();

jest.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'ko' } }),
}));
jest.mock('@chatic/bridges', () => ({
    logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
jest.mock('@chatic/device-utils', () => ({
    useDeviceInfo: () => ({ deviceInfo: null, versionInfo: null }),
}));
jest.mock('@chatic/shared', () => ({
    useNavigateWithTransition: () => mockNavigate,
}));
jest.mock('@chatic/web-core', () => ({
    reportIssue: (...args: unknown[]) => mockReportIssue(...args),
}));
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ useToast: () => ({ toast: mockToast }) }));
// The page only needs the header's title; the real one reaches the router.
jest.mock('../../../ui/components', () => ({
    PageHeader: ({ title }: { title: string }) => <header>{title}</header>,
}));
// `buildReportContext` has its own suite; here it only has to be callable.
jest.mock('../lib', () => ({ buildReportContext: () => ({ path: '/mypage/feedback', routeTrail: ['/mypage'] }) }));

import { FeedbackPage } from './FeedbackPage';

const submitButton = () => screen.getByRole('button', { name: 'feedback.submit' });
const titleField = () => screen.getByLabelText(/feedback.titleLabel/);
const bodyField = () => screen.getByLabelText(/feedback.bodyLabel/);

const fill = (title: string, body: string) => {
    fireEvent.change(titleField(), { target: { value: title } });
    fireEvent.change(bodyField(), { target: { value: body } });
};

describe('FeedbackPage — 의견 보내기', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockReportIssue.mockResolvedValue(undefined);
    });

    it('사진 첨부 영역은 렌더하지 않는다 — 업로드 API가 없다', () => {
        render(<FeedbackPage />);
        expect(screen.queryByText(/사진 첨부/)).not.toBeInTheDocument();
    });

    it('처음에는 제출 버튼이 비활성이다', () => {
        render(<FeedbackPage />);
        expect(submitButton()).toBeDisabled();
    });

    it('제목만 채우면 여전히 비활성이다', () => {
        render(<FeedbackPage />);
        fireEvent.change(titleField(), { target: { value: '제목' } });
        expect(submitButton()).toBeDisabled();
    });

    it('본문만 채우면 여전히 비활성이다', () => {
        render(<FeedbackPage />);
        fireEvent.change(bodyField(), { target: { value: '본문' } });
        expect(submitButton()).toBeDisabled();
    });

    it('공백만 입력한 경우는 채운 것으로 보지 않는다', () => {
        render(<FeedbackPage />);
        fill('   ', '   ');
        expect(submitButton()).toBeDisabled();
    });

    it('제목·본문을 모두 채우면 활성화된다', () => {
        render(<FeedbackPage />);
        fill('제목', '본문');
        expect(submitButton()).toBeEnabled();
    });

    it('제출하면 앞뒤 공백을 다듬어 컨텍스트와 함께 전송하고, 성공 시 토스트 후 뒤로 간다', async () => {
        render(<FeedbackPage />);
        fill('  제목  ', '  본문 🙂  ');

        await act(async () => {
            fireEvent.click(submitButton());
        });

        expect(mockReportIssue).toHaveBeenCalledWith('제목', '본문 🙂', {
            path: '/mypage/feedback',
            routeTrail: ['/mypage'],
        });
        expect(mockToast).toHaveBeenCalledWith({ title: 'feedback.success' });
        expect(mockNavigate).toHaveBeenCalledWith(-1);
    });

    it('전송에 실패하면 입력값을 유지하고 화면을 벗어나지 않는다', async () => {
        mockReportIssue.mockRejectedValue(new Error('network'));
        render(<FeedbackPage />);
        fill('제목', '본문');

        await act(async () => {
            fireEvent.click(submitButton());
        });

        expect(mockToast).toHaveBeenCalledWith({ title: 'feedback.failed', variant: 'destructive' });
        expect(mockNavigate).not.toHaveBeenCalled();
        expect(titleField()).toHaveValue('제목');
        expect(bodyField()).toHaveValue('본문');
    });

    it('5000자를 넘는 입력은 안전망에서 잘린다 — 카운터는 노출하지 않는다', () => {
        render(<FeedbackPage />);
        fireEvent.change(bodyField(), { target: { value: 'ㄱ'.repeat(5200) } });

        expect(bodyField()).toHaveValue('ㄱ'.repeat(5000));
        expect(screen.queryByText(/\/5000/)).not.toBeInTheDocument();
    });
});
