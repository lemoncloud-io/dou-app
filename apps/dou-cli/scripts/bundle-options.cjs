const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const FCM_KEYS = [
    'VITE_FCM_API_KEY',
    'VITE_FCM_PROJECT_ID',
    'VITE_FCM_SENDER_ID',
    'VITE_FCM_APP_ID',
    'VITE_FCM_PACKAGE',
];

const fcmDefine = env => {
    if (!FCM_KEYS.every(name => env[name])) return {};
    const values = Object.fromEntries(FCM_KEYS.map(name => [name, env[name]]));
    return { 'process.env.DOU_BUILD_FCM': JSON.stringify(JSON.stringify(values)) };
};

const protoTexts = (directory, name, seen = new Set()) => {
    if (seen.has(name)) return [];
    seen.add(name);
    const text = readFileSync(join(directory, name), 'utf8');
    const imports = [...text.matchAll(/^import\s+"([^"]+)";/gm)].map(match => match[1]);
    return [...imports.flatMap(imported => protoTexts(directory, imported, seen)), text];
};

const PROTO_LOAD = /\b(?:protobuf\.)?load\(\s*path\.(?:resolve|join)\(\s*__dirname\s*,\s*'([\w.-]+\.proto)'\s*\)\s*\)/g;
const RECEIVER_FILE = /[\\/]@liamcottle[\\/]push-receiver[\\/]src[\\/].+\.js$/;

const inlineLoads = (source, directory) =>
    source.replace(PROTO_LOAD, (_match, name) => {
        const texts = JSON.stringify(protoTexts(directory, name));
        return `Promise.resolve(((p) => { const root = new p.Root(); for (const text of ${texts}) p.parse(text, root); return root; })(require('protobufjs')))`;
    });

const pushProtos = {
    name: 'push-protos',
    setup(build) {
        build.onLoad({ filter: RECEIVER_FILE }, args => {
            const source = readFileSync(args.path, 'utf8');
            if (!source.includes('.proto')) return undefined;
            const contents = inlineLoads(source, join(args.path, '..'));
            if (/__dirname\s*,\s*'[\w.-]+\.proto'/.test(contents)) {
                throw new Error(`push-protos: a proto load in ${args.path} has a shape this plugin does not inline`);
            }
            return { contents, loader: 'js' };
        });
    },
};

module.exports = { FCM_KEYS, fcmDefine, protoTexts, pushProtos };
