import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import { CHUNK_BYTES, createTransfer, frame, Receiver } from '../web/protocol.js';

const result = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=160x120', '-frames:v', '1', '-c:v', 'mjpeg', '-f', 'image2pipe', 'pipe:1']);
assert.equal(result.status, 0, result.stderr.toString());
const jpeg = new Uint8Array(result.stdout);

function scanQR(text) {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' }).modules;
  const scale = 4, width = (qr.size + 8) * scale;
  const pixels = new Uint8ClampedArray(width * width * 4).fill(255);
  for (let y = 0; y < qr.size; y++) for (let x = 0; x < qr.size; x++) {
    if (!qr.get(y, x)) continue;
    for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
      const offset = (((y + 4) * scale + dy) * width + (x + 4) * scale + dx) * 4;
      pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = 0;
    }
  }
  const decoded = jsQR(pixels, width, width, { inversionAttempts: 'dontInvert' });
  assert.ok(decoded, 'Rendered QR must decode');
  return decoded.data;
}

test('real JPEG survives rendered QR, out-of-order delivery, duplicates and a missed frame', async () => {
  const transfer = await createTransfer(jpeg, 'photos/여행/photo.jpg');
  assert.ok(transfer.count > 1);
  const receiver = new Receiver();
  for (let index = transfer.count - 1; index > 0; index--) {
    const decoded = scanQR(frame(transfer, index));
    receiver.accept(decoded);
    receiver.accept(decoded);
  }
  assert.equal(receiver.chunks.size, transfer.count - 1);
  await assert.rejects(receiver.finish(), /incomplete/);
  receiver.accept(scanQR(frame(transfer, 0)));
  assert.deepEqual(await receiver.finish(), jpeg);
});

test('checksum detects corrupted bytes', async () => {
  const transfer = await createTransfer(jpeg, 'photo.jpg');
  const receiver = new Receiver();
  for (let index = 0; index < transfer.count; index++) {
    const data = JSON.parse(frame(transfer, index));
    if (index === 1) {
      const chunk = Buffer.from(data[6], 'base64');
      chunk[0] ^= 1;
      data[6] = chunk.toString('base64');
    }
    receiver.accept(JSON.stringify(data));
  }
  await assert.rejects(receiver.finish(), /Checksum failed/);
});

test('untrusted metadata and payload bounds are rejected', async () => {
  const transfer = await createTransfer(jpeg, 'photo.jpg');
  for (const [position, value] of [[0, 'UNKNOWN'], [1, 'x'], [2, '../photo.jpg'], [2, '/photo.jpg'], [2, 'a\\b.jpg'], [3, 10_000_000], [3, -1], [4, -1], [4, transfer.count], [5, 100_000], [6, '!'], [6, 'YQ==']]) {
    const data = JSON.parse(frame(transfer, 0));
    data[position] = value;
    assert.throws(() => new Receiver().accept(JSON.stringify(data)));
  }
  await assert.rejects(createTransfer(new Uint8Array(10_000_000), 'photo.jpg'), /below 10 MB/);
  await assert.rejects(createTransfer(new Uint8Array([1, 2, 3]), 'photo.jpg'), /Only JPEG/);
});

test('different photos cannot mix; reset starts another transfer', async () => {
  const first = await createTransfer(jpeg, 'first.jpg');
  const second = await createTransfer(jpeg, 'second.jpg');
  const receiver = new Receiver();
  assert.equal(receiver.accept(frame(first, 0)), true);
  assert.equal(receiver.accept(frame(second, 0)), false);
  assert.equal(receiver.chunks.size, 1);
  receiver.reset();
  assert.equal(receiver.accept(frame(second, 0)), true);
});

test('maximum permitted Unicode path fits QR and decodes', async () => {
  const transfer = await createTransfer(jpeg, `${'여'.repeat(83)}.jpg`);
  assert.equal(scanQR(frame(transfer, 0)), frame(transfer, 0));
  assert.equal(Buffer.from(JSON.parse(frame(transfer, 0))[6], 'base64').length, CHUNK_BYTES);
});
