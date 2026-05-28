const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8080;
const WRITE_TO_DISK = process.env.WRITE_TO_DISK === 'true';

/**
 * multipart/form-data 파서 (외부 의존성 없음)
 *
 * 요청 형식:
 * - 메타데이터: HTTP 헤더 (X-Upload-ID, X-Chunk-Index, X-Total-Chunks, X-Chunk-Offset, X-Chunk-Size, X-File-Size, X-File-Name, X-Mime-Type)
 * - 청크 데이터: multipart body의 "file" 파트 (binary)
 */
function parseMultipartChunk(req, bodyBuffer) {
    const contentType = req.headers['content-type'] || '';
    const boundaryMatch = contentType.match(/boundary=([^\s;]+)/);
    if (!boundaryMatch) throw new Error('Missing multipart boundary');

    const boundary = Buffer.from('--' + boundaryMatch[1]);
    const endBoundary = Buffer.from('--' + boundaryMatch[1] + '--');
    const CRLF = Buffer.from('\r\n');
    const doubleCRLF = Buffer.from('\r\n\r\n');

    // boundary 위치 찾기
    let partStart = -1;
    for (let i = 0; i <= bodyBuffer.length - boundary.length; i++) {
        if (bodyBuffer.slice(i, i + boundary.length).equals(boundary)) {
            partStart = i + boundary.length;
            break;
        }
    }
    if (partStart < 0) throw new Error('Part boundary not found');

    // CRLF 건너뛰기
    if (bodyBuffer.slice(partStart, partStart + 2).equals(CRLF)) {
        partStart += 2;
    }

    // 헤더와 바디 분리 (double CRLF 기준)
    const headerEnd = indexOf(bodyBuffer, doubleCRLF, partStart);
    if (headerEnd < 0) throw new Error('Part header end not found');
    const bodyStart = headerEnd + doubleCRLF.length;

    // 파트 끝 (closing boundary 직전 CRLF 포함)
    let partEnd = -1;
    for (let i = bodyStart; i <= bodyBuffer.length - endBoundary.length; i++) {
        if (bodyBuffer.slice(i, i + endBoundary.length).equals(endBoundary)) {
            partEnd = i;
            break;
        }
    }
    if (partEnd < 0) throw new Error('End boundary not found');

    // 파트 끝의 CRLF 제거
    if (partEnd >= 2 && bodyBuffer.slice(partEnd - 2, partEnd).equals(CRLF)) {
        partEnd -= 2;
    }

    return bodyBuffer.slice(bodyStart, partEnd);
}

function indexOf(buffer, search, start = 0) {
    for (let i = start; i <= buffer.length - search.length; i++) {
        if (buffer.slice(i, i + search.length).equals(search)) return i;
    }
    return -1;
}

const server = http.createServer((req, res) => {
    // CORS 헤더
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, X-Upload-ID, X-Chunk-Index, X-Total-Chunks, X-Chunk-Offset, X-Chunk-Size, X-File-Name, X-File-Size, X-Mime-Type, Authorization'
    );
    res.setHeader('Access-Control-Max-Age', '86400');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    if (req.method === 'POST' && req.url === '/upload') {
        const chunks = [];
        req.on('data', chunk => chunks.push(chunk));
        req.on('end', () => {
            try {
                const bodyBuffer = Buffer.concat(chunks);

                // 메타데이터는 헤더에서 읽기
                const uploadId = req.headers['x-upload-id'] || '';
                const chunkIndex = parseInt(req.headers['x-chunk-index'] || '0', 10);
                const totalChunks = parseInt(req.headers['x-total-chunks'] || '1', 10);
                const offset = parseInt(req.headers['x-chunk-offset'] || '0', 10);
                const length = parseInt(req.headers['x-chunk-size'] || '0', 10);
                const totalBytes = parseInt(req.headers['x-file-size'] || '0', 10);
                const fileName = decodeURIComponent(req.headers['x-file-name'] || 'file');
                const mimeType = req.headers['x-mime-type'] || 'application/octet-stream';

                // multipart body에서 청크 바이너리 추출
                const chunkBuffer = parseMultipartChunk(req, bodyBuffer);

                const progress = totalChunks > 0 ? Math.round(((chunkIndex + 1) / totalChunks) * 100) : 0;
                console.log(
                    `[Upload Server] [${uploadId.substring(0, 8) || uploadId}] Chunk ${chunkIndex + 1}/${totalChunks} (${progress}%) | Size: ${chunkBuffer.length} B | Offset: ${offset} B | File: ${fileName}`
                );

                if (WRITE_TO_DISK) {
                    const uploadDir = path.join(__dirname, '../dist/uploads');
                    if (!fs.existsSync(uploadDir)) {
                        fs.mkdirSync(uploadDir, { recursive: true });
                    }
                    const filePath = path.join(uploadDir, `uploaded_${uploadId}_${fileName}`);
                    // offset 기반으로 파일에 직접 쓰기 (청크 순서 무관하게 올바른 위치에 기록)
                    const fd = fs.openSync(filePath, fs.existsSync(filePath) ? 'r+' : 'w');
                    fs.writeSync(fd, chunkBuffer, 0, chunkBuffer.length, offset);
                    fs.closeSync(fd);
                }

                res.writeHead(200, { 'Content-Type': 'text/plain' });
                res.end(`Chunk ${chunkIndex} received successfully. (${chunkBuffer.length} bytes)`);
            } catch (err) {
                console.error('[Upload Server] Error processing upload chunk:', err.message);
                res.writeHead(400, { 'Content-Type': 'text/plain' });
                res.end(`Bad Request: ${err.message}`);
            }
        });
        return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
});

server.listen(PORT, () => {
    console.log(`==================================================`);
    console.log(`  Upload Test Server running on port ${PORT}`);
    console.log(`  Format: multipart/form-data binary chunks`);
    console.log(`  Write to disk: ${WRITE_TO_DISK}`);
    console.log(`  Endpoint: POST http://localhost:${PORT}/upload`);
    console.log(`  Headers: X-Upload-ID, X-Chunk-Index, X-Total-Chunks,`);
    console.log(`           X-Chunk-Offset, X-Chunk-Size, X-File-Size,`);
    console.log(`           X-File-Name, X-Mime-Type`);
    console.log(`==================================================`);
});
