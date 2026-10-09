/**
 * Write a core Pose onto Three objects.
 *
 * This is what replaces AnimationMixer. It imports nothing -- not even THREE
 * -- because every write it makes is an instance method on an object it was
 * handed, so it runs in Node against plain stand-ins and needs no browser to
 * test.
 *
 * Channel paths, which `legacyTracks` and `clipToTracks` both emit:
 *
 *   position | scale          vec3   [x, y, z]
 *   quaternion                quat   [x, y, z, w]
 *   color                     color  '#rrggbb'
 *   morph.<name>              number by name, through morphTargetDictionary
 *   morphIndex.<i>            number by index, for clips that address it that way
 *   visible                   discrete
 *
 * And the scalar forms, which is what a hand-authored 3D film emits:
 *
 *   position.x | .y | .z      number
 *   rotation.x | .y | .z      number, Euler radians on the object's own order
 *   scale.x | .y | .z         number
 *   material.<prop>           number -- emissiveIntensity, opacity, metalness...
 *
 * Scalar channels exist so the 3D path reuses the whole 2D animation stack
 * unchanged: `writeChannel` emits one number per key, `Additive` layers
 * offsets and ratios, and anticipation and overshoot are scalar helpers. A
 * vec3 channel would need its own copy of all four.
 */
export function applyPoseToObjects(pose, resolve) {
    for (const [uuid, channels] of pose) {
        const object = resolve(uuid);
        if (!object) continue;              // an object deleted since the keys were made
        for (const [path, value] of channels) applyChannel(object, path, value);
    }
}

export function applyChannel(object, path, value) {
    if (value === undefined || value === null) return;
    const dot = path.indexOf('.');
    const group = dot < 0 ? path : path.slice(0, dot);

    switch (group) {
        case 'position':
        case 'scale':
            if (dot > 0) object[group][path.slice(dot + 1)] = value;
            else object[group].set(value[0], value[1], value[2]);
            return;
        case 'quaternion':
            object.quaternion.set(value[0], value[1], value[2], value[3]);
            return;
        case 'color':
            if (object.material && object.material.color) setColor(object.material.color, value);
            return;
        case 'visible':
            object.visible = !!value;
            return;
        case 'rotation':
            // Euler on the object's own rotation order. A quaternion channel
            // still exists for imported clips, where the keys came from one.
            if (dot > 0) object.rotation[path.slice(dot + 1)] = value;
            return;
        case 'material': {
            // `transparent` is not implied here the way the editor implies it
            // from opacity, because a flash mesh wants additive blending set
            // once at build time, not re-derived every frame.
            const prop = path.slice(dot + 1);
            if (object.material && prop in object.material) object.material[prop] = value;
            return;
        }
        case 'fov':
            // The projection matrix is rebuilt by the adapter's per-frame
            // step, once, rather than here on every write.
            if ('fov' in object) object.fov = value;
            return;
        case 'morph': {
            const index = object.morphTargetDictionary && object.morphTargetDictionary[path.slice(dot + 1)];
            if (index != null && object.morphTargetInfluences) object.morphTargetInfluences[index] = value;
            return;
        }
        case 'morphIndex': {
            const index = Number(path.slice(dot + 1));
            if (Number.isInteger(index) && object.morphTargetInfluences) {
                object.morphTargetInfluences[index] = value;
            }
            return;
        }
        default:
            return;                         // unknown channel: ignore, never throw
    }
}

function setColor(target, value) {
    if (typeof value === 'number') target.setHex(value);
    else if (typeof value === 'string') target.setStyle(value);
}

/**
 * The pose the given channels are in right now.
 *
 * The 2D path calls this a baseline and needs it for the same reason: every
 * frame must start from the authored pose, not from the previous frame's
 * leftovers, or frame N stops being a pure function of N.
 */
export function captureBaseline(channels, resolve) {
    const baseline = new Map();
    for (const [uuid, paths] of channels) {
        const object = resolve(uuid);
        if (!object) continue;
        const values = new Map();
        for (const path of paths) {
            const value = readChannel(object, path);
            if (value !== undefined) values.set(path, value);
        }
        baseline.set(uuid, values);
    }
    return baseline;
}

export function readChannel(object, path) {
    const dot = path.indexOf('.');
    const group = dot < 0 ? path : path.slice(0, dot);
    switch (group) {
        case 'position':
        case 'scale': return dot > 0 ? object[group][path.slice(dot + 1)]
            : [object[group].x, object[group].y, object[group].z];
        case 'rotation': return dot > 0 ? object.rotation[path.slice(dot + 1)] : undefined;
        case 'material': {
            const prop = path.slice(dot + 1);
            return object.material ? object.material[prop] : undefined;
        }
        case 'fov': return object.fov;
        case 'quaternion': return [object.quaternion.x, object.quaternion.y,
                                   object.quaternion.z, object.quaternion.w];
        case 'color': return object.material && object.material.color
            ? object.material.color.getHex() : undefined;
        case 'visible': return object.visible;
        case 'morph': {
            const index = object.morphTargetDictionary
                && object.morphTargetDictionary[path.slice(dot + 1)];
            return index != null && object.morphTargetInfluences
                ? object.morphTargetInfluences[index] : undefined;
        }
        case 'morphIndex': {
            const index = Number(path.slice(dot + 1));
            return object.morphTargetInfluences ? object.morphTargetInfluences[index] : undefined;
        }
        default: return undefined;
    }
}

export function restoreBaseline(baseline, resolve) {
    for (const [uuid, values] of baseline) {
        const object = resolve(uuid);
        if (!object) continue;
        for (const [path, value] of values) applyChannel(object, path, value);
    }
}
