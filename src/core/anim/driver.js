/**
 * Drivers: a channel whose value is an expression over other channels.
 *
 * # Why
 *
 * Everything in this engine that varies over time is a key on a track, and
 * most things should be. But some relationships are **arithmetic, not
 * acting**: a wheel's rotation is the vehicle's travel over its radius, a
 * dial reads a pressure, a mirrored limb is the other limb negated, a fan
 * turns at a constant rate forever. Keying those is writing down the answers
 * to a sum, and the sum is re-evaluated by hand every time the input moves.
 *
 * Phase 56 adds the sum. `{ target: 'wheel', path: 'transform.rot', expr:
 * 'car.transform.x * -114.6' }` says what the relationship IS, and a film
 * that retimes its car keeps its wheels.
 *
 * # Why it is a parser and not `eval`
 *
 * A film is **data**. It arrives as JSON, it is written by scripts and by
 * agents, and it is checked into git. The moment a film can name code, every
 * film in the repository is an executable and `git clone` is an arbitrary
 * code execution. `eval`, `new Function` and a dynamic `import()` of a
 * film-supplied string are all the same hole. So this is a hand-written
 * recursive-descent parser over a closed grammar with no property access, no
 * calls into anything it did not define, and no way to reach a global.
 *
 * It is also why this file is in `core/`: it is arithmetic, so it is pure, so
 * it is unit-tested in Node with no browser. See
 * [43-DCC-PARITY.md §4.5](../../../docs/pending/43-DCC-PARITY.md).
 *
 * # The grammar
 *
 *   expr    := term (('+' | '-') term)*
 *   term    := unary (('*' | '/' | '%') unary)*
 *   unary   := '-' unary | primary
 *   primary := number | name '(' args ')' | name | '(' expr ')'
 *   name    := [A-Za-z_][A-Za-z0-9_./-]*        a channel, or a function
 *
 * A name is a channel reference -- `car.transform.x`, `__camera.fov`, or the
 * bare `t` for the current time in seconds -- unless it is followed by `(`,
 * in which case it is one of `FUNCTIONS` and nothing else.
 */

/** Everything a driver may call. Closed by design: see the header. */
export const FUNCTIONS = {
    abs: Math.abs, floor: Math.floor, ceil: Math.ceil, round: Math.round,
    sqrt: Math.sqrt, sign: Math.sign,
    sin: Math.sin, cos: Math.cos, tan: Math.tan, atan2: Math.atan2,
    min: Math.min, max: Math.max,
    pow: (a, b) => a ** b,
    clamp: (v, lo, hi) => Math.min(Math.max(v, lo), hi),
    lerp: (a, b, t) => a + (b - a) * t,
    /** Degrees in, degrees out: every angle in a film script is degrees. */
    rad: (d) => (d * Math.PI) / 180,
    deg: (r) => (r * 180) / Math.PI,
    step: (edge, v) => (v < edge ? 0 : 1),
};

const NAME = /[A-Za-z_][A-Za-z0-9_./-]*/y;
const NUMBER = /\d+(\.\d+)?([eE][-+]?\d+)?/y;

/**
 * Parse an expression into a tree.
 *
 * Throws on anything it does not recognise, with the offset, because a
 * driver that silently evaluates to zero is a part that silently does not
 * move -- and this engine has shipped that class of defect three times under
 * other names.
 */
export function parseExpression(src) {
    if (typeof src !== 'string' || !src.trim()) throw new Error('empty expression');
    let i = 0;
    const text = src;

    const ws = () => { while (i < text.length && /\s/.test(text[i])) i++; };
    const at = (ch) => { ws(); return text[i] === ch; };
    const eat = (ch) => { if (!at(ch)) return false; i++; return true; };
    const fail = (why) => { throw new Error(`${why} at ${i} in "${src}"`); };

    const primary = () => {
        ws();
        if (eat('(')) {
            const e = expr();
            if (!eat(')')) fail('expected )');
            return e;
        }
        NUMBER.lastIndex = i;
        const num = NUMBER.exec(text);
        if (num && num.index === i) { i += num[0].length; return { k: 'num', v: Number(num[0]) }; }
        NAME.lastIndex = i;
        const name = NAME.exec(text);
        if (!name || name.index !== i) fail('expected a number, a name or (');
        i += name[0].length;
        if (at('(')) {
            if (!Object.hasOwn(FUNCTIONS, name[0])) fail(`unknown function '${name[0]}'`);
            eat('(');
            const args = [];
            if (!at(')')) {
                do { args.push(expr()); } while (eat(','));
            }
            if (!eat(')')) fail('expected )');
            return { k: 'call', fn: name[0], args };
        }
        return { k: 'ref', name: name[0] };
    };

    const unary = () => {
        ws();
        if (eat('-')) return { k: 'neg', a: unary() };
        if (eat('+')) return unary();
        return primary();
    };

    const term = () => {
        let a = unary();
        for (;;) {
            ws();
            const op = text[i];
            if (op !== '*' && op !== '/' && op !== '%') return a;
            i++;
            a = { k: 'bin', op, a, b: unary() };
        }
    };

    function expr() {
        let a = term();
        for (;;) {
            ws();
            const op = text[i];
            if (op !== '+' && op !== '-') return a;
            i++;
            a = { k: 'bin', op, a, b: term() };
        }
    }

    const out = expr();
    ws();
    if (i < text.length) fail('unexpected input');
    return out;
}

/** Every channel reference an expression reads, in order of appearance. */
export function expressionRefs(node, out = []) {
    if (!node) return out;
    if (node.k === 'ref') out.push(node.name);
    if (node.k === 'neg') expressionRefs(node.a, out);
    if (node.k === 'bin') { expressionRefs(node.a, out); expressionRefs(node.b, out); }
    if (node.k === 'call') for (const a of node.args) expressionRefs(a, out);
    return out;
}

/**
 * Evaluate a parsed expression.
 *
 * `lookup(name)` resolves a channel reference. A reference it cannot resolve
 * is **0**, not an error: a driver is evaluated every frame and a film that
 * drops a channel should lose a relationship, not a render. The compiler is
 * where an unresolvable name is reported, once, at build time.
 *
 * Division by zero yields 0 rather than Infinity, because an Infinity that
 * reaches a transform makes a NaN matrix and the object vanishes with no
 * error -- the same silent-black failure as `normalScale: [0.45, 0.45]`.
 */
export function evalExpression(node, lookup) {
    switch (node.k) {
        case 'num': return node.v;
        case 'ref': {
            const v = lookup(node.name);
            return typeof v === 'number' && Number.isFinite(v) ? v : 0;
        }
        case 'neg': return -evalExpression(node.a, lookup);
        case 'bin': {
            const a = evalExpression(node.a, lookup);
            const b = evalExpression(node.b, lookup);
            if (node.op === '+') return a + b;
            if (node.op === '-') return a - b;
            if (node.op === '*') return a * b;
            return b === 0 ? 0 : (node.op === '/' ? a / b : a % b);
        }
        case 'call': {
            const args = node.args.map((a) => evalExpression(a, lookup));
            const v = FUNCTIONS[node.fn](...args);
            return Number.isFinite(v) ? v : 0;
        }
        default: return 0;
    }
}

/**
 * `{ target, path, expr }` -> a compiled driver, or `null` with a reason.
 *
 * Kept separate from the compiler so the parse can be tested without
 * building a film, and so the same shape can be reused by the 2D path when
 * it gets drivers.
 */
export function compileDriver(spec = {}) {
    const target = spec.target ?? spec.of;
    const path = spec.path ?? spec.channel;
    if (!target || !path) return { error: 'a driver needs a `target` and a `path`' };
    if (typeof spec.expr !== 'string') return { error: 'a driver needs an `expr` string' };
    try {
        const ast = parseExpression(spec.expr);
        return { driver: { target, path, ast, src: spec.expr, refs: expressionRefs(ast) } };
    } catch (e) {
        return { error: e.message };
    }
}

/**
 * Resolve every driver against a pose, writing the results into it.
 *
 * Reads the pose rather than the scene, which is the one real limitation
 * and is stated in the documentation: **a driver sees the channels the
 * timeline writes.** Driving off a value nothing animates reads 0, which is
 * why the compiler warns when a reference matches no track.
 *
 * Drivers are resolved in declaration order and a later one can read an
 * earlier one's result, so a chain (`b` from `a`, `c` from `b`) works and a
 * cycle resolves to whatever the previous link last wrote rather than
 * hanging. One pass, no fixed point: a film that needs a fixed point needs a
 * constraint, not a driver.
 */
export function applyDrivers(drivers, pose, { time = 0 } = {}) {
    if (!drivers?.length) return pose;
    const lookup = (name) => {
        if (name === 't') return time;
        const dot = name.indexOf('.');
        if (dot < 0) return 0;
        return pose.get(name.slice(0, dot))?.get(name.slice(dot + 1));
    };
    for (const d of drivers) {
        const v = evalExpression(d.ast, lookup);
        let channels = pose.get(d.target);
        if (!channels) pose.set(d.target, (channels = new Map()));
        channels.set(d.path, v);
    }
    return pose;
}

/**
 * Compile a film's `drivers` block onto a timeline, with diagnostics.
 *
 * Shared by both compilers on purpose. The standing structural defect in this
 * repo is that `compile.js` and `compile3d.js` share a vocabulary and not a
 * table, and every feature added to one of them is a silent divergence --
 * see [37-MISSING-TOOLS.md §1](../../../docs/pending/37-MISSING-TOOLS.md).
 * A driver is arithmetic over channels; neither compiler owns that.
 */
export function compileDrivers(specs, timeline, warn = () => {}, { channels = null } = {}) {
    const out = [];
    for (const [i, spec] of (specs ?? []).entries()) {
        const where = `drivers[${i}]`;
        const { driver, error } = compileDriver(spec);
        if (error) { warn(error, where); continue; }
        /**
         * A reference nothing animates reads 0 for the life of the film,
         * which looks exactly like a driver that is not running. Reported
         * once here rather than discovered in a render.
         */
        if (channels) {
            for (const ref of driver.refs) {
                if (ref === 't' || channels.has(ref)) continue;
                warn(`driver reads '${ref}', which no track writes; it will read 0`, where);
            }
        }
        out.push(driver);
    }
    timeline.drivers = out;
    return out;
}
