/* Verify rules that could invalidate play and ensure all opponents return legal moves. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { play, score, chooseMove } from '../dist/engine.js';
test('captures surrounded stones and rejects suicide', () => {
    const board = [0, 1, 0, 1, 2, 1, 0, 0, 0];
    const result = play(board, 7, 1, 3);
    assert.equal(result.captured, 1);
    assert.equal(result.board[4], 0);
    assert.equal(play([0, 2, 0, 2, 0, 2, 0, 2, 0], 4, 1, 3), null);
});
test('rejects positional repetitions without mutating the board', () => {
    const board = Array(9).fill(0);
    const repeated = [1, 0, 0, 0, 0, 0, 0, 0, 0].join('');
    assert.equal(play(board, 0, 1, 3, [repeated]), null);
    assert.equal(board[0], 0);
});
test('area scoring includes enclosed territory and white komi', () => {
    assert.deepEqual(score([1, 1, 1, 1, 0, 1, 1, 1, 1], 3), { black: 9, white: 6.5 });
    assert.deepEqual(score(Array(9).fill(0), 3), { black: 0, white: 6.5 });
});
test('every algorithm returns a legal reply', () => {
    const board = Array(81).fill(0);
    board[20] = 1;
    for (const algorithm of ['random', 'greedy', 'minimax', 'mcts']) {
        const history = [board.join('')];
        const result = chooseMove({ board, size: 9, color: 2, history, algorithm, settings: { depth: 2, breadth: 6, simulations: 20, exploration: 1.4 } });
        assert.ok(play(board, result.index, 2, 9, history), algorithm);
    }
});
