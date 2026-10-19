import test from 'node:test';
import assert from 'node:assert/strict';
import { assertNoSecret, stripZipTrailer } from '../lib/zip-trailer.mjs';

// A minimal valid zip: one stored file "a.txt" containing "hi" (built byte by byte).
function tinyZip(comment = '') {
  const name = Buffer.from('a.txt'), data = Buffer.from('hi');
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(10, 4); local.writeUInt32LE(0xd8932aac, 14); local.writeUInt32LE(2, 18); local.writeUInt32LE(2, 22); local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(10, 4); central.writeUInt16LE(10, 6); central.writeUInt32LE(0xd8932aac, 16); central.writeUInt32LE(2, 20); central.writeUInt32LE(2, 24); central.writeUInt16LE(name.length, 28);
  const c = Buffer.from(comment);
  const localPart = Buffer.concat([local, name, data]);
  const centralPart = Buffer.concat([central, name]);
  const eocd = Buffer.alloc(22); eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(1, 8); eocd.writeUInt16LE(1, 10); eocd.writeUInt32LE(centralPart.length, 12); eocd.writeUInt32LE(localPart.length, 16); eocd.writeUInt16LE(c.length, 20);
  return Buffer.concat([localPart, centralPart, eocd, c]);
}

test('511 zip cleaning: the appended HTML page with the key is removed and the zip is unchanged', () => {
  const key = 'fake-key-0123456789abcdef';
  const zip = tinyZip('feed');
  const html = Buffer.from(`\r\n<html><body><form method="post" action="./DataExports.aspx?operator_id=SF&amp;api_key=${key}&amp;format=zip"></form></body></html>`);
  const { buffer, removedBytes } = stripZipTrailer(Buffer.concat([zip, html]));
  assert.deepEqual(buffer, zip, 'the zip itself, including its comment, is kept byte for byte');
  assert.equal(removedBytes, html.length);
  assert.doesNotThrow(() => assertNoSecret(buffer, key));
  assert.equal(stripZipTrailer(zip).removedBytes, 0, 'a clean zip is left alone');
});

test('511 zip cleaning: a key inside the archive, or a response that is not a zip, is refused', () => {
  const key = 'fake-key-0123456789abcdef';
  assert.throws(() => assertNoSecret(tinyZip(`see ${key}`), key, 'feed'), /still contains the API key/);
  assert.throws(() => stripZipTrailer(Buffer.from('<html>error page</html>')), /Not a zip archive/);
});
