---
title: Design Tic-Tac-Toe
level: easy
time: 40
summary: A two-player board game with O(1) win detection, pluggable move sources (human and bot), result codes instead of exceptions, and extensions to NxN, K-in-a-row, undo and spectators.
---

:::problem Design Tic-Tac-Toe {level=easy tags="games,2D board,strategy,beginner"}
Design a Tic-Tac-Toe game for two players on an N×N board. Players take turns placing their mark. The first to fill a full row, column or diagonal wins; if the board fills with no winner it is a draw. Make it easy to plug in different kinds of players (human, simple bot).

:::hint Hint
Do not rescan the whole board after every move. Keep one counter per row, per column and per diagonal for each player: a win is a counter reaching N. Make "where does the next move come from" an interface.
:::
:::

## Step 1: requirements

| Question | Assumption |
|---|---|
| Board size? | N×N, default 3 (configurable) |
| Players? | exactly two, marks `X` and `O`, X moves first |
| Input? | a move is (row, column); invalid or occupied cells are rejected and the player tries again |
| End conditions? | N marks in a row/column/diagonal wins; full board is a draw |
| Player kinds? | human (scripted here) and a simple bot, behind one interface |
| Out of scope | GUI, network play, smart AI (mention minimax) |

## Step 2: entities

- **Mark** (enum): `X`, `O`, `Empty`.
- **Board**: owns the grid and the counters; knows if a cell is free, places a mark, reports a win.
- **Player**: name, mark, and a **MoveSource** (the strategy that produces the next move).
- **MoveSource** (interface): `Move next(const Board&)`. Implementations: `ScriptedMoves` (stands in for a human), `FirstFreeBot`.
- **Game**: runs turns, switches players, asks the board for the outcome, returns a `GameStatus`.

```viz algo=uml title="Tic-Tac-Toe: class diagram"
class Game
  - board: Board
  - players: Player[2]
  - current: int
  + play(): GameStatus
  + applyMove(m: Move): MoveResult
class Board
  - size: int
  - cells: Mark[][]
  - rowCount: int[2][]
  - colCount: int[2][]
  + place(r: int, c: int, m: Mark): bool
  + isFree(r: int, c: int): bool
  + hasWon(m: Mark): bool
  + isFull(): bool
class Player
  - name: string
  - mark: Mark
  - source: MoveSource
interface MoveSource
  + next(b: Board): Move
class ScriptedMoves
class FirstFreeBot
enum Mark
Game *-- Board
Game *-- Player : 2
Player --> MoveSource
ScriptedMoves ..|> MoveSource
FirstFreeBot ..|> MoveSource
Board ..> Mark
```

## Step 3: the flow

```viz algo=seq title="One turn"
participant g Game [box]
participant p Player [user]
participant s MoveSource [box]
participant b Board [db]
g -> p : yourTurn()
p -> s : next(board) | The source may be a human prompt, a script or a bot.
s --> p : Move(r, c)
p --> g : Move(r, c)
g -> b : place(r, c, mark) | Rejected if the cell is taken or out of range: the same player moves again.
b --> g : ok
g -> b : hasWon(mark) | O(1): updates row, column and diagonal counters.
b --> g : false
g -> g : switch to the other player
```

## Step 4: design decisions

- **O(1) win check**: for each mark keep `rows[r]`, `cols[c]`, `diag`, `anti`. Placing at `(r,c)` increments them; if any equals N, that player wins. No board scans.
- **MoveSource is a Strategy**: the game never knows whether a human or a bot is playing, so adding a smarter AI is a new class.
- **Results, not exceptions**: illegal moves are normal in a game. `place` returns `bool`; `applyMove` returns a `MoveResult` enum.
- **Game owns the turn loop**; the board knows only rules of placement and winning (SRP).

## Step 5: the code

```cpp run title="Tic-Tac-Toe: complete"
#include <iostream>
#include <memory>
#include <string>
#include <utility>
#include <vector>
using namespace std;

enum class Mark { Empty = 0, X = 1, O = 2 };
char symbol(Mark m) { return m == Mark::X ? 'X' : m == Mark::O ? 'O' : '.'; }

struct Move { int row, col; };
enum class MoveResult { Invalid, Ok, Win, Draw };

class Board {
    int n_;
    vector<vector<Mark>> cells_;
    vector<vector<int>> rows_, cols_;                      // [player index][row or col] counters
    vector<int> diag_, anti_;                              // [player index]
    int filled_ = 0;
    static int idx(Mark m) { return m == Mark::X ? 0 : 1; }
public:
    explicit Board(int n = 3) : n_(n), cells_(n, vector<Mark>(n, Mark::Empty)), rows_(2, vector<int>(n, 0)), cols_(2, vector<int>(n, 0)), diag_(2, 0), anti_(2, 0) {}
    int size() const { return n_; }
    bool inRange(int r, int c) const { return r >= 0 && r < n_ && c >= 0 && c < n_; }
    bool isFree(int r, int c) const { return inRange(r, c) && cells_[r][c] == Mark::Empty; }
    bool isFull() const { return filled_ == n_ * n_; }

    bool place(int r, int c, Mark m) {
        if (!isFree(r, c)) return false;
        cells_[r][c] = m;
        ++filled_;
        int p = idx(m);
        ++rows_[p][r]; ++cols_[p][c];
        if (r == c) ++diag_[p];
        if (r + c == n_ - 1) ++anti_[p];
        lastWinner_ = (rows_[p][r] == n_ || cols_[p][c] == n_ || diag_[p] == n_ || anti_[p] == n_) ? m : Mark::Empty;
        return true;
    }
    bool lastMoveWon() const { return lastWinner_ != Mark::Empty; }
    void print() const {
        for (const auto& row : cells_) { cout << "    "; for (Mark m : row) cout << symbol(m) << ' '; cout << "\n"; }
    }
private:
    Mark lastWinner_ = Mark::Empty;
};

class MoveSource {                                         // the strategy: where do moves come from?
public:
    virtual ~MoveSource() = default;
    virtual Move next(const Board& b) = 0;
};
class ScriptedMoves : public MoveSource {                  // stands in for a human typing coordinates
    vector<Move> script_; size_t i_ = 0;
public:
    explicit ScriptedMoves(vector<Move> s) : script_(move(s)) {}
    Move next(const Board&) override { return script_.at(i_++); }
};
class FirstFreeBot : public MoveSource {                   // trivial bot: the first free cell
public:
    Move next(const Board& b) override {
        for (int r = 0; r < b.size(); ++r) for (int c = 0; c < b.size(); ++c) if (b.isFree(r, c)) return {r, c};
        return {-1, -1};
    }
};

struct Player { string name; Mark mark; unique_ptr<MoveSource> source; };

class Game {
    Board board_;
    vector<Player> players_;
    int current_ = 0;
public:
    Game(int n, Player a, Player b) : board_(n) { players_.push_back(move(a)); players_.push_back(move(b)); }

    MoveResult applyMove(Move m) {
        Player& p = players_[current_];
        if (!board_.place(m.row, m.col, p.mark)) return MoveResult::Invalid;     // same player moves again
        if (board_.lastMoveWon()) return MoveResult::Win;
        if (board_.isFull()) return MoveResult::Draw;
        current_ = 1 - current_;
        return MoveResult::Ok;
    }
    void play() {
        for (;;) {
            Player& p = players_[current_];
            Move m = p.source->next(board_);
            MoveResult r = applyMove(m);
            if (r == MoveResult::Invalid) { cout << "  " << p.name << " tried (" << m.row << "," << m.col << "): invalid, try again\n"; continue; }
            cout << "  " << p.name << " (" << symbol(p.mark) << ") plays (" << m.row << "," << m.col << ")\n";
            if (r == MoveResult::Win) { board_.print(); cout << "  " << p.name << " wins!\n"; return; }
            if (r == MoveResult::Draw) { board_.print(); cout << "  draw\n"; return; }
        }
    }
};

int main() {
    cout << "Game 1: a human (scripted) against the bot\n";
    Game g1(3, Player{"Asha", Mark::X, make_unique<ScriptedMoves>(vector<Move>{{1, 1}, {1, 1}, {0, 0}, {2, 2}, {0, 2}, {2, 0}})},
               Player{"Bot",  Mark::O, make_unique<FirstFreeBot>()});
    g1.play();

    cout << "Game 2: a 4x4 board, two scripted players\n";
    Game g2(4, Player{"P1", Mark::X, make_unique<ScriptedMoves>(vector<Move>{{0, 0}, {1, 1}, {2, 2}, {3, 3}})},
               Player{"P2", Mark::O, make_unique<ScriptedMoves>(vector<Move>{{0, 1}, {0, 2}, {0, 3}})});
    g2.play();
}
```

## Edge cases the design handles

| Case | Behaviour |
|---|---|
| Move off the board or onto an occupied cell | `place` returns false, the game reports it and the **same** player moves again |
| Winning move that also fills the board | win is checked **before** draw |
| Board size other than 3 | counters are sized by N; nothing else changes |
| Both diagonals | `r == c` and `r + c == N-1` counters |

## Extensions and follow-ups

| Follow-up | How the design absorbs it |
|---|---|
| "K in a row on a larger board" (Gomoku) | replace the counter check by a local scan of the 4 lines through the last move: only `Board` changes |
| "Undo" | a **Command** per move (`PlaceCommand` with `undo` decrementing counters) and a stack in `Game` |
| "Smarter AI" | new `MoveSource` (minimax with alpha-beta; for 3x3 the whole tree is small) |
| "More than two players" | marks become an id; counters become `[player][line]`; `Game` rotates through a list |
| "Spectators and replay" | **Observer**: `Game` publishes `MoveMade`/`GameEnded`; keep a move list for replay |
| "Network play" | a `RemoteMoveSource` reads moves from a socket; nothing else changes |
| "Thread-safety" | one mutex in `Game::applyMove` (a game is a single serial state machine) |

```quiz
? Why keep per-row, per-column and diagonal counters?
- To print the board
+ A move can be checked for a win in O(1) instead of rescanning the board
- To support undo
> Incrementing four counters per move replaces an O(N) or O(N²) scan.
? Why is the move source an interface?
- C++ requires it
+ Human, bot and network players become interchangeable strategies
- To make the board generic
> Adding a smarter AI means a new class, with no change to Game.
```

:::keypoints
- Board (placement, win counters), Player + MoveSource (strategy), Game (turn loop, results): three clear responsibilities.
- O(1) win check with row, column and diagonal counters. Illegal moves return a result instead of throwing.
- Easy extensions: AI via a new MoveSource, undo via Command, spectators via Observer, K-in-a-row by changing only Board.
:::
