const vertexSource = `
  attribute vec2 aPosition;
  varying vec2 vUv;

  void main() {
    vUv = aPosition * .5 + .5;
    gl_Position = vec4(aPosition, 0.0, 1.0);
  }
`;

const fragmentSource = `
  precision highp float;

  varying vec2 vUv;
  uniform sampler2D uTexture;
  uniform vec2 uResolution;
  uniform vec2 uImageResolution;
  uniform vec2 uImagePosition;
  uniform vec2 uPointer;
  uniform float uTime;
  uniform float uVelocity;
  uniform float uHover;
  uniform float uMode;
  uniform float uReduced;

  vec2 coverUv(vec2 uv) {
    float stageAspect = uResolution.x / uResolution.y;
    float imageAspect = uImageResolution.x / uImageResolution.y;
    vec2 sampleScale = stageAspect > imageAspect
      ? vec2(1.0, imageAspect / stageAspect)
      : vec2(stageAspect / imageAspect, 1.0);
    vec2 sampleCenter = sampleScale * .5 + uImagePosition * (1.0 - sampleScale);
    return (uv - .5) * sampleScale + sampleCenter;
  }

  float softCircle(vec2 point, vec2 center, float radius, float feather) {
    return 1.0 - smoothstep(radius - feather, radius + feather, distance(point, center));
  }

  void main() {
    vec2 uv = vUv;
    float aspect = uResolution.x / uResolution.y;
    vec2 delta = uv - uPointer;
    delta.x *= aspect;
    float distanceToPointer = length(delta);
    vec2 radial = normalize(delta + vec2(.0001));
    radial.x /= aspect;
    vec2 tangent = vec2(-radial.y / aspect, radial.x * aspect);

    float influence = exp(-distanceToPointer * 5.8) * uHover;
    float pulse = sin(distanceToPointer * 46.0 - uTime * 2.0 + uMode * 1.7);
    float directRefraction = influence * (.014 + min(uVelocity, 1.0) * .022);
    vec2 distortion = radial * directRefraction * (1.0 + pulse * .34);
    distortion += tangent * influence * (.005 + uVelocity * .012);

    float autoAmount = (1.0 - uReduced) * (.0015 + uMode * .00035);
    distortion.x += sin(uv.y * 17.0 + uTime * .34 + uMode) * autoAmount;
    distortion.y += cos(uv.x * 14.0 - uTime * .28) * autoAmount * .7;

    vec2 sampleUv = coverUv(uv + distortion);
    float split = influence * (.0025 + uVelocity * .009);
    vec2 splitVector = radial * split;
    vec3 color;
    color.r = texture2D(uTexture, clamp(sampleUv + splitVector, 0.001, .999)).r;
    color.g = texture2D(uTexture, clamp(sampleUv, 0.001, .999)).g;
    color.b = texture2D(uTexture, clamp(sampleUv - splitVector, 0.001, .999)).b;

    float edge = smoothstep(.88, .18, length((uv - .5) * vec2(1.0, .78)));
    color *= mix(.78, 1.055, edge);

    float pointerLight = influence * (.12 + uVelocity * .16);
    color += vec3(.16, .31, .78) * pointerLight;

    if (uMode > 1.5 && uMode < 2.5) {
      float core = softCircle(uv, vec2(.67, .37), .09, .25);
      color += vec3(.05, .11, .28) * core;
      color.b *= 1.07;
      color = (color - .5) * 1.08 + .5;
    }

    if (uMode > 2.5) {
      float focus = softCircle(uv, uPointer, .03, .34) * mix(.18, .7, uHover);
      color += vec3(.06, .13, .34) * focus;
      color *= .94;
    }

    float grain = fract(sin(dot(gl_FragCoord.xy + uTime, vec2(12.9898, 78.233))) * 43758.5453);
    color += (grain - .5) * .018;
    gl_FragColor = vec4(color, 1.0);
  }
`;

const modeValues = {
  assembly: 0,
  process: 1,
  field: 2,
  ending: 3,
};

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(message || 'Shader compilation failed.');
  }
  return shader;
}

function createProgram(gl) {
  const program = gl.createProgram();
  const vertex = compile(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSource);
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) || 'Shader link failed.');
  }
  return program;
}

export class MediaShader {
  constructor(stage, { reducedMotion = false } = {}) {
    this.stage = stage;
    this.image = stage.querySelector(':scope > img');
    this.reducedMotion = reducedMotion;
    this.pointer = [.5, .5];
    this.targetPointer = [.5, .5];
    this.velocity = 0;
    this.hover = 0;
    this.targetHover = 0;
    this.visible = false;
    this.frame = 0;
    this.startTime = performance.now();
    this.lastPointerTime = 0;
    this.renderCount = 0;
    this.ready = false;

    if (!this.image) return;
    if (this.image.complete && this.image.naturalWidth) this.initialize();
    else this.image.addEventListener('load', () => this.initialize(), { once: true });
  }

  initialize() {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'media-canvas';
    this.canvas.setAttribute('aria-hidden', 'true');
    this.stage.prepend(this.canvas);

    this.gl = this.canvas.getContext('webgl', {
      alpha: false,
      antialias: false,
      depth: false,
      premultipliedAlpha: false,
      powerPreference: 'high-performance',
    });
    if (!this.gl) {
      this.canvas.remove();
      return;
    }

    try {
      this.program = createProgram(this.gl);
    } catch (error) {
      console.warn('Objects in Field media renderer unavailable:', error);
      this.canvas.remove();
      return;
    }

    const gl = this.gl;
    gl.useProgram(this.program);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(this.program, 'aPosition');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    this.uniforms = Object.fromEntries(
      ['uTexture', 'uResolution', 'uImageResolution', 'uImagePosition', 'uPointer', 'uTime', 'uVelocity', 'uHover', 'uMode', 'uReduced']
        .map((name) => [name, gl.getUniformLocation(this.program, name)]),
    );

    const texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.image);

    gl.uniform1i(this.uniforms.uTexture, 0);
    gl.uniform2f(this.uniforms.uImageResolution, this.image.naturalWidth, this.image.naturalHeight);
    gl.uniform1f(this.uniforms.uMode, modeValues[this.stage.dataset.shader] ?? 0);
    gl.uniform1f(this.uniforms.uReduced, this.reducedMotion ? 1 : 0);

    this.resizeObserver = new ResizeObserver(() => {
      this.resize();
      this.render(performance.now());
    });
    this.resizeObserver.observe(this.stage);
    this.bindPointer();
    this.resize();
    this.ready = true;
    this.stage.classList.add('shader-ready');
    this.stage.dataset.shaderReady = 'true';
    this.render(performance.now());
  }

  bindPointer() {
    this.stage.addEventListener('pointerenter', (event) => {
      if (event.pointerType === 'touch') return;
      this.targetHover = 1;
      this.updatePointer(event, true);
      this.wake();
    });
    this.stage.addEventListener('pointermove', (event) => {
      if (event.pointerType === 'touch') return;
      this.updatePointer(event);
      this.wake();
    }, { passive: true });
    this.stage.addEventListener('pointerleave', () => {
      this.targetHover = 0;
      this.velocity = 0;
      this.wake();
    });
  }

  updatePointer(event, immediate = false) {
    const rect = this.canvas.getBoundingClientRect();
    const next = [
      Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      1 - Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    ];
    const now = performance.now();
    const elapsed = Math.max(12, now - (this.lastPointerTime || now - 16));
    const distance = Math.hypot(next[0] - this.targetPointer[0], next[1] - this.targetPointer[1]);
    this.velocity = Math.min(1, distance * 950 / elapsed);
    this.targetPointer = next;
    this.lastPointerTime = now;
    if (immediate || this.reducedMotion) this.pointer = [...next];
  }

  setVisible(visible) {
    this.visible = visible;
    if (visible) this.wake();
    else if (this.frame) {
      cancelAnimationFrame(this.frame);
      this.frame = 0;
    }
  }

  resize() {
    if (!this.gl) return;
    const rect = this.stage.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      this.gl.viewport(0, 0, width, height);
    }
    const objectPosition = getComputedStyle(this.image).objectPosition.split(/\s+/);
    const parsePosition = (value) => {
      const parsed = Number.parseFloat(value);
      return Number.isFinite(parsed) ? Math.min(1, Math.max(0, parsed / 100)) : 0.5;
    };
    this.gl.useProgram(this.program);
    this.gl.uniform2f(this.uniforms.uImagePosition, parsePosition(objectPosition[0]), parsePosition(objectPosition[1]));
  }

  wake() {
    if (!this.ready || !this.visible || this.frame) return;
    this.frame = requestAnimationFrame((time) => this.render(time));
  }

  render(time) {
    if (!this.ready && !this.gl) return;
    this.frame = 0;
    this.renderCount += 1;
    this.lastRenderTime = time;
    const gl = this.gl;
    const smoothing = this.reducedMotion ? 1 : .13;
    this.pointer[0] += (this.targetPointer[0] - this.pointer[0]) * smoothing;
    this.pointer[1] += (this.targetPointer[1] - this.pointer[1]) * smoothing;
    this.hover += (this.targetHover - this.hover) * (this.reducedMotion ? 1 : .12);
    this.velocity *= this.reducedMotion ? .25 : .9;

    gl.useProgram(this.program);
    gl.uniform2f(this.uniforms.uResolution, this.canvas.width, this.canvas.height);
    gl.uniform2f(this.uniforms.uPointer, this.pointer[0], this.pointer[1]);
    gl.uniform1f(this.uniforms.uTime, (time - this.startTime) / 1000);
    gl.uniform1f(this.uniforms.uVelocity, this.velocity);
    gl.uniform1f(this.uniforms.uHover, this.hover);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    const settling = Math.abs(this.hover - this.targetHover) > .015
      || Math.abs(this.pointer[0] - this.targetPointer[0]) > .001
      || Math.abs(this.pointer[1] - this.targetPointer[1]) > .001
      || this.velocity > .01;
    if (this.visible && (!this.reducedMotion || settling)) this.wake();
  }
}

export function initializeMediaShaders(options) {
  const shaders = [...document.querySelectorAll('[data-shader]')]
    .map((stage) => new MediaShader(stage, options));
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const shader = shaders.find((candidate) => candidate.stage === entry.target);
      shader?.setVisible(entry.isIntersecting);
    });
  }, { rootMargin: '0px', threshold: .01 });
  shaders.forEach((shader) => observer.observe(shader.stage));
  return shaders;
}
