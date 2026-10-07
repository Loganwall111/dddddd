# Beyond the Threshold — Minecraft mod

The Fabric mod source is in [`beyond-minecraft/`](beyond-minecraft/). It targets **Minecraft Java 1.21.1** and **Java 21**.

## Build and playtest checks

The [Beyond build, playtest & capture workflow](https://github.com/Loganwall111/dddddd/actions/workflows/beyond-build.yml) runs on pushes and pull requests that touch the mod or workflow. It compiles both Fabric environments, runs JUnit and resource/GLSL checks, starts an isolated Minecraft server to exercise registries and world generation, then launches the actual Minecraft client under Mesa/Xvfb for shader and in-world integration tests. The client harness captures screenshots as test evidence; these are not synthetic mockups.

To build locally with a Java 21 JDK:

```sh
cd beyond-minecraft
./gradlew build
```

On an `arena/*` session branch the workflow publishes its own evidence back to that branch after a push: `beyond-minecraft/docs/runtime/` gets the run's verification manifest, the real client screenshots ([`GALLERY.md`](beyond-minecraft/docs/runtime/GALLERY.md), plus the same set as a styled `index.html`), and `releases/` gets the installable JAR — but only when every check passed. A manual run (**Actions → Beyond the Threshold — build, playtest & capture → Run workflow** with `publish_snapshot` enabled) triggers the same publish step. The publishing job replaces the previous snapshot's frames instead of accumulating them, refuses to attach an old binary to edited sources, and never force-pushes.
