// Packs a built page into the zip that is handed over: the folder's contents at the top of the archive
// (`index.html`, `.well-known/chatic-app.json`, `assets/…`), and nothing else. Plain Node, no packages,
// so a copy of this script works in any project:
//
//     node scripts/zip-bundle.mjs <built folder> <archive.zip>
//
// Entries are sorted and dated 1980-01-01, so the same build always packs to the same bytes.
import { readdirSync, readFileSync, lstatSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { deflateRawSync } from 'node:zlib';

const [from, to] = process.argv.slice(2);
if (!from || !to) {
    console.error('usage: node zip-bundle.mjs <built folder> <archive.zip>');
    process.exit(2);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
});
const crc32 = bytes => {
    let c = 0xffffffff;
    for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
};

const files = [];
const walk = dir => {
    for (const name of readdirSync(dir).sort()) {
        const path = join(dir, name);
        const stat = lstatSync(path);
        if (stat.isSymbolicLink()) throw new Error(`${path} is a link; the bundle holds files only.`);
        if (stat.isDirectory()) walk(path);
        else files.push(path);
    }
};
walk(from);
for (const required of ['index.html', join('.well-known', 'chatic-app.json')]) {
    if (!files.includes(join(from, required))) {
        throw new Error(`${join(from, required)} is missing: build the page first.`);
    }
}

// 1980-01-01 00:00 in DOS time and date.
const TIME = 0;
const DATE = (0 << 9) | (1 << 5) | 1;
const locals = [];
const central = [];
let offset = 0;
for (const path of files) {
    const name = Buffer.from(relative(from, path).split(sep).join('/'));
    const data = readFileSync(path);
    const packed = deflateRawSync(data);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // names are UTF-8
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(TIME, 10);
    local.writeUInt16LE(DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, packed);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4); // version made by
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0x0800, 8);
    entry.writeUInt16LE(8, 10);
    entry.writeUInt16LE(TIME, 12);
    entry.writeUInt16LE(DATE, 14);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(packed.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(name.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, name);
    offset += local.length + name.length + packed.length;
}
const directory = Buffer.concat(central);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(directory.length, 12);
end.writeUInt32LE(offset, 16);

mkdirSync(dirname(to), { recursive: true });
writeFileSync(to, Buffer.concat([...locals, directory, end]));
console.log(`${to}: ${files.length} files`);
