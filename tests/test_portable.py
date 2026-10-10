import hashlib
from html.parser import HTMLParser
import importlib.util
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("portable_sender", ROOT / "transfer_photos.py")
portable = importlib.util.module_from_spec(spec)
spec.loader.exec_module(portable)


class PortableTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def test_only_one_script_with_isolated_standard_python_prepares_verified_zip(self):
        script = self.root / "transfer_photos.py"
        shutil.copyfile(ROOT / "transfer_photos.py", script)
        source = self.root / "photos with spaces"
        source.mkdir()
        photo = source / "여행 photo.png"
        subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-f", "lavfi",
                        "-i", "testsrc2=size=640x480", "-frames:v", "1", str(photo)], check=True, capture_output=True)
        original = photo.read_bytes()
        # Nested photos must not silently enter this flat-folder transfer.
        nested = source / "nested"
        nested.mkdir()
        shutil.copyfile(photo, nested / "do-not-send.png")
        output = self.root / "prepared"
        result = subprocess.run([sys.executable, "-I", "-S", str(script), str(source),
                                 "--output", str(output), "--no-open"], cwd=self.root,
                                capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(photo.read_bytes(), original)
        archives = list(output.glob("*.zip"))
        self.assertEqual(len(archives), 1)
        self.assertLessEqual(archives[0].stat().st_size, portable.BATCH_BYTES)
        with zipfile.ZipFile(archives[0]) as archive:
            self.assertIsNone(archive.testzip())
            self.assertEqual(archive.namelist(), ["여행 photo.png.jpg"])
            self.assertEqual(archive.read(archive.namelist()[0]), (output / "jpeg" / "여행 photo.png.jpg").read_bytes())
            self.assertLess(len(archive.read(archive.namelist()[0])), 10_000_000)
        self.assertEqual(hashlib.sha256((output / "sender.html").read_bytes()).hexdigest(), portable.SENDER_SHA256)
        self.assertTrue((output / "LICENSE.decimen").is_file())
        self.assertTrue((output / "NOTICE.decimen").is_file())
        self.assertIn("decimen.app/receive/", (output / "TRANSFER-STEPS.txt").read_text())
        result = subprocess.run([sys.executable, "-I", "-S", str(script), str(source),
                                 "--output", str(output), "--no-open"], capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(photo.read_bytes(), original)

    def test_batches_split_at_actual_size_including_unicode_zip_headers(self):
        photos = []
        for name in ("one.jpg", "여행.jpg", "three.jpg"):
            photo = self.root / name
            photo.write_bytes(b"x" * 1000)
            photos.append(photo)
        output = self.root / "batches"
        output.mkdir()
        archives = portable.make_batches(photos, output, limit=2208)
        self.assertEqual(len(archives), 2)
        self.assertEqual(archives[0].stat().st_size, 2208)
        recovered = []
        for archive in archives:
            self.assertLessEqual(archive.stat().st_size, 2208)
            with zipfile.ZipFile(archive) as bundle:
                recovered.extend(bundle.namelist())
                self.assertIsNone(bundle.testzip())
        self.assertEqual(recovered, [photo.name for photo in photos])
        with self.assertRaisesRegex(ValueError, "exceeds batch limit"):
            portable.make_batches(photos, output, limit=1000)

    def test_missing_ffmpeg_fails_before_creating_output(self):
        photo = self.root / "photo.jpg"
        photo.write_bytes(b"placeholder")
        output = self.root / "output"
        with self.assertRaisesRegex(ValueError, "FFmpeg not found"):
            portable.prepare(self.root, output, ffmpeg="ffmpeg-does-not-exist-for-test")
        self.assertFalse(output.exists())

    def test_sender_has_no_external_script_or_stylesheet_assets(self):
        external = []
        class Assets(HTMLParser):
            def handle_starttag(self, tag, attrs):
                values = dict(attrs)
                if tag == "script" and values.get("src"):
                    external.append(values["src"])
                if tag == "link" and values.get("rel") == "stylesheet":
                    external.append(values.get("href"))
        portable.unpack_sender(self.root)
        Assets().feed((self.root / "sender.html").read_text())
        self.assertEqual(external, [])


if __name__ == "__main__":
    unittest.main()
