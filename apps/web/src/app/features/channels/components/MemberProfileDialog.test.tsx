import '@testing-library/jest-dom';

import { fireEvent, render, screen } from '@testing-library/react';

import { MemberProfileDialog } from './MemberProfileDialog';

const toastMock = jest.fn();

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ useToast: () => ({ toast: toastMock }) }));
jest.mock('@chatic/web-ui-kit', () => ({
    ProfileAvatar: ({ alt }: { alt?: string }) => <div data-testid="avatar" aria-label={alt} />,
    ModalTopBar: ({ title }: { title?: string }) => <div>{title}</div>,
    ListRow: ({ title, onClick, ...rest }: { title: React.ReactNode; onClick?: () => void; role?: string }) => (
        <button onClick={onClick} role={rest.role} aria-checked={(rest as any)['aria-checked']}>
            {title}
        </button>
    ),
    IconCheck: () => <span data-testid="owner-check" />,
    // The scope sheet: drawn only while open, its footer button after its body.
    BottomSheet: ({ open, title, children, footer }: any) =>
        open ? (
            <div role="dialog" aria-label={title}>
                {children}
                {footer}
            </div>
        ) : null,
    Button: ({ children, disabled, onClick }: any) => (
        <button data-testid="scope-next" disabled={disabled} onClick={onClick}>
            {children}
        </button>
    ),
}));

const member = { id: 'u1', name: '김두유', avatar: null };

beforeEach(() => jest.clearAllMocks());

describe('MemberProfileDialog — 뷰어/대상 분기', () => {
    it('대상=나: 프로필 설정만 노출하고 클릭 시 onOpenProfileSettings 호출', () => {
        const onOpenProfileSettings = jest.fn();
        render(
            <MemberProfileDialog
                open
                onOpenChange={() => undefined}
                member={member}
                isSelf
                onOpenProfileSettings={onOpenProfileSettings}
            />
        );

        expect(screen.queryByText('chat.settings.report')).not.toBeInTheDocument();
        fireEvent.click(screen.getByText('chat.settings.profileSettings'));
        expect(onOpenProfileSettings).toHaveBeenCalledTimes(1);
    });

    it('뷰어=초대받은자(canKick=false, 비-self): 신고만 노출', () => {
        render(<MemberProfileDialog open onOpenChange={() => undefined} member={member} canKick={false} />);

        expect(screen.getByText('chat.settings.report')).toBeInTheDocument();
        expect(screen.queryByText('chat.settings.friendSettings')).not.toBeInTheDocument();
        expect(screen.queryByText('chat.settings.removeMember')).not.toBeInTheDocument();
    });

    it('뷰어=소유자(canKick): 친구 설정·내보내기·신고 노출, 신고/친구설정은 토스트만', () => {
        render(<MemberProfileDialog open onOpenChange={() => undefined} member={member} canKick />);

        fireEvent.click(screen.getByText('chat.settings.report'));
        expect(toastMock).toHaveBeenCalledWith({ title: 'chat.settings.reportSuccess' });

        fireEvent.click(screen.getByText('chat.settings.friendSettings'));
        expect(toastMock).toHaveBeenCalledWith({ title: 'chat.settings.comingSoon' });
    });

    // The host decides where a 1:1 can start; without its handler no row offers it.
    it('offers no way to start a 1:1 when the host gives no handler, whoever is viewing', () => {
        const actions = () => screen.getAllByRole('button').map(button => button.textContent);

        const owner = render(<MemberProfileDialog open onOpenChange={() => undefined} member={member} canKick />);
        expect(actions()).toEqual([
            'chat.settings.friendSettings',
            'chat.settings.removeMember',
            'chat.settings.report',
        ]);
        owner.unmount();

        render(<MemberProfileDialog open onOpenChange={() => undefined} member={member} canKick={false} />);
        expect(actions()).toEqual(['chat.settings.report']);
    });

    it('puts the start-1:1 row first when the host gives a handler, and runs it on tap', () => {
        const onStartDm = jest.fn();
        render(
            <MemberProfileDialog open onOpenChange={() => undefined} member={member} canKick onStartDm={onStartDm} />
        );

        const actions = screen.getAllByRole('button').map(button => button.textContent);
        expect(actions).toEqual([
            'cloudDm.startFromProfile',
            'chat.settings.friendSettings',
            'chat.settings.removeMember',
            'chat.settings.report',
        ]);
        fireEvent.click(screen.getByText('cloudDm.startFromProfile'));
        expect(onStartDm).toHaveBeenCalledTimes(1);
    });

    // A host that forgets to withhold the handler on my own profile still cannot offer a room with me.
    it('never offers a 1:1 on my own profile, even with a handler', () => {
        render(
            <MemberProfileDialog open onOpenChange={() => undefined} member={member} isSelf onStartDm={jest.fn()} />
        );

        expect(screen.queryByText('cloudDm.startFromProfile')).not.toBeInTheDocument();
    });

    describe('remove: scope sheet, then a confirm per scope', () => {
        const openScopeSheet = () => fireEvent.click(screen.getByText('chat.settings.removeMember'));
        // `hidden`: the stub sheet renders beside the modal profile, which hides the rest of the page
        // from the accessibility tree (the real sheet portals above it).
        const scopeLabels = () => screen.queryAllByRole('radio', { hidden: true }).map(radio => radio.textContent);

        it('offers both scopes to a viewer who owns the room and the place', () => {
            render(
                <MemberProfileDialog
                    open
                    onOpenChange={() => undefined}
                    member={member}
                    canKick
                    canRemoveFromPlace
                    roomName="Room"
                    placeName="Place"
                />
            );
            openScopeSheet();

            expect(scopeLabels()).toEqual([
                'chat.settings.removeScope.room.label',
                'chat.settings.removeScope.place.label',
            ]);
        });

        it('offers only the room scope to a room owner who does not own the place', () => {
            render(<MemberProfileDialog open onOpenChange={() => undefined} member={member} canKick />);
            openScopeSheet();

            expect(scopeLabels()).toEqual(['chat.settings.removeScope.room.label']);
        });

        // Owning the place alone is enough to see the remove row, with the place scope only.
        it('offers only the place scope to a place owner who does not own the room', () => {
            render(<MemberProfileDialog open onOpenChange={() => undefined} member={member} canRemoveFromPlace />);
            openScopeSheet();

            expect(scopeLabels()).toEqual(['chat.settings.removeScope.place.label']);
        });

        it('keeps the bottom button disabled until a scope is picked', () => {
            render(<MemberProfileDialog open onOpenChange={() => undefined} member={member} canKick />);
            openScopeSheet();

            expect(screen.getByTestId('scope-next')).toBeDisabled();
            fireEvent.click(screen.getByText('chat.settings.removeScope.room.label'));
            expect(screen.getByTestId('scope-next')).toBeEnabled();
        });

        it('confirms the room scope in its own words, then runs onKick', async () => {
            const onKick = jest.fn();
            const onRemoveFromPlace = jest.fn();
            render(
                <MemberProfileDialog
                    open
                    onOpenChange={() => undefined}
                    member={member}
                    canKick
                    onKick={onKick}
                    canRemoveFromPlace
                    onRemoveFromPlace={onRemoveFromPlace}
                />
            );
            openScopeSheet();
            fireEvent.click(screen.getByText('chat.settings.removeScope.room.label'));
            fireEvent.click(screen.getByTestId('scope-next'));

            expect(await screen.findByText('chat.settings.removeScope.room.confirmTitle')).toBeInTheDocument();
            fireEvent.click(screen.getByText('chat.settings.removeScope.confirm'));
            expect(onKick).toHaveBeenCalledTimes(1);
            expect(onRemoveFromPlace).not.toHaveBeenCalled();
        });

        it('confirms the place scope in its own words, then runs onRemoveFromPlace', async () => {
            const onKick = jest.fn();
            const onRemoveFromPlace = jest.fn();
            render(
                <MemberProfileDialog
                    open
                    onOpenChange={() => undefined}
                    member={member}
                    canKick
                    onKick={onKick}
                    canRemoveFromPlace
                    onRemoveFromPlace={onRemoveFromPlace}
                />
            );
            openScopeSheet();
            fireEvent.click(screen.getByText('chat.settings.removeScope.place.label'));
            fireEvent.click(screen.getByTestId('scope-next'));

            expect(await screen.findByText('chat.settings.removeScope.place.confirmTitle')).toBeInTheDocument();
            fireEvent.click(screen.getByText('chat.settings.removeScope.confirm'));
            expect(onRemoveFromPlace).toHaveBeenCalledTimes(1);
            expect(onKick).not.toHaveBeenCalled();
        });
    });

    it('대상이 방장이면 소유자 뱃지를 노출한다', () => {
        render(<MemberProfileDialog open onOpenChange={() => undefined} member={member} memberIsOwner />);
        expect(screen.getByTestId('owner-check')).toBeInTheDocument();
    });
});
