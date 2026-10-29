/* Pure Go rules and educational search algorithms, shared by the UI and AI worker. */
/** List orthogonal neighbors without wrapping board edges.
 *
 * @param index - Intersection index.
 * @param size - Board width.
 * @returns Adjacent intersection indices.
 */
export function neighbors(index, size) {
    return [index % size > 0 ? index - 1 : -1, index % size < size - 1 ? index + 1 : -1, index >= size ? index - size : -1, index < size * (size - 1) ? index + size : -1].filter(value => value >= 0);
}
/** Collect a connected group and its distinct liberties.
 *
 * @param board - Flat board array.
 * @param index - Occupied seed intersection.
 * @param size - Board width.
 * @returns Stones and liberties as sets.
 */
export function group(board, index, size) {
    const stones = new Set([index]);
    const liberties = new Set();
    for (const stone of stones) {
        for (const next of neighbors(stone, size)) {
            if (board[next] === 0) liberties.add(next);
            else if (board[next] === board[index]) stones.add(next);
        }
    }
    return { stones, liberties };
}
/** Apply captures, suicide prevention, and positional superko.
 *
 * @param board - Current board array.
 * @param index - Proposed move.
 * @param color - Stone color, one for black and two for white.
 * @param size - Board width.
 * @param history - Previous position keys.
 * @returns Legal successor and captures, or null for an illegal move.
 */
export function play(board, index, color, size, history = []) {
    if (index < 0 || index >= board.length || board[index]) return null;
    const next = board.slice();
    next[index] = color;
    let captured = 0;
    for (const adjacent of neighbors(index, size)) {
        if (next[adjacent] !== 3 - color) continue;
        const enemy = group(next, adjacent, size);
        if (enemy.liberties.size === 0) {
            captured += enemy.stones.size;
            for (const stone of enemy.stones) next[stone] = 0;
        }
    }
    if (group(next, index, size).liberties.size === 0 || history.includes(next.join(''))) return null;
    return { board: next, captured };
}
/** Compute Chinese area by flood filling empty regions.
 *
 * @param board - Flat board array.
 * @param size - Board width.
 * @returns Black and white area totals, including 6.5 white komi.
 */
export function score(board, size) {
    const totals = [0, 0, 6.5];
    const visited = new Set();
    board.forEach((color, index) => {
        if (color) { totals[color]++; return; }
        if (visited.has(index)) return;
        const region = new Set([index]);
        const borders = new Set();
        for (const empty of region) {
            visited.add(empty);
            for (const adjacent of neighbors(empty, size)) {
                if (board[adjacent]) borders.add(board[adjacent]);
                else if (!region.has(adjacent)) region.add(adjacent);
            }
        }
        if (borders.size === 1) totals[[...borders][0]] += region.size;
    });
    return { black: totals[1], white: totals[2] };
}
/** Evaluate groups using stones, liberties, and vulnerability.
 *
 * @param board - Flat board array.
 * @param size - Board width.
 * @param color - Evaluating player's color.
 * @returns Signed heuristic advantage.
 */
export function evaluate(board, size, color) {
    let total = 0;
    const seen = new Set();
    board.forEach((stone, index) => {
        if (!stone || seen.has(index)) return;
        const current = group(board, index, size);
        for (const member of current.stones) seen.add(member);
        const value = current.stones.size * 3 + Math.min(current.liberties.size, 8) * 0.8 - (current.liberties.size === 1 ? current.stones.size * 5 : 0);
        total += stone === color ? value : -value;
    });
    return total;
}
/** Rank nearby legal moves; restrict breadth to make browser search practical.
 *
 * @param board - Current board.
 * @param size - Board width.
 * @param color - Moving color.
 * @param history - Previous position keys.
 * @param limit - Maximum candidates.
 * @returns Ranked move objects with successor boards.
 */
export function candidates(board, size, color, history, limit = 12) {
    const occupied = board.some(Boolean);
    const moves = [];
    for (let index = 0; index < board.length; index++) {
        if (board[index]) continue;
        const x = index % size;
        const y = Math.floor(index / size);
        // Include local continuations and strategic opening points across the board.
        const star = [2, size - 3, Math.floor(size / 2)];
        const nearby = neighbors(index, size).some(n => board[n] || neighbors(n, size).some(k => board[k]));
        if (occupied && !nearby && !(star.includes(x) && star.includes(y))) continue;
        const result = play(board, index, color, size, history);
        if (!result) continue;
        const edge = Math.min(x, y, size - 1 - x, size - 1 - y);
        const rank = evaluate(result.board, size, color) + result.captured * 3 + Math.min(edge, 2) * 0.5;
        moves.push({ index, ...result, rank });
    }
    return moves.sort((a, b) => b.rank - a.rank).slice(0, limit);
}
/** Choose a move using random, greedy, alpha-beta minimax, or UCT MCTS.
 *
 * @param request - Board, settings, color, history, and selected algorithm.
 * @returns Move index and search statistics.
 */
export function chooseMove(request) {
    const { board, size, color, history, algorithm, settings } = request;
    const started = performance.now();
    const deadline = started + 1800;
    let nodes = 0;
    let completedDepth = 0;
    let iterations = 0;
    let selected = -1;
    const roots = candidates(board, size, color, history, settings.breadth || 12);
    if (algorithm === 'random') {
        const legal = board.flatMap((stone, index) => !stone && play(board, index, color, size, history) ? [index] : []);
        selected = legal.length ? legal[Math.floor(Math.random() * legal.length)] : -1;
        nodes = legal.length;
    } else if (algorithm === 'greedy') {
        const temperature = settings.temperature || 0;
        const ranked = roots.map(move => ({ ...move, noise: move.rank + Math.random() * temperature }));
        ranked.sort((a, b) => b.noise - a.noise);
        selected = ranked[0]?.index ?? -1;
        nodes = roots.length;
    } else if (algorithm === 'minimax') {
        selected = roots[0]?.index ?? -1;
        /** Search alternating moves, pruning branches outside the alpha-beta window.
         *
         * @param position - Search position.
         * @param turn - Color to move.
         * @param depth - Remaining plies.
         * @param alpha - Lower bound.
         * @param beta - Upper bound.
         * @param past - Position history for this branch.
         * @returns Minimax heuristic score.
         */
        function search(position, turn, depth, alpha, beta, past) {
            nodes++;
            if (performance.now() > deadline) throw new Error('budget');
            if (!depth) return evaluate(position, size, color);
            const moves = candidates(position, size, turn, past, settings.breadth);
            if (!moves.length) return evaluate(position, size, color);
            let best = turn === color ? -Infinity : Infinity;
            for (const move of moves) {
                const value = search(move.board, 3 - turn, depth - 1, alpha, beta, [...past, move.board.join('')]);
                best = turn === color ? Math.max(best, value) : Math.min(best, value);
                if (turn === color) alpha = Math.max(alpha, best);
                else beta = Math.min(beta, best);
                if (beta <= alpha) break;
            }
            return best;
        }
        // Iterative deepening always keeps the last fully completed search result.
        for (let depth = 1; depth <= settings.depth; depth++) {
            let bestValue = -Infinity;
            let bestMove = selected;
            try {
                for (const move of roots) {
                    const value = search(move.board, 3 - color, depth - 1, bestValue, Infinity, [...history, move.board.join('')]);
                    if (value > bestValue) { bestValue = value; bestMove = move.index; }
                }
                selected = bestMove;
                completedDepth = depth;
            } catch { break; }
        }
    } else if (roots.length) {
        const root = { board, turn: color, past: history, visits: 0, value: 0, children: [], untried: roots, parent: null };
        for (; iterations < settings.simulations && performance.now() < deadline; iterations++) {
            let node = root;
            // UCT selection uses the perspective of the player choosing each child.
            while (!node.untried.length && node.children.length) {
                const sign = node.turn === color ? 1 : -1;
                node = node.children.reduce((best, child) => {
                    const uct = candidate => sign * candidate.value / candidate.visits + settings.exploration * Math.sqrt(Math.log(candidate.parent.visits + 1) / candidate.visits);
                    return !best || uct(child) > uct(best) ? child : best;
                }, null);
            }
            if (node.untried.length) {
                const move = node.untried.shift();
                const past = [...node.past, move.board.join('')];
                const child = { board: move.board, turn: 3 - node.turn, past, index: move.index, visits: 0, value: 0, parent: node, children: [], untried: candidates(move.board, size, 3 - node.turn, past, 6) };
                node.children.push(child);
                node = child;
                nodes++;
            }
            let position = node.board;
            let turn = node.turn;
            const past = [...node.past];
            for (let ply = 0; ply < 10 && performance.now() < deadline; ply++) {
                const moves = candidates(position, size, turn, past, 6);
                if (!moves.length) break;
                position = moves[Math.floor(Math.random() * moves.length)].board;
                past.push(position.join(''));
                turn = 3 - turn;
            }
            const reward = Math.tanh(evaluate(position, size, color) / 20);
            while (node) {
                node.visits++;
                node.value += reward;
                node = node.parent;
            }
        }
        selected = root.children.sort((a, b) => b.visits - a.visits)[0]?.index ?? roots[0].index;
    }
    return { index: selected, nodes, depth: completedDepth, iterations, elapsed: Math.round(performance.now() - started) };
}
