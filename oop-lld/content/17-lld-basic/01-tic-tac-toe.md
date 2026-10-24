---
title: Design Tic-Tac-Toe
level: easy
time: 40
summary: A two-player board game. Learn how to check for a winner very quickly, how to let a human or a computer play through the same interface, and how to extend the game later.
---

:::problem Design Tic-Tac-Toe {level=easy tags="games,2D board,strategy,beginner"}
Design a Tic-Tac-Toe game for two players on an N×N board. Players take turns to place their mark. The first player to fill a full row, column or diagonal wins. If the board is full and nobody has won, it is a draw. Make it easy to plug in different kinds of players (a human, a simple computer player).

:::hint Hint
Do not check the whole board after every move. Instead, keep one counter for each row, each column and each diagonal, for each player. A player wins when one of their counters reaches N. Also, make "where does the next move come from?" an interface.
:::
:::

## Step 1: Ask questions (requirements)

| Question | Our assumption |
|---|---|
| Board size? | N×N, default 3, can be changed |
| Players? | exactly two, marks `X` and `O`, X goes first |
| How does a player move? | by giving a row and a column. If the cell is invalid or taken, the player tries again |
| When does the game end? | N marks in a row, column or diagonal wins. A full board is a draw |
| Kinds of players? | a human (we will use a fixed list of moves for the demo) and a simple computer player, behind one interface |
| Not needed | screen, network play, smart AI (we will only mention minimax) |

## Step 2: Find the classes

- **Mark** (enum): `X`, `O`, `Empty`.
- **Board**: holds the grid and the counters. It can say whether a cell is free, place a mark, and tell if someone won.
- **Player**: has a name, a mark, and a **MoveSource**.
- **MoveSource** (interface): "give me the next move". Two versions: `ScriptedMoves` (acts like a human) and `FirstFreeBot` (picks the first empty cell).
- **Game**: runs the turns, switches players, asks the board for the result, and reports the game status.

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

## Step 3: How one turn flows

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

In words: the game asks the current player for a move. The player asks its move source. The game gives the move to the board. The board says "ok", "taken" or "win". The game then decides what to do next.

## Step 4: Design decisions

- **Fast win check.** For each mark we keep `rows[r]`, `cols[c]`, `diag` and `anti`. When a mark is placed at `(r, c)`, we add 1 to these counters. If any counter becomes N, that player wins. We never scan the board.
- **MoveSource is a Strategy.** The game does not know if a human or a computer is playing. A smarter computer player is just a new class.
- **Results, not exceptions.** A wrong move is a normal thing in a game, so `place` returns `bool` and the game returns a small result value. We do not throw errors for it.
- **The game controls the turns.** The board only knows the rules of placing and winning. Each class has one job.

## Step 5: The code

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

## Edge cases

| Case | What happens |
|---|---|
| A move outside the board, or on a taken cell | `place` returns false. The game says so and the **same** player moves again |
| A winning move that also fills the board | the win is checked **before** the draw |
| A board size other than 3 | the counters use N, so nothing else changes |
| Both diagonals | counters for `r == c` and for `r + c == N-1` |

## What if the interviewer asks for more?

| Follow-up | How our design handles it |
|---|---|
| "K in a row on a bigger board" (Gomoku) | replace the counter check with a small scan of the 4 lines through the last move. Only `Board` changes |
| "Undo" | make each move a **Command** with an `undo`, and keep a stack in `Game` |
| "A smarter computer player" | write a new `MoveSource` (minimax for example) |
| "More than two players" | use a player id for the mark, counters become `[player][line]`, and `Game` goes through a list of players |
| "Watchers and replay" | **Observer**: `Game` announces `MoveMade` and `GameEnded`. Keep a list of moves for the replay |
| "Play over the network" | a `RemoteMoveSource` that reads moves from a socket. Nothing else changes |
| "Thread-safety" | one mutex in `Game::applyMove`, because a game is one step-by-step process |

## Short answer to say in an interview

:::interview How do you check for a winner quickly in Tic-Tac-Toe?
"I keep a counter for every row, every column and both diagonals, for each player. A move adds one to the counters it touches, and the player wins when a counter reaches N. This makes each check O(1) and I never scan the board. I make the move source an interface, so a human, a computer or a network player all work the same way."
:::

```quiz
? Why keep counters for rows, columns and diagonals?
- To print the board
+ We can check for a win in O(1) and never rescan the board
- To support undo
> Four small additions per move replace a full scan.
? Why is the move source an interface?
- C++ requires it
+ Human, computer and network players become interchangeable
- To make the board generic
> A smarter player is a new class, and Game does not change.
```

:::keypoints
- Three clear jobs: Board (placing and win counters), Player with MoveSource (the strategy), Game (the turn loop and results).
- Fast win check using row, column and diagonal counters. Wrong moves return a result, they do not throw errors.
- Easy to extend: AI with a new MoveSource, undo with Command, watchers with Observer, K-in-a-row by changing only Board.
:::
