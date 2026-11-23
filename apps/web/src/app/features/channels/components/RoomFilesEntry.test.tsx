import '@testing-library/jest-dom';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { RoomFilesEntry } from './RoomFilesEntry';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
const mockNavigate = jest.fn();
jest.mock('@chatic/shared', () => ({
    ...jest.requireActual('@chatic/shared'),
    useNavigateWithTransition: () => mockNavigate,
}));

const mockCountRoomMedia = jest.fn();
jest.mock('@chatic/runtime', () =>
    require('@chatic/runtime/testing').fakeRuntimeModule({
        data: {
            useRuntimeRepositories: (() => {
                let graph: unknown;
                return () =>
                    (graph ??= { chat: { countRoomMedia: mockCountRoomMedia, observeList: () => () => undefined } });
            })(),
        },
    })
);

describe('RoomFilesEntry', () => {
    beforeEach(() => {
        mockCountRoomMedia.mockReset();
        mockNavigate.mockReset();
    });

    it('shows each tab’s count, photos and videos together, and opens the list on that tab', async () => {
        mockCountRoomMedia.mockResolvedValue({ image: 3, video: 2, file: 1, audio: 4, link: 0 });
        render(<RoomFilesEntry cid="c1" channelId="ch-1" />);

        await waitFor(() => expect(screen.getByText('5')).toBeInTheDocument());
        expect(mockCountRoomMedia).toHaveBeenCalledWith({ channelId: 'ch-1' });
        expect(screen.getByText('4')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /chat\.files\.tab\.audio/ }));
        expect(mockNavigate).toHaveBeenCalledWith('/channels/ch-1/files?tab=audio');
    });

    it('is not drawn when the installed app cannot answer yet', async () => {
        mockCountRoomMedia.mockRejectedValue(
            Object.assign(new Error('not in this app'), { code: 'RUNTIME_NOT_AVAILABLE' })
        );
        const { container } = render(<RoomFilesEntry cid="c1" channelId="ch-1" />);
        await waitFor(() => expect(container).toBeEmptyDOMElement());
    });

    it('keeps the area while another failure leaves the counts unknown', async () => {
        mockCountRoomMedia.mockRejectedValue(new Error('bridge timeout'));
        const { container } = render(<RoomFilesEntry cid="c1" channelId="ch-1" />);
        await waitFor(() => expect(mockCountRoomMedia).toHaveBeenCalled());
        expect(container).not.toBeEmptyDOMElement();
    });
});
