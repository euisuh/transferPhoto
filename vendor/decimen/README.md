# Vendored Decimen sender

Unmodified official [v0.5.3 release](https://github.com/bashalarmistalt/decimen-optical-transfer/releases/tag/v0.5.3), retrieved 2026-10-09. Sender SHA-256 verified against the release `SHA256SUMS.txt`:

```text
b3c1445849dcde2c8f0562de55b9ea9f8966a1eb37c04abdedf05da5ffb8efde
```

The sender HTML has inline JavaScript and CSS; no external runtime assets. Its built-in file picker starts the animated stream. We do not modify its wire format or source. [Upstream standalone/offline documentation](https://github.com/bashalarmistalt/decimen-optical-transfer/blob/v0.5.3/docs/user/install-and-offline.md).

Upstream author: Evan Crawley (Bash Alarmist). License: AGPL-3.0-or-later; full `LICENSE` and third-party `NOTICE` are retained here and extracted beside the packaged sender. Corresponding source: [version-tagged tree](https://github.com/bashalarmistalt/decimen-optical-transfer/tree/v0.5.3). `tools/build_portable.py` embeds these files into the Python deliverable using only standard-library compression/encoding.
