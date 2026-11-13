import '@testing-library/jest-dom';

import { fireEvent, render, screen } from '@testing-library/react';

import { useNotificationStore } from '../../../stores/useNotificationStore';
import type { NotificationItem } from '../../../utils/notifications';
import { FindMeSheet } from './FindMeSheet';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, options?: Record<string, unknown>) => (options ? `${key}:${JSON.stringify(options)}` : key),
        i18n: { language: 'en' },
    }),
}));
const mockNavigate = jest.fn();
jest.mock('@chatic/shared', () => ({
    ...jest.requireActual('@chatic/shared'),
    useNavigateWithTransition: () => mockNavigate,
}));
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock('@chatic/ui-kit/components/ui/toast', () => ({
    ToastAction: ({ children }: any) => <button>{children}</button>,
}));
jest.mock('../../../hooks', () => ({
    useScopedNotifications: () => {
        const { useNotificationStore: store } = jest.requireActual('../../../stores/useNotificationStore');
        return Object.values(store((state: { items: Record<string, unknown> }) => state.items));
    },
}));

const item = (over: Partial<NotificationItem>): NotificationItem => ({
    id: over.id ?? 'x',
    cloudId: 'c',
    channelId: 'ch',
    kind: 'mention',
    ownerName: 'Sis',
    content: 'hi',
    createdAt: Date.now(),
    read: false,
    chatNo: 3,
    ...over,
});

describe('FindMeSheet', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        useNotificationStore.setState({
            items: {
                m: item({ id: 'm', content: 'a mention' }),
                r: item({ id: 'r', kind: 'replyToMine', content: 'a reply' }),
                x: item({ id: 'x', kind: 'reaction', content: '❤️' }),
                p: item({ id: 'p', kind: 'participatedThread', content: 'joined' }),
                o: item({ id: 'o', content: 'old mention', read: true }),
            },
        });
    });

    it('lists only unread mentions and replies to me', () => {
        render(<FindMeSheet open onOpenChange={jest.fn()} />);

        expect(screen.getByText('a mention')).toBeInTheDocument();
        expect(screen.getByText('a reply')).toBeInTheDocument();
        for (const gone of ['❤️', 'joined', 'old mention']) expect(screen.queryByText(gone)).not.toBeInTheDocument();
    });

    it('narrows to mentions or threads', () => {
        render(<FindMeSheet open onOpenChange={jest.fn()} />);

        fireEvent.click(screen.getByRole('button', { name: /notifications\.findMe\.filters\.thread/ }));
        expect(screen.queryByText('a mention')).not.toBeInTheDocument();
        expect(screen.getByText('a reply')).toBeInTheDocument();
    });

    it('closes and opens the message on a tap, which takes it off the list', () => {
        const onOpenChange = jest.fn();
        render(<FindMeSheet open onOpenChange={onOpenChange} />);

        fireEvent.click(screen.getByText('a mention').closest('[role="button"]') as HTMLElement);

        expect(onOpenChange).toHaveBeenCalledWith(false);
        expect(mockNavigate).toHaveBeenCalledWith('/channels/ch/room?chatNo=3');
        expect(screen.queryByText('a mention')).not.toBeInTheDocument();
    });
});
