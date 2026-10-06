package dev.logan.beyondthreshold.client.render;

import net.minecraft.client.MinecraftClient;
import net.minecraft.util.Identifier;
import org.joml.Matrix4f;
import org.lwjgl.opengl.GL11;
import org.lwjgl.opengl.GL15;
import org.lwjgl.opengl.GL20;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

/**
 * Minimal raw-GL shader engine for the threshold effects: compiles GLSL
 * shipped as mod assets and draws billboard quads / the sky dome.
 */
public final class BttGL {

	public static final class Prog {
		public final int id;

		Prog(int id) {
			this.id = id;
		}

		public void use() {
			GL20.glUseProgram(id);
		}

		public int u(String n) {
			return GL20.glGetUniformLocation(id, n);
		}

		public void mat4(String n, Matrix4f m) {
			float[] a = new float[16];
			m.get(a);
			GL20.glUniformMatrix4fv(u(n), false, a);
		}

		public void f(String n, float v) {
			GL20.glUniform1f(u(n), v);
		}

		public void i(String n, int v) {
			GL20.glUniform1i(u(n), v);
		}

		public void v2(String n, float a, float b) {
			GL20.glUniform2f(u(n), a, b);
		}

		public void v3(String n, float a, float b, float c) {
			GL20.glUniform3f(u(n), a, b, c);
		}

		public void v4(String n, float a, float b, float c, float d) {
			GL20.glUniform4f(u(n), a, b, c, d);
		}
	}

	private static final Map<String, Prog> CACHE = new HashMap<>();
	private static int quadVbo = -1;
	private static int cubeVbo = -1;

	public static Prog get(String name) {
		if (CACHE.containsKey(name)) {
			return CACHE.get(name);
		}
		Prog p = null;
		try {
			String v = read(new Identifier("beyondthreshold", "shaders/" + name + ".vsh"));
			String f = read(new Identifier("beyondthreshold", "shaders/" + name + ".fsh"));
			int vs = compile(GL20.GL_VERTEX_SHADER, v);
			int fs = compile(GL20.GL_FRAGMENT_SHADER, f);
			int prog = GL20.glCreateProgram();
			GL20.glAttachShader(prog, vs);
			GL20.glAttachShader(prog, fs);
			GL20.glBindAttribLocation(prog, 0, "Position");
			GL20.glLinkProgram(prog);
			if (GL20.glGetProgrami(prog, GL20.GL_LINK_STATUS) == GL11.GL_FALSE) {
				throw new IllegalStateException("link " + name + ": " + GL20.glGetProgramInfoLog(prog));
			}
			GL20.glDeleteShader(vs);
			GL20.glDeleteShader(fs);
			p = new Prog(prog);
		} catch (Exception e) {
			// never take the whole game down for a shader bug
			System.err.println("[btt] shader '" + name + "' unavailable, fx disabled: " + e);
		}
		CACHE.put(name, p);
		return p;
	}

	private static String read(Identifier id) throws IOException {
		var res = MinecraftClient.getInstance().getResourceManager().getResource(id)
				.orElseThrow(() -> new IOException("missing " + id));
		try (InputStream in = res.getInputStream()) {
			return new String(in.readAllBytes(), StandardCharsets.UTF_8);
		}
	}

	private static int compile(int type, String src) {
		int sh = GL20.glCreateShader(type);
		GL20.glShaderSource(sh, src);
		GL20.glCompileShader(sh);
		if (GL20.glGetShaderi(sh, GL20.GL_COMPILE_STATUS) == GL11.GL_FALSE) {
			throw new IllegalStateException(GL20.glGetShaderInfoLog(sh));
		}
		return sh;
	}

	private static void ensureMeshes() {
		if (quadVbo != -1) {
			return;
		}
		quadVbo = GL15.glGenBuffers();
		GL15.glBindBuffer(GL15.GL_ARRAY_BUFFER, quadVbo);
		GL15.glBufferData(GL15.GL_ARRAY_BUFFER, new float[]{
				-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0
		}, GL15.GL_STATIC_DRAW);
		cubeVbo = GL15.glGenBuffers();
		float s = 1f;
		float[] c = {
				// six faces, two triangles each (normals irrelevant; dir from position)
				-s, -s, -s, s, -s, -s, s, s, -s, -s, -s, -s, s, s, -s, -s, s, -s,
				-s, -s, s, s, -s, s, s, s, s, -s, -s, s, s, s, s, -s, s, s,
				-s, s, -s, s, s, -s, s, s, s, -s, s, -s, s, s, s, -s, s, s,
				-s, -s, -s, -s, -s, s, -s, s, s, -s, -s, -s, -s, s, s, -s, s, -s,
				s, -s, -s, s, -s, s, s, s, s, s, -s, -s, s, s, s, s, s, -s,
				-s, -s, -s, s, -s, -s, s, -s, s, -s, -s, -s, s, -s, s, -s, -s, s,
				-s, s, -s, s, s, -s, s, s, s, -s, s, -s, s, s, s, -s, s, s
		};
		GL15.glBindBuffer(GL15.GL_ARRAY_BUFFER, cubeVbo);
		GL15.glBufferData(GL15.GL_ARRAY_BUFFER, c, GL15.GL_STATIC_DRAW);
		GL15.glBindBuffer(GL15.GL_ARRAY_BUFFER, 0);
	}

	public static void drawQuad() {
		draw(quadVbo, GL11.GL_TRIANGLE_FAN, 4);
	}

	public static void drawCube() {
		draw(cubeVbo, GL11.GL_TRIANGLES, 36);
	}

	private static void draw(int vbo, int mode, int count) {
		ensureMeshes();
		GL15.glBindBuffer(GL15.GL_ARRAY_BUFFER, vbo);
		GL20.glEnableVertexAttribArray(0);
		GL20.glVertexAttribPointer(0, 3, GL11.GL_FLOAT, false, 0, 0);
		GL11.glDrawArrays(mode, 0, count);
		GL20.glDisableVertexAttribArray(0);
		GL15.glBindBuffer(GL15.GL_ARRAY_BUFFER, 0);
	}

	public static void endProgram() {
		GL20.glUseProgram(0);
	}

	private BttGL() {
	}
}
