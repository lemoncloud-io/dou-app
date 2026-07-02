#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const http2 = require('http2');
const jwt = require('jsonwebtoken');
const { initializeApp, cert } = require('firebase-admin/app');
const { getMessaging } = require('firebase-admin/messaging');

// Defaults
const TEAM_ID = 'CH8U9VM6SR';
const BUNDLE_ID_DEV = 'io.chatic.dou.dev';
const BUNDLE_ID_PROD = 'io.chatic.dou';
const SERVICE_ACCOUNT_FILE = 'serviceAccountKey.json';

function printHelp() {
    console.log(`
\x1b[1m\x1b[36mChatic Push Notification Testing CLI\x1b[0m
Usage:
  node scripts/send-test-push.js [android|ios] [device-token] [options]

Options:
  --type <type>        Push message type (default: "chat")
  --channel <id>       Notification Channel ID (default: "dou_chat")
                       Options: dou_chat, dou_chat_muted, dou_notice, dou_marketing, dou_cloud
  --room <id>          Chat room / channelId (default: "room_123"); also builds the default link
  --link <url>         Target deep link URL (default: "/channels/<room>/room")
  --cid <id>           Cloud id in custom payload (default: "cloud_test_id")
  --sid <id>           Site id in custom payload (default: "site_test_id")
  --uid <id>           User id in custom payload (default: "user_test_id")
  --title <text>       Sender name / Title argument (default: "홍길동")
  --body <text>        Message content / Body argument (default: "오늘 회의 참석하시나요?")
  --silent             Send as a silent background push (NO banner — wakes app only; see notes)
  --prod               (iOS only) Target APNs Production instead of Sandbox (uses Production AuthKey & Bundle ID)
  --key-file <file>    (iOS only) Override the path to the APNs .p8 key file
  --key-id <id>        (iOS only) Override the APNs Key ID (e.g. 5P79KV86A5)
  --team-id <id>       (iOS only) Override Apple Team ID (default: ${TEAM_ID})
  --bundle <id>        (iOS only) Override target bundle identifier

APNs AuthKey Naming Convention (Auto-detected in root folder):
  - Dev Key:  AuthKey_DEV_<KEY_ID>.p8  (e.g., AuthKey_DEV_5P79KV86A5.p8)
  - Prod Key: AuthKey_PROD_<KEY_ID>.p8 (e.g., AuthKey_PROD_XXXXXXXXXX.p8)

FCM Service Account Naming:
  - serviceAccountKey.json (in root folder)

Background Delivery Notes (iOS):
  - A --silent push (content-available) shows NO banner and does NOT run the
    Notification Service Extension; it only wakes the app for background work.
    iOS also will NOT deliver it if the app was force-quit (swiped away).
  - To show a banner while the app is backgrounded or closed, send WITHOUT
    --silent (alert push: mutable-content + alert -> NSE localizes via loc keys).
  - Sandbox vs Production must match the installed build: Xcode/dev builds use
    sandbox (default); TestFlight/App Store builds require --prod.

Sample Commands:
  # 1. Android FCM - Default Chat Push
  node scripts/send-test-push.js android fcm_token_here

  # 2. Android FCM - Custom Chat Message & Room Deep Link
  node scripts/send-test-push.js android fcm_token_here --title "이영희" --body "회의 문서 준비되었습니다." --room room_456

  # 3. Android FCM - Service Notice Push (dou_notice channel)
  node scripts/send-test-push.js android fcm_token_here --channel dou_notice --title "공지사항" --body "새로운 서비스 업데이트가 완료되었습니다."

  # 4. iOS APNs - Sandbox (Development) Default Chat Push
  node scripts/send-test-push.js ios apns_token_here

  # 5. iOS APNs - Sandbox (Development) Silent Background Sync Push
  node scripts/send-test-push.js ios apns_token_here --silent

  # 6. iOS APNs - Production Chat Push (Uses AuthKey_PROD_*.p8 and bundle io.chatic.dou)
  node scripts/send-test-push.js ios apns_token_here --prod
`);
}

// Parse CLI arguments
const args = process.argv.slice(2);
if (args.length < 2 || args.includes('--help') || args.includes('-h')) {
    printHelp();
    process.exit(0);
}

const platform = args[0].toLowerCase();
const deviceToken = args[1];

if (platform !== 'android' && platform !== 'ios') {
    console.error('\x1b[31mError: Platform must be either "android" or "ios".\x1b[0m');
    process.exit(1);
}

// Options parsing helper
function getOptionValue(flag, defaultValue) {
    const idx = args.indexOf(flag);
    if (idx !== -1 && idx + 1 < args.length) {
        return args[idx + 1];
    }
    return defaultValue;
}

const pushType = getOptionValue('--type', 'chat');
const channelId = getOptionValue('--channel', 'dou_chat');
// Chat room id, used both as the deep-link target and as the payload `channelId`.
const roomId = getOptionValue('--room', '1000095');
// Deep-link spec: canonical path `/channels/{channelId}/room`. The leading slash is
// required so the mobile DeeplinkService can normalize it to the custom scheme.
const link = getOptionValue('--link', `/channels/${roomId}/room`);
const titleArg = getOptionValue('--title', '홍길동');
const bodyArg = getOptionValue('--body', '오늘 회의 참석하시나요?');
// Server-context ids carried inside the custom payload (cloud / site / user).
const cid = getOptionValue('--cid', '1000001');
const sid = getOptionValue('--sid', '10024');
const uid = getOptionValue('--uid', 'user_test_id');
const isSilent = args.includes('--silent');
const isProd = args.includes('--prod');

// Resolve iOS config dynamically if platform is iOS
let keyFile = getOptionValue('--key-file', null);
let keyId = getOptionValue('--key-id', null);
const teamId = getOptionValue('--team-id', TEAM_ID);
const bundleId = getOptionValue('--bundle', isProd ? BUNDLE_ID_PROD : BUNDLE_ID_DEV);

if (platform === 'ios') {
    const files = fs.readdirSync(process.cwd());

    if (isProd) {
        if (!keyFile) {
            // Auto detect AuthKey_PROD_*.p8
            const prodFile = files.find(f => f.startsWith('AuthKey_PROD') && f.endsWith('.p8'));
            keyFile = prodFile || 'AuthKey_PROD.p8';
        }
        if (!keyId && keyFile) {
            const match = keyFile.match(/AuthKey_PROD_([A-Z0-9]{10})\.p8/i);
            keyId = match ? match[1] : null;
        }
    } else {
        if (!keyFile) {
            // Auto detect AuthKey_DEV_*.p8 or specific legacy AuthKey_5P79KV86A5.p8
            const devFile =
                files.find(f => f.startsWith('AuthKey_DEV') && f.endsWith('.p8')) ||
                files.find(f => f.startsWith('AuthKey_5P79KV86A5') && f.endsWith('.p8'));
            keyFile = devFile || 'AuthKey_DEV.p8';
        }
        if (!keyId && keyFile) {
            const match = keyFile.match(/AuthKey_(?:DEV_)?([A-Z0-9]{10})\.p8/i);
            keyId = match ? match[1] : null;
        }
    }

    // Automatically rename AuthKey_DEV.p8 or AuthKey_PROD.p8 to append the Key ID if provided
    if (keyId && (keyFile === 'AuthKey_DEV.p8' || keyFile === 'AuthKey_PROD.p8')) {
        const fileExt = path.extname(keyFile);
        const fileBase = path.basename(keyFile, fileExt);
        const newKeyFile = `${fileBase}_${keyId}${fileExt}`;
        if (fs.existsSync(keyFile)) {
            try {
                fs.renameSync(keyFile, newKeyFile);
                console.log(
                    `\x1b[33m[Auto-Rename] Renamed key file ${keyFile} to ${newKeyFile} to persist Key ID.\x1b[0m`
                );
                keyFile = newKeyFile;
            } catch (err) {
                console.warn(`\x1b[33m[Warning] Could not rename key file: ${err.message}\x1b[0m`);
            }
        }
    }
}

console.log(`
\x1b[1m\x1b[34m[Push Config]\x1b[0m
Platform:      ${platform.toUpperCase()}
Token:         ${deviceToken.substring(0, 15)}...
Type:          ${pushType}
Channel ID:    ${channelId}
Link:          ${link}
Room (chan):   ${roomId}
Cloud (cid):   ${cid}
Site (sid):    ${sid}
User (uid):    ${uid}
Title Arg:     ${titleArg}
Body Arg:      ${bodyArg}
Silent Push:   ${isSilent}
${
    platform === 'ios'
        ? `
APNs Env:      ${isProd ? 'PRODUCTION' : 'SANDBOX'}
Key File:      ${keyFile}
Key ID:        ${keyId || 'Not Specified (Check Naming Convention!)'}
Team ID:       ${teamId}
Bundle ID:     ${bundleId}
`
        : ''
}`);

// ----------------------------------------------------
// Android (FCM v1 API) Implementation
// ----------------------------------------------------
async function sendAndroidPush() {
    const credPath = path.resolve(process.cwd(), SERVICE_ACCOUNT_FILE);
    if (!fs.existsSync(credPath)) {
        console.error(`\x1b[31mError: FCM Service Account key file not found at ${credPath}\x1b[0m`);
        console.error('Please place your Firebase "serviceAccountKey.json" file in the root folder.');
        process.exit(1);
    }

    try {
        const serviceAccount = require(credPath);
        initializeApp({
            credential: cert(serviceAccount),
        });

        // FCM Data-Only Payload structure matching specification
        const message = {
            token: deviceToken,
            data: {
                id: 'msg_test_' + Date.now(),
                type: pushType,
                channel_id: channelId,
                link: link,
                timestamp: String(Date.now()),
                title_loc_key: 'push_chat_message_title',
                title_loc_args: JSON.stringify([titleArg]),
                loc_key: 'push_chat_message_body',
                loc_args: JSON.stringify([bodyArg]),
                silent: String(isSilent),
                payload: JSON.stringify({
                    cid,
                    sid,
                    uid,
                    channelId: roomId,
                    chatId: 'msg_test_id',
                    content: bodyArg,
                }),
            },
        };

        console.log('Sending FCM v1 Message:', JSON.stringify(message, null, 2));
        const response = await getMessaging().send(message);
        console.log(`\x1b[32m✔ Successfully sent FCM push: ${response}\x1b[0m`);
    } catch (error) {
        console.error('\x1b[31mFCM Transmission Failed:\x1b[0m', error);
        process.exit(1);
    }
}

// ----------------------------------------------------
// iOS (APNs Provider HTTP/2 + Token) Implementation
// ----------------------------------------------------
function sendIosPush() {
    if (!keyId) {
        console.error('\x1b[31mError: Key ID could not be resolved.\x1b[0m');
        console.error('Please name your key AuthKey_DEV_<KEY_ID>.p8 or specify it explicitly via --key-id.');
        process.exit(1);
    }

    const keyPath = path.resolve(process.cwd(), keyFile);
    if (!fs.existsSync(keyPath)) {
        console.error(`\x1b[31mError: APNs Auth Key file not found at ${keyPath}\x1b[0m`);
        console.error(`Please place your "${keyFile}" key file in the root folder.`);
        process.exit(1);
    }

    try {
        const privateKey = fs.readFileSync(keyPath, 'utf8');

        // 1. Sign Apple JWT Token
        const apnsToken = jwt.sign(
            {
                iss: teamId,
                iat: Math.floor(Date.now() / 1000),
            },
            privateKey,
            {
                algorithm: 'ES256',
                header: {
                    alg: 'ES256',
                    kid: keyId,
                },
            }
        );

        // 2. Select host (Sandbox vs Production)
        const host = isProd ? 'api.push.apple.com' : 'api.sandbox.push.apple.com';
        console.log(`Connecting to APNs server: ${host} (Bundle: ${bundleId})`);

        // 3. Prepare payload matching specification
        const aps = {
            'mutable-content': 1,
        };

        if (isSilent) {
            aps['content-available'] = 1;
        } else {
            aps.alert = {
                title: '새 메시지',
                body: '메시지가 도착했습니다.',
            };
            aps.sound = channelId === 'dou_chat_muted' || channelId === 'dou_marketing' ? null : 'default';
        }

        const payload = {
            aps: aps,
            id: 'msg_test_' + Date.now(),
            type: pushType,
            channel_id: channelId,
            link: link,
            timestamp: String(Date.now()),
            title_loc_key: 'push_chat_message_title',
            title_loc_args: JSON.stringify([titleArg]),
            loc_key: 'push_chat_message_body',
            loc_args: JSON.stringify([bodyArg]),
            silent: isSilent,
            payload: {
                cid,
                sid,
                uid,
                channelId: roomId,
                chatId: 'msg_test_id',
                content: bodyArg,
            },
        };

        console.log('Sending APNs Message:', JSON.stringify(payload, null, 2));

        // 4. Open HTTP/2 Client Session
        const client = http2.connect(`https://${host}`);
        client.on('error', err => {
            console.error('\x1b[31mHTTP/2 Connection Error:\x1b[0m', err);
            process.exit(1);
        });

        const req = client.request({
            ':method': 'POST',
            ':path': `/3/device/${deviceToken}`,
            authorization: `bearer ${apnsToken}`,
            'apns-topic': bundleId,
            'apns-push-type': isSilent ? 'background' : 'alert',
            'apns-priority': isSilent ? '5' : '10',
            // Store-and-retry for up to 1h instead of `0` (deliver-once-or-discard),
            // so a briefly-offline device still receives the push after reconnecting.
            'apns-expiration': String(Math.floor(Date.now() / 1000) + 3600),
        });

        req.setEncoding('utf8');
        req.write(JSON.stringify(payload));
        req.end();

        let responseBody = '';
        req.on('response', headers => {
            const status = headers[':status'];
            console.log(`APNs Response Status: ${status}`);

            req.on('data', chunk => {
                responseBody += chunk;
            });

            req.on('end', () => {
                client.close();
                if (status === 200) {
                    console.log('\x1b[32m✔ Successfully sent APNs push\x1b[0m');
                    process.exit(0);
                } else {
                    console.error(`\x1b[31m❌ APNs Push Failed with status ${status}:\x1b[0m`, responseBody);
                    process.exit(1);
                }
            });
        });
    } catch (error) {
        console.error('\x1b[31mAPNs Transmission Failed:\x1b[0m', error);
        process.exit(1);
    }
}

// Run platform specific sender
if (platform === 'android') {
    sendAndroidPush();
} else {
    sendIosPush();
}

// node scripts/send-test-push.js android cn-2idVgRZKYV_XteuR08d:APA91bGroRY76hRNPhZaoedE8Yg_eS4QTocxxrPnkd-0WknzLWsU4EEbYWQXVq8yZW6nlthF3vsBqbbFsA7AciJhd17-TbO343ZoKZN_Bw2PKRlArZjobzg --title "이영희" --body "회의 문서 준비되었습니다." --room room_456

// node scripts/send-test-push.js ios
