#!/usr/bin/env python3
"""Compress a photo tree into a separate tree without modifying originals."""
import argparse
import os
from pathlib import Path
import subprocess
import tempfile

EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff", ".bmp", ".heic", ".heif", ".avif"}
MAX_BYTES = 10_000_000


def compress(source, destination, edge=2048, quality=3, max_bytes=MAX_BYTES, ffmpeg="ffmpeg"):
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists():
        raise FileExistsError(f"Output already exists: {destination}")
    with tempfile.TemporaryDirectory(dir=destination.parent) as temporary:
        candidate = Path(temporary) / "photo.jpg"
        for _ in range(20):
            scale = f"scale=w='min({edge},iw)':h='min({edge},ih)':force_original_aspect_ratio=decrease"
            subprocess.run([
                ffmpeg, "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
                "-i", str(source), "-frames:v", "1", "-vf", scale,
                "-map_metadata", "-1", "-c:v", "mjpeg", "-q:v", str(quality),
                "-pix_fmt", "yuvj420p", "-update", "1", str(candidate),
            ], check=True, capture_output=True)
            if candidate.stat().st_size < max_bytes:
                # A hard link publishes atomically and refuses to replace an existing file.
                os.link(candidate, destination)
                return destination.stat().st_size
            edge = max(16, int(edge * 0.8))
        raise ValueError(f"Cannot compress below {max_bytes} bytes: {source}")


def compress_tree(source, output, edge=2048, quality=3, max_bytes=MAX_BYTES):
    source, output = Path(source).resolve(), Path(output).resolve()
    if not source.is_dir():
        raise ValueError("Input must be a folder")
    if source == output or source in output.parents or output in source.parents:
        raise ValueError("Input and output folders must be separate, not nested")
    if not 16 <= edge <= 32768 or not 1 <= quality <= 31 or not 1024 <= max_bytes <= MAX_BYTES:
        raise ValueError("Use edge 16–32768, quality 1–31, max-bytes 1024–10000000")
    failures, count = [], 0
    for photo in sorted(source.rglob("*")):
        if photo.is_symlink() or not photo.is_file() or photo.suffix.lower() not in EXTENSIONS:
            continue
        relative = photo.relative_to(source)
        destination = output / relative.parent / (relative.name + ".jpg")
        try:
            size = compress(photo, destination, edge, quality, max_bytes)
            count += 1
            print(f"{relative}: {photo.stat().st_size:,} -> {size:,} bytes")
        except (OSError, ValueError, subprocess.CalledProcessError) as error:
            detail = error.stderr.decode(errors="replace") if isinstance(error, subprocess.CalledProcessError) else str(error)
            failures.append(relative)
            print(f"FAILED {relative}: {detail}")
    print(f"{count} compressed; {len(failures)} failed")
    if not count and not failures:
        raise ValueError("No supported photos found in input folder")
    return failures


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--edge", type=int, default=2048, help="Maximum long edge; never upscale")
    parser.add_argument("--quality", type=int, default=3, help="FFmpeg JPEG quality: 1 best, 31 lowest")
    parser.add_argument("--max-bytes", type=int, default=MAX_BYTES, help="Strict upper bound")
    args = parser.parse_args()
    try:
        failures = compress_tree(args.source, args.output, args.edge, args.quality, args.max_bytes)
    except (OSError, ValueError) as error:
        parser.exit(1, f"{error}\n")
    raise SystemExit(bool(failures))


if __name__ == "__main__":
    main()
