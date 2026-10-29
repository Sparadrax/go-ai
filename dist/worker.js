/* Run AI computation off the main thread to keep the board responsive. */
import { chooseMove } from './engine.js';
/** Resolve a single search request.
 *
 * @param event - Message containing board and algorithm settings.
 * @returns Posts the selected move and statistics, or an error.
 */
self.onmessage = function (event) {
    try { self.postMessage(chooseMove(event.data)); }
    catch (error) { self.postMessage({ error: error.message }); }
};
