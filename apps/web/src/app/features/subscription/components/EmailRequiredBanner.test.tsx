import '@testing-library/jest-dom';

import { fireEvent, render, screen } from '@testing-library/react';

import type { CloudView } from '@lemoncloud/chatic-backend-api';

import { EmailRequiredBanner } from './EmailRequiredBanner';
import { useUnboundClouds } from '../hooks';

jest.mock('../hooks', () => ({ useUnboundClouds: jest.fn() }));

const requestEmailBind = jest.fn();
jest.mock('../../../stores/useEmailBindRequest', () => ({
    useEmailBindRequest: (select: (state: { requestEmailBind: unknown }) => unknown) => select({ requestEmailBind }),
}));

// Echoes the key, and the count the title interpolates. `i18n.test.ts` is what proves the keys exist.
jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, arg?: { count?: number }) => (arg?.count == null ? key : `${key}:${arg.count}`),
    }),
}));

const K = 'mypage.subscription.emailRequired';

const setClouds = (clouds: Partial<CloudView>[]) =>
    (useUnboundClouds as jest.Mock).mockReturnValue({ clouds, isLoading: false });

beforeEach(() => jest.clearAllMocks());

describe('EmailRequiredBanner', () => {
    it('이메일 없는 클라우드가 없으면 아무것도 그리지 않는다', () => {
        setClouds([]);

        const { container } = render(<EmailRequiredBanner />);

        expect(container).toBeEmptyDOMElement();
    });

    it('어떤 클라우드가 비어 있는지 이름으로 알려준다', () => {
        setClouds([
            { id: 'CL1', name: '내 클라우드' },
            { id: 'CL2', name: '작업용' },
        ]);

        render(<EmailRequiredBanner />);

        expect(screen.getByText(`${K}.title:2`)).toBeInTheDocument();
        expect(screen.getByText('내 클라우드')).toBeInTheDocument();
        expect(screen.getByText('작업용')).toBeInTheDocument();
    });

    it('이름이 없으면 id로라도 짚어준다 — 이메일이 없으니 대신 쓸 표시가 없다', () => {
        setClouds([{ id: 'CL9' }]);

        render(<EmailRequiredBanner />);

        expect(screen.getByText('CL9')).toBeInTheDocument();
    });

    it('행마다 그 클라우드의 등록 요청을 올린다', () => {
        setClouds([
            { id: 'CL1', name: '내 클라우드' },
            { id: 'CL2', name: '작업용' },
        ]);

        render(<EmailRequiredBanner />);
        fireEvent.click(screen.getAllByText(`${K}.action`)[1]);

        expect(requestEmailBind).toHaveBeenCalledWith('CL2');
    });

    it('id 없는 클라우드는 바인딩할 대상이 없어 목록에 넣지 않는다', () => {
        setClouds([{ name: '아직 준비 중' }]);

        const { container } = render(<EmailRequiredBanner />);

        expect(container).toBeEmptyDOMElement();
    });
});
