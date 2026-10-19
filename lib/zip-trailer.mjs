/**
 * 511's schedule download appends an HTML page after the end of the zip, and that page repeats the
 * request URL, including the API key. Zip readers ignore trailing bytes, so the archive still works
 * and the key is easy to miss. Cut the buffer at the end of the zip's own end-of-central-directory
 * record (signature, 18 fixed bytes, then the archive comment).
 */
const EOCD = 0x06054b50;

export function stripZipTrailer(buffer) {
  const buf = Buffer.from(buffer);
  // The record is at least 22 bytes and sits within the last 22 + 65535 (maximum comment) bytes.
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535 - 4096); i--) {
    if (buf.readUInt32LE(i) !== EOCD) continue;
    const end = i + 22 + buf.readUInt16LE(i + 20);
    if (end <= buf.length) return { buffer: buf.subarray(0, end), removedBytes: buf.length - end };
  }
  throw new Error('Not a zip archive: no end-of-central-directory record found');
}

/** Throws if the secret appears anywhere in the bytes about to be saved. */
export function assertNoSecret(buffer, secret, label = 'file') {
  if (secret && secret.length >= 8 && Buffer.from(buffer).includes(Buffer.from(secret))) {
    throw new Error(`${label} still contains the API key after cleaning; not saved`);
  }
}
