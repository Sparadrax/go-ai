/* Coordinate the Go interface, game history, configurable AI, and worker lifecycle. */
import { play, score } from './engine.js';
/** Find an interface element by its stable identifier.
 *
 * @param id - Element identifier.
 * @returns Matching DOM element.
 */
const $ = id => document.getElementById(id);
const definitions = {
    minimax: { name: 'Minimax', tag: 'TREE SEARCH', title: 'Thinking a few moves ahead.', description: 'Explores possible moves and your best responses. Alpha–beta pruning skips branches that cannot improve the outcome.', style: 'Tactical', complexity: 'O(bᵈ)', note: 'Deeper search looks further ahead. Search is capped at about 2 seconds; completed depth is reported below.', controls: [['depth', 'Search depth', 1, 4, 1, 2, 'Quick', 'Thorough'], ['breadth', 'Candidate moves per node', 4, 16, 1, 8, 'Focused', 'Broad']] },
    mcts: { name: 'MCTS', tag: 'MONTE CARLO TREE SEARCH', title: 'Learning by exploring.', description: 'Builds a search tree with UCT selection, short simulated games, and backpropagation of heuristic outcomes.', style: 'Exploratory', complexity: 'Budget-based', note: 'Uses 10-ply heuristic rollouts and a restricted move set. Actual simulations depend on the 2-second budget.', controls: [['simulations', 'Simulation budget', 20, 400, 20, 100, 'Quick', 'More exploration'], ['exploration', 'Exploration constant', 0.2, 3, 0.1, 1.4, 'Exploit', 'Explore']] },
    greedy: { name: 'Greedy', tag: 'HEURISTIC SEARCH', title: 'Make the most of this move.', description: 'Scores immediate positions by captures, group strength, liberties, and edge distance. No opponent reply is searched.', style: 'Opportunistic', complexity: 'One ply', note: 'Randomness perturbs the immediate move score. Higher values make choices less predictable.', controls: [['temperature', 'Randomness', 0, 10, 1, 0, 'Deterministic', 'Unpredictable']] },
    random: { name: 'Random', tag: 'RANDOM BASELINE', title: 'Expect the unexpected.', description: 'Chooses uniformly from all legal intersections. A simple baseline for comparing strategy with chance.', style: 'Unpredictable', complexity: 'O(board area)', note: 'No strategic parameters. Every legal empty intersection has the same chance of selection.', controls: [] }
};
let size = 9;
let state;
let snapshots = [];
let worker;
let thinking = false;
let settings = {};
let last = -1;
/** Rebuild the parameter controls for the selected AI.
 *
 * Inputs: None; uses enclosing state where needed.
 * @returns Updates opponent descriptions and editable settings.
 */
function configure() {
    const definition = definitions[$('algorithm').value];
    for (const [id, key] of [['algorithmTag', 'tag'], ['algorithmTitle', 'title'], ['algorithmDescription', 'description'], ['styleTag', 'style'], ['complexityTag', 'complexity'], ['parameterNote', 'note']]) $(id).textContent = definition[key];
    $('opponentName').innerHTML = `${definition.name} <small>WHITE</small>`;
    settings = {};
    $('parameters').replaceChildren();
    for (const [key, title, min, max, step, initial, low, high] of definition.controls) {
        settings[key] = initial;
        const element = document.createElement('div');
        element.innerHTML = `<div class="range-label"><label for="${key}">${title}</label><output for="${key}">${initial}</output></div><input type="range" id="${key}" min="${min}" max="${max}" step="${step}" value="${initial}"><div class="range-ends"><span>${low}</span><span>${high}</span></div>`;
        element.querySelector('input').addEventListener('input', event => {
            settings[key] = Number(event.target.value);
            element.querySelector('output').value = event.target.value;
        });
        $('parameters').append(element);
    }
}
/** Draw intersections, coordinates, star points, and current stones.
 *
 * Inputs: None; uses enclosing state where needed.
 * @returns Replaces the board and updates game indicators.
 */
function render() {
    const board = $('board');
    board.replaceChildren();
    const grid = document.createElement('div');
    grid.className = 'board-grid';
    grid.style.backgroundSize = `${100 / (size - 1)}% ${100 / (size - 1)}%`;
    board.append(grid);
    const stars = size === 9 ? [2, 4, 6] : size === 13 ? [3, 6, 9] : [3, 9, 15];
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const index = y * size + x;
            const left = 8 + x * 84 / (size - 1);
            const top = 8 + y * 84 / (size - 1);
            if (stars.includes(x) && stars.includes(y) && (size !== 9 || (x === y || x + y === 8))) {
                const star = document.createElement('span');
                star.className = 'star';
                star.style.cssText = `left:${left}%;top:${top}%`;
                board.append(star);
            }
            const point = document.createElement('button');
            const color = state.board[index];
            point.className = `point ${color === 1 ? 'black' : color === 2 ? 'white' : 'empty'}${last === index ? ' last' : ''}`;
            point.style.cssText = `left:${left}%;top:${top}%;width:${76 / (size - 1)}%;height:${76 / (size - 1)}%`;
            point.setAttribute('role', 'gridcell');
            point.setAttribute('aria-label', `${'ABCDEFGHJKLMNOPQRST'[x]}${size - y}, ${color === 1 ? 'black' : color === 2 ? 'white' : 'empty'}`);
            point.disabled = thinking || state.over || state.turn !== 1 || Boolean(color);
            point.addEventListener('click', () => humanMove(index));
            board.append(point);
        }
        for (const [text, left, top] of [[size - y, 3.5, 8 + y * 84 / (size - 1)], ['ABCDEFGHJKLMNOPQRST'[y], 8 + y * 84 / (size - 1), 97]]) {
            const label = document.createElement('span');
            label.className = 'coordinate';
            label.textContent = text;
            label.style.cssText = `left:${left}%;top:${top}%`;
            board.append(label);
        }
    }
    $('blackCaptures').textContent = `${state.captures[1]} captures`;
    $('whiteCaptures').textContent = `${state.captures[2]} captures`;
    $('moveCount').textContent = `MOVE ${state.moves}`;
    $('boardLabel').textContent = `${size} × ${size} BOARD`;
    $('pass').disabled = thinking || state.over || state.turn !== 1;
    $('resign').disabled = state.over;
    $('undo').disabled = !snapshots.length;
    $('blackTurn').textContent = thinking ? 'WAITING' : state.over ? 'FINISHED' : 'TO PLAY';
    $('algorithm').disabled = thinking;
    if (!state.over) $('status').textContent = thinking ? 'AI is thinking…' : 'Your move';
}
/** Start a clean game and cancel any outstanding search.
 *
 * Inputs: None; uses enclosing state where needed.
 * @returns Resets all board state, history, and analysis.
 */
function reset() {
    $('gameOver').close();
    worker?.terminate();
    thinking = false;
    size = Number($('boardSize').value);
    const board = Array(size * size).fill(0);
    state = { board, turn: 1, captures: [0, 0, 0], history: [board.join('')], moves: 0, passes: 0, over: false };
    snapshots = [];
    last = -1;
    $('turnInfo').textContent = 'You are playing black';
    $('analysis').textContent = 'Play your first stone to see the AI in action.';
    $('metrics').replaceChildren();
    render();
}
/** Apply a legal move or pass and resolve scoring after two passes.
 *
 * @param index - Intersection index, or minus one for pass.
 * @returns Whether the action was applied.
 */
function commit(index) {
    const result = index < 0 ? null : play(state.board, index, state.turn, size, state.history);
    if (index >= 0 && !result) return false;
    if (result) {
        state.board = result.board;
        state.captures[state.turn] += result.captured;
        state.history.push(state.board.join(''));
    }
    state.passes = index < 0 ? state.passes + 1 : 0;
    state.moves++;
    state.turn = 3 - state.turn;
    last = index;
    if (state.passes === 2) {
        finishGame('score');
    }
    return true;
}
/** End play and show the result with restart and board review actions.
 *
 * @param reason - Either score after two passes or resignation by the human.
 * @returns Stops the AI, locks play, and opens the result dialog.
 */
function finishGame(reason) {
    worker?.terminate();
    thinking = false;
    state.over = true;
    const totals = score(state.board, size);
    const lost = reason === 'resignation' || totals.white > totals.black;
    const title = lost ? 'You lost' : 'You won!';
    const description = reason === 'resignation'
        ? 'You resigned. White wins. Restart to try again with the same board size and AI settings.'
        : `Both players passed. Black: ${totals.black}. White: ${totals.white}, including 6.5 komi. ${lost ? 'White' : 'Black'} wins by ${Math.abs(totals.white - totals.black)} points.`;
    $('status').textContent = title;
    $('turnInfo').textContent = reason === 'resignation' ? 'White wins by resignation' : `Black ${totals.black} · White ${totals.white}`;
    $('analysis').textContent = description;
    $('resultTitle').textContent = title;
    $('resultDescription').textContent = description;
    render();
    $('gameOver').showModal();
}
/** Record a human turn and launch an off-thread AI reply.
 *
 * @param index - Selected intersection or pass.
 * @returns Updates the board and schedules the opponent.
 */
function humanMove(index) {
    if (thinking || state.over || state.turn !== 1) return;
    const snapshot = { state: structuredClone(state), last };
    if (!commit(index)) {
        $('status').textContent = 'Illegal move';
        $('turnInfo').textContent = 'Suicide or repeated position';
        return;
    }
    snapshots.push(snapshot);
    if (state.over) { render(); return; }
    thinking = true;
    render();
    worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    const algorithm = $('algorithm').value;
    worker.onmessage = event => {
        thinking = false;
        worker.terminate();
        if (event.data.error) {
            state = snapshot.state;
            last = snapshot.last;
            snapshots.pop();
            render();
            $('status').textContent = 'Search failed — try again';
            return;
        }
        const result = event.data;
        commit(result.index);
        render();
        if (!state.over) {
            $('turnInfo').textContent = result.index < 0 ? 'AI passed · you may pass to finish' : 'You are playing black';
            $('analysis').textContent = `${definitions[algorithm].name} ${result.index < 0 ? 'passed' : `played ${'ABCDEFGHJKLMNOPQRST'[result.index % size]}${size - Math.floor(result.index / size)}`}. ${algorithm === 'minimax' ? `Completed depth ${result.depth} with alpha–beta pruning.` : algorithm === 'mcts' ? `Completed ${result.iterations} UCT simulations.` : algorithm === 'greedy' ? 'Selected an immediate heuristic move.' : 'Sampled uniformly from legal moves.'}`;
        }
        $('metrics').textContent = `${result.elapsed} ms · ${result.nodes} ${algorithm === 'random' ? 'legal moves' : 'nodes examined'}`;
    };
    worker.onerror = () => {
        worker.terminate();
        thinking = false;
        state = snapshot.state;
        last = snapshot.last;
        snapshots.pop();
        render();
        $('status').textContent = 'AI unavailable — please retry';
    };
    worker.postMessage({ board: state.board, size, color: 2, history: state.history, algorithm, settings: { ...settings } });
}
$('algorithm').addEventListener('change', configure);
$('boardSize').addEventListener('change', reset);
$('newGame').addEventListener('click', reset);
$('restartGame').addEventListener('click', reset);
$('reviewGame').addEventListener('click', () => $('gameOver').close());
$('resign').addEventListener('click', () => {
    if (!state.over) finishGame('resignation');
});
$('pass').addEventListener('click', () => humanMove(-1));
$('undo').addEventListener('click', () => {
    if (!snapshots.length) return;
    worker?.terminate();
    thinking = false;
    $('gameOver').close();
    const snapshot = snapshots.pop();
    state = snapshot.state;
    last = snapshot.last;
    $('turnInfo').textContent = 'You are playing black';
    $('analysis').textContent = 'Turn undone. Try a different approach.';
    $('metrics').replaceChildren();
    render();
});
for (const id of ['rulesButton', 'learn']) $(id).addEventListener('click', () => $('rules').showModal());
$('closeRules').addEventListener('click', () => $('rules').close());
configure();
reset();
