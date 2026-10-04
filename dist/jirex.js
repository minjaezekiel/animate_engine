var jireX = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key2 of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key2) && key2 !== except)
          __defProp(to, key2, { get: () => from[key2], enumerable: !(desc = __getOwnPropDesc(from, key2)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/studio.js
  var studio_exports = {};
  __export(studio_exports, {
    Canvas2DBackend: () => Canvas2DBackend,
    FilmStudio: () => FilmStudio,
    MediaRecorderSink: () => MediaRecorderSink,
    MemorySink: () => MemorySink,
    WebCodecsSink: () => WebCodecsSink,
    audioBufferToWav: () => audioBufferToWav,
    compileFilm: () => compileFilm,
    parseScreenplay: () => parseScreenplay,
    preflight: () => preflight,
    renderOffline: () => renderOffline,
    retimeToAudio: () => retimeToAudio,
    trackValueAt: () => trackValueAt
  });

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
    let n = 0;
    return () => `${prefix}${++n}`;
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
      const mid = lo + hi >> 1;
      if (keys[mid].t <= t) lo = mid;
      else hi = mid;
    }
    const a = keys[lo], b = keys[lo + 1];
    const span = b.t - a.t;
    const u = span <= 0 ? 1 : (t - a.t) / span;
    return interpolateValue(track.type, a.v, b.v, easeProgress(a.ease, u, a.h));
  }
  var trackDuration = (track) => track.keys.length ? track.keys[track.keys.length - 1].t : 0;

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
  function inferType(v) {
    if (typeof v === "number") return "number";
    if (typeof v === "string") return v.startsWith("#") ? "color" : "discrete";
    if (Array.isArray(v)) return v.length === 4 ? "quat" : v.length === 3 ? "vec3" : "vec2";
    return "discrete";
  }

  // src/core/anim/Clip.js
  function createClip({ id, name = id, duration, loop = "once", tracks = [] }) {
    return {
      id,
      name,
      duration: duration ?? Math.max(0, ...tracks.map(trackDuration), 0),
      loop,
      // once | repeat | pingpong
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
    meta: ["title", "fps", "width", "height", "author", "description", "duration", "estimatedTiming"],
    character: ["palette", "voice", "parts", "mouth", "poses", "actions", "proportions", "generate"],
    part: ["id", "parent", "pivot", "shape", "fill", "stroke", "strokeWidth", "z", "at", "alpha"],
    scene: ["id", "background", "transitionIn", "transitionOut", "cast", "audio", "shots", "scenery", "palette"],
    shot: ["id", "duration", "camera", "actions", "dialogue", "subtitleStyle"],
    action: ["target", "do", "action", "pose", "to", "at", "for", "ease", "h", "loop", "speed", "value", "channel", "part"],
    dialogue: ["speaker", "at", "text", "audio", "voice", "lipsync", "subtitle", "gain", "duration"],
    camera: ["from", "to", "ease", "h", "at", "for"],
    audioCue: ["asset", "at", "gain", "fadeIn", "fadeOut", "offset", "duration", "bus"]
  };
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
    "rot"
  ];
  var TRANSITION_KINDS = ["fade", "crossfade", "none"];
  var DO_VERBS = ["play", "pose", "move", "set", "show", "hide"];

  // src/core/script/generate.js
  var DEFAULT_PROPORTIONS = {
    height: 180,
    // head-to-foot in scene units
    headRatio: 0.145,
    // head height as a fraction of total
    shoulderWidth: 0.26,
    hipWidth: 0.19,
    armThickness: 0.05,
    legThickness: 0.062,
    torsoTaper: 0.82
  };
  function generateCharacterParts(generate = {}, proportions = {}) {
    const p = { ...DEFAULT_PROPORTIONS, ...proportions };
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
    const skin = generate.skin ?? "skin";
    const cloth = generate.cloth ?? "coat";
    const trouser = generate.trouser ?? cloth;
    const hair = generate.hair ?? "hair";
    const half = shoulderW / 2;
    const hipHalf = hipW / 2;
    const taperHalf = half * p.torsoTaper;
    const parts = [
      // hips is the root: everything hangs off it, so a single move or a
      // bob on hips carries the whole body.
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
        shape: {
          kind: "path",
          d: `M${-hipHalf},0 L${hipHalf},0 L${taperHalf},${-torsoH} L${-taperHalf},${-torsoH} Z`
        },
        fill: cloth
      },
      {
        id: "neck",
        parent: "torso",
        pivot: [0, -torsoH],
        z: 14,
        shape: { kind: "rect", w: armW * 0.9, h: headR * 0.5, cx: true },
        fill: skin
      },
      {
        id: "head",
        parent: "neck",
        pivot: [0, 0],
        z: 20,
        shape: { kind: "ellipse", rx: headR * 0.86, ry: headR },
        fill: skin
      },
      {
        id: "hair",
        parent: "head",
        pivot: [0, 0],
        z: 21,
        shape: {
          kind: "path",
          d: `M${-headR * 0.9},${-headR * 0.1} A${headR * 0.9},${headR} 0 0 1 ${headR * 0.9},${-headR * 0.1} L${headR * 0.75},${-headR * 0.45} L${-headR * 0.8},${-headR * 0.4} Z`
        },
        fill: hair
      },
      {
        id: "eyeL",
        parent: "head",
        pivot: [-headR * 0.34, -headR * 0.08],
        z: 22,
        shape: { kind: "ellipse", rx: headR * 0.1, ry: headR * 0.13 },
        fill: "eye"
      },
      {
        id: "eyeR",
        parent: "head",
        pivot: [headR * 0.34, -headR * 0.08],
        z: 22,
        shape: { kind: "ellipse", rx: headR * 0.1, ry: headR * 0.13 },
        fill: "eye"
      }
    ];
    for (const side of ["L", "R"]) {
      const sign = side === "L" ? -1 : 1;
      const behind = side === "L";
      const armZ = behind ? 8 : 16;
      const legZ = behind ? 7 : 11;
      parts.push(
        {
          id: `arm${side}`,
          parent: "torso",
          pivot: [sign * taperHalf, -torsoH * 0.88],
          z: armZ,
          shape: { kind: "path", d: `M0,0 L${sign * armW * 0.15},${upperArmH}` },
          stroke: cloth,
          strokeWidth: armW
        },
        {
          id: `fore${side}`,
          parent: `arm${side}`,
          pivot: [sign * armW * 0.15, upperArmH],
          z: armZ,
          shape: { kind: "path", d: `M0,0 L${sign * armW * 0.1},${foreArmH}` },
          stroke: cloth,
          strokeWidth: armW * 0.88
        },
        {
          id: `hand${side}`,
          parent: `fore${side}`,
          pivot: [sign * armW * 0.1, foreArmH],
          z: armZ,
          shape: { kind: "ellipse", rx: armW * 0.52, ry: armW * 0.58 },
          fill: skin
        },
        {
          id: `thigh${side}`,
          parent: "hips",
          pivot: [sign * hipHalf * 0.62, legW * 0.3],
          z: legZ,
          shape: { kind: "path", d: `M0,0 L${sign * legW * 0.1},${thighH}` },
          stroke: trouser,
          strokeWidth: legW
        },
        {
          id: `shin${side}`,
          parent: `thigh${side}`,
          pivot: [sign * legW * 0.1, thighH],
          z: legZ,
          shape: { kind: "path", d: `M0,0 L0,${shinH}` },
          stroke: trouser,
          strokeWidth: legW * 0.86
        },
        {
          id: `foot${side}`,
          parent: `shin${side}`,
          pivot: [0, shinH],
          z: legZ,
          shape: { kind: "path", d: `M${-legW * 0.3},0 L${legW * 1.1},0` },
          stroke: "shoe",
          strokeWidth: legW * 0.72
        }
      );
    }
    return parts;
  }
  function generateMouth(proportions = {}) {
    const p = { ...DEFAULT_PROPORTIONS, ...proportions };
    const headR = p.height * p.headRatio / 2;
    const w = headR * 0.42;
    return {
      parent: "head",
      pivot: [0, headR * 0.42],
      strokeWidth: Math.max(2, headR * 0.1),
      shapes: {
        closed: { kind: "path", d: `M${-w},0 L${w},0` },
        mid: { kind: "path", d: `M${-w},0 Q0,${headR * 0.16} ${w},0 Z` },
        open: { kind: "path", d: `M${-w},0 Q0,${headR * 0.38} ${w},0 Q0,${headR * 0.08} ${-w},0 Z` },
        round: { kind: "path", d: `M${-w * 0.6},${-headR * 0.04} Q0,${headR * 0.3} ${w * 0.6},${-headR * 0.04} Q0,${headR * 0.02} ${-w * 0.6},${-headR * 0.04} Z` },
        wide: { kind: "path", d: `M${-w * 1.15},0 Q0,${headR * 0.14} ${w * 1.15},0 Q0,${headR * 0.02} ${-w * 1.15},0 Z` },
        teeth: { kind: "path", d: `M${-w * 0.9},0 L${w * 0.9},0 L${w * 0.85},${headR * 0.1} L${-w * 0.85},${headR * 0.1} Z` }
      }
    };
  }
  function generateActions(proportions = {}) {
    const p = { ...DEFAULT_PROPORTIONS, ...proportions };
    const bob = p.height * 0.016;
    return {
      breathe: {
        duration: 3.4,
        loop: "repeat",
        keys: { "torso.sy": [[0, 1], [1.7, 1.018], [3.4, 1]] }
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
          "foreL.rot": [[0, 0.22], [0.45, 0.42], [0.9, 0.22]],
          "foreR.rot": [[0, 0.42], [0.45, 0.22], [0.9, 0.42]],
          "torso.rot": [[0, 0.02], [0.45, -0.02], [0.9, 0.02]]
        }
      },
      blink: {
        duration: 4.2,
        loop: "repeat",
        keys: {
          "eyeL.sy": [[0, 1], [3.9, 1], [3.98, 0.08], [4.06, 1], [4.2, 1]],
          "eyeR.sy": [[0, 1], [3.9, 1], [3.98, 0.08], [4.06, 1], [4.2, 1]]
        }
      },
      idle: {
        duration: 5.6,
        loop: "repeat",
        keys: {
          "torso.rot": [[0, 8e-3], [2.8, -8e-3], [5.6, 8e-3]],
          "head.rot": [[0, -0.012], [2.1, 0.015], [4.2, -8e-3], [5.6, -0.012]],
          "armL.rot": [[0, 0.06], [2.8, 0.1], [5.6, 0.06]],
          "armR.rot": [[0, -0.06], [2.8, -0.1], [5.6, -0.06]]
        }
      }
    };
  }

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
    if (film.meta?.duration != null) {
      warn("meta.duration", "Duration is derived from shot durations; the declared value is ignored.");
    }
    const characters = film.characters ?? {};
    for (const [name, char] of Object.entries(characters)) {
      unknown(`characters.${name}`, char, KNOWN.character, warn);
      if (!char.parts?.length && !char.generate) {
        warn(`characters.${name}`, "No parts and no generate block; nothing will be drawn.");
      }
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
      const castNames = /* @__PURE__ */ new Set();
      for (const c of scene.cast ?? []) {
        const as = c.as ?? c.character;
        castNames.add(as);
        if (!characters[c.character]) {
          err(`${sp}.cast`, `Character "${c.character}" is not defined.`);
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
        for (const a of shot.actions ?? []) {
          unknown(`${hp}.actions`, a, KNOWN.action, warn);
          if (!DO_VERBS.includes(a.do)) {
            warn(`${hp}.actions`, `Unknown verb "${a.do}"; ignored. Known: ${DO_VERBS.join(", ")}.`);
          }
          if (a.target && !castNames.has(a.target)) {
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
      for (const cue of scene.audio ?? []) {
        unknown(`${sp}.audio`, cue, KNOWN.audioCue, warn);
        if (cue.asset && !film.assets?.[cue.asset]) {
          err(`${sp}.audio`, `Audio asset "${cue.asset}" is not declared.`);
        }
      }
    });
    return d;
  }
  function unknown(path, obj, known, warn) {
    for (const k of Object.keys(obj ?? {})) {
      if (!known.includes(k)) {
        warn(path ? `${path}.${k}` : k, `Unrecognized field "${k}"; ignored.`);
      }
    }
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
      let sum = 0, n = 0;
      for (let k = -smoothFrames; k <= smoothFrames; k++) {
        const j = f + k;
        if (j >= 0 && j < frames) {
          sum += raw[j];
          n++;
        }
      }
      out[f] = sum / n;
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
  function normalize(env) {
    let peak = 0;
    for (let i = 0; i < env.length; i++) if (env[i] > peak) peak = env[i];
    const out = new Float32Array(env.length);
    if (peak <= 0) return out;
    for (let i = 0; i < env.length; i++) out[i] = env[i] / peak;
    return out;
  }

  // src/core/audio/visemes.js
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
    const totalVoiced = spans.reduce((n, s) => n + (s.endFrame - s.startFrame + 1), 0);
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
    const env = normalize(envelope(samples, sampleRate, fps));
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
      version: FILM_VERSION
    };
    const scene = new Scene();
    const timeline = createTimeline({ fps: meta.fps });
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
      buildBackground(scene, timeline, sceneSpec, groupId, meta, assets, diagnostics);
      buildScenery(scene, sceneSpec, groupId, palettes, meta);
      const castMap = /* @__PURE__ */ new Map();
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
          entry,
          palettes,
          diagnostics
        });
        castMap.set(as, { rootId, char, charName });
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
            diagnostics
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
        shotTime = shotEnd;
        if (hi === shots.length - 1) filmTime = shotEnd;
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
  function buildBackground(scene, timeline, sceneSpec, groupId, meta, assets, diagnostics) {
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
        props: image ? { image, w: meta.width, h: meta.height, screenSpace: true } : { w: meta.width, h: meta.height, fill: bg.color ?? "#111317", screenSpace: true },
        z: -1e3
      }, groupId);
    } else if (bg.color || bg.gradient) {
      scene.add({
        id,
        kind: "rect",
        props: {
          w: meta.width,
          h: meta.height,
          fill: bg.color ?? "#111317",
          gradient: bg.gradient ?? null,
          screenSpace: true
        },
        z: -1e3
      }, groupId);
    }
  }
  function buildScenery(scene, sceneSpec, groupId, palettes, meta) {
    const items = sceneSpec.scenery ?? [];
    if (!items.length) return;
    const palette = palettes[sceneSpec.palette] ?? {};
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
        props: {
          ...shape,
          fill: colorOf(item.fill),
          stroke: colorOf(item.stroke),
          strokeWidth: item.strokeWidth,
          gradient: item.gradient ?? null,
          alpha: item.alpha ?? 1,
          screenSpace: item.screenSpace ?? false
        },
        z: item.z ?? -500
      }, groupId);
    });
  }
  function instantiateCharacter({ scene, char, charName, as, rootId, parentId, entry, palettes, diagnostics }) {
    const palette = { ...palettes[char.palette] ?? {}, ...entry.palette ?? {} };
    const colorOf = (c) => c == null ? null : palette[c] ?? c;
    const scale = entry.scale ?? 1;
    const at = entry.at ?? [0, 0];
    scene.add({
      id: rootId,
      kind: "group",
      transform: { x: at[0], y: at[1], sx: scale, sy: scale },
      props: { alpha: entry.alpha ?? 1 },
      z: entry.z ?? 0,
      tags: ["cast", charName]
    }, parentId);
    let parts = char.parts;
    if ((!parts || !parts.length) && char.generate) {
      parts = generateCharacterParts(char.generate, char.proportions);
    }
    const byId = new Map((parts ?? []).map((p) => [p.id, p]));
    const added = /* @__PURE__ */ new Set();
    const addPart = (part) => {
      if (!part || added.has(part.id)) return;
      if (part.parent && byId.has(part.parent)) addPart(byId.get(part.parent));
      const pivot = part.pivot ?? [0, 0];
      const nodeId = `${rootId}/${part.id}`;
      scene.add({
        id: nodeId,
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
        props: {
          ...shapeProps(part.shape),
          fill: colorOf(part.fill),
          stroke: colorOf(part.stroke),
          strokeWidth: part.strokeWidth,
          alpha: part.alpha ?? 1
        },
        z: part.z ?? 0
      }, part.parent ? `${rootId}/${part.parent}` : rootId);
      added.add(part.id);
    };
    for (const part of parts ?? []) addPart(part);
    const mouthSpec = char.mouth ?? (char.generate ? generateMouth(char.proportions) : null);
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
    } else if (char.parts?.length) {
      diagnostics.push({
        severity: "warning",
        path: `characters.${charName}.mouth`,
        message: "No mouth block; this character cannot be lipsynced."
      });
    }
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
    const write = (path, a, b) => {
      key(timeline, cameraId, path, moveStart, a, { type: "number", ease, h });
      key(timeline, cameraId, path, moveEnd, b, { type: "number" });
    };
    write("transform.x", centre.x + (start.x ?? 0), centre.x + (end.x ?? 0));
    write("transform.y", centre.y + (start.y ?? 0), centre.y + (end.y ?? 0));
    write("props.zoom", start.zoom ?? 1, end.zoom ?? 1);
    if (start.rot != null || end.rot != null) {
      write("transform.rot", start.rot ?? 0, end.rot ?? 0);
    }
    return { x: end.x ?? 0, y: end.y ?? 0, zoom: end.zoom ?? 1, rot: end.rot ?? 0 };
  }
  function buildAction({ scene, timeline, action, castMap, shotStart, shotEnd, sceneId, characters, diagnostics }) {
    const cast = castMap.get(action.target);
    if (!cast) return;
    const { rootId, charName } = cast;
    const char = characters[charName];
    const at = shotStart + (action.at ?? 0);
    const span = action.for ?? null;
    const ease = action.ease ?? "smooth";
    const h = action.h;
    switch (action.do) {
      case "pose": {
        const pose = char?.poses?.[action.pose];
        if (!pose) return;
        for (const [partId, channels] of Object.entries(pose)) {
          for (const [channel, value] of Object.entries(channels)) {
            const target = `${rootId}/${partId}`;
            const path = `transform.${channel}`;
            if (span != null) {
              const prev = lastValueBefore(timeline, target, path, at) ?? defaultChannel(channel);
              key(timeline, target, path, at, prev, { type: "number", ease, h });
              key(timeline, target, path, at + span, value, { type: "number" });
            } else {
              key(timeline, target, path, at, value, { type: "number", ease, h });
            }
          }
        }
        break;
      }
      case "move": {
        const to = action.to ?? [0, 0];
        const prevX = lastValueBefore(timeline, rootId, "transform.x", at) ?? scene.get(rootId)?.transform.x ?? 0;
        const prevY = lastValueBefore(timeline, rootId, "transform.y", at) ?? scene.get(rootId)?.transform.y ?? 0;
        const end = at + (span ?? shotEnd - at);
        key(timeline, rootId, "transform.x", at, prevX, { type: "number", ease, h });
        key(timeline, rootId, "transform.x", end, to[0], { type: "number" });
        key(timeline, rootId, "transform.y", at, prevY, { type: "number", ease, h });
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
          scopeId: rootId
        });
        break;
      }
      case "set": {
        if (!action.channel) return;
        const node = action.part ? `${rootId}/${action.part}` : rootId;
        key(timeline, node, action.channel, at, action.value, { ease, h });
        break;
      }
      case "show":
      case "hide": {
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
  function buildClipFromAction(clipId, name, spec) {
    const tracks = [];
    for (const [channelPath, keys] of Object.entries(spec.keys ?? {})) {
      const dot = channelPath.lastIndexOf(".");
      const partId = dot < 0 ? channelPath : channelPath.slice(0, dot);
      const channel = dot < 0 ? "y" : channelPath.slice(dot + 1);
      const track = createTrack({
        target: partId,
        path: channel.startsWith("props.") ? channel : `transform.${channel}`,
        type: "number"
      });
      for (const entry of keys) {
        const [t, v, ease, h] = Array.isArray(entry) ? entry : [entry.t, entry.v, entry.ease, entry.h];
        setKey(track, t, v, ease ?? "smooth", h);
      }
      tracks.push(track);
    }
    return createClip({ id: clipId, name, duration: spec.duration, loop: spec.loop ?? "repeat", tracks });
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
      palettes: { default: DEFAULT_PALETTE },
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
      message: `Parsed ${film.scenes.length} scene(s), ${speakerList.length} character(s), ${film.scenes.reduce((n, s) => n + s.shots.length, 0)} shot(s), ~${duration.toFixed(1)}s. Cast voices before rendering.`
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
  var DEFAULT_PALETTE = {
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
  function layoutCast(n, width, height) {
    const y = Math.round(height * 0.82);
    if (n <= 0) return [];
    if (n === 1) return [[Math.round(width * 0.5), y]];
    const out = [];
    for (let i = 0; i < n; i++) {
      const u = (i + 1) / (n + 1);
      out.push([Math.round(width * (0.22 + u * 0.56)), y]);
    }
    return out;
  }
  var normalizeSpeaker = (s) => s.trim().replace(/\s+/g, " ");
  var slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  var truncate = (s) => s.length > 44 ? `${s.slice(0, 44)}...` : s;

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

  // src/core/voice/providers/MicProvider.js
  var MicProvider = class {
    constructor({ decode, sampleRate = 48e3 } = {}) {
      this.id = "mic";
      this.label = "My voice (microphone)";
      this.source = "mic";
      this.decode = decode;
      this.sampleRate = sampleRate;
      this.takes = /* @__PURE__ */ new Map();
    }
    async available() {
      return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";
    }
    async listVoices() {
      const ids = this.takes.size ? [...this.takes.keys()] : ["myvoice"];
      return ids.map((id) => createVoice({ id, name: "My voice", source: "mic", provider: "mic" }));
    }
    /** Record one take; resolves to the decoded AudioBuffer. */
    async record({ voiceId = "myvoice", lineKey = "__default", stopSignal } = {}) {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks = [];
      const rec = new MediaRecorder(stream);
      rec.ondataavailable = (e) => {
        if (e.data?.size) chunks.push(e.data);
      };
      const stopped = new Promise((r) => {
        rec.onstop = r;
      });
      rec.start();
      if (stopSignal) {
        await new Promise((r) => {
          if (stopSignal.aborted) return r();
          stopSignal.addEventListener("abort", r, { once: true });
        });
      }
      rec.stop();
      await stopped;
      for (const t of stream.getTracks()) t.stop();
      const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
      const buffer = await this.decode(blob);
      this.addTake(voiceId, buffer, { lineKey });
      return buffer;
    }
    addTake(voiceId, audioBuffer, { lineKey = "__default" } = {}) {
      let m = this.takes.get(voiceId);
      if (!m) this.takes.set(voiceId, m = /* @__PURE__ */ new Map());
      m.set(lineKey, audioBuffer);
      return this;
    }
    async synthesize({ text, voice }) {
      const m = this.takes.get(voice?.id ?? "myvoice");
      if (!m) return null;
      const buffer = m.get(text) ?? m.get("__default") ?? [...m.values()][0];
      return buffer ? { audioBuffer: buffer, phonemes: null } : null;
    }
  };

  // src/core/voice/providers/UploadProvider.js
  var UploadProvider = class {
    constructor({ decode } = {}) {
      this.id = "upload";
      this.label = "Uploaded voice files";
      this.source = "upload";
      this.decode = decode;
      this.voices = /* @__PURE__ */ new Map();
    }
    async available() {
      return this.voices.size > 0;
    }
    async listVoices() {
      return [...this.voices.entries()].map(([id, v]) => createVoice({ id, name: v.name ?? id, source: "upload", provider: "upload" }));
    }
    /** Register a decoded clip for a voice, optionally bound to one line. */
    addClip(voiceId, audioBuffer, { name, lineKey = "__default" } = {}) {
      let v = this.voices.get(voiceId);
      if (!v) this.voices.set(voiceId, v = { name: name ?? voiceId, lines: /* @__PURE__ */ new Map() });
      v.lines.set(lineKey, audioBuffer);
      return this;
    }
    async addFile(voiceId, file, { name, lineKey } = {}) {
      if (!this.decode) throw new Error("UploadProvider: no decode function provided");
      return this.addClip(voiceId, await this.decode(file), { name, lineKey });
    }
    async synthesize({ text, voice }) {
      const v = this.voices.get(voice?.id);
      if (!v) return null;
      const buffer = v.lines.get(text) ?? v.lines.get("__default") ?? [...v.lines.values()][0];
      return buffer ? { audioBuffer: buffer, phonemes: null } : null;
    }
  };

  // src/core/voice/providers/TtsVitsProvider.js
  var DEFAULT_MODULE_URL = "https://cdn.jsdelivr.net/npm/@diffusionstudio/vits-web@1.0.3/dist/vits-web.js";
  var TtsVitsProvider = class {
    constructor({
      moduleUrl = DEFAULT_MODULE_URL,
      module = null,
      decode,
      sampleRate = 48e3,
      defaultVoiceId = "en_US-amy-medium",
      onProgress = null
    } = {}) {
      this.id = "tts";
      this.label = "Open-source TTS voices (Piper/VITS)";
      this.source = "tts";
      this.moduleUrl = moduleUrl;
      this._module = module;
      this.decode = decode;
      this.sampleRate = sampleRate;
      this.defaultVoiceId = defaultVoiceId;
      this.onProgress = onProgress;
      this._cache = /* @__PURE__ */ new Map();
      this._catalog = null;
    }
    async load() {
      if (this._module) return this._module;
      this._module = await import(
        /* @vite-ignore */
        this.moduleUrl
      );
      return this._module;
    }
    async available() {
      if (typeof Worker === "undefined" || typeof WebAssembly === "undefined") return false;
      try {
        await this.load();
        return true;
      } catch {
        return false;
      }
    }
    /**
     * Voices already downloaded to OPFS are listed first: picking one of
     * those costs nothing, while a fresh voice costs a 20-60MB fetch.
     */
    async listVoices() {
      const mod = await this.load();
      if (!this._catalog) {
        const all = await mod.voices().catch(() => []);
        let stored = [];
        try {
          stored = await mod.stored();
        } catch {
        }
        const storedSet = new Set(stored);
        this._catalog = all.map((v) => createVoice({
          id: v.key,
          name: `${v.name} (${v.language?.name_english ?? v.language?.code ?? "??"}, ${v.quality})`,
          source: "tts",
          provider: "tts",
          lang: v.language?.code ?? "en_US",
          tags: [v.quality, ...storedSet.has(v.key) ? ["downloaded"] : []]
        })).sort((a, b) => Number(b.tags.includes("downloaded")) - Number(a.tags.includes("downloaded")));
      }
      return this._catalog;
    }
    /** Pre-fetch a voice so a later render does not stall on the download. */
    async prefetch(voiceId) {
      const mod = await this.load();
      return mod.download(voiceId, this.onProgress ?? void 0);
    }
    async synthesize({ text, voice }) {
      if (!text) return null;
      const voiceId = voice?.id ?? this.defaultVoiceId;
      const cacheKey = `${voiceId}\0${text}`;
      if (this._cache.has(cacheKey)) {
        return { audioBuffer: this._cache.get(cacheKey), phonemes: null };
      }
      const mod = await this.load();
      const wav = await mod.predict({ text, voiceId }, this.onProgress ?? void 0);
      const audioBuffer = await this.decode(wav);
      this._cache.set(cacheKey, audioBuffer);
      return { audioBuffer, phonemes: null };
    }
  };

  // src/core/voice/providers/TtsHttpProvider.js
  var TtsHttpProvider = class {
    constructor({
      endpoint,
      voices = [],
      decode,
      headers = {},
      id = "http",
      label = "Remote TTS",
      parseResponse = null
    } = {}) {
      this.id = id;
      this.label = label;
      this.source = "tts";
      this.endpoint = endpoint;
      this.decode = decode;
      this.headers = headers;
      this._voices = voices;
      this.parseResponse = parseResponse;
    }
    async available() {
      return !!this.endpoint && typeof fetch !== "undefined";
    }
    async listVoices() {
      return this._voices.map((v) => typeof v === "string" ? createVoice({ id: v, name: v, source: "tts", provider: this.id }) : createVoice({ ...v, source: "tts", provider: this.id }));
    }
    async synthesize({ text, voice, lang }) {
      const res = await fetch(this.endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", ...this.headers },
        body: JSON.stringify({ text, voice: voice?.id, lang })
      });
      if (!res.ok) throw new Error(`TtsHttpProvider: ${res.status} ${res.statusText}`);
      if (this.parseResponse) {
        const { audio, phonemes } = await this.parseResponse(res);
        return { audioBuffer: await this.decode(audio), phonemes: phonemes ?? null };
      }
      const type = res.headers.get("content-type") ?? "";
      if (type.includes("application/json")) {
        const body = await res.json();
        const bytes = Uint8Array.from(atob(body.audio), (c) => c.charCodeAt(0));
        return {
          audioBuffer: await this.decode(bytes.buffer),
          phonemes: body.phonemes ?? null
        };
      }
      return { audioBuffer: await this.decode(await res.arrayBuffer()), phonemes: null };
    }
  };

  // src/audio/OfflineMixer.js
  async function renderMix({ cues, buffers, sampleRate = 48e3, durationSec = null }) {
    const assetDurations = {};
    for (const [id, buf] of Object.entries(buffers)) assetDurations[id] = buf?.duration ?? 0;
    const total = durationSec ?? mixDuration(cues, assetDurations, sampleRate);
    if (!(total > 0)) return null;
    const OfflineCtx = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
    if (!OfflineCtx) throw new Error("OfflineMixer: OfflineAudioContext unavailable");
    const ctx = new OfflineCtx(2, Math.ceil(total * sampleRate), sampleRate);
    const master = ctx.createGain();
    master.gain.value = 1;
    master.connect(ctx.destination);
    const buses = /* @__PURE__ */ new Map();
    const busFor = (name) => {
      let g = buses.get(name);
      if (!g) {
        g = ctx.createGain();
        g.gain.value = 1;
        g.connect(master);
        buses.set(name, g);
      }
      return g;
    };
    for (const cue of cues) {
      const buf = buffers[cue.assetId];
      if (!buf) continue;
      const w = cueSampleWindow(cue, sampleRate, buf.duration);
      if (w.lengthSamples <= 0) continue;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const gain = ctx.createGain();
      const at = w.startSample / sampleRate;
      const len = w.lengthSamples / sampleRate;
      const base = cue.gain ?? 1;
      gain.gain.setValueAtTime(w.fadeInSamples > 0 ? 0 : base, at);
      if (w.fadeInSamples > 0) {
        gain.gain.linearRampToValueAtTime(base, at + w.fadeInSamples / sampleRate);
      }
      if (w.fadeOutSamples > 0) {
        const fadeStart = at + len - w.fadeOutSamples / sampleRate;
        gain.gain.setValueAtTime(base, fadeStart);
        gain.gain.linearRampToValueAtTime(0, at + len);
      }
      src.connect(gain);
      gain.connect(busFor(cue.bus ?? "sfx"));
      src.start(at, w.srcOffset / sampleRate, len);
    }
    return ctx.startRendering();
  }
  async function decodeAudio(input, sampleRate = 48e3) {
    const bytes = input instanceof ArrayBuffer ? input : await input.arrayBuffer();
    const OfflineCtx = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
    const ctx = new OfflineCtx(1, 1, sampleRate);
    return ctx.decodeAudioData(bytes.slice(0));
  }

  // src/audio/wav.js
  function audioBufferToWav(buffer) {
    const channels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const frames = buffer.length;
    const blockAlign = channels * 2;
    const dataBytes = frames * blockAlign;
    const out = new ArrayBuffer(44 + dataBytes);
    const view = new DataView(out);
    const ascii = (off2, s) => {
      for (let i = 0; i < s.length; i++) view.setUint8(off2 + i, s.charCodeAt(i));
    };
    ascii(0, "RIFF");
    view.setUint32(4, 36 + dataBytes, true);
    ascii(8, "WAVE");
    ascii(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, channels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true);
    ascii(36, "data");
    view.setUint32(40, dataBytes, true);
    const planes = [];
    for (let c = 0; c < channels; c++) planes.push(buffer.getChannelData(c));
    let off = 44;
    for (let i = 0; i < frames; i++) {
      for (let c = 0; c < channels; c++) {
        const s = Math.max(-1, Math.min(1, planes[c][i]));
        view.setInt16(off, s < 0 ? s * 32768 : s * 32767, true);
        off += 2;
      }
    }
    return new Blob([out], { type: "audio/wav" });
  }

  // src/backends/canvas2d/shapes.js
  var pathCaches = /* @__PURE__ */ new WeakMap();
  function getPath(d, Path2DImpl) {
    let cache = pathCaches.get(Path2DImpl);
    if (!cache) pathCaches.set(Path2DImpl, cache = /* @__PURE__ */ new Map());
    let p = cache.get(d);
    if (!p) {
      p = new Path2DImpl(d);
      cache.set(d, p);
    }
    return p;
  }
  function resolveFill(ctx, node, w, h) {
    const g = node.props.gradient;
    if (!g) return node.props.fill;
    const [x0, y0, x1, y1] = g.from ?? [0, -h / 2, 0, h / 2];
    const grad = ctx.createLinearGradient(x0, y0, x1, y1);
    for (const [stop, color] of g.stops ?? []) grad.addColorStop(stop, color);
    return grad;
  }
  function drawShape(ctx, node, { Path2DImpl, alpha }) {
    const p = node.props;
    const a = alpha ?? p.alpha ?? 1;
    if (a <= 0) return;
    ctx.globalAlpha = a;
    switch (node.kind) {
      case "rect": {
        const w = p.w ?? 0, h = p.h ?? 0;
        const x = p.cx ? -w / 2 : 0, y = p.cy ? -h / 2 : 0;
        const fill = resolveFill(ctx, node, w, h);
        if (fill) {
          ctx.fillStyle = fill;
          ctx.fillRect(x, y, w, h);
        }
        if (p.stroke) {
          ctx.strokeStyle = p.stroke;
          ctx.lineWidth = p.strokeWidth ?? 1;
          ctx.strokeRect(x, y, w, h);
        }
        break;
      }
      case "ellipse": {
        ctx.beginPath();
        ctx.ellipse(0, 0, Math.abs(p.rx ?? 1), Math.abs(p.ry ?? 1), 0, 0, Math.PI * 2);
        if (p.fill) {
          ctx.fillStyle = p.fill;
          ctx.fill();
        }
        if (p.stroke) {
          ctx.strokeStyle = p.stroke;
          ctx.lineWidth = p.strokeWidth ?? 1;
          ctx.stroke();
        }
        break;
      }
      case "path": {
        if (!p.d) break;
        const path = getPath(p.d, Path2DImpl);
        if (p.fill) {
          ctx.fillStyle = p.fill;
          ctx.fill(path);
        }
        if (p.stroke) {
          ctx.strokeStyle = p.stroke;
          ctx.lineWidth = p.strokeWidth ?? 1;
          ctx.lineCap = p.lineCap ?? "round";
          ctx.lineJoin = p.lineJoin ?? "round";
          ctx.stroke(path);
        }
        break;
      }
      case "image": {
        const img = p.image;
        if (!img) break;
        const w = p.w ?? img.width ?? 0;
        const h = p.h ?? img.height ?? 0;
        ctx.drawImage(img, p.cx ? -w / 2 : 0, p.cy ? -h / 2 : 0, w, h);
        break;
      }
      case "text": {
        if (p.text == null) break;
        ctx.font = p.font ?? "16px sans-serif";
        ctx.textAlign = p.align ?? "center";
        ctx.textBaseline = p.baseline ?? "alphabetic";
        if (p.stroke) {
          ctx.strokeStyle = p.stroke;
          ctx.lineWidth = p.strokeWidth ?? 3;
          ctx.strokeText(p.text, 0, 0);
        }
        if (p.fill) {
          ctx.fillStyle = p.fill;
          ctx.fillText(p.text, 0, 0);
        }
        break;
      }
      case "group":
      case "bone":
      case "camera":
      default:
        break;
    }
    ctx.globalAlpha = 1;
  }

  // src/backends/canvas2d/RecordingContext.js
  var RecordingPath2D = class {
    constructor(d = "") {
      this.d = d;
    }
  };

  // src/backends/canvas2d/Canvas2DBackend.js
  var Canvas2DBackend = class {
    constructor({ ctx, canvas, width, height, Path2DImpl } = {}) {
      this.ctx = ctx ?? null;
      this._canvas = canvas ?? null;
      this.width = width ?? 1280;
      this.height = height ?? 720;
      this.Path2DImpl = Path2DImpl ?? (typeof Path2D !== "undefined" ? Path2D : RecordingPath2D);
      this.capabilities = { kind: "2d", postFX: false, skinning: false };
    }
    mount(host, { width, height } = {}) {
      if (width) this.width = width;
      if (height) this.height = height;
      if (!this.ctx) {
        if (host && typeof host.getContext === "function") {
          this._canvas = host;
        } else if (host && typeof document !== "undefined") {
          this._canvas = document.createElement("canvas");
          host.appendChild(this._canvas);
        }
        if (!this._canvas) throw new Error("Canvas2DBackend: no canvas to mount");
        this._canvas.width = this.width;
        this._canvas.height = this.height;
        this.ctx = this._canvas.getContext("2d");
      }
      return this;
    }
    unmount() {
    }
    resize(w, h) {
      this.width = w;
      this.height = h;
      if (this._canvas) {
        this._canvas.width = w;
        this._canvas.height = h;
      }
    }
    canvas() {
      return this._canvas;
    }
    /** No backend-side objects to reconcile: core nodes are read directly. */
    sync() {
      return this;
    }
    /**
     * Camera as an inverse transform. A 2D camera is not a new concept: it is
     * the view matrix, built so that the camera's position sits at the centre
     * of the frame and `zoom` scales about that centre.
     */
    viewMatrix(scene, cameraId) {
      const cam = cameraId ? scene.get(cameraId) : null;
      if (!cam) return identity();
      const zoom = cam.props.zoom ?? 1;
      const world = fromTransform({
        x: cam.transform.x ?? 0,
        y: cam.transform.y ?? 0,
        rot: cam.transform.rot ?? 0,
        sx: 1 / zoom,
        sy: 1 / zoom
      });
      const view = invert(world) ?? identity();
      return multiply(fromTransform({ x: this.width / 2, y: this.height / 2 }), view);
    }
    renderFrame(scene, cameraId) {
      const ctx = this.ctx;
      if (!ctx) throw new Error("Canvas2DBackend: not mounted");
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.width, this.height);
      const view = this.viewMatrix(scene, cameraId);
      for (const { node, alpha } of scene.drawOrder()) {
        if (node.kind === "camera") continue;
        const m = node.props.screenSpace ? scene.worldMatrix(node.id) : multiply(view, scene.worldMatrix(node.id));
        ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
        drawShape(ctx, node, { Path2DImpl: this.Path2DImpl, alpha });
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      return this;
    }
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

  // src/core/anim/Evaluator.js
  function samplePose(timeline, tSec) {
    const pose = /* @__PURE__ */ new Map();
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
      const local = clipLocalTime(clip, (tSec - start) * (inst.speed ?? 1));
      for (const track of clip.tracks) {
        const target = inst.scopeId ? `${inst.scopeId}/${track.target}` : track.target;
        write(target, track.path, trackValueAt(track, local));
      }
    }
    for (const track of timeline.tracks) {
      write(track.target, track.path, trackValueAt(track, tSec));
    }
    return pose;
  }
  function applyPose(scene, pose) {
    for (const [nodeId, channels] of pose) {
      const node = scene.get(nodeId);
      if (!node) continue;
      let transformTouched = false;
      for (const [path, value] of channels) {
        const dot = path.indexOf(".");
        if (dot < 0) {
          node[path] = value;
          continue;
        }
        const group = path.slice(0, dot);
        const field = path.slice(dot + 1);
        if (group === "transform") {
          node.transform[field] = value;
          transformTouched = true;
        } else if (group === "props") {
          node.props[field] = value;
        } else {
          (node[group] ??= {})[field] = value;
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
      const dot = path.indexOf(".");
      const group = dot < 0 ? null : path.slice(0, dot);
      const field = dot < 0 ? path : path.slice(dot + 1);
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
        const dot = path.indexOf(".");
        if (dot < 0) {
          node[path] = value;
          continue;
        }
        const group = path.slice(0, dot);
        const field = path.slice(dot + 1);
        if (group === "transform") node.transform[field] = value;
        else if (group === "props") node.props[field] = value;
        else if (node[group]) node[group][field] = value;
      }
      scene.invalidate(nodeId);
    }
    return scene;
  }

  // src/render/OfflineRenderer.js
  var baselines = /* @__PURE__ */ new WeakMap();
  function baselineFor(scene, timeline) {
    let baseline = baselines.get(timeline);
    if (!baseline) {
      baseline = createPoseBaseline(scene, timeline);
      baselines.set(timeline, baseline);
    }
    return baseline;
  }
  async function renderOffline({
    scene,
    timeline,
    backend,
    cameraId,
    fps = 24,
    width,
    height,
    durationSec,
    sink,
    physics = null,
    onProgress = null,
    signal = null,
    beforeFrame = null
  }) {
    const clock = new FrameClock(fps);
    const total = clock.count(durationSec ?? timeline.duration);
    const baseline = baselineFor(scene, timeline);
    await sink.configure({
      width,
      height,
      fps,
      totalFrames: total,
      canvas: backend.canvas?.() ?? null,
      audioBuffer: sink.audioBuffer ?? null
    });
    const t0 = Date.now();
    try {
      for (let n = 0; n < total; n++) {
        if (signal?.aborted) throw new Error("render aborted");
        const t = clock.timeOf(n);
        if (physics) physics.stepTo(t);
        resetPose(scene, baseline);
        applyPose(scene, samplePose(timeline, t));
        if (beforeFrame) beforeFrame(t, n, scene);
        backend.sync(scene);
        backend.renderFrame(scene, cameraId);
        await sink.writeFrame(backend.canvas?.() ?? null, n, t);
        if (onProgress && (n % 12 === 0 || n === total - 1)) {
          onProgress({
            frame: n + 1,
            total,
            tSec: t,
            elapsedSec: (Date.now() - t0) / 1e3,
            msPerFrame: (Date.now() - t0) / (n + 1)
          });
        }
      }
    } catch (err) {
      sink.abort();
      throw err;
    } finally {
      resetPose(scene, baseline);
    }
    return sink.finish();
  }
  async function preflight({
    scene,
    timeline,
    backend,
    cameraId,
    fps = 24,
    frames = 48
  }) {
    const clock = new FrameClock(fps);
    const baseline = baselineFor(scene, timeline);
    const samples = [];
    for (let n = 0; n < frames; n++) {
      const t = clock.timeOf(n);
      const start = performance.now();
      resetPose(scene, baseline);
      applyPose(scene, samplePose(timeline, t));
      backend.sync(scene);
      backend.renderFrame(scene, cameraId);
      samples.push(performance.now() - start);
    }
    resetPose(scene, baseline);
    samples.sort((a, b) => a - b);
    const at = (q) => samples[Math.min(samples.length - 1, Math.floor(q * samples.length))];
    return {
      frames,
      medianMs: +at(0.5).toFixed(2),
      p95Ms: +at(0.95).toFixed(2),
      ceilingMs: +(1e3 / fps).toFixed(2),
      withinBudget: at(0.95) < 1e3 / fps * 0.6
      // leave room for encode
    };
  }

  // src/render/sinks/FrameSink.js
  var FrameSink = class {
    async configure() {
      throw new Error("FrameSink.configure not implemented");
    }
    async writeFrame() {
      throw new Error("FrameSink.writeFrame not implemented");
    }
    async finish() {
      throw new Error("FrameSink.finish not implemented");
    }
    abort() {
    }
    static async available() {
      return true;
    }
  };

  // src/render/sinks/MediaRecorderSink.js
  var MediaRecorderSink = class _MediaRecorderSink extends FrameSink {
    constructor({ mimeType = null, videoBitsPerSecond = 6e6, audioContext = null } = {}) {
      super();
      this.preferredMime = mimeType;
      this.videoBitsPerSecond = videoBitsPerSecond;
      this.audioContext = audioContext;
      this.chunks = [];
      this._t0 = 0;
    }
    static async available() {
      return typeof MediaRecorder !== "undefined" && typeof HTMLCanvasElement !== "undefined" && typeof HTMLCanvasElement.prototype.captureStream === "function";
    }
    static pickMime(preferred) {
      const candidates = [
        preferred,
        "video/webm;codecs=vp9,opus",
        "video/webm;codecs=vp9",
        "video/webm;codecs=vp8,opus",
        "video/webm;codecs=vp8",
        "video/webm"
      ].filter(Boolean);
      for (const m of candidates) {
        if (MediaRecorder.isTypeSupported(m)) return m;
      }
      return "";
    }
    async configure({ fps, totalFrames, canvas, audioBuffer = null }) {
      if (!canvas) throw new Error("MediaRecorderSink: needs the live canvas");
      this.fps = fps;
      this.totalFrames = totalFrames;
      this.frameMs = 1e3 / fps;
      const stream = canvas.captureStream(0);
      this.videoTrack = stream.getVideoTracks()[0];
      if (!this.videoTrack?.requestFrame) {
        throw new Error("MediaRecorderSink: captureStream track has no requestFrame()");
      }
      if (audioBuffer) {
        const ac = this.audioContext ?? new (globalThis.AudioContext || globalThis.webkitAudioContext)({
          sampleRate: audioBuffer.sampleRate
        });
        this._ownsContext = !this.audioContext;
        this.ac = ac;
        if (ac.state === "suspended") await ac.resume();
        const dest = ac.createMediaStreamDestination();
        const src = ac.createBufferSource();
        src.buffer = audioBuffer;
        src.connect(dest);
        this._audioSource = src;
        for (const t of dest.stream.getAudioTracks()) stream.addTrack(t);
      }
      const mimeType = _MediaRecorderSink.pickMime(this.preferredMime);
      this.recorder = new MediaRecorder(stream, {
        ...mimeType ? { mimeType } : {},
        videoBitsPerSecond: this.videoBitsPerSecond
      });
      this.mimeType = mimeType || "video/webm";
      this.chunks = [];
      this.recorder.ondataavailable = (e) => {
        if (e.data?.size) this.chunks.push(e.data);
      };
      this.recorder.start();
      this._t0 = performance.now();
      this._audioSource?.start();
      return this;
    }
    async writeFrame(canvas, frameIndex) {
      const due = this._t0 + frameIndex * this.frameMs;
      let late = false;
      for (; ; ) {
        const remaining = due - performance.now();
        if (remaining <= 0) {
          late = remaining < -this.frameMs;
          break;
        }
        await new Promise((r) => setTimeout(r, remaining > 4 ? remaining - 2 : 0));
      }
      if (late) this.droppedBudget = (this.droppedBudget ?? 0) + 1;
      this.videoTrack.requestFrame();
    }
    async finish() {
      const due = this._t0 + this.totalFrames * this.frameMs;
      for (; ; ) {
        const remaining = due - performance.now();
        if (remaining <= 0) break;
        await new Promise((r) => setTimeout(r, Math.min(remaining, 20)));
      }
      const stopped = new Promise((r) => {
        this.recorder.onstop = r;
      });
      this.recorder.stop();
      await stopped;
      try {
        this._audioSource?.stop();
      } catch {
      }
      if (this._ownsContext) {
        try {
          await this.ac.close();
        } catch {
        }
      }
      return new Blob(this.chunks, { type: this.mimeType });
    }
    abort() {
      try {
        this.recorder?.stop();
      } catch {
      }
      try {
        this._audioSource?.stop();
      } catch {
      }
    }
  };

  // src/render/sinks/WebCodecsSink.js
  var WebCodecsSink = class _WebCodecsSink extends FrameSink {
    constructor({ muxerFactory = null, codec = null, bitrate = 6e6, keyFrameEvery = 48 } = {}) {
      super();
      this.muxerFactory = muxerFactory;
      this.codec = codec;
      this.bitrate = bitrate;
      this.keyFrameEvery = keyFrameEvery;
    }
    static async available({ muxerFactory = null } = {}) {
      if (typeof VideoEncoder === "undefined" || typeof VideoFrame === "undefined") return false;
      if (!muxerFactory) return false;
      return true;
    }
    /** First codec string the platform will actually accept at this size. */
    static async pickCodec(width, height, preferred) {
      const candidates = [preferred, "avc1.4d0028", "avc1.42001f", "vp09.00.10.08", "vp8"].filter(Boolean);
      for (const codec of candidates) {
        try {
          const { supported } = await VideoEncoder.isConfigSupported({
            codec,
            width,
            height,
            bitrate: 6e6,
            framerate: 24
          });
          if (supported) return codec;
        } catch {
        }
      }
      return null;
    }
    async configure({ width, height, fps, totalFrames, audioBuffer = null }) {
      if (!this.muxerFactory) throw new Error("WebCodecsSink: no muxer provided");
      this.fps = fps;
      this.totalFrames = totalFrames;
      this.width = width;
      this.height = height;
      const codec = await _WebCodecsSink.pickCodec(width, height, this.codec);
      if (!codec) throw new Error("WebCodecsSink: no supported video codec");
      this.chosenCodec = codec;
      this.muxer = await this.muxerFactory({
        width,
        height,
        fps,
        codec,
        audio: audioBuffer ? { sampleRate: audioBuffer.sampleRate, channels: audioBuffer.numberOfChannels } : null
      });
      this.encoder = new VideoEncoder({
        output: (chunk, meta) => this.muxer.addVideoChunk(chunk, meta),
        error: (e) => {
          this._error = e;
        }
      });
      this.encoder.configure({
        codec,
        width,
        height,
        bitrate: this.bitrate,
        framerate: fps,
        latencyMode: "quality"
      });
      if (audioBuffer) await this._encodeAudio(audioBuffer);
      return this;
    }
    /**
     * Audio is encoded up front from the pre-rendered mix. It is already a
     * complete, sample-exact buffer, so there is nothing to interleave --
     * the muxer orders by timestamp.
     */
    async _encodeAudio(buffer) {
      if (typeof AudioEncoder === "undefined" || !this.muxer.addAudioChunk) return;
      const channels = buffer.numberOfChannels;
      const sampleRate = buffer.sampleRate;
      const encoder = new AudioEncoder({
        output: (chunk, meta) => this.muxer.addAudioChunk(chunk, meta),
        error: (e) => {
          this._error = e;
        }
      });
      let config = { codec: "mp4a.40.2", sampleRate, numberOfChannels: channels, bitrate: 128e3 };
      const ok = await AudioEncoder.isConfigSupported(config).catch(() => ({ supported: false }));
      if (!ok.supported) {
        config = { codec: "opus", sampleRate, numberOfChannels: channels, bitrate: 128e3 };
        const ok2 = await AudioEncoder.isConfigSupported(config).catch(() => ({ supported: false }));
        if (!ok2.supported) {
          encoder.close();
          return;
        }
      }
      encoder.configure(config);
      const CH = 1024;
      const planes = [];
      for (let c = 0; c < channels; c++) planes.push(buffer.getChannelData(c));
      for (let offset = 0; offset < buffer.length; offset += CH) {
        const n = Math.min(CH, buffer.length - offset);
        const inter = new Float32Array(n * channels);
        for (let i = 0; i < n; i++) {
          for (let c = 0; c < channels; c++) inter[i * channels + c] = planes[c][offset + i];
        }
        const data = new AudioData({
          format: "f32",
          sampleRate,
          numberOfFrames: n,
          numberOfChannels: channels,
          timestamp: Math.round(offset / sampleRate * 1e6),
          data: inter
        });
        encoder.encode(data);
        data.close();
      }
      await encoder.flush();
      encoder.close();
    }
    async writeFrame(canvas, frameIndex) {
      if (this._error) throw this._error;
      while (this.encoder.encodeQueueSize > 8) {
        await new Promise((r) => setTimeout(r, 1));
      }
      const frame = new VideoFrame(canvas, {
        timestamp: Math.round(frameIndex / this.fps * 1e6),
        duration: Math.round(1e6 / this.fps)
      });
      this.encoder.encode(frame, { keyFrame: frameIndex % this.keyFrameEvery === 0 });
      frame.close();
    }
    async finish() {
      await this.encoder.flush();
      this.encoder.close();
      return this.muxer.finalize();
    }
    abort() {
      try {
        this.encoder?.close();
      } catch {
      }
    }
  };

  // src/render/sinks/MemorySink.js
  var MemorySink = class extends FrameSink {
    constructor({ digest = null } = {}) {
      super();
      this.frames = [];
      this.digest = digest;
      this.config = null;
    }
    async configure(config) {
      this.config = config;
      this.frames = [];
    }
    async writeFrame(canvas, frameIndex, tSec) {
      this.frames.push({
        frameIndex,
        tSec,
        ...this.digest ? { digest: this.digest(canvas, frameIndex) } : {}
      });
    }
    async finish() {
      return { frames: this.frames, count: this.frames.length, config: this.config };
    }
  };

  // src/studio.js
  var SAMPLE_RATE = 48e3;
  var FilmStudio = class {
    constructor({ sampleRate = SAMPLE_RATE, muxerFactory = null, ttsModuleUrl, onLog = null } = {}) {
      this.sampleRate = sampleRate;
      this.muxerFactory = muxerFactory;
      this.onLog = onLog;
      const decode = (input) => decodeAudio(input, sampleRate);
      this.voices = new VoiceRegistry();
      this.mic = new MicProvider({ decode, sampleRate });
      this.upload = new UploadProvider({ decode });
      this.tts = new TtsVitsProvider({
        decode,
        sampleRate,
        ...ttsModuleUrl ? { moduleUrl: ttsModuleUrl } : {},
        onProgress: (p) => this.log(`voice model: ${describeProgress(p)}`)
      });
      this.voices.register(this.tts);
      this.voices.register(this.upload);
      this.voices.register(this.mic);
      this.decode = decode;
    }
    log(msg) {
      this.onLog?.(msg);
    }
    /** Register a remote/cloning TTS endpoint as an additional provider. */
    useRemoteTts({ endpoint, voices = [], headers, id = "remote", label }) {
      this.voices.register(new TtsHttpProvider({
        endpoint,
        voices,
        headers,
        id,
        label,
        decode: this.decode
      }));
      return this;
    }
    parseScript(text, opts) {
      return parseScreenplay(text, opts);
    }
    /**
     * Everything up to (but not including) pixels: compile, voice, mix,
     * lipsync. Separated from the render so a caller can preview, retime, or
     * inspect diagnostics before committing to a two-minute encode.
     */
    async prepare(film, { assets = {}, audioBuffers = {}, onProgress = null, retime = true } = {}) {
      let working = film;
      const notes = [];
      let first = compileFilm(working, { assets });
      if (!first.timeline) return { ...first, audio: null };
      const voiced = await synthesizeDialogue({
        lipsyncJobs: first.lipsyncJobs,
        registry: this.voices,
        buffers: { ...audioBuffers },
        fps: first.meta.fps,
        sampleRate: this.sampleRate,
        onProgress: (p) => {
          this.log(`voicing ${p.done}/${p.total}: ${String(p.text ?? "").slice(0, 44)}`);
          onProgress?.({ stage: "voice", ...p });
        }
      });
      notes.push(...voiced.diagnostics);
      if (retime) {
        const durations = {};
        for (const job of first.lipsyncJobs) {
          const cue = voiced.cues.find((c) => c.id === `${job.nodeId}@${job.at}`);
          const buf = cue ? voiced.buffers[cue.assetId] : null;
          if (buf && job.text) durations[job.text] = buf.duration;
        }
        const estimated = film.meta?.estimatedTiming === true;
        const { film: retimed, changed, changes } = retimeToAudio(working, durations, { shrink: estimated });
        if (changed > 0) {
          this.log(`extended ${changed} shot(s) to fit the recorded audio: ` + changes.map((c) => `${c.shot ?? "?"} ${c.from}s->${c.to}s`).join(", "));
          working = retimed;
          first = compileFilm(working, { assets });
          const again = await synthesizeDialogue({
            lipsyncJobs: first.lipsyncJobs,
            registry: this.voices,
            buffers: voiced.buffers,
            fps: first.meta.fps,
            sampleRate: this.sampleRate
          });
          voiced.cues = again.cues;
          voiced.tracks = again.tracks;
          voiced.buffers = again.buffers;
        }
      }
      for (const track of voiced.tracks) first.timeline.tracks.push(track);
      attachSubtitles(first, voiced);
      const cues = [...first.audioCues, ...voiced.cues];
      onProgress?.({ stage: "mix" });
      this.log("rendering audio mix offline");
      const mix = cues.length ? await renderMix({
        cues,
        buffers: voiced.buffers,
        sampleRate: this.sampleRate,
        durationSec: first.meta.duration
      }) : null;
      return {
        ...first,
        film: working,
        diagnostics: [...first.diagnostics, ...notes],
        audio: mix,
        audioBuffers: voiced.buffers,
        cues
      };
    }
    /**
     * Render a prepared film to video.
     *
     * Sink selection is the fallback ladder in code: WebCodecs when a muxer
     * is available (exact timestamps, faster than real time), otherwise the
     * paced MediaRecorder path, which is slower but needs no dependency and
     * still carries audio.
     */
    async render(prepared, {
      canvas,
      width,
      height,
      fps,
      sink = null,
      onProgress = null,
      signal = null,
      preferWebCodecs = true
    } = {}) {
      const meta = prepared.meta;
      const w = width ?? meta.width;
      const h = height ?? meta.height;
      const rate = fps ?? meta.fps;
      const backend = new Canvas2DBackend({ width: w, height: h });
      backend.mount(canvas, { width: w, height: h });
      const pf = await preflight({
        scene: prepared.scene,
        timeline: prepared.timeline,
        backend,
        cameraId: prepared.cameraId,
        fps: rate
      });
      this.log(`preflight: median ${pf.medianMs}ms, p95 ${pf.p95Ms}ms per frame (ceiling ${pf.ceilingMs}ms)${pf.withinBudget ? "" : " -- OVER BUDGET"}`);
      let chosen = sink;
      if (!chosen) {
        const canWebCodecs = preferWebCodecs && await WebCodecsSink.available({ muxerFactory: this.muxerFactory });
        if (canWebCodecs) {
          chosen = new WebCodecsSink({ muxerFactory: this.muxerFactory });
          this.log("encoder: WebCodecs (exact timestamps, faster than real time)");
        } else if (await MediaRecorderSink.available()) {
          chosen = new MediaRecorderSink();
          this.log(`encoder: paced MediaRecorder -- this takes about ${Math.round(meta.duration)}s of real time. Keep this tab visible.`);
        } else {
          throw new Error("No video encoder available in this browser");
        }
      }
      chosen.audioBuffer = prepared.audio ?? null;
      const wakeLock = await requestWakeLock(this.log.bind(this));
      try {
        const blob = await renderOffline({
          scene: prepared.scene,
          timeline: prepared.timeline,
          backend,
          cameraId: prepared.cameraId,
          fps: rate,
          width: w,
          height: h,
          durationSec: meta.duration,
          sink: chosen,
          signal,
          beforeFrame: (t) => applyVisemeShapes(prepared.scene),
          onProgress: (p) => {
            onProgress?.({ stage: "render", ...p, preflight: pf });
          }
        });
        return { blob, preflight: pf, meta, sink: chosen.constructor.name };
      } finally {
        wakeLock?.release?.().catch(() => {
        });
      }
    }
    /** Compile + prepare + render in one call. */
    async produce(film, { assets = {}, audioBuffers = {}, canvas, onProgress, ...rest } = {}) {
      const prepared = await this.prepare(film, { assets, audioBuffers, onProgress });
      if (!prepared.timeline) {
        throw new Error("Film did not compile: " + prepared.diagnostics.filter((d) => d.severity === "fatal").map((d) => d.message).join("; "));
      }
      const out = await this.render(prepared, { canvas, onProgress, ...rest });
      return { ...out, prepared };
    }
    /** Audio-only export: the fallback rung when muxing is unavailable. */
    audioAsWav(prepared) {
      return prepared.audio ? audioBufferToWav(prepared.audio) : null;
    }
  };
  function applyVisemeShapes(scene) {
    for (const node of scene.byId.values()) {
      const shapes = node.props.visemeShapes;
      if (!shapes) continue;
      const name = resolveViseme(node.props.viseme ?? "closed", shapes);
      const shape = shapes[name];
      if (!shape) continue;
      if (node._shapeName === name) continue;
      node._shapeName = name;
      node.kind = shape.kind ?? "path";
      for (const [k, v] of Object.entries(shape)) {
        if (k !== "kind") node.props[k] = v;
      }
    }
  }
  function attachSubtitles(compiled, voiced) {
    const jobs = compiled.lipsyncJobs.filter((j) => j.subtitle && j.text);
    if (!jobs.length) return;
    const track = {
      target: "__subtitle",
      path: "props.text",
      type: "discrete",
      keys: [{ t: 0, v: "", ease: "step" }]
    };
    for (const job of jobs) {
      const cue = voiced.cues.find((c) => c.id === `${job.nodeId}@${job.at}`);
      const buf = cue ? voiced.buffers[cue.assetId] : null;
      const dur = buf?.duration ?? job.durationSec ?? estimateFallback(job.text);
      track.keys.push({ t: job.at, v: job.text, ease: "step" });
      track.keys.push({ t: job.at + dur + 0.25, v: "", ease: "step" });
    }
    track.keys.sort((a, b) => a.t - b.t);
    compiled.timeline.tracks.push(track);
  }
  var estimateFallback = (text) => Math.max(1.4, String(text).trim().split(/\s+/).length / 2.6);
  async function requestWakeLock(log) {
    try {
      if (navigator.wakeLock?.request) {
        const lock = await navigator.wakeLock.request("screen");
        return lock;
      }
    } catch {
      log("wake lock unavailable; keep the tab visible during render");
    }
    return null;
  }
  var describeProgress = (p) => {
    if (!p) return "";
    if (p.total) return `${Math.round(p.loaded / p.total * 100)}%`;
    return p.url ? String(p.url).split("/").pop() : "";
  };
  return __toCommonJS(studio_exports);
})();
