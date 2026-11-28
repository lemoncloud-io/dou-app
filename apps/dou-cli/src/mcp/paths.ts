import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export type Endpoint = 'mcp' | 'shell';

export const endpointFile = (profile: string, endpoint: Endpoint): string =>
    join(profile, `${endpoint}.${process.platform === 'win32' ? 'pipe' : 'sock'}`);

export const resolveEndpoint = (profile: string, endpoint: Endpoint): string => {
    const file = endpointFile(profile, endpoint);
    return process.platform === 'win32' ? readFileSync(file, 'utf8').trim() : file;
};
