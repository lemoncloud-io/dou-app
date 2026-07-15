import '@testing-library/jest-dom';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { PlaceProfileCreateDialog } from './PlaceProfileCreateDialog';

const setMyProfileMock = jest.fn();

jest.mock('@chatic/app-runtime', () => ({
    useRuntimeRepositories: () => ({ profile: { setMyProfile: setMyProfileMock } }),
}));
jest.mock('@chatic/bridges', () => ({ logger: { error: jest.fn() } }));
jest.mock('@chatic/shared', () => ({ resizeImageToBase64: jest.fn() }));
jest.mock('react-i18next', () => ({
    // Echo the key (with the interpolated place appended) so assertions can target keys.
    useTranslation: () => ({ t: (k: string, o?: { place?: string }) => (o?.place ? `${k}|${o.place}` : k) }),
}));

const noop = () => undefined;
const done = () => screen.getByRole('button', { name: 'placeProfileCreate.done' });
const close = () => screen.getByRole('button', { name: 'placeProfileCreate.close' });

beforeEach(() => jest.clearAllMocks());

describe('PlaceProfileCreateDialog', () => {
    it('완료 버튼은 유효한 이름 전에는 비활성, 입력하면 활성화된다', () => {
        render(<PlaceProfileCreateDialog open placeName="북클럽" onDone={noop} onExit={noop} />);

        expect(done()).toBeDisabled();
        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'sunny' } });
        expect(done()).toBeEnabled();
    });

    it('20자를 넘으면 초과 카운터를 노출하고 완료가 비활성된다', () => {
        render(<PlaceProfileCreateDialog open placeName="p" onDone={noop} onExit={noop} />);

        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'a'.repeat(21) } });

        expect(screen.getByText('21/20')).toBeInTheDocument();
        expect(done()).toBeDisabled();
    });

    it('완료 시 setMyProfile을 trim된 nick과 함께 호출한다', async () => {
        setMyProfileMock.mockResolvedValue({});
        render(<PlaceProfileCreateDialog open placeName="p" onDone={noop} onExit={noop} />);

        fireEvent.change(screen.getByRole('textbox'), { target: { value: '  sunny  ' } });
        fireEvent.click(done());

        await waitFor(() => expect(setMyProfileMock).toHaveBeenCalledWith({ nick: 'sunny', thumbnail: undefined }));
    });

    it('입력이 없으면 닫기 시 바로 onExit을 호출한다', () => {
        const onExit = jest.fn();
        render(<PlaceProfileCreateDialog open placeName="p" onDone={noop} onExit={onExit} />);

        fireEvent.click(close());

        expect(onExit).toHaveBeenCalledTimes(1);
    });

    it('입력이 있으면 닫기 시 이탈 확인 모달을 띄우고, 나가기를 누르면 onExit', async () => {
        const onExit = jest.fn();
        render(<PlaceProfileCreateDialog open placeName="p" onDone={noop} onExit={onExit} />);

        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'x' } });
        fireEvent.click(close());

        const leave = await screen.findByRole('button', { name: 'placeProfileCreate.exitLeave' });
        expect(onExit).not.toHaveBeenCalled();

        fireEvent.click(leave);
        expect(onExit).toHaveBeenCalledTimes(1);
    });
});
