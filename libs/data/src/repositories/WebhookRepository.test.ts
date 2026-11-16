import { WebhookRepository } from './WebhookRepository';

describe('WebhookRepository', () => {
    const create = () => {
        const dataSource = {
            list: jest.fn(),
            makeToken: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
        };
        return {
            dataSource,
            repository: new WebhookRepository(dataSource as any, {
                getContext: () => ({}),
                setContext: () => undefined,
            }),
        };
    };

    it('lists the first page and maps rows', async () => {
        const { dataSource, repository } = create();
        dataSource.list.mockResolvedValue({ list: [{ id: 'a', channelId: 'C-1', disabled: true }] });
        const rows = await repository.list('C-1');
        expect(dataSource.list).toHaveBeenCalledWith({ channelId: 'C-1', page: 0, limit: 50 });
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ id: 'a', paused: true });
    });

    it('treats a missing list as empty', async () => {
        const { dataSource, repository } = create();
        dataSource.list.mockResolvedValue({});
        await expect(repository.list('C-1')).resolves.toEqual([]);
    });

    it('issue returns the token once and keeps nothing', async () => {
        const { dataSource, repository } = create();
        dataSource.makeToken.mockResolvedValue({ id: 'a', Token: 'wh:a:b', Location: 'https://h' });
        const issued = await repository.issue('C-1', { name: 'ci', expiresAt: 0 });
        expect(dataSource.makeToken).toHaveBeenCalledWith({ channelId: 'C-1', name: 'ci', expiresAt: 0 });
        expect(issued.token).toBe('wh:a:b');
        expect(JSON.stringify(Object.values(repository))).not.toContain('wh:a:b');
    });

    it('issue rejects without leaking the answer when there is no token', async () => {
        const { dataSource, repository } = create();
        dataSource.makeToken.mockResolvedValue({ id: 'a' });
        await expect(repository.issue('C-1')).rejects.toThrow('without a token');
    });

    it('pause, resume and expiry send the keys the server reads (false and 0 included)', async () => {
        const { dataSource, repository } = create();
        dataSource.update.mockResolvedValue({ id: 'a' });
        await repository.setPaused('a', false);
        await repository.setExpiresAt('a', 0);
        expect(dataSource.update).toHaveBeenNthCalledWith(1, { id: 'a', disabled: false });
        expect(dataSource.update).toHaveBeenNthCalledWith(2, { id: 'a', expiresAt: 0 });
    });

    it('remove deletes by id', async () => {
        const { dataSource, repository } = create();
        dataSource.delete.mockResolvedValue({});
        await repository.remove('a');
        expect(dataSource.delete).toHaveBeenCalledWith({ id: 'a' });
    });
});
