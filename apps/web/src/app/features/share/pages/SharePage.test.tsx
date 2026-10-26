import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { fetchShareIntake, releaseShareIntake } from '../../../bridge/shareIntake';
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
});

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
    it('cancel discards the copies and goes home', async () => {
        (fetchShareIntake as jest.Mock).mockResolvedValue({
            items: [{ uri: `${dir}/a.pdf`, name: 'a.pdf', type: 'application/pdf', size: 1, kind: 'file' }],
            refused: [],
        });
        renderAt(`/share?id=${id}`);
        await screen.findByText('a.pdf');

        fireEvent.click(screen.getByRole('button', { name: 'share.close' }));

        expect(releaseShareIntake).toHaveBeenCalledWith(id, { discard: true });
        expect(await screen.findByText('home')).toBeTruthy();
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
