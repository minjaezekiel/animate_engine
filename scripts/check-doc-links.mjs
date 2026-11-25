/**
 * Every relative link in the docs must point at something that exists.
 *
 * Written because splitting docs into `pending/` and `completed_phases/`
 * broke links in bulk, and the bulk rewrite that repaired them produced
 * doubled paths like `docs/completed_phases/docs/completed_phases/34-EARTH-3D.md`
 * -- the bare-name replacement matched inside a path it had already
 * rewritten. Those are invisible on GitHub until clicked, and a doc tree whose
 * index cannot be trusted is worse than one with no index, because the queue
 * is read from it.
 *
 * Checks relative targets only. External URLs are not fetched: this must be
 * runnable offline and must not make a doc check depend on someone's uptime.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, dirname, resolve, relative } from 'node:path';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const LINK = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

async function walk(dir, out = []) {
    for (const e of await readdir(dir, { withFileTypes: true })) {
        if (e.name.startsWith('.') || e.name === 'node_modules') continue;
        const p = join(dir, e.name);
        if (e.isDirectory()) await walk(p, out);
        else if (e.name.endsWith('.md')) out.push(p);
    }
    return out;
}

const files = (await walk(join(ROOT, 'docs'))).concat([join(ROOT, 'README.md')]);
let checked = 0;
const broken = [];

for (const file of files) {
    const text = await readFile(file, 'utf8');
    const lines = text.split('\n');
    for (const [n, line] of lines.entries()) {
        for (const m of line.matchAll(LINK)) {
            const href = m[1];
            // Skip external, mail, and in-page anchors.
            if (/^(https?:|mailto:|#)/.test(href)) continue;
            // A trailing #anchor is not part of the path. Line anchors like
            // `#L91` are deliberately not verified -- a file growing is not a
            // broken link.
            const target = resolve(dirname(file), href.split('#')[0]);
            if (!target || href.startsWith('#')) continue;
            checked++;
            try { await stat(target); }
            catch {
                broken.push(`${relative(ROOT, file)}:${n + 1}  ->  ${href}`);
            }
        }
    }
}

console.log(`${files.length} docs, ${checked} relative links checked`);
if (broken.length) {
    console.error(`\n${broken.length} broken:\n - ` + broken.join('\n - '));
    process.exit(1);
}
console.log('0 broken');
