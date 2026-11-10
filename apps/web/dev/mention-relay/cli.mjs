#!/usr/bin/env node
import { acknowledgePacket, probeRelay, receivePacket, relayStatus, replyTarget, stopRelay } from './relay.mjs';

const [command, path, marker, target, ...extra] = process.argv.slice(2);
try {
    if (
        !path ||
        extra.length ||
        !['status', 'receive', 'ack', 'stop', 'probe', 'reply-target'].includes(command) ||
        (['receive', 'ack', 'reply-target'].includes(command) ? !marker : marker) ||
        (command === 'reply-target' ? !['channel', 'thread'].includes(target) : target)
    ) {
        throw new Error(
            'Usage: cli.mjs status|stop <stateDir>; receive|ack <stateDir> <marker>; reply-target <stateDir> <marker> <channel|thread>; probe <configPath>'
        );
    }
    if (command === 'receive') {
        process.stdout.write(`${receivePacket(path, marker)}\n`);
    } else {
        const result =
            command === 'status'
                ? relayStatus(path)
                : command === 'stop'
                  ? stopRelay(path)
                  : command === 'ack'
                    ? acknowledgePacket(path, marker)
                    : command === 'reply-target'
                      ? replyTarget(path, marker, target)
                      : await probeRelay(path);
        process.stdout.write(`${JSON.stringify(result)}\n`);
    }
} catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : 'Relay command failed'}\n`);
    process.exitCode = 1;
}
