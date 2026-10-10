> Retired project. Source retained for portfolio reference; no active deployment.

# QR Photo Transfer

Primary setup: one standard-library Python script on an offline Windows PC with FFmpeg → compressed JPEG ZIP batches → bundled Decimen animated QR sender → Android Chrome receiver. Implementation: [`transfer_photos.py`](transfer_photos.py), readable template [`portable_sender.py.in`](portable_sender.py.in), [Decimen v0.5.3](https://github.com/bashalarmistalt/decimen-optical-transfer/releases/tag/v0.5.3).

## Windows: copy one file

Copy only **[`transfer_photos.py`](transfer_photos.py)** to the internal PC. It includes the official, unmodified Decimen sender and its license notices. No pip, npm, internet, or additional Python files are needed there. Requirements: Python 3.8+, FFmpeg on PATH, modern Chrome or Edge. Bundle verification: [`tools/build_portable.py`](tools/build_portable.py), [`tests/test_portable.py`](tests/test_portable.py).

Run from Command Prompt or PowerShell:

```powershell
py -3 transfer_photos.py "C:\Photos"
```

If the `py` launcher is unavailable, use `python transfer_photos.py "C:\Photos"`. If FFmpeg is not on PATH:

```powershell
py -3 transfer_photos.py "C:\Photos" --ffmpeg "C:\ffmpeg\bin\ffmpeg.exe"
```

1. Script reads only that folder's images, compresses them to JPEG, then packs ZIP batches of at most 32 MiB. Every JPEG is strictly below 10,000,000 bytes; default long edge is 2,048 pixels, FFmpeg quality 3. Originals are untouched. A new `qr-photos-…` folder is created beside the source; output and failures are printed. Source: [`portable_sender.py.in`](portable_sender.py.in), [`compress.py`](compress.py).
2. Sender opens in the default browser. Use Chrome/Edge; manually open the generated `sender.html` there if your default is another browser. Click **Select file**, choose the first generated `photos-001.zip`. Its QR stream starts. Click the QR for fullscreen. Source: [Decimen sending instructions](https://github.com/bashalarmistalt/decimen-optical-transfer/blob/v0.5.3/docs/user/sending.md).
3. Before entering the offline environment, on Android Chrome open **[decimen.app/receive](https://decimen.app/receive/)**, let it finish loading, and install/cache it. Test reopening it with airplane mode enabled and Wi-Fi off. The phone needs the web app's HTTPS origin; opening a downloaded receiver HTML directly on Android does not grant camera access. Source: [Decimen offline instructions](https://github.com/bashalarmistalt/decimen-optical-transfer/blob/v0.5.3/docs/user/install-and-offline.md).
4. On the phone, **Start camera** → point at the computer QR → wait for verification → **Save**. Then select the next ZIP on the PC. Extract the saved ZIPs on Android to get the JPEGs. No network connection between devices is used. Source: [Decimen quick start](https://github.com/bashalarmistalt/decimen-optical-transfer/blob/v0.5.3/docs/user/quick-start.md), archive contents verified in [`tests/test_portable.py`](tests/test_portable.py).

Keep both screens awake. If decoding stalls, start with **Transfer settings → 1 code, 1,465 bytes/frame, 24 fps**. Source: [Decimen sending instructions](https://github.com/bashalarmistalt/decimen-optical-transfer/blob/v0.5.3/docs/user/sending.md).

For smaller files, use `--edge 1280 --quality 5`; visually check a sample before processing the entire folder. `--output "C:\QRTransfer"` selects a new output folder; existing folders are refused. Failures produce `errors.txt` and a nonzero exit status, while successfully compressed images remain available. Source: [`portable_sender.py.in`](portable_sender.py.in).

**Verified here:** generated script copied alone to an isolated directory, executed with `python -I -S`, compressed images, preserved originals, produced valid ZIPs, extracted the byte-identical release sender, and preserved license notices. Browser smoke check displayed a QR stream from the extracted sender. **Not verified:** execution on Windows or a physical Android camera transfer. Evidence: [`tests/test_portable.py`](tests/test_portable.py), session observations recorded in [`HANDOFF-codex-2.md`](HANDOFF-codex-2.md).

Developer rebuild (not needed internally): `python3 tools/build_portable.py`. It reuses the shared compressor and the checksum-verified vendored release. [`vendor provenance`](vendor/decimen/README.md).

## Prefer an existing transport for the phone experiment

The Windows package above uses **[Decimen Optical Transfer](https://github.com/bashalarmistalt/decimen-optical-transfer)**. Its documented browser app supports Android, offline use after initial loading, files up to 64 MB, fountain coding for dropped frames, and SHA-256 verification. These are upstream documentation claims, not a physical-phone test performed here.

Older related work: [divan/txqr](https://github.com/divan/txqr) implements animated QR and fountain coding; its documented reader demo targets iOS. [qr-transfer/qrf](https://github.com/qr-transfer/qrf) offers a browser-based animated QR sender/receiver with fountain coding. Keep the local transport below as an experimental fallback; it is not wire-compatible with those projects. Source for the local format: [`web/protocol.js`](web/protocol.js).

## Compress a folder

The sections below describe the original developer prototype, which needs npm. They are not required for the single-file Windows sender above; its QR format comes from Decimen.

Requires Python 3, FFmpeg, Node.js and npm. Keep input and output folders separate.

```sh
python3 compress.py /path/to/photos /path/to/compressed
```

Default: at most 2,048 pixels on the long edge, no upscaling, FFmpeg JPEG quality 3, output strictly smaller than 10,000,000 bytes. Oversized output is retried at smaller dimensions. Originals remain unchanged; existing output is never overwritten. Nested paths are preserved, with `.jpg` appended to each original filename to avoid collisions. Metadata is discarded. These settings and safeguards are defined in [`compress.py`](compress.py); FFmpeg's [scale filter](https://ffmpeg.org/ffmpeg-filters.html#scale) and [JPEG encoding options](https://ffmpeg.org/ffmpeg.html) implement conversion.

For a faster QR experiment:

```sh
python3 compress.py /path/to/photos /path/to/qr-small --edge 1280 --quality 5 --max-bytes 500000
```

Lossy compression cannot promise that only invisible detail disappears. Compare a representative output with its original on your phone, including text and faces, before processing the whole collection. HEIC/HEIF/AVIF decoding depends on your FFmpeg build; failures are printed and produce a nonzero exit status. Animated inputs yield the first frame. The compressor converts every supported input to JPEG, including transparency. Implementation: [`compress.py`](compress.py).

## Open computer sender

```sh
npm install
npm start
```

Open **http://127.0.0.1:8080**. Choose compressed JPEGs, or their parent folder. Select one photo and play its QR loop. Switch to the next photo only after the phone has saved the current one. Sender controls: [`public/index.html`](public/index.html), [`web/app.js`](web/app.js).

If your global npm cache is broken, use `npm install --cache /tmp/qr-photo-npm-cache`.

## Android Chrome setup, then camera-only test

Chrome camera access and offline caching require a secure context: trusted HTTPS or loopback localhost. A plain HTTP computer LAN IP does not qualify. Source: [MDN secure contexts](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Secure_Contexts), [getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia).

The simplest development setup avoids certificate installation:

1. Install official [Android SDK Platform Tools](https://developer.android.com/tools/releases/platform-tools), enable USB debugging on your Android phone, connect USB, and approve your computer. Setup reference: [Android adb documentation](https://developer.android.com/tools/adb).
2. With `npm start` running, execute:

   ```sh
   adb devices
   adb reverse tcp:8080 tcp:8080
   ```

3. On the **phone**, open **http://localhost:8080/#receive** in Chrome. Wait for **Offline ready**. This installs/caches the scanner assets, not your photos. Cache implementation: [`public/sw.js`](public/sw.js).
4. Unplug USB. Enable airplane mode; explicitly turn Wi-Fi off. Keep the scanner page open. Disable USB debugging when no longer needed.
5. Tap **Start camera**, allow camera access. Point at the computer's QR square, then play the sender loop. Keep both screens awake.
6. Wait for **Verified SHA-256**, tap **Save JPEG**. Confirm the download on your phone. Tap **Reset / next photo** before sending another.

USB is only for initial app provisioning. Steps 4–6 are the QR-only test. This setup has **not been exercised on a physical Android phone** in this workspace; browser UI and synthetic QR reconstruction are tested separately. A saved file is the success criterion, not just a camera preview. Current evidence: [`tests/protocol.test.js`](tests/protocol.test.js), [`tests/test_compress.py`](tests/test_compress.py).

Alternatively, supply a certificate your phone already trusts and serve the app over LAN HTTPS:

```sh
npm run build
python3 serve.py --cert /path/to/cert.pem --key /path/to/key.pem --port 8443
```

Open `https://COMPUTER-LAN-IP:8443/#receive` on the phone; the certificate must cover that IP. Wait for Offline ready, then disconnect networking. The HTTPS server exposes only `public/`, not the photo tree. Source: [`serve.py`](serve.py).

## Transfer limits

- Default 700 image bytes per QR frame, 3 frames/sec, medium QR error correction. Theoretical payload rate: 2,100 bytes/sec. At perfect capture, a 100 KB JPEG takes about 48 seconds; 500 KB about 4 minutes; 10 MB about 80 minutes. Actual camera throughput must be measured and can be slower. Parameters: [`web/protocol.js`](web/protocol.js), [`web/app.js`](web/app.js). Standard QR maximum binary capacity is only 2,953 bytes: [DENSO WAVE](https://www.denso-wave.com/en/adcd/info/detail__220525.html).
- Frames repeat; duplicates and arbitrary order are accepted. Missing frames arrive in later loops. Full-image SHA-256 must match before a download appears. State remains in memory; reloading or closing the page loses partial progress. Source: [`web/protocol.js`](web/protocol.js).
- Nested paths survive compression and appear on the sender/receiver. Android downloads save one JPEG basename at a time; browser downloads do not recreate folder trees. Source: [`web/app.js`](web/app.js).
- Only JPEG transfers, files strictly below 10 MB, relative paths at most 256 UTF-8 bytes. QR frames are unencrypted; anyone recording them can reconstruct the image. SHA-256 detects corruption, not sender identity. Source: [`web/protocol.js`](web/protocol.js).
- `shortcut: repeated chunks instead of fountain codes, upgrade if measured camera throughput makes transfers impractical`.

## Verify

```sh
npm test
npm run build
```

Tests exercise an actual FFmpeg JPEG encoded into rendered QR pixels, decoded by jsQR, then reconstructed byte for byte. They also cover missing frames, duplicate frames, ordering, checksum failure, unsafe metadata, compression size/dimension bounds, preservation of originals, existing-output refusal, and corrupt inputs. Sources: [`tests/protocol.test.js`](tests/protocol.test.js), [`tests/test_compress.py`](tests/test_compress.py).

QR libraries: [node-qrcode](https://github.com/soldair/node-qrcode), [jsQR](https://github.com/cozmo/jsQR). Bundled locally; no CDN needed during transfer.
