import { createNode } from './Node.js';
import { createIdFactory } from '../util/id.js';
import { fromTransform, multiply, identity } from '../math/mat2d.js';

/**
 * The scene graph: an id-keyed node map plus a single synthetic root.
 *
 * World matrices are cached and invalidated by marking a subtree dirty, so
 * posing one limb does not force a whole-scene recompute. The cache is the
 * only mutable-for-performance part of the class; everything else is plain
 * data that can be serialized as-is.
 */
export class Scene {
    constructor({ idPrefix = 'n' } = {}) {
        this.nextId = createIdFactory(idPrefix);
        this.byId = new Map();
        this.rootId = '__root';
        this.byId.set(this.rootId, createNode({ id: this.rootId, kind: 'group', name: 'root' }));
        this._matrixCache = new Map();
    }

    get root() { return this.byId.get(this.rootId); }

    add(spec, parentId = this.rootId) {
        const id = spec.id ?? this.nextId();
        if (this.byId.has(id)) throw new Error(`Scene: duplicate node id "${id}"`);
        const parent = this.byId.get(parentId);
        if (!parent) throw new Error(`Scene: no such parent "${parentId}"`);
        const node = createNode({ ...spec, id, parentId });
        this.byId.set(id, node);
        parent.childIds.push(id);
        this._invalidate(id);
        return node;
    }

    get(id) { return this.byId.get(id); }
    has(id) { return this.byId.has(id); }

    remove(id) {
        if (id === this.rootId) throw new Error('Scene: cannot remove the root');
        const node = this.byId.get(id);
        if (!node) return;
        for (const childId of [...node.childIds]) this.remove(childId);
        const parent = this.byId.get(node.parentId);
        if (parent) parent.childIds = parent.childIds.filter((c) => c !== id);
        this.byId.delete(id);
        this._matrixCache.delete(id);
    }

    reparent(id, newParentId) {
        const node = this.byId.get(id);
        const newParent = this.byId.get(newParentId);
        if (!node || !newParent) throw new Error('Scene: reparent needs two live nodes');
        // Refuse a cycle: walking up from the new parent must not reach the node.
        for (let p = newParent; p; p = p.parentId ? this.byId.get(p.parentId) : null) {
            if (p.id === id) throw new Error('Scene: reparent would create a cycle');
        }
        const oldParent = this.byId.get(node.parentId);
        if (oldParent) oldParent.childIds = oldParent.childIds.filter((c) => c !== id);
        node.parentId = newParentId;
        newParent.childIds.push(id);
        this._invalidate(id);
    }

    /** Depth-first walk in child order, root first. */
    walk(fn, fromId = this.rootId) {
        const node = this.byId.get(fromId);
        if (!node) return;
        if (fn(node) === false) return;        // returning false prunes the subtree
        for (const childId of node.childIds) this.walk(fn, childId);
    }

/**
     * The draw list: depth-first, siblings sorted by z then insertion order,
     * each entry carrying its EFFECTIVE alpha.
     *
     * Alpha accumulates down the hierarchy, so a group's opacity applies to
     * everything inside it. That is what makes `props.alpha` on a scene group
     * work as visibility -- without inheritance every scene in a film would
     * draw at once and the last one would cover the rest.
     *
     * A subtree whose accumulated alpha has reached zero is skipped entirely,
     * which is both correct and the single biggest saving per frame: only the
     * scene actually on screen is drawn.
     */
    drawOrder() {
        const out = [];
        const visit = (id, inheritedAlpha) => {
            const node = this.byId.get(id);
            if (!node || !node.visible) return;
            const alpha = inheritedAlpha * (node.props.alpha ?? 1);
            if (alpha <= 0.0005) return;
            if (id !== this.rootId) out.push({ node, alpha });
            const kids = node.childIds
                .map((c, i) => ({ c, i, z: this.byId.get(c)?.z ?? 0 }))
                .sort((a, b) => (a.z - b.z) || (a.i - b.i));
            for (const k of kids) visit(k.c, alpha);
        };
        visit(this.rootId, 1);
        return out;
    }

    worldMatrix(id) {
        const cached = this._matrixCache.get(id);
        if (cached) return cached;
        const node = this.byId.get(id);
        if (!node) return identity();
        const local = id === this.rootId ? identity() : fromTransform(node.transform);
        const world = node.parentId ? multiply(this.worldMatrix(node.parentId), local) : local;
        this._matrixCache.set(id, world);
        return world;
    }

    /** Call after mutating a transform; drops the cache for that subtree. */
    _invalidate(id) {
        this._matrixCache.delete(id);
        const node = this.byId.get(id);
        if (!node) return;
        for (const childId of node.childIds) this._invalidate(childId);
    }

    invalidate(id) { this._invalidate(id); }
    invalidateAll() { this._matrixCache.clear(); }
}
