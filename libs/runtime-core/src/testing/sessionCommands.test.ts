import { fakeSessionCommands } from './sessionCommands';

describe('fakeSessionCommands', () => {
    it('runs the commands a test passes', async () => {
        const commands = fakeSessionCommands({ switchSite: async () => undefined });

        await expect(commands.switchSite('site-1')).resolves.toBeUndefined();
    });

    it('rejects a command the test did not pass, naming it', async () => {
        await expect(fakeSessionCommands().logout()).rejects.toThrow('unexpected command: logout');
    });
});
