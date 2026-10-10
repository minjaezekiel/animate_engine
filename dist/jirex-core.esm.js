var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/core/scene/Transform.js
var transform2D = (t = {}) => ({
  x: t.x ?? 0,
  y: t.y ?? 0,
  rot: t.rot ?? 0,
  sx: t.sx ?? 1,
  sy: t.sy ?? 1,
  skx: t.skx ?? 0,
  ox: t.ox ?? 0,
  oy: t.oy ?? 0
});
var transform3D = (t = {}) => ({
  p: t.p ? [...t.p] : [0, 0, 0],
  q: t.q ? [...t.q] : [0, 0, 0, 1],
  s: t.s ? [...t.s] : [1, 1, 1]
});
var TRANSFORM2D_CHANNELS = ["x", "y", "rot", "sx", "sy", "skx", "ox", "oy"];

// src/core/scene/Node.js
function createNode(spec = {}) {
  return {
    id: spec.id,
    name: spec.name ?? spec.id,
    kind: spec.kind ?? "group",
    parentId: spec.parentId ?? null,
    childIds: spec.childIds ? [...spec.childIds] : [],
    transform: spec.transform ? transform2D(spec.transform) : transform2D(),
    props: spec.props ? { ...spec.props } : {},
    visible: spec.visible !== false,
    z: spec.z ?? 0,
    tags: spec.tags ? [...spec.tags] : []
  };
}

// src/core/util/id.js
function createIdFactory(prefix = "n") {
  let n2 = 0;
  return () => `${prefix}${++n2}`;
}
function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

// src/core/math/mat2d.js
var mat2d_exports = {};
__export(mat2d_exports, {
  applyToPoint: () => applyToPoint,
  fromTransform: () => fromTransform,
  identity: () => identity,
  invert: () => invert,
  multiply: () => multiply
});
var identity = () => [1, 0, 0, 1, 0, 0];
function multiply(m1, m2) {
  const [a1, b1, c1, d1, e1, f1] = m1;
  const [a2, b2, c2, d2, e2, f2] = m2;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1
  ];
}
function applyToPoint(m, x, y) {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}
function invert(m) {
  const [a, b, c, d, e, f] = m;
  const det = a * d - b * c;
  if (det === 0) return null;
  const id = 1 / det;
  return [
    d * id,
    -b * id,
    -c * id,
    a * id,
    (c * f - d * e) * id,
    (b * e - a * f) * id
  ];
}
function fromTransform(t) {
  const { x = 0, y = 0, rot = 0, sx = 1, sy = 1, skx = 0, ox = 0, oy = 0 } = t;
  const cos = Math.cos(rot), sin = Math.sin(rot);
  const tanK = skx ? Math.tan(skx) : 0;
  const a = cos * sx;
  const b = sin * sx;
  const c = (cos * tanK - sin) * sy;
  const d = (sin * tanK + cos) * sy;
  return [a, b, c, d, x - (a * ox + c * oy), y - (b * ox + d * oy)];
}

// src/core/scene/Scene.js
var Scene = class {
  constructor({ idPrefix = "n" } = {}) {
    this.nextId = createIdFactory(idPrefix);
    this.byId = /* @__PURE__ */ new Map();
    this.rootId = "__root";
    this.byId.set(this.rootId, createNode({ id: this.rootId, kind: "group", name: "root" }));
    this._matrixCache = /* @__PURE__ */ new Map();
  }
  get root() {
    return this.byId.get(this.rootId);
  }
  add(spec, parentId = this.rootId) {
    const id = spec.id ?? this.nextId();
    if (this.byId.has(id)) throw new Error(`Scene: duplicate node id "${id}"`);
    const parent = this.byId.get(parentId);
    if (!parent) throw new Error(`Scene: no such parent "${parentId}"`);
    const node = createNode({ ...spec, id, parentId });
    this.byId.set(id, node);
    parent.childIds.push(id);
    this._invalidate(id);
    return node;
  }
  get(id) {
    return this.byId.get(id);
  }
  has(id) {
    return this.byId.has(id);
  }
  remove(id) {
    if (id === this.rootId) throw new Error("Scene: cannot remove the root");
    const node = this.byId.get(id);
    if (!node) return;
    for (const childId of [...node.childIds]) this.remove(childId);
    const parent = this.byId.get(node.parentId);
    if (parent) parent.childIds = parent.childIds.filter((c) => c !== id);
    this.byId.delete(id);
    this._matrixCache.delete(id);
  }
  reparent(id, newParentId) {
    const node = this.byId.get(id);
    const newParent = this.byId.get(newParentId);
    if (!node || !newParent) throw new Error("Scene: reparent needs two live nodes");
    for (let p = newParent; p; p = p.parentId ? this.byId.get(p.parentId) : null) {
      if (p.id === id) throw new Error("Scene: reparent would create a cycle");
    }
    const oldParent = this.byId.get(node.parentId);
    if (oldParent) oldParent.childIds = oldParent.childIds.filter((c) => c !== id);
    node.parentId = newParentId;
    newParent.childIds.push(id);
    this._invalidate(id);
  }
  /** Depth-first walk in child order, root first. */
  walk(fn, fromId = this.rootId) {
    const node = this.byId.get(fromId);
    if (!node) return;
    if (fn(node) === false) return;
    for (const childId of node.childIds) this.walk(fn, childId);
  }
  /**
       * The draw list: depth-first, siblings sorted by z then insertion order,
       * each entry carrying its EFFECTIVE alpha.
       *
       * Alpha accumulates down the hierarchy, so a group's opacity applies to
       * everything inside it. That is what makes `props.alpha` on a scene group
       * work as visibility -- without inheritance every scene in a film would
       * draw at once and the last one would cover the rest.
       *
       * A subtree whose accumulated alpha has reached zero is skipped entirely,
       * which is both correct and the single biggest saving per frame: only the
       * scene actually on screen is drawn.
       */
  drawOrder() {
    const out = [];
    const visit = (id, inheritedAlpha) => {
      const node = this.byId.get(id);
      if (!node || !node.visible) return;
      const alpha = inheritedAlpha * (node.props.alpha ?? 1);
      if (alpha <= 5e-4) return;
      if (id !== this.rootId) out.push({ node, alpha });
      const kids = node.childIds.map((c, i) => ({ c, i, z: this.byId.get(c)?.z ?? 0 })).sort((a, b) => a.z - b.z || a.i - b.i);
      for (const k of kids) visit(k.c, alpha);
    };
    visit(this.rootId, 1);
    return out;
  }
  worldMatrix(id) {
    const cached = this._matrixCache.get(id);
    if (cached) return cached;
    const node = this.byId.get(id);
    if (!node) return identity();
    const local = id === this.rootId ? identity() : fromTransform(node.transform);
    const world = node.parentId ? multiply(this.worldMatrix(node.parentId), local) : local;
    this._matrixCache.set(id, world);
    return world;
  }
  /** Call after mutating a transform; drops the cache for that subtree. */
  _invalidate(id) {
    this._matrixCache.delete(id);
    const node = this.byId.get(id);
    if (!node) return;
    for (const childId of node.childIds) this._invalidate(childId);
  }
  invalidate(id) {
    this._invalidate(id);
  }
  invalidateAll() {
    this._matrixCache.clear();
  }
};

// src/core/audio/visemes.js
var VISEMES = ["closed", "mid", "open", "round", "wide", "teeth"];
var VISEME_FALLBACK = {
  closed: ["closed", "mid", "open"],
  mid: ["mid", "open", "closed"],
  open: ["open", "mid", "closed"],
  round: ["round", "open", "mid", "closed"],
  wide: ["wide", "mid", "open", "closed"],
  teeth: ["teeth", "mid", "closed", "open"]
};
function resolveViseme(viseme, availableShapes) {
  for (const candidate of VISEME_FALLBACK[viseme] ?? [viseme]) {
    if (availableShapes[candidate]) return candidate;
  }
  return Object.keys(availableShapes)[0] ?? "closed";
}
var PHONEME_VISEME = {
  m: "closed",
  b: "closed",
  p: "closed",
  f: "teeth",
  v: "teeth",
  w: "round",
  u: "round",
  "\u028A": "round",
  "o": "round",
  "\u0254": "round",
  "o\u028A": "round",
  "u\u02D0": "round",
  i: "wide",
  "i\u02D0": "wide",
  "\u026A": "wide",
  s: "wide",
  z: "wide",
  "\u0283": "wide",
  "\u0292": "wide",
  "t\u0283": "wide",
  "d\u0292": "wide",
  a: "open",
  "\u0251": "open",
  "\xE6": "open",
  "\u028C": "open",
  "\u0250": "open",
  "a\u026A": "open",
  "a\u028A": "open",
  "\u0252": "open",
  e: "mid",
  "\u025B": "mid",
  "e\u026A": "mid",
  "\u0259": "mid",
  "\u025C": "mid",
  t: "mid",
  d: "mid",
  n: "mid",
  k: "mid",
  g: "mid",
  l: "mid",
  r: "mid",
  "\u0279": "mid",
  h: "mid",
  j: "mid",
  "\u014B": "mid",
  "\u03B8": "mid",
  "\xF0": "mid",
  _: "closed",
  "": "closed"
};
var phonemeToViseme = (p) => PHONEME_VISEME[String(p).toLowerCase()] ?? PHONEME_VISEME[String(p)] ?? "mid";
var GRAPHEME_RULES = [
  ["sch", "wide"],
  ["tch", "wide"],
  ["sh", "wide"],
  ["ch", "wide"],
  ["th", "mid"],
  ["ph", "teeth"],
  ["wh", "round"],
  ["ck", "mid"],
  ["ng", "mid"],
  ["qu", "round"],
  ["oo", "round"],
  ["ou", "round"],
  ["ow", "round"],
  ["oa", "round"],
  ["oi", "round"],
  ["oy", "round"],
  ["ee", "wide"],
  ["ea", "wide"],
  ["ie", "wide"],
  ["ei", "wide"],
  ["ey", "wide"],
  ["ai", "open"],
  ["ay", "open"],
  ["au", "open"],
  ["aw", "open"],
  ["a", "open"],
  ["e", "mid"],
  ["i", "wide"],
  ["o", "round"],
  ["u", "round"],
  ["y", "wide"],
  ["m", "closed"],
  ["b", "closed"],
  ["p", "closed"],
  ["f", "teeth"],
  ["v", "teeth"],
  ["w", "round"],
  ["s", "wide"],
  ["z", "wide"],
  ["j", "wide"],
  ["x", "wide"],
  ["t", "mid"],
  ["d", "mid"],
  ["n", "mid"],
  ["k", "mid"],
  ["g", "mid"],
  ["l", "mid"],
  ["r", "mid"],
  ["h", "mid"],
  ["c", "mid"]
];
function textToVisemeSequence(text) {
  const s = String(text).toLowerCase().replace(/[^a-z\s]/g, " ");
  const out = [];
  let i = 0;
  while (i < s.length) {
    if (s[i] === " ") {
      if (out.length && out[out.length - 1] !== "closed") out.push("closed");
      i++;
      continue;
    }
    let matched = false;
    for (const [graph, viseme] of GRAPHEME_RULES) {
      if (s.startsWith(graph, i)) {
        if (out[out.length - 1] !== viseme) out.push(viseme);
        i += graph.length;
        matched = true;
        break;
      }
    }
    if (!matched) i++;
  }
  while (out.length && out[out.length - 1] === "closed") out.pop();
  return out;
}

// src/core/scene/swapSets.js
var SWAP_FALLBACK = {
  viseme: VISEME_FALLBACK,
  view: {
    front: ["front", "threeQuarter", "profile"],
    threeQuarter: ["threeQuarter", "front", "profile"],
    profile: ["profile", "threeQuarter", "front"],
    back: ["back", "threeQuarter", "front"]
  },
  eyes: {
    open: ["open", "neutral"],
    closed: ["closed", "squint", "open"],
    squint: ["squint", "closed", "open"]
  }
};
function resolveSwap(channel, wanted, shapes, variant = null) {
  const order = [wanted, ...SWAP_FALLBACK[channel]?.[wanted] ?? []];
  if (variant) {
    for (const name of order) if (shapes[`${name}@${variant}`]) return `${name}@${variant}`;
  }
  for (const name of order) if (shapes[name]) return name;
  return Object.keys(shapes)[0] ?? null;
}
function channelValue(scene, node, channel) {
  for (let n2 = node; n2; n2 = n2.parentId ? scene.byId.get(n2.parentId) : null) {
    const v = n2.props?.[channel];
    if (v != null) return v;
  }
  return void 0;
}
function applySwapSets(scene) {
  for (const node of scene.byId.values()) {
    const sets = node.props.swapSets;
    const legacy = node.props.visemeShapes;
    if (!sets && !legacy) continue;
    const channels = sets ? legacy ? { viseme: legacy, ...sets } : sets : { viseme: legacy };
    const applied = node._swapNames ??= {};
    let changed = false;
    const wanted = {};
    const view = channels.view ? null : channelValue(scene, node, "view");
    for (const [channel, shapes] of Object.entries(channels)) {
      const asked = channelValue(scene, node, channel) ?? node.props.swapDefaults?.[channel] ?? firstKey(shapes);
      const name = resolveSwap(channel, asked, shapes, channel === "view" ? null : view);
      wanted[channel] = name;
      if (applied[channel] !== name) changed = true;
    }
    if (!changed) continue;
    for (const key2 of node._swapProps ?? []) delete node.props[key2];
    const owned = /* @__PURE__ */ new Set();
    let kind = null;
    for (const [channel, shapes] of Object.entries(channels)) {
      const shape = shapes[wanted[channel]];
      if (!shape) continue;
      applied[channel] = wanted[channel];
      kind = shape.kind ?? kind;
      for (const [k, v] of Object.entries(shape)) {
        if (k === "kind") continue;
        node.props[k] = v;
        owned.add(k);
      }
    }
    node._swapProps = owned;
    if (kind) node.kind = kind;
  }
}
var firstKey = (shapes) => Object.keys(shapes)[0];
var applyVisemeShapes = applySwapSets;

// src/core/math/vec2.js
var vec2_exports = {};
__export(vec2_exports, {
  add: () => add,
  angle: () => angle,
  dist: () => dist,
  dot: () => dot,
  len: () => len,
  lerp: () => lerp,
  normalize: () => normalize,
  scale: () => scale,
  sub: () => sub
});
var add = (a, b) => [a[0] + b[0], a[1] + b[1]];
var sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
var scale = (a, s) => [a[0] * s, a[1] * s];
var dot = (a, b) => a[0] * b[0] + a[1] * b[1];
var len = (a) => Math.hypot(a[0], a[1]);
var dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
var angle = (a) => Math.atan2(a[1], a[0]);
function normalize(a) {
  const l = len(a);
  return l === 0 ? [0, 0] : [a[0] / l, a[1] / l];
}
var lerp = (a, b, u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];

// src/core/anim/easing.js
function cubicBezierEase(x1, y1, x2, y2, t) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const fx = (u2) => ((ax * u2 + bx) * u2 + cx) * u2;
  const dfx = (u2) => (3 * ax * u2 + 2 * bx) * u2 + cx;
  let u = t;
  for (let i = 0; i < 8; i++) {
    const x = fx(u) - t;
    if (Math.abs(x) < 1e-6) break;
    const d = dfx(u);
    if (Math.abs(d) < 1e-6) break;
    u -= x / d;
  }
  u = Math.max(0, Math.min(1, u));
  return ((ay * u + by) * u + cy) * u;
}
var smoothstep = (t) => t * t * (3 - 2 * t);
var DEFAULT_BEZIER_HANDLES = [0.42, 0, 0.58, 1];
function easeProgress(ease, u, handles) {
  switch (ease) {
    case "step":
    case "hold":
      return 0;
    case "smooth":
      return smoothstep(u);
    case "bezier": {
      const h = handles || DEFAULT_BEZIER_HANDLES;
      return cubicBezierEase(h[0], h[1], h[2], h[3], u);
    }
    case "linear":
    default:
      return u;
  }
}

// src/core/anim/interpolate.js
var lerpNum = (a, b, u) => a + (b - a) * u;
function lerpVec(a, b, u) {
  const out = new Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] + (b[i] - a[i]) * u;
  return out;
}
function slerpQuat(a, b, u) {
  let [ax, ay, az, aw] = a;
  let [bx, by, bz, bw] = b;
  let cos = ax * bx + ay * by + az * bz + aw * bw;
  if (cos < 0) {
    bx = -bx;
    by = -by;
    bz = -bz;
    bw = -bw;
    cos = -cos;
  }
  if (cos > 0.9995) {
    const out = [lerpNum(ax, bx, u), lerpNum(ay, by, u), lerpNum(az, bz, u), lerpNum(aw, bw, u)];
    const l = Math.hypot(...out) || 1;
    return out.map((v) => v / l);
  }
  const theta = Math.acos(cos);
  const sin = Math.sin(theta);
  const wa = Math.sin((1 - u) * theta) / sin;
  const wb = Math.sin(u * theta) / sin;
  return [ax * wa + bx * wb, ay * wa + by * wb, az * wa + bz * wb, aw * wa + bw * wb];
}
function lerpColor(a, b, u) {
  const parse = (c) => {
    if (typeof c === "number") return [c >> 16 & 255, c >> 8 & 255, c & 255];
    const h = String(c).replace("#", "");
    const s = h.length === 3 ? h.split("").map((x) => x + x).join("") : h;
    return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
  };
  const [r1, g1, b1] = parse(a);
  const [r2, g2, b2] = parse(b);
  const to = (v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0");
  return `#${to(lerpNum(r1, r2, u))}${to(lerpNum(g1, g2, u))}${to(lerpNum(b1, b2, u))}`;
}
function interpolateValue(type, a, b, u) {
  switch (type) {
    case "number":
      return lerpNum(a, b, u);
    case "vec2":
    case "vec3":
      return lerpVec(a, b, u);
    case "quat":
      return slerpQuat(a, b, u);
    case "color":
      return lerpColor(a, b, u);
    case "discrete":
      return u >= 1 ? b : a;
    // never blends; holds then jumps
    default:
      return u >= 1 ? b : a;
  }
}

// src/core/anim/Track.js
function createTrack({ target, path, type = "number", keys = [] }) {
  return { target, path, type, keys: [...keys].sort((a, b) => a.t - b.t) };
}
function setKey(track, t, v, ease = "linear", h) {
  const key2 = { t, v, ...ease !== "linear" ? { ease } : {}, ...h ? { h } : {} };
  const i = track.keys.findIndex((k) => k.t === t);
  if (i >= 0) track.keys[i] = key2;
  else {
    track.keys.push(key2);
    track.keys.sort((a, b) => a.t - b.t);
  }
  return track;
}
function trackValueAt(track, t) {
  const keys = track.keys;
  if (keys.length === 0) return void 0;
  if (keys.length === 1 || t <= keys[0].t) return keys[0].v;
  const last = keys[keys.length - 1];
  if (t >= last.t) return last.v;
  let lo = 0, hi = keys.length - 1;
  while (hi - lo > 1) {
    const mid2 = lo + hi >> 1;
    if (keys[mid2].t <= t) lo = mid2;
    else hi = mid2;
  }
  const a = keys[lo], b = keys[lo + 1];
  const span = b.t - a.t;
  const u = span <= 0 ? 1 : (t - a.t) / span;
  return interpolateValue(track.type, a.v, b.v, easeProgress(a.ease, u, a.h));
}
var trackDuration = (track) => track.keys.length ? track.keys[track.keys.length - 1].t : 0;

// src/core/anim/Clip.js
function createClip({
  id,
  name = id,
  duration,
  loop = "once",
  tracks = [],
  blend = "override",
  mask = null
}) {
  return {
    id,
    name,
    duration: duration ?? Math.max(0, ...tracks.map(trackDuration), 0),
    loop,
    // once | repeat | pingpong
    // 'override' replaces the channel; 'add' layers a DELTA over whatever
    // the base already resolved to. Without the additive mode a pose and a
    // cycle fight over the same channel and the pose wins for the whole
    // film -- which is what left a sixty-second fight 77% frozen.
    blend,
    // Part names this clip is allowed to touch, or null for all of them.
    // The equivalent of an avatar mask: an upper-body gesture should not
    // be able to stop the legs walking.
    mask: mask ? new Set(mask) : null,
    tracks
  };
}
function clipLocalTime(clip, local) {
  const d = clip.duration;
  if (d <= 0) return 0;
  if (local < 0) return 0;
  switch (clip.loop) {
    case "repeat":
      return local % d;
    case "pingpong": {
      const cycle = local % (2 * d);
      return cycle <= d ? cycle : 2 * d - cycle;
    }
    case "once":
    default:
      return Math.min(local, d);
  }
}

// src/core/anim/Timeline.js
function createTimeline({ fps = 24, duration = 0 } = {}) {
  return { fps, duration, tracks: [], instances: [], clips: /* @__PURE__ */ new Map() };
}
function addClip(timeline, clip) {
  timeline.clips.set(clip.id, clip);
  return clip;
}
function addInstance(timeline, inst) {
  timeline.instances.push({ speed: 1, ...inst });
  return timeline;
}
var trackKey = (target, path) => `${target}\0${path}`;
function key(timeline, target, path, t, v, { type, ease = "linear", h } = {}) {
  timeline._index ??= /* @__PURE__ */ new Map();
  const k = trackKey(target, path);
  let track = timeline._index.get(k);
  if (!track) {
    track = createTrack({ target, path, type: type ?? inferType(v) });
    timeline.tracks.push(track);
    timeline._index.set(k, track);
  }
  setKey(track, t, v, ease, h);
  if (t > timeline.duration) timeline.duration = t;
  return track;
}
function getTrack(timeline, target, path) {
  return timeline._index?.get(trackKey(target, path));
}
function inferType(v) {
  if (typeof v === "number") return "number";
  if (typeof v === "string") return v.startsWith("#") ? "color" : "discrete";
  if (Array.isArray(v)) return v.length === 4 ? "quat" : v.length === 3 ? "vec3" : "vec2";
  return "discrete";
}

// src/core/anim/Evaluator.js
var Additive = class _Additive {
  constructor(delta = 0, ratio = 1) {
    this.delta = delta;
    this.ratio = ratio;
  }
  /** Resolve against the base this channel already holds. */
  over(base) {
    const b = typeof base === "number" ? base : 0;
    return b * this.ratio + this.delta;
  }
  add(other) {
    return new _Additive(this.delta + other.delta, this.ratio * other.ratio);
  }
};
var RATIO_CHANNELS = /* @__PURE__ */ new Set(["transform.sx", "transform.sy"]);
var SMOOTH_TARGETS = /* @__PURE__ */ new Set(["__camera", "__subtitle"]);
function stepAt(timeline, tSec) {
  for (const span of timeline.steps ?? []) {
    if (tSec >= span.start && tSec < span.end) return span.step ?? 0;
  }
  return timeline.step ?? 0;
}
function quantise(tSec, step, fps) {
  if (!step || step <= 1) return tSec;
  const frame = Math.floor(tSec * fps + 1e-6);
  return Math.floor(frame / step) * step / fps;
}
function samplePose(timeline, tSec) {
  const pose = /* @__PURE__ */ new Map();
  const layered = [];
  const step = stepAt(timeline, tSec);
  const fps = timeline.fps || 24;
  const held = quantise(tSec, step, fps);
  const timeFor = (target) => SMOOTH_TARGETS.has(String(target).split("/")[0]) ? tSec : held;
  const write = (target, path, value) => {
    if (value === void 0) return;
    let channels = pose.get(target);
    if (!channels) pose.set(target, channels = /* @__PURE__ */ new Map());
    channels.set(path, value);
  };
  for (const inst of timeline.instances) {
    const clip = timeline.clips.get(inst.clipId);
    if (!clip) continue;
    const start = inst.start ?? 0;
    const end = inst.end ?? timeline.duration;
    if (tSec < start || tSec > end) continue;
    const sampleAt = timeFor(inst.scopeId ?? "");
    if (sampleAt < start || sampleAt > end) continue;
    const local = clipLocalTime(clip, (sampleAt - start) * (inst.speed ?? 1));
    const weight = inst.weight ?? 1;
    if (weight <= 0) continue;
    for (const track of clip.tracks) {
      if (clip.mask && !clip.mask.has(track.target)) continue;
      const target = inst.scopeId ? `${inst.scopeId}/${track.target}` : track.target;
      const value = trackValueAt(track, local);
      if (clip.blend !== "add") {
        write(target, track.path, value);
        continue;
      }
      if (typeof value !== "number") continue;
      const ref = trackValueAt(track, 0);
      if (typeof ref !== "number") continue;
      const contribution = RATIO_CHANNELS.has(track.path) ? new Additive(0, ref === 0 ? 1 : 1 + (value / ref - 1) * weight) : new Additive((value - ref) * weight, 1);
      layered.push([target, track.path, contribution]);
    }
  }
  for (const track of timeline.tracks) {
    write(track.target, track.path, trackValueAt(track, timeFor(track.target)));
  }
  for (const [target, path, contribution] of layered) {
    let channels = pose.get(target);
    if (!channels) pose.set(target, channels = /* @__PURE__ */ new Map());
    const base = channels.get(path);
    channels.set(path, base instanceof Additive ? base.add(contribution) : base === void 0 ? contribution : contribution.over(base));
  }
  return pose;
}
function applyPose(scene, pose) {
  for (const [nodeId, channels] of pose) {
    const node = scene.get(nodeId);
    if (!node) continue;
    let transformTouched = false;
    for (const [path, value] of channels) {
      const dot2 = path.indexOf(".");
      if (dot2 < 0) {
        node[path] = value;
        continue;
      }
      const group = path.slice(0, dot2);
      const field = path.slice(dot2 + 1);
      if (group === "transform") {
        node.transform[field] = value instanceof Additive ? value.over(node.transform[field]) : value;
        transformTouched = true;
      } else if (group === "props") {
        node.props[field] = value instanceof Additive ? value.over(node.props[field]) : value;
      } else {
        const bag = node[group] ??= {};
        bag[field] = value instanceof Additive ? value.over(bag[field]) : value;
      }
    }
    if (transformTouched) scene.invalidate(nodeId);
  }
  return scene;
}
function timelineChannels(timeline) {
  const channels = [];
  for (const track of timeline.tracks) channels.push([track.target, track.path]);
  for (const inst of timeline.instances) {
    const clip = timeline.clips.get(inst.clipId);
    if (!clip) continue;
    for (const track of clip.tracks) {
      const target = inst.scopeId ? `${inst.scopeId}/${track.target}` : track.target;
      channels.push([target, track.path]);
    }
  }
  return channels;
}
function createPoseBaseline(scene, timeline) {
  const baseline = /* @__PURE__ */ new Map();
  for (const [nodeId, path] of timelineChannels(timeline)) {
    const node = scene.get(nodeId);
    if (!node) continue;
    let channels = baseline.get(nodeId);
    if (!channels) baseline.set(nodeId, channels = /* @__PURE__ */ new Map());
    if (channels.has(path)) continue;
    const dot2 = path.indexOf(".");
    const group = dot2 < 0 ? null : path.slice(0, dot2);
    const field = dot2 < 0 ? path : path.slice(dot2 + 1);
    const value = group === "transform" ? node.transform[field] : group === "props" ? node.props[field] : group ? node[group]?.[field] : node[path];
    channels.set(path, value);
  }
  return baseline;
}
function resetPose(scene, baseline) {
  for (const [nodeId, channels] of baseline) {
    const node = scene.get(nodeId);
    if (!node) continue;
    for (const [path, value] of channels) {
      const dot2 = path.indexOf(".");
      if (dot2 < 0) {
        node[path] = value;
        continue;
      }
      const group = path.slice(0, dot2);
      const field = path.slice(dot2 + 1);
      if (group === "transform") node.transform[field] = value;
      else if (group === "props") node.props[field] = value;
      else if (node[group]) node[group][field] = value;
    }
    scene.invalidate(nodeId);
  }
  return scene;
}
var Evaluator = {
  sample: samplePose,
  apply: applyPose,
  trackValueAt,
  Additive,
  createBaseline: createPoseBaseline,
  reset: resetPose,
  channels: timelineChannels
};

// src/core/time/FrameClock.js
var FrameClock = class {
  constructor(fps = 24) {
    if (!(fps > 0)) throw new Error("FrameClock: fps must be positive");
    this.fps = fps;
  }
  timeOf(frameIndex) {
    return frameIndex / this.fps;
  }
  /**
   * Frame count for a duration. A 2.0s film at 24fps is 48 frames covering
   * t=0..47/24; the final frame's own display period is the sink's problem,
   * not the clock's.
   */
  count(durationSec) {
    return Math.max(1, Math.round(durationSec * this.fps));
  }
  frameOf(tSec) {
    return Math.round(tSec * this.fps);
  }
  get frameDuration() {
    return 1 / this.fps;
  }
};

// src/core/rig/IK2D.js
var TAU = Math.PI * 2;
function wrapAngle(a) {
  const r = ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;
  return r === -Math.PI ? Math.PI : r;
}
var clampRot = (bone, rot) => {
  let r = wrapAngle(rot);
  if (bone.min != null) r = Math.max(bone.min, r);
  if (bone.max != null) r = Math.min(bone.max, r);
  return r;
};
function forwardKinematics(bones, rots) {
  const joints = [[0, 0]];
  let acc = 0;
  let x = 0;
  let y = 0;
  for (let i = 0; i < bones.length; i++) {
    acc += rots[i] ?? 0;
    const dir = (bones[i].rest ?? Math.PI / 2) + acc;
    x += bones[i].length * Math.cos(dir);
    y += bones[i].length * Math.sin(dir);
    joints.push([x, y]);
  }
  return joints;
}
function solveTwoBone({ bones, target, bend = 1 }) {
  const [b0, b1] = bones;
  const l0 = b0.length;
  const l1 = b1.length;
  const rest0 = b0.rest ?? Math.PI / 2;
  const rest1 = b1.rest ?? Math.PI / 2;
  const raw = Math.hypot(target[0], target[1]);
  const base = raw < 1e-9 ? rest0 : Math.atan2(target[1], target[0]);
  const lo = Math.abs(l0 - l1);
  const hi = l0 + l1;
  const d = Math.min(hi, Math.max(lo, raw));
  const cosA = d < 1e-9 ? 1 : (l0 * l0 + d * d - l1 * l1) / (2 * l0 * d);
  const cosI = (l0 * l0 + l1 * l1 - d * d) / (2 * l0 * l1);
  const alpha = Math.acos(Math.min(1, Math.max(-1, cosA)));
  const interior = Math.acos(Math.min(1, Math.max(-1, cosI)));
  const dir0 = base + bend * alpha;
  const dir1 = dir0 - bend * (Math.PI - interior);
  const rot0 = clampRot(b0, dir0 - rest0);
  const rot1 = clampRot(b1, dir1 - rest1 - rot0);
  const rots = [rot0, rot1];
  const tip = forwardKinematics(bones, rots)[2];
  return {
    rots,
    error: Math.hypot(target[0] - tip[0], target[1] - tip[1]),
    tip,
    // `clamped` means the target was unreachable, not that the solve
    // failed: the limb is extended or folded as far as it goes.
    clamped: raw > hi + 1e-9 || raw < lo - 1e-9
  };
}
function solveChain({ bones, target, bend = 1, iterations = 12, tolerance = 0.25 }) {
  if (bones.length === 0) return { rots: [], error: Math.hypot(...target), tip: [0, 0], clamped: true };
  if (bones.length === 1) {
    const rest = bones[0].rest ?? Math.PI / 2;
    const raw = Math.hypot(target[0], target[1]);
    const rots2 = [clampRot(bones[0], (raw < 1e-9 ? rest : Math.atan2(target[1], target[0])) - rest)];
    const tip = forwardKinematics(bones, rots2)[1];
    return { rots: rots2, error: Math.hypot(target[0] - tip[0], target[1] - tip[1]), tip, clamped: Math.abs(raw - bones[0].length) > 1e-9 };
  }
  const limited = bones.some((b) => b.min != null || b.max != null);
  if (bones.length === 2 && !limited) return solveTwoBone({ bones, target, bend });
  const rots = bones.length === 2 ? solveTwoBone({ bones, target, bend }).rots.map((r, i) => clampRot(bones[i], r)) : bones.map(() => 0);
  let joints = forwardKinematics(bones, rots);
  let error = Math.hypot(target[0] - joints[bones.length][0], target[1] - joints[bones.length][1]);
  for (let it = 0; it < iterations && error > tolerance; it++) {
    for (let i = bones.length - 1; i >= 0; i--) {
      const pivot = joints[i];
      const tip2 = joints[bones.length];
      const a = Math.atan2(tip2[1] - pivot[1], tip2[0] - pivot[0]);
      const b = Math.atan2(target[1] - pivot[1], target[0] - pivot[0]);
      rots[i] = clampRot(bones[i], rots[i] + wrapAngle(b - a));
      joints = forwardKinematics(bones, rots);
    }
    const tip = joints[bones.length];
    const next = Math.hypot(target[0] - tip[0], target[1] - tip[1]);
    if (error - next < 1e-6) {
      error = next;
      break;
    }
    error = next;
  }
  return { rots, error, tip: joints[bones.length], clamped: error > tolerance };
}
function chainFromParts(parts, tipId, count = 2) {
  const byId = new Map(parts.map((p) => [p.id, p]));
  const lineage = [];
  for (let id = tipId; id != null && lineage.length <= count; ) {
    const part = byId.get(id);
    if (!part) break;
    lineage.unshift(part);
    id = part.parent;
  }
  const chain = lineage.slice(-(count + 1));
  if (chain.length < 2) return null;
  const bones = [];
  for (let i = 1; i < chain.length; i++) {
    const pivot = chain[i].pivot ?? [0, 0];
    const length = Math.hypot(pivot[0], pivot[1]);
    if (length < 1e-9) return null;
    bones.push({
      id: chain[i - 1].id,
      length,
      rest: Math.atan2(pivot[1], pivot[0])
    });
  }
  return { bones, rootId: chain[0].id, tipId: chain[chain.length - 1].id };
}
function chainRootOffset(parts, rootId) {
  const byId = new Map(parts.map((p) => [p.id, p]));
  let x = 0;
  let y = 0;
  for (let id = rootId; id != null; ) {
    const part = byId.get(id);
    if (!part) break;
    const pivot = part.pivot ?? [0, 0];
    x += pivot[0];
    y += pivot[1];
    id = part.parent;
  }
  return [x, y];
}

// src/core/art/AssetRegistry.js
var AssetRegistry = class {
  constructor() {
    this.providers = /* @__PURE__ */ new Map();
  }
  register(provider) {
    this.providers.set(provider.id, provider);
    return this;
  }
  all() {
    return [...this.providers.values()];
  }
  byId(id) {
    return this.providers.get(id) ?? null;
  }
  /**
   * Pick the provider for an asset.
   *
   * An explicit `provider` wins; otherwise the shape of `src` decides, so
   * a film can just say `"src": "art/room.png"` and mean it.
   */
  resolve(asset) {
    if (asset.provider) return this.byId(asset.provider);
    for (const provider of this.providers.values()) {
      if (provider.accepts?.(asset)) return provider;
    }
    return null;
  }
};
async function loadAssets(film, { registry, baseUrl = "", onProgress = null } = {}) {
  const assets = {};
  const diagnostics = [];
  const declared = Object.entries(film?.assets ?? {}).filter(([, a]) => a && a.kind === "image");
  let done = 0;
  for (const [id, asset] of declared) {
    const provider = registry?.resolve(asset);
    if (!provider) {
      diagnostics.push({
        severity: "warning",
        path: `assets.${id}`,
        message: `No art provider can load image asset "${id}"${asset.src ? ` (src "${asset.src}")` : ""}.`
      });
      continue;
    }
    try {
      assets[id] = await provider.load({ ...asset, id, baseUrl });
    } catch (error) {
      diagnostics.push({
        severity: "warning",
        path: `assets.${id}`,
        message: `Image asset "${id}" failed to load: ${error.message}`
      });
    }
    onProgress?.({ stage: "assets", done: ++done, total: declared.length, id });
  }
  return { assets, diagnostics };
}
async function loadAudioAssets(film, { baseUrl = "", decode, fetchImpl, onProgress } = {}) {
  const buffers = {};
  const diagnostics = [];
  const declared = Object.entries(film?.assets ?? {}).filter(([, a]) => a && a.kind === "audio" && a.src);
  if (!declared.length || !decode) return { buffers, diagnostics };
  const get = fetchImpl ?? globalThis.fetch;
  let done = 0;
  for (const [id, asset] of declared) {
    const url = /^(https?:|data:|blob:)/.test(asset.src) ? asset.src : `${baseUrl}${asset.src}`;
    try {
      const res = await get(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      buffers[id] = await decode(await res.arrayBuffer());
    } catch (error) {
      diagnostics.push({
        severity: "warning",
        path: `assets.${id}`,
        message: `Audio asset "${id}" failed to load from "${url}": ${error.message}. It will be silent.`
      });
    }
    onProgress?.({ stage: "audio", done: ++done, total: declared.length, id });
  }
  return { buffers, diagnostics };
}

// src/core/art/providers/UrlProvider.js
var UrlProvider = class {
  constructor({ fetchImpl = null, createBitmap = null } = {}) {
    this.id = "url";
    this.label = "File or URL";
    this._fetch = fetchImpl;
    this._createBitmap = createBitmap;
  }
  available() {
    return typeof (this._fetch ?? globalThis.fetch) === "function" && typeof (this._createBitmap ?? globalThis.createImageBitmap) === "function";
  }
  accepts(asset) {
    return typeof asset.src === "string";
  }
  async load({ src, baseUrl = "" }) {
    if (!src) throw new Error("no src");
    const fetchImpl = this._fetch ?? globalThis.fetch;
    const createBitmap = this._createBitmap ?? globalThis.createImageBitmap;
    if (!fetchImpl || !createBitmap) throw new Error("no fetch/createImageBitmap here");
    const base = baseUrl || globalThis.location?.href || "http://localhost/";
    const url = /^(https?:|data:|blob:)/.test(src) ? src : new URL(src, base).href;
    const res = await fetchImpl(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return createBitmap(await res.blob());
  }
};

// src/core/art/providers/FileProvider.js
var FileProvider = class {
  constructor({ createBitmap = null } = {}) {
    this.id = "file";
    this.label = "Uploaded image";
    this._createBitmap = createBitmap;
  }
  available() {
    return typeof (this._createBitmap ?? globalThis.createImageBitmap) === "function";
  }
  accepts(asset) {
    return !!asset.file;
  }
  async load({ file }) {
    if (!file) throw new Error("no file");
    const createBitmap = this._createBitmap ?? globalThis.createImageBitmap;
    if (!createBitmap) throw new Error("createImageBitmap is unavailable here");
    return createBitmap(file);
  }
};

// src/core/art/face.js
var CY = -0.92;
var VIEWS = { front: 0, threeQuarter: 0.55, profile: 1 };
var VIEW_NAMES = Object.keys(VIEWS);
var n = (v) => Math.round(v * 100) / 100;
var pt = ([x, y]) => `${n(x)},${n(y)}`;
var mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
function smoothClosed(points) {
  const k = points.length;
  if (k < 3) return "";
  let d = `M${pt(mid(points[k - 1], points[0]))}`;
  for (let i = 0; i < k; i++) {
    d += ` Q${pt(points[i])} ${pt(mid(points[i], points[(i + 1) % k]))}`;
  }
  return `${d} Z`;
}
var circle = (cx, cy, r, sides = 8) => smoothClosed(
  Array.from({ length: sides }, (_, i) => {
    const a = i / sides * Math.PI * 2;
    const k = r / Math.cos(Math.PI / sides);
    return [cx + Math.cos(a) * k, cy + Math.sin(a) * k];
  })
);
function polyPath(points) {
  if (points.length < 3) return "";
  return `M${points.map(pt).join(" L")} Z`;
}
var lerp2 = (a, b, t) => a + (b - a) * t;
var lerpPts = (a, b, t) => a.map((p, i) => [lerp2(p[0], b[i][0], t), lerp2(p[1], b[i][1], t)]);
var JAWS = {
  round: { cheek: 1, jaw: 0.8, chin: 0.36 },
  square: { cheek: 0.98, jaw: 0.96, chin: 0.62 },
  tapered: { cheek: 0.96, jaw: 0.6, chin: 0.2 },
  heavy: { cheek: 1.06, jaw: 1.02, chin: 0.54 }
};
var EYES = {
  // Wider than tall. A near-circular eye reads as a googly cartoon eye, not
  // as a drawing -- the first sheet made that unmistakable.
  round: { w: 0.21, up: 0.12, low: 0.1 },
  hooded: { w: 0.22, up: 0.07, low: 0.08 },
  narrow: { w: 0.23, up: 0.05, low: 0.05 },
  wide: { w: 0.21, up: 0.16, low: 0.12 },
  "closed-happy": { w: 0.22, up: 0.09, low: 0.07, lidOnly: true }
};
var BROWS = {
  flat: { rise: 0.3, thick: 0.055, arch: 0.02, tilt: 0 },
  arched: { rise: 0.34, thick: 0.045, arch: 0.1, tilt: -0.02 },
  heavy: { rise: 0.26, thick: 0.095, arch: 0.03, tilt: 0.01 },
  thin: { rise: 0.32, thick: 0.028, arch: 0.06, tilt: 0 },
  angled: { rise: 0.3, thick: 0.065, arch: 0.02, tilt: 0.09 }
};
var NOSES = {
  button: { len: 0.2, w: 0.11, jut: 0.1 },
  straight: { len: 0.3, w: 0.09, jut: 0.14 },
  broad: { len: 0.24, w: 0.17, jut: 0.12 },
  hooked: { len: 0.32, w: 0.1, jut: 0.2, hook: 0.07 },
  small: { len: 0.16, w: 0.09, jut: 0.08 }
};
var LIPS = { full: 1.12, thin: 0.86, wide: 1.26, medium: 1 };
var EARS = {
  small: { r: 0.13, out: 0.02 },
  round: { r: 0.18, out: 0.05 },
  pointed: { r: 0.16, out: 0.04, point: 0.1 },
  none: null
};
var EXPRESSIONS = {
  neutral: {},
  angry: { brow: "angled", browRise: -0.06, browTilt: 0.1, eyes: "narrow" },
  surprised: { brow: "arched", browRise: 0.08, eyes: "wide" },
  smug: { brow: "arched", browRise: 0.02, browTilt: -0.05, eyes: "hooded" },
  weary: { brow: "flat", browRise: -0.03, browTilt: -0.06, eyes: "hooded" },
  delighted: { brow: "arched", browRise: 0.06, eyes: "closed-happy" }
};
var HAIRS = [
  "afro-large",
  "afro-short",
  "braids",
  "short-fade",
  "locs",
  "wrap",
  "spiky",
  "flame",
  "bald"
];
var FACE_KITS = {
  jaw: Object.keys(JAWS),
  eyes: Object.keys(EYES),
  brow: Object.keys(BROWS),
  nose: Object.keys(NOSES),
  lips: Object.keys(LIPS),
  ears: Object.keys(EARS),
  hair: HAIRS,
  expression: Object.keys(EXPRESSIONS),
  view: VIEW_NAMES
};
var DEFAULT_FACE = {
  jaw: "round",
  eyes: "round",
  brow: "flat",
  nose: "button",
  lips: "medium",
  ears: "round"
};
function frontOutline(k) {
  const m = (k.cheek + k.jaw) / 2;
  return [
    [0, -1],
    [0.7, -0.78],
    [1, -0.3],
    [k.cheek, 0.14],
    [m, 0.42],
    [k.jaw, 0.64],
    [k.chin, 0.9],
    [0, 1],
    [-k.chin, 0.9],
    [-k.jaw, 0.64],
    [-m, 0.42],
    [-k.cheek, 0.14],
    [-1, -0.3],
    [-0.7, -0.78]
  ];
}
function profileOutline(k, nose) {
  const tip = 1.02 + nose.jut * 2.9 + (nose.hook ?? 0) * 0.8;
  return [
    [0.1, -1.04],
    [0.78, -0.8],
    [0.98, -0.32],
    [tip, nose.len + 0.02],
    // nose tip, well clear
    [0.9, nose.len + 0.2],
    // under the nose, recessed
    [1, nose.len + 0.38],
    // lip
    [0.86 * (0.55 + k.chin * 0.8), 0.8],
    [0.48, 0.98],
    // chin
    [-0.14, 0.94],
    [-0.74, 0.7],
    [-1.1, 0.28],
    [-1.26, -0.12],
    [-1.1, -0.58],
    [-0.6, -0.94]
  ];
}
var scalePts = (pts, W, R, sgn) => pts.map(([x, y]) => [sgn * x * W, CY * R + y * R]);
function layout(dir) {
  return {
    // The near eye rides toward the facing edge; the far eye crowds the
    // silhouette and narrows until it is gone.
    nearEyeX: 0.34 + 0.44 * dir,
    farEyeX: -(0.38 - 0.12 * dir),
    // Foreshortens in width only, and vanishes at full profile. A linear
    // ramp steep enough to reach zero by profile squeezed the
    // three-quarter eye into a vertical sliver that read as a dot.
    farEyeScale: dir >= 0.85 ? 0 : 1 - 0.55 * dir,
    eyeY: 0.04,
    browY: -0.26,
    // The drawn nose tracks the silhouette's nose tip, so the shape and
    // the outline agree instead of the nose floating on the cheek.
    noseX: 0.06 + 0.98 * dir,
    // An ear travels BACKWARD as the head turns -- it ends up behind the
    // eye, not in front of it. Sliding it only slightly inward left it
    // sitting on top of the eye in profile, which is what the sheet showed.
    // When a head turns to face +x you see the OTHER side of it, so the
    // ear that survives the turn is the far one, travelling forward from
    // the back of the skull. Carrying the near ear through instead walked
    // it across the middle of the face.
    earX: 1 - 0.3 * dir,
    // the facing-side ear, before it is lost
    earBackX: -(1 - 0.76 * dir),
    // the one you actually keep seeing
    earY: -0.02 + 0.08 * dir,
    earScale: 1 - 0.26 * dir,
    nearEarVisible: dir < 0.35
  };
}
function eyePath(cx, cy, e, scale2, R, W, sgn) {
  const w = e.w * scale2 * W * (sgn || 1);
  const up = e.up * R, low = e.low * R;
  const x = cx, y = cy;
  if (e.lidOnly) {
    const t = Math.abs(up) * 0.34 + R * 0.012;
    return smoothClosed([
      [x - w, y + low * 0.3],
      [x, y - up],
      [x + w, y + low * 0.3],
      [x + w * 0.8, y + low * 0.3 + t],
      [x, y - up + t * 1.3],
      [x - w * 0.8, y + low * 0.3 + t]
    ]);
  }
  return smoothClosed([
    [x - w, y + low * 0.1],
    [x - w * 0.45, y - up],
    [x + w * 0.45, y - up * 0.88],
    [x + w, y + low * 0.15],
    [x + w * 0.45, y + low],
    [x - w * 0.45, y + low * 0.88]
  ]);
}
function browPath(cx, cy, b, scale2, R, W, inner) {
  const w = b.w ?? 0.2;
  const halfW = w * scale2 * W;
  const th = b.thick * R;
  const tiltIn = b.tilt * R * inner * -1;
  const a = [cx - halfW, cy + b.arch * R * 0.2 + (inner < 0 ? tiltIn : 0)];
  const c = [cx + halfW, cy + b.arch * R * 0.2 + (inner > 0 ? tiltIn : 0)];
  const peak = [cx, cy - b.arch * R];
  return smoothClosed([
    a,
    peak,
    c,
    [c[0], c[1] + th],
    [peak[0], peak[1] + th * 1.2],
    [a[0], a[1] + th]
  ]);
}
function earPath(cx, cy, k, R, W, sgn) {
  const r = k.r * R, out = k.out * W * sgn;
  const pts = [
    [cx - r * 0.3 * sgn, cy - r],
    [cx + r * 0.7 * sgn + out, cy - r * (k.point ? 1.6 : 0.5)],
    [cx + r * 0.9 * sgn + out, cy + r * 0.3],
    [cx + r * 0.2 * sgn, cy + r]
  ];
  return smoothClosed(pts);
}
function hairFront(style, k, R, W, sgn, dir) {
  if (style === "bald") return null;
  if (style === "spiky") {
    return spikeCrown(
      R,
      W,
      sgn,
      dir,
      { tips: 9, out: 1.66, inner: 1.02, sweep: 0.05, wobble: 0.14 }
    );
  }
  if (style === "flame") {
    return spikeCrown(
      R,
      W,
      sgn,
      dir,
      { tips: 7, out: 1.8, inner: 1.04, sweep: 0.34, wobble: 0.22 }
    );
  }
  const o = lerpPts(frontOutline(k), profileOutline(k, NOSES.button), dir);
  const { grow, hairline } = HAIR_FRONT[style] ?? HAIR_FRONT["short-fade"];
  const edge = [12, 13, 0, 1, 2].map((i) => [o[i][0] * grow, o[i][1] * grow]);
  const inner = [
    [o[2][0] * 0.8, hairline + 0.06],
    [0, hairline],
    [o[12][0] * 0.8, hairline + 0.06]
  ];
  return smoothClosed(scalePts([...edge, ...inner], W, R, sgn));
}
function spikeCrown(R, W, sgn, dir, {
  tips = 9,
  out = 1.62,
  inner = 1,
  sweep = 0,
  wobble = 0
} = {}) {
  const pts = [];
  const back = -sgn;
  const lift = -0.05;
  for (let i = 0; i <= tips; i++) {
    const t = i / tips;
    const a = Math.PI * (1 - t);
    const cos = Math.cos(a), sin = Math.sin(a);
    pts.push([cos * inner * W, (CY + lift - sin * inner) * R]);
    if (i === tips) break;
    const am = Math.PI * (1 - (t + 0.5 / tips));
    const cm = Math.cos(am), sm = Math.sin(am);
    const grow = out + (wobble ? wobble * Math.sin(i * 2.4) : 0);
    pts.push([
      (cm * grow + back * sweep) * W,
      (CY + lift - sm * grow - sweep * 0.35) * R
    ]);
  }
  pts.push([inner * 0.96 * W, (CY - 0.34) * R]);
  pts.push([0, (CY - 0.46) * R]);
  pts.push([-inner * 0.96 * W, (CY - 0.34) * R]);
  return polyPath(pts.map(([x, y]) => [x * (1 - 0.1 * dir), y]));
}
var HAIR_FRONT = {
  "short-fade": { grow: 1.04, hairline: -0.5 },
  wrap: { grow: 1.14, hairline: -0.38 },
  "afro-short": { grow: 1.12, hairline: -0.46 },
  "afro-large": { grow: 1.16, hairline: -0.44 },
  spiky: { grow: 1.04, hairline: -0.46 },
  flame: { grow: 1.06, hairline: -0.44 },
  braids: { grow: 1.08, hairline: -0.46 },
  locs: { grow: 1.1, hairline: -0.48 }
};
function hairBackPath(style, k, R, W, sgn, dir) {
  if (style === "bald") return null;
  const cx = -sgn * 0.22 * W * dir;
  switch (style) {
    case "short-fade":
      return circle(cx, (CY - 0.06) * R, W * 1.16, 10);
    case "wrap":
      return circle(cx, (CY - 0.1) * R, W * 1.22, 10);
    case "afro-short":
      return circle(cx, (CY - 0.22) * R, W * 1.34, 12);
    case "afro-large":
      return circle(cx, (CY - 0.3) * R, W * 1.74, 14);
    case "spiky":
      return circle(cx, (CY - 0.16) * R, W * 1.18, 10);
    case "flame":
      return circle(cx - sgn * 0.12 * W, (CY - 0.18) * R, W * 1.26, 10);
    case "braids": {
      const d = [circle(cx, (CY - 0.12) * R, W * 1.14, 10)];
      for (const side of [-1, 1]) {
        if (dir > 0.75 && side * sgn < 0) continue;
        const x = side * W * 0.98 + cx;
        d.push(smoothClosed([
          [x, (CY - 0.1) * R],
          [x + side * W * 0.26, (CY + 0.55) * R],
          [x + side * W * 0.16, (CY + 1.45) * R],
          [x - side * W * 0.16, (CY + 1.38) * R],
          [x - side * W * 0.22, (CY + 0.45) * R]
        ]));
      }
      return d.join(" ");
    }
    case "locs": {
      const d = [circle(cx, (CY - 0.18) * R, W * 1.2, 10)];
      for (let i = -2; i <= 2; i++) {
        const x = cx + i * W * 0.5;
        if (dir > 0.75 && i * sgn < 0) continue;
        const drop = 1.1 + Math.abs(i) * 0.18;
        d.push(smoothClosed([
          [x - W * 0.13, (CY - 0.5) * R],
          [x + W * 0.13, (CY - 0.45) * R],
          [x + W * 0.11, (CY + drop) * R],
          [x - W * 0.11, (CY + drop - 0.08) * R]
        ]));
      }
      return d.join(" ");
    }
    default:
      return circle(cx, (CY - 0.08) * R, W * 1.08, 10);
  }
}
function headParts({ R, face = {}, hair = "short-fade", facing = 1, colors = {} }) {
  const f = { ...DEFAULT_FACE, ...face };
  const jaw = JAWS[f.jaw] ?? JAWS.round;
  const nose = NOSES[f.nose] ?? NOSES.button;
  const ear = f.ears in EARS ? EARS[f.ears] : EARS.round;
  const sgn = facing >= 0 ? 1 : -1;
  const W = R * 0.86;
  const skin = colors.skin ?? "skin";
  const parts = [];
  const perView = (make) => {
    const shapes = {};
    for (const [name, dir] of Object.entries(VIEWS)) {
      const d = make(dir, name);
      if (d) shapes[name] = { kind: "path", d };
    }
    return Object.keys(shapes).length ? shapes : null;
  };
  const addSwap = (part, sets) => {
    const kept = Object.fromEntries(Object.entries(sets).filter(([, v]) => v));
    if (!Object.keys(kept).length) return;
    part.swap = {};
    for (const [channel, shapes] of Object.entries(kept)) {
      part.swap[channel] = { default: channel === "view" ? "front" : "neutral", shapes };
    }
    parts.push(part);
  };
  const back = perView((dir) => hairBackPath(hair, jaw, R, W, sgn, dir));
  if (back) addSwap({ id: "hairBack", parent: "head", z: 0, fill: `${colors.hair ?? "hair"}Shade` }, { view: back });
  const farEar = ear && perView((dir) => {
    const L = layout(dir);
    return L.nearEarVisible ? earPath(sgn * L.earX * W, L.earY * R + CY * R, ear, R, W, sgn) : null;
  });
  if (farEar) {
    addSwap({
      id: "earFar",
      parent: "head",
      z: 1,
      fill: `${skin}Shade`,
      stroke: `${skin}Line`,
      strokeWidth: Math.max(1, R * 0.045)
    }, { view: farEar });
  }
  const skullViews = perView((dir) => smoothClosed(
    scalePts(lerpPts(frontOutline(jaw), profileOutline(jaw, nose), dir), W, R, sgn)
  ));
  const shadeViews = perView((dir) => {
    const o = lerpPts(frontOutline(jaw), profileOutline(jaw, nose), dir);
    const take = sgn > 0 ? [12, 13, 0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0, 13, 12];
    const edge = take.map((i) => o[i]);
    const inner = edge.slice().reverse().map(([x, y]) => [x * (0.42 + 0.34 * dir) - sgn * 0.3 * (1 - dir), y * 0.72 - 0.1]);
    return smoothClosed(scalePts([...edge, ...inner], W, R, sgn));
  });
  const skull = {
    id: "skull",
    parent: "head",
    z: 10,
    fill: skin,
    stroke: `${skin}Line`,
    strokeWidth: Math.max(1.2, R * 0.055)
  };
  if (skullViews) {
    skull.swap = { view: { default: "front", shapes: skullViews } };
    skull.shapes = [{
      id: "shade",
      z: 1,
      fill: `${skin}Shade`,
      swap: { view: { default: "front", shapes: shadeViews } }
    }];
  }
  parts.push(skull);
  const nearEar = ear && perView((dir) => {
    const L = layout(dir);
    return earPath(
      sgn * L.earBackX * W,
      L.earY * R + CY * R,
      { ...ear, r: ear.r * L.earScale },
      R,
      W,
      -sgn
    );
  });
  if (nearEar) {
    addSwap({
      id: "earNear",
      parent: "head",
      z: 12,
      fill: skin,
      stroke: `${skin}Line`,
      strokeWidth: Math.max(1, R * 0.045)
    }, { view: nearEar });
  }
  const eyeSet = (kind) => perView((dir) => {
    const L = layout(dir);
    const e = EYES[kind] ?? EYES.round;
    const near = eyePath(sgn * L.nearEyeX * W, (CY + L.eyeY) * R, e, 1, R, W, sgn);
    if (L.farEyeScale <= 0.02) return near;
    const far = eyePath(sgn * L.farEyeX * W, (CY + L.eyeY) * R, e, L.farEyeScale, R, W, sgn);
    return `${far} ${near}`;
  });
  const lidOnly = (kind) => (EYES[kind] ?? EYES.round).lidOnly;
  const white = colors.white ?? "white";
  const tint = (shapes, kind) => Object.fromEntries(Object.entries(shapes).map(([k, v]) => [k, { ...v, fill: lidOnly(kind) ? `${skin}Line` : white }]));
  addSwap({
    id: "eyes",
    parent: "head",
    z: 20,
    fill: lidOnly(f.eyes) ? `${skin}Line` : white,
    stroke: `${skin}Line`,
    strokeWidth: Math.max(1, R * 0.05)
  }, {
    view: tint(eyeSet(f.eyes), f.eyes),
    expression: expressionSet(f, (ex) => ex.eyes ? tint(eyeSet(ex.eyes), ex.eyes) : null),
    // `open` is EMPTY on purpose: a blink must not re-specify geometry the
    // view and the expression already decided, or it silently reverts a
    // turned head to a front-facing pair of eyes every frame it is open.
    // Only `closed` draws, and it is view-qualified so a blink in profile
    // closes one eye rather than two.
    eyes: { open: {}, ...viewQualified(tint(eyeSet("closed-happy"), "closed-happy"), "closed") }
  });
  if (!lidOnly(f.eyes)) {
    const pupils = perView((dir) => {
      const L = layout(dir);
      const r = Math.max(1.1, R * 0.062);
      const near = circle(sgn * L.nearEyeX * W, (CY + L.eyeY + 0.02) * R, r);
      if (L.farEyeScale <= 0.02) return near;
      return `${circle(sgn * L.farEyeX * W, (CY + L.eyeY + 0.02) * R, r * L.farEyeScale)} ${near}`;
    });
    addSwap(
      { id: "pupils", parent: "head", z: 21, fill: colors.eye ?? "eye" },
      { view: pupils, eyes: { open: {}, closed: { kind: "path", d: "" } } }
    );
  }
  const browSet = (kind, riseAdj = 0, tiltAdj = 0) => perView((dir) => {
    const L = layout(dir);
    const base = BROWS[kind] ?? BROWS.flat;
    const b = {
      ...base,
      rise: base.rise + riseAdj,
      tilt: base.tilt + tiltAdj,
      w: (EYES[f.eyes] ?? EYES.round).w * 1.15
    };
    const near = browPath(
      sgn * L.nearEyeX * W,
      (CY + L.browY - b.rise + 0.26) * R,
      b,
      1,
      R,
      W,
      -sgn
    );
    if (L.farEyeScale <= 0.02) return near;
    const far = browPath(
      sgn * L.farEyeX * W,
      (CY + L.browY - b.rise + 0.26) * R,
      b,
      L.farEyeScale,
      R,
      W,
      sgn
    );
    return `${far} ${near}`;
  });
  addSwap({ id: "brows", parent: "head", z: 22, fill: colors.hair ?? "hair" }, {
    view: browSet(f.brow),
    expression: expressionSet(f, (ex) => ex.brow ? browSet(ex.brow, ex.browRise ?? 0, ex.browTilt ?? 0) : null)
  });
  const noseViews = perView((dir) => {
    const L = layout(dir);
    if (dir < 0.25) {
      const x = sgn * L.noseX * W, y = (CY + 0.06) * R;
      const len2 = nose.len * R, w = nose.w * W;
      return `M${n(x - w * 0.2 * sgn)},${n(y)} Q${n(x + nose.jut * W * sgn * 0.9)},${n(y + len2 * 0.8)} ${n(x + w * 0.5 * sgn)},${n(y + len2)}`;
    }
    const o = lerpPts(frontOutline(jaw), profileOutline(jaw, nose), dir);
    const [tip, under] = scalePts([o[3], o[4]], W, R, sgn);
    const start = [tip[0] * 0.3 + under[0] * 0.7, tip[1] * 0.3 + under[1] * 0.7];
    return `M${pt(start)} Q${pt(under)} ${pt([under[0] - sgn * nose.w * W * 0.75, under[1] + R * 0.02])}`;
  });
  addSwap({
    id: "nose",
    parent: "head",
    z: 23,
    fill: null,
    stroke: `${skin}Line`,
    strokeWidth: Math.max(1, R * 0.05)
  }, { view: noseViews });
  const hairViews = perView((dir) => hairFront(hair, jaw, R, W, sgn, dir));
  if (hairViews) {
    addSwap(
      {
        id: "hair",
        parent: "head",
        z: 30,
        fill: colors.hair ?? "hair",
        stroke: `${colors.hair ?? "hair"}Line`,
        strokeWidth: Math.max(1, R * 0.04)
      },
      { view: hairViews }
    );
  }
  return parts;
}
function expressionSet(face, make) {
  const shapes = { neutral: {} };
  let any = false;
  for (const [name, ex] of Object.entries(EXPRESSIONS)) {
    if (name === "neutral") continue;
    const set = make(ex);
    if (!set) continue;
    Object.assign(shapes, viewQualified(set, name));
    any = true;
  }
  return any ? shapes : null;
}
function viewQualified(perViewShapes, name) {
  const out = {};
  for (const [view, shape] of Object.entries(perViewShapes)) {
    out[view === "front" ? name : `${name}@${view}`] = shape;
  }
  return out;
}

// src/core/art/palette.js
var SHADE = [0.8, 0.78, 0.84];
var LINE = [0.26, 0.24, 0.28];
function parseHex(hex) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex ?? ""));
  if (!m) return null;
  let s = m[1];
  if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16));
}
var toHex = (rgb) => `#${rgb.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("")}`;
function scaleColor(hex, mul) {
  const rgb = parseHex(hex);
  return rgb ? toHex(rgb.map((v, i) => v * mul[i])) : hex;
}
var shadeOf = (hex) => scaleColor(hex, SHADE);
var lineOf = (hex) => scaleColor(hex, LINE);
function mixColor(a, b, t = 0.5) {
  const ra = parseHex(a), rb = parseHex(b);
  if (!ra || !rb) return a;
  return toHex(ra.map((v, i) => v + (rb[i] - v) * t));
}
var DEFAULT_PALETTE = {
  skin: "#c98a5e",
  cloth: "#5a6f8c",
  trouser: "#3c4457",
  hair: "#241b17",
  eye: "#17120f",
  white: "#f4efe6",
  shoe: "#2b2521",
  coat: "#5a6f8c",
  teeth: "#f1e8dc",
  mouth: "#4a2421",
  // Scenery. A template paints with these names, so a set renders with no
  // palette declared and recolours entirely when one is.
  sky: "#8fb6dc",
  skyLow: "#cfdcea",
  far: "#a9bcd0",
  wall: "#cfc6b6",
  floor: "#9a7b58",
  wood: "#6f4f32",
  stone: "#9c968b",
  asphalt: "#53555c",
  tile: "#d7cfc2",
  metal: "#8a8e95",
  light: "#fff4d8",
  accent: "#8a5a48",
  foliage: "#4f7a44",
  bark: "#4a3526",
  clay: "#a65e3e"
};
function derivePalette(palette = {}) {
  const out = { ...DEFAULT_PALETTE, ...palette };
  for (const [name, value] of Object.entries({ ...out })) {
    if (name.endsWith("Shade") || name.endsWith("Line")) continue;
    if (typeof value !== "string" || !parseHex(value)) continue;
    out[`${name}Shade`] ??= shadeOf(value);
    out[`${name}Line`] ??= lineOf(value);
  }
  return out;
}

// src/core/art/scenery.js
var TIMES = {
  morning: { sky: "#a8c8e0", skyLow: "#e3d3b6", wall: "#d8cfc0", light: "#ffe9bd", far: "#b9c6d4" },
  afternoon: { sky: "#8fb6dc", skyLow: "#cfdcea", wall: "#cfc6b6", light: "#fff4d8", far: "#a9bcd0" },
  evening: { sky: "#3f4f7a", skyLow: "#d98a52", wall: "#8d7a68", light: "#ffcf8a", far: "#6a6f92" },
  night: { sky: "#17203a", skyLow: "#2b3457", wall: "#3b3c4a", light: "#cfd8ff", far: "#2a3150" }
};
var TEMPLATE_NAMES = ["living-room", "kitchen", "street", "hillside", "interior-wide"];
var TIME_NAMES = Object.keys(TIMES);
var rect = (id, x, y, w, h, fill, extra = {}) => ({
  id,
  at: [x, y],
  shape: { kind: "rect", w, h },
  fill,
  ...extra
});
var poly = (id, d, fill, extra = {}) => ({
  id,
  at: [0, 0],
  shape: { kind: "path", d },
  fill,
  ...extra
});
var PROPS = {
  "framed-picture": (W, H, x, horizon) => [
    rect("pic", W * x - 44, horizon - 210, 88, 66, "wood", { z: -460 }),
    rect("picArt", W * x - 36, horizon - 202, 72, 50, "accent", { z: -455 })
  ],
  window: (W, H, x, horizon) => [
    rect("win", W * x - 90, horizon - 300, 180, 170, "light", { z: -470 }),
    rect("winFrame", W * x - 98, horizon - 308, 196, 186, "wood", { z: -475 }),
    rect("winBar", W * x - 4, horizon - 300, 8, 170, "wood", { z: -465 })
  ],
  cabinet: (W, H, x, horizon) => [
    rect("cab", W * x - 70, horizon - 190, 140, 190, "wood", { z: -450 }),
    rect("cabLine", W * x - 2, horizon - 190, 4, 190, "woodShade", { z: -449 })
  ],
  sofa: (W, H, x, horizon) => [
    rect("sofaBack", W * x - 170, horizon - 130, 340, 90, "accent", { z: -440 }),
    rect("sofaSeat", W * x - 180, horizon - 56, 360, 56, "accentShade", { z: -435 }),
    rect("sofaArmL", W * x - 196, horizon - 110, 28, 110, "accent", { z: -434 }),
    rect("sofaArmR", W * x + 168, horizon - 110, 28, 110, "accent", { z: -434 })
  ],
  lamp: (W, H, x, horizon) => [
    rect("lampPost", W * x - 4, horizon - 190, 8, 190, "metal", { z: -430 }),
    poly("lampShade", `M${W * x - 44},${horizon - 250} L${W * x + 44},${horizon - 250} L${W * x + 30},${horizon - 196} L${W * x - 30},${horizon - 196} Z`, "light", { z: -429 })
  ],
  plant: (W, H, x, horizon) => [
    rect("pot", W * x - 24, horizon - 46, 48, 46, "clay", { z: -430 }),
    poly("leaves", `M${W * x},${horizon - 46} Q${W * x - 54},${horizon - 110} ${W * x - 14},${horizon - 150} Q${W * x + 6},${horizon - 100} ${W * x + 52},${horizon - 126} Q${W * x + 22},${horizon - 60} ${W * x},${horizon - 46} Z`, "foliage", { z: -429 })
  ],
  door: (W, H, x, horizon) => [
    rect("doorFrame", W * x - 62, horizon - 300, 124, 300, "woodShade", { z: -470 }),
    rect("door", W * x - 54, horizon - 292, 108, 292, "wood", { z: -468 })
  ],
  tree: (W, H, x, horizon) => [
    rect("trunk", W * x - 12, horizon - 120, 24, 120, "bark", { z: -420 }),
    poly("canopy", `M${W * x},${horizon - 290} Q${W * x + 96},${horizon - 220} ${W * x + 62},${horizon - 140} Q${W * x},${horizon - 108} ${W * x - 62},${horizon - 140} Q${W * x - 96},${horizon - 220} ${W * x},${horizon - 290} Z`, "foliage", { z: -419 })
  ],
  rock: (W, H, x, horizon) => [
    poly("rock", `M${W * x - 54},${horizon} Q${W * x - 40},${horizon - 52} ${W * x},${horizon - 60} Q${W * x + 46},${horizon - 50} ${W * x + 56},${horizon} Z`, "stone", { z: -425 })
  ]
};
var PROP_NAMES = Object.keys(PROPS);
var SCENERY_TEMPLATES = {
  "living-room": (W, H) => {
    const horizon = H * 0.78;
    return {
      background: { color: "wall" },
      ground: { y: horizon, tolerance: 14 },
      scenery: [
        rect("wall", 0, 0, W, horizon, "wall", { z: -600 }),
        rect("floor", 0, horizon, W, H - horizon, "floor", { z: -590 }),
        rect("skirting", 0, horizon - 18, W, 18, "woodShade", { z: -585 }),
        // A second tone on the floor, hard-edged: the light falls from
        // the window side, and a flat floor reads as paper.
        poly(
          "floorLight",
          `M0,${horizon} L${W * 0.46},${horizon} L${W * 0.2},${H} L0,${H} Z`,
          "floorShade",
          { z: -588 }
        )
      ]
    };
  },
  kitchen: (W, H) => {
    const horizon = H * 0.8;
    return {
      background: { color: "wall" },
      ground: { y: horizon, tolerance: 14 },
      scenery: [
        rect("wall", 0, 0, W, horizon, "wall", { z: -600 }),
        rect("floor", 0, horizon, W, H - horizon, "floor", { z: -590 }),
        rect("tile", 0, horizon - 150, W, 150, "tile", { z: -585 }),
        rect("counter", 0, horizon - 96, W, 18, "stone", { z: -560 }),
        rect("units", 0, horizon - 78, W, 78, "wood", { z: -565 }),
        rect("uppers", W * 0.08, horizon - 320, W * 0.46, 120, "wood", { z: -570 }),
        rect("upperLine", W * 0.31, horizon - 320, 4, 120, "woodShade", { z: -569 })
      ]
    };
  },
  street: (W, H) => {
    const horizon = H * 0.72;
    const blocks = [];
    const widths = [0.16, 0.11, 0.19, 0.13, 0.17, 0.12, 0.18];
    const heights = [0.4, 0.56, 0.31, 0.48, 0.36, 0.6, 0.44];
    let x = -0.03;
    widths.forEach((w, i) => {
      const h = H * heights[i];
      blocks.push(rect(
        `block${i}`,
        W * x,
        horizon - h,
        W * w + 2,
        h,
        i % 2 ? "far" : "farShade",
        { z: -580 + i }
      ));
      x += w;
    });
    return {
      background: { gradient: { stops: [[0, "sky"], [1, "skyLow"]] } },
      ground: { y: horizon + 54, tolerance: 16 },
      scenery: [
        rect("sky", 0, 0, W, horizon, "sky", { z: -600 }),
        ...blocks,
        rect("kerb", 0, horizon + 54, W, 8, "stoneShade", { z: -540 }),
        rect("pavement", 0, horizon, W, 62, "stone", { z: -550 }),
        rect("road", 0, horizon + 62, W, H - horizon - 62, "asphalt", { z: -545 })
      ]
    };
  },
  hillside: (W, H) => {
    const a = H * 0.86, b = H * 0.7;
    return {
      background: { gradient: { stops: [[0, "sky"], [1, "skyLow"]] } },
      // A slope, declared once. Deriving a walk's y from this is the
      // whole reason the ground is data and not just drawn.
      ground: { points: [[0, a], [W * 0.5, (a + b) / 2], [W, b]], tolerance: 16 },
      scenery: [
        rect("sky", 0, 0, W, H, "sky", { z: -600 }),
        poly("far", `M0,${H * 0.62} L${W * 0.3},${H * 0.44} L${W * 0.58},${H * 0.58} L${W * 0.82},${H * 0.4} L${W},${H * 0.56} L${W},${H} L0,${H} Z`, "far", { z: -590 }),
        poly(
          "mid",
          `M0,${H * 0.74} L${W * 0.42},${H * 0.58} L${W},${H * 0.68} L${W},${H} L0,${H} Z`,
          "farShade",
          { z: -585 }
        ),
        poly("slope", `M0,${a} L${W},${b} L${W},${H} L0,${H} Z`, "foliage", { z: -580 }),
        poly(
          "slopeShade",
          `M0,${a + 26} L${W},${b + 26} L${W},${H} L0,${H} Z`,
          "foliageShade",
          { z: -579 }
        )
      ]
    };
  },
  "interior-wide": (W, H) => {
    const horizon = H * 0.76;
    return {
      background: { color: "wall" },
      ground: { y: horizon, tolerance: 14 },
      scenery: [
        rect("wall", 0, 0, W, horizon, "wall", { z: -600 }),
        rect("wallShade", 0, 0, W * 0.34, horizon, "wallShade", { z: -599 }),
        rect("floor", 0, horizon, W, H - horizon, "floor", { z: -590 }),
        rect("skirting", 0, horizon - 16, W, 16, "woodShade", { z: -585 }),
        rect("railing", 0, horizon - 150, W, 10, "woodShade", { z: -584 })
      ]
    };
  }
};
function buildSceneryTemplate(spec, { width, height } = {}, diagnostics = [], path = "") {
  const name = typeof spec === "string" ? spec : spec?.template;
  const build = SCENERY_TEMPLATES[name];
  if (!build) {
    diagnostics.push({
      severity: "warning",
      path,
      message: `Unknown scenery template "${name}". Known: ${TEMPLATE_NAMES.join(", ")}.`
    });
    return null;
  }
  const W = width ?? 1280, H = height ?? 720;
  const out = build(W, H);
  const horizon = out.ground.y ?? out.ground.points[0][1];
  const extras = [];
  const wanted = typeof spec === "string" ? [] : spec.props ?? [];
  wanted.forEach((entry, i) => {
    const [propName, at] = String(entry).split("@");
    const make = PROPS[propName];
    if (!make) {
      diagnostics.push({
        severity: "warning",
        path,
        message: `Unknown prop "${propName}". Known: ${PROP_NAMES.join(", ")}.`
      });
      return;
    }
    const x = at != null && at !== "" ? Number(at) : (i + 1) / (wanted.length + 1);
    const groundHere = out.ground.y ?? interpolateGround(out.ground.points, W * x);
    for (const item of make(W, H, x, groundHere)) {
      extras.push({ ...item, id: `${propName}${i}_${item.id}` });
    }
  });
  const time = typeof spec === "string" ? null : spec.time;
  if (time && !TIMES[time]) {
    diagnostics.push({
      severity: "warning",
      path,
      message: `Unknown time "${time}". Known: ${TIME_NAMES.join(", ")}.`
    });
  }
  return {
    scenery: [...out.scenery, ...extras],
    ground: out.ground,
    background: out.background,
    palette: TIMES[time] ?? null,
    horizon
  };
}
function interpolateGround(points, x) {
  for (let i = 1; i < points.length; i++) {
    if (x <= points[i][0]) {
      const [x0, y0] = points[i - 1], [x1, y1] = points[i];
      return x1 === x0 ? y0 : y0 + (y1 - y0) * (x - x0) / (x1 - x0);
    }
  }
  return points[points.length - 1][1];
}

// src/core/audio/cues.js
function createCue({
  id,
  assetId,
  at = 0,
  gain = 1,
  fadeIn = 0,
  fadeOut = 0,
  offset = 0,
  duration = null,
  bus = "sfx"
}) {
  return { id, assetId, at, gain, fadeIn, fadeOut, offset, duration, bus };
}
function cueSampleWindow(cue, sampleRate, assetDurationSec) {
  const startSample = Math.round(cue.at * sampleRate);
  const srcOffset = Math.round((cue.offset ?? 0) * sampleRate);
  const available = Math.max(0, Math.round((assetDurationSec ?? 0) * sampleRate) - srcOffset);
  const wanted = cue.duration != null ? Math.round(cue.duration * sampleRate) : available;
  const lengthSamples = Math.max(0, Math.min(wanted, available));
  return {
    startSample,
    srcOffset,
    lengthSamples,
    endSample: startSample + lengthSamples,
    fadeInSamples: Math.min(Math.round((cue.fadeIn ?? 0) * sampleRate), lengthSamples),
    fadeOutSamples: Math.min(Math.round((cue.fadeOut ?? 0) * sampleRate), lengthSamples)
  };
}
function mixDuration(cues, assetDurations, sampleRate = 48e3) {
  let end = 0;
  for (const cue of cues) {
    const w = cueSampleWindow(cue, sampleRate, assetDurations[cue.assetId] ?? 0);
    end = Math.max(end, w.endSample);
  }
  return end / sampleRate;
}
function cueGainAt(cue, window, sampleIndexInCue) {
  let g = cue.gain ?? 1;
  const { fadeInSamples, fadeOutSamples, lengthSamples } = window;
  if (fadeInSamples > 0 && sampleIndexInCue < fadeInSamples) {
    g *= sampleIndexInCue / fadeInSamples;
  }
  if (fadeOutSamples > 0 && sampleIndexInCue > lengthSamples - fadeOutSamples) {
    g *= Math.max(0, (lengthSamples - sampleIndexInCue) / fadeOutSamples);
  }
  return g;
}

// src/core/audio/envelope.js
function envelope(samples, sampleRate, fps, { smoothFrames = 2 } = {}) {
  const perFrame = sampleRate / fps;
  const frames = Math.max(1, Math.ceil(samples.length / perFrame));
  const raw = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    const start = Math.floor(f * perFrame);
    const end = Math.min(samples.length, Math.floor((f + 1) * perFrame));
    let sum = 0;
    for (let i = start; i < end; i++) sum += samples[i] * samples[i];
    raw[f] = end > start ? Math.sqrt(sum / (end - start)) : 0;
  }
  if (smoothFrames <= 0) return raw;
  const out = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let sum = 0, n2 = 0;
    for (let k = -smoothFrames; k <= smoothFrames; k++) {
      const j = f + k;
      if (j >= 0 && j < frames) {
        sum += raw[j];
        n2++;
      }
    }
    out[f] = sum / n2;
  }
  return out;
}
function voicedSpans(env, { relThreshold = 0.12, minFrames = 2, gapFrames = 3 } = {}) {
  let peak = 0;
  for (let i = 0; i < env.length; i++) if (env[i] > peak) peak = env[i];
  if (peak <= 0) return [];
  const cut = peak * relThreshold;
  const spans = [];
  let start = -1;
  for (let f = 0; f < env.length; f++) {
    const voiced = env[f] >= cut;
    if (voiced && start < 0) start = f;
    if (!voiced && start >= 0) {
      spans.push({ startFrame: start, endFrame: f - 1 });
      start = -1;
    }
  }
  if (start >= 0) spans.push({ startFrame: start, endFrame: env.length - 1 });
  const merged = [];
  for (const s of spans) {
    const prev = merged[merged.length - 1];
    if (prev && s.startFrame - prev.endFrame <= gapFrames) prev.endFrame = s.endFrame;
    else merged.push({ ...s });
  }
  return merged.filter((s) => s.endFrame - s.startFrame + 1 >= minFrames);
}
function normalize2(env) {
  let peak = 0;
  for (let i = 0; i < env.length; i++) if (env[i] > peak) peak = env[i];
  const out = new Float32Array(env.length);
  if (peak <= 0) return out;
  for (let i = 0; i < env.length; i++) out[i] = env[i] / peak;
  return out;
}

// src/core/audio/lipsync.js
var EMPTY = "closed";
function makeTrack(nodeId) {
  return createTrack({ target: nodeId, path: "props.viseme", type: "discrete" });
}
function writeFrames(track, frames, fps, offsetSec) {
  let last = null;
  for (let f = 0; f < frames.length; f++) {
    const v = frames[f] ?? EMPTY;
    if (v !== last) {
      setKey(track, offsetSec + f / fps, v, "step");
      last = v;
    }
  }
  return track;
}
function visemesFromPhonemes(nodeId, phonemes, { fps = 24, offsetSec = 0, durationSec } = {}) {
  const track = makeTrack(nodeId);
  setKey(track, offsetSec, EMPTY, "step");
  for (const ph of phonemes) {
    setKey(track, offsetSec + ph.start, phonemeToViseme(ph.p), "step");
  }
  const end = durationSec ?? (phonemes.length ? phonemes[phonemes.length - 1].end : 0);
  setKey(track, offsetSec + end, EMPTY, "step");
  return track;
}
function visemesFromText(nodeId, text, samples, { sampleRate, fps = 24, offsetSec = 0 } = {}) {
  const env = envelope(samples, sampleRate, fps);
  const spans = voicedSpans(env);
  const seq = textToVisemeSequence(text);
  const frames = new Array(env.length).fill(EMPTY);
  if (seq.length === 0 || spans.length === 0) {
    return writeFrames(makeTrack(nodeId), frames, fps, offsetSec);
  }
  const totalVoiced = spans.reduce((n2, s) => n2 + (s.endFrame - s.startFrame + 1), 0);
  let cursor = 0;
  spans.forEach((span, i) => {
    const spanFrames = span.endFrame - span.startFrame + 1;
    const share = i === spans.length - 1 ? seq.length - cursor : Math.max(1, Math.round(spanFrames / totalVoiced * seq.length));
    const slice = seq.slice(cursor, cursor + share);
    cursor += share;
    if (slice.length === 0) return;
    for (let f = 0; f < spanFrames; f++) {
      const idx = Math.min(slice.length - 1, Math.floor(f / spanFrames * slice.length));
      frames[span.startFrame + f] = slice[idx];
    }
  });
  return writeFrames(makeTrack(nodeId), frames, fps, offsetSec);
}
function visemesFromEnvelope(nodeId, samples, { sampleRate, fps = 24, offsetSec = 0 } = {}) {
  const env = normalize2(envelope(samples, sampleRate, fps));
  const frames = new Array(env.length);
  for (let f = 0; f < env.length; f++) {
    frames[f] = env[f] < 0.12 ? "closed" : env[f] < 0.45 ? "mid" : "open";
  }
  return writeFrames(makeTrack(nodeId), frames, fps, offsetSec);
}
function lipsyncLine(nodeId, { text, samples, sampleRate, phonemes, fps = 24, offsetSec = 0, durationSec }) {
  if (phonemes?.length) {
    return visemesFromPhonemes(nodeId, phonemes, { fps, offsetSec, durationSec });
  }
  if (text && samples) {
    return visemesFromText(nodeId, text, samples, { sampleRate, fps, offsetSec });
  }
  if (samples) {
    return visemesFromEnvelope(nodeId, samples, { sampleRate, fps, offsetSec });
  }
  const track = makeTrack(nodeId);
  setKey(track, offsetSec, EMPTY, "step");
  return track;
}

// src/core/voice/VoiceRegistry.js
function createVoice({ id, name = id, source, provider, lang = "en", tags = [], ref = null }) {
  return { id, name, source, provider, lang, tags, ref };
}
var VoiceRegistry = class {
  constructor() {
    this.providers = /* @__PURE__ */ new Map();
  }
  register(provider) {
    if (!provider?.id) throw new Error("VoiceRegistry: provider needs an id");
    this.providers.set(provider.id, provider);
    return this;
  }
  get(providerId) {
    return this.providers.get(providerId);
  }
  /** Providers that report themselves usable right now, in priority order. */
  async availableProviders() {
    const out = [];
    for (const p of this.providers.values()) {
      let ok = false;
      try {
        ok = await p.available();
      } catch {
        ok = false;
      }
      if (ok) out.push(p);
    }
    return out;
  }
  async listVoices() {
    const out = [];
    for (const p of await this.availableProviders()) {
      try {
        out.push(...await p.listVoices());
      } catch {
      }
    }
    return out;
  }
  /**
   * Resolve a voice spec of the form "<providerId>:<voiceId>", e.g.
   * "piper:en_US-amy-medium", "mic:myvoice", "upload:actor_jane".
   */
  async resolve(spec) {
    if (!spec) return null;
    const i = String(spec).indexOf(":");
    const providerId = i < 0 ? spec : spec.slice(0, i);
    const voiceId = i < 0 ? null : spec.slice(i + 1);
    const provider = this.providers.get(providerId);
    if (!provider) return null;
    if (!voiceId) {
      const list2 = await provider.listVoices();
      return list2[0] ?? null;
    }
    const list = await provider.listVoices();
    return list.find((v) => v.id === voiceId) ?? createVoice({ id: voiceId, source: provider.source ?? "tts", provider: providerId });
  }
  /**
   * Synthesize through whichever provider owns the voice. Falls back down
   * the provider list if the preferred one is unavailable, so a film
   * authored against TTS still renders on a machine without it.
   */
  async synthesize(spec, { text, lang } = {}) {
    const voice = await this.resolve(spec);
    if (voice) {
      const provider = this.providers.get(voice.provider);
      if (provider && await provider.available().catch(() => false)) {
        return provider.synthesize({ text, voice, lang: lang ?? voice.lang });
      }
    }
    for (const p of await this.availableProviders()) {
      const list = await p.listVoices().catch(() => []);
      if (list.length) return p.synthesize({ text, voice: list[0], lang });
    }
    return null;
  }
};

// src/core/voice/synthesize.js
async function synthesizeDialogue({
  lipsyncJobs,
  registry,
  buffers = {},
  fps = 24,
  sampleRate = 48e3,
  onProgress = null,
  existingAssets = {}
}) {
  const cues = [];
  const tracks = [];
  const diagnostics = [];
  let done = 0;
  for (const job of lipsyncJobs) {
    const { nodeId, speaker, text, at, voiceSpec, audioAssetId, lipsync = true, durationSec } = job;
    let buffer = null;
    let phonemes = null;
    try {
      if (audioAssetId && (buffers[audioAssetId] || existingAssets[audioAssetId])) {
        buffer = buffers[audioAssetId] ?? existingAssets[audioAssetId];
      } else if (text && registry) {
        const result = await registry.synthesize(voiceSpec, { text });
        if (result?.audioBuffer) {
          buffer = result.audioBuffer;
          phonemes = result.phonemes ?? null;
        } else {
          diagnostics.push({
            severity: "warning",
            path: `dialogue:${speaker}@${at}`,
            message: `No voice produced audio for "${String(text).slice(0, 48)}". Rendering silent with subtitle only.`
          });
        }
      }
    } catch (err) {
      diagnostics.push({
        severity: "warning",
        path: `dialogue:${speaker}@${at}`,
        message: `Voice synthesis failed: ${err.message}. Rendering silent.`
      });
    }
    if (buffer) {
      const assetId = audioAssetId ?? `vo_${hashString(`${voiceSpec}|${text}`)}`;
      buffers[assetId] = buffer;
      cues.push(createCue({
        id: `${nodeId}@${at}`,
        assetId,
        at,
        gain: job.gain ?? 1,
        bus: "voice"
      }));
    }
    if (lipsync && nodeId) {
      tracks.push(lipsyncLine(nodeId, {
        text,
        samples: buffer ? buffer.getChannelData(0) : null,
        sampleRate: buffer ? buffer.sampleRate : sampleRate,
        phonemes,
        fps,
        offsetSec: at,
        durationSec: durationSec ?? buffer?.duration
      }));
    }
    done++;
    onProgress?.({ done, total: lipsyncJobs.length, speaker, text });
  }
  return { cues, tracks, buffers, diagnostics };
}
function castVoices(film) {
  const voices = film.voices ?? {};
  const out = {};
  const diagnostics = [];
  for (const [name, char] of Object.entries(film.characters ?? {})) {
    const ref = char.voice;
    if (!ref) continue;
    const entry = voices[ref];
    if (entry?.spec) out[name] = entry.spec;
    else if (String(ref).includes(":")) out[name] = ref;
    else {
      diagnostics.push({
        severity: "warning",
        path: `characters.${name}.voice`,
        message: `Voice "${ref}" is not declared in the film's voices block.`
      });
    }
  }
  return { castBySpeaker: out, diagnostics };
}

// src/core/script/schema.js
var FILM_VERSION = "jirex.film/1";
var DEFAULTS = {
  fps: 24,
  width: 1280,
  height: 720,
  shotDuration: 4,
  transitionDuration: 0.8,
  subtitleStyle: {
    font: "600 34px system-ui, sans-serif",
    fill: "#ffffff",
    stroke: "#000000",
    strokeWidth: 6,
    bottomMargin: 64
  }
};
var KNOWN = {
  root: ["version", "meta", "voices", "assets", "palettes", "characters", "scenes"],
  meta: [
    "title",
    "fps",
    "width",
    "height",
    "author",
    "description",
    "duration",
    "estimatedTiming",
    "step"
  ],
  character: [
    "palette",
    "voice",
    "parts",
    "mouth",
    "poses",
    "actions",
    "proportions",
    "generate",
    "view",
    "expression"
  ],
  generate: [
    "skin",
    "cloth",
    "trouser",
    "hair",
    "hairColor",
    "eye",
    "white",
    "shoe",
    "face",
    "build",
    "facing"
  ],
  face: ["jaw", "eyes", "brow", "nose", "lips", "ears"],
  cast: [
    "character",
    "as",
    "at",
    "scale",
    "z",
    "alpha",
    "palette",
    "view",
    "expression",
    "facing",
    "echo"
  ],
  template: ["template", "time", "props"],
  part: [
    "id",
    "parent",
    "pivot",
    "shape",
    "shapes",
    "swap",
    "fill",
    "stroke",
    "strokeWidth",
    "z",
    "at",
    "alpha",
    // draw-level: compositing, glow, trimmed strokes, repeaters
    "blend",
    "glow",
    "trim",
    "repeat",
    "gradient"
  ],
  scene: [
    "id",
    "background",
    "transitionIn",
    "transitionOut",
    "cast",
    "audio",
    "shots",
    "scenery",
    "palette",
    "ground",
    "template",
    "drawings",
    "photos"
  ],
  // A still photograph animated by `core/motion/PhotoMotion.js`. `source`
  // and `depth` are asset ids; `start`/`duration` are scene-relative
  // seconds, and `draw` retimes it like any drawing.
  photo: [
    "id",
    "source",
    "image",
    "depth",
    "effects",
    "duration",
    "start",
    "at",
    "z",
    "alpha",
    "width",
    "height",
    "grid",
    "overscan",
    "depthBlur",
    "tear"
  ],
  shot: [
    "id",
    "duration",
    "camera",
    "actions",
    "dialogue",
    "subtitleStyle",
    "step",
    // what the shot is MEANT to be, so the checker can say whether it is
    "framing",
    "on"
  ],
  action: [
    "target",
    "do",
    "action",
    "pose",
    "to",
    "at",
    "for",
    "ease",
    "h",
    "loop",
    "speed",
    "value",
    "channel",
    // `draw` ramps from `from` to `to`; `from` was missing, so every
    // backwards reveal reported its own option as unrecognized.
    "from",
    "part",
    "bones",
    "bend",
    // the four principles that need a number rather than a keyframe
    "anticipate",
    "overshoot",
    "arc",
    "weight"
  ],
  dialogue: ["speaker", "at", "text", "audio", "voice", "lipsync", "subtitle", "gain", "duration"],
  camera: ["from", "to", "ease", "h", "at", "for", "shake"],
  audioCue: ["asset", "at", "gain", "fadeIn", "fadeOut", "offset", "duration", "bus"],
  asset: ["kind", "src", "file", "provider", "frames", "grid", "pivot", "fit"],
  background: ["color", "gradient", "image", "fit"]
};
var ASSET_KINDS = ["image", "audio"];
var KNOWN_SCENERY = [
  "id",
  "shape",
  "at",
  "fill",
  "stroke",
  "strokeWidth",
  "z",
  "alpha",
  "parallax",
  "gradient",
  "screenSpace",
  "sx",
  "sy",
  "rot",
  "blend",
  "glow",
  "trim",
  "repeat"
];
var SHAPE_KINDS = ["path", "ellipse", "rect", "image", "text", "group"];
var TRANSITION_KINDS = ["fade", "crossfade", "none"];
var DO_VERBS = ["play", "pose", "move", "reach", "set", "show", "hide", "draw"];

// src/core/anim/principles.js
var ANTICIPATION_SHARE = 0.26;
var OVERSHOOT_AT = 0.8;
var anticipationValue = (from, to, amount = 0.12) => from - (to - from) * amount;
var overshootValue = (from, to, amount = 0.1) => to + (to - from) * amount;
function arcMidpoint([x0, y0], [x1, y1], bow = 0.18) {
  const dx = x1 - x0, dy = y1 - y0;
  const len2 = Math.hypot(dx, dy);
  if (len2 < 1e-6) return [x0, y0];
  return [
    x0 + dx / 2 + dy / len2 * len2 * bow * -1,
    y0 + dy / 2 + dx / len2 * len2 * bow * -1
  ];
}
function overlapDelays(lag, chain = []) {
  if (lag == null) return {};
  if (typeof lag === "object") return lag;
  const out = {};
  chain.forEach((id, i) => {
    out[id] = lag * i;
  });
  return out;
}
function squashKeys(duration, amount = 0.14, { recover = 0.6 } = {}) {
  const sy = 1 - amount;
  const peak = duration * (1 - recover);
  return {
    sy: [[0, 1], [peak, sy], [duration, 1]],
    sx: [[0, 1], [peak, 1 / sy], [duration, 1]]
  };
}
function applyOverlap(keysByChannel, delays) {
  if (!delays || !Object.keys(delays).length) return keysByChannel;
  const out = {};
  for (const [channel, keys] of Object.entries(keysByChannel)) {
    const part = channel.slice(0, channel.indexOf(".") < 0 ? channel.length : channel.indexOf("."));
    const d = delays[part] ?? 0;
    out[channel] = d ? keys.map((k) => Array.isArray(k) ? [k[0] + d, ...k.slice(1)] : { ...k, t: k.t + d }) : keys;
  }
  return out;
}

// src/core/script/generate.js
var DEFAULT_PROPORTIONS = {
  height: 180,
  // head-to-foot in scene units
  heads: 6.2,
  // total height in head-heights, the unit animators use
  shoulderWidth: 0.235,
  hipWidth: 0.175,
  armThickness: 0.052,
  legThickness: 0.07,
  torsoTaper: 0.82
};
var BUILDS = {
  slim: { shoulderWidth: 0.23, hipWidth: 0.17, armThickness: 0.046, legThickness: 0.06 },
  average: { shoulderWidth: 0.26, hipWidth: 0.19, armThickness: 0.055, legThickness: 0.07 },
  heavy: { shoulderWidth: 0.3, hipWidth: 0.25, armThickness: 0.072, legThickness: 0.09 },
  athletic: { shoulderWidth: 0.29, hipWidth: 0.18, armThickness: 0.062, legThickness: 0.078 },
  child: { heads: 4.8, shoulderWidth: 0.22, hipWidth: 0.19, armThickness: 0.052, legThickness: 0.066 }
};
function resolveProportions(proportions = {}, build) {
  const named = typeof build === "string" ? BUILDS[build] ?? {} : build ?? {};
  const p = { ...DEFAULT_PROPORTIONS, ...named, ...proportions };
  p.headRatio = proportions.headRatio ?? named.headRatio ?? 1 / p.heads;
  return p;
}
function limbPath(L, w0, w1, dx = 0) {
  const a = w0 / 2, b = w1 / 2;
  const r = (v) => Math.round(v * 100) / 100;
  return `M${r(-a)},0 Q${r(-a * 1.08)},${r(L * 0.5)} ${r(dx - b)},${r(L)} Q${r(dx)},${r(L + b * 0.9)} ${r(dx + b)},${r(L)} Q${r(a * 1.08)},${r(L * 0.5)} ${r(a)},0 Q${r(a * 0.92)},${r(-a * 0.9)} 0,${r(-a * 0.95)} Q${r(-a * 0.92)},${r(-a * 0.9)} ${r(-a)},0 Z`;
}
function limbShadePath(L, w0, w1, dx = 0, side = 1) {
  const a = w0 / 2 * side, b = w1 / 2 * side;
  const r = (v) => Math.round(v * 100) / 100;
  return `M${r(a)},0 Q${r(a * 1.06)},${r(L * 0.5)} ${r(dx + b)},${r(L * 0.97)} Q${r(dx + b * 0.3)},${r(L * 0.95)} ${r(a * 0.34)},${r(L * 0.45)} Q${r(a * 0.42)},${r(L * 0.2)} ${r(a * 0.4)},0 Z`;
}
function generateCharacterParts(generate = {}, proportions = {}) {
  const p = resolveProportions(proportions, generate.build);
  const H = p.height;
  const headH = H * p.headRatio;
  const headR = headH / 2;
  const torsoH = H * 0.3;
  const legH = H * 0.46;
  const thighH = legH * 0.52;
  const shinH = legH - thighH;
  const armH = H * 0.38;
  const upperArmH = armH * 0.47;
  const foreArmH = armH - upperArmH;
  const shoulderW = H * p.shoulderWidth;
  const hipW = H * p.hipWidth;
  const armW = H * p.armThickness;
  const legW = H * p.legThickness;
  const line = Math.max(1.2, H * 8e-3);
  const skin = generate.skin ?? "skin";
  const cloth = generate.cloth ?? "coat";
  const trouser = generate.trouser ?? cloth;
  const hair = generate.hair ?? "short-fade";
  const hairColor = generate.hairColor ?? "hair";
  const facing = generate.facing ?? 1;
  const sgn = facing >= 0 ? 1 : -1;
  const half = shoulderW / 2;
  const hipHalf = hipW / 2;
  const taperHalf = half * p.torsoTaper;
  const parts = [
    // hips is the root: everything hangs off it, so a single move or a bob
    // on hips carries the whole body.
    {
      id: "hips",
      parent: null,
      z: 10,
      shape: { kind: "ellipse", rx: hipHalf, ry: legW * 0.7 },
      fill: trouser
    },
    {
      id: "torso",
      parent: "hips",
      pivot: [0, 0],
      z: 12,
      // The shoulder line slopes down to the arms and lifts toward the
      // neck. A flat lid across the top reads as a box with a head
      // balanced on it.
      shape: {
        kind: "path",
        d: `M${-hipHalf},0 Q${-hipHalf * 1.06},${-torsoH * 0.52} ${-taperHalf},${-torsoH * 0.88} Q${-taperHalf * 0.86},${-torsoH * 1} ${-taperHalf * 0.4},${-torsoH * 1.02} Q0,${-torsoH * 1.08} ${taperHalf * 0.4},${-torsoH * 1.02} Q${taperHalf * 0.86},${-torsoH * 1} ${taperHalf},${-torsoH * 0.88} Q${hipHalf * 1.06},${-torsoH * 0.52} ${hipHalf},0 Z`
      },
      fill: cloth,
      stroke: `${cloth}Line`,
      strokeWidth: line,
      shapes: [{
        id: "shade",
        z: 1,
        fill: `${cloth}Shade`,
        shape: {
          kind: "path",
          d: `M${sgn * taperHalf},${-torsoH} Q${sgn * hipHalf * 1.02},${-torsoH * 0.5} ${sgn * hipHalf},0 L${sgn * hipHalf * 0.48},0 Q${sgn * taperHalf * 0.5},${-torsoH * 0.55} ${sgn * taperHalf * 0.52},${-torsoH} Z`
        }
      }]
    },
    {
      id: "neck",
      parent: "torso",
      pivot: [0, -torsoH],
      z: 14,
      shape: { kind: "rect", w: armW * 0.95, h: headR * 0.6, cx: true },
      fill: `${skin}Shade`
    },
    // `head` is a GROUP, not a shape. drawOrder walks depth-first, so a
    // child always draws over its parent and `z` only sorts siblings --
    // which means anything behind the skull (hair mass, far ear) has to be
    // the skull's sibling while still turning with the head.
    { id: "head", parent: "neck", pivot: [0, 0], z: 20 },
    ...headParts({
      R: headR,
      face: generate.face,
      hair,
      facing,
      colors: {
        skin,
        hair: hairColor,
        eye: generate.eye ?? "eye",
        white: generate.white ?? "white"
      }
    })
  ];
  for (const side of ["L", "R"]) {
    const s = side === "L" ? -1 : 1;
    const behind = s !== sgn;
    const armZ = behind ? 8 : 16;
    const legZ = behind ? 7 : 11;
    const tone = (base) => behind ? `${base}Shade` : base;
    const drift = s * armW * 0.18;
    parts.push(
      {
        id: `arm${side}`,
        parent: "torso",
        pivot: [s * taperHalf * 0.94, -torsoH * 0.9],
        z: armZ,
        shape: { kind: "path", d: limbPath(upperArmH, armW, armW * 0.82, drift) },
        fill: tone(cloth),
        stroke: `${cloth}Line`,
        strokeWidth: line,
        shapes: behind ? [] : [{
          id: "shade",
          z: 1,
          fill: `${cloth}Shade`,
          shape: { kind: "path", d: limbShadePath(upperArmH, armW, armW * 0.82, drift, sgn) }
        }]
      },
      {
        id: `fore${side}`,
        parent: `arm${side}`,
        pivot: [drift, upperArmH],
        z: armZ,
        shape: { kind: "path", d: limbPath(foreArmH, armW * 0.82, armW * 0.56, s * armW * 0.1) },
        fill: tone(skin),
        stroke: `${skin}Line`,
        strokeWidth: line
      },
      // A mitten, not a capsule: a hand is wider than the wrist it hangs
      // off, and a capsule the same width as the forearm disappears.
      {
        id: `hand${side}`,
        parent: `fore${side}`,
        pivot: [s * armW * 0.1, foreArmH],
        z: armZ,
        shape: {
          kind: "path",
          d: `M${-armW * 0.32},${-armW * 0.3} Q${-armW * 0.62},${armW * 0.35} ${-armW * 0.44},${armW * 0.95} Q${-armW * 0.1},${armW * 1.35} ${armW * 0.34},${armW * 1.05} Q${armW * 0.66},${armW * 0.6} ${armW * 0.5},${-armW * 0.1} Q${armW * 0.2},${-armW * 0.42} ${-armW * 0.32},${-armW * 0.3} Z`
        },
        fill: tone(skin),
        stroke: `${skin}Line`,
        strokeWidth: line
      },
      {
        id: `thigh${side}`,
        parent: "hips",
        pivot: [s * hipHalf * 0.6, legW * 0.25],
        z: legZ,
        shape: { kind: "path", d: limbPath(thighH, legW, legW * 0.84, s * legW * 0.08) },
        fill: tone(trouser),
        stroke: `${trouser}Line`,
        strokeWidth: line,
        shapes: behind ? [] : [{
          id: "shade",
          z: 1,
          fill: `${trouser}Shade`,
          shape: { kind: "path", d: limbShadePath(thighH, legW, legW * 0.84, s * legW * 0.08, sgn) }
        }]
      },
      {
        id: `shin${side}`,
        parent: `thigh${side}`,
        pivot: [s * legW * 0.08, thighH],
        z: legZ,
        shape: { kind: "path", d: limbPath(shinH, legW * 0.84, legW * 0.5, 0) },
        fill: tone(trouser),
        stroke: `${trouser}Line`,
        strokeWidth: line
      },
      {
        id: `foot${side}`,
        parent: `shin${side}`,
        pivot: [0, shinH],
        z: legZ,
        shape: {
          kind: "path",
          d: `M${-legW * 0.34},0 L${legW * 0.34},0 Q${sgn * legW * 1.15},${legW * 0.1} ${sgn * legW * 1.2},${legW * 0.44} Q${sgn * legW * 1.1},${legW * 0.56} ${-sgn * legW * 0.38},${legW * 0.56} Q${-legW * 0.42},${legW * 0.3} ${-legW * 0.34},0 Z`
        },
        fill: tone(generate.shoe ?? "shoe"),
        stroke: `${generate.shoe ?? "shoe"}Line`,
        strokeWidth: line
      }
    );
  }
  return parts;
}
function generateMouth(proportions = {}, generate = {}) {
  const p = resolveProportions(proportions, generate.build);
  const headR = p.height * p.headRatio / 2;
  const face = { ...DEFAULT_FACE, ...generate.face ?? {} };
  const sgn = (generate.facing ?? 1) >= 0 ? 1 : -1;
  const w = headR * 0.3 * (LIPS[face.lips] ?? 1);
  const h = headR;
  const views = { front: 0, threeQuarter: 0.55, profile: 1 };
  const shift = (dir) => sgn * headR * 0.62 * dir;
  const chart = (dir) => {
    const x = shift(dir);
    const k = 1 - 0.52 * dir;
    const u = w * k;
    return {
      closed: { kind: "path", d: `M${x - u},0 Q${x},${h * 0.05} ${x + u},0` },
      mid: { kind: "path", d: `M${x - u},0 Q${x},${h * 0.17} ${x + u},0 Z` },
      open: { kind: "path", d: `M${x - u},0 Q${x},${h * 0.4} ${x + u},0 Q${x},${h * 0.08} ${x - u},0 Z` },
      round: { kind: "path", d: `M${x - u * 0.6},${-h * 0.04} Q${x},${h * 0.32} ${x + u * 0.6},${-h * 0.04} Q${x},${h * 0.02} ${x - u * 0.6},${-h * 0.04} Z` },
      wide: { kind: "path", d: `M${x - u * 1.15},0 Q${x},${h * 0.15} ${x + u * 1.15},0 Q${x},${h * 0.02} ${x - u * 1.15},0 Z` },
      teeth: { kind: "path", d: `M${x - u * 0.9},0 L${x + u * 0.9},0 L${x + u * 0.85},${h * 0.11} L${x - u * 0.85},${h * 0.11} Z` }
    };
  };
  const shapes = {};
  for (const [name, dir] of Object.entries(views)) {
    for (const [viseme, shape] of Object.entries(chart(dir))) {
      shapes[name === "front" ? viseme : `${viseme}@${name}`] = shape;
    }
  }
  return {
    parent: "head",
    pivot: [0, (CY + 0.52) * headR],
    strokeWidth: Math.max(1.2, headR * 0.055),
    stroke: "skinLine",
    fill: "mouth",
    shapes
  };
}
function generateActions(proportions = {}, generate = {}) {
  const p = resolveProportions(proportions, generate.build);
  const bob = p.height * 0.016;
  return {
    breathe: {
      duration: 3.4,
      loop: "repeat",
      blend: "add",
      // Volume-preserving: the chest widens as it shortens. A scale on
      // one axis alone reads as the character inflating.
      keys: {
        "torso.sy": [[0, 1], [1.7, 1.018], [3.4, 1]],
        "torso.sx": [[0, 1], [1.7, 0.994], [3.4, 1]]
      }
    },
    walk: {
      duration: 0.9,
      loop: "repeat",
      keys: {
        "hips.y": [[0, 0], [0.225, -bob], [0.45, 0], [0.675, -bob], [0.9, 0]],
        "thighL.rot": [[0, 0.5], [0.45, -0.42], [0.9, 0.5]],
        "shinL.rot": [[0, 0.1], [0.3, 0.62], [0.62, 0.05], [0.9, 0.1]],
        "thighR.rot": [[0, -0.42], [0.45, 0.5], [0.9, -0.42]],
        "shinR.rot": [[0, 0.62], [0.32, 0.05], [0.72, 0.62], [0.9, 0.62]],
        "armL.rot": [[0, -0.42], [0.45, 0.42], [0.9, -0.42]],
        "armR.rot": [[0, 0.42], [0.45, -0.42], [0.9, 0.42]],
        // Forearms and hands trail the limb above them: follow-through
        // and overlapping action, which is what stops a walk reading
        // as a single rigid hinge.
        "foreL.rot": [[0, 0.3], [0.52, 0.46], [0.9, 0.3]],
        "foreR.rot": [[0, 0.46], [0.52, 0.3], [0.9, 0.46]],
        "handL.rot": [[0, 0.1], [0.58, 0.22], [0.9, 0.1]],
        "handR.rot": [[0, 0.22], [0.58, 0.1], [0.9, 0.22]],
        "torso.rot": [[0, 0.02], [0.45, -0.02], [0.9, 0.02]],
        "head.rot": [[0, -0.015], [0.5, 0.012], [0.9, -0.015]]
      }
    },
    blink: {
      duration: 4.2,
      loop: "repeat",
      // A discrete swap, not a scale. Squashing an eye node whose
      // geometry carries its own position would pull both eyes toward
      // the head's origin instead of closing them.
      keys: {
        "eyes.props.eyes": [[0, "open"], [3.9, "closed"], [4.04, "open"]]
      }
    },
    // A landing. Volume-preserving, so the character compresses rather
    // than deflating, and it recovers faster than it compresses -- the
    // asymmetry is what makes an impact read as an impact.
    squash: (() => {
      const k = squashKeys(0.5, 0.16);
      return {
        duration: 0.5,
        loop: "once",
        keys: {
          "hips.sy": k.sy,
          "hips.sx": k.sx,
          "hips.y": [[0, 0], [0.2, bob * 0.6], [0.5, 0]],
          "torso.sy": k.sy.map(([t, v]) => [t, 1 + (v - 1) * 0.5]),
          "head.y": [[0, 0], [0.2, bob * 0.3], [0.5, 0]]
        }
      };
    })(),
    // Additive, like `breathe`: an idle is a drift ON TOP of whatever the
    // character is doing, not a replacement for it. Authored as absolute
    // numbers and converted to deltas against its own rest pose, so the
    // cycle reads the same whether it layers over a guard or a standing
    // pose.
    idle: {
      duration: 5.6,
      loop: "repeat",
      blend: "add",
      keys: {
        "torso.rot": [[0, 8e-3], [2.8, -8e-3], [5.6, 8e-3]],
        "head.rot": [[0, -0.012], [2.1, 0.015], [4.2, -8e-3], [5.6, -0.012]],
        "armL.rot": [[0, 0.06], [2.8, 0.1], [5.6, 0.06]],
        "armR.rot": [[0, -0.06], [2.8, -0.1], [5.6, -0.06]],
        "foreL.rot": [[0, 0.08], [3.1, 0.14], [5.6, 0.08]],
        "foreR.rot": [[0, -0.08], [3.1, -0.14], [5.6, -0.08]]
      }
    }
  };
}

// src/core/motion/PhotoMotion.js
var EFFECTS = ["kenBurns", "parallax", "wave", "puppet"];

// src/core/script/validate.js
var GENERATED_ACTIONS = Object.keys(generateActions());
function validateFilm(film) {
  const d = [];
  const warn = (path, message) => d.push({ severity: "warning", path, message });
  const err = (path, message) => d.push({ severity: "error", path, message });
  if (!film || typeof film !== "object") {
    return [{ severity: "fatal", path: "", message: "Film must be an object." }];
  }
  if (film.version && film.version !== FILM_VERSION) {
    warn("version", `Expected "${FILM_VERSION}", got "${film.version}". Compiling anyway.`);
  }
  unknown("", film, KNOWN.root, warn);
  if (film.meta) unknown("meta", film.meta, KNOWN.meta, warn);
  validateAssets(film, d);
  if (film.meta?.duration != null) {
    warn("meta.duration", "Duration is derived from shot durations; the declared value is ignored.");
  }
  const characters = film.characters ?? {};
  for (const [name, char] of Object.entries(characters)) {
    unknown(`characters.${name}`, char, KNOWN.character, warn);
    if (!char.parts?.length && !char.generate) {
      warn(`characters.${name}`, "No parts and no generate block; nothing will be drawn.");
    }
    if (char.generate) validateGenerate(`characters.${name}.generate`, char.generate, warn);
    const ids = /* @__PURE__ */ new Set();
    for (const part of char.parts ?? []) {
      unknown(`characters.${name}.parts.${part.id}`, part, KNOWN.part, warn);
      if (!part.id) err(`characters.${name}.parts`, "A part is missing its id.");
      else if (ids.has(part.id)) err(`characters.${name}.parts`, `Duplicate part id "${part.id}".`);
      else ids.add(part.id);
    }
    for (const part of char.parts ?? []) {
      if (part.parent && !ids.has(part.parent)) {
        err(
          `characters.${name}.parts.${part.id}.parent`,
          `Parent "${part.parent}" is not a part of this character.`
        );
      }
    }
  }
  if (!film.scenes?.length) err("scenes", "A film needs at least one scene.");
  (film.scenes ?? []).forEach((scene, si) => {
    const sp = `scenes[${si}]`;
    unknown(sp, scene, KNOWN.scene, warn);
    for (const t of ["transitionIn", "transitionOut"]) {
      const kind = scene[t]?.kind;
      if (kind && !TRANSITION_KINDS.includes(kind)) {
        warn(`${sp}.${t}.kind`, `Unknown transition "${kind}"; treated as fade.`);
      }
    }
    if (scene.template) validateTemplate(`${sp}.template`, scene.template, warn);
    const castNames = /* @__PURE__ */ new Set();
    for (const c of scene.cast ?? []) {
      const as = c.as ?? c.character;
      castNames.add(as);
      unknown(`${sp}.cast.${as}`, c, KNOWN.cast, warn);
      if (!characters[c.character]) {
        err(`${sp}.cast`, `Character "${c.character}" is not defined.`);
      }
      for (const [key2, kit] of [["view", FACE_KITS.view], ["expression", FACE_KITS.expression]]) {
        if (c[key2] != null && !kit.includes(c[key2])) {
          warn(
            `${sp}.cast.${as}.${key2}`,
            `Unknown ${key2} "${c[key2]}". Known: ${kit.join(", ")}.`
          );
        }
      }
    }
    if (!scene.shots?.length) warn(`${sp}.shots`, "Scene has no shots; it will take no time.");
    (scene.scenery ?? []).forEach((item, ci) => {
      unknown(`${sp}.scenery[${ci}]`, item, KNOWN_SCENERY, warn);
    });
    (scene.shots ?? []).forEach((shot, hi) => {
      const hp = `${sp}.shots[${hi}]`;
      unknown(hp, shot, KNOWN.shot, warn);
      if (shot.duration == null) warn(`${hp}.duration`, "No duration; defaulting.");
      if (shot.camera) unknown(`${hp}.camera`, shot.camera, KNOWN.camera, warn);
      const drawingNames = /* @__PURE__ */ new Set([
        ...(scene.drawings ?? []).map((d2, di) => d2.id ?? `drawing${di + 1}`),
        ...(scene.photos ?? []).map((d2, di) => d2.id ?? `photo${di + 1}`)
      ]);
      for (const a of shot.actions ?? []) {
        unknown(`${hp}.actions`, a, KNOWN.action, warn);
        if (!DO_VERBS.includes(a.do)) {
          warn(`${hp}.actions`, `Unknown verb "${a.do}"; ignored. Known: ${DO_VERBS.join(", ")}.`);
        }
        if (a.do === "draw") {
          if (a.target && !drawingNames.has(a.target)) {
            err(`${hp}.actions`, `draw: no drawing or photo "${a.target}" in this scene.` + (drawingNames.size ? ` Have: ${[...drawingNames].join(", ")}.` : ""));
          }
        } else if (a.target && !castNames.has(a.target)) {
          err(`${hp}.actions`, `Target "${a.target}" is not cast in this scene.`);
        }
        if (a.do === "pose" && a.target) {
          const charName = [...scene.cast ?? []].find((c) => (c.as ?? c.character) === a.target)?.character;
          if (charName && a.pose && !characters[charName]?.poses?.[a.pose]) {
            err(`${hp}.actions`, `Pose "${a.pose}" is not defined on "${charName}".`);
          }
        }
        if (a.do === "play" && a.target) {
          const charName = [...scene.cast ?? []].find((c) => (c.as ?? c.character) === a.target)?.character;
          const generated = characters[charName]?.generate ? GENERATED_ACTIONS : [];
          if (charName && a.action && !characters[charName]?.actions?.[a.action] && !generated.includes(a.action)) {
            err(
              `${hp}.actions`,
              `Action "${a.action}" is not defined on "${charName}".` + (generated.length ? ` Generated: ${generated.join(", ")}.` : "")
            );
          }
        }
      }
      for (const line of shot.dialogue ?? []) {
        unknown(`${hp}.dialogue`, line, KNOWN.dialogue, warn);
        if (!line.text && !line.audio) {
          warn(`${hp}.dialogue`, "Line has neither text nor audio; skipped.");
        }
        if (line.speaker && !castNames.has(line.speaker)) {
          warn(`${hp}.dialogue`, `Speaker "${line.speaker}" is not cast here; audio plays without lipsync.`);
        }
      }
    });
    if (scene.background) {
      unknown(`${sp}.background`, scene.background, KNOWN.background, warn);
      if (scene.background.image && !film.assets?.[scene.background.image]) {
        err(`${sp}.background`, `Image asset "${scene.background.image}" is not declared.`);
      }
    }
    for (const item of scene.scenery ?? []) {
      const id = item.shape?.asset ?? (item.shape?.kind === "image" ? item.shape?.image : null);
      if (id && !film.assets?.[id]) {
        err(`${sp}.scenery`, `Image asset "${id}" is not declared (scenery "${item.id}").`);
      }
      if (item.shape?.kind && !SHAPE_KINDS.includes(item.shape.kind)) {
        warn(`${sp}.scenery`, `Unknown shape kind "${item.shape.kind}" on "${item.id}". Known: ${SHAPE_KINDS.join(", ")}.`);
      }
    }
    (scene.photos ?? []).forEach((photo, pi) => {
      const id = photo.id ?? `photo${pi + 1}`;
      unknown(`${sp}.photos.${id}`, photo, KNOWN.photo, warn);
      const src = photo.source ?? photo.image;
      if (!src) {
        err(`${sp}.photos.${id}`, 'No "source"; a photo needs a picture to animate.');
      } else if (!film.assets?.[src]) {
        err(`${sp}.photos.${id}`, `Image asset "${src}" is not declared.`);
      }
      if (photo.depth && !film.assets?.[photo.depth]) {
        err(`${sp}.photos.${id}`, `Depth asset "${photo.depth}" is not declared.`);
      }
      for (const effect of photo.effects ?? []) {
        if (!EFFECTS.includes(effect?.type)) {
          warn(
            `${sp}.photos.${id}.effects`,
            `Unknown effect "${effect?.type}"; ignored. Known: ${EFFECTS.join(", ")}.`
          );
        }
        if (effect?.type === "parallax" && !photo.depth) {
          warn(
            `${sp}.photos.${id}.effects`,
            'parallax does nothing without a "depth" map.'
          );
        }
      }
      if (photo.tear && !photo.depth) {
        warn(
          `${sp}.photos.${id}.tear`,
          'tear does nothing without a "depth" map.'
        );
      }
    });
    for (const cue of scene.audio ?? []) {
      unknown(`${sp}.audio`, cue, KNOWN.audioCue, warn);
      if (cue.asset && !film.assets?.[cue.asset]) {
        err(`${sp}.audio`, `Audio asset "${cue.asset}" is not declared.`);
      }
    }
  });
  return d;
}
function validateGenerate(path, generate, warn) {
  unknown(path, generate, KNOWN.generate, warn);
  if (generate.build != null && typeof generate.build === "string" && !(generate.build in BUILDS)) {
    warn(`${path}.build`, `Unknown build "${generate.build}". Known: ${Object.keys(BUILDS).join(", ")}.`);
  }
  if (generate.hair != null && !FACE_KITS.hair.includes(generate.hair)) {
    warn(`${path}.hair`, `Unknown hair "${generate.hair}"; a default cap is drawn. Known: ${FACE_KITS.hair.join(", ")}.`);
  }
  if (generate.face) {
    unknown(`${path}.face`, generate.face, KNOWN.face, warn);
    for (const [slot, value] of Object.entries(generate.face)) {
      const kit = FACE_KITS[slot === "brow" ? "brow" : slot];
      if (kit && value != null && !kit.includes(value)) {
        warn(
          `${path}.face.${slot}`,
          `Unknown ${slot} "${value}"; the default is used. Known: ${kit.join(", ")}.`
        );
      }
    }
  }
}
function validateTemplate(path, template, warn) {
  const spec = typeof template === "string" ? { template } : template;
  unknown(path, spec, KNOWN.template, warn);
  if (!TEMPLATE_NAMES.includes(spec.template)) {
    warn(path, `Unknown scenery template "${spec.template}". Known: ${TEMPLATE_NAMES.join(", ")}.`);
  }
  if (spec.time != null && !TIME_NAMES.includes(spec.time)) {
    warn(`${path}.time`, `Unknown time "${spec.time}". Known: ${TIME_NAMES.join(", ")}.`);
  }
  for (const entry of spec.props ?? []) {
    const name = String(entry).split("@")[0];
    if (!PROP_NAMES.includes(name)) {
      warn(`${path}.props`, `Unknown prop "${name}". Known: ${PROP_NAMES.join(", ")}.`);
    }
  }
}
function unknown(path, obj, known, warn) {
  for (const k of Object.keys(obj ?? {})) {
    if (!known.includes(k)) {
      warn(path ? `${path}.${k}` : k, `Unrecognized field "${k}"; ignored.`);
    }
  }
}
function validateAssets(film, d) {
  for (const [id, asset] of Object.entries(film.assets ?? {})) {
    if (!asset || typeof asset !== "object") {
      d.push({ severity: "error", path: `assets.${id}`, message: "Asset must be an object." });
      continue;
    }
    for (const key2 of Object.keys(asset)) {
      if (!KNOWN.asset.includes(key2)) {
        d.push({
          severity: "warning",
          path: `assets.${id}`,
          message: `Unknown asset key "${key2}". Known: ${KNOWN.asset.join(", ")}.`
        });
      }
    }
    if (asset.kind && !ASSET_KINDS.includes(asset.kind)) {
      d.push({
        severity: "warning",
        path: `assets.${id}`,
        message: `Unknown asset kind "${asset.kind}". Known: ${ASSET_KINDS.join(", ")}.`
      });
    }
    if (!asset.src && !asset.file) {
      d.push({
        severity: "warning",
        path: `assets.${id}`,
        message: `Asset "${id}" has neither "src" nor "file"; it can never load.`
      });
    }
  }
  return d;
}
var hasFatal = (diagnostics) => diagnostics.some((x) => x.severity === "fatal");
var hasError = (diagnostics) => diagnostics.some((x) => x.severity === "error");

// src/core/script/staging.js
function measureCharacter(parts) {
  const byId = new Map(parts.map((p) => [p.id, p]));
  const offsetOf = (part) => {
    let x = 0, y = 0;
    for (let p = part; p; p = p.parent ? byId.get(p.parent) : null) {
      const pivot = p.pivot ?? [0, 0];
      x += (p.at?.[0] ?? 0) + pivot[0];
      y += (p.at?.[1] ?? 0) + pivot[1];
      if (!p.parent) break;
    }
    return [x, y];
  };
  let top = Infinity, bottom = -Infinity, left = Infinity, right = -Infinity;
  const take = (ox, oy, e) => {
    if (!e) return;
    left = Math.min(left, ox + e.left);
    right = Math.max(right, ox + e.right);
    top = Math.min(top, oy + e.top);
    bottom = Math.max(bottom, oy + e.bottom);
  };
  for (const part of parts) {
    const [ox, oy] = offsetOf(part);
    const sw = part.strokeWidth ?? 0;
    take(ox, oy, shapeExtent(part.shape, sw));
    for (const set of Object.values(part.swap ?? {})) {
      for (const shape of Object.values(set.shapes ?? set)) {
        take(ox, oy, shapeExtent(shape, sw));
      }
    }
    for (const layer of part.shapes ?? []) {
      const lx = ox + (layer.at?.[0] ?? 0), ly = oy + (layer.at?.[1] ?? 0);
      const lsw = layer.strokeWidth ?? sw;
      take(lx, ly, shapeExtent(layer.shape, lsw));
      for (const set of Object.values(layer.swap ?? {})) {
        for (const shape of Object.values(set.shapes ?? set)) take(lx, ly, shapeExtent(shape, lsw));
      }
    }
  }
  if (!Number.isFinite(top)) return { top: 0, bottom: 0, left: 0, right: 0 };
  return { top, bottom, left, right };
}
function shapeExtent(shape, strokeWidth) {
  if (!shape) return null;
  const pad = strokeWidth / 2;
  switch (shape.kind) {
    case "ellipse":
      return {
        left: -(shape.rx ?? 1) - pad,
        right: (shape.rx ?? 1) + pad,
        top: -(shape.ry ?? 1) - pad,
        bottom: (shape.ry ?? 1) + pad
      };
    case "rect": {
      const w = shape.w ?? 0, h = shape.h ?? 0;
      return {
        left: (shape.cx ? -w / 2 : 0) - pad,
        right: (shape.cx ? w / 2 : w) + pad,
        top: (shape.cy ? -h / 2 : 0) - pad,
        bottom: (shape.cy ? h / 2 : h) + pad
      };
    }
    case "image": {
      const w = shape.w ?? 0, h = shape.h ?? 0;
      return {
        left: shape.cx ? -w / 2 : 0,
        right: shape.cx ? w / 2 : w,
        top: shape.cy ? -h / 2 : 0,
        bottom: shape.cy ? h / 2 : h
      };
    }
    case "path":
      return pathExtent(shape.d, pad);
    default:
      return null;
  }
}
function pathExtent(d, pad) {
  if (!d) return null;
  const nums = String(d).match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi);
  if (!nums || nums.length < 2) return null;
  let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
  for (let i = 0; i + 1 < nums.length; i += 2) {
    const x = Number(nums[i]), y = Number(nums[i + 1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    left = Math.min(left, x);
    right = Math.max(right, x);
    top = Math.min(top, y);
    bottom = Math.max(bottom, y);
  }
  if (!Number.isFinite(left)) return null;
  return { left: left - pad, right: right + pad, top: top - pad, bottom: bottom + pad };
}
function groundAt(ground, x) {
  if (!ground) return null;
  if (typeof ground.y === "number") return ground.y;
  const pts = ground.points;
  if (!Array.isArray(pts) || pts.length === 0) return null;
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (x <= pts[i][0]) {
      const [x0, y0] = pts[i - 1];
      const [x1, y1] = pts[i];
      const span = x1 - x0;
      const u = span === 0 ? 0 : (x - x0) / span;
      return y0 + (y1 - y0) * u;
    }
  }
  return pts[pts.length - 1][1];
}
var trackOf = (timeline, path) => timeline._index?.get(`__camera\0${path}`);
function cameraAt(timeline, t, meta, trackValueAt2) {
  const read = (path, fallback) => {
    const track = trackOf(timeline, path);
    return track ? trackValueAt2(track, t) : fallback;
  };
  const zoom = read("props.zoom", 1) || 1;
  const cx = read("transform.x", meta.width / 2);
  const cy = read("transform.y", meta.height / 2);
  const w = meta.width / zoom;
  const h = meta.height / zoom;
  return { left: cx - w / 2, right: cx + w / 2, top: cy - h / 2, bottom: cy + h / 2, zoom };
}
var FRAMINGS = {
  wide: { min: 0.04, max: 0.15, says: "the whole figure with room around it" },
  medium: { min: 0.13, max: 0.3, says: "roughly waist up" },
  close: { min: 0.26, max: 0.75, says: "head and shoulders filling the frame" }
};
var FRAMING_NAMES = Object.keys(FRAMINGS);
function headHeight(char) {
  const p = char?.proportions ?? {};
  const height = p.height ?? 180;
  const ratio = p.headRatio ?? 1 / (p.heads ?? (char?.generate?.build === "child" ? 4.8 : 6.2));
  return height * ratio;
}
function analyseStaging(compiled, film, { samplesPerShot = 5, trackValueAt: trackValueAt2 } = {}) {
  const d = [];
  if (!compiled?.scene || !compiled.timeline || !trackValueAt2) return d;
  const { scene, timeline, meta } = compiled;
  const baseline = createPoseBaseline(scene, timeline);
  const shots = filmShots(film);
  const extents = /* @__PURE__ */ new Map();
  const measureOf = (charName) => {
    if (!extents.has(charName)) {
      extents.set(charName, measureCharacter(characterParts(film.characters?.[charName] ?? {})));
    }
    return extents.get(charName);
  };
  const casts = [...scene.byId.values()].filter((n2) => n2.tags?.includes("cast")).map((n2) => {
    const [sceneId, as] = String(n2.id).split("/");
    return { node: n2, charName: n2.tags[1], sceneId, as: as ?? n2.id };
  });
  const seenOffFrame = /* @__PURE__ */ new Set();
  const seenGround = /* @__PURE__ */ new Set();
  const seenFraming = /* @__PURE__ */ new Set();
  try {
    for (const span of shots) {
      const ground = span.scene.ground ?? null;
      for (let i = 0; i < samplesPerShot; i++) {
        const t = span.start + span.duration * (i + 0.5) / samplesPerShot;
        resetPose(scene, baseline);
        applyPose(scene, samplePose(timeline, t));
        scene.invalidateAll();
        const frame = cameraAt(timeline, t, meta, trackValueAt2);
        const onScreen = /* @__PURE__ */ new Map();
        for (const { node, alpha } of scene.drawOrder()) onScreen.set(node.id, alpha);
        const wanted = span.shot?.framing;
        if (wanted && !seenFraming.has(span.shotId)) {
          const band = FRAMINGS[wanted];
          if (!band) {
            seenFraming.add(span.shotId);
            d.push({
              severity: "warning",
              path: `scenes.${span.sceneId}.shots.${span.shotId}`,
              message: `Framing: unknown framing "${wanted}" in shot ${span.shotId}. Known: ${FRAMING_NAMES.join(", ")}.`
            });
          } else {
            const inScene = casts.filter((c) => c.sceneId === span.sceneId && (onScreen.get(c.node.id) ?? 0) >= 0.5);
            const headOf = (c) => headHeight(film.characters?.[c.charName]) * (Math.abs(scene.worldMatrix(c.node.id)[0]) || 1);
            const subject = span.shot.on ? inScene.find((c) => c.as === span.shot.on) : inScene.slice().sort((a, b) => headOf(b) - headOf(a))[0];
            const subjectName = subject?.as ?? span.shot.on;
            if (span.shot.on && !subject) {
              seenFraming.add(span.shotId);
              d.push({
                severity: "warning",
                path: `scenes.${span.sceneId}.shots.${span.shotId}`,
                message: `Framing: shot ${span.shotId} is framed on "${span.shot.on}", who is not on screen here.`
              });
            } else if (subject) {
              const scale2 = Math.abs(scene.worldMatrix(subject.node.id)[0]) || 1;
              const head = headHeight(film.characters?.[subject.charName]) * scale2;
              const visible = frame.bottom - frame.top;
              const ratio = visible > 0 ? head / visible : 0;
              if (ratio < band.min || ratio > band.max) {
                seenFraming.add(span.shotId);
                const target = band.min + (band.max - band.min) * 0.3;
                const suggest = meta.height * target / head;
                d.push({
                  severity: "warning",
                  path: `scenes.${span.sceneId}.shots.${span.shotId}`,
                  message: `Framing: shot ${span.shotId} declares "${wanted}" (${band.says}) on "${subjectName}", but one head is ${(ratio * 100).toFixed(0)}% of the frame height at ${t.toFixed(1)}s -- "${wanted}" wants ${(band.min * 100).toFixed(0)}-${(band.max * 100).toFixed(0)}%. Try zoom ${suggest.toFixed(2)}.`
                });
              }
            }
          }
        }
        for (const { node, charName, sceneId, as } of casts) {
          if (sceneId !== span.sceneId) continue;
          if ((onScreen.get(node.id) ?? 0) < 0.5) continue;
          const m = scene.worldMatrix(node.id);
          const [wx, wy] = applyToPoint(m, 0, 0);
          const scale2 = Math.abs(m[0]) || 1;
          const e = measureOf(charName);
          const box = {
            left: wx + e.left * scale2,
            right: wx + e.right * scale2,
            top: wy + e.top * scale2,
            bottom: wy + e.bottom * scale2
          };
          const outside = box.right < frame.left || box.left > frame.right || box.bottom < frame.top || box.top > frame.bottom;
          const subjectOnly = span.shot?.on ?? (span.shot?.framing === "close" || span.shot?.framing === "medium");
          const isSubject = span.shot?.on ? as === span.shot.on : false;
          if (subjectOnly && !isSubject) continue;
          const key2 = `${span.shotId}:${node.id}`;
          if (outside && !seenOffFrame.has(key2)) {
            seenOffFrame.add(key2);
            d.push({
              severity: "warning",
              path: `scenes.${span.sceneId}.shots.${span.shotId}`,
              message: `Staging: "${as}" is outside the camera frame at ${t.toFixed(1)}s in shot ${span.shotId}. Cast box is [${box.left.toFixed(0)},${box.top.toFixed(0)} to ${box.right.toFixed(0)},${box.bottom.toFixed(0)}], frame is [${frame.left.toFixed(0)},${frame.top.toFixed(0)} to ${frame.right.toFixed(0)},${frame.bottom.toFixed(0)}].`
            });
          }
          if (ground && !seenGround.has(key2)) {
            const gy = groundAt(ground, wx);
            if (gy != null && Math.abs(box.bottom - gy) > (ground.tolerance ?? 12)) {
              seenGround.add(key2);
              d.push({
                severity: "warning",
                path: `scenes.${span.sceneId}.shots.${span.shotId}`,
                message: `Staging: "${as}" has its feet at y=${box.bottom.toFixed(0)} but the ground at x=${wx.toFixed(0)} is y=${gy.toFixed(0)} (${(box.bottom - gy).toFixed(0)}px ${box.bottom > gy ? "below" : "above"}) at ${t.toFixed(1)}s in shot ${span.shotId}.`
              });
            }
          }
        }
      }
    }
  } finally {
    resetPose(scene, baseline);
    scene.invalidateAll();
  }
  return d;
}
function analyseMotion(compiled, film, { fps = null, visibleMove = 0.3 } = {}) {
  const { scene, timeline, meta } = compiled ?? {};
  if (!scene || !timeline) return { frames: 0, shots: [], frozen: 0, moving: 0 };
  const rate = fps ?? meta?.fps ?? 24;
  const frames = Math.round((meta?.duration ?? timeline.duration ?? 0) * rate);
  const baseline = createPoseBaseline(scene, timeline);
  const ids = [...scene.byId.values()].filter((n2) => n2.kind !== "group" && n2.kind !== "camera" && String(n2.id).split("/").length >= 3 && !String(n2.id).includes("/set")).map((n2) => n2.id);
  if (!ids.length || frames < 2) return { frames: 0, shots: [], frozen: 0, moving: 0 };
  const steps = timeline.steps ?? [];
  const globalStep = timeline.step ?? 0;
  const stepAt2 = (t) => {
    for (const span of steps) if (t >= span.start && t < span.end) return span.step ?? 0;
    return globalStep;
  };
  const perFrame = [];
  let prev = null;
  let lastDrawn = null;
  for (let f = 0; f < frames; f++) {
    const t = f / rate;
    const step = stepAt2(t);
    const drawing = step > 1 ? Math.floor(f / step) : f;
    if (lastDrawn === drawing) continue;
    lastDrawn = drawing;
    resetPose(scene, baseline);
    applyPose(scene, samplePose(timeline, t));
    const cur = ids.map((id) => applyToPoint(scene.worldMatrix(id), 0, 0));
    if (prev) {
      let sum = 0;
      for (let i = 0; i < cur.length; i++) {
        sum += Math.hypot(cur[i][0] - prev[i][0], cur[i][1] - prev[i][1]);
      }
      perFrame.push({ t, v: sum / cur.length });
    }
    prev = cur;
  }
  const frozen = perFrame.filter((x) => x.v < 1e-3).length / perFrame.length;
  const moving = perFrame.filter((x) => x.v >= visibleMove).length / perFrame.length;
  const shots = filmShots(film).map((sh) => {
    const seg = perFrame.filter((x) => x.t >= sh.start && x.t < sh.end).map((x) => x.v);
    if (!seg.length) return { shotId: sh.shotId, frozen: 1, moving: 0, median: 0 };
    const sorted = [...seg].sort((x, y) => x - y);
    return {
      shotId: sh.shotId,
      sceneId: sh.sceneId,
      frozen: seg.filter((v) => v < 1e-3).length / seg.length,
      moving: seg.filter((v) => v >= visibleMove).length / seg.length,
      median: sorted[Math.floor(sorted.length / 2)]
    };
  });
  return { frames: perFrame.length, frozen, moving, shots, perFrame };
}
function checkMotion(compiled, film, options = {}) {
  const d = [];
  const { frozenShot = 0.95 } = options;
  const report = analyseMotion(compiled, film, options);
  for (const shot of report.shots) {
    if (shot.frozen >= frozenShot) {
      d.push({
        severity: "warning",
        path: `scenes.${shot.sceneId}.shots.${shot.shotId}`,
        message: `Motion: shot ${shot.shotId} is completely still -- ${(shot.frozen * 100).toFixed(0)}% of its frames have zero cast movement. A camera move or shake will make it look busy while nothing is animating. Give it an idle clip, or a pose that changes across the shot.`
      });
    }
  }
  if (report.frames && report.frozen >= 0.5) {
    d.push({
      severity: "warning",
      path: "scenes",
      message: `Motion: ${(report.frozen * 100).toFixed(0)}% of the film's frames have no cast movement at all. For comparison a held dialogue scene runs near 2%.`
    });
  }
  return d;
}

// src/core/anim/echo.js
var GHOST = "#echo";
function buildEcho({ scene, timeline, meta }, rootId, spec = {}, spans = null) {
  const frames = Math.max(0, Math.min(8, Math.round(spec.frames ?? 3)));
  if (!frames) return 0;
  const spacing = (spec.spacing ?? 2) / (meta?.fps ?? 24);
  const falloff = spec.falloff ?? 0.45;
  const root = scene.get(rootId);
  if (!root) return 0;
  const subtree = [];
  scene.walk((n2) => subtree.push(n2), rootId);
  let added = 0;
  for (let k = 1; k <= frames; k++) {
    const suffix = `${GHOST}${k}`;
    const alpha = Math.pow(falloff, k);
    for (const node of subtree) {
      const isRoot = node.id === rootId;
      scene.add({
        ...structuredClone({
          kind: node.kind,
          name: node.name,
          z: node.z,
          transform: { ...node.transform },
          props: { ...node.props }
        }),
        id: `${node.id}${suffix}`,
        // The trail sits BEHIND the live drawing: a ghost in front of
        // the character reads as a double exposure, not as speed.
        z: (node.z ?? 0) - 1e-3 * k,
        props: {
          ...node.props,
          alpha: (node.props.alpha ?? 1) * (isRoot ? alpha : 1),
          // Ghosts never re-run the swap pass on their own account;
          // they inherit whatever geometry the clone captured.
          echo: void 0
        }
      }, isRoot ? node.parentId : `${node.parentId}${suffix}`);
      added++;
    }
  }
  const own = timeline.tracks.filter((t) => String(t.target).startsWith(rootId));
  for (let k = 1; k <= frames; k++) {
    const shift = k * spacing;
    for (const track of own) {
      const copy = {
        ...track,
        target: `${track.target}${GHOST}${k}`,
        keys: track.keys.map((key2) => ({ ...key2, t: key2.t + shift }))
      };
      timeline.tracks.push(copy);
      timeline._index?.set(`${copy.target}\0${copy.path}`, copy);
    }
  }
  if (spans && spans.length) {
    const fps = meta?.fps ?? 24;
    const eps = 0.5 / fps;
    for (let k = 1; k <= frames; k++) {
      const id = `${rootId}${GHOST}${k}`;
      const live = Math.pow(falloff, k);
      keyAlpha(timeline, id, 0, 0);
      for (const span of spans) {
        keyAlpha(timeline, id, Math.max(0, span.start - eps), 0);
        keyAlpha(timeline, id, span.start, live);
        keyAlpha(timeline, id, Math.max(span.start, span.end - eps), live);
        keyAlpha(timeline, id, span.end, 0);
      }
    }
  }
  const insts = timeline.instances.filter((i) => i.scopeId === rootId);
  for (let k = 1; k <= frames; k++) {
    const shift = k * spacing;
    for (const inst of insts) {
      timeline.instances.push({
        ...inst,
        scopeId: `${inst.scopeId}${GHOST}${k}`,
        start: (inst.start ?? 0) + shift,
        end: (inst.end ?? timeline.duration) + shift
      });
    }
  }
  return added;
}
function keyAlpha(timeline, target, t, v) {
  const k = `${target}\0props.alpha`;
  let track = timeline._index?.get(k);
  if (!track) {
    track = { target, path: "props.alpha", type: "number", keys: [] };
    timeline.tracks.push(track);
    timeline._index?.set(k, track);
  }
  const at = track.keys.findIndex((x) => x.t >= t);
  const entry = { t, v, ease: "step" };
  if (at >= 0 && Math.abs(track.keys[at].t - t) < 1e-9) track.keys[at] = entry;
  else if (at < 0) track.keys.push(entry);
  else track.keys.splice(at, 0, entry);
}

// src/core/script/compile.js
var EPS = 1e-4;
function compileFilm(film, { assets = {} } = {}) {
  const diagnostics = validateFilm(film);
  if (diagnostics.some((d) => d.severity === "fatal")) {
    return { scene: null, timeline: null, audioCues: [], lipsyncJobs: [], diagnostics, meta: null };
  }
  const meta = {
    title: film.meta?.title ?? "Untitled",
    fps: film.meta?.fps ?? DEFAULTS.fps,
    width: film.meta?.width ?? DEFAULTS.width,
    height: film.meta?.height ?? DEFAULTS.height,
    // Frames per drawing for the cast: 2 is the anime standard, 1 is
    // every frame. A shot may override it.
    step: film.meta?.step ?? 0,
    version: FILM_VERSION
  };
  const scene = new Scene();
  const timeline = createTimeline({ fps: meta.fps });
  timeline.steps = [];
  timeline.step = meta.step ?? 0;
  const audioCues = [];
  const lipsyncJobs = [];
  const { castBySpeaker, diagnostics: voiceDiag } = castVoices(film);
  diagnostics.push(...voiceDiag);
  const cameraId = "__camera";
  scene.add({
    id: cameraId,
    kind: "camera",
    transform: { x: meta.width / 2, y: meta.height / 2 },
    props: { zoom: 1 }
  });
  const palettes = film.palettes ?? {};
  const characters = film.characters ?? {};
  const sceneSpans = planScenes(film);
  let filmTime = 0;
  for (const [si, span] of sceneSpans.entries()) {
    const { sceneId, sceneStart, sceneEnd, spec: sceneSpec, fadeIn, fadeOut } = span;
    const shots = sceneSpec.shots ?? [];
    const groupId = `scene/${sceneId}`;
    scene.add({ id: groupId, kind: "group", props: { alpha: 1 }, z: si });
    if (fadeIn) {
      key(timeline, groupId, "props.alpha", sceneStart - fadeIn, 0, { type: "number" });
      key(timeline, groupId, "props.alpha", sceneStart, 1, { type: "number" });
    } else {
      if (sceneStart > 0) {
        key(timeline, groupId, "props.alpha", sceneStart - EPS, 0, { type: "number", ease: "step" });
      }
      key(timeline, groupId, "props.alpha", sceneStart, 1, { type: "number" });
    }
    if (fadeOut) {
      key(timeline, groupId, "props.alpha", sceneEnd - fadeOut, 1, { type: "number" });
      key(timeline, groupId, "props.alpha", sceneEnd, 0, { type: "number" });
    } else if (si < sceneSpans.length - 1) {
      key(timeline, groupId, "props.alpha", sceneEnd - EPS, 1, { type: "number", ease: "step" });
      key(timeline, groupId, "props.alpha", sceneEnd, 0, { type: "number", ease: "step" });
    }
    const spec = expandTemplate(sceneSpec, meta, palettes, diagnostics);
    const scenePalette = derivePalette(palettes[spec.palette] ?? {});
    buildBackground(
      scene,
      timeline,
      spec,
      groupId,
      meta,
      assets,
      diagnostics,
      (c) => c == null ? null : scenePalette[c] ?? c
    );
    buildScenery(scene, spec, groupId, palettes, meta, assets, diagnostics);
    buildDrawings(scene, spec, groupId, sceneId, scenePalette, meta, diagnostics);
    buildPhotos(
      scene,
      timeline,
      spec,
      groupId,
      sceneId,
      meta,
      assets,
      diagnostics,
      sceneStart,
      sceneEnd
    );
    const castMap = /* @__PURE__ */ new Map();
    const echoes = [];
    const shotSpans = [];
    for (const entry of sceneSpec.cast ?? []) {
      const charName = entry.character;
      const char = characters[charName];
      if (!char) continue;
      const as = entry.as ?? charName;
      const rootId = `${sceneId}/${as}`;
      instantiateCharacter({
        scene,
        char,
        charName,
        as,
        rootId,
        parentId: groupId,
        entry: standOnGround(entry, char, spec.ground),
        palettes,
        diagnostics,
        assets,
        scenePalette: spec.palette
      });
      castMap.set(as, { rootId, char, charName, entry });
      if (entry.echo) echoes.push([rootId, entry.echo]);
    }
    for (const cue of sceneSpec.audio ?? []) {
      if (!cue.asset) continue;
      audioCues.push(createCue({
        id: `${sceneId}/${cue.asset}@${cue.at ?? 0}`,
        assetId: cue.asset,
        at: sceneStart + (cue.at ?? 0),
        gain: cue.gain ?? 1,
        fadeIn: cue.fadeIn ?? 0,
        fadeOut: cue.fadeOut ?? 0,
        offset: cue.offset ?? 0,
        duration: cue.duration ?? null,
        bus: cue.bus ?? "music"
      }));
    }
    let shotTime = sceneStart;
    let prevCamera = null;
    for (const [hi, shot] of shots.entries()) {
      const dur = shot.duration ?? DEFAULTS.shotDuration;
      const shotStart = shotTime;
      const shotEnd = shotStart + dur;
      prevCamera = buildCamera({
        timeline,
        cameraId,
        shot,
        shotStart,
        dur,
        meta,
        prevCamera
      });
      for (const action of shot.actions ?? []) {
        buildAction({
          scene,
          timeline,
          action,
          castMap,
          shotStart,
          shotEnd,
          sceneId,
          characters,
          diagnostics,
          ground: spec.ground ?? null,
          // So `set props.fill` can name a palette colour, exactly
          // as a part or a scenery item does.
          colorOf: (c) => c == null ? null : scenePalette[c] ?? c
        });
      }
      for (const line of shot.dialogue ?? []) {
        buildDialogue({
          line,
          shotStart,
          shotEnd,
          sceneId,
          castMap,
          castBySpeaker,
          film,
          lipsyncJobs,
          audioCues,
          diagnostics
        });
      }
      shotSpans.push({ id: shot.id ?? `shot${hi}`, start: shotStart, end: shotEnd });
      const step = shot.step ?? meta.step ?? 0;
      if (step > 1) timeline.steps.push({ start: shotStart, end: shotEnd, step });
      shotTime = shotEnd;
      if (hi === shots.length - 1) filmTime = shotEnd;
    }
    for (const [rootId, spec2] of echoes) {
      const want = spec2.shots ? new Set([].concat(spec2.shots)) : null;
      const spans = want ? shotSpans.filter((sp) => want.has(sp.id)).map(({ start, end }) => ({ start, end })) : null;
      buildEcho({ scene, timeline, meta }, rootId, spec2, spans);
    }
    filmTime = sceneEnd;
  }
  timeline.duration = Math.max(timeline.duration, filmTime);
  buildTransitions({ scene, timeline, sceneSpans, meta });
  buildSubtitleNode({ scene, meta });
  return {
    scene,
    timeline,
    audioCues,
    lipsyncJobs,
    diagnostics,
    meta: { ...meta, duration: filmTime, frames: Math.round(filmTime * meta.fps) },
    cameraId
  };
}
function resolveImageProps(props, assets, diagnostics, path) {
  const id = props.asset ?? (typeof props.image === "string" ? props.image : null);
  if (id == null) return props;
  const image = assets[id];
  delete props.asset;
  if (!image) {
    diagnostics.push({
      severity: "warning",
      path,
      message: `Image asset "${id}" was not loaded; nothing will be drawn here.`
    });
    props.image = null;
    return props;
  }
  props.image = image;
  return props;
}
function resolveGradient(gradient, colorOf) {
  if (!gradient?.stops) return gradient ?? null;
  return { ...gradient, stops: gradient.stops.map(([at, c]) => [at, colorOf(c)]) };
}
function buildBackground(scene, timeline, sceneSpec, groupId, meta, assets, diagnostics, colorOf = (c) => c) {
  const bg = sceneSpec.background;
  if (!bg) return;
  const id = `${groupId}/bg`;
  if (bg.image) {
    const image = assets[bg.image];
    if (!image) {
      diagnostics.push({
        severity: "warning",
        path: `scenes.${sceneSpec.id}.background.image`,
        message: `Image asset "${bg.image}" was not loaded; using its color instead.`
      });
    }
    scene.add({
      id,
      kind: image ? "image" : "rect",
      props: image ? {
        image,
        w: meta.width,
        h: meta.height,
        cx: true,
        cy: true,
        fit: bg.fit ?? "cover",
        screenSpace: true
      } : {
        w: meta.width,
        h: meta.height,
        fill: colorOf(bg.color) ?? "#111317",
        screenSpace: true
      },
      transform: image ? { x: meta.width / 2, y: meta.height / 2 } : void 0,
      z: -1e3
    }, groupId);
  } else if (bg.color || bg.gradient) {
    scene.add({
      id,
      kind: "rect",
      props: {
        w: meta.width,
        h: meta.height,
        fill: colorOf(bg.color) ?? "#111317",
        gradient: resolveGradient(bg.gradient, colorOf),
        screenSpace: true
      },
      z: -1e3
    }, groupId);
  }
}
function expandTemplate(sceneSpec, meta, palettes, diagnostics) {
  if (!sceneSpec.template) return sceneSpec;
  const built = buildSceneryTemplate(
    sceneSpec.template,
    meta,
    diagnostics,
    `scenes.${sceneSpec.id}.template`
  );
  if (!built) return sceneSpec;
  if (built.palette && sceneSpec.palette) {
    palettes[sceneSpec.palette] = { ...built.palette, ...palettes[sceneSpec.palette] };
  } else if (built.palette) {
    palettes[`__t_${sceneSpec.id}`] = built.palette;
  }
  return {
    ...sceneSpec,
    palette: sceneSpec.palette ?? (built.palette ? `__t_${sceneSpec.id}` : void 0),
    background: sceneSpec.background ?? built.background,
    ground: sceneSpec.ground ?? built.ground,
    scenery: [...built.scenery, ...sceneSpec.scenery ?? []]
  };
}
function buildScenery(scene, sceneSpec, groupId, palettes, meta, assets, diagnostics) {
  const items = sceneSpec.scenery ?? [];
  if (!items.length) return;
  const palette = derivePalette(palettes[sceneSpec.palette] ?? {});
  const colorOf = (c) => c == null ? null : palette[c] ?? c;
  items.forEach((item, i) => {
    const id = `${groupId}/set${i}_${item.id ?? ""}`;
    const at = item.at ?? [0, 0];
    const { kind, ...shape } = item.shape ?? { kind: "rect" };
    scene.add({
      id,
      kind: kind ?? "rect",
      name: item.id ?? `set${i}`,
      transform: {
        x: at[0],
        y: at[1],
        sx: item.sx ?? 1,
        sy: item.sy ?? 1,
        rot: item.rot ?? 0
      },
      props: resolveImageProps({
        ...shape,
        fill: colorOf(item.fill),
        stroke: colorOf(item.stroke),
        strokeWidth: item.strokeWidth,
        gradient: resolveGradient(item.gradient, colorOf),
        alpha: item.alpha ?? 1,
        ...drawProps(item, colorOf),
        screenSpace: item.screenSpace ?? false
      }, assets, diagnostics, `scenes.${sceneSpec.id}.scenery.${item.id ?? i}`),
      z: item.z ?? -500
    }, groupId);
  });
}
function filmShots(film) {
  const out = [];
  let t = 0;
  for (const [si, scene] of (film.scenes ?? []).entries()) {
    const sceneId = scene.id ?? `s${si + 1}`;
    for (const [shi, shot] of (scene.shots ?? []).entries()) {
      const duration = shot.duration ?? DEFAULTS.shotDuration;
      out.push({
        sceneId,
        sceneIndex: si,
        shotIndex: shi,
        shotId: shot.id ?? `${sceneId}.${shi + 1}`,
        start: t,
        end: t + duration,
        duration,
        scene,
        shot
      });
      t += duration;
    }
  }
  return out;
}
function shotAt(film, t) {
  const shots = filmShots(film);
  return shots.find((s) => t >= s.start && t < s.end) ?? shots[shots.length - 1] ?? null;
}
function instantiateCharacter({
  scene,
  char,
  charName,
  as,
  rootId,
  parentId,
  entry,
  palettes,
  diagnostics,
  assets = {},
  scenePalette
}) {
  const named = palettes[char.palette] ?? palettes[scenePalette] ?? {};
  const palette = derivePalette({ ...named, ...entry.palette ?? {} });
  const colorOf = (c) => c == null ? null : palette[c] ?? c;
  const scale2 = entry.scale ?? 1;
  const at = entry.at ?? [0, 0];
  scene.add({
    id: rootId,
    kind: "group",
    transform: { x: at[0], y: at[1], sx: scale2, sy: scale2 },
    // `view` and `expression` live on the root and are read by every
    // feature below it through ancestor lookup, so one `set` turns a head
    // whose dozen parts would otherwise need a dozen identical writes.
    // Declared ONLY when the author asked for one. A blanket `view:
    // 'front'` here would be the nearest declaration for every part below
    // it, which silently overrides a part's own declared default -- the
    // precedence has to run author > part default > first member.
    props: {
      alpha: entry.alpha ?? 1,
      ...entry.view ?? char.view ? { view: entry.view ?? char.view } : {},
      ...entry.expression ?? char.expression ? { expression: entry.expression ?? char.expression } : {}
    },
    z: entry.z ?? 0,
    tags: ["cast", charName]
  }, parentId);
  const parts = characterParts(char);
  const byId = new Map((parts ?? []).map((p) => [p.id, p]));
  const added = /* @__PURE__ */ new Set();
  const addPart = (part) => {
    if (!part || added.has(part.id)) return;
    if (part.parent && byId.has(part.parent)) addPart(byId.get(part.parent));
    const pivot = part.pivot ?? [0, 0];
    const nodeId = `${rootId}/${part.id}`;
    const layers = Array.isArray(part.shapes) ? part.shapes : null;
    scene.add({
      id: nodeId,
      // A part with BOTH a shape and layers keeps its own shape: the
      // layers are children, and children draw over their parent, which
      // is exactly base-then-shade. Forcing `group` whenever layers
      // existed silently dropped the base drawing.
      kind: part.shape?.kind ?? "group",
      name: part.id,
      // The pivot is the joint: a limb rotates about where it attaches,
      // which is the whole trick behind a cutout rig reading correctly.
      transform: {
        x: (part.at?.[0] ?? 0) + pivot[0],
        y: (part.at?.[1] ?? 0) + pivot[1],
        ox: 0,
        oy: 0
      },
      props: resolveImageProps({
        ...shapeProps(part.shape),
        fill: colorOf(part.fill),
        stroke: colorOf(part.stroke),
        strokeWidth: part.strokeWidth,
        alpha: part.alpha ?? 1,
        ...drawProps(part, colorOf),
        ...swapProps(part, colorOf)
      }, assets, diagnostics, `characters.${charName}.parts.${part.id}`),
      z: part.z ?? 0
    }, part.parent ? `${rootId}/${part.parent}` : rootId);
    for (const [i, layer] of (layers ?? []).entries()) {
      scene.add({
        id: `${nodeId}/${layer.id ?? i}`,
        kind: layer.shape?.kind ?? "group",
        name: layer.id ?? `layer${i}`,
        transform: { x: layer.at?.[0] ?? 0, y: layer.at?.[1] ?? 0 },
        props: resolveImageProps({
          ...shapeProps(layer.shape),
          fill: colorOf(layer.fill),
          stroke: colorOf(layer.stroke),
          strokeWidth: layer.strokeWidth,
          alpha: layer.alpha ?? 1,
          ...drawProps(layer, colorOf),
          ...swapProps(layer, colorOf)
        }, assets, diagnostics, `characters.${charName}.parts.${part.id}.${layer.id ?? i}`),
        z: layer.z ?? i
      }, nodeId);
    }
    added.add(part.id);
  };
  for (const part of parts ?? []) addPart(part);
  const mouthSpec = char.mouth ?? (char.generate ? generateMouth(char.proportions, char.generate) : null);
  if (mouthSpec) {
    const m = mouthSpec;
    const shapes = {};
    for (const [name, shape] of Object.entries(m.shapes ?? {})) shapes[name] = shape;
    const pivot = m.pivot ?? [0, 0];
    const parent = m.parent && added.has(m.parent) ? `${rootId}/${m.parent}` : rootId;
    scene.add({
      id: `${rootId}/mouth`,
      kind: "path",
      name: "mouth",
      transform: { x: pivot[0], y: pivot[1] },
      props: {
        visemeShapes: shapes,
        viseme: "closed",
        fill: colorOf(m.fill ?? null),
        stroke: colorOf(m.stroke ?? "#3a2318"),
        strokeWidth: m.strokeWidth ?? 3
      },
      z: m.z ?? 100
    }, parent);
  } else if (char.parts?.length && char.voice) {
    diagnostics.push({
      severity: "warning",
      path: `characters.${charName}.mouth`,
      message: "No mouth block; this character cannot be lipsynced."
    });
  }
}
function characterParts(char) {
  if (char.parts?.length) return char.parts;
  return char.generate ? generateCharacterParts(char.generate, char.proportions) : [];
}
function drawProps(part, colorOf) {
  const out = {};
  if (part.blend) out.blend = part.blend;
  if (part.trim) out.trim = part.trim;
  if (part.repeat) out.repeat = part.repeat;
  if (part.gradient) out.gradient = resolveGradient(part.gradient, colorOf);
  if (part.glow) {
    out.glow = typeof part.glow === "object" ? { ...part.glow, ...part.glow.color != null && { color: colorOf(part.glow.color) } } : part.glow;
  }
  return out;
}
function swapProps(part, colorOf) {
  const spec = part.swap;
  if (!spec) return {};
  const swapSets = {};
  const swapDefaults = {};
  for (const [channel, set] of Object.entries(spec)) {
    const shapes = set.shapes ?? set;
    swapSets[channel] = Object.fromEntries(Object.entries(shapes).map(([k, v]) => [
      k,
      v && (v.fill != null || v.stroke != null) ? {
        ...v,
        ...v.fill != null && { fill: colorOf(v.fill) },
        ...v.stroke != null && { stroke: colorOf(v.stroke) }
      } : v
    ]));
    swapDefaults[channel] = set.default ?? Object.keys(shapes)[0];
  }
  return { swapSets, swapDefaults };
}
function shapeProps(shape) {
  if (!shape) return {};
  const { kind, ...rest } = shape;
  return rest;
}
function buildCamera({ timeline, cameraId, shot, shotStart, dur, meta, prevCamera }) {
  const cam = shot.camera;
  const centre = { x: meta.width / 2, y: meta.height / 2, zoom: 1 };
  const start = cam?.from ?? prevCamera ?? centre;
  const end = cam?.to ?? start;
  const ease = cam?.ease ?? "smooth";
  const h = cam?.h;
  const moveStart = shotStart + (cam?.at ?? 0);
  const moveEnd = moveStart + (cam?.for ?? dur - (cam?.at ?? 0));
  const cut = cam?.from != null && moveStart > 0;
  const startAt = cut ? moveStart + 0.5 / (meta.fps || 24) : moveStart;
  const write = (path, a, b) => {
    key(timeline, cameraId, path, startAt, a, { type: "number", ease, h });
    key(timeline, cameraId, path, moveEnd, b, { type: "number" });
  };
  write("transform.x", centre.x + (start.x ?? 0), centre.x + (end.x ?? 0));
  write("transform.y", centre.y + (start.y ?? 0), centre.y + (end.y ?? 0));
  write("props.zoom", start.zoom ?? 1, end.zoom ?? 1);
  if (start.rot != null || end.rot != null) {
    write("transform.rot", start.rot ?? 0, end.rot ?? 0);
  }
  if (cam?.shake) buildShake({ timeline, cameraId, cam, moveStart, startAt, dur, meta, centre, start, end });
  return { x: end.x ?? 0, y: end.y ?? 0, zoom: end.zoom ?? 1, rot: end.rot ?? 0 };
}
function buildShake({ timeline, cameraId, cam, moveStart, startAt, dur, meta, centre, start, end }) {
  const spec = typeof cam.shake === "number" ? { amount: cam.shake } : cam.shake;
  const amount = spec.amount ?? 12;
  if (!(amount > 0)) return;
  const fps = meta.fps || 24;
  const at = Math.max(startAt, moveStart + (spec.at ?? 0));
  const span = Math.min(spec.for ?? 0.45, dur - (at - moveStart));
  const steps = Math.max(2, Math.round(span * fps));
  const baseX = centre.x + (start.x ?? 0), endX = centre.x + (end.x ?? 0);
  const baseY = centre.y + (start.y ?? 0), endY = centre.y + (end.y ?? 0);
  for (let i = 0; i <= steps; i++) {
    const t = at + i / steps * span;
    const decay = 1 - i / steps;
    const sign = i % 2 ? -1 : 1;
    const u = dur > 0 ? Math.min(1, Math.max(0, (t - moveStart) / dur)) : 0;
    key(
      timeline,
      cameraId,
      "transform.x",
      t,
      baseX + (endX - baseX) * u + sign * amount * decay,
      { type: "number", ease: "linear" }
    );
    key(
      timeline,
      cameraId,
      "transform.y",
      t,
      baseY + (endY - baseY) * u + sign * amount * decay * 0.6,
      { type: "number", ease: "linear" }
    );
  }
}
function writeChannel({
  timeline,
  target,
  channel,
  value,
  at,
  span,
  ease,
  h,
  anticipate = 0,
  overshoot = 0
}) {
  const path = `transform.${channel}`;
  if (span == null) {
    key(timeline, target, path, at, value, { type: "number", ease, h });
    return;
  }
  const prev = lastValueBefore(timeline, target, path, at) ?? defaultChannel(channel);
  key(timeline, target, path, at, prev, { type: "number", ease, h });
  if (anticipate) {
    key(
      timeline,
      target,
      path,
      at + span * ANTICIPATION_SHARE,
      anticipationValue(prev, value, anticipate),
      { type: "number", ease: "smooth" }
    );
  }
  if (overshoot) {
    key(
      timeline,
      target,
      path,
      at + span * OVERSHOOT_AT,
      overshootValue(prev, value, overshoot),
      { type: "number", ease: "smooth" }
    );
  }
  key(timeline, target, path, at + span, value, { type: "number" });
}
function standOnGround(entry, char, ground) {
  const at = entry.at;
  if (!ground || !Array.isArray(at) || at[1] != null) return entry;
  const gy = groundAt(ground, at[0] ?? 0);
  if (gy == null) return entry;
  return { ...entry, at: [at[0] ?? 0, gy - castFeet(char, entry)] };
}
function castFeet(char, entry) {
  const parts = characterParts(char ?? {});
  if (!parts.length) return 0;
  return measureCharacter(parts).bottom * (entry?.scale ?? 1);
}
function seedChannel(scene, timeline, nodeId, path) {
  if (timeline._index?.get(`${nodeId}\0${path}`)) return;
  const node = scene.get(nodeId);
  if (!node) return;
  const dot2 = path.indexOf(".");
  const bag = path.slice(0, dot2) === "props" ? node.props : node.transform;
  const current = bag?.[path.slice(dot2 + 1)];
  if (current === void 0) return;
  key(timeline, nodeId, path, 0, current, { type: typeof current === "number" ? "number" : void 0, ease: "step" });
}
var COLOR_CHANNELS = /* @__PURE__ */ new Set(["props.fill", "props.stroke"]);
function buildAction({
  scene,
  timeline,
  action,
  castMap,
  shotStart,
  shotEnd,
  sceneId,
  characters,
  diagnostics,
  ground = null,
  colorOf = null
}) {
  const at0 = shotStart + (action.at ?? 0);
  if (action.do === "draw") {
    const nodeId = `${sceneId}/${action.target}`;
    if (!scene.get(nodeId)) {
      diagnostics.push({
        severity: "warning",
        path: `scenes.${sceneId}.actions`,
        message: `draw: no drawing or photo "${action.target}" in this scene`
      });
      return;
    }
    const from = action.from ?? 0;
    const to = action.to ?? 1;
    const span0 = action.for ?? null;
    const ease0 = action.ease ?? "smooth";
    if (at0 > 0) {
      key(timeline, nodeId, "props.progress", 0, from, { type: "number", ease: "step" });
    }
    key(
      timeline,
      nodeId,
      "props.progress",
      at0,
      from,
      { type: "number", ease: ease0, h: action.h }
    );
    key(
      timeline,
      nodeId,
      "props.progress",
      at0 + (span0 ?? 0),
      to,
      { type: "number", ease: ease0, h: action.h }
    );
    return;
  }
  const cast = castMap.get(action.target);
  if (!cast) return;
  const { rootId, charName, entry } = cast;
  const char = characters[charName];
  const at = shotStart + (action.at ?? 0);
  const span = action.for ?? null;
  const ease = action.ease ?? "smooth";
  const h = action.h;
  const anticipate = action.anticipate ?? 0;
  const overshoot = action.overshoot ?? 0;
  switch (action.do) {
    case "pose": {
      const pose = char?.poses?.[action.pose];
      if (!pose) return;
      for (const [partId, channels] of Object.entries(pose)) {
        for (const [channel, value] of Object.entries(channels)) {
          writeChannel({
            timeline,
            target: `${rootId}/${partId}`,
            channel,
            value,
            at,
            span,
            ease,
            h,
            anticipate,
            overshoot
          });
        }
      }
      break;
    }
    case "move": {
      const to = action.to ?? [0, 0];
      if (to[1] == null && ground) {
        const feet = castFeet(char, entry);
        const gy = groundAt(ground, to[0]);
        if (gy != null) to[1] = gy - feet;
      }
      const prevX = lastValueBefore(timeline, rootId, "transform.x", at) ?? scene.get(rootId)?.transform.x ?? 0;
      const prevY = lastValueBefore(timeline, rootId, "transform.y", at) ?? scene.get(rootId)?.transform.y ?? 0;
      const end = at + (span ?? shotEnd - at);
      const dur = end - at;
      key(timeline, rootId, "transform.x", at, prevX, { type: "number", ease, h });
      key(timeline, rootId, "transform.y", at, prevY, { type: "number", ease, h });
      if (action.arc && dur > 0) {
        const [mx, my] = arcMidpoint([prevX, prevY], [to[0], to[1]], action.arc);
        key(timeline, rootId, "transform.x", at + dur / 2, mx, { type: "number", ease: "smooth" });
        key(timeline, rootId, "transform.y", at + dur / 2, my, { type: "number", ease: "smooth" });
      }
      if (anticipate && dur > 0) {
        const t = at + dur * ANTICIPATION_SHARE;
        key(
          timeline,
          rootId,
          "transform.x",
          t,
          anticipationValue(prevX, to[0], anticipate),
          { type: "number", ease: "smooth" }
        );
        key(
          timeline,
          rootId,
          "transform.y",
          t,
          anticipationValue(prevY, to[1], anticipate),
          { type: "number", ease: "smooth" }
        );
      }
      if (overshoot && dur > 0) {
        const t = at + dur * OVERSHOOT_AT;
        key(
          timeline,
          rootId,
          "transform.x",
          t,
          overshootValue(prevX, to[0], overshoot),
          { type: "number", ease: "smooth" }
        );
        key(
          timeline,
          rootId,
          "transform.y",
          t,
          overshootValue(prevY, to[1], overshoot),
          { type: "number", ease: "smooth" }
        );
      }
      key(timeline, rootId, "transform.x", end, to[0], { type: "number" });
      key(timeline, rootId, "transform.y", end, to[1], { type: "number" });
      break;
    }
    case "play": {
      const spec = char?.actions?.[action.action] ?? (char?.generate ? generateActions(char.proportions)[action.action] : null);
      if (!spec) return;
      const clipId = `${charName}:${action.action}`;
      if (!timeline.clips.has(clipId)) {
        addClip(timeline, buildClipFromAction(clipId, action.action, spec));
      }
      addInstance(timeline, {
        clipId,
        start: at,
        end: at + (span ?? shotEnd - at),
        speed: action.speed ?? 1,
        weight: action.weight ?? 1,
        scopeId: rootId
      });
      break;
    }
    case "reach": {
      if (!action.part || !Array.isArray(action.to)) return;
      const parts = characterParts(char ?? {});
      const chain = chainFromParts(parts, action.part, action.bones ?? 2);
      if (!chain) {
        diagnostics.push({
          severity: "warning",
          path: `scenes.${sceneId}.actions`,
          message: `reach: no ${action.bones ?? 2}-bone chain above part "${action.part}" on "${charName}"; ignored.`
        });
        return;
      }
      const offset = chainRootOffset(parts, chain.rootId);
      const solved = solveChain({
        bones: chain.bones,
        target: [action.to[0] - offset[0], action.to[1] - offset[1]],
        bend: action.bend ?? 1
      });
      chain.bones.forEach((bone, i) => {
        writeChannel({
          timeline,
          target: `${rootId}/${bone.id}`,
          channel: "rot",
          value: solved.rots[i],
          at,
          span,
          ease,
          h,
          anticipate,
          overshoot
        });
      });
      if (solved.clamped) {
        diagnostics.push({
          severity: "info",
          path: `scenes.${sceneId}.actions`,
          message: `reach: [${action.to}] is out of range for "${action.part}" (off by ${solved.error.toFixed(1)}); limb extended as far as it goes.`
        });
      }
      break;
    }
    case "set": {
      if (!action.channel) return;
      const node = action.part ? `${rootId}/${action.part}` : rootId;
      const value = COLOR_CHANNELS.has(action.channel) && typeof action.value === "string" ? colorOf?.(action.value) ?? action.value : action.value;
      if (at > 0) seedChannel(scene, timeline, node, action.channel);
      key(timeline, node, action.channel, at, value, { ease, h });
      break;
    }
    case "show":
    case "hide": {
      if (at > 0) seedChannel(scene, timeline, rootId, "props.alpha");
      key(
        timeline,
        rootId,
        "props.alpha",
        at,
        action.do === "show" ? 1 : 0,
        { type: "number", ease: span ? ease : "step" }
      );
      if (span != null) {
        key(
          timeline,
          rootId,
          "props.alpha",
          at + span,
          action.do === "show" ? 1 : 0,
          { type: "number" }
        );
      }
      break;
    }
    default:
      break;
  }
}
function buildDrawings(scene, spec, groupId, sceneId, scenePalette, meta, diagnostics) {
  const colorOf = (c) => c == null ? null : scenePalette[c] ?? c;
  for (const [i, drawing] of (spec.drawings ?? []).entries()) {
    const id = drawing.id ?? `drawing${i + 1}`;
    const nodeId = `${sceneId}/${id}`;
    const width = drawing.width ?? meta.width;
    const height = drawing.height ?? meta.height;
    const layers = (drawing.layers ?? [{ strokes: drawing.strokes ?? [] }]).map((layer, li) => ({
      name: layer.name ?? `layer${li + 1}`,
      blend: layer.blend ?? "normal",
      opacity: layer.opacity ?? 1,
      visible: layer.visible ?? true,
      strokes: (layer.strokes ?? []).map((stroke) => ({
        ...stroke,
        color: colorOf(stroke.color) ?? "#000000"
      }))
    }));
    const strokeCount = layers.reduce((n2, l) => n2 + l.strokes.length, 0);
    if (strokeCount === 0) {
      diagnostics.push({
        severity: "warning",
        path: `scenes.${sceneId}.drawings.${id}`,
        message: "drawing has no strokes; it will render as nothing"
      });
    }
    for (const layer of layers) {
      for (const stroke of layer.strokes) {
        if (!stroke.path && !stroke.points) {
          diagnostics.push({
            severity: "warning",
            path: `scenes.${sceneId}.drawings.${id}`,
            message: `a stroke in layer "${layer.name}" has neither "path" nor "points"`
          });
        }
      }
    }
    scene.add({
      id: nodeId,
      kind: "paint",
      parentId: groupId,
      transform: { x: drawing.at?.[0] ?? meta.width / 2, y: drawing.at?.[1] ?? meta.height / 2 },
      z: drawing.z ?? 40,
      props: {
        // The unrasterised spec. The backend turns this into a
        // painter; the compiler never touches a canvas.
        paint: { width, height, layers, background: drawing.background ?? null },
        // Default 1, so a drawing with no `draw` action is simply
        // present -- the same way a character with no actions
        // stands in its rest pose rather than being invisible.
        progress: drawing.progress ?? 1,
        alpha: drawing.alpha ?? 1,
        w: width,
        h: height,
        cx: true,
        cy: true
      }
    });
  }
}
function buildPhotos(scene, timeline, spec, groupId, sceneId, meta, assets, diagnostics, sceneStart, sceneEnd) {
  const driven = /* @__PURE__ */ new Set();
  for (const shot of spec.shots ?? []) {
    for (const a of shot.actions ?? []) {
      if (a.do === "draw" && a.target) driven.add(a.target);
    }
  }
  for (const [i, photo] of (spec.photos ?? []).entries()) {
    const id = photo.id ?? `photo${i + 1}`;
    const nodeId = `${sceneId}/${id}`;
    const path = `scenes.${sceneId}.photos.${id}`;
    const resolve = (assetId, required) => {
      if (assetId == null) return null;
      const asset = assets[assetId];
      if (!asset) {
        diagnostics.push({
          severity: required ? "error" : "warning",
          path,
          message: `Image asset "${assetId}" was not loaded; ` + (required ? "this photo cannot render." : "parallax and tearing will do nothing.")
        });
        return null;
      }
      return asset;
    };
    const source = resolve(photo.source ?? photo.image, true);
    const depth = resolve(photo.depth, false);
    if (photo.source == null && photo.image == null) {
      diagnostics.push({
        severity: "error",
        path,
        message: 'photo has no "source"; nothing will render.'
      });
    }
    if (!depth && (photo.effects ?? []).some((e) => e.type === "parallax")) {
      diagnostics.push({
        severity: "warning",
        path,
        message: 'parallax needs a "depth" map; without one it is skipped.'
      });
    }
    const start = sceneStart + (photo.start ?? 0);
    const duration = photo.duration ?? Math.max(0, sceneEnd - start);
    scene.add({
      id: nodeId,
      kind: "photo",
      parentId: groupId,
      transform: { x: photo.at?.[0] ?? meta.width / 2, y: photo.at?.[1] ?? meta.height / 2 },
      z: photo.z ?? 30,
      props: {
        photo: {
          width: photo.width ?? meta.width,
          height: photo.height ?? meta.height,
          source,
          depth,
          effects: photo.effects ?? [],
          duration,
          grid: photo.grid,
          overscan: photo.overscan,
          depthBlur: photo.depthBlur,
          tear: photo.tear ?? false
        },
        progress: 0,
        alpha: photo.alpha ?? 1,
        w: photo.width ?? meta.width,
        h: photo.height ?? meta.height,
        cx: true,
        cy: true
      }
    });
    if (!driven.has(id) && duration > 0) {
      key(timeline, nodeId, "props.progress", start, 0, { type: "number" });
      key(timeline, nodeId, "props.progress", start + duration, 1, { type: "number" });
    }
  }
}
function buildClipFromAction(clipId, name, spec) {
  const tracks = [];
  const keyed = applyOverlap(
    spec.keys ?? {},
    overlapDelays(spec.lag, spec.chain ?? [])
  );
  const blend = spec.blend ?? "override";
  const mask = spec.mask ?? null;
  for (const [channelPath, keys] of Object.entries(keyed)) {
    const dot2 = channelPath.indexOf(".");
    const partId = dot2 < 0 ? channelPath : channelPath.slice(0, dot2);
    const channel = dot2 < 0 ? "y" : channelPath.slice(dot2 + 1);
    const first = Array.isArray(keys?.[0]) ? keys[0][1] : keys?.[0]?.v;
    const track = createTrack({
      target: partId,
      path: channel.startsWith("props.") ? channel : `transform.${channel}`,
      // A generated action may key a named shape rather than a number --
      // a blink is a swap, not a scale -- and interpolating between two
      // strings as numbers yields NaN.
      type: typeof first === "string" ? "discrete" : "number"
    });
    for (const entry of keys) {
      const [t, v, ease, h] = Array.isArray(entry) ? entry : [entry.t, entry.v, entry.ease, entry.h];
      setKey(track, t, v, ease ?? "smooth", h);
    }
    tracks.push(track);
  }
  return createClip({
    id: clipId,
    name,
    duration: spec.duration,
    loop: spec.loop ?? "repeat",
    tracks,
    blend,
    mask
  });
}
function lastValueBefore(timeline, target, path, t) {
  const track = timeline._index?.get(`${target}\0${path}`);
  if (!track) return void 0;
  let found;
  for (const k of track.keys) {
    if (k.t <= t) found = k.v;
    else break;
  }
  return found;
}
var defaultChannel = (channel) => channel === "sx" || channel === "sy" ? 1 : 0;
function buildDialogue({ line, shotStart, shotEnd, sceneId, castMap, castBySpeaker, film, lipsyncJobs, audioCues, diagnostics }) {
  if (!line.text && !line.audio) return;
  const at = shotStart + (line.at ?? 0);
  const cast = castMap.get(line.speaker);
  const charName = cast?.charName;
  const voiceSpec = line.voice ?? (charName ? castBySpeaker[charName] : null) ?? null;
  if (!voiceSpec && !line.audio) {
    diagnostics.push({
      severity: "warning",
      path: `scenes.${sceneId}.dialogue`,
      message: `"${line.speaker ?? "unknown"}" has no voice assigned; line will be silent but still subtitled and lipsynced from text.`
    });
  }
  lipsyncJobs.push({
    nodeId: cast ? `${cast.rootId}/mouth` : null,
    speaker: line.speaker,
    text: line.text ?? null,
    at,
    voiceSpec,
    audioAssetId: line.audio ?? null,
    lipsync: line.lipsync !== false,
    gain: line.gain ?? 1,
    durationSec: line.duration ?? null,
    subtitle: line.subtitle !== false,
    shotEnd
  });
}
function buildTransitions({ scene, timeline, sceneSpans, meta }) {
  const overlayId = "__overlay";
  const firstFade = sceneSpans.find((s) => s.spec.transitionIn?.kind === "fade");
  scene.add({
    id: overlayId,
    kind: "rect",
    props: {
      w: meta.width,
      h: meta.height,
      fill: firstFade?.spec.transitionIn?.from ?? "#000000",
      alpha: 0,
      screenSpace: true
    },
    z: 1e4
  });
  let any = false;
  for (const span of sceneSpans) {
    const tIn = span.spec.transitionIn;
    const tOut = span.spec.transitionOut;
    if (tIn && tIn.kind !== "none" && tIn.kind !== "crossfade") {
      const d = tIn.duration ?? DEFAULTS.transitionDuration;
      key(timeline, overlayId, "props.alpha", span.sceneStart, 1, { type: "number" });
      key(timeline, overlayId, "props.alpha", span.sceneStart + d, 0, { type: "number" });
      any = true;
    }
    if (tOut && tOut.kind !== "none" && tOut.kind !== "crossfade") {
      const d = tOut.duration ?? DEFAULTS.transitionDuration;
      key(timeline, overlayId, "props.alpha", span.sceneEnd - d, 0, { type: "number" });
      key(timeline, overlayId, "props.alpha", span.sceneEnd, 1, { type: "number" });
      any = true;
    }
  }
  if (!any) key(timeline, overlayId, "props.alpha", 0, 0, { type: "number" });
}
function planScenes(film) {
  const scenes = film.scenes ?? [];
  const spans = [];
  let t = 0;
  for (const [si, spec] of scenes.entries()) {
    const duration = (spec.shots ?? []).reduce(
      (sum, sh) => sum + (sh.duration ?? DEFAULTS.shotDuration),
      0
    );
    spans.push({
      sceneId: spec.id ?? `s${si + 1}`,
      sceneStart: t,
      sceneEnd: t + duration,
      spec,
      fadeIn: 0,
      fadeOut: 0
    });
    t += duration;
  }
  for (const [i, span] of spans.entries()) {
    const prev = spans[i - 1];
    const next = spans[i + 1];
    const inSpec = span.spec.transitionIn;
    const outSpec = span.spec.transitionOut;
    if (i > 0 && (inSpec?.kind === "crossfade" || prev?.spec.transitionOut?.kind === "crossfade")) {
      span.fadeIn = inSpec?.kind === "crossfade" ? inSpec.duration ?? DEFAULTS.transitionDuration : prev.spec.transitionOut.duration ?? DEFAULTS.transitionDuration;
    }
    if (next && (outSpec?.kind === "crossfade" || next.spec.transitionIn?.kind === "crossfade")) {
      span.fadeOut = outSpec?.kind === "crossfade" ? outSpec.duration ?? DEFAULTS.transitionDuration : next.spec.transitionIn.duration ?? DEFAULTS.transitionDuration;
    }
  }
  return spans;
}
function buildSubtitleNode({ scene, meta }) {
  const st = DEFAULTS.subtitleStyle;
  scene.add({
    id: "__subtitle",
    kind: "text",
    transform: { x: meta.width / 2, y: meta.height - st.bottomMargin },
    props: {
      text: "",
      font: st.font,
      fill: st.fill,
      stroke: st.stroke,
      strokeWidth: st.strokeWidth,
      align: "center",
      baseline: "alphabetic",
      screenSpace: true
    },
    z: 9e3
  });
}

// src/core/script/screenplay.js
var SCENE_HEADING = /^(?:#{1,3}\s*)?(?:SCENE\s*[:.]?\s*|INT\.?\s*|EXT\.?\s*|INT\/EXT\.?\s*)(.+)$/i;
var TITLE_LINE = /^(?:#\s*|TITLE\s*[:]\s*)(.+)$/i;
var ACTION_LINE = /^[[(](.+)[\])]$/;
var INLINE_SPEAKER = /^([A-Z][A-Z0-9 .'_-]{0,28})\s*(?:\(([^)]*)\))?\s*:\s*(.+)$/;
var SPEAKER_ONLY = /^([A-Z][A-Z0-9 .'_-]{0,28})\s*(?:\(([^)]*)\))?$/;
var WORDS_PER_SECOND = 2.6;
var MIN_LINE_SECONDS = 1.4;
var BEAT_PADDING = 0.7;
function parseScreenplay(text, {
  fps = DEFAULTS.fps,
  width = DEFAULTS.width,
  height = DEFAULTS.height
} = {}) {
  const lines = String(text).replace(/\r\n?/g, "\n").split("\n");
  const diagnostics = [];
  let title = null;
  const scenes = [];
  const speakers = /* @__PURE__ */ new Set();
  let scene = null;
  let pendingSpeaker = null;
  let pendingParenthetical = null;
  const closeOpen = () => {
    const beats = scene?.beats;
    const last = beats?.[beats.length - 1];
    if (last?._open) delete last._open;
  };
  const newScene = (name) => {
    scene = { name: name.trim(), beats: [] };
    scenes.push(scene);
    return scene;
  };
  for (const [i, raw] of lines.entries()) {
    const line = raw.trim();
    if (!line) {
      closeOpen();
      pendingSpeaker = null;
      continue;
    }
    const titleMatch = line.match(TITLE_LINE);
    if (titleMatch && !title && !scene) {
      title = titleMatch[1].trim();
      continue;
    }
    const sceneMatch = line.match(SCENE_HEADING);
    if (sceneMatch) {
      closeOpen();
      newScene(sceneMatch[1]);
      pendingSpeaker = null;
      continue;
    }
    const actionMatch = line.match(ACTION_LINE);
    if (actionMatch) {
      closeOpen();
      if (!scene) newScene("Scene 1");
      scene.beats.push({ kind: "action", text: actionMatch[1].trim() });
      pendingSpeaker = null;
      continue;
    }
    const inline = line.match(INLINE_SPEAKER);
    if (inline && inline[3].trim()) {
      closeOpen();
      if (!scene) newScene("Scene 1");
      const who = normalizeSpeaker(inline[1]);
      speakers.add(who);
      scene.beats.push({
        kind: "line",
        speaker: who,
        parenthetical: inline[2]?.trim() || null,
        text: inline[3].trim()
      });
      pendingSpeaker = null;
      continue;
    }
    const speakerOnly = line.match(SPEAKER_ONLY);
    const nameIsCaps = speakerOnly && speakerOnly[1] === speakerOnly[1].toUpperCase() && /[A-Z]/.test(speakerOnly[1]);
    if (nameIsCaps) {
      closeOpen();
      const who = normalizeSpeaker(speakerOnly[1]);
      speakers.add(who);
      pendingSpeaker = who;
      pendingParenthetical = speakerOnly[2]?.trim() || null;
      continue;
    }
    if (pendingSpeaker) {
      if (!scene) newScene("Scene 1");
      const last = scene.beats[scene.beats.length - 1];
      if (last?.kind === "line" && last.speaker === pendingSpeaker && last._open) {
        last.text += ` ${line}`;
      } else {
        scene.beats.push({
          kind: "line",
          speaker: pendingSpeaker,
          parenthetical: pendingParenthetical,
          text: line,
          _open: true
        });
      }
      continue;
    }
    if (!scene) newScene("Scene 1");
    scene.beats.push({ kind: "action", text: line });
    diagnostics.push({
      severity: "info",
      path: `line ${i + 1}`,
      message: `Treated as action: "${truncate(line)}"`
    });
  }
  if (!scenes.length) {
    return {
      film: null,
      diagnostics: [{ severity: "fatal", path: "", message: "No scenes or dialogue found." }]
    };
  }
  const film = {
    version: FILM_VERSION,
    // estimatedTiming tells the studio these durations came from a word
    // count, so retiming may tighten them as well as extend them.
    meta: { title: title ?? "Untitled", fps, width, height, estimatedTiming: true },
    voices: {},
    assets: {},
    palettes: { default: DEFAULT_PALETTE2 },
    characters: {},
    scenes: []
  };
  const speakerList = [...speakers];
  speakerList.forEach((who, idx) => {
    const id = slug(who);
    film.voices[`${id}_v`] = { spec: suggestVoice(idx) };
    film.characters[id] = {
      palette: "default",
      voice: `${id}_v`,
      generate: { cloth: idx % 2 ? "coat2" : "coat" },
      proportions: { height: 190 + idx % 3 * 8 }
    };
  });
  scenes.forEach((sc, si) => {
    const castIds = [...new Set(sc.beats.filter((b) => b.kind === "line").map((b) => slug(b.speaker)))];
    const positions = layoutCast(castIds.length, width, height);
    const out = {
      id: `s${si + 1}`,
      background: { color: BACKDROPS[si % BACKDROPS.length] },
      transitionIn: si === 0 ? { kind: "fade", from: "#000000", duration: 1 } : { kind: "crossfade", duration: 0.8 },
      cast: castIds.map((id, ci) => ({
        character: id,
        as: id,
        at: positions[ci],
        scale: 1
      })),
      audio: [],
      shots: []
    };
    for (const beat of sc.beats) {
      if (beat.kind === "action") {
        out.shots.push({
          id: `s${si + 1}.a${out.shots.length + 1}`,
          duration: 2.4,
          camera: { to: { x: 0, y: 0, zoom: 1.05 } },
          actions: castIds.map((id) => ({ target: id, do: "play", action: "idle" }))
        });
        continue;
      }
      const seconds = estimateSeconds(beat.text);
      out.shots.push({
        id: `s${si + 1}.l${out.shots.length + 1}`,
        duration: +(seconds + BEAT_PADDING).toFixed(2),
        camera: { to: { x: 0, y: 0, zoom: 1.12 } },
        actions: castIds.map((id) => ({
          target: id,
          do: "play",
          action: id === slug(beat.speaker) ? "idle" : "breathe"
        })),
        dialogue: [{
          speaker: slug(beat.speaker),
          at: 0.35,
          text: beat.text,
          lipsync: true,
          subtitle: true
        }]
      });
    }
    if (si < scenes.length - 1) out.transitionOut = { kind: "crossfade", duration: 0.8 };
    film.scenes.push(out);
  });
  const duration = film.scenes.reduce(
    (sum, sc) => sum + sc.shots.reduce((a, b) => a + b.duration, 0),
    0
  );
  diagnostics.unshift({
    severity: "info",
    path: "",
    message: `Parsed ${film.scenes.length} scene(s), ${speakerList.length} character(s), ${film.scenes.reduce((n2, s) => n2 + s.shots.length, 0)} shot(s), ~${duration.toFixed(1)}s. Cast voices before rendering.`
  });
  return { film, diagnostics, speakers: speakerList, estimatedDuration: duration };
}
function estimateSeconds(text) {
  const words = String(text).trim().split(/\s+/).filter(Boolean).length;
  return Math.max(MIN_LINE_SECONDS, words / WORDS_PER_SECOND);
}
function retimeToAudio(film, lineDurations, {
  padding = BEAT_PADDING,
  shrink = false,
  tolerance = 0.05
} = {}) {
  const next = structuredClone(film);
  const changes = [];
  for (const scene of next.scenes ?? []) {
    for (const shot of scene.shots ?? []) {
      let needed = 0;
      for (const line of shot.dialogue ?? []) {
        const d = lineDurations[line.text];
        if (d) needed = Math.max(needed, (line.at ?? 0) + d + padding);
      }
      if (needed <= 0) continue;
      const current = shot.duration ?? 0;
      const grow = needed > current + tolerance;
      const tighten = shrink && needed < current - tolerance;
      if (!grow && !tighten) continue;
      changes.push({ shot: shot.id, from: current, to: +needed.toFixed(2) });
      shot.duration = +needed.toFixed(2);
    }
  }
  return { film: next, changed: changes.length, changes };
}
var DEFAULT_PALETTE2 = {
  skin: "#e8c39e",
  coat: "#c4452f",
  coat2: "#3d5a80",
  hair: "#2b1d14",
  eye: "#1a1a1a",
  shoe: "#20160f",
  trouser: "#2f3a46"
};
var BACKDROPS = ["#2b3a67", "#1a1410", "#35414d", "#241b2e", "#1f2d24"];
var VOICE_SUGGESTIONS = [
  "tts:en_US-amy-medium",
  "tts:en_US-ryan-medium",
  "tts:en_GB-alba-medium",
  "tts:en_US-kristin-medium",
  "tts:en_GB-alan-medium",
  "tts:en_US-joe-medium"
];
var suggestVoice = (i) => VOICE_SUGGESTIONS[i % VOICE_SUGGESTIONS.length];
function layoutCast(n2, width, height) {
  const y = Math.round(height * 0.82);
  if (n2 <= 0) return [];
  if (n2 === 1) return [[Math.round(width * 0.5), y]];
  const out = [];
  for (let i = 0; i < n2; i++) {
    const u = (i + 1) / (n2 + 1);
    out.push([Math.round(width * (0.22 + u * 0.56)), y]);
  }
  return out;
}
var normalizeSpeaker = (s) => s.trim().replace(/\s+/g, " ");
var slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
var truncate = (s) => s.length > 44 ? `${s.slice(0, 44)}...` : s;
export {
  ANTICIPATION_SHARE,
  AssetRegistry,
  BROWS,
  BUILDS,
  DEFAULTS,
  DEFAULT_BEZIER_HANDLES,
  DEFAULT_FACE,
  DEFAULT_PALETTE,
  DEFAULT_PROPORTIONS,
  DO_VERBS,
  EARS,
  EXPRESSIONS,
  EYES,
  Evaluator,
  FACE_KITS,
  FILM_VERSION,
  FRAMINGS,
  FileProvider,
  FrameClock,
  HAIRS,
  JAWS,
  KNOWN,
  LIPS,
  NOSES,
  OVERSHOOT_AT,
  PROPS,
  PROP_NAMES,
  SCENERY_TEMPLATES,
  SWAP_FALLBACK,
  Scene,
  TEMPLATE_NAMES,
  TIMES,
  TIME_NAMES,
  TRANSFORM2D_CHANNELS,
  TRANSITION_KINDS,
  UrlProvider,
  VIEWS,
  VISEMES,
  VISEME_FALLBACK,
  VoiceRegistry,
  addClip,
  addInstance,
  analyseMotion,
  analyseStaging,
  anticipationValue,
  applyOverlap,
  applyPose,
  applySwapSets,
  applyVisemeShapes,
  arcMidpoint,
  buildSceneryTemplate,
  castVoices,
  chainFromParts,
  chainRootOffset,
  characterParts,
  checkMotion,
  clipLocalTime,
  compileFilm,
  createClip,
  createCue,
  createIdFactory,
  createNode,
  createPoseBaseline,
  createTimeline,
  createTrack,
  createVoice,
  cubicBezierEase,
  cueGainAt,
  cueSampleWindow,
  derivePalette,
  easeProgress,
  envelope,
  estimateSeconds,
  filmShots,
  forwardKinematics,
  generateActions,
  generateCharacterParts,
  generateMouth,
  getTrack,
  groundAt,
  hasError,
  hasFatal,
  hashString,
  headHeight,
  headParts,
  interpolateValue,
  key,
  lerpColor,
  lerpVec,
  lineOf,
  lipsyncLine,
  loadAssets,
  loadAudioAssets,
  mat2d_exports as mat2d,
  measureCharacter,
  mixColor,
  mixDuration,
  normalize2 as normalize,
  overlapDelays,
  overshootValue,
  parseHex,
  parseScreenplay,
  phonemeToViseme,
  resetPose,
  resolveProportions,
  resolveSwap,
  resolveViseme,
  retimeToAudio,
  samplePose,
  scaleColor,
  setKey,
  shadeOf,
  shotAt,
  slerpQuat,
  smoothClosed,
  smoothstep,
  solveChain,
  solveTwoBone,
  squashKeys,
  synthesizeDialogue,
  textToVisemeSequence,
  timelineChannels,
  trackDuration,
  trackValueAt,
  transform2D,
  transform3D,
  validateAssets,
  validateFilm,
  vec2_exports as vec2,
  visemesFromEnvelope,
  visemesFromPhonemes,
  visemesFromText,
  voicedSpans,
  wrapAngle
};
