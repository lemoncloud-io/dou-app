const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8080;
const WRITE_TO_DISK = process.env.WRITE_TO_DISK === 'true';

const server = http.createServer((req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, X-Upload-ID, X-Chunk-Index, X-Total-Chunks, X-Chunk-Offset, X-Chunk-Size, X-File-Name, X-File-Size, Authorization'
    );
    res.setHeader('Access-Control-Max-Age', '86400');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    if (req.method === 'POST' && req.url === '/upload') {
        let body = '';
        req.on('data', chunk => {
            body += chunk;
        });

        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                const { uploadId, fileName, chunkIndex, totalChunks, offset, length, totalBytes, chunkData } = data;

                const progress = totalChunks > 0 ? Math.round(((chunkIndex + 1) / totalChunks) * 100) : 0;
                console.log(
                    `[Upload Server] [${uploadId.substring(14) || uploadId}] Chunk ${chunkIndex + 1}/${totalChunks} (${progress}%) | Size: ${length} B | Offset: ${offset} B`
                );

                if (WRITE_TO_DISK && chunkData) {
                    const buffer = Buffer.from(chunkData, 'base64');
                    const uploadDir = path.join(__dirname, '../dist/uploads');
                    if (!fs.existsSync(uploadDir)) {
                        fs.mkdirSync(uploadDir, { recursive: true });
                    }
                    const filePath = path.join(uploadDir, `uploaded_${uploadId}_${fileName}`);
                    // Open and write to offset
                    const fd = fs.openSync(filePath, fs.existsSync(filePath) ? 'r+' : 'w');
                    fs.writeSync(fd, buffer, 0, buffer.length, offset);
                    fs.closeSync(fd);
                }

                res.writeHead(200, { 'Content-Type': 'text/plain' });
                res.end(`Chunk ${chunkIndex} received successfully.`);
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
    console.log(`  Write to disk: ${WRITE_TO_DISK}`);
    console.log(`  Endpoint: POST http://localhost:${PORT}/upload`);
    console.log(`==================================================`);
});
