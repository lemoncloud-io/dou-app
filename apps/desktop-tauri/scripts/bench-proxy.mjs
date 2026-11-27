import http from 'node:http';

const target = process.argv[2] ?? 'https://dou-dev.chatic.io';
const port = Number(process.argv[3] ?? 5006);

http.createServer(async (req, res) => {
    try {
        const upstream = await fetch(new URL(req.url ?? '/', target), {
            method: req.method,
            headers: { accept: req.headers.accept ?? '*/*', 'user-agent': req.headers['user-agent'] ?? '' },
            redirect: 'manual',
        });
        const headers = Object.fromEntries(
            [...upstream.headers].filter(
                ([k]) => !['content-encoding', 'content-length', 'transfer-encoding'].includes(k)
            )
        );
        res.writeHead(upstream.status, headers);
        res.end(Buffer.from(await upstream.arrayBuffer()));
    } catch (error) {
        res.writeHead(502).end(String(error));
    }
}).listen(port, '127.0.0.1', () => console.log('proxy', target, 'on', port));
