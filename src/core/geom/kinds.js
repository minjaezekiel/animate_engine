/**
 * The geometry kinds a film may name.
 *
 * # Why this list exists
 *
 * "An unknown geometry kind makes the backend skip the node entirely, which
 * silently orphans everything parented to it" -- `compile3d.js` has carried
 * that comment since Phase 24 and never had the list that would make it a
 * diagnostic. `{ kind: 'cyliner' }` was a part that did not appear, taking
 * its children with it, with nothing said at build time.
 *
 * This is the fourth instance of one class in this repository
 * (`normalScale`, `props.trim.offset`, `map: "albedo"`, and a mistyped light
 * type that lit the scene from a direction): a named list of what may be
 * set, so a typo is a diagnostic instead of a property nothing reads. See
 * [43-DCC-PARITY.md §4.2](../../../docs/pending/43-DCC-PARITY.md).
 *
 * It lives in `core/` and is read by **both** the compiler, which warns, and
 * the backend, which builds -- one list, the way `verbs.js` is one list,
 * because a second copy is the defect Phase 57 removed. A test asserts the
 * backend's factory has a builder for every kind here and no others.
 */

/** `group` is a pivot: a transform node with no mesh. */
export const GEOMETRY_KINDS = [
    'group',
    'cube', 'box', 'sphere', 'circle', 'ring', 'cylinder', 'cone', 'torus',
    'capsule', 'plane', 'tetrahedron', 'lathe', 'extrude',
    // Phase 58: two solids and an operation. See `csg.js`.
    'boolean',
];

export const isGeometryKind = (kind) => GEOMETRY_KINDS.includes(kind);
