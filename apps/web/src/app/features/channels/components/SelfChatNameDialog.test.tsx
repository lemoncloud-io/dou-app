import '@testing-library/jest-dom';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { SelfChatNameDialog } from './SelfChatNameDialog';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
jest.mock('@chatic/bridges', () => ({ logger: { error: jest.fn() } }));
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock('@chatic/web-core', () => ({ useSessionIdentity: () => ({ userId: 'session-me' }) }));

const updateJoin = jest.fn().mockResolvedValue({});
// Stable channel reference so the prefill effect (`useEffect([open, channel])`) runs once.
const mockChannel = { $join: { nick: '내 메모', userId: 'me-join' } };
jest.mock('../hooks', () => ({
    useChannel: () => ({ channel: mockChannel }),
    useJoinMutations: () => ({ updateJoin, isPending: { update: false } }),
}));

describe('SelfChatNameDialog', () => {
    beforeEach(() => updateJoin.mockClear());

    it('현재 nick을 프리필하고 라벨/헬퍼/완료 버튼을 노출한다', () => {
        render(<SelfChatNameDialog open onOpenChange={() => undefined} channelId="c1" />);

        expect(screen.getByText('selfChat.name.title')).toBeInTheDocument();
        expect(screen.getByText('selfChat.name.label')).toBeInTheDocument();
        expect(screen.getByText('selfChat.name.helper')).toBeInTheDocument();
        expect(screen.getByText('selfChat.name.done')).toBeInTheDocument();
        expect(screen.getByRole('textbox')).toHaveValue('내 메모');
    });

    it('저장 시 join.userId와 트림된 nick으로 updateJoin을 호출하고 닫는다', async () => {
        const onOpenChange = jest.fn();
        render(<SelfChatNameDialog open onOpenChange={onOpenChange} channelId="c1" />);

        fireEvent.change(screen.getByRole('textbox'), { target: { value: '  새이름  ' } });
        fireEvent.click(screen.getByText('selfChat.name.done'));

        await waitFor(() =>
            expect(updateJoin).toHaveBeenCalledWith({ channelId: 'c1', userId: 'me-join', nick: '새이름' })
        );
        await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    });

    it('빈 값으로 저장하면 nick을 빈 문자열로 보낸다 (커스텀 이름 제거)', async () => {
        render(<SelfChatNameDialog open onOpenChange={() => undefined} channelId="c1" />);

        fireEvent.change(screen.getByRole('textbox'), { target: { value: '' } });
        fireEvent.click(screen.getByText('selfChat.name.done'));

        await waitFor(() => expect(updateJoin).toHaveBeenCalledWith({ channelId: 'c1', userId: 'me-join', nick: '' }));
    });
});
