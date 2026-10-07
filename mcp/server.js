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

const asText = (value) => ({ content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] });
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
  'Render the loaded film (or one passed inline) to a WebM with audio, lipsync and subtitles. If `path` is given the file is pulled from the browser in chunks and written on this machine; otherwise only a summary is returned, because a two-minute film is tens of megabytes.',
  {
    film: z.record(z.any()).optional(),
    path: z.string().optional(),
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
    writeFileSync(path, file);
    return asText({ savedTo: path, bytesWritten: file.length, ...summary });
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

await server.connect(new StdioServerTransport());
console.error(`[animate-engine-mcp] ready. WebSocket bridge on ws://localhost:${WS_PORT}`);
