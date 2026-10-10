import QRCode from 'qrcode';
import jsQR from 'jsqr';
import { createTransfer, frame, Receiver, CHUNK_BYTES, MAX_BYTES } from './protocol.js';

const $ = id => document.getElementById(id);
const receiver = new Receiver();
let files = [], transfer, index = 0, timer, playing = false, stream, scanning = false, saving = false, photoURL, scanTimer, cameraGeneration = 0;
const scanCanvas = document.createElement('canvas');
const scanContext = scanCanvas.getContext('2d', { willReadFrequently: true });

function stopPlayback() {
  playing = false;
  clearTimeout(timer);
  $('play').textContent = 'Play QR loop';
}

function stopCamera() {
  cameraGeneration++;
  scanning = false;
  clearTimeout(scanTimer);
  stream?.getTracks().forEach(track => track.stop());
  stream = null;
  $('video').srcObject = null;
  $('video').hidden = true;
  $('camera').textContent = 'Start camera';
}

function mode(receive) {
  $('sender').hidden = receive;
  $('receiver').hidden = !receive;
  $('send-tab').setAttribute('aria-pressed', String(!receive));
  $('receive-tab').setAttribute('aria-pressed', String(receive));
  if (receive) stopPlayback(); else stopCamera();
  location.hash = receive ? 'receive' : 'send';
}
$('send-tab').onclick = () => mode(false);
$('receive-tab').onclick = () => mode(true);
mode(location.hash === '#receive');

async function draw() {
  if (!transfer) return;
  await QRCode.toCanvas($('qr'), frame(transfer, index), { errorCorrectionLevel: 'M', margin: 4, width: 680 });
  $('frame-status').textContent = `Frame ${index + 1} / ${transfer.count}. Loop repeats until phone receives every frame.`;
}

async function choose() {
  stopPlayback();
  transfer = null;
  for (const id of ['play', 'previous', 'next', 'queue', 'photos', 'folder']) $(id).disabled = true;
  $('qr').getContext('2d').clearRect(0, 0, $('qr').width, $('qr').height);
  try {
    const file = files[Number($('queue').value)];
    if (!file.size || file.size >= MAX_BYTES) throw new Error('Use a JPEG below 10 MB. Run the compressor first.');
    $('send-status').textContent = 'Preparing photo…';
    transfer = await createTransfer(new Uint8Array(await file.arrayBuffer()), file.webkitRelativePath || file.name);
    index = 0;
    const seconds = Math.ceil(transfer.count / Math.max(1, Number($('fps').value) || 3));
    $('send-status').textContent = `${transfer.name} · ${(file.size / 1000).toFixed(1)} KB · ${transfer.count} frames · ${Math.ceil(seconds / 60)} min per loop. Phone must finish before selecting another photo.`;
    await draw();
    for (const id of ['play', 'previous', 'next']) $(id).disabled = false;
  } catch (error) {
    transfer = null;
    $('send-status').textContent = error.message;
  } finally { for (const id of ['queue', 'photos', 'folder']) $(id).disabled = false; }
}

function load(event) {
  files = Array.from(event.target.files).filter(file => /\.jpe?g$/i.test(file.name)).sort((a, b) => (a.webkitRelativePath || a.name).localeCompare(b.webkitRelativePath || b.name));
  $('queue').replaceChildren(...files.map((file, position) => new Option(file.webkitRelativePath || file.name, position)));
  if (files.length) choose();
  else {
    stopPlayback();
    transfer = null;
    for (const id of ['queue', 'play', 'previous', 'next']) $(id).disabled = true;
    $('qr').getContext('2d').clearRect(0, 0, $('qr').width, $('qr').height);
    $('send-status').textContent = 'No JPEGs found. Run compress.py first.';
  }
}
$('photos').onchange = load;
$('folder').onchange = load;
$('queue').onchange = choose;

async function tick() {
  if (!playing) return;
  index = (index + 1) % transfer.count;
  try { await draw(); }
  catch (error) { stopPlayback(); $('send-status').textContent = error.message; return; }
  if (playing) timer = setTimeout(tick, 1000 / Math.min(10, Math.max(1, Number($('fps').value) || 3)));
}
$('play').onclick = () => {
  if (playing) return stopPlayback();
  playing = true;
  $('play').textContent = 'Pause';
  timer = setTimeout(tick, 1000 / Math.min(10, Math.max(1, Number($('fps').value) || 3)));
};
for (const [id, offset] of [['previous', -1], ['next', 1]]) $(id).onclick = async () => {
  stopPlayback();
  index = (index + offset + transfer.count) % transfer.count;
  try { await draw(); } catch (error) { $('send-status').textContent = error.message; }
};

async function complete() {
  saving = true;
  stopCamera();
  $('camera').disabled = true;
  try {
    const bytes = await receiver.finish();
    photoURL = URL.createObjectURL(new Blob([bytes], { type: 'image/jpeg' }));
    $('preview').src = photoURL;
    $('preview').hidden = false;
    $('save').href = photoURL;
    $('save').download = receiver.transfer.name.split('/').pop();
    $('save').hidden = false;
    $('receive-status').textContent = `Verified SHA-256 · ${receiver.transfer.name} · ${bytes.length.toLocaleString()} bytes. Save JPEG, then reset for the next photo.`;
  } catch (error) { $('receive-status').textContent = error.message; }
  finally { saving = false; }
}

function scan() {
  if (!scanning) return;
  try {
    const video = $('video');
    if (video.readyState >= 2) {
      const scale = Math.min(1, 1280 / Math.max(video.videoWidth, video.videoHeight));
      scanCanvas.width = Math.round(video.videoWidth * scale);
      scanCanvas.height = Math.round(video.videoHeight * scale);
      scanContext.drawImage(video, 0, 0, scanCanvas.width, scanCanvas.height);
      const pixels = scanContext.getImageData(0, 0, scanCanvas.width, scanCanvas.height);
      const code = jsQR(pixels.data, pixels.width, pixels.height, { inversionAttempts: 'dontInvert' });
      if (code?.data.startsWith('["QRP1",')) {
        const accepted = receiver.accept(code.data);
        const total = receiver.transfer.count;
        $('progress').max = total;
        $('progress').value = receiver.chunks.size;
        $('receive-status').textContent = accepted ? `${receiver.transfer.name}: ${receiver.chunks.size} / ${total} frames (${Math.round(receiver.chunks.size / total * 100)}%). Keep scanning.` : 'Different photo detected. Finish current photo or reset.';
        if (receiver.chunks.size === total) { complete(); return; }
      }
    }
  } catch (error) { $('receive-status').textContent = error.message; }
  if (scanning) scanTimer = setTimeout(scan, 60);
}

$('camera').onclick = async () => {
  if (stream) return stopCamera();
  const generation = cameraGeneration;
  $('camera').disabled = true;
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera requires trusted HTTPS. See README phone setup.');
    const acquired = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 1280 } }, audio: false });
    if (generation !== cameraGeneration) { acquired.getTracks().forEach(track => track.stop()); return; }
    stream = acquired;
    $('video').srcObject = stream;
    $('video').hidden = false;
    await $('video').play();
    if (generation !== cameraGeneration) return;
    scanning = true;
    $('camera').textContent = 'Stop camera';
    $('receive-status').textContent = 'Point camera at the entire QR square.';
    scan();
  } catch (error) { stopCamera(); $('receive-status').textContent = error.message; }
  finally { $('camera').disabled = false; }
};

$('reset').onclick = () => {
  if (saving) return;
  stopCamera();
  receiver.reset();
  if (photoURL) URL.revokeObjectURL(photoURL);
  photoURL = null;
  $('preview').hidden = true;
  $('preview').removeAttribute('src');
  $('save').hidden = true;
  $('save').removeAttribute('href');
  $('camera').disabled = false;
  $('progress').value = 0;
  $('receive-status').textContent = 'Ready for a photo. Start camera.';
};

window.addEventListener('pagehide', () => { stopCamera(); stopPlayback(); });
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').then(() => navigator.serviceWorker.ready).then(() => {
    $('offline').textContent = `Offline ready · ${CHUNK_BYTES} bytes per QR frame · no photo network requests`;
  }).catch(error => { $('offline').textContent = `Offline cache unavailable: ${error.message}`; });
} else $('offline').textContent = 'Offline cache unavailable. Open through trusted HTTPS.';
