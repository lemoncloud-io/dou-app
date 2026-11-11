import { decodePairingQr, readQrText, toPairingCode, type QrPixels } from './pairingQr';

// --- A test-only QR encoder ---------------------------------------------------------------------

/**
 * A minimal QR encoder for tests: version 1, error correction M, mask 0. Just enough to draw the
 * symbols the decoder is tested against, so the tests need no QR drawing package and no image file.
 *
 * Version 1-M holds 16 data codewords — 8 digits in numeric mode, or up to 14 bytes in byte mode.
 */

const SIZE = 21;
const DATA_CODEWORDS = 16;
const ECC_CODEWORDS = 10;

type Mode = 'numeric' | 'byte';

const pushBits = (bits: number[], value: number, length: number): void => {
    for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
};

const encodeData = (text: string, mode: Mode): number[] => {
    const bits: number[] = [];
    if (mode === 'numeric') {
        pushBits(bits, 0b0001, 4);
        pushBits(bits, text.length, 10);
        for (let i = 0; i < text.length; i += 3) {
            const group = text.slice(i, i + 3);
            pushBits(bits, Number(group), group.length * 3 + 1);
        }
    } else {
        const bytes = Array.from(new TextEncoder().encode(text));
        pushBits(bits, 0b0100, 4);
        pushBits(bits, bytes.length, 8);
        bytes.forEach(byte => pushBits(bits, byte, 8));
    }
    const capacity = DATA_CODEWORDS * 8;
    if (bits.length > capacity) throw new Error(`"${text}" does not fit a version 1-M symbol`);
    pushBits(bits, 0, Math.min(4, capacity - bits.length));
    while (bits.length % 8 !== 0) bits.push(0);

    const codewords: number[] = [];
    for (let i = 0; i < bits.length; i += 8) {
        codewords.push(bits.slice(i, i + 8).reduce((acc, bit) => (acc << 1) | bit, 0));
    }
    for (let pad = 0xec; codewords.length < DATA_CODEWORDS; pad ^= 0xec ^ 0x11) codewords.push(pad);
    return codewords;
};

const gfMultiply = (x: number, y: number): number => {
    let z = 0;
    for (let i = 7; i >= 0; i--) {
        z = (z << 1) ^ ((z >>> 7) * 0x11d);
        z ^= ((y >>> i) & 1) * x;
    }
    return z;
};

const reedSolomon = (data: number[]): number[] => {
    const divisor = new Array<number>(ECC_CODEWORDS).fill(0);
    divisor[ECC_CODEWORDS - 1] = 1;
    let root = 1;
    for (let i = 0; i < ECC_CODEWORDS; i++) {
        for (let j = 0; j < divisor.length; j++) {
            divisor[j] = gfMultiply(divisor[j], root);
            if (j + 1 < divisor.length) divisor[j] ^= divisor[j + 1];
        }
        root = gfMultiply(root, 0x02);
    }
    const remainder = new Array<number>(ECC_CODEWORDS).fill(0);
    data.forEach(byte => {
        const factor = byte ^ (remainder.shift() as number);
        remainder.push(0);
        divisor.forEach((coefficient, i) => (remainder[i] ^= gfMultiply(coefficient, factor)));
    });
    return remainder;
};

/** The symbol's modules, `true` for dark, indexed `[row][column]`. */
const qrTestSymbol = (text: string, mode: Mode): boolean[][] => {
    const modules = Array.from({ length: SIZE }, () => new Array<boolean>(SIZE).fill(false));
    const reserved = Array.from({ length: SIZE }, () => new Array<boolean>(SIZE).fill(false));
    const setFunction = (x: number, y: number, dark: boolean) => {
        modules[y][x] = dark;
        reserved[y][x] = true;
    };

    for (let i = 0; i < SIZE; i++) {
        setFunction(6, i, i % 2 === 0);
        setFunction(i, 6, i % 2 === 0);
    }
    for (const [cx, cy] of [
        [3, 3],
        [SIZE - 4, 3],
        [3, SIZE - 4],
    ]) {
        for (let dy = -4; dy <= 4; dy++) {
            for (let dx = -4; dx <= 4; dx++) {
                const x = cx + dx;
                const y = cy + dy;
                if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) continue;
                const distance = Math.max(Math.abs(dx), Math.abs(dy));
                setFunction(x, y, distance !== 2 && distance !== 4);
            }
        }
    }

    // Format information: level M (00) and mask 0 (000) — data 0, so the BCH remainder is 0 and the
    // word is the fixed XOR mask alone.
    const format = 0x5412;
    const bit = (i: number) => ((format >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) setFunction(8, i, bit(i));
    setFunction(8, 7, bit(6));
    setFunction(8, 8, bit(7));
    setFunction(7, 8, bit(8));
    for (let i = 9; i < 15; i++) setFunction(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) setFunction(SIZE - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) setFunction(8, SIZE - 15 + i, bit(i));
    setFunction(8, SIZE - 8, true);

    const data = encodeData(text, mode);
    const codewords = [...data, ...reedSolomon(data)];
    let index = 0;
    for (let right = SIZE - 1; right >= 1; right -= 2) {
        if (right === 6) right = 5;
        for (let vertical = 0; vertical < SIZE; vertical++) {
            for (let j = 0; j < 2; j++) {
                const x = right - j;
                const upward = ((right + 1) & 2) === 0;
                const y = upward ? SIZE - 1 - vertical : vertical;
                if (reserved[y][x] || index >= codewords.length * 8) continue;
                modules[y][x] = ((codewords[index >>> 3] >>> (7 - (index & 7))) & 1) === 1;
                index++;
            }
        }
    }

    for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
            if (!reserved[y][x] && (x + y) % 2 === 0) modules[y][x] = !modules[y][x];
        }
    }
    return modules;
};

/** Paints a symbol as RGBA pixels: `scale` pixels per module and a 4-module white quiet zone. */
const renderSymbol = (modules: boolean[][], scale = 4): { data: Uint8ClampedArray; width: number; height: number } => {
    const quiet = 4;
    const size = (modules.length + quiet * 2) * scale;
    const data = new Uint8ClampedArray(size * size * 4).fill(255);
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const row = Math.floor(y / scale) - quiet;
            const column = Math.floor(x / scale) - quiet;
            if (modules[row]?.[column]) {
                const offset = (y * size + x) * 4;
                data[offset] = data[offset + 1] = data[offset + 2] = 0;
            }
        }
    }
    return { data, width: size, height: size };
};

// --- Tests ------------------------------------------------------------------------------------------

const pixelsOf = (text: string, mode: Mode): QrPixels => renderSymbol(qrTestSymbol(text, mode));
const blankPhoto = (): QrPixels => {
    const size = 120;
    const data = new Uint8ClampedArray(size * size * 4);
    // A grey gradient — something to look at, nothing shaped like a finder pattern.
    for (let i = 0; i < size * size; i++) {
        const shade = (i % size) * 2;
        data.set([shade, shade, shade, 255], i * 4);
    }
    return { data, width: size, height: size };
};
const inverted = ({ data, width, height }: QrPixels): QrPixels => ({
    data: data.map((value, i) => (i % 4 === 3 ? value : 255 - value)),
    width,
    height,
});

describe('readQrText', () => {
    it('reads the text of a QR code in the pixels', () => {
        expect(readQrText(pixelsOf('07344168', 'numeric'))).toBe('07344168');
    });

    it('reads a QR code shown light on dark', () => {
        expect(readQrText(inverted(pixelsOf('07344168', 'numeric')))).toBe('07344168');
    });

    it('answers null when there is no QR code', () => {
        expect(readQrText(blankPhoto())).toBeNull();
    });

    it('tries only the image as given, or only its inverse, when asked to', () => {
        const dark = inverted(pixelsOf('07344168', 'numeric'));

        expect(readQrText(dark, 'dontInvert')).toBeNull();
        expect(readQrText(dark, 'onlyInvert')).toBe('07344168');
        expect(readQrText(pixelsOf('07344168', 'numeric'), 'dontInvert')).toBe('07344168');
    });
});

describe('toPairingCode', () => {
    it.each([
        ['07344168', '07344168'],
        [' 07344168\n', '07344168'],
    ])('takes eight digits as the code (%j)', (text, code) => {
        expect(toPairingCode(text)).toBe(code);
    });

    it.each([['0734-4168'], ['1234567'], ['123456789'], ['https://dou.example/07344168'], [''], [null]])(
        'refuses anything else (%j)',
        text => {
            expect(toPairingCode(text)).toBeNull();
        }
    );
});

describe('decodePairingQr', () => {
    const loaderOf = (pixels: QrPixels | null) => jest.fn(async (_base64: string, _mimeType?: string) => pixels);

    it('turns a photo of a pairing QR into its eight-digit code', async () => {
        const loadPixels = loaderOf(pixelsOf('07344168', 'numeric'));

        await expect(decodePairingQr('aGVsbG8=', { mimeType: 'image/png', loadPixels })).resolves.toBe('07344168');
        expect(loadPixels).toHaveBeenCalledWith('aGVsbG8=', 'image/png');
    });

    it.each([
        ['a QR code with other content', 'DOU WEB', 'byte'],
        ['a QR code with too few digits', '1234567', 'numeric'],
    ] as const)('answers null for %s', async (_label, text, mode) => {
        await expect(decodePairingQr('aGVsbG8=', { loadPixels: loaderOf(pixelsOf(text, mode)) })).resolves.toBeNull();
    });

    it('answers null for a photo with no QR code', async () => {
        await expect(decodePairingQr('aGVsbG8=', { loadPixels: loaderOf(blankPhoto()) })).resolves.toBeNull();
    });

    it('answers null when the image cannot be decoded', async () => {
        await expect(decodePairingQr('not-an-image', { loadPixels: loaderOf(null) })).resolves.toBeNull();
    });

    it('answers null through the default loader when the browser cannot decode the image', async () => {
        // jsdom has no `decode`; stand in for a browser that rejects the bytes.
        const decode = jest.fn().mockRejectedValue(new DOMException('The source image cannot be decoded.'));
        Object.defineProperty(HTMLImageElement.prototype, 'decode', { value: decode, configurable: true });
        try {
            await expect(decodePairingQr('not-an-image')).resolves.toBeNull();
            expect(decode).toHaveBeenCalledTimes(1);
        } finally {
            delete (HTMLImageElement.prototype as { decode?: unknown }).decode;
        }
    });
});
