//! Numeric kernels for jireX, compiled to WebAssembly.
//!
//! # Why this crate exists
//!
//! The engine's contract is that **frame N is a pure function of N**. That
//! makes every expensive operation a batch transform over flat arrays --
//! deform these vertices, composite these stamps, sample these pixels --
//! with no hidden state between frames. Those are exactly the operations a
//! JavaScript JIT handles worst and that wasm with SIMD handles best.
//!
//! # The ABI, and why there is no wasm-bindgen
//!
//! Every exported function takes `i32` byte offsets into this module's
//! linear memory plus element counts, and writes through an out-pointer.
//! Nothing is returned by value except scalars. The host allocates with
//! [`alloc`], writes a `Float32Array` view straight into `memory.buffer`,
//! calls the kernel, and reads the result from another view.
//!
//! The alternative -- wasm-bindgen -- would add a build-time npm toolchain,
//! a generated glue module, and a copy in each direction for every array.
//! For kernels whose arguments are already contiguous `f32` buffers that is
//! all cost and no benefit. The price of doing it this way is that the host
//! must keep its typed-array views in step with memory growth; see
//! `src/kernels/wasm/loader.js`, which re-derives them whenever the buffer
//! is detached.
//!
//! # Determinism, precisely
//!
//! wasm `f32` arithmetic is specified to IEEE-754 with no reassociation
//! and no fused-multiply-add substitution, so **a given kernel on a given
//! input produces the same bits on every machine and every browser**. That
//! is the property the engine's golden hashes need, and it is a real
//! advantage over both JS and the GPU.
//!
//! What it is *not* is interchangeable with the JS fallback. JavaScript
//! has no `f32` arithmetic: values read out of a `Float32Array` widen to
//! `f64`, every operation is performed at double precision, and rounding
//! back to single happens only on store. So the JS path carries more
//! intermediate precision and its results differ from these kernels in
//! the last bits -- usually by being slightly *more* accurate. Matching
//! exactly would mean wrapping every operation in `Math.fround`, which
//! costs more than the kernel saves.
//!
//! The engine therefore treats the two as numerically equivalent rather
//! than identical, and the tests assert agreement to a tolerance. Any
//! golden hash taken over kernel output must record which backend produced
//! it; `Kernels.backend` exists for that. This matches the contract
//! already in `docs/STATUS.md`, where scene state and draw calls are the
//! asserted invariants and exact pixels are not.
//!
//! GPU compute is a third case and a weaker one: it is not reproducible
//! even across devices of the same vendor, so it is for display and
//! authoring-time bakes only, never for anything feeding a key or a hash.
//!
//! One rule follows and is easy to violate by accident: **a SIMD path and
//! its scalar fallback must reduce in the same order.** Floating-point
//! addition is not associative, so summing four lanes and combining gives
//! a different answer than summing in sequence. Where both exist here,
//! they agree, and `skin` deliberately leaves its four influences scalar
//! for exactly this reason.

use core::alloc::Layout;

pub mod blend;
pub mod deform;
pub mod raster;
pub mod warp;

/// Allocate `size` bytes with 16-byte alignment and return the offset.
///
/// 16 is the `v128` alignment, so every buffer the host hands a kernel is
/// safe for aligned SIMD loads. Returns 0 on failure, which the host treats
/// as out-of-memory.
#[no_mangle]
pub extern "C" fn alloc(size: usize) -> *mut u8 {
    if size == 0 {
        return core::ptr::null_mut();
    }
    match Layout::from_size_align(size, 16) {
        Ok(layout) => unsafe { std::alloc::alloc(layout) },
        Err(_) => core::ptr::null_mut(),
    }
}

/// Release a buffer previously returned by [`alloc`].
///
/// The size must match the allocating call; Rust's allocator is given the
/// layout rather than tracking it, which is why the host's `Buf` wrapper
/// stores the size alongside the pointer.
#[no_mangle]
pub extern "C" fn dealloc(ptr: *mut u8, size: usize) {
    if ptr.is_null() || size == 0 {
        return;
    }
    if let Ok(layout) = Layout::from_size_align(size, 16) {
        unsafe { std::alloc::dealloc(ptr, layout) }
    }
}

/// ABI version. The loader refuses a module whose value it does not know,
/// so a stale `jirex_kernels.wasm` in a service-worker cache fails loudly
/// instead of writing nonsense through a shifted argument list.
#[no_mangle]
pub extern "C" fn abi_version() -> i32 {
    4
}

/// Whether this module was built with `simd128`.
///
/// Reported rather than assumed so the benchmark can label its numbers
/// honestly, and so a host can log which path it actually got.
#[no_mangle]
pub extern "C" fn has_simd() -> i32 {
    cfg!(target_feature = "simd128") as i32
}
