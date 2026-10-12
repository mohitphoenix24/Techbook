---
title: Design a Board Game (Tic-Tac-Toe, and How It Generalises)
level: easy
time: 45
summary: Game-design LLD questions through tic-tac-toe on an N×N board — Board, Player, Game and move validation, O(1) win detection with row/column/diagonal counters, players as strategies (scripted human, rule-based bot), the game's state machine and move history with undo — in C++ and JavaScript, then how the same skeleton extends to Snake & Ladder and chess.
---

:::problem Design Tic-Tac-Toe {level=easy tags="LLD,Strategy,game design" lc=design-tic-tac-toe}
Design an N×N tic-tac-toe game for two players (humans or bots). Validate moves, detect a win or draw after each move in O(1), and make it easy to add new player types and rule variants.

:::hint Hint
Instead of scanning the board after every move, keep a counter per row, per column and per diagonal: +1 for player X, −1 for player O. A counter reaching ±N means a win.
:::
:::

Board games are popular LLD questions (tic-tac-toe, Snake & Ladder, chess, connect four) because they're small enough to code fully, yet they test modelling, validation, state machines and extensibility.

## Requirements

- N×N board (classic N = 3), two players with symbols.
- Players alternate; a move must be on the board and on an empty cell, by the player whose turn it is.
- Detect **win** (a full row, column or diagonal) and **draw** (board full) after every move.
- Players can be **humans** (moves from input) or **bots** (some strategy).
- Extensions: undo, move history, replay, scoreboard, larger "k in a row" variants.

## Design

```viz algo=uml title="Game classes"
class Game
  - board: Board
  - players: Player[2]
  - turn: int
  - state: GameState
  - history: Move[]
  + play(): GameState
  + makeMove(row, col): MoveResult
  + undo()
class Board
  - n: int
  - cells: char[][]
  - rowSum: int[]
  - colSum: int[]
  - diag: int
  - anti: int
  + place(r, c, player): bool
  + remove(r, c)
  + winnerAfter(r, c): bool
interface Player
  + symbol(): char
  + nextMove(b: Board): Move
class ScriptedPlayer
class RuleBasedBot
enum GameState
  IN_PROGRESS
  WON
  DRAW
Game *-- Board
Game o-- Player : 2
ScriptedPlayer ..|> Player
RuleBasedBot ..|> Player
Game --> GameState
```

- **Board** owns cells and the win counters; it knows nothing about turns.
- **Game** owns the rules of play (turn order, state transitions, history).
- **Player** is a strategy: `nextMove(board)`. Humans, scripted test players and bots are interchangeable.

## O(1) win detection

A naive check scans the row, column and both diagonals of the last move: O(N). The counter trick makes it O(1): X adds +1 and O adds −1 to `rowSum[r]`, `colSum[c]`, and to `diag` if `r == c`, and to `anti` if `r + c == N − 1`. If any of those reaches **±N**, that line is entirely one player's. Undo just subtracts the same amounts.

## Implementation

:::tabs Tic-tac-toe with O(1) wins, bots and undo
```cpp run
#include <bits/stdc++.h>
using namespace std;

struct Move { int r, c; };

class Board {
    int n_;
    vector<vector<char>> cells_;
    vector<int> rowSum_, colSum_;
    int diag_ = 0, anti_ = 0, filled_ = 0;
    static int weight(char s) { return s == 'X' ? 1 : -1; }
public:
    explicit Board(int n) : n_(n), cells_(n, vector<char>(n, '.')), rowSum_(n), colSum_(n) {}
    int n() const { return n_; }
    bool empty(int r, int c) const { return r >= 0 && c >= 0 && r < n_ && c < n_ && cells_[r][c] == '.'; }
    char at(int r, int c) const { return cells_[r][c]; }
    bool full() const { return filled_ == n_ * n_; }
    // places the symbol and returns true if this move wins: O(1)
    bool place(int r, int c, char s) {
        int w = weight(s);
        cells_[r][c] = s; filled_++;
        rowSum_[r] += w; colSum_[c] += w;
        if (r == c) diag_ += w;
        if (r + c == n_ - 1) anti_ += w;
        return abs(rowSum_[r]) == n_ || abs(colSum_[c]) == n_ || abs(diag_) == n_ || abs(anti_) == n_;
    }
    void remove(int r, int c) {
        int w = weight(cells_[r][c]);
        cells_[r][c] = '.'; filled_--;
        rowSum_[r] -= w; colSum_[c] -= w;
        if (r == c) diag_ -= w;
        if (r + c == n_ - 1) anti_ -= w;
    }
    void print() const { for (auto& row : cells_) { cout << "    "; for (char ch : row) cout << ch << ' '; cout << "\n"; } }
};

struct Player {
    virtual ~Player() = default;
    virtual char symbol() const = 0;
    virtual Move nextMove(Board& b) = 0;
};
class ScriptedPlayer : public Player {                    // a "human" whose clicks are scripted for the demo
    char s_; deque<Move> moves_;
public:
    ScriptedPlayer(char s, deque<Move> m) : s_(s), moves_(std::move(m)) {}
    char symbol() const override { return s_; }
    Move nextMove(Board&) override { Move m = moves_.front(); moves_.pop_front(); return m; }
};
class RuleBasedBot : public Player {                      // win if possible, else block, else centre, else first free
    char s_, opp_;
public:
    RuleBasedBot(char s, char opp) : s_(s), opp_(opp) {}
    char symbol() const override { return s_; }
    Move nextMove(Board& b) override {
        for (char who : {s_, opp_})                       // try each empty cell: would it win (for me / for them)?
            for (int r = 0; r < b.n(); r++)
                for (int c = 0; c < b.n(); c++)
                    if (b.empty(r, c)) { bool wins = b.place(r, c, who); b.remove(r, c); if (wins) return {r, c}; }
        int mid = b.n() / 2;
        if (b.empty(mid, mid)) return {mid, mid};
        for (int r = 0; r < b.n(); r++) for (int c = 0; c < b.n(); c++) if (b.empty(r, c)) return {r, c};
        throw logic_error("no moves left");
    }
};

enum class State { IN_PROGRESS, WON, DRAW };

class Game {
    Board board_;
    array<Player*, 2> players_;
    int turn_ = 0;
    State state_ = State::IN_PROGRESS;
    vector<Move> history_;
public:
    Game(int n, Player& x, Player& o) : board_(n), players_{&x, &o} {}
    string makeMove(Move m) {
        if (state_ != State::IN_PROGRESS) return "game over";
        if (!board_.empty(m.r, m.c)) return "invalid move";
        char s = players_[turn_]->symbol();
        bool won = board_.place(m.r, m.c, s);
        history_.push_back(m);
        if (won) { state_ = State::WON; return string(1, s) + " wins"; }
        if (board_.full()) { state_ = State::DRAW; return "draw"; }
        turn_ = 1 - turn_;
        return "ok";
    }
    void undo() {
        if (history_.empty()) return;
        auto m = history_.back(); history_.pop_back();
        board_.remove(m.r, m.c);
        if (state_ == State::IN_PROGRESS) turn_ = 1 - turn_;
        state_ = State::IN_PROGRESS;
    }
    string play() {
        string result = "ok";
        while (state_ == State::IN_PROGRESS) {
            Player* p = players_[turn_];
            Move m = p->nextMove(board_);
            result = makeMove(m);
            cout << "  " << p->symbol() << " -> (" << m.r << "," << m.c << ") " << result << "\n";
        }
        board_.print();
        return result;
    }
};

int main() {
    cout << "human X vs bot O (the bot blocks, then wins):\n";
    ScriptedPlayer human('X', {{0, 0}, {0, 1}, {2, 2}, {1, 0}});
    RuleBasedBot bot('O', 'X');
    Game g1(3, human, bot);
    g1.play();

    cout << "bot vs bot on 4x4:\n";
    RuleBasedBot x('X', 'O'), o('O', 'X');
    Game g2(4, x, o);
    g2.play();

    cout << "invalid moves and undo:\n";
    ScriptedPlayer a('X', {}), b('O', {});
    Game g3(3, a, b);
    cout << "  " << g3.makeMove({1, 1}) << ", again: " << g3.makeMove({1, 1}) << ", off board: " << g3.makeMove({5, 0}) << "\n";
    g3.undo();
    cout << "  after undo, (1,1) is free again: " << g3.makeMove({1, 1}) << "\n";
}
```
```js run
class Board {
  #cells; #rowSum; #colSum; #diag = 0; #anti = 0; #filled = 0;
  constructor(n) { this.n = n; this.#cells = Array.from({ length: n }, () => Array(n).fill(".")); this.#rowSum = Array(n).fill(0); this.#colSum = Array(n).fill(0); }
  isEmpty(r, c) { return r >= 0 && c >= 0 && r < this.n && c < this.n && this.#cells[r][c] === "."; }
  get full() { return this.#filled === this.n * this.n; }
  place(r, c, s) {                                       // returns true if this move wins: O(1)
    const w = s === "X" ? 1 : -1, n = this.n;
    this.#cells[r][c] = s; this.#filled++;
    this.#rowSum[r] += w; this.#colSum[c] += w;
    if (r === c) this.#diag += w;
    if (r + c === n - 1) this.#anti += w;
    return [this.#rowSum[r], this.#colSum[c], this.#diag, this.#anti].some((v) => Math.abs(v) === n);
  }
  remove(r, c) {
    const w = this.#cells[r][c] === "X" ? 1 : -1, n = this.n;
    this.#cells[r][c] = "."; this.#filled--;
    this.#rowSum[r] -= w; this.#colSum[c] -= w;
    if (r === c) this.#diag -= w;
    if (r + c === n - 1) this.#anti -= w;
  }
  print() { for (const row of this.#cells) console.log("    " + row.join(" ")); }
}

// Players are strategies: anything with symbol + nextMove(board)
const scripted = (symbol, moves) => ({ symbol, nextMove: () => moves.shift() });
const ruleBasedBot = (symbol, opp) => ({
  symbol,
  nextMove(b) {                                          // win if possible, else block, else centre, else first free
    for (const who of [symbol, opp])
      for (let r = 0; r < b.n; r++) for (let c = 0; c < b.n; c++)
        if (b.isEmpty(r, c)) { const wins = b.place(r, c, who); b.remove(r, c); if (wins) return [r, c]; }
    const mid = Math.floor(b.n / 2);
    if (b.isEmpty(mid, mid)) return [mid, mid];
    for (let r = 0; r < b.n; r++) for (let c = 0; c < b.n; c++) if (b.isEmpty(r, c)) return [r, c];
    throw new Error("no moves left");
  },
});

class Game {
  #board; #players; #turn = 0; #state = "IN_PROGRESS"; #history = [];
  constructor(n, x, o) { this.#board = new Board(n); this.#players = [x, o]; }
  makeMove([r, c]) {
    if (this.#state !== "IN_PROGRESS") return "game over";
    if (!this.#board.isEmpty(r, c)) return "invalid move";
    const s = this.#players[this.#turn].symbol;
    const won = this.#board.place(r, c, s);
    this.#history.push([r, c]);
    if (won) { this.#state = "WON"; return `${s} wins`; }
    if (this.#board.full) { this.#state = "DRAW"; return "draw"; }
    this.#turn = 1 - this.#turn;
    return "ok";
  }
  undo() {
    const m = this.#history.pop();
    if (!m) return;
    this.#board.remove(...m);
    if (this.#state === "IN_PROGRESS") this.#turn = 1 - this.#turn;
    this.#state = "IN_PROGRESS";
  }
  play() {
    let result = "ok";
    while (this.#state === "IN_PROGRESS") {
      const player = this.#players[this.#turn];
      const m = player.nextMove(this.#board);
      result = this.makeMove(m);
      console.log(`  ${player.symbol} -> (${m}) ${result}`);
    }
    this.#board.print();
    return result;
  }
}

console.log("human X vs bot O (the bot blocks, then wins):");
new Game(3, scripted("X", [[0, 0], [0, 1], [2, 2], [1, 0]]), ruleBasedBot("O", "X")).play();
console.log("bot vs bot on 4x4:");
new Game(4, ruleBasedBot("X", "O"), ruleBasedBot("O", "X")).play();
console.log("invalid moves and undo:");
const g3 = new Game(3, scripted("X", []), scripted("O", []));
console.log(`  ${g3.makeMove([1, 1])}, again: ${g3.makeMove([1, 1])}, off board: ${g3.makeMove([5, 0])}`);
g3.undo();
console.log(`  after undo, (1,1) is free again: ${g3.makeMove([1, 1])}`);
```
:::

## How this skeleton generalises

The same separation (**Board** = state, **Game** = rules and turns, **Player** = strategy, **Move** = command with undo) carries over to other game questions:

| Game | What changes |
|---|---|
| **Snake & Ladder** | the board is a list of 100 cells plus a `map<int,int>` of jumps (snakes and ladders); a `Dice` strategy (fair, loaded, multiple dice) decides moves; win = reaching 100 exactly (or with overshoot rules) |
| **Connect Four** | moves are columns; a piece falls to the lowest empty row; win = 4 in a row in any direction (check the 4 directions through the last piece) |
| **Chess** | an abstract `Piece` with `validMoves(board, from)` per subclass (Strategy/polymorphism); special rules (castling, en passant, promotion) as separate move types; check detection after each move; `Move` objects with undo for history and for bots that search ahead |
| **Any game with spectators / online play** | moves as **Commands** sent over the network; observers update clients; a server validates moves (never trust the client) |

```quiz
? How does the counter technique detect a win in O(1)?
+ Each move adds ±1 to its row, column and (if applicable) diagonal counters; a counter reaching ±N means one player owns the whole line
- It scans the whole board after every move
- It stores all winning lines in a set
> Only the four counters touched by the last move need checking.

? Why model Player as an interface with nextMove(board)?
+ Humans, scripted test players and bots of different strengths become interchangeable without changing Game (Strategy)
- To make the board immutable
- Because C++ requires it
> The game loop asks "the current player" for a move, whatever kind of player it is.

? Which change does the Board class need for Connect Four instead of tic-tac-toe?
+ A move chooses a column and the piece drops to the lowest empty row; win checks look for 4 in a row through that piece
- None at all
- Only the symbols change
> The game skeleton stays the same; board mechanics and win rules change.
```

:::keypoints
- Separate **Board** (cells + win bookkeeping), **Game** (turns, validation, state machine, history) and **Player** (a strategy).
- **O(1) win detection** with row/column/diagonal counters (±1 per player); undo subtracts.
- Moves as **commands** with history give undo, replay and network play.
- The skeleton extends to Snake & Ladder (jump map + dice strategy), Connect Four and chess (polymorphic pieces, special move types).
:::
