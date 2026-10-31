/**
 * Shared machinery for the "Finding Gold" parts.
 *
 * The board helpers are generic and now live in `../lib/boards.mjs`, because
 * the Swahili gemstone series needed the same four. Re-exported here so every
 * part keeps the import it was written with.
 */
export { rng, squarePath, bez3, blinks, board, castBoard } from '../lib/boards.mjs';
