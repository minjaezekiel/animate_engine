/**
 * Multiples: the same drawing repeated along its own motion path.
 *
 * One of the two smear techniques hand-drawn animation uses for fast action
 * (the other is the elongated in-between). It is what stops a limb crossing
 * the frame in three frames from simply strobing.
 *
 * Built as a COMPILE pass that clones the subtree and time-shifts its tracks,
 * not as a history buffer in the renderer. A buffer would make frame N depend
 * on the frames rendered before it, and the whole engine rests on frame N
 * being a pure function of N -- that is what lets a film be scrubbed,
 * re-rendered and compared against golden hashes. A clone whose tracks read
 * two frames earlier gives the identical picture and keeps the guarantee.
 *
 * Cost is honest: three ghosts of a nineteen-node character add fifty-seven
 * nodes and their tracks. Author it on the one or two shots that need it.
 */

const GHOST = '#echo';

/**
 * @param scene     the compiled Scene
 * @param timeline  the compiled Timeline
 * @param rootId    the cast root to trail
 * @param spec      { frames, spacing, falloff, scale }
 *                  spacing is in FRAMES, so a trail reads the same at any fps
 */
export function buildEcho({ scene, timeline, meta }, rootId, spec = {}, spans = null) {
    const frames = Math.max(0, Math.min(8, Math.round(spec.frames ?? 3)));
    if (!frames) return 0;
    const spacing = (spec.spacing ?? 2) / (meta?.fps ?? 24);
    const falloff = spec.falloff ?? 0.45;
    const root = scene.get(rootId);
    if (!root) return 0;

    // The subtree, parents first, so a clone always finds its own parent.
    const subtree = [];
    scene.walk((n) => subtree.push(n), rootId);

    let added = 0;
    for (let k = 1; k <= frames; k++) {
        const suffix = `${GHOST}${k}`;
        const alpha = Math.pow(falloff, k);
        for (const node of subtree) {
            const isRoot = node.id === rootId;
            scene.add({
                ...structuredClone({
                    kind: node.kind, name: node.name, z: node.z,
                    transform: { ...node.transform },
                    props: { ...node.props },
                }),
                id: `${node.id}${suffix}`,
                // The trail sits BEHIND the live drawing: a ghost in front of
                // the character reads as a double exposure, not as speed.
                z: (node.z ?? 0) - 0.001 * k,
                props: {
                    ...node.props,
                    alpha: (node.props.alpha ?? 1) * (isRoot ? alpha : 1),
                    // Ghosts never re-run the swap pass on their own account;
                    // they inherit whatever geometry the clone captured.
                    echo: undefined,
                },
            }, isRoot ? node.parentId : `${node.parentId}${suffix}`);
            added++;
        }
    }

    // Clone every track that drives the subtree, shifted back in time.
    const own = timeline.tracks.filter((t) => String(t.target).startsWith(rootId));
    for (let k = 1; k <= frames; k++) {
        const shift = k * spacing;
        for (const track of own) {
            const copy = {
                ...track,
                target: `${track.target}${GHOST}${k}`,
                keys: track.keys.map((key) => ({ ...key, t: key.t + shift })),
            };
            timeline.tracks.push(copy);
            timeline._index?.set(`${copy.target}\u0000${copy.path}`, copy);
        }
    }

    // A trail belongs to the one or two shots that need it, not to the whole
    // film: a character is not smearing while it stands still, and three
    // ghosts of a nineteen-node rig is not free. Keyed off by default and on
    // only across the named spans.
    if (spans && spans.length) {
        const fps = meta?.fps ?? 24;
        const eps = 0.5 / fps;
        for (let k = 1; k <= frames; k++) {
            const id = `${rootId}${GHOST}${k}`;
            const live = Math.pow(falloff, k);
            keyAlpha(timeline, id, 0, 0);
            for (const span of spans) {
                keyAlpha(timeline, id, Math.max(0, span.start - eps), 0);
                keyAlpha(timeline, id, span.start, live);
                keyAlpha(timeline, id, Math.max(span.start, span.end - eps), live);
                keyAlpha(timeline, id, span.end, 0);
            }
        }
    }

    // And every clip instance scoped to it, started later by the same amount.
    const insts = timeline.instances.filter((i) => i.scopeId === rootId);
    for (let k = 1; k <= frames; k++) {
        const shift = k * spacing;
        for (const inst of insts) {
            timeline.instances.push({
                ...inst,
                scopeId: `${inst.scopeId}${GHOST}${k}`,
                start: (inst.start ?? 0) + shift,
                end: (inst.end ?? timeline.duration) + shift,
            });
        }
    }
    return added;
}

/** A step key on a ghost root's alpha, created on first use. */
function keyAlpha(timeline, target, t, v) {
    const k = `${target}\u0000props.alpha`;
    let track = timeline._index?.get(k);
    if (!track) {
        track = { target, path: 'props.alpha', type: 'number', keys: [] };
        timeline.tracks.push(track);
        timeline._index?.set(k, track);
    }
    const at = track.keys.findIndex((x) => x.t >= t);
    const entry = { t, v, ease: 'step' };
    if (at >= 0 && Math.abs(track.keys[at].t - t) < 1e-9) track.keys[at] = entry;
    else if (at < 0) track.keys.push(entry);
    else track.keys.splice(at, 0, entry);
}

/** Is this node part of a trail rather than the drawing itself? */
export const isEcho = (id) => String(id).includes(GHOST);
