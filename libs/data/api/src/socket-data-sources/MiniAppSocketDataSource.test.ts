import { MiniAppSocketDataSource } from './MiniAppSocketDataSource';
import { MiniAppSaveRefused } from '../miniAppSaveRefused';
import type { MiniAppSocketDomainGateway } from '../gateways';

const socketError = (text: string, action: string) => new Error(`${text} - miniapp.${action}:error`);

describe('MiniAppSocketDataSource', () => {
    let gateway: jest.Mocked<MiniAppSocketDomainGateway>;
    let dataSource: MiniAppSocketDataSource;

    beforeEach(() => {
        gateway = { list: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() } as never;
        dataSource = new MiniAppSocketDataSource(gateway);
    });

    describe('listMiniApps', () => {
        it('asks for the list with no paging and keeps the server order and every status', async () => {
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
                        uid: 'someone',
                    },
                ],
                total: 3,
                page: 0,
                limit: 10,
            });

            await expect(dataSource.listMiniApps()).resolves.toEqual([
                { id: 'm2', name: 'B', url: 'https://b.example/', enabled: false, status: 'inactive' },
                { id: 'm1', name: 'A', url: 'https://a.example/', enabled: true, status: 'active' },
                { id: 'm3', name: 'C', url: 'https://c.example/', enabled: true, status: 'held' },
            ]);
            expect(gateway.list).toHaveBeenCalledWith();
        });

        it('drops an entry with no id', async () => {
            gateway.list.mockResolvedValue({ list: [{ name: 'X' }, { id: 'm1', status: 'active' }] });

            const list = await dataSource.listMiniApps();

            expect(list.map(app => app.id)).toEqual(['m1']);
        });

        it('reads a missing or unknown status as inactive, and missing fields as empty', async () => {
            gateway.list.mockResolvedValue({ list: [{ id: 'm1' }, { id: 'm2', status: 'open' }] });

            await expect(dataSource.listMiniApps()).resolves.toEqual([
                { id: 'm1', name: '', url: '', enabled: false, status: 'inactive' },
                { id: 'm2', name: '', url: '', enabled: false, status: 'inactive' },
            ]);
        });

        it('reads an answer with no list as empty', async () => {
            gateway.list.mockResolvedValue({ total: 0 });

            await expect(dataSource.listMiniApps()).resolves.toEqual([]);
        });

        it('rejects a failed list as it came', async () => {
            const error = socketError('403 IDENTITY-TOKEN - site is required', 'list');
            gateway.list.mockRejectedValue(error);

            await expect(dataSource.listMiniApps()).rejects.toBe(error);
        });
    });

    describe('addMiniApp', () => {
        beforeEach(() => gateway.create.mockResolvedValue({ id: 'm1', status: 'active' }));

        it('sends no state$ when enabled is left out, so the server default applies', async () => {
            await dataSource.addMiniApp({ name: 'Shop', url: 'https://shop.example/' });

            expect(gateway.create).toHaveBeenCalledWith({ name: 'Shop', url: 'https://shop.example/' });
        });

        it('maps enabled true/false to use on/off', async () => {
            await dataSource.addMiniApp({ name: 'Shop', url: 'https://shop.example/', enabled: true });
            await dataSource.addMiniApp({ name: 'Shop', url: 'https://shop.example/', enabled: false });

            expect(gateway.create.mock.calls.map(([body]) => body.state$)).toEqual([{ use: 'on' }, { use: 'off' }]);
        });

        it('returns the stored mini app as domain', async () => {
            gateway.create.mockResolvedValue({
                id: 'm9',
                name: 'Shop',
                url: 'https://shop.example/',
                state$: { use: 'on' },
                status: 'active',
            });

            await expect(dataSource.addMiniApp({ name: 'Shop', url: 'https://shop.example/' })).resolves.toEqual({
                id: 'm9',
                name: 'Shop',
                url: 'https://shop.example/',
                enabled: true,
                status: 'active',
            });
        });
    });

    describe('updateMiniApp', () => {
        beforeEach(() => gateway.update.mockResolvedValue({ id: 'm1', status: 'inactive' }));

        it('sends the id and only the fields in the patch', async () => {
            await dataSource.updateMiniApp('m1', { enabled: false });
            await dataSource.updateMiniApp('m1', { name: 'New' });

            expect(gateway.update).toHaveBeenNthCalledWith(1, { id: 'm1', state$: { use: 'off' } });
            expect(gateway.update).toHaveBeenNthCalledWith(2, { id: 'm1', name: 'New' });
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
            });
            const [read] = await dataSource.listMiniApps();

            await dataSource.updateMiniApp('m1', { ...read, ...({ state$: { hold: '' } } as object) });

            const [body] = gateway.update.mock.calls[0];
            expect(body).toEqual({ id: 'm1', name: 'A', url: 'https://a.example/', state$: { use: 'on' } });
            expect(JSON.stringify(body)).not.toContain('hold');
        });
    });

    describe('removeMiniApp', () => {
        it('deletes by id and resolves with nothing', async () => {
            gateway.delete.mockResolvedValue({ id: 'm1' });

            await expect(dataSource.removeMiniApp('m1')).resolves.toBeUndefined();
            expect(gateway.delete).toHaveBeenCalledWith({ id: 'm1' });
        });
    });

    describe('refusals', () => {
        it.each([
            ['nameMissing', '400 INVALID - .name (string) is required - bodyToModel(miniapp/)'],
            ['nameTooLong', '400 INVALID - .name is too long (max 30) - bodyToModel(miniapp/)'],
            ['invalidUrl', '400 INVALID - .url[http://shop.example/] is invalid - bodyToModel(miniapp/)'],
            ['hubUrl', '400 INVALID - .url[https://x.apps.chatic.io/] is hub - bodyToModel(miniapp/)'],
            ['tooMany', '409 QUOTA EXCEEDED - max[10] current[10]'],
        ])('turns %s into the save reason on add and update', async (problem, text) => {
            gateway.create.mockRejectedValue(socketError(text, 'create'));
            gateway.update.mockRejectedValue(socketError(text, 'update'));

            const added = dataSource.addMiniApp({ name: 'n', url: 'u' });
            await expect(added).rejects.toBeInstanceOf(MiniAppSaveRefused);
            await expect(added).rejects.toMatchObject({ problem, name: 'MiniAppSaveRefused', code: problem });
            await expect(dataSource.updateMiniApp('m1', { url: 'u' })).rejects.toMatchObject({ problem });
        });

        it("refuses changing someone else's mini app as notAllowed", async () => {
            gateway.update.mockRejectedValue(socketError('403 NOT ALLOWED - action[update] is invalid', 'update'));

            await expect(dataSource.updateMiniApp('m1', { name: 'n' })).rejects.toMatchObject({
                problem: 'notAllowed',
            });
        });

        it("refuses removing someone else's mini app as notAllowed too", async () => {
            const original = socketError('403 NOT ALLOWED - action[delete] is invalid', 'delete');
            gateway.delete.mockRejectedValue(original);

            await expect(dataSource.removeMiniApp('m1')).rejects.toMatchObject({
                problem: 'notAllowed',
                cause: original,
            });
        });

        it('does not read a connection refused by policy as notAllowed', async () => {
            const error = socketError('403 NOT ALLOWED - denied by policy', 'update');
            gateway.update.mockRejectedValue(error);
            gateway.delete.mockRejectedValue(error);

            await expect(dataSource.updateMiniApp('m1', { name: 'n' })).rejects.toBe(error);
            await expect(dataSource.removeMiniApp('m1')).rejects.toBe(error);
        });

        it('rejects a missing mini app as it came', async () => {
            const error = socketError('404 NOT FOUND - miniapp', 'delete');
            gateway.delete.mockRejectedValue(error);

            await expect(dataSource.removeMiniApp('m1')).rejects.toBe(error);
        });
    });
});
