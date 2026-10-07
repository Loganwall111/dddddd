# Beyond the Threshold — Minecraft mod

The Fabric mod source is in [`beyond-minecraft/`](beyond-minecraft/). It targets **Minecraft Java 1.21.1** and **Java 21**.

## Build and playtest checks

The [Beyond build & validate workflow](https://github.com/Loganwall111/dddddd/actions/workflows/beyond-build.yml) runs on pushes and pull requests that touch the mod or workflow. It compiles both Fabric environments, runs JUnit and resource/GLSL checks, starts an isolated Minecraft server to exercise registries and world generation, then launches the actual Minecraft client under Mesa/Xvfb for shader and in-world integration tests. The client harness captures screenshots as test evidence; these are not synthetic mockups.

To build locally with a Java 21 JDK:

```sh
cd beyond-minecraft
./gradlew build
```

A manual workflow run can optionally publish its verification manifest, client screenshots, and—only when all checks pass—the installable JAR back to the same `arena/*` branch. Open **Actions → Beyond the Threshold — build & validate → Run workflow** and enable `publish_snapshot` to request that.
