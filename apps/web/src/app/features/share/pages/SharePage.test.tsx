import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';

import { fetchShareIntake } from '../../../bridge/shareIntake';
import { ShareRoutes } from '../routes';
import { SharePage } from './SharePage';

jest.mock('../../../bridge/shareIntake', () => ({
    fetchShareIntake: jest.fn(),
    releaseShareIntake: jest.fn().mockResolvedValue(undefined),
}));
const mockToast = jest.fn();
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({
    useToast: () => ({ toast: mockToast }),
    toast: (...args: unknown[]) => mockToast(...args),
}));
jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, options?: Record<string, unknown>) => (options ? `${key}|${JSON.stringify(options)}` : key),
        i18n: { language: 'ko' },
    }),
}));

const mockSend = jest.fn();
jest.mock('../hooks/useShareSend', () => ({
    useShareSend: () => ({ register: jest.fn(), send: mockSend, isSending: false }),
}));
const mockChangeCloud = jest.fn();
const mockChangePlace = jest.fn();
let mockCloud: Record<string, unknown>;
jest.mock('../hooks/useShareCloud', () => ({ useShareCloud: () => mockCloud }));
let mockDestinations: Array<Record<string, unknown>>;
jest.mock('../hooks/useShareDestinations', () => ({
    ...jest.requireActual('../hooks/useShareDestinations'),
    useShareDestinations: () => ({ destinations: mockDestinations, isLoading: false }),
}));
// The room's own send is exercised by `useShareSend`; here a picked room only has to be mounted.
jest.mock('../components/DestinationSender', () => ({ DestinationSender: () => null }));

const id = '3f2b8c1e-9a4d-4c7b-8e21-5d6f7a8b9c0d';
const dir = `file:///cache/attach-pick/${id}`;

const renderAt = (path: string) =>
    render(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
            <MemoryRouter initialEntries={[path]}>
                <Routes>
                    <Route path="/" element={<p>home</p>} />
                    <Route path="/share" element={<SharePage />} />
                </Routes>
            </MemoryRouter>
        </QueryClientProvider>
    );

beforeEach(() => {
    jest.clearAllMocks();
    mockCloud = {
        clouds: [
            { id: 'default', name: 'Dou home' },
            { id: 'cloud-a', name: 'Acme' },
        ],
        places: [
            { id: 'place-1', name: 'Team' },
            { id: 'place-2', name: 'Ops' },
        ],
        selectedCloudId: 'cloud-a',
        selectedPlaceId: 'place-1',
        isRelay: false,
        isSwitching: false,
        changeCloud: mockChangeCloud.mockResolvedValue(true),
        changePlace: mockChangePlace,
    };
    mockDestinations = [
        { id: 'self', cid: 'cloud-a', kind: 'self', title: 'Notes' },
        { id: 'dm-1', cid: 'cloud-a', kind: 'dm', title: 'Alice' },
        { id: 'ch-1', cid: 'cloud-a', kind: 'group', title: 'General' },
        { id: 'ch-2', cid: 'cloud-a', kind: 'group', title: 'Design' },
        { id: 'ch-3', cid: 'cloud-a', kind: 'group', title: 'Random' },
        { id: 'ch-4', cid: 'cloud-a', kind: 'group', title: 'Support' },
    ];
});

const pdf = (name: string) => ({ uri: `${dir}/${name}`, name, type: 'application/pdf', size: 1, kind: 'file' });

/** Opens the "To" list, ticks the named rooms and confirms. */
const pick = (...titles: string[]) => {
    fireEvent.click(screen.getByRole('button', { name: /share\.to\b/ }));
    for (const title of titles) fireEvent.click(screen.getByRole('checkbox', { name: new RegExp(title) }));
    fireEvent.click(screen.getByRole('button', { name: 'share.done' }));
};

describe('SharePage — what was shared', () => {
    it('lists the shared items and the shared text', async () => {
        (fetchShareIntake as jest.Mock).mockResolvedValue({
            items: [
                { uri: `${dir}/IMG_1.jpg`, name: 'IMG_1.jpg', type: 'image/jpeg', size: 2048, kind: 'file' },
                { uri: `${dir}/report.pdf`, name: 'report.pdf', type: 'application/pdf', size: 4096, kind: 'file' },
            ],
            refused: [],
            text: 'https://example.com/a',
        });

        renderAt(`/share?id=${id}`);

        expect(await screen.findByText('IMG_1.jpg')).toBeTruthy();
        expect(screen.getByText('report.pdf')).toBeTruthy();
        expect(screen.getByText('https://example.com/a')).toBeTruthy();
        expect(fetchShareIntake).toHaveBeenCalledWith(id);
    });

    it('drops an item the person removes, and leaves the rest', async () => {
        (fetchShareIntake as jest.Mock).mockResolvedValue({
            items: [
                { uri: `${dir}/a.pdf`, name: 'a.pdf', type: 'application/pdf', size: 1, kind: 'file' },
                { uri: `${dir}/b.pdf`, name: 'b.pdf', type: 'application/pdf', size: 1, kind: 'file' },
            ],
            refused: [],
        });
        renderAt(`/share?id=${id}`);
        await screen.findByText('a.pdf');

        fireEvent.click(screen.getByRole('button', { name: /chat\.attach\.removeFile.*a\.pdf/ }));

        expect(screen.queryByText('a.pdf')).toBeNull();
        expect(screen.getByText('b.pdf')).toBeTruthy();
    });

    it('names what the app would not copy', async () => {
        (fetchShareIntake as jest.Mock).mockResolvedValue({
            items: [{ uri: `${dir}/a.pdf`, name: 'a.pdf', type: 'application/pdf', size: 1, kind: 'file' }],
            refused: [{ name: 'setup.exe', kind: 'file', reason: 'unsupported' }],
        });

        renderAt(`/share?id=${id}`);

        expect(await screen.findByText(/share\.notSent.*setup\.exe/)).toBeTruthy();
    });

    it('shows a preparing state while the app is still copying', async () => {
        (fetchShareIntake as jest.Mock).mockReturnValue(new Promise(() => undefined));

        renderAt(`/share?id=${id}`);

        expect(await screen.findByText('share.preparing')).toBeTruthy();
    });
});

describe('SharePage — leaving', () => {
    // Discarding the copies as the page goes is `useShareSend`'s, and tested there.
    it('cancel goes home', async () => {
        (fetchShareIntake as jest.Mock).mockResolvedValue({
            items: [{ uri: `${dir}/a.pdf`, name: 'a.pdf', type: 'application/pdf', size: 1, kind: 'file' }],
            refused: [],
        });
        renderAt(`/share?id=${id}`);
        await screen.findByText('a.pdf');

        fireEvent.click(screen.getByRole('button', { name: 'share.close' }));

        expect(await screen.findByText('home')).toBeTruthy();
    });

    it('starts a fresh page when another share arrives while one is open', async () => {
        const otherId = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
        (fetchShareIntake as jest.Mock).mockImplementation(async (shareId: string) => ({
            items: [
                {
                    uri: `${dir}/${shareId}.pdf`,
                    name: `${shareId}.pdf`,
                    type: 'application/pdf',
                    size: 1,
                    kind: 'file',
                },
            ],
            refused: [],
        }));
        const NextShare = () => {
            const navigate = useNavigate();
            return <button onClick={() => navigate(`/share?id=${otherId}`)}>next share</button>;
        };
        render(
            <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
                <MemoryRouter initialEntries={[`/share?id=${id}`]}>
                    <Routes>
                        <Route
                            path="/share/*"
                            element={
                                <>
                                    <ShareRoutes />
                                    <NextShare />
                                </>
                            }
                        />
                    </Routes>
                </MemoryRouter>
            </QueryClientProvider>
        );
        await screen.findByText(`${id}.pdf`);
        fireEvent.change(screen.getByRole('textbox', { name: 'share.messagePlaceholder' }), {
            target: { value: 'for the first share' },
        });

        fireEvent.click(screen.getByRole('button', { name: 'next share' }));

        await screen.findByText(`${otherId}.pdf`);
        expect((screen.getByRole('textbox', { name: 'share.messagePlaceholder' }) as HTMLTextAreaElement).value).toBe(
            ''
        );
    });

    it('goes home with a notice when there is nothing to share', async () => {
        (fetchShareIntake as jest.Mock).mockResolvedValue(null);

        renderAt(`/share?id=${id}`);

        expect(await screen.findByText('home')).toBeTruthy();
        expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'share.nothingToShare' }));
    });

    it('goes home without asking the app when the URL carries no id', async () => {
        renderAt('/share');

        expect(await screen.findByText('home')).toBeTruthy();
        expect(fetchShareIntake).not.toHaveBeenCalled();
    });

    it('offers a retry when loading failed, and asks again', async () => {
        (fetchShareIntake as jest.Mock)
            .mockRejectedValueOnce(Object.assign(new Error('slow'), { code: 'TIMEOUT' }))
            .mockResolvedValueOnce({
                items: [{ uri: `${dir}/a.pdf`, name: 'a.pdf', type: 'application/pdf', size: 1, kind: 'file' }],
                refused: [],
            });
        renderAt(`/share?id=${id}`);

        fireEvent.click(await screen.findByRole('button', { name: 'share.retry' }));

        await waitFor(() => expect(screen.getByText('a.pdf')).toBeTruthy());
    });
});

describe('SharePage — sending', () => {
    it('sends the files, with the message and the shared text as the caption, to the rooms picked', async () => {
        (fetchShareIntake as jest.Mock).mockResolvedValue({
            items: [pdf('a.pdf')],
            refused: [],
            text: 'https://example.com/a',
        });
        renderAt(`/share?id=${id}`);
        await screen.findByText('a.pdf');

        pick('Alice', 'General');
        fireEvent.change(screen.getByRole('textbox', { name: 'share.messagePlaceholder' }), {
            target: { value: ' look ' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'share.send' }));

        expect(mockSend).toHaveBeenCalledWith({
            destinations: [mockDestinations[1], mockDestinations[2]],
            files: [pdf('a.pdf')],
            content: 'look\nhttps://example.com/a',
        });
    });

    it('cannot send before a room is picked', async () => {
        (fetchShareIntake as jest.Mock).mockResolvedValue({ items: [pdf('a.pdf')], refused: [] });
        renderAt(`/share?id=${id}`);
        await screen.findByText('a.pdf');

        expect(screen.getByRole('button', { name: 'share.send' })).toHaveProperty('disabled', true);
    });

    it('sends the first ten files and names the rest, and what the server refuses, as not sent', async () => {
        const many = Array.from({ length: 12 }, (_, index) => pdf(`f${index + 1}.pdf`));
        const exe = {
            uri: `${dir}/setup.exe`,
            name: 'setup.exe',
            type: 'application/x-msdownload',
            size: 1,
            kind: 'file',
        };
        (fetchShareIntake as jest.Mock).mockResolvedValue({ items: [...many, exe], refused: [] });
        renderAt(`/share?id=${id}`);
        await screen.findByText('f1.pdf');

        expect(screen.getByText(/share\.notSent/).textContent).toMatch(
            /f11\.pdf, f12\.pdf, setup\.exe|setup\.exe.*f11\.pdf/
        );
        pick('General');
        fireEvent.click(screen.getByRole('button', { name: 'share.send' }));

        expect(mockSend.mock.calls[0][0].files).toEqual(many.slice(0, 10));
    });

    it('keeps the picks a cancelled "To" list made from reaching the composer', async () => {
        (fetchShareIntake as jest.Mock).mockResolvedValue({ items: [pdf('a.pdf')], refused: [] });
        renderAt(`/share?id=${id}`);
        await screen.findByText('a.pdf');

        fireEvent.click(screen.getByRole('button', { name: /share\.to\b/ }));
        fireEvent.click(screen.getByRole('checkbox', { name: /General/ }));
        fireEvent.click(screen.getByRole('button', { name: 'share.cancel' }));

        expect(screen.getByText('share.toPlaceholder')).toBeTruthy();
    });

    it('opens the "To" list as its own history entry, so back closes it', async () => {
        (fetchShareIntake as jest.Mock).mockResolvedValue({ items: [pdf('a.pdf')], refused: [] });

        renderAt(`/share?id=${id}&to=1`);

        expect(await screen.findByRole('searchbox', { name: 'share.searchPlaceholder' })).toBeTruthy();
    });

    it('stops at five rooms', async () => {
        (fetchShareIntake as jest.Mock).mockResolvedValue({ items: [pdf('a.pdf')], refused: [] });
        renderAt(`/share?id=${id}`);
        await screen.findByText('a.pdf');

        pick('Notes', 'Alice', 'General', 'Design', 'Random', 'Support');

        expect(mockToast).toHaveBeenCalledWith({ title: 'share.limit|{"max":5}' });
        expect(screen.queryByText(/Support/)).toBeNull();
    });

    it('finds a room by name in the "To" list', async () => {
        (fetchShareIntake as jest.Mock).mockResolvedValue({ items: [pdf('a.pdf')], refused: [] });
        renderAt(`/share?id=${id}`);
        await screen.findByText('a.pdf');

        fireEvent.click(screen.getByRole('button', { name: /share\.to\b/ }));
        fireEvent.change(screen.getByRole('searchbox', { name: 'share.searchPlaceholder' }), {
            target: { value: 'des' },
        });

        expect(screen.getAllByRole('checkbox').map(row => row.textContent)).toEqual(['Design']);
    });
});

describe('SharePage — cloud and place', () => {
    it('changes the cloud from its row', async () => {
        (fetchShareIntake as jest.Mock).mockResolvedValue({ items: [pdf('a.pdf')], refused: [] });
        renderAt(`/share?id=${id}`);
        await screen.findByText('a.pdf');

        fireEvent.click(screen.getByRole('button', { name: /share\.cloud/ }));
        fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /Dou home/ }));

        expect(mockChangeCloud).toHaveBeenCalledWith('default');
    });

    it('drops the picked rooms once the place has changed', async () => {
        (fetchShareIntake as jest.Mock).mockResolvedValue({ items: [pdf('a.pdf')], refused: [] });
        // One client and one router across the rerender, so the page stays mounted and keeps its picks.
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        const tree = () => (
            <QueryClientProvider client={client}>
                <MemoryRouter initialEntries={[`/share?id=${id}`]}>
                    <Routes>
                        <Route path="/share" element={<SharePage />} />
                    </Routes>
                </MemoryRouter>
            </QueryClientProvider>
        );
        const view = render(tree());
        await screen.findByText('a.pdf');
        pick('General');
        expect(screen.getByText('General')).toBeTruthy();

        mockChangePlace.mockResolvedValue(true);
        fireEvent.click(screen.getByRole('button', { name: /share\.place/ }));
        fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /Ops/ }));
        mockCloud = { ...mockCloud, selectedPlaceId: 'place-2' };
        view.rerender(tree());

        expect(mockChangePlace).toHaveBeenCalledWith('place-2');
        await waitFor(() => expect(screen.getByText('share.toPlaceholder')).toBeTruthy());
    });

    it('keeps the picked rooms when the place switch fails', async () => {
        (fetchShareIntake as jest.Mock).mockResolvedValue({ items: [pdf('a.pdf')], refused: [] });
        mockChangePlace.mockResolvedValue(false);
        renderAt(`/share?id=${id}`);
        await screen.findByText('a.pdf');
        pick('General');

        fireEvent.click(screen.getByRole('button', { name: /share\.place/ }));
        fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /Ops/ }));

        await waitFor(() => expect(mockChangePlace).toHaveBeenCalledWith('place-2'));
        expect(screen.getByText('General')).toBeTruthy();
    });

    it('has no place row on Dou home, whose one place is chosen for the person', async () => {
        mockCloud = { ...mockCloud, selectedCloudId: 'default', isRelay: true };
        (fetchShareIntake as jest.Mock).mockResolvedValue({ items: [pdf('a.pdf')], refused: [] });
        renderAt(`/share?id=${id}`);
        await screen.findByText('a.pdf');

        expect(screen.queryByRole('button', { name: /share\.place/ })).toBeNull();
    });
});
