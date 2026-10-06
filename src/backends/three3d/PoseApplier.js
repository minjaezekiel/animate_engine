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
            object[group].set(value[0], value[1], value[2]);
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
        case 'scale': return [object[group].x, object[group].y, object[group].z];
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
