/**
 * Ports for the web dev server and Metro. Other sessions routinely hold the defaults (5003 for the
 * web, 8081 for Metro), and a busy default is worse than a refused one: the app would quietly load
 * another checkout's web or bundle. So the harness never uses the defaults and never kills a holder;
 * it picks free ports from its own ranges.
 *
 * Both ports end up inside the native build (the web URL through the env file, the Metro port as a
 * build setting), so the choice is remembered per checkout and reused while it stays free — a new
 * port means a rebuild.
 */
const net = require('net');

const RANGES = Object.freeze({ web: [5100, 5199], metro: [8100, 8199] });

function canListen(port, host) {
    return new Promise(resolve => {
        const server = net.createServer();
        server.once('error', error => resolve(error.code === 'EADDRNOTAVAIL'));
        server.listen({ port, host, exclusive: true }, () => server.close(() => resolve(true)));
    });
}

/** Something already accepts connections there — a listener on all interfaces, say. */
function answers(port, host) {
    return new Promise(resolve => {
        const socket = net.connect({ port, host });
        socket.setTimeout(1000);
        socket.once('connect', () => {
            socket.destroy();
            resolve(true);
        });
        socket.once('timeout', () => {
            socket.destroy();
            resolve(false);
        });
        socket.once('error', () => resolve(false));
    });
}

/**
 * Free on both loopbacks: vite binds `localhost`, which may resolve to either. Binding alone is not
 * proof — on macOS a loopback bind can succeed beside another process listening on all interfaces —
 * so a port that accepts a connection counts as taken too.
 */
async function isPortFree(port) {
    if ((await answers(port, '127.0.0.1')) || (await answers(port, '::1'))) return false;
    return (await canListen(port, '127.0.0.1')) && (await canListen(port, '::1'));
}

/**
 * The remembered port when it is still free; otherwise the first free one in the range, starting
 * from a per-checkout offset so two checkouts do not both start probing at the bottom.
 */
async function pickPort({ preferred, range, seed = 0, isFree = isPortFree, exclude = [] }) {
    if (preferred && !exclude.includes(preferred) && (await isFree(preferred))) return preferred;
    const [low, high] = range;
    const size = high - low + 1;
    for (let i = 0; i < size; i++) {
        const port = low + ((seed + i) % size);
        if (exclude.includes(port)) continue;
        if (await isFree(port)) return port;
    }
    return null;
}

/** A small stable number from a string (the checkout path), for `pickPort`'s seed. */
function seedFrom(text) {
    let hash = 0;
    for (const char of text) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    return hash % 100;
}

module.exports = { RANGES, isPortFree, pickPort, seedFrom };
