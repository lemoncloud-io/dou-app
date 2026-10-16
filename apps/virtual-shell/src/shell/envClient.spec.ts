import { requestEnv } from './envClient';

const answer = (status: number, body: unknown) =>
    vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));

describe('requestEnv', () => {
    it("sends the shell's own header and returns where the other pair is", async () => {
        const fetchImpl = answer(200, { ok: true, url: 'http://localhost:5017/__shell/' });

        await expect(requestEnv('prod', fetchImpl as never)).resolves.toEqual({
            ok: true,
            url: 'http://localhost:5017/__shell/',
        });
        expect(fetchImpl).toHaveBeenCalledWith(
            '/__shell/api/env',
            expect.objectContaining({
                method: 'POST',
                headers: expect.objectContaining({ 'x-virtual-shell': '1' }),
                body: '{"env":"prod"}',
            })
        );
    });

    it('passes on what stops the switch', async () => {
        const problems = [{ message: 'apps/web/.env.prod is missing', fix: 'ask a teammate' }];

        await expect(requestEnv('prod', answer(200, { ok: false, problems }) as never)).resolves.toEqual({
            ok: false,
            problems,
        });
        await expect(
            requestEnv('prod', answer(501, { ok: false, reason: 'not started by yarn local' }) as never)
        ).resolves.toEqual({
            ok: false,
            problems: [{ message: 'not started by yarn local' }],
        });
    });

    it('says so when the server does not answer', async () => {
        const fetchImpl = vi.fn(async () => {
            throw new TypeError('Failed to fetch');
        });

        await expect(requestEnv('dev', fetchImpl as never)).resolves.toMatchObject({ ok: false });
    });
});
