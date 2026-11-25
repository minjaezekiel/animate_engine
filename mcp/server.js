#!/usr/bin/env node
/**
 * animateEngine MCP server.
 *
 * The engine runs in the browser (WebGL/DOM), so this server can't render
 * headless. Instead it opens a WebSocket that a live browser session connects
 * to (open the app with ?mcp=ws://localhost:8787), then relays MCP tool calls
 * to that session's engine.runCommands() and returns the results.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { WebSocketServer } from 'ws';
import { z } from 'zod';
import { writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');

const WS_PORT = Number(process.env.ANIMATE_ENGINE_WS_PORT || 8787);

// ---- Bridge to the browser session ----
const bridge = {
  socket: null,
  seq: 0,
  pending: new Map(),
};

const wss = new WebSocketServer({ port: WS_PORT });
wss.on('connection', (ws) => {
  bridge.socket = ws;
  console.error(`[animate-engine-mcp] browser connected on ws://localhost:${WS_PORT}`);
  ws.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data.toString()); } catch { return; }
    if (msg.type === 'result' && bridge.pending.has(msg.id)) {
      bridge.pending.get(msg.id)(msg.results);
      bridge.pending.delete(msg.id);
    }
  });
  ws.on('close', () => { if (bridge.socket === ws) bridge.socket = null; });
});

// Send a command batch to the browser and await its per-command results.
function runCommands(commands, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    if (!bridge.socket) {
      reject(new Error(`No browser connected. Open the app with ?mcp=ws://localhost:${WS_PORT}`));
      return;
    }
    const id = ++bridge.seq;
    const timer = setTimeout(() => {
      bridge.pending.delete(id);
      reject(new Error('Timed out waiting for the browser'));
    }, timeoutMs);
    bridge.pending.set(id, (results) => { clearTimeout(timer); resolve(results); });
    bridge.socket.send(JSON.stringify({ type: 'commands', id, commands }));
  });
}

/**
 * A tool result, as compactly as it can be said.
 *
 * `JSON.stringify(value, null, 2)` was costing roughly 40% more tokens than
 * the same data compact, for nothing: two spaces of indentation per level and
 * a newline per field, on documents that are nested four deep. Nobody reads
 * these by eye, and the model does not parse indented JSON any better than
 * compact JSON.
 *
 * Plain text wins where it is available -- `formatDigest` output is about a
 * fifth of the same data as JSON -- so a caller may pass a string and it is
 * returned as-is.
 */
const asText = (value) => ({
    content: [{ type: 'text',
                text: typeof value === 'string' ? value : JSON.stringify(value) }],
});

/**
 * Run one of the repo's own scripts and return what it printed.
 *
 * The 3D pipeline is a headless-Chrome job behind a render lock, not a
 * command the editor session can run -- so unlike every tool above it, these
 * do not go through the WebSocket bridge to a live browser. They start the
 * same script a person would, which also means they take the same lock and
 * cannot collide with a render already in flight.
 */
/**
 * `args` as well as `env`, because not every script reads its input from the
 * environment: the render scripts do (FILM=, OUT=, WIDTH=) and `asset.mjs`
 * takes a subcommand, which is the right shape for something a person also
 * types at a prompt.
 */
function runScript(script, env = {}, { timeoutMs = 2_400_000, args = [] } = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [join(REPO, 'scripts', script), ...args], {
            cwd: REPO,
            env: { ...process.env, ...Object.fromEntries(
                Object.entries(env).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)])) },
        });
        let out = '';
        let err = '';
        const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('timed out')); },
                                 timeoutMs);
        child.stdout.on('data', (d) => { out += d; });
        child.stderr.on('data', (d) => { err += d; });
        child.on('close', (code) => {
            clearTimeout(timer);
            // A non-zero exit from `check` means FINDINGS, not a crash, and
            // the findings are the answer -- so stdout is returned either
            // way and the code is reported rather than thrown.
            resolve({ code, out: out.replace(/\r/g, '\n'), err: err.slice(0, 2000) });
        });
        child.on('error', reject);
    });
}

/** Strip the per-frame progress spam a script writes for a human watching. */
const quietLines = (text) => text.split('\n')
    .filter((l) => l.trim() && !/^\s*(voice model:|frame \d+\/)/.test(l))
    .map((l) => l.trimEnd())
    .join('\n');
const runOne = (op, args) => runCommands([{ op, args }]);

// ---- MCP server + tools ----
const server = new McpServer({ name: 'animate-engine', version: '1.0.0' });

const vec3 = z.array(z.number()).length(3);

server.tool(
  'run_script',
  'Run a batch of raw engine commands ([{op, args}]). Ops: createObject, createLight, setMaterial, resize, transform, subdivide, createAnimation, selectAnimation, addKeyframe, setInterpolation, toggleSkeleton, listBones, listMorphs, ikReach, setMorph, setTexture, setEnvironment, createCamera, listCameras, activateCamera, setCameraProps, setPostFX, play, pause, stop, setTime, getScene, loadScene, clear, exportVideo, exportGif, exportSequence, loadFilm, checkFilm, renderFilm, readFilmChunk.',
  { commands: z.array(z.object({ op: z.string(), args: z.record(z.any()).optional() })) },
  async ({ commands }) => asText(await runCommands(commands))
);

server.tool(
  'create_object',
  'Add a primitive (cube, sphere, cylinder, cone, torus, tetrahedron). `dims` takes the geometry parameters by name (width/height/depth, radius, tube, ...). Returns its uuid and the dimensions it was built with.',
  {
    kind: z.enum(['cube', 'sphere', 'cylinder', 'cone', 'torus', 'tetrahedron']),
    name: z.string().optional(),
    position: vec3.optional(),
    color: z.union([z.string(), z.number()]).optional(),
    dims: z.record(z.number()).optional(),
    material: z.record(z.any()).optional(),
  },
  async (args) => asText(await runOne('createObject', args))
);

server.tool(
  'create_animation',
  'Create and select a named animation timeline.',
  { name: z.string(), duration: z.number().default(5), loop: z.enum(['once', 'repeat']).default('once') },
  async (args) => asText(await runOne('createAnimation', args))
);

server.tool(
  'add_keyframe',
  'Add a keyframe for an object (by uuid) at a given time on the selected animation.',
  { uuid: z.string(), time: z.number(), position: vec3.optional(), rotation: vec3.optional(), scale: vec3.optional() },
  async (args) => asText(await runOne('addKeyframe', args))
);

server.tool(
  'play',
  'Play the selected animation in the browser.',
  {},
  async () => asText(await runOne('play', {}))
);

server.tool(
  'get_scene',
  'Return the current project (objects, lights, animations) as JSON.',
  {},
  async () => asText((await runOne('getScene', {}))[0]?.value)
);

// ---- 2D film pipeline ----
// The tools above drive the 3D editor. These two reach the 2D film pipeline,
// which is what produces a finished film from a single declarative document.

server.tool(
  'load_film',
  'Load a `jirex.film/1` document into the browser and compile it. Returns the derived duration, frame count and any diagnostics (including staging), without rendering.',
  { film: z.record(z.any()).optional(), url: z.string().optional() },
  async (args) => asText((await runCommands([{ op: 'loadFilm', args }], 120000))[0]?.value)
);

server.tool(
  'check_film',
  'Compile a film and report every problem without rendering it: schema errors, undeclared assets, and staging — a character outside the camera frame, or feet off the declared ground. Cheap, and the way to catch a bad shot before spending a render on it.',
  { film: z.record(z.any()).optional(), url: z.string().optional() },
  async (args) => asText((await runCommands([{ op: 'checkFilm', args }], 120000))[0]?.value)
);

server.tool(
  'render_film',
  'Render the loaded film (or one passed inline) to a video with audio, lipsync and subtitles. `format` picks the container: "mp4" is H.264/AAC via WebCodecs — faster than real time, seekable, and what social platforms want; "webm" is the paced zero-dependency path; "auto" (the default) prefers MP4 and falls back. If `path` is given the file is pulled from the browser in chunks and written on this machine, with the extension corrected to match what was actually encoded; otherwise only a summary is returned, because a two-minute film is tens of megabytes.',
  {
    film: z.record(z.any()).optional(),
    path: z.string().optional(),
    format: z.enum(['auto', 'mp4', 'webm']).optional(),
    width: z.number().optional(),
    height: z.number().optional(),
    fps: z.number().optional(),
  },
  async ({ path, ...args }) => {
    // A paced render runs in real time, so the timeout has to cover the film.
    const result = (await runCommands([{ op: 'renderFilm', args }], 1800000))[0];
    if (!result?.ok) throw new Error(result?.error || 'render failed');
    const summary = result.value;
    if (!path) return asText(summary);

    // Pulled in chunks: a finished film is megabytes, and a data URL that size
    // comes back truncated with no error.
    const parts = [];
    for (let offset = 0; offset < summary.size; ) {
      const chunk = (await runCommands(
        [{ op: 'readFilmChunk', args: { offset, length: 4194304 } }], 120000))[0];
      if (!chunk?.ok) throw new Error(chunk?.error || 'could not read the rendered film');
      parts.push(Buffer.from(chunk.value.base64, 'base64'));
      offset += chunk.value.length;
      if (chunk.value.done) break;
    }
    const file = Buffer.concat(parts);
    // The extension follows the encode, not the request: a .mp4 holding WebM
    // is a file that fails to open for reasons nobody will guess.
    const ext = String(summary.type || '').includes('mp4') ? '.mp4' : '.webm';
    const out = path.replace(/\.(mp4|webm)$/i, '') + ext;
    writeFileSync(out, file);
    return asText({ savedTo: out, bytesWritten: file.length, ...summary });
  }
);

// ---------------------------------------------------------------- 3D film
/**
 * The 3D pipeline, which until now no agent could reach at all.
 *
 * `load_film` / `check_film` / `render_film` above drive the 2D compiler
 * through the browser bridge. `compile3d` -- shots, cameras, characters,
 * cutaways, textures, overlays -- had no tool of any kind, so an agent could
 * author a 3D film and had no way to compile, check, look at or render one.
 */

server.tool(
  'check_film_3d',
  'Compile a 3D film and report every problem without encoding anything: compiler '
  + 'diagnostics, framing measured analytically by projecting each subject\'s bounds '
  + 'through the camera, exposure measured on real pixels sampled at 160x90, and the '
  + 'overlay checked over its own draw list. Seconds, not minutes, and the way to '
  + 'catch a bad shot before spending a render on it.',
  { film: z.string().describe('path to the film JSON, relative to the repo root') },
  async ({ film }) => {
    const r = await runScript('produce3d.mjs', { FILM: film, CHECK: '1' },
                              { timeoutMs: 600_000 });
    return asText(quietLines(r.out) + (r.code ? '\n(findings present)' : '\n(clean)'));
  }
);

server.tool(
  'digest_film_3d',
  'What is on screen, as NUMBERS, at one time per shot (or at the times you give). '
  + 'For each named subject: its screen-space box, the fraction of frame it covers, '
  + 'its mean luma and its dominant hue, plus a frame-wide luma histogram and every '
  + 'string of overlay text. About 400 tokens for a whole film against roughly 2,000 '
  + 'for ONE screenshot. Use this first and reach for `grab_frames_3d` only when a '
  + 'number is surprising or the question is genuinely "does this look right".',
  {
    film: z.string(),
    at: z.array(z.number()).optional().describe('times in seconds; default is one per shot'),
    subjects: z.array(z.string()).optional()
      .describe('node ids, e.g. ["earth/crust", "host"]; default is every cast root'),
  },
  async ({ film, at, subjects }) => {
    const r = await runScript('produce3d.mjs', {
      FILM: film,
      DIGEST: at?.length ? at.join(',') : '1',
      SUBJECTS: subjects?.length ? subjects.join(',') : null,
    }, { timeoutMs: 600_000 });
    return asText(quietLines(r.out));
  }
);

server.tool(
  'grab_frames_3d',
  'Render single frames of a 3D film to PNG files on this machine and return their '
  + 'paths. The ONLY check that catches a model not looking like the thing it is '
  + 'meant to be, and the most expensive one you have: read a returned image only '
  + 'when `digest_film_3d` cannot answer the question.',
  {
    film: z.string(),
    at: z.array(z.number()).min(1).describe('times in seconds'),
    out: z.string().optional().describe('directory for the PNGs'),
    width: z.number().optional(),
    height: z.number().optional(),
  },
  async ({ film, at, out, width, height }) => {
    const r = await runScript('produce3d.mjs', {
      FILM: film, GRAB: at.join(','),
      OUT: `${out ?? 'out/grabs'}/g.png`,
      WIDTH: width ?? 1280, HEIGHT: height ?? 720,
    }, { timeoutMs: 900_000 });
    if (r.code) throw new Error(quietLines(r.out) + r.err);
    return asText(quietLines(r.out).split('\n').filter((l) => l.endsWith('.png')).join('\n'));
  }
);

server.tool(
  'render_film_3d',
  'Render a 3D film to a video file on this machine, with voice, music, lipsync, '
  + 'subtitles and the post chain. `format` picks the container: "mp4" is H.264/AAC '
  + 'through WebCodecs and renders FASTER than real time; "webm" is the paced '
  + 'MediaRecorder path and takes at least as long as the film runs. Returns the '
  + 'summary, not the bytes.',
  {
    film: z.string(),
    out: z.string().describe('output path, relative to the repo root'),
    width: z.number().optional(),
    height: z.number().optional(),
    format: z.enum(['auto', 'mp4', 'webm']).optional(),
    voiceBackend: z.enum(['piper', 'kokoro', 'openvoice', 'voicestudio']).optional(),
  },
  async ({ film, out, width, height, format, voiceBackend }) => {
    const r = await runScript('produce3d.mjs', {
      FILM: film, OUT: out, WIDTH: width ?? 1920, HEIGHT: height ?? 1080,
      FORMAT: format ?? 'auto', VOICE_BACKEND: voiceBackend,
    });
    if (r.code) throw new Error(quietLines(r.out) + r.err);
    return asText(quietLines(r.out));
  }
);

// ----------------------------------------------------------------- voices
server.tool(
  'list_voices',
  'Every voice engine this build can cast against, what each one costs and needs, '
  + 'and the ROLE names a film should use instead of model ids. Answers from a table '
  + 'and touches no network unless `probe` is true -- so choosing a voice costs about '
  + '200 tokens rather than an 86 MB model download to find out it was not available.',
  { probe: z.boolean().optional().describe('also ask each engine what it actually has') },
  async ({ probe }) => {
    const r = await runScript('list-voices.mjs', { PROBE: probe ? '1' : null },
                              { timeoutMs: 60_000 });
    return asText(quietLines(r.out));
  }
);

server.tool(
  'digest_film',
  'What is on screen in a 2D film, as NUMBERS rather than pixels: per-subject box, '
  + 'coverage, luma, dominant hue, the framing read in heads, and every string of '
  + 'on-screen text. About 1,200 tokens for a 19-shot film against ~2,000 for ONE '
  + 'screenshot. Run this before grabbing a frame: structured numbers catch '
  + 'everything geometric, temporal and typographic, and a frame catches everything '
  + 'about material and light.',
  {
    film: z.string().describe('path to the film json, relative to the repo'),
    at: z.string().optional()
      .describe('comma-separated times; default is one sample 55% through each shot'),
  },
  async ({ film, at }) => {
    const r = await runScript('digest2d.mjs', { FILM: film, AT: at ?? null },
                              { timeoutMs: 600_000 });
    return asText(quietLines(r.out));
  }
);

server.tool(
  'bake_voices',
  'Synthesize a film\'s dialogue ONCE into the on-disk take cache, or audition a '
  + 'single line. A render reads baked takes and synthesizes only what is missing, so '
  + 'this is how an 86 MB Kokoro model gets loaded once instead of once per render, '
  + 'and how an OpenVoice server only has to be running while this runs. `spec` '
  + 'recasts every voice in the film (e.g. "kokoro:bm_george") without editing it. '
  + 'The takes are content-addressed, so re-baking after editing one line costs one '
  + 'line.',
  {
    film: z.string().optional().describe('a film json to bake every line of'),
    say: z.string().optional().describe('one line to audition instead'),
    spec: z.string().optional()
      .describe('<engine>:<voice>, e.g. kokoro:bm_george or tts:en_US-hfc_male-medium'),
    out: z.string().optional().describe('where to write the audition wav'),
  },
  async ({ film, say, spec, out }) => {
    if (!film && !say) throw new Error('bake_voices needs either `film` or `say`');
    const r = await runScript('say.mjs', {
      FILM: film ?? null, SAY: say ?? null, SPEC: spec ?? null, OUT: out ?? null,
    }, { timeoutMs: 900_000 });
    return asText(quietLines(r.out));
  }
);

// Record/encode the selected animation and optionally save it to disk.
async function exportMedia(op, path) {
  const result = (await runCommands([{ op }], 300000))[0];
  if (!result?.ok) throw new Error(result?.error || 'export failed');
  const { dataUrl, size } = result.value;
  if (path) {
    writeFileSync(path, Buffer.from(dataUrl.split(',')[1], 'base64'));
    return asText({ savedTo: path, size });
  }
  return asText({ dataUrl, size });
}

server.tool(
  'export_video',
  'Record the selected animation to a WebM video. If `path` is given, the file is written on this machine and its path returned; otherwise the base64 data URL is returned.',
  { path: z.string().optional() },
  async ({ path }) => exportMedia('exportVideo', path)
);

server.tool(
  'export_gif',
  'Render the selected animation to an animated GIF. If `path` is given, the file is written on this machine and its path returned; otherwise the base64 data URL is returned.',
  { path: z.string().optional() },
  async ({ path }) => exportMedia('exportGif', path)
);

/* ------------------------------------------------------------------ assets

 * The library an agent can actually work from.
 *
 * Before these, all eighteen tools were render, check, digest and voice, so an
 * agent could author a film that referenced an asset and could not discover,
 * inspect, measure or clear one. Importing a model already worked -- it is
 * one line in a film -- and everything AROUND that line was missing.
 */

server.tool(
  'inspect_asset',
  'What is inside a 3D model, WITHOUT loading it into a browser: triangles (stored and '
  + 'drawn, which differ when geometry is instanced), world-space bounds, whether it is '
  + 'rigged, its animation clips, its morph targets, whether it can be LIPSYNCED and by '
  + 'what naming convention, and a recommended scale/rotation/ground offset. Use this to '
  + 'choose between candidate models: a 100x-wrong import is routine and this is what '
  + 'catches it before a render rather than after. Takes a local path or a URL; reads only '
  + 'the glTF container, so it is fast and needs no GPU.',
  {
    file: z.string().describe('a local path (relative to the repo) or an https URL to a .glb/.gltf'),
    as: z.enum(['human', 'prop', 'furniture', 'vehicle', 'building']).optional()
      .describe('what KIND of thing it is, which is what the unit guess is measured against; '
        + 'default human'),
    height: z.number().optional()
      .describe('the height in metres you want it to be. Given, this beats the unit guess '
        + 'outright and the scale is exact.'),
  },
  async ({ file, as, height }) => {
    const args = ['inspect', file];
    if (as) args.push('--as', as);
    if (height != null) args.push('--height', String(height));
    const r = await runScript('asset.mjs', {}, { args, timeoutMs: 300_000 });
    return asText(r.out || r.err || 'no output');
  }
);

server.tool(
  'import_asset',
  'Add a model, image, HDRI, audio file or font to the asset library, from a local path or '
  + 'a URL. Content-addressed by the hash of its bytes, so re-importing something already '
  + 'held is a no-op rather than a second copy. A LICENCE is required and the call fails '
  + 'without one: an animation built on an asset whose licence was never recorded is not '
  + 'shippable, and that is discovered at the end. Pass "unknown" deliberately if that is '
  + 'the truth. Returns the id to reference it by, plus the inspection.',
  {
    file: z.string().describe('a local path (relative to the repo) or an https URL'),
    licence: z.string().describe('the terms, e.g. "CC0-1.0", "CC-BY-4.0", or "unknown". Free '
      + 'text on purpose: the real world contains "royalty-free, see invoice 4471".'),
    name: z.string().optional().describe('a short name to refer to it by; defaults to the filename'),
    author: z.string().optional().describe('required in practice for any CC-BY or MIT-style '
      + 'licence, which cannot be complied with without it'),
    kind: z.enum(['model', 'image', 'texture', 'hdri', 'audio', 'font', 'other']).optional()
      .describe('inferred from the extension if omitted'),
    as: z.enum(['human', 'prop', 'furniture', 'vehicle', 'building']).optional(),
    notes: z.string().optional(),
  },
  async ({ file, licence, name, author, kind, as, notes }) => {
    const args = ['import', file, '--licence', licence];
    for (const [k, v] of [['name', name], ['author', author], ['kind', kind],
                          ['as', as], ['notes', notes]]) {
      if (v) args.push(`--${k}`, String(v));
    }
    const r = await runScript('asset.mjs', {}, { args, timeoutMs: 900_000 });
    return asText(r.out || r.err || 'no output');
  }
);

server.tool(
  'list_assets',
  'What is in the asset library: id, kind, name, licence, triangle count, and whether each '
  + 'model can be lipsynced. Ask this before importing anything, since the library may '
  + 'already hold it.',
  { kind: z.enum(['model', 'image', 'texture', 'hdri', 'audio', 'font', 'other']).optional() },
  async ({ kind }) => {
    const args = ['list'];
    if (kind) args.push('--kind', kind);
    const r = await runScript('asset.mjs', {}, { args, timeoutMs: 60_000 });
    return asText(r.out || 'no assets');
  }
);

server.tool(
  'asset_credits',
  'The attribution list for a film, or for the whole library, and whether it is CLEAR FOR '
  + 'RELEASE. Reports every asset whose licence is unknown or which requires an author it '
  + 'does not have, plus noncommercial and share-alike terms that constrain what the '
  + 'finished work can be. Run this before publishing anything: the alternative is finding '
  + 'out afterwards.',
  { film: z.string().optional()
      .describe('path to a film json; omitted, the whole library is credited') },
  async ({ film }) => {
    const args = ['credits'];
    if (film) args.push(film);
    const r = await runScript('asset.mjs', {}, { args, timeoutMs: 60_000 });
    return asText(r.out || r.err || 'no output');
  }
);

await server.connect(new StdioServerTransport());
console.error(`[animate-engine-mcp] ready. WebSocket bridge on ws://localhost:${WS_PORT}`);
