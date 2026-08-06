import '@testing-library/jest-dom';

import { fireEvent, render, screen } from '@testing-library/react';

import { useCreatePlaceFlow } from './useCreatePlaceFlow';

// The flow's contract is the SEQUENCING between the two dialogs, so both are stubbed down to the
// props the flow drives; the dialogs' own behavior is covered by their component tests.
jest.mock('../components/CreatePlaceDialog', () => ({
    CreatePlaceDialog: ({
        open,
        onOpenChange,
        onCreated,
    }: {
        open: boolean;
        onOpenChange: (open: boolean) => void;
        onCreated?: (place: { id: string }) => void;
    }) =>
        open ? (
            <div>
                <button
                    onClick={() => {
                        onOpenChange(false);
                        onCreated?.({ id: 'site-1' });
                    }}
                >
                    create-success
                </button>
                {/* The switch-failure path closes without firing onCreated. */}
                <button onClick={() => onOpenChange(false)}>create-switch-failed</button>
            </div>
        ) : null,
}));
jest.mock('../components/PlaceProfileCreateDialog', () => ({
    PlaceProfileCreateDialog: ({
        open,
        placeName,
        dismissible,
        onDone,
    }: {
        open: boolean;
        placeName: string;
        dismissible?: boolean;
        onDone: () => void;
    }) =>
        open ? (
            <div data-testid="profile-step" data-dismissible={String(dismissible)} data-place-name={placeName}>
                <button onClick={onDone}>profile-done</button>
            </div>
        ) : null,
}));
jest.mock('../../../hooks/useActivePlaceName', () => ({ useActivePlaceName: () => '새 플레이스' }));

const Host = () => {
    const { openCreatePlace, createPlaceFlow } = useCreatePlaceFlow();
    return (
        <>
            <button onClick={openCreatePlace}>open-flow</button>
            {createPlaceFlow}
        </>
    );
};

const open = () => fireEvent.click(screen.getByRole('button', { name: 'open-flow' }));

describe('useCreatePlaceFlow', () => {
    it('생성+전환 성공(onCreated) 후 프로필 스텝이 dismissible=false로 열린다', () => {
        render(<Host />);
        open();

        fireEvent.click(screen.getByRole('button', { name: 'create-success' }));

        const step = screen.getByTestId('profile-step');
        expect(step).toHaveAttribute('data-dismissible', 'false');
        expect(step).toHaveAttribute('data-place-name', '새 플레이스');
    });

    it('프로필 저장(onDone)으로 플로우가 끝난다', () => {
        render(<Host />);
        open();
        fireEvent.click(screen.getByRole('button', { name: 'create-success' }));

        fireEvent.click(screen.getByRole('button', { name: 'profile-done' }));

        expect(screen.queryByTestId('profile-step')).not.toBeInTheDocument();
    });

    it('전환 실패(onCreated 미발화)로 닫히면 프로필 스텝을 열지 않는다', () => {
        render(<Host />);
        open();

        fireEvent.click(screen.getByRole('button', { name: 'create-switch-failed' }));

        expect(screen.queryByTestId('profile-step')).not.toBeInTheDocument();
    });

    it('열기 전에는 아무 다이얼로그도 렌더하지 않는다', () => {
        render(<Host />);

        expect(screen.queryByRole('button', { name: 'create-success' })).not.toBeInTheDocument();
        expect(screen.queryByTestId('profile-step')).not.toBeInTheDocument();
    });
});
