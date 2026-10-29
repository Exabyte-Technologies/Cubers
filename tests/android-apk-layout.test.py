"""Independent program-header examples from Android's 16 KB guidance.

Run: python3 tests/android-apk-layout.test.py
These are non-executable ELF layout fixtures, not a device emulator.
"""

from pathlib import Path
import runpy
import struct
import unittest


layout = runpy.run_path(str(Path(__file__).resolve().parents[1] / "scripts/inspect-android-apk.py"))["elf_layout"]
PAGE = 16384


def segment(kind, address, memory, flags=6, alignment=PAGE):
    return (kind, flags, address % PAGE, address, address, 0, memory, alignment)


def fixture(*segments):
    extent = max(64 + 56 * len(segments), *(s[2] for s in segments))
    data = bytearray(extent)
    data[:16] = b"\x7fELF\x02\x01" + bytes(10)
    struct.pack_into("<HHIQQQIHHHHHH", data, 16, 3, 183, 1, 0, 64, 0, 0, 64, 56, len(segments), 0, 0, 0)
    for i, s in enumerate(segments):
        struct.pack_into("<IIQQQQQQ", data, 64 + 56 * i, *s)
    return bytes(data)


class LayoutChecks(unittest.TestCase):
    def test_shared_load_with_unaligned_relro_end_is_refused(self):
        result = layout(fixture(segment(1, 0xDFAF0, 0x5000), segment(0x6474E552, 0xDFAF0, 0x1510)))
        self.assertFalse(result["relroLayout16KiB"])

    def test_shared_load_with_aligned_relro_end_is_accepted(self):
        result = layout(fixture(segment(1, 0xDFAF0, 0x5000), segment(0x6474E552, 0xDFAF0, 0x510)))
        self.assertTrue(result["relroLayout16KiB"])

    def test_entire_relro_load_can_end_before_next_page(self):
        result = layout(fixture(segment(1, 0x4680, 0x980), segment(1, 0x8000, 0x2000), segment(0x6474E552, 0x4680, 0x980)))
        self.assertTrue(result["relroLayout16KiB"])
        self.assertFalse(result["relro"][0]["endAligned"])

    def test_entire_relro_load_cannot_protect_another_writable_load(self):
        result = layout(fixture(segment(1, 0x4680, 0x980), segment(1, 0x6000, 0x1000), segment(0x6474E552, 0x4680, 0x980)))
        self.assertFalse(result["relroLayout16KiB"])

    def test_missing_relro_is_explicit_and_not_a_layout_failure(self):
        result = layout(fixture(segment(1, 0x4000, 0x2000)))
        self.assertEqual(result["relro"], [])
        self.assertTrue(result["relroLayout16KiB"])

    def test_graphics_path_relro_padding_covers_the_entire_load(self):
        result = layout(fixture(segment(1, 0x5C40, 0x390), segment(1, 0x9FD0, 0x10), segment(0x6474E552, 0x5C40, 0x3C0)))
        self.assertTrue(result["relroLayout16KiB"])
        self.assertTrue(result["relro"][0]["entireLoad"])

    def test_datastore_relro_padding_covers_the_entire_load(self):
        result = layout(fixture(segment(1, 0x51C0, 0x268), segment(1, 0x9428, 1), segment(0x6474E552, 0x51C0, 0xE40)))
        self.assertTrue(result["relroLayout16KiB"])

    def test_protection_cannot_cover_writable_prefix_bytes(self):
        result = layout(fixture(segment(1, 0x4000, 0x6000), segment(0x6474E552, 0x4680, 0x3980)))
        self.assertFalse(result["relroLayout16KiB"])

    def test_four_kib_load_alignment_is_refused(self):
        result = layout(fixture(segment(1, 0x4000, 0x2000, alignment=4096)))
        self.assertFalse(result["load16KiBAligned"])

    def test_truncated_headers_and_foreign_formats_are_refused(self):
        for data in [b"", bytes(64), fixture(segment(1, 0x4000, 0x2000))[:65]]:
            with self.assertRaises(ValueError):
                layout(data)


if __name__ == "__main__":
    unittest.main()
