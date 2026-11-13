import { PAGE_REPOSITORY_REFUSED, TOKEN_ISSUING_AUTH_METHODS, pageRepositoriesOf } from './pageRepositories';

class FakeAuthRepository {
    private readonly secret = 'kept-private';
    sendPhoneCode = jest.fn(async () => ({ sent: true }));
    confirmPhoneCode = jest.fn(async () => ({ linked: true }));
    login = jest.fn(async () => ({ Token: { identityToken: 'secret' } }));
    dispose = jest.fn();
    readSecret() {
        return this.secret;
    }
    get secretLength() {
        return this.secret.length;
    }
    // A method that reaches another of its own through `this`.
    sendTwice = async () => {
        await this.sendPhoneCode();
        return this.sendPhoneCode();
    };
    relay() {
        return this.readSecret();
    }
}

const graphOf = () =>
    ({
        auth: new FakeAuthRepository(),
        pairing: {
            requestPairing: jest.fn(async () => ({ code: '1234' })),
            claimPairing: jest.fn(),
            dispose: jest.fn(),
        },
        chat: { sendChat: jest.fn(async () => ({ id: 'chat-1' })), dispose: jest.fn() },
        withContext: jest.fn(),
        dispose: jest.fn(),
    }) as never;

const refused = { code: PAGE_REPOSITORY_REFUSED };

describe("the page's repository graph", () => {
    it('is the same object for the same graph, and so is each repository', () => {
        const graph = graphOf();

        expect(pageRepositoriesOf(graph)).toBe(pageRepositoriesOf(graph));
        expect(pageRepositoriesOf(graph).chat).toBe(pageRepositoriesOf(graph).chat);
    });

    it("runs a repository's methods on the repository itself, private members and all", async () => {
        const graph = graphOf();
        const page = pageRepositoriesOf(graph) as never as {
            auth: FakeAuthRepository;
            chat: { sendChat: () => unknown };
        };

        await expect(page.chat.sendChat()).resolves.toEqual({ id: 'chat-1' });
        expect(page.auth.readSecret()).toBe('kept-private');
    });

    it("reads a getter and lets a method reach the repository's other members", async () => {
        const graph = graphOf() as never as { auth: FakeAuthRepository };
        const page = pageRepositoriesOf(graph as never) as never as { auth: FakeAuthRepository };

        expect(page.auth.secretLength).toBe('kept-private'.length);
        expect(page.auth.relay()).toBe('kept-private');
        await page.auth.sendTwice();
        expect(graph.auth.sendPhoneCode).toHaveBeenCalledTimes(2);
    });

    it('refuses every token issuer, and leaves the account checks', async () => {
        const page = pageRepositoriesOf(graphOf()) as never as Record<string, Record<string, () => unknown>>;

        await expect(page.auth.sendPhoneCode()).resolves.toEqual({ sent: true });
        for (const method of TOKEN_ISSUING_AUTH_METHODS.filter(m => m !== 'confirmPhoneCode')) {
            expect(() => page.auth[method]()).toThrow(expect.objectContaining(refused));
        }
    });

    it("confirms a phone code to link it, never to sign in — that answer carries the session's token", async () => {
        const graph = graphOf() as never as { auth: FakeAuthRepository };
        const page = pageRepositoriesOf(graph as never) as never as {
            auth: { confirmPhoneCode: (p: string, o: string, options: { mode: string }) => Promise<unknown> };
        };

        await expect(page.auth.confirmPhoneCode('+1', '0000', { mode: 'link' })).resolves.toEqual({ linked: true });
        expect(() => page.auth.confirmPhoneCode('+1', '0000', { mode: 'login' })).toThrow(
            expect.objectContaining(refused)
        );
        expect(graph.auth.confirmPhoneCode).toHaveBeenCalledTimes(1);
    });

    it("refuses a pairing claim — a relay approval's session — and the lifecycle of the graph and its repositories", () => {
        const page = pageRepositoriesOf(graphOf()) as never as Record<string, Record<string, () => unknown>> & {
            withContext: () => unknown;
            dispose: () => unknown;
        };

        expect(() => page.pairing.claimPairing()).toThrow(expect.objectContaining(refused));
        expect(() => page.chat.dispose()).toThrow(expect.objectContaining(refused));
        expect(() => page.withContext()).toThrow(expect.objectContaining(refused));
        expect(() => page.dispose()).toThrow(expect.objectContaining(refused));
    });
});
