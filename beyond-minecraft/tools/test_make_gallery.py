import os
import subprocess
import unittest
from pathlib import Path

import make_gallery as gal

TOOLS = Path(__file__).resolve().parent


class GalleryTests(unittest.TestCase):
    def test_captures_sort_naturally_by_stage_then_index(self):
        names = [
            "beyond-04-reality-10.png",
            "beyond-01-witness.png",
            "beyond-04-reality-2.png",
            "beyond-15-native-depth-occlusion.png",
            "beyond-04-reality-11.png",
        ]
        self.assertEqual(
            [
                "beyond-01-witness.png",
                "beyond-04-reality-2.png",
                "beyond-04-reality-10.png",
                "beyond-04-reality-11.png",
                "beyond-15-native-depth-occlusion.png",
            ],
            sorted(names, key=gal.order_key),
        )

    def test_every_capture_gets_a_human_caption(self):
        for name in ("beyond-01-witness.png", "beyond-04-reality-7.png", "beyond-15-native-depth-occlusion.png"):
            caption = gal.caption(name)
            self.assertGreater(len(caption), 10)
            self.assertNotIn("-", caption.split(" -- ")[0])

    def test_gallery_embeds_every_capture_it_is_given(self):
        images = ["beyond-01-witness.png", "beyond-09-spaghettification.png"]
        page = gal.render("docs/runtime", images, {"checks": {"junit_failures": 0}, "artifacts": {}})
        for name in images:
            self.assertEqual(1, page.count(f'src="{name}"'))
        self.assertIn("junit_failures", page)
        self.assertIn("2 captures", page)

    def test_markdown_twin_links_every_capture(self):
        images = ["beyond-01-witness.png", "beyond-04-reality-10.png"]
        page = gal.render_markdown("docs/runtime", images, {"checks": {"junit_failures": 0}, "artifacts": {}})
        for name in images:
            self.assertEqual(1, page.count(f"]({name})"))
        self.assertEqual(len(images), page.count("### "))
        self.assertIn("**2 captures**", page)

    def test_unknown_capture_still_renders(self):
        self.assertEqual("A brand new thing", gal.caption("beyond-31-a-brand-new-thing.png"))


class PublishScriptTests(unittest.TestCase):
    """The publish step runs on a runner we cannot debug from logs, so check it here."""

    script = TOOLS / "publish-runtime-evidence.sh"

    def test_script_parses(self):
        subprocess.run(["bash", "-n", str(self.script)], check=True)

    def test_script_is_executable(self):
        self.assertTrue(os.access(self.script, os.X_OK))
        self.assertTrue(self.script.read_text().startswith("#!/usr/bin/env bash"))

    def test_script_refuses_to_guess_its_context(self):
        result = subprocess.run(
            ["bash", str(self.script)],
            capture_output=True,
            text=True,
            env={k: v for k, v in os.environ.items() if not k.startswith(("GITHUB_", "EVALUATION"))},
        )
        self.assertNotEqual(0, result.returncode)
        self.assertIn("GITHUB_REF_NAME", result.stderr + result.stdout)

    def test_script_only_publishes_after_a_green_run(self):
        body = self.script.read_text()
        self.assertIn('if test "$EVALUATION" = success', body)
        self.assertIn("ls-remote", body)


if __name__ == "__main__":
    unittest.main()
