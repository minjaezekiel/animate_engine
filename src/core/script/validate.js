import { FILM_VERSION, KNOWN, DO_VERBS, TRANSITION_KINDS } from './schema.js';
import { generateActions } from './generate.js';

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

    if (film.meta?.duration != null) {
        warn('meta.duration', 'Duration is derived from shot durations; the declared value is ignored.');
    }

    const characters = film.characters ?? {};
    for (const [name, char] of Object.entries(characters)) {
        unknown(`characters.${name}`, char, KNOWN.character, warn);
        if (!char.parts?.length && !char.generate) {
            warn(`characters.${name}`, 'No parts and no generate block; nothing will be drawn.');
        }
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
        const castNames = new Set();
        for (const c of scene.cast ?? []) {
            const as = c.as ?? c.character;
            castNames.add(as);
            if (!characters[c.character]) {
                err(`${sp}.cast`, `Character "${c.character}" is not defined.`);
            }
        }
        if (!scene.shots?.length) warn(`${sp}.shots`, 'Scene has no shots; it will take no time.');

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

        for (const cue of scene.audio ?? []) {
            unknown(`${sp}.audio`, cue, KNOWN.audioCue, warn);
            if (cue.asset && !film.assets?.[cue.asset]) {
                err(`${sp}.audio`, `Audio asset "${cue.asset}" is not declared.`);
            }
        }
    });

    return d;
}

function unknown(path, obj, known, warn) {
    for (const k of Object.keys(obj ?? {})) {
        if (!known.includes(k)) {
            warn(path ? `${path}.${k}` : k, `Unrecognized field "${k}"; ignored.`);
        }
    }
}

export const hasFatal = (diagnostics) => diagnostics.some((x) => x.severity === 'fatal');
export const hasError = (diagnostics) => diagnostics.some((x) => x.severity === 'error');
