import { FILM_VERSION, KNOWN, DO_VERBS, TRANSITION_KINDS, KNOWN_SCENERY,
         ASSET_KINDS, SHAPE_KINDS } from './schema.js';
import { generateActions, BUILDS } from './generate.js';
import { FACE_KITS } from '../art/face.js';
import { TEMPLATE_NAMES, TIME_NAMES, PROP_NAMES } from '../art/scenery.js';

const GENERATED_ACTIONS = Object.keys(generateActions());

/**
 * Collects diagnostics. Never throws for content problems -- only a film that
 * is not an object at all is fatal, because there is nothing to render.
 */
export function validateFilm(film) {
    const d = [];
    const warn = (path, message) => d.push({ severity: 'warning', path, message });
    const err = (path, message) => d.push({ severity: 'error', path, message });

    if (!film || typeof film !== 'object') {
        return [{ severity: 'fatal', path: '', message: 'Film must be an object.' }];
    }

    if (film.version && film.version !== FILM_VERSION) {
        warn('version', `Expected "${FILM_VERSION}", got "${film.version}". Compiling anyway.`);
    }
    unknown('', film, KNOWN.root, warn);
    if (film.meta) unknown('meta', film.meta, KNOWN.meta, warn);
    validateAssets(film, d);

    if (film.meta?.duration != null) {
        warn('meta.duration', 'Duration is derived from shot durations; the declared value is ignored.');
    }

    const characters = film.characters ?? {};
    for (const [name, char] of Object.entries(characters)) {
        unknown(`characters.${name}`, char, KNOWN.character, warn);
        if (!char.parts?.length && !char.generate) {
            warn(`characters.${name}`, 'No parts and no generate block; nothing will be drawn.');
        }
        if (char.generate) validateGenerate(`characters.${name}.generate`, char.generate, warn);
        const ids = new Set();
        for (const part of char.parts ?? []) {
            unknown(`characters.${name}.parts.${part.id}`, part, KNOWN.part, warn);
            if (!part.id) err(`characters.${name}.parts`, 'A part is missing its id.');
            else if (ids.has(part.id)) err(`characters.${name}.parts`, `Duplicate part id "${part.id}".`);
            else ids.add(part.id);
        }
        for (const part of char.parts ?? []) {
            if (part.parent && !ids.has(part.parent)) {
                err(`characters.${name}.parts.${part.id}.parent`,
                    `Parent "${part.parent}" is not a part of this character.`);
            }
        }
    }

    if (!film.scenes?.length) err('scenes', 'A film needs at least one scene.');

    (film.scenes ?? []).forEach((scene, si) => {
        const sp = `scenes[${si}]`;
        unknown(sp, scene, KNOWN.scene, warn);
        for (const t of ['transitionIn', 'transitionOut']) {
            const kind = scene[t]?.kind;
            if (kind && !TRANSITION_KINDS.includes(kind)) {
                warn(`${sp}.${t}.kind`, `Unknown transition "${kind}"; treated as fade.`);
            }
        }
        if (scene.template) validateTemplate(`${sp}.template`, scene.template, warn);
        const castNames = new Set();
        for (const c of scene.cast ?? []) {
            const as = c.as ?? c.character;
            castNames.add(as);
            unknown(`${sp}.cast.${as}`, c, KNOWN.cast, warn);
            if (!characters[c.character]) {
                err(`${sp}.cast`, `Character "${c.character}" is not defined.`);
            }
            // `view` and `expression` are the two channels a cast entry can
            // seed, and both are closed sets -- so a typo should name the set
            // rather than silently stage the character facing the wrong way.
            for (const [key, kit] of [['view', FACE_KITS.view], ['expression', FACE_KITS.expression]]) {
                if (c[key] != null && !kit.includes(c[key])) {
                    warn(`${sp}.cast.${as}.${key}`,
                         `Unknown ${key} "${c[key]}". Known: ${kit.join(', ')}.`);
                }
            }
        }
        if (!scene.shots?.length) warn(`${sp}.shots`, 'Scene has no shots; it will take no time.');

        (scene.scenery ?? []).forEach((item, ci) => {
            unknown(`${sp}.scenery[${ci}]`, item, KNOWN_SCENERY, warn);
        });

        (scene.shots ?? []).forEach((shot, hi) => {
            const hp = `${sp}.shots[${hi}]`;
            unknown(hp, shot, KNOWN.shot, warn);
            if (shot.duration == null) warn(`${hp}.duration`, 'No duration; defaulting.');
            if (shot.camera) unknown(`${hp}.camera`, shot.camera, KNOWN.camera, warn);

            for (const a of shot.actions ?? []) {
                unknown(`${hp}.actions`, a, KNOWN.action, warn);
                if (!DO_VERBS.includes(a.do)) {
                    warn(`${hp}.actions`, `Unknown verb "${a.do}"; ignored. Known: ${DO_VERBS.join(', ')}.`);
                }
                if (a.target && !castNames.has(a.target)) {
                    err(`${hp}.actions`, `Target "${a.target}" is not cast in this scene.`);
                }
                if (a.do === 'pose' && a.target) {
                    const charName = [...(scene.cast ?? [])].find((c) => (c.as ?? c.character) === a.target)?.character;
                    if (charName && a.pose && !characters[charName]?.poses?.[a.pose]) {
                        err(`${hp}.actions`, `Pose "${a.pose}" is not defined on "${charName}".`);
                    }
                }
                if (a.do === 'play' && a.target) {
                    const charName = [...(scene.cast ?? [])].find((c) => (c.as ?? c.character) === a.target)?.character;
                    const generated = characters[charName]?.generate ? GENERATED_ACTIONS : [];
                    if (charName && a.action
                        && !characters[charName]?.actions?.[a.action]
                        && !generated.includes(a.action)) {
                        err(`${hp}.actions`,
                            `Action "${a.action}" is not defined on "${charName}".`
                            + (generated.length ? ` Generated: ${generated.join(', ')}.` : ''));
                    }
                }
            }

            for (const line of shot.dialogue ?? []) {
                unknown(`${hp}.dialogue`, line, KNOWN.dialogue, warn);
                if (!line.text && !line.audio) {
                    warn(`${hp}.dialogue`, 'Line has neither text nor audio; skipped.');
                }
                if (line.speaker && !castNames.has(line.speaker)) {
                    warn(`${hp}.dialogue`, `Speaker "${line.speaker}" is not cast here; audio plays without lipsync.`);
                }
            }
        });

        // An image named but not declared renders nothing, silently, which
        // is worse than a wrong colour. Check it the way audio is checked.
        if (scene.background) {
            unknown(`${sp}.background`, scene.background, KNOWN.background, warn);
            if (scene.background.image && !film.assets?.[scene.background.image]) {
                err(`${sp}.background`, `Image asset "${scene.background.image}" is not declared.`);
            }
        }
        for (const item of scene.scenery ?? []) {
            const id = item.shape?.asset
                ?? (item.shape?.kind === 'image' ? item.shape?.image : null);
            if (id && !film.assets?.[id]) {
                err(`${sp}.scenery`, `Image asset "${id}" is not declared (scenery "${item.id}").`);
            }
            if (item.shape?.kind && !SHAPE_KINDS.includes(item.shape.kind)) {
                warn(`${sp}.scenery`, `Unknown shape kind "${item.shape.kind}" on "${item.id}". `
                    + `Known: ${SHAPE_KINDS.join(', ')}.`);
            }
        }
        for (const cue of scene.audio ?? []) {
            unknown(`${sp}.audio`, cue, KNOWN.audioCue, warn);
            if (cue.asset && !film.assets?.[cue.asset]) {
                err(`${sp}.audio`, `Audio asset "${cue.asset}" is not declared.`);
            }
        }
    });

    return d;
}

/**
 * The procedural vocabulary is a closed set, so a typo is reportable rather
 * than silently rendered as the default face. That reportability is the whole
 * argument for enumerating it in the first place: an author who cannot see
 * their own output needs the engine to say "that is not a jaw".
 */
function validateGenerate(path, generate, warn) {
    unknown(path, generate, KNOWN.generate, warn);
    if (generate.build != null && typeof generate.build === 'string'
        && !(generate.build in BUILDS)) {
        warn(`${path}.build`, `Unknown build "${generate.build}". `
            + `Known: ${Object.keys(BUILDS).join(', ')}.`);
    }
    if (generate.hair != null && !FACE_KITS.hair.includes(generate.hair)) {
        warn(`${path}.hair`, `Unknown hair "${generate.hair}"; a default cap is drawn. `
            + `Known: ${FACE_KITS.hair.join(', ')}.`);
    }
    if (generate.face) {
        unknown(`${path}.face`, generate.face, KNOWN.face, warn);
        for (const [slot, value] of Object.entries(generate.face)) {
            const kit = FACE_KITS[slot === 'brow' ? 'brow' : slot];
            if (kit && value != null && !kit.includes(value)) {
                warn(`${path}.face.${slot}`,
                     `Unknown ${slot} "${value}"; the default is used. Known: ${kit.join(', ')}.`);
            }
        }
    }
}

function validateTemplate(path, template, warn) {
    const spec = typeof template === 'string' ? { template } : template;
    unknown(path, spec, KNOWN.template, warn);
    if (!TEMPLATE_NAMES.includes(spec.template)) {
        warn(path, `Unknown scenery template "${spec.template}". Known: ${TEMPLATE_NAMES.join(', ')}.`);
    }
    if (spec.time != null && !TIME_NAMES.includes(spec.time)) {
        warn(`${path}.time`, `Unknown time "${spec.time}". Known: ${TIME_NAMES.join(', ')}.`);
    }
    for (const entry of spec.props ?? []) {
        const name = String(entry).split('@')[0];
        if (!PROP_NAMES.includes(name)) {
            warn(`${path}.props`, `Unknown prop "${name}". Known: ${PROP_NAMES.join(', ')}.`);
        }
    }
}

function unknown(path, obj, known, warn) {
    for (const k of Object.keys(obj ?? {})) {
        if (!known.includes(k)) {
            warn(path ? `${path}.${k}` : k, `Unrecognized field "${k}"; ignored.`);
        }
    }
}

export function validateAssets(film, d) {
    for (const [id, asset] of Object.entries(film.assets ?? {})) {
        if (!asset || typeof asset !== 'object') {
            d.push({ severity: 'error', path: `assets.${id}`, message: 'Asset must be an object.' });
            continue;
        }
        for (const key of Object.keys(asset)) {
            if (!KNOWN.asset.includes(key)) {
                d.push({ severity: 'warning', path: `assets.${id}`,
                         message: `Unknown asset key "${key}". Known: ${KNOWN.asset.join(', ')}.` });
            }
        }
        if (asset.kind && !ASSET_KINDS.includes(asset.kind)) {
            d.push({ severity: 'warning', path: `assets.${id}`,
                     message: `Unknown asset kind "${asset.kind}". Known: ${ASSET_KINDS.join(', ')}.` });
        }
        if (!asset.src && !asset.file) {
            d.push({ severity: 'warning', path: `assets.${id}`,
                     message: `Asset "${id}" has neither "src" nor "file"; it can never load.` });
        }
    }
    return d;
}

export const hasFatal = (diagnostics) => diagnostics.some((x) => x.severity === 'fatal');
export const hasError = (diagnostics) => diagnostics.some((x) => x.severity === 'error');
