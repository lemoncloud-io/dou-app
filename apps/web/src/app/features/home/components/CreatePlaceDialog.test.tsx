import '@testing-library/jest-dom';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { CreatePlaceDialog } from './CreatePlaceDialog';

const createPlaceMock = jest.fn();
const switchSiteMock = jest.fn();

jest.mock('../hooks', () => ({ useCreatePlace: () => ({ createPlace: createPlaceMock }) }));
jest.mock('../../../runtime/useSiteSwitch', () => ({ useSiteSwitch: () => ({ switchSite: switchSiteMock }) }));
jest.mock('@chatic/bridges', () => ({ logger: { error: jest.fn() } }));
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
        render(<CreatePlaceDialog open onOpenChange={jest.fn()} />);

        expect(done()).toBeDisabled();
        type('책모임');
        expect(done()).toBeEnabled();
    });

    it('20자를 넘으면 초과 카운터를 노출하고 완료가 비활성된다', () => {
        render(<CreatePlaceDialog open onOpenChange={jest.fn()} />);

        type('a'.repeat(21));

        expect(screen.getByText('21/20')).toBeInTheDocument();
        expect(done()).toBeDisabled();
    });

    it('완료 시 trim된 이름으로 createPlace 후 새 플레이스로 전환하고 닫는다', async () => {
        createPlaceMock.mockResolvedValue({ id: 'site-1' });
        switchSiteMock.mockResolvedValue(undefined);
        const onOpenChange = jest.fn();
        render(<CreatePlaceDialog open onOpenChange={onOpenChange} />);

        type('  책모임  ');
        fireEvent.click(done());

        await waitFor(() => expect(createPlaceMock).toHaveBeenCalledWith({ name: '책모임', thumbnail: undefined }));
        await waitFor(() => expect(switchSiteMock).toHaveBeenCalledWith('site-1'));
        await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    });

    it('createPlace가 실패하면 에러를 노출하고 닫지 않으며 완료를 재활성한다', async () => {
        createPlaceMock.mockRejectedValue(new Error('nope'));
        const onOpenChange = jest.fn();
        render(<CreatePlaceDialog open onOpenChange={onOpenChange} />);

        type('책모임');
        fireEvent.click(done());

        await waitFor(() => expect(screen.getByText('createPlace.saveError')).toBeInTheDocument());
        expect(switchSiteMock).not.toHaveBeenCalled();
        expect(onOpenChange).not.toHaveBeenCalled();
        expect(done()).toBeEnabled();
    });

    it('플레이스는 만들어졌으므로 전환이 실패해도 오버레이를 닫는다', async () => {
        createPlaceMock.mockResolvedValue({ id: 'site-1' });
        switchSiteMock.mockRejectedValue(new Error('switch failed'));
        const onOpenChange = jest.fn();
        render(<CreatePlaceDialog open onOpenChange={onOpenChange} />);

        type('책모임');
        fireEvent.click(done());

        await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    });

    it('생성과 전환이 모두 성공하면 onCreated에 생성된 플레이스를 전달한다', async () => {
        createPlaceMock.mockResolvedValue({ id: 'site-1', name: '책모임' });
        switchSiteMock.mockResolvedValue(undefined);
        const onCreated = jest.fn();
        render(<CreatePlaceDialog open onOpenChange={jest.fn()} onCreated={onCreated} />);

        type('책모임');
        fireEvent.click(done());

        await waitFor(() => expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ id: 'site-1' })));
    });

    it('전환이 실패하면 onCreated를 호출하지 않는다 (프로필이 이전 스코프에 쓰이는 사고 방지)', async () => {
        createPlaceMock.mockResolvedValue({ id: 'site-1' });
        switchSiteMock.mockRejectedValue(new Error('switch failed'));
        const onOpenChange = jest.fn();
        const onCreated = jest.fn();
        render(<CreatePlaceDialog open onOpenChange={onOpenChange} onCreated={onCreated} />);

        type('책모임');
        fireEvent.click(done());

        await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
        expect(onCreated).not.toHaveBeenCalled();
    });

    it('입력이 없으면 닫기 시 바로 닫는다', () => {
        const onOpenChange = jest.fn();
        render(<CreatePlaceDialog open onOpenChange={onOpenChange} />);

        fireEvent.click(close());

        expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('입력이 있으면 닫기 시 이탈 확인 모달을 띄우고, 나가기를 누르면 닫는다', async () => {
        const onOpenChange = jest.fn();
        render(<CreatePlaceDialog open onOpenChange={onOpenChange} />);

        type('x');
        fireEvent.click(close());

        const leave = await screen.findByRole('button', { name: 'createPlace.exitLeave' });
        expect(onOpenChange).not.toHaveBeenCalled();

        fireEvent.click(leave);
        expect(onOpenChange).toHaveBeenCalledWith(false);
    });
});
