/** Rebuild the drawn-dog check films from `dog.mjs`. */
import { writeFileSync, mkdirSync } from 'node:fs';
import { drawnDogParts } from './dog.mjs';

mkdirSync('films/drawn', { recursive: true });
const parts = drawnDogParts({ k: 1 });
const base = {
    version: 'jirex.film/1',
    palettes: { paper: { ink: '#7a4a2c', bg: '#f7e7d4' } },
    characters: { dog: { palette: 'paper', generate: { kind: 'quadruped' },
                         proportions: { length: 300 }, parts } },
};

writeFileSync('films/drawn/dog-walk.json', JSON.stringify({
    ...base,
    meta: { title: 'drawn dog walks', fps: 24, width: 1280, height: 720 },
    scenes: [{ id: 's1', palette: 'paper', background: { color: 'bg' }, ground: { y: 620 },
        cast: [{ character: 'dog', as: 'dog', at: [560] }],
        shots: [{ id: 'walk', duration: 3, step: 2, actions: [
            { target: 'dog', do: 'play', action: 'walk' },
            { target: 'dog', do: 'boil', rate: 8 }] }] }],
}, null, 2) + '\n');

writeFileSync('films/drawn/dog-drawn.json', JSON.stringify({
    ...base,
    meta: { title: 'drawn dog', fps: 24, width: 1280, height: 720 },
    scenes: [{ id: 's1', palette: 'paper', background: { color: 'bg' }, ground: { y: 640 },
        cast: [{ character: 'dog', as: 'dog', at: [560] }],
        shots: [{ id: 'a', duration: 2, actions: [] }] }],
}, null, 2) + '\n');
console.log('wrote films/drawn/dog-walk.json and dog-drawn.json');

// --- the bottle collector -------------------------------------------------
const { drawnManParts } = await import('./man.mjs');
const man = drawnManParts({ k: 1 });
writeFileSync('films/drawn/man.json', JSON.stringify({
    version: 'jirex.film/1',
    meta: { title: 'the bottle collector', fps: 24, width: 1024, height: 576 },
    palettes: { paper: { ink: '#7a4a2c', bg: '#f6e0cb' } },
    characters: { man: { palette: 'paper', proportions: { height: 440 }, parts: man } },
    scenes: [{ id: 's1', palette: 'paper', background: { color: 'bg' }, ground: { y: 560 },
        cast: [{ character: 'man', as: 'man', at: [620], scale: 1 }],
        shots: [{ id: 'a', duration: 2, actions: [] }] }],
}, null, 2) + '\n');
console.log('wrote films/drawn/man.json');
