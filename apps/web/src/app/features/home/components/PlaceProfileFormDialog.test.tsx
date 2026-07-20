import '@testing-library/jest-dom';

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { resizeImageToBase64 } from '@chatic/shared';

import { PlaceProfileFormDialog, type PlaceProfileFormDialogProps } from './PlaceProfileFormDialog';

jest.mock('@chatic/bridges', () => ({ logger: { error: jest.fn() } }));
jest.mock('@chatic/shared', () => ({ resizeImageToBase64: jest.fn() }));

const resizeMock = resizeImageToBase64 as jest.Mock;

const noop = () => undefined;

const baseProps = (over: Partial<PlaceProfileFormDialogProps> = {}): PlaceProfileFormDialogProps => ({
    open: true,
    title: 'the-title',
    submitLabel: 'submit',
    successToast: 'saved-ok',
    saveError: 'save-failed',
    imageSizeError: 'image-too-big',
    nameLabel: 'name',
    nameHint: 'hint',
    namePlaceholder: 'placeholder',
    photoLabel: 'photo',
    photoOptional: 'optional',
    closeLabel: 'close',
    exit: { title: 'exit-title', description: 'exit-desc', leaveLabel: 'leave', continueLabel: 'keep' },
    onSubmit: jest.fn().mockResolvedValue(undefined),
    onDone: noop,
    onExit: noop,
    ...over,
});

const submitBtn = () => screen.getByRole('button', { name: 'submit' });
const closeBtn = () => screen.getByRole('button', { name: 'close' });
const textbox = () => screen.getByRole('textbox');
const fileInput = () => document.querySelector('input[type="file"]') as HTMLInputElement;

const bigFile = () => {
    const file = new File(['x'], 'big.png', { type: 'image/png' });
    Object.defineProperty(file, 'size', { value: 11 * 1024 * 1024 });
    return file;
};
const smallFile = () => new File(['x'], 'small.png', { type: 'image/png' });

beforeEach(() => jest.clearAllMocks());

describe('PlaceProfileFormDialog', () => {
    it('제목을 렌더하고, subtitle은 있으면 표시·없으면 미표시한다', () => {
        // The visible title is the level-1 heading (Radix DialogTitle adds an sr-only h2 for a11y).
        const { rerender } = render(<PlaceProfileFormDialog {...baseProps({ subtitle: 'the-subtitle' })} />);
        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('the-title');
        // A visible (non-sr-only) subtitle is rendered alongside the sr-only DialogDescription.
        expect(screen.getAllByText('the-subtitle').some(el => !el.className.includes('sr-only'))).toBe(true);

        rerender(<PlaceProfileFormDialog {...baseProps({ subtitle: undefined })} />);
        expect(screen.queryByText('the-subtitle')).not.toBeInTheDocument();
    });

    describe('생성형(초기값 없음)', () => {
        it('유효한 이름 입력 전에는 비활성, 입력하면 활성화된다', () => {
            render(<PlaceProfileFormDialog {...baseProps()} />);
            expect(submitBtn()).toBeDisabled();
            fireEvent.change(textbox(), { target: { value: 'sunny' } });
            expect(submitBtn()).toBeEnabled();
        });

        it('완료 시 trim된 nick과 thumbnail undefined로 onSubmit을 호출한다', async () => {
            const onSubmit = jest.fn().mockResolvedValue(undefined);
            render(<PlaceProfileFormDialog {...baseProps({ onSubmit })} />);
            fireEvent.change(textbox(), { target: { value: '  sunny  ' } });
            fireEvent.click(submitBtn());
            await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ nick: 'sunny', thumbnail: undefined }));
        });
    });

    describe('수정형(초기값 있음)', () => {
        it('변경 전에는 비활성(dirty 아님), 변경하면 활성, 되돌리면 다시 비활성', () => {
            render(<PlaceProfileFormDialog {...baseProps({ initialNick: 'sunny' })} />);
            expect(submitBtn()).toBeDisabled();
            fireEvent.change(textbox(), { target: { value: 'rainy' } });
            expect(submitBtn()).toBeEnabled();
            fireEvent.change(textbox(), { target: { value: 'sunny' } });
            expect(submitBtn()).toBeDisabled();
        });

        it('초기 thumbnail을 유지한 채 저장하면 thumbnail을 함께 보낸다', async () => {
            const onSubmit = jest.fn().mockResolvedValue(undefined);
            render(
                <PlaceProfileFormDialog
                    {...baseProps({ initialNick: 'sunny', initialThumbnail: 'data:img', onSubmit })}
                />
            );
            fireEvent.change(textbox(), { target: { value: 'rainy' } });
            fireEvent.click(submitBtn());
            await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ nick: 'rainy', thumbnail: 'data:img' }));
        });

        it('열려 있는 동안 초기값이 바뀌어도 사용자 입력을 덮어쓰지 않는다', () => {
            // The edit flow's initial values come from an observed cache that can emit while open.
            const { rerender } = render(<PlaceProfileFormDialog {...baseProps({ initialNick: 'old' })} />);
            expect(textbox()).toHaveValue('old');
            fireEvent.change(textbox(), { target: { value: 'typed-by-user' } });
            rerender(<PlaceProfileFormDialog {...baseProps({ initialNick: 'server-updated' })} />);
            expect(textbox()).toHaveValue('typed-by-user');
        });

        it('닫았다가 다시 열면 최신 초기값으로 다시 seed한다', () => {
            const { rerender } = render(<PlaceProfileFormDialog {...baseProps({ open: true, initialNick: 'a' })} />);
            fireEvent.change(textbox(), { target: { value: 'edited' } });
            rerender(<PlaceProfileFormDialog {...baseProps({ open: false, initialNick: 'a' })} />);
            rerender(<PlaceProfileFormDialog {...baseProps({ open: true, initialNick: 'b' })} />);
            expect(textbox()).toHaveValue('b');
        });
    });

    it('20자를 넘으면 21/20 카운터를 노출하고 완료가 비활성된다', () => {
        render(<PlaceProfileFormDialog {...baseProps()} />);
        fireEvent.change(textbox(), { target: { value: 'a'.repeat(21) } });
        expect(screen.getByText('21/20')).toBeInTheDocument();
        expect(submitBtn()).toBeDisabled();
    });

    it('저장 성공 시 성공 토스트를 띄우고 지연 후 onDone을 호출한다', async () => {
        jest.useFakeTimers();
        const onDone = jest.fn();
        const onSubmit = jest.fn().mockResolvedValue(undefined);
        render(<PlaceProfileFormDialog {...baseProps({ onSubmit, onDone })} />);

        fireEvent.change(textbox(), { target: { value: 'sunny' } });
        await act(async () => {
            fireEvent.click(submitBtn());
        });

        expect(screen.getByText('saved-ok')).toBeInTheDocument();
        expect(onDone).not.toHaveBeenCalled();

        act(() => jest.advanceTimersByTime(1300));
        expect(onDone).toHaveBeenCalledTimes(1);
        jest.useRealTimers();
    });

    it('저장 실패 시 에러 토스트를 띄우고 onDone을 호출하지 않으며 완료가 다시 활성된다', async () => {
        const onDone = jest.fn();
        const onSubmit = jest.fn().mockRejectedValue(new Error('boom'));
        render(<PlaceProfileFormDialog {...baseProps({ onSubmit, onDone })} />);

        fireEvent.change(textbox(), { target: { value: 'sunny' } });
        await act(async () => {
            fireEvent.click(submitBtn());
        });

        expect(await screen.findByText('save-failed')).toBeInTheDocument();
        expect(onDone).not.toHaveBeenCalled();
        expect(submitBtn()).toBeEnabled();
    });

    it('변경사항이 없으면 닫기 시 바로 onExit을 호출한다', () => {
        const onExit = jest.fn();
        render(<PlaceProfileFormDialog {...baseProps({ initialNick: 'sunny', onExit })} />);
        fireEvent.click(closeBtn());
        expect(onExit).toHaveBeenCalledTimes(1);
    });

    it('변경사항이 있으면 닫기 시 이탈 확인 모달을 띄우고, 나가기를 누르면 onExit', async () => {
        const onExit = jest.fn();
        render(<PlaceProfileFormDialog {...baseProps({ onExit })} />);

        fireEvent.change(textbox(), { target: { value: 'x' } });
        fireEvent.click(closeBtn());

        const leave = await screen.findByRole('button', { name: 'leave' });
        expect(onExit).not.toHaveBeenCalled();
        fireEvent.click(leave);
        expect(onExit).toHaveBeenCalledTimes(1);
    });

    it('10MB 초과 이미지는 에러 토스트를 띄우고 리사이즈를 시도하지 않는다', () => {
        render(<PlaceProfileFormDialog {...baseProps()} />);
        fireEvent.change(fileInput(), { target: { files: [bigFile()] } });
        expect(screen.getByText('image-too-big')).toBeInTheDocument();
        expect(resizeMock).not.toHaveBeenCalled();
    });

    it('허용 이미지는 리사이즈 후 미리보기로 반영된다', async () => {
        resizeMock.mockResolvedValue('data:image/png;base64,abc');
        render(<PlaceProfileFormDialog {...baseProps()} />);

        await act(async () => {
            fireEvent.change(fileInput(), { target: { files: [smallFile()] } });
        });

        // ProfileAvatar renders a decorative <img alt=""> (no `img` role), so query the node directly.
        await waitFor(() => expect(document.querySelector('img')).not.toBeNull());
        expect(document.querySelector('img')).toHaveAttribute('src', 'data:image/png;base64,abc');
    });
});
