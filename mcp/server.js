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
  'Run a batch of raw engine commands ([{op, args}]). Ops: createObject, createLight, setMaterial, transform, subdivide, createAnimation, selectAnimation, addKeyframe, play, pause, stop, setTime, getScene, clear, exportVideo, exportGif.',
  { commands: z.array(z.object({ op: z.string(), args: z.record(z.any()).optional() })) },
  async ({ commands }) => asText(await runCommands(commands))
);

server.tool(
  'create_object',
  'Add a primitive (cube, sphere, cylinder, cone, torus, tetrahedron). Returns its uuid.',
  {
    kind: z.enum(['cube', 'sphere', 'cylinder', 'cone', 'torus', 'tetrahedron']),
    name: z.string().optional(),
    position: vec3.optional(),
    color: z.union([z.string(), z.number()]).optional(),
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
