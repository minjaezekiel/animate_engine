/**
 * What can this browser actually do?
 *
 * The kernel layer picks its backend from these answers rather than from
 * belief, so this script exists to be re-run on any new machine or Chrome
 * version. It prints a JSON capability report and exits non-zero only if
 * Chrome itself could not be launched.
 *
 *   node scripts/probe-capabilities.mjs
 */
import puppeteer from 'puppeteer-core';
import { createServer } from 'node:http';

// WebGPU and WebCodecs are exposed only in a *secure context*, and
// `about:blank` is not one. Probing there reports `navigator.gpu:
// undefined` on a browser that supports it perfectly -- a false negative
// that would send the whole kernel design down the wrong road. localhost
// is a secure context, so the probe serves itself one page over it.
const server = createServer((_, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<!doctype html><title>probe</title>');
}).listen(0);
await new Promise((r) => server.on('listening', r));
const ORIGIN = `http://localhost:${server.address().port}/`;

const CHROME = process.env.CHROME
    || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: process.env.HEADED ? false : true,
    args: [
        '--enable-unsafe-webgpu',
        '--enable-features=Vulkan,WebAssemblyExperimentalJSPI',
        '--use-angle=metal',
        '--enable-gpu',
        '--ignore-gpu-blocklist',
        '--no-sandbox',
    ],
});

const page = await browser.newPage();
await page.goto(ORIGIN);
if (!(await page.evaluate(() => window.isSecureContext))) {
    throw new Error('probe page is not a secure context; every gated API would read as absent');
}

const report = await page.evaluate(async () => {
    const out = {};

    // --- WebGPU -----------------------------------------------------------
    out.webgpu = { present: !!navigator.gpu };
    if (navigator.gpu) {
        try {
            const adapter = await navigator.gpu.requestAdapter();
            if (!adapter) {
                out.webgpu.adapter = null;
            } else {
                out.webgpu.adapter = adapter.info
                    ? { vendor: adapter.info.vendor, architecture: adapter.info.architecture,
                        device: adapter.info.device, description: adapter.info.description }
                    : 'present, no info';
                out.webgpu.features = [...adapter.features].sort();
                out.webgpu.limits = {
                    maxComputeInvocationsPerWorkgroup: adapter.limits.maxComputeInvocationsPerWorkgroup,
                    maxComputeWorkgroupSizeX: adapter.limits.maxComputeWorkgroupSizeX,
                    maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
                    maxBufferSize: adapter.limits.maxBufferSize,
                };
                const device = await adapter.requestDevice();
                out.webgpu.device = !!device;
                // Actually run a compute shader -- "adapter exists" is not the
                // same claim as "a dispatch returns the right numbers".
                const n = 256;
                const shader = device.createShaderModule({ code: `
                    @group(0) @binding(0) var<storage, read_write> data: array<f32>;
                    @compute @workgroup_size(64)
                    fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
                        data[gid.x] = data[gid.x] * 2.0 + 1.0;
                    }` });
                const buf = device.createBuffer({ size: n * 4,
                    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST });
                device.queue.writeBuffer(buf, 0, new Float32Array(n).fill(3));
                const pipeline = device.createComputePipeline({ layout: 'auto',
                    compute: { module: shader, entryPoint: 'main' } });
                const bind = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0),
                    entries: [{ binding: 0, resource: { buffer: buf } }] });
                const read = device.createBuffer({ size: n * 4,
                    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
                const enc = device.createCommandEncoder();
                const pass = enc.beginComputePass();
                pass.setPipeline(pipeline); pass.setBindGroup(0, bind);
                pass.dispatchWorkgroups(n / 64); pass.end();
                enc.copyBufferToBuffer(buf, 0, read, 0, n * 4);
                device.queue.submit([enc.finish()]);
                await read.mapAsync(GPUMapMode.READ);
                const got = new Float32Array(read.getMappedRange())[0];
                out.webgpu.computeRan = got === 7;     // 3 * 2 + 1
                out.webgpu.computeValue = got;
            }
        } catch (e) { out.webgpu.error = String(e); }
    }

    // --- WebAssembly ------------------------------------------------------
    // Hand-assembled modules: the only honest way to ask whether a *feature*
    // is supported, as opposed to whether the constructor exists.
    const validate = (bytes) => { try { return WebAssembly.validate(new Uint8Array(bytes)); }
                                  catch { return false; } };
    const HEADER = [0, 97, 115, 109, 1, 0, 0, 0];
    out.wasm = {
        present: typeof WebAssembly !== 'undefined',
        // (func (result v128) v128.const 0) -- requires simd128
        simd128: validate([...HEADER, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0,
                           10, 22, 1, 20, 0, 253, 12, ...new Array(16).fill(0), 11]),
        // (func (result i64) i64.const 0 i64.extend... ) bulk memory via memory.fill
        // (func (memory.fill (i32.const 0)(i32.const 0)(i32.const 0))) -- the
        // body is 11 bytes, so the code section is 13. Getting either length
        // wrong reports a false negative, which is worse than no probe.
        bulkMemory: validate([...HEADER, 1, 4, 1, 96, 0, 0, 3, 2, 1, 0, 5, 3, 1, 0, 1,
                              10, 13, 1, 11, 0, 65, 0, 65, 0, 65, 0, 252, 11, 0, 11]),
        threads: typeof SharedArrayBuffer !== 'undefined',
        streaming: typeof WebAssembly.instantiateStreaming === 'function',
    };

    // --- rendering / offline ---------------------------------------------
    const c = document.createElement('canvas');
    out.render = {
        webgl2: !!c.getContext('webgl2'),
        offscreenCanvas: typeof OffscreenCanvas !== 'undefined',
        offscreen2d: (() => { try { return !!new OffscreenCanvas(8, 8).getContext('2d'); }
                              catch { return false; } })(),
        path2d: typeof Path2D !== 'undefined',
        imageBitmap: typeof createImageBitmap === 'function',
        videoFrame: typeof VideoFrame !== 'undefined',
        webcodecs: typeof VideoEncoder !== 'undefined',
        mediaRecorder: typeof MediaRecorder !== 'undefined',
        hardwareConcurrency: navigator.hardwareConcurrency,
    };
    if (typeof VideoEncoder !== 'undefined') {
        const probe = async (codec) => {
            try {
                const s = await VideoEncoder.isConfigSupported({
                    codec, width: 1280, height: 720, bitrate: 5e6, framerate: 24 });
                return s.supported ? 'yes' : 'no';
            } catch { return 'error'; }
        };
        out.render.codecs = {
            'vp09.00.10.08': await probe('vp09.00.10.08'),
            'avc1.42001f': await probe('avc1.42001f'),
            'av01.0.04M.08': await probe('av01.0.04M.08'),
        };
    }
    return out;
});

report.secureContext = await page.evaluate(() => window.isSecureContext);
report.chrome = (await browser.version());

console.log(JSON.stringify(report, null, 2));
await browser.close();
server.close();
