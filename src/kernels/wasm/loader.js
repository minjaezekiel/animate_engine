/**
 * Instantiate the kernel module and wrap its linear memory.
 *
 * # The one trap in this file
 *
 * When Rust's allocator needs more room it calls `memory.grow`, and that
 * **allocates a new `ArrayBuffer` and detaches the old one**. Every
 * `Float32Array` the host was holding over the previous buffer silently
 * becomes zero-length. Code that caches a view at allocation time
 * therefore works perfectly until the heap first expands -- typically when
 * a second, larger document is opened -- and then writes nothing and reads
 * zeros, with no error anywhere.
 *
 * [`Buf`] handles this by treating the pointer as the durable value and
 * the view as a cache: `.array` compares the view's buffer against the
 * module's current one and re-derives when they differ. Pointers survive
 * growth because linear memory addresses never move; only the JS view does.
 *
 * Callers must therefore **never hold `buf.array` across a call that might
 * allocate.** Read it fresh each time; it is a property access on a
 * matching buffer and costs nothing.
 */

/** The ABI this loader speaks. Must match `abi_version()` in lib.rs. */
export const ABI_VERSION = 1;

/**
 * A block of kernel-owned memory, viewed as a typed array.
 *
 * Buffers are deliberately explicit and long-lived rather than created per
 * call. The hot data in this engine is large and persistent -- a 1080p f32
 * RGBA paint buffer is 33 MB -- so copying it in and out on every call
 * would cost more than the kernel saves. Allocate once, keep it, and hand
 * the same `Buf` to every call.
 */
export class Buf {
    /**
     * @param {WasmHost} host
     * @param {number} ptr      byte offset into linear memory
     * @param {number} length   element count
     * @param {Function} Ctor   Float32Array | Uint32Array | Uint8Array
     */
    constructor(host, ptr, length, Ctor) {
        this.host = host;
        this.ptr = ptr;
        this.length = length;
        this.Ctor = Ctor;
        this.bytes = length * Ctor.BYTES_PER_ELEMENT;
        this._view = null;
        this._buffer = null;
    }

    /**
     * A live view of this block.
     *
     * Re-derived whenever the module's buffer has been replaced by growth.
     * Do not cache the result across anything that might allocate.
     */
    get array() {
        const current = this.host.memory.buffer;
        if (this._buffer !== current) {
            this._view = new this.Ctor(current, this.ptr, this.length);
            this._buffer = current;
        }
        return this._view;
    }

    /** Return this block to the allocator. Using it afterwards is a bug. */
    free() {
        if (this.ptr) this.host.exports.dealloc(this.ptr, this.bytes);
        this.ptr = 0;
        this._view = null;
        this._buffer = null;
    }
}

/** A plain-JS `Buf` with the same shape, for the fallback backend. */
export class JsBuf {
    constructor(length, Ctor) {
        this.ptr = 0;
        this.length = length;
        this._view = new Ctor(length);
    }
    get array() { return this._view; }
    free() { this._view = null; }
}

/** The instantiated module plus its allocation helpers. */
class WasmHost {
    constructor(instance) {
        this.exports = instance.exports;
        this.memory = instance.exports.memory;
    }

    /**
     * Allocate `length` elements, zeroed.
     *
     * Rust's allocator does not promise zeroed memory, and several kernels
     * accumulate into their output rather than overwrite it -- `normals`
     * and `stamp_mask` both do -- so a dirty buffer would show up as
     * geometry or ink inherited from a freed allocation. Zeroing here
     * costs one `fill` and removes a whole class of irreproducible bug.
     */
    allocate(length, Ctor) {
        if (length <= 0) return new Buf(this, 0, 0, Ctor);
        const bytes = length * Ctor.BYTES_PER_ELEMENT;
        const ptr = this.exports.alloc(bytes);
        if (!ptr) throw new Error(`jirex kernels: out of memory allocating ${bytes} bytes`);
        const buf = new Buf(this, ptr, length, Ctor);
        buf.array.fill(0);
        return buf;
    }
}

/**
 * Compile and instantiate the kernel module.
 *
 * Instantiation is synchronous-after-compile and takes no import object at
 * all, which is the whole point of the no-bindgen ABI: there is no glue to
 * keep in step and nothing the host must provide.
 *
 * @param {Uint8Array} bytes
 * @returns {Promise<WasmHost>}
 */
export async function instantiate(bytes) {
    const { instance } = await WebAssembly.instantiate(bytes, {});
    const host = new WasmHost(instance);

    // A stale module -- one left in a service-worker cache from an earlier
    // build -- would otherwise be called with a shifted argument list and
    // write plausible nonsense. Failing here sends the caller to the JS
    // fallback instead.
    const version = host.exports.abi_version?.();
    if (version !== ABI_VERSION) {
        throw new Error(
            `jirex kernels: ABI ${version} but this loader speaks ${ABI_VERSION}; rebuild with npm run build:wasm`);
    }
    return host;
}
