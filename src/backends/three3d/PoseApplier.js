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
