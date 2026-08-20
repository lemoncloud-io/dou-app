import '@testing-library/jest-dom';

import { fireEvent, render, screen } from '@testing-library/react';

import type { CloudView } from '@lemoncloud/chatic-backend-api';

import { CloudManagePage } from './CloudManagePage';

const useCloudsMock = jest.fn();
jest.mock('@chatic/web-core', () => ({
    cloudsKeys: { list: () => ['clouds', 'list'] },
    useClouds: (...args: unknown[]) => useCloudsMock(...args),
    useDeleteCloud: () => ({ mutateAsync: jest.fn(), isPending: false }),
    useSessionSelection: () => ({ selectedCloudId: 'CL1' }),
}));

jest.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ setQueryData: jest.fn() }) }));
jest.mock('@chatic/shared', () => ({ useNavigateWithTransition: () => jest.fn() }));
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock('../../../runtime/useLogoutCloudSession', () => ({
    useLogoutCloudSession: () => ({ logoutCloudSession: jest.fn() }),
}));

const requestEmailBind = jest.fn();
jest.mock('../../../stores/useEmailBindRequest', () => ({
    useEmailBindRequest: (select: (state: { requestEmailBind: unknown }) => unknown) => select({ requestEmailBind }),
}));

// The membership line is owned by `features/subscription`; this screen only mounts it.
jest.mock('../../subscription', () => ({
    CloudMembershipSummary: () => <div data-testid="membership-summary" />,
}));

jest.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

const K = 'mypage.cloudManage';

const setClouds = (list: Partial<CloudView>[]) => useCloudsMock.mockReturnValue({ data: { list } });

beforeEach(() => jest.clearAllMocks());

describe('CloudManagePage — 복원용 이메일', () => {
    it('이메일이 없는 클라우드에만 등록 버튼을 붙인다', () => {
        setClouds([
            { id: 'CL1', name: '내 클라우드', email: 'owner@example.com', status: 'active' },
            { id: 'CL2', name: '작업용', status: 'active' },
        ]);

        render(<CloudManagePage />);

        expect(screen.getAllByText(`${K}.registerEmail`)).toHaveLength(1);
        expect(screen.getByText(`${K}.emailMissing`)).toBeInTheDocument();
        expect(screen.getByText('owner@example.com')).toBeInTheDocument();
    });

    it('그 클라우드의 id로 이메일 등록 요청을 올린다', () => {
        setClouds([
            { id: 'CL1', name: '내 클라우드', email: 'owner@example.com', status: 'active' },
            { id: 'CL2', name: '작업용', status: 'active' },
        ]);

        render(<CloudManagePage />);
        fireEvent.click(screen.getByText(`${K}.registerEmail`));

        expect(requestEmailBind).toHaveBeenCalledWith('CL2');
    });

    it('해제된(expired) 클라우드는 등록을 권하지 않는다 — 되찾을 것이 없다', () => {
        setClouds([{ id: 'CL3', name: '해제됨', status: 'expired' }]);

        render(<CloudManagePage />);

        expect(screen.queryByText(`${K}.registerEmail`)).not.toBeInTheDocument();
    });
});

describe('CloudManagePage — 구독 표시', () => {
    it('멤버십은 목록 위에 한 번만 — 계정 단위라 행마다 반복하지 않는다', () => {
        setClouds([
            { id: 'CL1', name: '내 클라우드', email: 'a@example.com', status: 'active' },
            { id: 'CL2', name: '작업용', email: 'b@example.com', status: 'active' },
        ]);

        render(<CloudManagePage />);

        expect(screen.getAllByTestId('membership-summary')).toHaveLength(1);
    });
});
