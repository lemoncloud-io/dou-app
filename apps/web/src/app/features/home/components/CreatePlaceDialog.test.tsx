import '@testing-library/jest-dom';

import { fireEvent, render, screen } from '@testing-library/react';

import { CreatePlaceDialog } from './CreatePlaceDialog';

jest.mock('@chatic/shared', () => ({ resizeImageToBase64: jest.fn() }));
jest.mock('react-i18next', () => ({
    // Echo the key so assertions can target keys directly.
    useTranslation: () => ({ t: (k: string) => k }),
}));

const done = () => screen.getByRole('button', { name: 'createPlace.done' });
const close = () => screen.getByRole('button', { name: 'createPlace.close' });
const type = (value: string) => fireEvent.change(screen.getByRole('textbox'), { target: { value } });

beforeEach(() => jest.clearAllMocks());

describe('CreatePlaceDialog', () => {
    it('완료 버튼은 유효한 이름 전에는 비활성, 입력하면 활성화된다', () => {
        render(<CreatePlaceDialog open onOpenChange={jest.fn()} onSubmit={jest.fn()} />);

        expect(done()).toBeDisabled();
        type('책모임');
        expect(done()).toBeEnabled();
    });

    it('20자를 넘으면 초과 카운터를 노출하고 완료가 비활성된다', () => {
        render(<CreatePlaceDialog open onOpenChange={jest.fn()} onSubmit={jest.fn()} />);

        type('a'.repeat(21));

        expect(screen.getByText('21/20')).toBeInTheDocument();
        expect(done()).toBeDisabled();
    });

    // The dialog performs no server work: it closes and hands the input over, so the caller can run
    // place.create underneath the next step instead of behind a spinner here.
    it('완료 시 오버레이를 닫고 trim된 입력을 onSubmit으로 넘긴다', () => {
        const onOpenChange = jest.fn();
        const onSubmit = jest.fn();
        render(<CreatePlaceDialog open onOpenChange={onOpenChange} onSubmit={onSubmit} />);

        type('  책모임  ');
        fireEvent.click(done());

        expect(onOpenChange).toHaveBeenCalledWith(false);
        expect(onSubmit).toHaveBeenCalledWith({ name: '책모임', thumbnail: undefined });
    });

    it('입력이 없으면 닫기 시 바로 닫고 onSubmit을 부르지 않는다', () => {
        const onOpenChange = jest.fn();
        const onSubmit = jest.fn();
        render(<CreatePlaceDialog open onOpenChange={onOpenChange} onSubmit={onSubmit} />);

        fireEvent.click(close());

        expect(onOpenChange).toHaveBeenCalledWith(false);
        expect(onSubmit).not.toHaveBeenCalled();
    });

    it('입력이 있으면 닫기 시 이탈 확인 모달을 띄우고, 나가기를 누르면 닫는다', async () => {
        const onOpenChange = jest.fn();
        render(<CreatePlaceDialog open onOpenChange={onOpenChange} onSubmit={jest.fn()} />);

        type('x');
        fireEvent.click(close());

        const leave = await screen.findByRole('button', { name: 'createPlace.exitLeave' });
        expect(onOpenChange).not.toHaveBeenCalled();

        fireEvent.click(leave);
        expect(onOpenChange).toHaveBeenCalledWith(false);
    });
});
