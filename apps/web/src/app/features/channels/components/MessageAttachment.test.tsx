import '@testing-library/jest-dom';

import { fireEvent, render, screen } from '@testing-library/react';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock('@chatic/web-ui-kit', () => ({
    IconChevronRight: () => <span />,
}));
const openExternalUrl = jest.fn();
jest.mock('../utils/openExternalUrl', () => ({
    openExternalUrl: (...args: unknown[]) => openExternalUrl(...args),
}));

import { MessageAttachment } from './MessageAttachment';

const OPEN = 'chat.room.attachment.openSource';

describe('MessageAttachment', () => {
    beforeEach(() => jest.clearAllMocks());

    it('첨부가 없으면 아무것도 렌더하지 않는다', () => {
        const { container } = render(<MessageAttachment />);

        expect(container).toBeEmptyDOMElement();
    });

    // 서버는 meta를 해석하지 않고 보존만 하므로 `{}`가 그대로 올 수 있다.
    it('빈 첨부는 빈 카드를 그리지 않는다', () => {
        const { container } = render(<MessageAttachment attach={{}} />);

        expect(container).toBeEmptyDOMElement();
    });

    it('제목·본문·발신자·필드·푸터를 모두 그린다', () => {
        render(
            <MessageAttachment
                attach={{
                    username: 'hello-alarm',
                    pretext: 'error-report: 500',
                    title: '서버 오류',
                    text: '요청을 처리하지 못했습니다.',
                    fields: [
                        { title: 'code', value: 500 },
                        { title: 'path', value: '/chats/0/send' },
                    ],
                    footer: 'chatic-sockets-api#0.26.810',
                }}
            />
        );

        expect(screen.getByText('hello-alarm · error-report: 500')).toBeInTheDocument();
        expect(screen.getByText('서버 오류')).toBeInTheDocument();
        expect(screen.getByText('요청을 처리하지 못했습니다.')).toBeInTheDocument();
        expect(screen.getByText('code')).toBeInTheDocument();
        expect(screen.getByText('500')).toBeInTheDocument();
        expect(screen.getByText('/chats/0/send')).toBeInTheDocument();
        expect(screen.getByText(/chatic-sockets-api#0\.26\.810/)).toBeInTheDocument();
    });

    // 웹뷰에 그대로 띄우면 세션 쿠키를 단 채 돌아올 길 없는 페이지에 갇힌다.
    it('원문 링크는 앵커 기본 동작이 아니라 외부 열기로 나간다', () => {
        render(<MessageAttachment attach={{ title: '오류', sourceUrl: 'https://example.com/report/1' }} />);

        fireEvent.click(screen.getByText(OPEN));

        expect(openExternalUrl).toHaveBeenCalledWith('https://example.com/report/1');
    });

    // href를 지우면 스크린리더가 링크로 읽지 않고 OS 컨텍스트 메뉴의 "링크 복사"도 사라진다 —
    // 본문 링크(MessageText)가 앵커를 유지하는 것과 같은 이유다.
    it('앵커와 href를 유지한다 — 접근성과 컨텍스트 메뉴가 거기 달려 있다', () => {
        render(<MessageAttachment attach={{ title: '오류', sourceUrl: 'https://example.com/report/1' }} />);

        const link = screen.getByRole('link', { name: new RegExp(OPEN) });
        expect(link).toHaveAttribute('href', 'https://example.com/report/1');
        expect(link).toHaveAttribute('target', '_blank');
        expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    });

    it('실행 가능한 스킴은 링크를 아예 내주지 않는다', () => {
        render(<MessageAttachment attach={{ title: '오류', sourceUrl: 'javascript:alert(1)' }} />);

        expect(screen.getByText('오류')).toBeInTheDocument();
        expect(screen.queryByText(OPEN)).not.toBeInTheDocument();
    });

    it('심각도를 왼쪽 레일 색으로 쓴다', () => {
        const { container } = render(<MessageAttachment attach={{ title: '오류', color: 'danger' }} />);

        expect(container.firstElementChild).toHaveStyle({ borderLeftColor: 'hsl(var(--destructive))' });
    });

    // ts는 이 앱에서 유일하게 '초' 단위다.
    it('ts를 초 단위로 읽는다', () => {
        render(<MessageAttachment attach={{ title: '오류', ts: 1_700_000_000 }} />);

        const expected = new Date(1_700_000_000 * 1000).toLocaleString();
        expect(screen.getByText(expected)).toBeInTheDocument();
    });
});
