import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

from compress import compress_tree


class CompressionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.source = self.root / "originals"
        self.output = self.root / "compressed"
        self.source.mkdir()
        self.photo = self.source / "nested" / "photo.png"
        self.photo.parent.mkdir()
        subprocess.run([
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i",
            "testsrc2=size=2560x1600", "-frames:v", "1", str(self.photo),
        ], check=True, capture_output=True)

    def test_recursive_compression_preserves_original_and_obeys_dimensions_and_size(self):
        original = hashlib.sha256(self.photo.read_bytes()).digest()
        self.assertEqual(compress_tree(self.source, self.output, edge=1280, max_bytes=40_000), [])
        photo = self.output / "nested" / "photo.png.jpg"
        self.assertLess(photo.stat().st_size, 40_000)
        dimensions = json.loads(subprocess.check_output([
            "ffprobe", "-v", "error", "-show_entries", "stream=width,height", "-of", "json", str(photo),
        ]))["streams"][0]
        self.assertLessEqual(max(dimensions.values()), 1280)
        self.assertEqual(original, hashlib.sha256(self.photo.read_bytes()).digest())
        before = photo.read_bytes()
        self.assertEqual(compress_tree(self.source, self.output), [Path("nested/photo.png")])
        self.assertEqual(before, photo.read_bytes())

    def test_nested_output_and_invalid_limits_rejected(self):
        with self.assertRaisesRegex(ValueError, "not nested"):
            compress_tree(self.source, self.source / "output")
        with self.assertRaises(ValueError):
            compress_tree(self.source, self.output, max_bytes=10_000_001)

    def test_bad_image_is_reported_without_publishing_partial_output(self):
        self.photo.write_bytes(b"not a photo")
        self.assertEqual(compress_tree(self.source, self.output), [Path("nested/photo.png")])
        self.assertFalse((self.output / "nested" / "photo.png.jpg").exists())

    def test_empty_photo_folder_is_not_reported_as_success(self):
        empty = self.root / "empty"
        empty.mkdir()
        with self.assertRaisesRegex(ValueError, "No supported photos"):
            compress_tree(empty, self.output)


if __name__ == "__main__":
    unittest.main()
