import { render } from '@testing-library/react';

import { runtime } from '@chatic/app-runtime';

import { useCloudSelfChannels } from '../features/channels/hooks';
import { useChatSyncRegistration } from '../hooks/useChatSyncRegistration';
import { useHomeChannels } from '../hooks/useHomeChannels';
import { ChatSyncRunner } from './ChatSyncRunner';

jest.mock('@chatic/app-runtime', () => ({
    runtime: { session: { useSessionSelection: jest.fn() } },
}));
jest.mock('../hooks/useChatSyncRegistration', () => ({ useChatSyncRegistration: jest.fn() }));
jest.mock('../hooks/useHomeChannels', () => ({ useHomeChannels: jest.fn() }));
jest.mock('../features/channels/hooks', () => ({ useCloudSelfChannels: jest.fn() }));

describe('ChatSyncRunner', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (runtime.session.useSessionSelection as jest.Mock).mockReturnValue({ selectedSiteId: '10001' });
    });

    it("registers the chat sync for the session place's rooms and the cloud's notes-to-self room", () => {
        (useHomeChannels as jest.Mock).mockReturnValue({ channels: [{ id: 'c1' }, { id: 'c2' }], isLoading: false });
        (useCloudSelfChannels as jest.Mock).mockReturnValue({ channels: [{ id: 'self' }], isLoading: false });

        const { container } = render(<ChatSyncRunner />);

        expect(useHomeChannels).toHaveBeenCalledWith('10001');
        expect(useChatSyncRegistration).toHaveBeenCalledWith([{ id: 'c1' }, { id: 'c2' }, { id: 'self' }]);
        expect(container.innerHTML).toBe('');
    });

    it('passes the notes-to-self room once when the place slice already holds it', () => {
        (useHomeChannels as jest.Mock).mockReturnValue({ channels: [{ id: 'c1' }, { id: 'self' }], isLoading: false });
        (useCloudSelfChannels as jest.Mock).mockReturnValue({ channels: [{ id: 'self' }], isLoading: false });

        render(<ChatSyncRunner />);

        expect(useChatSyncRegistration).toHaveBeenCalledWith([{ id: 'c1' }, { id: 'self' }]);
    });
});
