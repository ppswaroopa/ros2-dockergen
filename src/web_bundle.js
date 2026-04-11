const textEncoder = new TextEncoder();

function crc32(bytes) {
    let crc = 0 ^ -1;
    for (let i = 0; i < bytes.length; i += 1) {
        crc ^= bytes[i];
        for (let bit = 0; bit < 8; bit += 1) {
            const mask = -(crc & 1);
            crc = (crc >>> 1) ^ (0xedb88320 & mask);
        }
    }
    return (crc ^ -1) >>> 0;
}

function pushU16(out, value) {
    out.push(value & 0xff, (value >>> 8) & 0xff);
}

function pushU32(out, value) {
    out.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
}

export function createZipBytes(files) {
    const localChunks = [];
    const centralChunks = [];
    let offset = 0;

    for (const file of files) {
        const nameBytes = textEncoder.encode(file.name);
        const dataBytes = typeof file.content === 'string' ? textEncoder.encode(file.content) : file.content;
        const crc = crc32(dataBytes);
        const local = [];

        pushU32(local, 0x04034b50);
        pushU16(local, 20);
        pushU16(local, 0);
        pushU16(local, 0);
        pushU16(local, 0);
        pushU16(local, 0);
        pushU32(local, crc);
        pushU32(local, dataBytes.length);
        pushU32(local, dataBytes.length);
        pushU16(local, nameBytes.length);
        pushU16(local, 0);
        localChunks.push(Uint8Array.from(local));
        localChunks.push(nameBytes);
        localChunks.push(dataBytes);

        const central = [];
        pushU32(central, 0x02014b50);
        pushU16(central, 20);
        pushU16(central, 20);
        pushU16(central, 0);
        pushU16(central, 0);
        pushU16(central, 0);
        pushU16(central, 0);
        pushU32(central, crc);
        pushU32(central, dataBytes.length);
        pushU32(central, dataBytes.length);
        pushU16(central, nameBytes.length);
        pushU16(central, 0);
        pushU16(central, 0);
        pushU16(central, 0);
        pushU16(central, 0);
        pushU32(central, 0);
        pushU32(central, offset);
        centralChunks.push(Uint8Array.from(central));
        centralChunks.push(nameBytes);

        offset += 30 + nameBytes.length + dataBytes.length;
    }

    const centralSize = centralChunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const end = [];
    pushU32(end, 0x06054b50);
    pushU16(end, 0);
    pushU16(end, 0);
    pushU16(end, files.length);
    pushU16(end, files.length);
    pushU32(end, centralSize);
    pushU32(end, offset);
    pushU16(end, 0);

    const totalSize = [...localChunks, ...centralChunks].reduce((sum, chunk) => sum + chunk.length, 0) + end.length;
    const zip = new Uint8Array(totalSize);
    let cursor = 0;
    for (const chunk of [...localChunks, ...centralChunks, Uint8Array.from(end)]) {
        zip.set(chunk, cursor);
        cursor += chunk.length;
    }
    return zip;
}

export function createZipBlob(files) {
    return new Blob([createZipBytes(files)], { type: 'application/zip' });
}

if (typeof window !== 'undefined') {
    window.ROS2_DOCKER_GEN_WEB_BUNDLE = {
        createZipBytes,
        createZipBlob,
    };
}
