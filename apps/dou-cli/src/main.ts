import { bootNode } from './boot';
import { runCli } from './cli';

const controller = new AbortController();
process.once('SIGINT', () => controller.abort());
process.once('SIGTERM', () => controller.abort());

const code = await runCli(process.argv.slice(2), {
    boot: bootNode,
    io: {
        out: line => process.stdout.write(`${line}\n`),
        err: line => process.stderr.write(`${line}\n`),
    },
    signal: controller.signal,
});
process.exit(code);
