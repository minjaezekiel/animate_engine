/**
 * A kernel worker: one wasm instance over the pool's shared memory.
 *
 * # Protocol
 *
 * ```text
 *   in  { t: 'init', module, memory, stackTop }   ->  out { t: 'ready' }
 *   in  { t: 'run', id, fn, args }                ->  out { t: 'done', id }
 *                                                 ->  out { t: 'error', id, err }
 * ```
 *
 * `fn` is an export name and `args` a flat array of numbers -- pointers
 * and scalars. So dispatch is one line, `exports[fn](...args)`, and adding
 * a kernel to the pool needs no change here. That is the payoff of the
 * no-bindgen ABI: there is no per-kernel marshalling to generate.
 *
 * # Why this file is portable by hand
 *
 * Node's `worker_threads` and the browser's `Worker` have different
 * messaging APIs -- `parentPort.on('message', fn)` against
 * `self.onmessage = e => fn(e.data)`. Rather than keep two workers in step,
 * the channel is abstracted in the dozen lines below. This matters
 * practically: the kernel tests and benchmark run in Node, where iteration
 * is fast, and the same file then runs in the browser unchanged.
 *
 * # The stack pointer
 *
 * Every instance of the shared-memory module starts with the *same*
 * `__stack_pointer`, because it is a module-level global initialised from
 * the module's data. With one linear memory behind all of them, that means
 * every worker's call frames land on the same bytes. The corruption is
 * silent, timing-dependent and effectively undebuggable, so the pool hands
 * each worker its own region and the first thing this file does is move
 * the pointer there.
 *
 * # Allocation
 *
 * A worker never calls `alloc` or `dealloc`. The pool owns the heap from
 * the main thread, which keeps one allocator with one caller and removes
 * every question about lock contention and reentrancy. Kernels are
 * allocation-free by construction for the same reason -- see
 * `MAX_BLUR_RADIUS` in `warp.rs`.
 */

const channel = await (async () => {
    if (typeof self !== 'undefined' && typeof self.postMessage === 'function') {
        return {
            post: (m) => self.postMessage(m),
            listen: (fn) => { self.onmessage = (e) => fn(e.data); },
        };
    }
    const { parentPort } = await import('node:worker_threads');
    return {
        post: (m) => parentPort.postMessage(m),
        listen: (fn) => parentPort.on('message', fn),
    };
})();

let exports = null;

channel.listen(async (msg) => {
    if (msg.t === 'init') {
        try {
            const instance = await WebAssembly.instantiate(msg.module, {
                env: { memory: msg.memory },
            });
            exports = instance.exports;
            // Move this worker off the shared default stack before any
            // kernel runs. See the note above.
            exports.__stack_pointer.value = msg.stackTop;
            channel.post({ t: 'ready' });
        } catch (err) {
            channel.post({ t: 'error', id: -1, err: String(err && err.message || err) });
        }
        return;
    }

    if (msg.t === 'run') {
        try {
            exports[msg.fn](...msg.args);
            channel.post({ t: 'done', id: msg.id });
        } catch (err) {
            channel.post({ t: 'error', id: msg.id, err: String(err && err.message || err) });
        }
    }
});
