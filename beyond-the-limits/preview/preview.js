(() => {
  const canvas = document.getElementById("sky");
  const slider = document.getElementById("reality-slider");
  const realityValue = document.getElementById("reality-value");
  const sequencePanel = document.querySelector(".sequence-panel");
  const stageTitle = document.getElementById("stage-title");
  const stageDescription = document.getElementById("stage-description");
  const stageCaption = document.getElementById("sequence-caption");
  const stageWarning = document.getElementById("stage-warning");
  const stageIndex = document.getElementById("stage-index");
  const openTear = document.getElementById("open-tear");

  const stages = {
    1: {
      title: "THE HAIRLINE",
      description: "A thin, violet seam holds in the evening sky. It is too straight to be lightning and too still to be a cloud. The guidebook has no entry for it.",
      caption: "A hairline. Less than one pixel wide.",
      warning: "Do not stare at the seam for too long."
    },
    2: {
      title: "THE TEAR",
      description: "The seam opens without sound. Through it: a sky with the wrong stars, and a silhouette that was not there a moment ago.",
      caption: "The other side is looking back.",
      warning: "Something crossed the threshold."
    },
    3: {
      title: "THE BLEED",
      description: "The rift is no longer a point in the sky. It is a door between worlds—and the boundary is starting to fail in both directions.",
      caption: "Containment lost. Reality is responding.",
      warning: "Do not approach the edge. It is not an edge."
    }
  };

  let stage = 1;
  let integrity = Number(slider?.value || 82) / 100;
  let pointer = [0.68, 0.48];
  let pulseStarted = -100;
  let program = null;
  let uniforms = null;
  let gl = null;
  let startTime = 0;

  function setStage(value) {
    stage = Math.max(1, Math.min(3, Number(value)));
    const copy = stages[stage];
    if (!copy) return;

    sequencePanel.dataset.stage = String(stage);
    stageTitle.textContent = copy.title;
    stageDescription.textContent = copy.description;
    stageCaption.textContent = copy.caption;
    stageWarning.textContent = copy.warning;
    stageIndex.textContent = `0${stage} — 03`;

    document.querySelectorAll(".stage-button").forEach((button) => {
      const active = Number(button.dataset.stage) === stage;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  document.querySelectorAll(".stage-button").forEach((button) => {
    button.addEventListener("click", () => setStage(button.dataset.stage));
  });

  slider?.addEventListener("input", () => {
    const value = Number(slider.value);
    integrity = value / 100;
    realityValue.innerHTML = `${value}<span>%</span>`;
    document.body.classList.toggle("reality-critical", value < 30);
  });

  openTear?.addEventListener("click", () => {
    setStage(3);
    pulseStarted = performance.now() / 1000;
    document.body.classList.add("fracture-active");
    const label = openTear.querySelector("span:first-child");
    if (label) {
      const before = label.textContent;
      label.textContent = "THE TEAR IS OPEN";
      window.setTimeout(() => { label.textContent = before; }, 2200);
    }
  });

  function compileShader(context, type, source) {
    const shader = context.createShader(type);
    context.shaderSource(shader, source);
    context.compileShader(shader);
    if (!context.getShaderParameter(shader, context.COMPILE_STATUS)) {
      const message = context.getShaderInfoLog(shader) || "Unknown shader compile error";
      context.deleteShader(shader);
      throw new Error(message);
    }
    return shader;
  }

  const vertexSource = `#version 300 es
    in vec2 aPosition;
    void main() {
      gl_Position = vec4(aPosition, 0.0, 1.0);
    }
  `;

  const fragmentSource = `#version 300 es
    precision highp float;
    uniform vec2 uResolution;
    uniform float uTime;
    uniform float uReality;
    uniform float uStage;
    uniform float uPulse;
    uniform vec2 uPointer;
    out vec4 outColor;

    float hash21(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }

    float noise2(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      float a = hash21(i);
      float b = hash21(i + vec2(1.0, 0.0));
      float c = hash21(i + vec2(0.0, 1.0));
      float d = hash21(i + vec2(1.0, 1.0));
      return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
    }

    float fbm(vec2 p) {
      float value = 0.0;
      float amplitude = 0.5;
      for (int i = 0; i < 5; i++) {
        value += amplitude * noise2(p);
        p = p * 2.03 + vec2(17.1, 9.2);
        amplitude *= 0.5;
      }
      return value;
    }

    float stars(vec2 uv) {
      vec2 grid = uv * vec2(210.0, 122.0);
      vec2 cell = floor(grid);
      vec2 local = fract(grid);
      float seed = hash21(cell);
      vec2 point = vec2(hash21(cell + 11.7), hash21(cell + 43.1));
      float star = step(0.992, seed) * exp(-dot(local - point, local - point) * 880.0);
      return star * (0.55 + 0.45 * sin(uTime * 1.7 + seed * 60.0));
    }

    void main() {
      vec2 uv = gl_FragCoord.xy / uResolution;
      float aspect = uResolution.x / uResolution.y;
      vec2 delta = uv - uPointer;
      vec2 metric = delta * vec2(aspect, 1.0);
      float radiusFromRift = length(metric);
      float realityLoss = 1.0 - uReality;
      float lens = (0.035 + realityLoss * 0.16 + uPulse * 0.08) / (radiusFromRift + 0.075);
      vec2 warped = uPointer + delta * (1.0 - lens);
      warped = clamp(warped, vec2(0.0), vec2(1.0));

      float horizon = smoothstep(0.02, 0.92, warped.y);
      vec3 color = mix(vec3(0.012, 0.017, 0.031), vec3(0.075, 0.105, 0.16), horizon);
      float cloud = fbm(vec2(warped.x * 3.6 + uTime * 0.012, warped.y * 8.0 - uTime * 0.004));
      float cloudBand = smoothstep(0.59, 0.9, cloud) * smoothstep(0.04, 0.82, warped.y);
      color += vec3(0.27, 0.32, 0.48) * cloudBand * 0.24;
      color += vec3(0.19, 0.085, 0.32) * exp(-pow((warped.y - 0.69) * 8.0, 2.0)) * 0.14;
      color += vec3(0.68, 0.77, 0.92) * stars(warped) * (0.58 + realityLoss * 0.7);

      float crackField = fbm(uv * vec2(3.3, 7.8) + vec2(uTime * 0.003, -uTime * 0.002));
      float cracks = 1.0 - smoothstep(0.009, 0.029, abs(crackField - 0.505));
      cracks *= smoothstep(0.0, 0.9, uStage) * (0.1 + realityLoss * 1.35);
      color += vec3(0.39, 0.42, 0.76) * cracks * 0.42;

      vec2 sunCenter = vec2(0.18, 0.76);
      float sunDistance = length((uv - sunCenter) * vec2(aspect, 1.0));
      float blackSun = 1.0 - smoothstep(0.036, 0.043, sunDistance);
      float sunHalo = exp(-pow((sunDistance - 0.05) * 84.0, 2.0));
      float sunReveal = smoothstep(1.45, 2.35, uStage) * (0.35 + realityLoss);
      color = mix(color, vec3(0.003, 0.004, 0.009), blackSun * sunReveal);
      color += vec3(0.31, 0.13, 0.43) * sunHalo * sunReveal * 0.34;

      float tearRadius = 0.021 + (uStage - 1.0) * 0.078;
      float angle = atan(metric.y, metric.x);
      float turbulence = fbm(vec2(angle * 0.66 + uTime * 0.13, log(radiusFromRift + 0.012) * 4.1 - uTime * 0.055));
      float inside = 1.0 - smoothstep(tearRadius * 0.66, tearRadius * 1.06, radiusFromRift);
      float ringRadius = tearRadius * (0.83 + (turbulence - 0.5) * 0.16 + sin(angle * 7.0 + uTime * 0.8) * 0.025);
      float ringWidth = max(0.0035, tearRadius * 0.09);
      float ring = exp(-pow((radiusFromRift - ringRadius) / ringWidth, 2.0));
      float innerFlow = fbm(vec2(angle * 1.1 - uTime * 0.21, log(radiusFromRift + 0.01) * 5.0 + uTime * 0.09));
      float filaments = pow(max(0.0, 1.0 - abs(sin(angle * 5.0 + innerFlow * 9.0 - uTime * 1.1))), 9.0);
      vec3 otherWorld = vec3(0.012, 0.009, 0.031);
      otherWorld += vec3(0.12, 0.035, 0.25) * (0.25 + turbulence * 0.8);
      otherWorld += vec3(0.22, 0.34, 0.46) * stars(warped * 1.4 + vec2(0.17, 0.09)) * 0.75;
      otherWorld += vec3(0.29, 0.12, 0.56) * filaments * 0.32;
      color = mix(color, otherWorld, inside * (0.84 + uPulse * 0.16));
      color += vec3(0.31, 0.16, 0.55) * ring * (0.75 + turbulence * 0.65);
      color += vec3(0.61, 0.76, 1.0) * ring * uPulse * 1.1;
      color += vec3(0.14, 0.035, 0.27) * exp(-radiusFromRift * 19.0) * (0.12 + realityLoss * 0.45);

      float vignette = 1.0 - smoothstep(0.35, 0.89, length((uv - 0.5) * vec2(aspect, 1.0)));
      color *= 0.66 + vignette * 0.34;
      float grain = hash21(gl_FragCoord.xy + fract(uTime) * 173.0) - 0.5;
      color += grain * 0.025;
      color = color / (1.0 + color * 0.62);
      outColor = vec4(pow(max(color, 0.0), vec3(0.92)), 1.0);
    }
  `;

  function initializeShader() {
    gl = canvas.getContext("webgl2", { alpha: false, antialias: false, powerPreference: "low-power" });
    if (!gl) throw new Error("WebGL 2 is not available in this browser.");

    const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
    const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
    program = gl.createProgram();
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) || "Unable to link the sky shader.");
    }

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    gl.useProgram(program);
    const position = gl.getAttribLocation(program, "aPosition");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    uniforms = {
      resolution: gl.getUniformLocation(program, "uResolution"),
      time: gl.getUniformLocation(program, "uTime"),
      reality: gl.getUniformLocation(program, "uReality"),
      stage: gl.getUniformLocation(program, "uStage"),
      pulse: gl.getUniformLocation(program, "uPulse"),
      pointer: gl.getUniformLocation(program, "uPointer")
    };

    resizeCanvas();
    startTime = performance.now();
    requestAnimationFrame(drawFrame);
  }

  function resizeCanvas() {
    if (!gl) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 1.8);
    const width = Math.max(1, Math.floor(window.innerWidth * ratio));
    const height = Math.max(1, Math.floor(window.innerHeight * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
    }
  }

  function drawFrame(timestamp) {
    if (!gl || !program) return;
    const elapsed = (timestamp - startTime) / 1000;
    const pulse = Math.max(0, 1 - (elapsed - pulseStarted) / 2.4);
    gl.useProgram(program);
    gl.uniform2f(uniforms.resolution, canvas.width, canvas.height);
    gl.uniform1f(uniforms.time, elapsed);
    gl.uniform1f(uniforms.reality, integrity);
    gl.uniform1f(uniforms.stage, stage);
    gl.uniform1f(uniforms.pulse, pulse);
    gl.uniform2f(uniforms.pointer, pointer[0], pointer[1]);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    requestAnimationFrame(drawFrame);
  }

  window.addEventListener("resize", resizeCanvas, { passive: true });
  window.addEventListener("pointermove", (event) => {
    pointer = [event.clientX / Math.max(window.innerWidth, 1), 1 - event.clientY / Math.max(window.innerHeight, 1)];
  }, { passive: true });

  try {
    initializeShader();
  } catch (error) {
    document.documentElement.classList.add("no-webgl");
    console.warn("Beyond the Limits preview shader unavailable:", error.message);
  }

  setStage(1);
})();
