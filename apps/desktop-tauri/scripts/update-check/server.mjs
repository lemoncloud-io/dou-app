import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const port = Number(process.argv[2] ?? 4174);
const feedDir = process.argv[3];
const expected = process.argv[4];
const limitMs = Number(process.argv[5] ?? 240000);
const page = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'page.html'));

const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    if (url.pathname === '/log') {
        const line = url.searchParams.get('line') ?? '';
        console.log('page: ' + line);
        response.end('ok');
        if (line === 'loaded version ' + expected) {
            console.log('update: the app restarted into ' + expected);
            process.exit(0);
        }
        return;
    }
    if (url.pathname === '/latest.json' || url.pathname === '/app.tar.gz') {
        console.log('feed: ' + url.pathname);
        response.end(readFileSync(join(feedDir, url.pathname.slice(1))));
        return;
    }
    response.setHeader('content-type', 'text/html; charset=utf-8');
    response.end(page);
});

server.listen(port, () => console.log('update: serving on ' + port));
setTimeout(() => {
    console.log('update: the app never reached ' + expected);
    process.exit(1);
}, limitMs);
