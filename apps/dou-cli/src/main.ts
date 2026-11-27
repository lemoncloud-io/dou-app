import { bootNode } from './boot';
import { runCli } from './cli';
import { startMcp } from './mcp/serveMcp';
import { PARENT_PIPE_FLAG, watchParentPipe } from './parentPipe';

const VERSION = '0.0.1';

const controller = new AbortController();
process.once('SIGINT', () => controller.abort());
process.once('SIGTERM', () => controller.abort());
if (process.argv.includes(PARENT_PIPE_FLAG)) watchParentPipe(process.stdin, () => controller.abort());

runCli(process.argv.slice(2), {
    boot: bootNode,
    io: {
        out: line => process.stdout.write(`${line}\n`),
        err: line => process.stderr.write(`${line}\n`),
    },
    signal: controller.signal,
    hooks: { onReady: (_booted, profile) => startMcp(profile, VERSION) },
})
    .catch(error => {
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
        return 1;
    })
    .then(code => process.exit(code));
