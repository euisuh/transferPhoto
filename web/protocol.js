export const CHUNK_BYTES = 700;
export const MAX_BYTES = 10_000_000;

export async function digest(bytes) {
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
}

function validName(name) {
  return typeof name === 'string' && new TextEncoder().encode(name).length <= 256 &&
    name.length > 0 && !/[\\\u0000-\u001f\u007f]/.test(name) &&
    name.split('/').every(part => part && part !== '.' && part !== '..');
}

export async function createTransfer(bytes, name) {
  if (!bytes.length || bytes.length >= MAX_BYTES || !validName(name)) {
    throw new Error('Use a JPEG below 10 MB and a relative filename of at most 256 UTF-8 bytes.');
  }
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) throw new Error('Only JPEG photos are supported. Run the compressor first.');
  return { bytes, name, hash: await digest(bytes), count: Math.ceil(bytes.length / CHUNK_BYTES) };
}

export function frame(transfer, index) {
  const chunk = transfer.bytes.subarray(index * CHUNK_BYTES, (index + 1) * CHUNK_BYTES);
  return JSON.stringify(['QRP1', transfer.hash, transfer.name, transfer.bytes.length, index, transfer.count,
    btoa(String.fromCharCode(...chunk))]);
}

export class Receiver {
  constructor() { this.reset(); }
  reset() { this.transfer = null; this.chunks = new Map(); }

  accept(text) {
    if (typeof text !== 'string' || text.length > 2200) throw new Error('Invalid QR frame.');
    const data = JSON.parse(text);
    if (!Array.isArray(data) || data.length !== 7) throw new Error('Invalid QR frame.');
    const [version, hash, name, size, index, count, encoded] = data;
    if (version !== 'QRP1' || typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash) ||
        !validName(name) || !Number.isInteger(size) || size <= 0 || size >= MAX_BYTES ||
        !Number.isInteger(count) || count !== Math.ceil(size / CHUNK_BYTES) ||
        !Number.isInteger(index) || index < 0 || index >= count ||
        typeof encoded !== 'string' || encoded.length > 936 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
      throw new Error('Invalid QR frame.');
    }
    const raw = atob(encoded);
    if (btoa(raw) !== encoded || raw.length !== Math.min(CHUNK_BYTES, size - index * CHUNK_BYTES)) throw new Error('Invalid chunk size.');
    if (this.transfer && (this.transfer.hash !== hash || this.transfer.name !== name || this.transfer.size !== size)) {
      return false; // Finish or reset the current photo before accepting another.
    }
    this.transfer ??= { hash, name, size, count };
    if (!this.chunks.has(index)) this.chunks.set(index, Uint8Array.from(raw, char => char.charCodeAt(0)));
    return true;
  }

  async finish() {
    const transfer = this.transfer;
    if (!transfer || this.chunks.size !== transfer.count) throw new Error('Photo incomplete. Keep scanning the loop.');
    const bytes = new Uint8Array(transfer.size);
    for (let index = 0; index < transfer.count; index++) bytes.set(this.chunks.get(index), index * CHUNK_BYTES);
    if (await digest(bytes) !== transfer.hash) throw new Error('Checksum failed. Reset and scan again.');
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) throw new Error('Received file is not JPEG.');
    return bytes;
  }
}
