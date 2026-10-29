# Goban — Go AI Lab

Play Go against configurable Minimax with alpha–beta pruning, UCT Monte Carlo Tree Search, a greedy heuristic, or a uniform random opponent. Choose a 9×9, 13×13, or 19×19 board. All computation happens in the browser; AI searches run in a Web Worker.

Serve `dist` through an HTTP server, for example `python3 -m http.server 8000 --directory dist`. Run rules and engine checks with `npm test`. No dependencies or build step are required.

Rules include captures, suicide prevention, positional superko, two-pass game ending, Chinese area scoring, and 6.5 white komi. Dead groups must be captured through play before passing; automatic dead-stone and seki adjudication are not implemented.

These opponents demonstrate algorithms rather than professional Go strength. Minimax restricts candidate breadth and uses iterative deepening. MCTS restricts candidates and uses ten-ply rollouts with a heuristic reward. Both searches have an approximately two-second budget. Reported depth and simulation counts reflect completed work.

Source and deployment configuration belong to this independent project repository.
