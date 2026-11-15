/**
 * Raw WebGL2 renderer for the relief block (no dependency): a lit heightfield with hypsometric
 * monochrome shading tinted by planet and contour lines computed per pixel from the real elevation,
 * walls down to the block floor with matching strata, a hatched floor where cells have no elevation,
 * and hairline work (bounding box, survey ticks, floor reference grid, north arrow).
 */
import { boxEdges, RAMP, sunVector, TINT, type Camera, type Model, type Placement } from "./reliefMath";

/** GLSL float literal. */
const f = (v: number) => (Number.isInteger(v) ? `${v}.0` : `${v}`);

const ISO = `
float iso(float z, float step, float widthPx, float dpr) {
  float f = z / step;
  float w = max(fwidth(f), 1e-6);
  float d = abs(fract(f + 0.5) - 0.5) / w;
  float line = 1.0 - smoothstep(widthPx * dpr * 0.5, widthPx * dpr * 0.5 + 0.6 * dpr, d);
  return line * (1.0 - smoothstep(0.16, 0.32, w * dpr));
}`;

const TERRAIN_VS = `#version 300 es
layout(location = 0) in vec2 a_xz;
layout(location = 1) in float a_elev;
layout(location = 2) in vec2 a_grad;
uniform mat4 u_vp;
uniform float u_ys;
uniform float u_ve;
uniform float u_zbase;
out float v_elev;
out vec3 v_n;
out vec3 v_p;
void main() {
  vec3 p = vec3(a_xz.x, (a_elev - u_zbase) * u_ys, a_xz.y);
  v_elev = a_elev;
  v_n = vec3(-a_grad.x * u_ve, 1.0, a_grad.y * u_ve);
  v_p = p;
  gl_Position = u_vp * vec4(p, 1.0);
}`;

const TERRAIN_FS = `#version 300 es
precision highp float;
in float v_elev;
in vec3 v_n;
in vec3 v_p;
uniform vec3 u_sun;
uniform vec3 u_tint;
uniform float u_zmin;
uniform float u_zmax;
uniform vec2 u_contour;
uniform float u_dpr;
uniform vec3 u_eye;
uniform vec2 u_fog;
out vec4 o;
${ISO}
void main() {
  vec3 n = normalize(v_n);
  float t = clamp((v_elev - u_zmin) / max(u_zmax - u_zmin, 1e-6), 0.0, 1.0);
  vec3 base = (${f(RAMP.lo)} + ${f(RAMP.hi - RAMP.lo)} * pow(t, ${f(RAMP.gamma)})) * (${f(1 - RAMP.tint)} + ${f(RAMP.tint)} * u_tint);
  float sun = max(dot(n, u_sun), 0.0);
  float sky = 0.5 + 0.5 * n.y;
  vec3 col = base * (0.2 * sky + 0.98 * sun);
  if (u_contour.x > 0.0) {
    float c = iso(v_elev, u_contour.x, 0.6, u_dpr);
    float ci = iso(v_elev, u_contour.y, 0.85, u_dpr);
    col = mix(col, vec3(0.94, 0.955, 0.96), max(c * 0.17, ci * 0.38));
  }
  // Depth cue: the far side of the block recedes slightly toward the background.
  col = mix(col, vec3(0.012, 0.016, 0.02), 0.32 * smoothstep(u_fog.x, u_fog.y, distance(u_eye, v_p)));
  o = vec4(col, 1.0);
}`;

const WALL_VS = `#version 300 es
layout(location = 0) in vec2 a_xz;
layout(location = 1) in float a_elev;
layout(location = 2) in vec2 a_n;
uniform mat4 u_vp;
uniform float u_ys;
uniform float u_zbase;
out float v_elev;
out vec3 v_n;
out float v_y;
void main() {
  float y = (a_elev - u_zbase) * u_ys;
  v_elev = a_elev;
  v_n = vec3(a_n.x, 0.0, a_n.y);
  v_y = y;
  gl_Position = u_vp * vec4(a_xz.x, y, a_xz.y, 1.0);
}`;

const WALL_FS = `#version 300 es
precision highp float;
in float v_elev;
in vec3 v_n;
in float v_y;
uniform vec3 u_sun;
uniform vec3 u_tint;
uniform vec2 u_contour;
uniform float u_dpr;
uniform float u_top;
out vec4 o;
${ISO}
void main() {
  float sun = max(dot(normalize(v_n), u_sun), 0.0);
  vec3 col = vec3(0.062, 0.07, 0.078) * (0.8 + 0.2 * u_tint) * (0.75 + 1.1 * sun);
  if (u_contour.x > 0.0) {
    col = mix(col, vec3(0.94, 0.955, 0.96), max(iso(v_elev, u_contour.x, 1.0, u_dpr) * 0.07, iso(v_elev, u_contour.y, 1.0, u_dpr) * 0.2));
  }
  col *= mix(0.55, 1.0, smoothstep(0.0, max(u_top, 1e-4), v_y));
  o = vec4(col, 1.0);
}`;

const FLOOR_VS = `#version 300 es
layout(location = 0) in vec2 a_xz;
uniform mat4 u_vp;
out vec2 v_xz;
void main() {
  v_xz = a_xz;
  gl_Position = u_vp * vec4(a_xz.x, 0.0, a_xz.y, 1.0);
}`;

/** Diagonal hatch: the conventional mark for "no data", seen only through gaps in the surface. */
const FLOOR_FS = `#version 300 es
precision highp float;
in vec2 v_xz;
uniform float u_hatch;
out vec4 o;
void main() {
  float h = (v_xz.x + v_xz.y) / u_hatch;
  float w = max(fwidth(h), 1e-6);
  float d = abs(fract(h + 0.5) - 0.5) / w;
  float line = (1.0 - smoothstep(0.5, 1.5, d)) * (1.0 - smoothstep(0.2, 0.45, w));
  o = vec4(vec3(0.03, 0.034, 0.04) + line * vec3(0.09, 0.095, 0.1), 1.0);
}`;

const LINE_VS = `#version 300 es
layout(location = 0) in vec3 a_p;
uniform mat4 u_vp;
uniform float u_ys;
uniform float u_zbase;
uniform float u_yoff;
out vec2 v_xz;
void main() {
  vec3 p = vec3(a_p.x, (a_p.y - u_zbase) * u_ys + u_yoff, a_p.z);
  v_xz = p.xz;
  gl_Position = u_vp * vec4(p, 1.0);
}`;

const LINE_FS = `#version 300 es
precision highp float;
in vec2 v_xz;
uniform vec4 u_color;
uniform float u_fade;
out vec4 o;
void main() {
  float a = u_color.a;
  if (u_fade > 0.0) a *= 1.0 - smoothstep(u_fade * 0.42, u_fade, length(v_xz));
  o = vec4(u_color.rgb * a, a);
}`;

type Uniforms = Record<string, WebGLUniformLocation | null>;
interface Program { prog: WebGLProgram; u: Uniforms }

function compile(gl: WebGL2RenderingContext, vs: string, fs: string, uniforms: string[]): Program {
  const shader = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) throw new Error(`relief shader: ${gl.getShaderInfoLog(s)}`);
    return s;
  };
  const prog = gl.createProgram()!;
  const v = shader(gl.VERTEX_SHADER, vs), f = shader(gl.FRAGMENT_SHADER, fs);
  gl.attachShader(prog, v);
  gl.attachShader(prog, f);
  gl.linkProgram(prog);
  gl.deleteShader(v);
  gl.deleteShader(f);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS) && !gl.isContextLost()) throw new Error(`relief program: ${gl.getProgramInfoLog(prog)}`);
  const u: Uniforms = {};
  for (const name of uniforms) u[name] = gl.getUniformLocation(prog, name);
  return { prog, u };
}

export interface FrameState {
  cam: Camera;
  /** Current (possibly animating) vertical exaggeration. */
  ve: number;
  planet: "earth" | "mars";
  /** Which edges carry the scales for this view (see `axisPlacement`). */
  place: Placement;
  dpr: number;
}

const INK: [number, number, number] = [0.949, 0.957, 0.961];

export class ReliefRenderer {
  private readonly gl: WebGL2RenderingContext;
  private readonly p: { terrain: Program; wall: Program; floor: Program; line: Program };
  private vaos: WebGLVertexArrayObject[] = [];
  private buffers: WebGLBuffer[] = [];
  private geo: { terrain: WebGLVertexArrayObject; nIndex: number; walls: WebGLVertexArrayObject; nWall: number; floor: WebGLVertexArrayObject; lines: WebGLVertexArrayObject } | null = null;
  private model: Model | null = null;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    const common = ["u_vp", "u_ys", "u_zbase"];
    this.p = {
      terrain: compile(gl, TERRAIN_VS, TERRAIN_FS, [...common, "u_ve", "u_sun", "u_tint", "u_zmin", "u_zmax", "u_contour", "u_dpr", "u_eye", "u_fog"]),
      wall: compile(gl, WALL_VS, WALL_FS, [...common, "u_sun", "u_tint", "u_contour", "u_dpr", "u_top"]),
      floor: compile(gl, FLOOR_VS, FLOOR_FS, ["u_vp", "u_hatch"]),
      line: compile(gl, LINE_VS, LINE_FS, [...common, "u_yoff", "u_color", "u_fade"]),
    };
  }

  private vao(data: ArrayBufferView, layout: [number, number][], stride: number, index?: Uint32Array): WebGLVertexArrayObject {
    const gl = this.gl;
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    let offset = 0;
    layout.forEach(([loc, size]) => {
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride * 4, offset * 4);
      offset += size;
    });
    this.buffers.push(buf);
    if (index) {
      const ib = gl.createBuffer()!;
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, index, gl.STATIC_DRAW);
      this.buffers.push(ib);
    }
    gl.bindVertexArray(null);
    this.vaos.push(vao);
    return vao;
  }

  setModel(m: Model): void {
    this.releaseGeometry();
    this.model = m;
    this.geo = {
      terrain: this.vao(m.terrain, [[0, 2], [1, 1], [2, 2]], 5, m.terrainIndex),
      nIndex: m.terrainIndex.length,
      walls: this.vao(m.walls, [[0, 2], [1, 1], [2, 2]], 5),
      nWall: m.walls.length / 5,
      floor: this.vao(m.floor, [[0, 2]], 2),
      lines: this.vao(m.lines.data, [[0, 3]], 3),
    };
  }

  draw(f: FrameState, widthPx: number, heightPx: number): void {
    const gl = this.gl, m = this.model, g = this.geo;
    if (!m || !g) return;
    gl.viewport(0, 0, widthPx, heightPx);
    gl.clearColor(0, 0, 0, 0);
    gl.clearDepth(1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);
    // Surfaces sit a hair behind coincident line work so edges and ticks win the depth test.
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(1, 1);

    const sun = sunVector();
    const tint = TINT[f.planet];
    const contour = m.contour ? [m.contour.interval, m.contour.index] : [0, 0];
    const top = (m.zMax - m.zBase) * f.cam.ys;

    let p = this.p.floor;
    gl.useProgram(p.prog);
    gl.uniformMatrix4fv(p.u.u_vp, false, f.cam.viewProj);
    gl.uniform1f(p.u.u_hatch, 0.014);
    gl.bindVertexArray(g.floor);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    p = this.p.wall;
    gl.useProgram(p.prog);
    gl.uniformMatrix4fv(p.u.u_vp, false, f.cam.viewProj);
    gl.uniform1f(p.u.u_ys, f.cam.ys);
    gl.uniform1f(p.u.u_zbase, m.zBase);
    gl.uniform3fv(p.u.u_sun, sun);
    gl.uniform3fv(p.u.u_tint, tint);
    gl.uniform2fv(p.u.u_contour, contour);
    gl.uniform1f(p.u.u_dpr, f.dpr);
    gl.uniform1f(p.u.u_top, top);
    gl.bindVertexArray(g.walls);
    gl.drawArrays(gl.TRIANGLES, 0, g.nWall);

    p = this.p.terrain;
    gl.useProgram(p.prog);
    gl.uniformMatrix4fv(p.u.u_vp, false, f.cam.viewProj);
    gl.uniform1f(p.u.u_ys, f.cam.ys);
    gl.uniform1f(p.u.u_ve, f.ve);
    gl.uniform1f(p.u.u_zbase, m.zBase);
    gl.uniform3fv(p.u.u_sun, sun);
    gl.uniform3fv(p.u.u_tint, tint);
    gl.uniform1f(p.u.u_zmin, m.zMin);
    gl.uniform1f(p.u.u_zmax, m.zMax);
    gl.uniform2fv(p.u.u_contour, contour);
    gl.uniform1f(p.u.u_dpr, f.dpr);
    gl.uniform3fv(p.u.u_eye, f.cam.eye);
    const range = Math.hypot(f.cam.eye[0] - f.cam.target[0], f.cam.eye[1] - f.cam.target[1], f.cam.eye[2] - f.cam.target[2]);
    gl.uniform2f(p.u.u_fog, range * 0.85, range + Math.max(m.hx, m.hz) * 1.6);
    gl.bindVertexArray(g.terrain);
    gl.drawElements(gl.TRIANGLES, g.nIndex, gl.UNSIGNED_INT, 0);
    gl.disable(gl.POLYGON_OFFSET_FILL);

    // Hairlines: premultiplied alpha, no depth writes.
    p = this.p.line;
    gl.useProgram(p.prog);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.uniformMatrix4fv(p.u.u_vp, false, f.cam.viewProj);
    gl.uniform1f(p.u.u_ys, f.cam.ys);
    gl.uniform1f(p.u.u_zbase, m.zBase);
    gl.bindVertexArray(g.lines);
    const lines = (range: [number, number], alpha: number, opts: { fade?: number; yoff?: number; depth?: boolean } = {}) => {
      if (!range[1]) return;
      if (opts.depth === false) gl.disable(gl.DEPTH_TEST); else gl.enable(gl.DEPTH_TEST);
      gl.uniform4f(p.u.u_color, INK[0], INK[1], INK[2], alpha);
      gl.uniform1f(p.u.u_fade, opts.fade ?? 0);
      gl.uniform1f(p.u.u_yoff, opts.yoff ?? 0);
      gl.drawArrays(gl.LINES, range[0], range[1]);
    };
    const r = m.lines.ranges;
    const edges = boxEdges(f.place);
    const box = (alpha: number, topAlpha: number, opts: { depth?: boolean } = {}) => {
      lines(r.floor, alpha, opts);
      for (const i of edges.verticals) lines(m.lines.verticals[i], alpha, opts);
      for (const i of edges.tops) lines(m.lines.tops[i], topAlpha, opts);
    };
    lines(r.grid, 0.075, { fade: Math.max(m.hx, m.hz) * 2.2, yoff: -0.0015 });
    box(0.09, 0.06, { depth: false }); // parts hidden by the terrain, ghosted
    box(0.5, 0.3);
    lines(r.ticks, 0.62);
    lines(r.north, 0.85, { depth: false });
    const er = m.lines.elevRanges[f.place.corner];
    if (er) lines(er, 0.75, { depth: false });
    gl.bindVertexArray(null);
    gl.depthMask(true);
  }

  private releaseGeometry(): void {
    const gl = this.gl;
    this.vaos.forEach((v) => gl.deleteVertexArray(v));
    this.buffers.forEach((b) => gl.deleteBuffer(b));
    this.vaos = [];
    this.buffers = [];
    this.geo = null;
  }

  dispose(): void {
    this.releaseGeometry();
    const gl = this.gl;
    Object.values(this.p).forEach((p) => gl.deleteProgram(p.prog));
  }
}

/** WebGL2 context for a relief canvas, or null when the browser has none (the view then draws a 2D hillshade). */
export function reliefContext(canvas: HTMLCanvasElement | OffscreenCanvas, preserve = false): WebGL2RenderingContext | null {
  try {
    return canvas.getContext("webgl2", { antialias: true, alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: preserve, powerPreference: "high-performance" }) as WebGL2RenderingContext | null;
  } catch {
    return null;
  }
}
