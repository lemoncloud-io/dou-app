const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8080;
const WRITE_TO_DISK = process.env.WRITE_TO_DISK === 'true';

/**
 * multipart/form-data parser (no external dependencies)
 *
 * Request format:
 * - Metadata: HTTP headers (X-Upload-ID, X-Chunk-Index, X-Total-Chunks, X-Chunk-Offset, X-Chunk-Size, X-File-Size, X-File-Name, X-Mime-Type)
 * - Chunk data: the "file" part of the multipart body (binary)
 */
function parseMultipartChunk(req, bodyBuffer) {
    const contentType = req.headers['content-type'] || '';
    const boundaryMatch = contentType.match(/boundary=([^\s;]+)/);
    if (!boundaryMatch) throw new Error('Missing multipart boundary');

    const boundary = Buffer.from('--' + boundaryMatch[1]);
    const endBoundary = Buffer.from('--' + boundaryMatch[1] + '--');
    const CRLF = Buffer.from('\r\n');
    const doubleCRLF = Buffer.from('\r\n\r\n');

    // Find the boundary position
    let partStart = -1;
    for (let i = 0; i <= bodyBuffer.length - boundary.length; i++) {
        if (bodyBuffer.slice(i, i + boundary.length).equals(boundary)) {
            partStart = i + boundary.length;
            break;
        }
    }
    if (partStart < 0) throw new Error('Part boundary not found');

    // Skip the CRLF
    if (bodyBuffer.slice(partStart, partStart + 2).equals(CRLF)) {
        partStart += 2;
    }

    // Split header from body (on a double CRLF)
    const headerEnd = indexOf(bodyBuffer, doubleCRLF, partStart);
    if (headerEnd < 0) throw new Error('Part header end not found');
    const bodyStart = headerEnd + doubleCRLF.length;

    // End of part (includes the CRLF right before the closing boundary)
    let partEnd = -1;
    for (let i = bodyStart; i <= bodyBuffer.length - endBoundary.length; i++) {
        if (bodyBuffer.slice(i, i + endBoundary.length).equals(endBoundary)) {
            partEnd = i;
            break;
        }
    }
    if (partEnd < 0) throw new Error('End boundary not found');

    // Strip the CRLF at the end of the part
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
    // CORS headers
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

                // Read metadata from the headers
                const uploadId = req.headers['x-upload-id'] || '';
                const chunkIndex = parseInt(req.headers['x-chunk-index'] || '0', 10);
                const totalChunks = parseInt(req.headers['x-total-chunks'] || '1', 10);
                const offset = parseInt(req.headers['x-chunk-offset'] || '0', 10);
                const length = parseInt(req.headers['x-chunk-size'] || '0', 10);
                const totalBytes = parseInt(req.headers['x-file-size'] || '0', 10);
                const fileName = decodeURIComponent(req.headers['x-file-name'] || 'file');
                const mimeType = req.headers['x-mime-type'] || 'application/octet-stream';

                // Extract the chunk binary from the multipart body
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
                    // Write directly into the file at its offset (lands at the correct position
                    // regardless of chunk arrival order)
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
