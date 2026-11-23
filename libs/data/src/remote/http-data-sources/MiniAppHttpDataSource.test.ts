import { MiniAppHttpDataSource, MiniAppSaveRefused, miniAppSaveProblemOf } from './MiniAppHttpDataSource';
import type { MiniAppHttpDomainGateway } from '../gateways';

const relayError = (status: number, data: unknown) =>
    Object.assign(new Error(`Request failed with status code ${status}`), { response: { status, data } });

describe('MiniAppHttpDataSource', () => {
    let gateway: jest.Mocked<MiniAppHttpDomainGateway>;
    let dataSource: MiniAppHttpDataSource;

    beforeEach(() => {
        gateway = { list: jest.fn(), create: jest.fn(), update: jest.fn(), remove: jest.fn() };
        dataSource = new MiniAppHttpDataSource(gateway);
    });

    describe('listMiniApps', () => {
        it('keeps the relay order and every status, inactive and held included', async () => {
            gateway.list.mockResolvedValue({
                list: [
                    { id: 'm2', name: 'B', url: 'https://b.example/', state$: { use: 'off' }, status: 'inactive' },
                    { id: 'm1', name: 'A', url: 'https://a.example/', state$: { use: 'on' }, status: 'active' },
                    {
                        id: 'm3',
                        name: 'C',
                        url: 'https://c.example/',
                        state$: { use: 'on', hold: 'admin' },
                        status: 'held',
                    },
                ],
                total: 3,
            } as never);

            await expect(dataSource.listMiniApps('c1')).resolves.toEqual([
                { id: 'm2', name: 'B', url: 'https://b.example/', enabled: false, status: 'inactive' },
                { id: 'm1', name: 'A', url: 'https://a.example/', enabled: true, status: 'active' },
                { id: 'm3', name: 'C', url: 'https://c.example/', enabled: true, status: 'held' },
            ]);
            expect(gateway.list).toHaveBeenCalledWith('c1');
        });

        it('drops an entry with no id', async () => {
            gateway.list.mockResolvedValue({ list: [{ name: 'X' }, { id: 'm1', status: 'active' }] } as never);

            const list = await dataSource.listMiniApps('c1');

            expect(list.map(app => app.id)).toEqual(['m1']);
        });

        it('reads a missing or unknown status as inactive, and missing fields as empty', async () => {
            gateway.list.mockResolvedValue({ list: [{ id: 'm1' }, { id: 'm2', status: 'open' }] } as never);

            await expect(dataSource.listMiniApps('c1')).resolves.toEqual([
                { id: 'm1', name: '', url: '', enabled: false, status: 'inactive' },
                { id: 'm2', name: '', url: '', enabled: false, status: 'inactive' },
            ]);
        });
    });

    describe('addMiniApp', () => {
        beforeEach(() => gateway.create.mockResolvedValue({ id: 'm1', status: 'active' } as never));

        it('sends no state$ when enabled is left out, so the relay default applies', async () => {
            await dataSource.addMiniApp('c1', { name: 'Shop', url: 'https://shop.example/' });

            expect(gateway.create).toHaveBeenCalledWith({ cloudId: 'c1', name: 'Shop', url: 'https://shop.example/' });
        });

        it('maps enabled true/false to use on/off', async () => {
            await dataSource.addMiniApp('c1', { name: 'Shop', url: 'https://shop.example/', enabled: true });
            await dataSource.addMiniApp('c1', { name: 'Shop', url: 'https://shop.example/', enabled: false });

            expect(gateway.create.mock.calls.map(([body]) => body.state$)).toEqual([{ use: 'on' }, { use: 'off' }]);
        });

        it('returns the stored mini app as domain', async () => {
            gateway.create.mockResolvedValue({
                id: 'm9',
                name: 'Shop',
                url: 'https://shop.example/',
                state$: { use: 'on' },
                status: 'active',
            } as never);

            await expect(dataSource.addMiniApp('c1', { name: 'Shop', url: 'https://shop.example/' })).resolves.toEqual({
                id: 'm9',
                name: 'Shop',
                url: 'https://shop.example/',
                enabled: true,
                status: 'active',
            });
        });
    });

    describe('updateMiniApp', () => {
        beforeEach(() => gateway.update.mockResolvedValue({ id: 'm1', status: 'inactive' } as never));

        it('sends only the fields in the patch', async () => {
            await dataSource.updateMiniApp('m1', { enabled: false });
            await dataSource.updateMiniApp('m1', { name: 'New' });

            expect(gateway.update).toHaveBeenNthCalledWith(1, 'm1', { state$: { use: 'off' } });
            expect(gateway.update).toHaveBeenNthCalledWith(2, 'm1', { name: 'New' });
        });

        it('refuses an empty patch without sending anything', async () => {
            await expect(dataSource.updateMiniApp('m1', {})).rejects.toThrow('nothing to update');
            expect(gateway.update).not.toHaveBeenCalled();
        });

        it('sends only the patch fields it knows, never a hold spread into the patch', async () => {
            gateway.list.mockResolvedValue({
                list: [
                    {
                        id: 'm1',
                        name: 'A',
                        url: 'https://a.example/',
                        state$: { use: 'on', hold: 'admin' },
                        status: 'held',
                    },
                ],
            } as never);
            const [read] = await dataSource.listMiniApps('c1');

            await dataSource.updateMiniApp('m1', { ...read, ...({ state$: { hold: '' } } as object) });

            const [, body] = gateway.update.mock.calls[0];
            expect(body).toEqual({ name: 'A', url: 'https://a.example/', state$: { use: 'on' } });
            expect(JSON.stringify(body)).not.toContain('hold');
        });
    });

    describe('removeMiniApp', () => {
        it('deletes by id and resolves with nothing', async () => {
            gateway.remove.mockResolvedValue({ id: 'm1' } as never);

            await expect(dataSource.removeMiniApp('m1')).resolves.toBeUndefined();
            expect(gateway.remove).toHaveBeenCalledWith('m1');
        });
    });

    describe('refusals', () => {
        const scope = 'bodyToModel(miniapp/)';
        it.each([
            ['nameMissing', 400, `400 INVALID - .name (string) is required - ${scope}`],
            ['nameTooLong', 400, `400 INVALID - .name is too long (max 30) - ${scope}`],
            ['invalidUrl', 400, `400 INVALID - .url[http://shop.example/] is invalid - ${scope}`],
            ['invalidUrl', 400, '400 INVALID - .url (string) is required'],
            ['hubUrl', 400, `400 INVALID - .url[https://x.apps.chatic.io/] is hub - ${scope}`],
            ['tooMany', 409, '409 QUOTA EXCEEDED - max[10] current[10]'],
        ])('%s — %d %s', async (problem, status, text) => {
            gateway.create.mockRejectedValue(relayError(status, text));
            gateway.update.mockRejectedValue(relayError(status, text));

            const added = dataSource.addMiniApp('c1', { name: 'n', url: 'u' });
            await expect(added).rejects.toBeInstanceOf(MiniAppSaveRefused);
            await expect(added).rejects.toMatchObject({ problem, name: 'MiniAppSaveRefused', code: problem });
            await expect(dataSource.updateMiniApp('m1', { url: 'u' })).rejects.toMatchObject({ problem });
        });

        it.each([
            ['another verdict', `400 INVALID - .url[a] is hub b] is invalid - ${scope}`],
            ["another rule's words", `400 INVALID - .url[x .name is too long y] is invalid - ${scope}`],
            [
                'a line that looks like a refusal',
                `400 INVALID - .url[x\n400 INVALID - .name is too long] is invalid - ${scope}`,
            ],
        ])('reads the verdict after the address, whatever the address holds — %s', async (_label, text) => {
            gateway.create.mockRejectedValue(relayError(400, text));

            await expect(dataSource.addMiniApp('c1', { name: 'n', url: 'u' })).rejects.toMatchObject({
                problem: 'invalidUrl',
            });
        });

        it('reads a refusal that arrives as the message alone, with its status leading the text', async () => {
            gateway.create.mockRejectedValue(new Error(`400 INVALID - .name is too long (max 30) - ${scope}`));

            await expect(dataSource.addMiniApp('c1', { name: 'n', url: 'u' })).rejects.toMatchObject({
                problem: 'nameTooLong',
            });
        });

        it('keeps the original error as the cause', async () => {
            const original = relayError(409, '409 QUOTA EXCEEDED - max[10] current[10]');
            gateway.create.mockRejectedValue(original);

            await expect(dataSource.addMiniApp('c1', { name: 'n', url: 'u' })).rejects.toMatchObject({
                cause: original,
            });
        });

        it.each([
            ['not the owner', relayError(403, '403 FORBIDDEN - not owner of cloud')],
            ['hold in the body', relayError(403, '403 FORBIDDEN - hold is only for admin')],
            ['no cloud', relayError(404, '404 NOT FOUND - cloud')],
            ['no mini app', relayError(404, '404 NOT FOUND - miniapp')],
            ['the network', Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' })],
            ['a 409 that is not the cap', relayError(409, '409 CONFLICT - something else')],
        ])('rethrows %s unchanged', async (_label, error) => {
            gateway.create.mockRejectedValue(error);
            gateway.update.mockRejectedValue(error);

            await expect(dataSource.addMiniApp('c1', { name: 'n', url: 'u' })).rejects.toBe(error);
            await expect(dataSource.updateMiniApp('m1', { name: 'n' })).rejects.toBe(error);
        });
    });
});

describe('miniAppSaveProblemOf', () => {
    it('reads the reason off the error itself', () => {
        expect(miniAppSaveProblemOf(new MiniAppSaveRefused('hubUrl'))).toBe('hubUrl');
    });

    it('reads the reason off an error that crossed the bridge', () => {
        const crossed = Object.assign(new Error('save refused'), { name: 'MiniAppSaveRefused', code: 'tooMany' });

        expect(miniAppSaveProblemOf(crossed)).toBe('tooMany');
    });

    it('is null for any other error, or an unknown code', () => {
        expect(miniAppSaveProblemOf(Object.assign(new Error('x'), { code: 'tooMany' }))).toBeNull();
        expect(
            miniAppSaveProblemOf(Object.assign(new Error('x'), { name: 'MiniAppSaveRefused', code: 'other' }))
        ).toBeNull();
        expect(miniAppSaveProblemOf(null)).toBeNull();
        expect(miniAppSaveProblemOf('nameMissing')).toBeNull();
    });
});
