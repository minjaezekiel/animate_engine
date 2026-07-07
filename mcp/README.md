# animateEngine MCP server

Lets an AI build and export 3D animations by driving a **live** animateEngine
browser session. The engine needs WebGL/DOM, so it can't run headless — this
server relays MCP tool calls to a browser over a WebSocket.

## How it works

```
AI (MCP client) ──stdio──▶ server.js ──WebSocket──▶ browser (animateEngine)
                                    ◀── results ────
```

`server.js` opens a WebSocket on `ws://localhost:8787` (override with
`ANIMATE_ENGINE_WS_PORT`). The browser connects when the app is opened with
`?mcp=ws://localhost:8787`, exposing `engine.runCommands()` to the server.

## Setup

```bash
cd mcp
npm install
```

Register with your MCP client (e.g. Claude Code):

```json
{
  "mcpServers": {
    "animate-engine": { "command": "node", "args": ["/absolute/path/to/mcp/server.js"] }
  }
}
```

Then open the editor so it connects to the bridge:

```
index.html?mcp=ws://localhost:8787
```

## Tools

| Tool | Purpose |
| --- | --- |
| `create_object` | Add a primitive (cube/sphere/cylinder/cone/torus/tetrahedron); returns its `uuid`. |
| `create_animation` | Create + select a named timeline. |
| `add_keyframe` | Keyframe an object (by `uuid`) at a `time`. |
| `play` | Play the selected animation. |
| `get_scene` | Return the current project as JSON. |
| `export_video` | Record the selected animation to WebM; pass `path` to save it on disk. |
| `run_script` | Run a raw `[{op, args}]` batch (the full engine command set). |

## Example (raw script)

```json
[
  { "op": "createObject", "args": { "kind": "sphere", "name": "Ball", "color": "#4fc3f7" } },
  { "op": "createAnimation", "args": { "name": "Bounce", "duration": 2 } },
  { "op": "addKeyframe", "args": { "uuid": "<uuid from createObject>", "time": 0, "position": [0, 3, 0] } },
  { "op": "addKeyframe", "args": { "uuid": "<uuid>", "time": 1, "position": [0, 0, 0] } },
  { "op": "exportVideo", "args": {} }
]
```
