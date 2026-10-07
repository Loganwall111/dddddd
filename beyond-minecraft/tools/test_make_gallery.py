import unittest
import make_gallery as gal


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

    def test_unknown_capture_still_renders(self):
        self.assertEqual("A brand new thing", gal.caption("beyond-31-a-brand-new-thing.png"))


if __name__ == "__main__":
    unittest.main()
