"""Build the standard-library-only transfer_photos.py from vendored release assets."""
import ast
import base64
import hashlib
import json
from pathlib import Path
import zlib

root = Path(__file__).resolve().parent.parent
vendor = root / "vendor" / "decimen"
sender = (vendor / "decimen-v0.5.3-sender.html").read_bytes()
checksums = (vendor / "SHA256SUMS.txt").read_text()
expected = next(line.split()[0] for line in checksums.splitlines()
                if line.split()[-1].endswith("decimen-v0.5.3-sender.html"))
if hashlib.sha256(sender).hexdigest() != expected:
    raise ValueError("Vendored Decimen sender checksum mismatch")
assets = {"sender.html": sender.decode("utf-8"),
          "LICENSE.decimen": (vendor / "LICENSE").read_text(),
          "NOTICE.decimen": (vendor / "NOTICE").read_text(),
          "DECIMEN_SOURCE.txt": "Decimen v0.5.3, unmodified standalone sender\n"
          "https://github.com/bashalarmistalt/decimen-optical-transfer/tree/v0.5.3\n"
          "https://github.com/bashalarmistalt/decimen-optical-transfer/releases/tag/v0.5.3\n"
          "SHA-256: " + expected + "\n"}
encoded = base64.b85encode(zlib.compress(json.dumps(assets, ensure_ascii=False).encode("utf-8"), 9)).decode("ascii")
source = (root / "compress.py").read_text()
parts = [ast.get_source_segment(source, node) for node in ast.parse(source).body
         if (isinstance(node, ast.FunctionDef) and node.name == "compress") or
         (isinstance(node, ast.Assign) and any(isinstance(target, ast.Name) and target.id in {"EXTENSIONS", "MAX_BYTES"}
                                              for target in node.targets))]
template = (root / "portable_sender.py.in").read_text()
script = template.replace("# @COMPRESSOR@", "\n\n".join(parts)).replace('"@ASSETS@"', repr(encoded))
compile(script, "transfer_photos.py", "exec")
(root / "transfer_photos.py").write_text(script, encoding="utf-8", newline="\n")
print("Built transfer_photos.py: %s bytes" % format(len(script.encode("utf-8")), ","))
