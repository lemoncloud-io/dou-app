import { bootNode } from './boot';
import { runCli } from './cli';
import { startMcp } from './mcp/serveMcp';
import { shellLink } from './mcp/shellLink';
import { PARENT_PIPE_FLAG, watchParentPipe } from './parentPipe';
import { startSidecarPush } from './push/sidecarPush';

const VERSION = '0.0.1';

const controller = new AbortController();
process.once('SIGINT', () => controller.abort());
process.once('SIGTERM', () => controller.abort());
if (process.argv.includes(PARENT_PIPE_FLAG)) watchParentPipe(process.stdin, () => controller.abort());

const io = {
    out: (line: string) => process.stdout.write(`${line}\n`),
    err: (line: string) => process.stderr.write(`${line}\n`),
};

runCli(process.argv.slice(2), {
    boot: bootNode,
    io,
    signal: controller.signal,
    hooks: {
        onReady: async (_booted, profile, env) => {
            const stopMcp = await startMcp(profile, VERSION);
            const stopPush = startSidecarPush({ profile, env, call: shellLink(profile), log: io.err });
            return async () => {
                stopPush();
                await stopMcp();
            };
        },
    },
})
    .catch(error => {
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
        return 1;
    })
    .then(code => process.exit(code));
