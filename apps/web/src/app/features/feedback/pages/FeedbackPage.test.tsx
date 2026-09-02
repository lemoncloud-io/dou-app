import '@testing-library/jest-dom';

import { act, fireEvent, render, screen } from '@testing-library/react';

const mockReportIssue = jest.fn();
const mockNavigate = jest.fn();
const mockToast = jest.fn();
const mockEncode = jest.fn((file: File) => Promise.resolve(`data:image/jpeg;base64,${file.name}`));

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
    // jsdom has no canvas, so the real encoder cannot run here; it is covered by its own
    // contract (aspect-preserving downscale) and exercised in the browser.
    scaleImageToDataUrl: (file: File) => mockEncode(file),
}));
jest.mock('@chatic/app-runtime', () => ({
    reportIssue: (...args: unknown[]) => mockReportIssue(...args),
}));
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ useToast: () => ({ toast: mockToast }) }));
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

const photoInput = () => document.querySelector('input[type="file"]') as HTMLInputElement;

const makeFile = (name: string) => new File(['x'], name, { type: 'image/jpeg' });

/** Pick `names` through the hidden file input, awaiting the encode promises. */
const attach = async (...names: string[]) => {
    await act(async () => {
        fireEvent.change(photoInput(), { target: { files: names.map(makeFile) } });
    });
};

// Thumbnails carry `alt=""` on purpose — the remove button next to each one holds the
// accessible name — so they are presentational and `getAllByRole('img')` cannot see them.
const thumbnails = () => Array.from(document.querySelectorAll('img'));

describe('FeedbackPage — 의견 보내기', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockReportIssue.mockResolvedValue(undefined);
    });

    it('상단바 제목과 뒤로가기를 노출한다', () => {
        render(<FeedbackPage />);

        expect(screen.getByText('feedback.title')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'common.back' }));
        expect(mockNavigate).toHaveBeenCalledWith(-1);
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

describe('FeedbackPage — 사진 첨부', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockReportIssue.mockResolvedValue(undefined);
        mockEncode.mockImplementation((file: File) => Promise.resolve(`data:image/jpeg;base64,${file.name}`));
    });

    it('고른 사진을 인코딩해 썸네일로 보여준다', async () => {
        render(<FeedbackPage />);
        await attach('a.jpg', 'b.jpg');

        expect(mockEncode).toHaveBeenCalledTimes(2);
        expect(thumbnails()).toHaveLength(2);
    });

    it('사진은 제출 조건이 아니다 — 제목·본문만 있으면 활성화된다', async () => {
        render(<FeedbackPage />);
        fill('제목', '본문');
        expect(submitButton()).toBeEnabled();
    });

    it('삭제 버튼으로 해당 사진만 뺀다', async () => {
        render(<FeedbackPage />);
        await attach('a.jpg', 'b.jpg');

        // The `t` mock drops interpolation, so both buttons share a name — take the first.
        fireEvent.click(screen.getAllByRole('button', { name: 'feedback.photoRemove' })[0]);

        expect(thumbnails()).toHaveLength(1);
        expect(thumbnails()[0]).toHaveAttribute('src', 'data:image/jpeg;base64,b.jpg');
    });

    it('5장을 넘기면 초과분은 버리고 안내 토스트를 띄운다', async () => {
        render(<FeedbackPage />);
        await attach('a.jpg', 'b.jpg', 'c.jpg', 'd.jpg', 'e.jpg', 'f.jpg', 'g.jpg');

        expect(thumbnails()).toHaveLength(5);
        expect(mockToast).toHaveBeenCalledWith({ title: 'feedback.photoLimit' });
    });

    it('5장이 차면 첨부 영역을 감춘다', async () => {
        render(<FeedbackPage />);
        await attach('a.jpg', 'b.jpg', 'c.jpg', 'd.jpg', 'e.jpg');

        expect(screen.queryByText('feedback.photoHint')).not.toBeInTheDocument();
    });

    it('인코딩이 실패하면 이미 붙인 사진은 지키고 실패만 알린다', async () => {
        render(<FeedbackPage />);
        await attach('good.jpg');

        mockEncode.mockRejectedValueOnce(new Error('broken'));
        await attach('bad.jpg');

        expect(thumbnails()).toHaveLength(1);
        expect(mockToast).toHaveBeenCalledWith({ title: 'feedback.photoFailed', variant: 'destructive' });
    });

    it('제출 시 images로 함께 보낸다', async () => {
        render(<FeedbackPage />);
        fill('제목', '본문');
        await attach('a.jpg');

        await act(async () => {
            fireEvent.click(submitButton());
        });

        expect(mockReportIssue).toHaveBeenCalledWith('제목', '본문', {
            path: '/mypage/feedback',
            routeTrail: ['/mypage'],
            images: ['data:image/jpeg;base64,a.jpg'],
        });
    });

    it('사진이 없으면 images 키를 아예 넣지 않는다', async () => {
        render(<FeedbackPage />);
        fill('제목', '본문');

        await act(async () => {
            fireEvent.click(submitButton());
        });

        expect(mockReportIssue.mock.calls[0][2]).not.toHaveProperty('images');
    });
});
