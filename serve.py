#!/usr/bin/env python3
"""Serve only the application, never the source photo folder."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import ssl

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--cert", type=Path)
parser.add_argument("--key", type=Path)
parser.add_argument("--port", type=int, default=8080)
args = parser.parse_args()
if bool(args.cert) != bool(args.key):
    parser.error("Provide both --cert and --key")
host = "0.0.0.0" if args.cert else "127.0.0.1"
server = ThreadingHTTPServer((host, args.port), partial(SimpleHTTPRequestHandler, directory=str(Path(__file__).parent / "public")))
if args.cert:
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.load_cert_chain(args.cert, args.key)
    server.socket = context.wrap_socket(server.socket, server_side=True)
print(f"Open {'https' if args.cert else 'http'}://{'<computer-LAN-IP>' if args.cert else host}:{args.port}", flush=True)
server.serve_forever()
