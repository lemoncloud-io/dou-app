import { parseArgs } from 'node:util';

import type { Boot, Booted } from './boot';
import { cloudsCommand } from './commands/clouds';
import { pairCommand } from './commands/pair';
import { serveCommand } from './commands/serve';
import type { ServeHooks } from './commands/serve';
import { whoamiCommand } from './commands/whoami';
import { resolveProfile } from './profile';

export interface CliIo {
    out(line: string): void;
    err(line: string): void;
}

export interface CommandContext {
    io: CliIo;
    signal: AbortSignal;
    booted: Booted;
    hooks: ServeHooks;
}

const COMMANDS = {
    pair: pairCommand,
    whoami: whoamiCommand,
    clouds: cloudsCommand,
    serve: serveCommand,
} as const;

type CommandName = keyof typeof COMMANDS;

const USAGE = 'usage: dou-cli [--profile <dir>] <pair|whoami|clouds|serve>';

const isCommand = (name: string | undefined): name is CommandName => name !== undefined && name in COMMANDS;

export interface RunCliOptions {
    boot: Boot;
    io: CliIo;
    signal?: AbortSignal;
    hooks?: ServeHooks;
}

export const runCli = async (argv: string[], { boot, io, signal, hooks = {} }: RunCliOptions): Promise<number> => {
    let parsed: ReturnType<typeof parse>;
    try {
        parsed = parse(argv);
    } catch (error) {
        io.err(`${error instanceof Error ? error.message : String(error)}\n${USAGE}`);
        return 2;
    }
    const [name] = parsed.positionals;
    if (parsed.values.help || !isCommand(name)) {
        io.err(USAGE);
        return parsed.values.help ? 0 : 2;
    }
    const booted = await boot({ profile: resolveProfile(parsed.values.profile), writeLine: io.out });
    try {
        return await COMMANDS[name]({ io, signal: signal ?? new AbortController().signal, booted, hooks });
    } finally {
        if (name !== 'serve') await booted.stop();
    }
};

const parse = (argv: string[]) =>
    parseArgs({
        args: argv,
        allowPositionals: true,
        options: { profile: { type: 'string' }, help: { type: 'boolean', short: 'h' } },
    });
