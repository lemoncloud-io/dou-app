import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const port = Number(process.argv[2] ?? 4173);
const limitMs = Number(process.argv[3] ?? 120000);
const page = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'page.html'));

const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    if (url.pathname === '/done') {
        response.end('ok');
        const ok = url.searchParams.get('ok') === '1';
        console.log(
            ok
                ? 'smoke: the shell answered the handshake and the vault round trip'
                : 'smoke: failed: ' + url.searchParams.get('why')
        );
        server.close();
        process.exit(ok ? 0 : 1);
    }
    response.setHeader('content-type', 'text/html; charset=utf-8');
    response.end(page);
});

server.listen(port, () => console.log('smoke: serving on ' + port));
setTimeout(() => {
    console.log('smoke: the shell never reported back');
    process.exit(1);
}, limitMs);
