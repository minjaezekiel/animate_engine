import { FILM_VERSION, DEFAULTS } from './schema.js';

/**
 * Plain-text screenplay -> film skeleton.
 *
 * This is the "upload a script of the words" entry point: a user writes or
 * pastes an ordinary script, characters are detected from the speaker lines,
 * and the result is a valid film that already renders. They then cast voices
 * and adjust. Nothing here invents story; it only structures what is written.
 *
 * Recognized, deliberately forgiving:
 *
 *   TITLE: The Lighthouse          title (anywhere in the header)
 *   # The Lighthouse               title, markdown style
 *   ## SCENE: harbour at dusk      a new scene; the text becomes its name
 *   INT. LAMP ROOM - NIGHT         a new scene, screenplay style
 *   [the sea churns]               action/stage direction
 *   MARA                           speaker (a short all-caps line)
 *     The light has not failed.    that speaker's dialogue
 *   MARA (quietly)                 speaker with a parenthetical
 *   MARA: the light has not...     speaker and dialogue on one line
 *
 * Pure and deterministic: same text in, same film out.
 */

const SCENE_HEADING = /^(?:#{1,3}\s*)?(?:SCENE\s*[:.]?\s*|INT\.?\s*|EXT\.?\s*|INT\/EXT\.?\s*)(.+)$/i;
const TITLE_LINE = /^(?:#\s*|TITLE\s*[:]\s*)(.+)$/i;
const ACTION_LINE = /^[[(](.+)[\])]$/;
const INLINE_SPEAKER = /^([A-Z][A-Z0-9 .'_-]{0,28})\s*(?:\(([^)]*)\))?\s*:\s*(.+)$/;
const SPEAKER_ONLY = /^([A-Z][A-Z0-9 .'_-]{0,28})\s*(?:\(([^)]*)\))?$/;

/** Words a secs-per-word estimate assumes; ~2.6 words/second is a calm read. */
const WORDS_PER_SECOND = 2.6;
const MIN_LINE_SECONDS = 1.4;
const BEAT_PADDING = 0.7;

export function parseScreenplay(text, { fps = DEFAULTS.fps, width = DEFAULTS.width,
                                        height = DEFAULTS.height } = {}) {
    const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
    const diagnostics = [];

    let title = null;
    const scenes = [];
    const speakers = new Set();
    let scene = null;
    let pendingSpeaker = null;
    let pendingParenthetical = null;

    // A speech stays "open" only while its own continuation lines follow. Any
    // blank line, new speaker, action or scene heading closes it -- otherwise
    // two consecutive speeches by the same character would merge into one.
    const closeOpen = () => {
        const beats = scene?.beats;
        const last = beats?.[beats.length - 1];
        if (last?._open) delete last._open;
    };

    const newScene = (name) => {
        scene = { name: name.trim(), beats: [] };
        scenes.push(scene);
        return scene;
    };

    for (const [i, raw] of lines.entries()) {
        const line = raw.trim();
        if (!line) { closeOpen(); pendingSpeaker = null; continue; }

        const titleMatch = line.match(TITLE_LINE);
        if (titleMatch && !title && !scene) { title = titleMatch[1].trim(); continue; }

        const sceneMatch = line.match(SCENE_HEADING);
        if (sceneMatch) { closeOpen(); newScene(sceneMatch[1]); pendingSpeaker = null; continue; }

        const actionMatch = line.match(ACTION_LINE);
        if (actionMatch) {
            closeOpen();
            if (!scene) newScene('Scene 1');
            scene.beats.push({ kind: 'action', text: actionMatch[1].trim() });
            pendingSpeaker = null;
            continue;
        }

        const inline = line.match(INLINE_SPEAKER);
        if (inline && inline[3].trim()) {
            closeOpen();
            if (!scene) newScene('Scene 1');
            const who = normalizeSpeaker(inline[1]);
            speakers.add(who);
            scene.beats.push({
                kind: 'line', speaker: who,
                parenthetical: inline[2]?.trim() || null,
                text: inline[3].trim(),
            });
            pendingSpeaker = null;
            continue;
        }

        const speakerOnly = line.match(SPEAKER_ONLY);
        // Test the NAME for all-caps, not the whole line: a parenthetical
        // like "MARA (quietly)" is lowercase by convention and must not
        // disqualify the speaker.
        const nameIsCaps = speakerOnly
            && speakerOnly[1] === speakerOnly[1].toUpperCase()
            && /[A-Z]/.test(speakerOnly[1]);
        if (nameIsCaps) {
            closeOpen();
            const who = normalizeSpeaker(speakerOnly[1]);
            speakers.add(who);
            pendingSpeaker = who;
            pendingParenthetical = speakerOnly[2]?.trim() || null;
            continue;
        }

        if (pendingSpeaker) {
            if (!scene) newScene('Scene 1');
            const last = scene.beats[scene.beats.length - 1];
            // Continuation lines join the previous speech rather than
            // becoming a second line with no speaker.
            if (last?.kind === 'line' && last.speaker === pendingSpeaker && last._open) {
                last.text += ` ${line}`;
            } else {
                scene.beats.push({
                    kind: 'line', speaker: pendingSpeaker,
                    parenthetical: pendingParenthetical, text: line, _open: true,
                });
            }
            continue;
        }

        if (!scene) newScene('Scene 1');
        scene.beats.push({ kind: 'action', text: line });
        diagnostics.push({
            severity: 'info', path: `line ${i + 1}`,
            message: `Treated as action: "${truncate(line)}"`,
        });
    }

    if (!scenes.length) {
        return {
            film: null,
            diagnostics: [{ severity: 'fatal', path: '', message: 'No scenes or dialogue found.' }],
        };
    }

    // Build the film. One shot per beat, so every line gets its own camera
    // framing and the author can retime a single moment without touching
    // the rest.
    const film = {
        version: FILM_VERSION,
        // estimatedTiming tells the studio these durations came from a word
        // count, so retiming may tighten them as well as extend them.
        meta: { title: title ?? 'Untitled', fps, width, height, estimatedTiming: true },
        voices: {},
        assets: {},
        palettes: { default: DEFAULT_PALETTE },
        characters: {},
        scenes: [],
    };

    const speakerList = [...speakers];
    speakerList.forEach((who, idx) => {
        const id = slug(who);
        film.voices[`${id}_v`] = { spec: suggestVoice(idx) };
        film.characters[id] = {
            palette: 'default',
            voice: `${id}_v`,
            generate: { cloth: idx % 2 ? 'coat2' : 'coat' },
            proportions: { height: 190 + (idx % 3) * 8 },
        };
    });

    scenes.forEach((sc, si) => {
        const castIds = [...new Set(sc.beats.filter((b) => b.kind === 'line').map((b) => slug(b.speaker)))];
        const positions = layoutCast(castIds.length, width, height);
        const out = {
            id: `s${si + 1}`,
            background: { color: BACKDROPS[si % BACKDROPS.length] },
            transitionIn: si === 0 ? { kind: 'fade', from: '#000000', duration: 1.0 }
                                   : { kind: 'crossfade', duration: 0.8 },
            cast: castIds.map((id, ci) => ({
                character: id, as: id, at: positions[ci], scale: 1,
            })),
            audio: [],
            shots: [],
        };

        for (const beat of sc.beats) {
            if (beat.kind === 'action') {
                out.shots.push({
                    id: `s${si + 1}.a${out.shots.length + 1}`,
                    duration: 2.4,
                    camera: { to: { x: 0, y: 0, zoom: 1.05 } },
                    actions: castIds.map((id) => ({ target: id, do: 'play', action: 'idle' })),
                });
                continue;
            }
            const seconds = estimateSeconds(beat.text);
            out.shots.push({
                id: `s${si + 1}.l${out.shots.length + 1}`,
                duration: +(seconds + BEAT_PADDING).toFixed(2),
                camera: { to: { x: 0, y: 0, zoom: 1.12 } },
                actions: castIds.map((id) => ({
                    target: id, do: 'play',
                    action: id === slug(beat.speaker) ? 'idle' : 'breathe',
                })),
                dialogue: [{
                    speaker: slug(beat.speaker),
                    at: 0.35,
                    text: beat.text,
                    lipsync: true,
                    subtitle: true,
                }],
            });
        }

        if (si < scenes.length - 1) out.transitionOut = { kind: 'crossfade', duration: 0.8 };
        film.scenes.push(out);
    });

    const duration = film.scenes.reduce(
        (sum, sc) => sum + sc.shots.reduce((a, b) => a + b.duration, 0), 0);

    diagnostics.unshift({
        severity: 'info', path: '',
        message: `Parsed ${film.scenes.length} scene(s), ${speakerList.length} character(s), `
            + `${film.scenes.reduce((n, s) => n + s.shots.length, 0)} shot(s), `
            + `~${duration.toFixed(1)}s. Cast voices before rendering.`,
    });

    return { film, diagnostics, speakers: speakerList, estimatedDuration: duration };
}

/** Spoken length estimate; dialogue timing is refined once real audio exists. */
export function estimateSeconds(text) {
    const words = String(text).trim().split(/\s+/).filter(Boolean).length;
    return Math.max(MIN_LINE_SECONDS, words / WORDS_PER_SECOND);
}

/**
 * Grow any shot that is too short for its own dialogue.
 *
 * Word-count estimates are only a starting point; once a line has actually
 * been voiced its true length is known, and a shot shorter than its dialogue
 * would cut the speech off mid-sentence.
 *
 * It only ever EXTENDS. A shot held longer than its dialogue is a deliberate
 * pacing choice -- an establishing beat, a pause after a line -- and
 * shortening it to hug the audio would flatten the edit and silently change
 * the film's length. Pass `shrink: true` to opt into tightening as well,
 * which is useful when the durations came from an estimate rather than from
 * an author.
 */
export function retimeToAudio(film, lineDurations, { padding = BEAT_PADDING,
                                                     shrink = false,
                                                     tolerance = 0.05 } = {}) {
    const next = structuredClone(film);
    const changes = [];
    for (const scene of next.scenes ?? []) {
        for (const shot of scene.shots ?? []) {
            let needed = 0;
            for (const line of shot.dialogue ?? []) {
                const d = lineDurations[line.text];
                if (d) needed = Math.max(needed, (line.at ?? 0) + d + padding);
            }
            if (needed <= 0) continue;
            const current = shot.duration ?? 0;
            const grow = needed > current + tolerance;
            const tighten = shrink && needed < current - tolerance;
            if (!grow && !tighten) continue;
            changes.push({ shot: shot.id, from: current, to: +needed.toFixed(2) });
            shot.duration = +needed.toFixed(2);
        }
    }
    return { film: next, changed: changes.length, changes };
}

const DEFAULT_PALETTE = {
    skin: '#e8c39e', coat: '#c4452f', coat2: '#3d5a80',
    hair: '#2b1d14', eye: '#1a1a1a', shoe: '#20160f', trouser: '#2f3a46',
};

const BACKDROPS = ['#2b3a67', '#1a1410', '#35414d', '#241b2e', '#1f2d24'];

const VOICE_SUGGESTIONS = [
    'tts:en_US-amy-medium', 'tts:en_US-ryan-medium', 'tts:en_GB-alba-medium',
    'tts:en_US-kristin-medium', 'tts:en_GB-alan-medium', 'tts:en_US-joe-medium',
];
const suggestVoice = (i) => VOICE_SUGGESTIONS[i % VOICE_SUGGESTIONS.length];

/** Spread cast across the lower third, which reads as a stage. */
function layoutCast(n, width, height) {
    const y = Math.round(height * 0.82);
    if (n <= 0) return [];
    if (n === 1) return [[Math.round(width * 0.5), y]];
    const out = [];
    for (let i = 0; i < n; i++) {
        const u = (i + 1) / (n + 1);
        out.push([Math.round(width * (0.22 + u * 0.56)), y]);
    }
    return out;
}

const normalizeSpeaker = (s) => s.trim().replace(/\s+/g, ' ');
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const truncate = (s) => (s.length > 44 ? `${s.slice(0, 44)}...` : s);
