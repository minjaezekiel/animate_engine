#!/usr/bin/env node
/**
 * jireX paint + motion MCP server.
 *
 * ```jsonc
 * // claude_desktop_config.json, or any MCP client
 * { "mcpServers": { "jirex-paint": {
 *     "command": "node",
 *     "args": ["/path/to/jireX/mcp/paint-server.js"] } } }
 * ```
 *
 * # Why this is separate from `server.js`
 *
 * `server.js` relays to a live browser over a WebSocket, because the 3D
 * editor needs WebGL and a DOM. The paint and motion layers need neither:
 * they read no clock, no DOM and no GPU, so they run in Node exactly as
 * they do in a browser.
 *
 * That difference matters more for an agent than it looks. With the
 * bridge, an agent cannot draw anything unless a human has a browser tab
 * open and connected. Here it calls a tool, a PNG appears on disk, and it
 * can open that PNG and look at what it made. The feedback loop closes
 * without a person in it.
 *
 * # Schemas are generated, never written twice
 *
 * Every tool is derived from `src/core/script/ops.js`. The existing
 * server hand-registers its tools *and* repeats the op list in a doc
 * string, and the two have already drifted apart -- which is precisely
 * the failure this avoids. Adding an op to the table adds a tool here
 * with its documentation, with no edit to this file.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { OPS, createContext, run } from '../src/core/script/ops.js';

/**
 * Turn one parameter spec into a zod schema.
 *
 * Every field is optional at the schema level even when the table marks
 * it required, and `run` enforces required-ness itself. That is
 * deliberate: a zod rejection surfaces to a model as a protocol-level
 * validation error with no guidance, whereas `run` throws
 * `op "paint_stroke" requires "doc": Document id.` -- which tells it what
 * to do next. Losing the earlier rejection costs nothing; the call fails
 * either way.
 */
function schemaFor(spec) {
    const base = {
        string: z.string(),
        number: z.number(),
        boolean: z.boolean(),
        array: z.array(z.any()),
        object: z.record(z.any()),
    }[spec.type] ?? z.any();
    const doc = spec.required ? `(required) ${spec.doc}` : spec.doc;
    return base.optional().describe(doc);
}

const context = await createContext();
const server = new McpServer({ name: 'jirex-paint', version: '1.0.0' });

for (const [name, op] of Object.entries(OPS)) {
    const shape = {};
    for (const [key, spec] of Object.entries(op.params)) shape[key] = schemaFor(spec);

    server.tool(name, op.summary, shape, async (args) => {
        try {
            const result = await run(context, name, args ?? {});
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        } catch (error) {
            // Returned as content rather than thrown, so the model reads
            // the message and can correct itself. A thrown error becomes
            // a transport failure and the guidance is lost.
            return {
                isError: true,
                content: [{ type: 'text', text: String(error?.message ?? error) }],
            };
        }
    });
}

await server.connect(new StdioServerTransport());
console.error(`[jirex-paint] ${Object.keys(OPS).length} tools, kernels: `
    + `${context.kernels.backend}${context.kernels.simd ? ' +simd128' : ''}`);
