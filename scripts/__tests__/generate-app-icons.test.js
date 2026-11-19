const {
    ICONS,
    toAdaptiveDp,
    androidColor,
    androidBackgroundXml,
    adaptiveIconXml,
    accentsXml,
    iosContentsJson,
    monochromeAlpha,
    notificationCrop,
    outputPaths,
    halvingSteps,
} = require('../generate-app-icons');

describe('generate-app-icons', () => {
    describe('toAdaptiveDp', () => {
        it('maps the visible icon edges onto the middle 72 dp of the 108 dp canvas', () => {
            expect(toAdaptiveDp(0)).toBe(18);
            expect(toAdaptiveDp(1)).toBe(90);
            expect(toAdaptiveDp(0.5)).toBe(54);
        });
    });

    describe('androidColor', () => {
        it('adds an opaque alpha byte and upper-cases the hex', () => {
            expect(androidColor('#3be8c4')).toBe('#FF3BE8C4');
        });

        it('rejects a colour that is not #RRGGBB', () => {
            expect(() => androidColor('#FFF')).toThrow('#RRGGBB');
        });
    });

    describe('androidBackgroundXml', () => {
        it('writes a linear gradient with endpoints in adaptive-canvas units and one item per stop', () => {
            const xml = androidBackgroundXml({
                type: 'linear',
                from: [0, 0],
                to: [1, 1],
                stops: ['#000000', '#808080', '#FFFFFF'],
            });
            expect(xml).toContain('android:type="linear"');
            expect(xml).toContain('android:startX="18"');
            expect(xml).toContain('android:endY="90"');
            expect(xml).toContain('<item android:offset="0" android:color="#FF000000" />');
            expect(xml).toContain('<item android:offset="0.5" android:color="#FF808080" />');
            expect(xml).toContain('<item android:offset="1" android:color="#FFFFFFFF" />');
        });

        it('scales a radial radius by the visible 72 dp, not the full canvas', () => {
            const xml = androidBackgroundXml({
                type: 'radial',
                center: [0.5, 0.5],
                radius: 0.5,
                stops: ['#000000', '#FFFFFF'],
            });
            expect(xml).toContain('android:type="radial"');
            expect(xml).toContain('android:centerX="54"');
            expect(xml).toContain('android:gradientRadius="36"');
        });

        it('writes a solid background as a plain fill with no gradient', () => {
            const xml = androidBackgroundXml({ type: 'solid', color: '#b0ea10' });
            expect(xml).toContain('android:fillColor="#FFB0EA10"');
            expect(xml).not.toContain('<gradient');
        });

        it('rejects an unknown gradient type and a single-stop gradient', () => {
            expect(() => androidBackgroundXml({ type: 'sweep', stops: ['#000000', '#FFFFFF'] })).toThrow(
                'Unknown background type'
            );
            expect(() =>
                androidBackgroundXml({ type: 'linear', from: [0, 0], to: [0, 1], stops: ['#000000'] })
            ).toThrow('at least two stops');
        });
    });

    describe('adaptiveIconXml', () => {
        it('pairs the icon background with the shared logo foreground and monochrome layers', () => {
            const xml = adaptiveIconXml('aurora');
            expect(xml).toContain('@drawable/ic_launcher_aurora_background');
            expect(xml).toContain('<foreground android:drawable="@mipmap/ic_launcher_mascot_foreground" />');
            expect(xml).toContain('<monochrome android:drawable="@mipmap/ic_launcher_mascot_monochrome" />');
        });
    });

    describe('accentsXml', () => {
        it('writes one opaque notification accent colour per icon, named by its key', () => {
            const xml = accentsXml([
                { key: 'default', accent: '#b0ea10' },
                { key: 'aurora', accent: '#3B82F6' },
            ]);
            expect(xml).toContain('<color name="notification_accent_default">#FFB0EA10</color>');
            expect(xml).toContain('<color name="notification_accent_aurora">#FF3B82F6</color>');
        });

        it('rejects an icon whose accent is missing or not #RRGGBB', () => {
            expect(() => accentsXml([{ key: 'broken' }])).toThrow('#RRGGBB');
        });
    });

    describe('iosContentsJson', () => {
        it('lists every size the hand-made sets carry, with the 1024 marked for the store', () => {
            const { images } = JSON.parse(iosContentsJson());
            expect(images.map(i => i.filename).sort()).toEqual(
                ['1024', '114', '120', '120', '180', '29', '40', '57', '58', '60', '80', '87']
                    .map(n => `${n}.png`)
                    .sort()
            );
            expect(images.find(i => i.filename === '1024.png').idiom).toBe('ios-marketing');
        });
    });

    describe('monochromeAlpha', () => {
        it('cuts the dark face out of the themed layer', () => {
            expect(monochromeAlpha(20, 20, 20, 255)).toBe(0);
        });

        it('keeps the light logo body at its own alpha', () => {
            expect(monochromeAlpha(247, 245, 230, 255)).toBe(255);
            expect(monochromeAlpha(247, 245, 230, 100)).toBe(100);
        });

        it('fades anti-aliased pixels between face and body instead of stepping', () => {
            const mid = monochromeAlpha(112, 112, 112, 255);
            expect(mid).toBeGreaterThan(0);
            expect(mid).toBeLessThan(255);
        });
    });

    describe('notificationCrop', () => {
        it('cuts a square as wide as the logo and centred on it', () => {
            expect(notificationCrop({ left: 100, top: 200, right: 900, bottom: 800 })).toEqual({
                x: 100,
                y: 100,
                side: 800,
            });
        });

        it('widens a tall logo sideways rather than squashing it', () => {
            expect(notificationCrop({ left: 400, top: 100, right: 600, bottom: 900 })).toEqual({
                x: 100,
                y: 100,
                side: 800,
            });
        });

        it('rejects a master with nothing opaque in it', () => {
            expect(() => notificationCrop({ left: 1024, top: 1024, right: 0, bottom: 0 })).toThrow('no opaque pixels');
        });
    });

    describe('outputPaths', () => {
        it('writes one iOS set, Android layers, legacy bitmaps and a web preview per icon', () => {
            const files = outputPaths([{ id: 'TestIcon', key: 'test' }]);
            expect(files).toContain('apps/mobile/ios/Chatic/Images.xcassets/TestIcon.appiconset/Contents.json');
            expect(files).toContain('apps/mobile/ios/Chatic/Images.xcassets/TestIcon.appiconset/1024.png');
            expect(files).toContain('apps/mobile/android/app/src/main/res/drawable/ic_launcher_test_background.xml');
            expect(files).toContain(
                'apps/mobile/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_test_round.xml'
            );
            expect(files).toContain('apps/mobile/android/app/src/main/res/mipmap-mdpi/ic_launcher_test.webp');
            expect(files).toContain('apps/web/public/assets/app-icons/TestIcon.png');
            expect(files).toContain('apps/mobile/android/app/src/main/res/values/ic_launcher_accents.xml');
            expect(new Set(files).size).toBe(files.length);
        });

        it('writes the shared logo layers once, not once per icon', () => {
            const files = outputPaths(ICONS);
            expect(files.filter(f => f.endsWith('mipmap-mdpi/ic_launcher_mascot_foreground.webp'))).toHaveLength(1);
        });

        it('writes one notification small icon per density, shared by every app icon', () => {
            const files = outputPaths(ICONS);
            for (const density of ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']) {
                expect(files.filter(f => f.endsWith(`drawable-${density}/ic_notification.png`))).toHaveLength(1);
            }
        });
    });

    describe('halvingSteps', () => {
        it('halves until one more halving would pass the target, then lands on it', () => {
            expect(halvingSteps(1024, 29)).toEqual([512, 256, 128, 64, 32, 29]);
            expect(halvingSteps(1024, 180)).toEqual([512, 256, 180]);
        });

        it('goes straight to a target at or above half the source', () => {
            expect(halvingSteps(1024, 512)).toEqual([512]);
            expect(halvingSteps(1024, 600)).toEqual([600]);
        });
    });

    describe('ICONS', () => {
        it('generates the primary icon too, so its logo cannot drift from the alternates', () => {
            expect(ICONS.map(i => i.id)).toEqual(expect.arrayContaining(['DefaultIcon', 'WhiteIcon']));
        });

        it('keeps ids and resource keys unique, since both name files and Android aliases', () => {
            expect(new Set(ICONS.map(i => i.id)).size).toBe(ICONS.length);
            expect(new Set(ICONS.map(i => i.key)).size).toBe(ICONS.length);
            for (const icon of ICONS) expect(icon.key).toMatch(/^[a-z][a-z0-9_]*$/);
        });

        it('gives every icon an accent, since the push service reads one for whichever icon is active', () => {
            for (const icon of ICONS) expect(icon.accent).toMatch(/^#[0-9A-Fa-f]{6}$/);
        });
    });
});
