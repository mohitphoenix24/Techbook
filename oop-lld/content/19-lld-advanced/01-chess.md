---
title: Design Chess
level: advanced
time: 75
summary: Chess with a class for each piece that knows how it moves, the difference between possible moves and legal moves, check, checkmate and stalemate, moves as objects that can be undone, pawn promotion, and a complete game that ends in the shortest checkmate.
---

:::problem Design Chess {level=hard tags="games,polymorphism,Command,undo,rules engine,classic"}
Design a two-player chess game. The board has 8×8 squares and 32 pieces. Each kind of piece moves differently. The game enforces turns, refuses illegal moves (including moves that leave your own king in check), finds check, checkmate and stalemate, supports undo, and handles pawn promotion. Make it easy to add rules (castling, en passant) and different kinds of players (human, computer).
:::

:::hint Hint
Keep **how a piece moves** (each piece makes a list of possible moves from its square) separate from **what is legal** (a move is legal only if, after making it, your own king is not under attack). Make a move an object that can be **applied and undone**. This also gives a cheap way to test legality: make the move, check for check, undo it.
:::

## First, two words you need

- A **pseudo-legal move** is a move that follows how the piece moves, but we have not yet checked if it leaves our own king in danger.
- A **legal move** is a pseudo-legal move that does **not** leave our own king in check.

## Step 1: Ask questions (requirements)

| Question | Our assumption |
|---|---|
| Which rules are included? | how pieces move, captures, whose turn it is, check, checkmate, stalemate, pawn promotion (to a queen by default) |
| Not included (extensions) | castling, en passant, the 50-move rule, repeating positions, clocks |
| Input? | moves as coordinates (`e2e4`), read by the game |
| Players? | an interface `Player` that returns moves: a human (scripted) or a computer (a random legal move) |
| Undo? | as many times as you want, by taking moves off the history |
| Display? | a text board |
| Many threads? | a game is one step-by-step process. Use one lock for each game if it is shared |

## Step 2: Find the classes

```viz algo=uml title="Chess"
class Game
  - board: Board
  - turn: Color
  - history: Move[]
  + play(from: Square, to: Square): Result
  + undo(): void
  + status(): GameStatus
class Board
  - grid: Piece[8][8]
  + at(s: Square): Piece
  + apply(m: Move): void
  + undo(m: Move): void
  + isAttacked(s: Square, by: Color): bool
  + findKing(c: Color): Square
abstract class Piece
  # color: Color
  + symbol(): char
  + pseudoMoves(b: Board, from: Square): Move[]
class King
class Queen
class Rook
class Bishop
class Knight
class Pawn
class Move
  - from: Square
  - to: Square
  - captured: Piece
  - promotedFrom: Piece
class Square
  + file: int
  + rank: int
interface Player
  + chooseMove(g: Game): Move
King --|> Piece
Queen --|> Piece
Rook --|> Piece
Bishop --|> Piece
Knight --|> Piece
Pawn --|> Piece
Game *-- Board
Board *-- Piece
Game o-- Move
Game --> Player
```

## Step 3: Design decisions

- **Each piece makes its own pseudo-legal moves** (polymorphism, a Strategy for movement). Rook, bishop and queen share a helper `slide(directions)`. Knight and king use fixed steps. The pawn has its direction, double step, diagonal captures and promotion.
- **Legal = pseudo-legal moves, except those that leave your king attacked.** We do this by **apply, test, undo** on the real board. It is simple and correct. That is why `Move` remembers the captured piece (and promotion), and `Board::undo` puts everything back exactly.
- **`isAttacked(square, byColor)`:** make the pseudo-legal moves for all enemy pieces and look for one that captures that square. (Pawns need care: they attack diagonally, not where they move.) Reusing `pseudoMoves` keeps the rules in one place.
- **Game status:** after each move, does the side to move have any legal move? If not: if in check it is **checkmate**, otherwise **stalemate**.
- **The board owns the pieces** (`unique_ptr` in the grid). A move **moves the pointer**. The captured piece is kept inside the `Move`, so undo can put it back (ideas from **Command and Memento**).
- **Square and Move are small value types.**
- **Extensions** fit as extra move makers (castling in `King::pseudoMoves`, en passant in `Pawn`), because moves can carry extra data (`rookFrom/rookTo`, `capturedSquare`). A `Rules` strategy could change variants (Chess960).

## Step 4: The code

```cpp run title="Chess: legal moves, check, checkmate (fool's mate) and undo"
#include <algorithm>
#include <cctype>
#include <iostream>
#include <memory>
#include <optional>
#include <string>
#include <vector>
using namespace std;

enum class Color { White, Black };
Color other(Color c) { return c == Color::White ? Color::Black : Color::White; }

struct Square {
    int file, rank;                                          // 0..7  (a..h, 1..8)
    bool valid() const { return file >= 0 && file < 8 && rank >= 0 && rank < 8; }
    bool operator==(const Square& o) const { return file == o.file && rank == o.rank; }
    string str() const { return string(1, 'a' + file) + string(1, '1' + rank); }
};

class Board;
class Piece;
struct Move {
    Square from, to;
    unique_ptr<Piece> captured;                              // kept so the move can be undone
    bool promoted = false;                                   // a pawn became a queen
    unique_ptr<Piece> promotedFrom;                          // the original pawn, kept for undo
    Move(Square f, Square t) : from(f), to(t) {}
    Move(Move&&) = default;
    Move& operator=(Move&&) = default;
};

class Piece {
protected:
    Color color_;
public:
    explicit Piece(Color c) : color_(c) {}
    virtual ~Piece() = default;
    Color color() const { return color_; }
    virtual char symbol() const = 0;                         // uppercase = white
    virtual void pseudoMoves(const Board& b, Square from, vector<Square>& out) const = 0;
    virtual bool isPawn() const { return false; }
    virtual bool isKing() const { return false; }
    virtual unique_ptr<Piece> clone() const = 0;
    char display() const { return color_ == Color::White ? symbol() : static_cast<char>(tolower(symbol())); }
};

class Board {
    unique_ptr<Piece> grid_[8][8];
public:
    const Piece* at(Square s) const { return grid_[s.file][s.rank].get(); }
    void place(Square s, unique_ptr<Piece> p) { grid_[s.file][s.rank] = move(p); }

    void apply(Move& m) {
        m.captured = move(grid_[m.to.file][m.to.rank]);
        grid_[m.to.file][m.to.rank] = move(grid_[m.from.file][m.from.rank]);
        m.promoted = false;
        const Piece* p = at(m.to);
        if (p->isPawn() && (m.to.rank == 7 || m.to.rank == 0)) { m.promotedFrom = p->clone(); promoteToQueen(m.to, p->color()); m.promoted = true; }
    }
    void undo(Move& m) {
        if (m.promoted) { grid_[m.from.file][m.from.rank] = move(m.promotedFrom); grid_[m.to.file][m.to.rank].reset(); }
        else grid_[m.from.file][m.from.rank] = move(grid_[m.to.file][m.to.rank]);
        grid_[m.to.file][m.to.rank] = move(m.captured);
    }
    Square findKing(Color c) const { for (int f = 0; f < 8; ++f) for (int r = 0; r < 8; ++r) { const Piece* p = grid_[f][r].get(); if (p && p->isKing() && p->color() == c) return {f, r}; } return {-1, -1}; }
    bool isAttacked(Square target, Color by) const;
    void print() const {
        for (int r = 7; r >= 0; --r) { cout << "    " << r + 1 << " "; for (int f = 0; f < 8; ++f) { const Piece* p = grid_[f][r].get(); cout << (p ? p->display() : '.') << ' '; } cout << "\n"; }
        cout << "      a b c d e f g h\n";
    }
private:
    void promoteToQueen(Square s, Color c);
};

// ---------- movement helpers ----------
void slide(const Board& b, Square from, Color me, const vector<pair<int, int>>& dirs, vector<Square>& out) {
    for (auto [df, dr] : dirs)
        for (Square s{from.file + df, from.rank + dr}; s.valid(); s = {s.file + df, s.rank + dr}) {
            const Piece* p = b.at(s);
            if (!p) { out.push_back(s); continue; }
            if (p->color() != me) out.push_back(s);          // capture, then stop
            break;
        }
}
void jump(const Board& b, Square from, Color me, const vector<pair<int, int>>& offs, vector<Square>& out) {
    for (auto [df, dr] : offs) { Square s{from.file + df, from.rank + dr}; if (s.valid() && (!b.at(s) || b.at(s)->color() != me)) out.push_back(s); }
}
const vector<pair<int, int>> kStraight{{1, 0}, {-1, 0}, {0, 1}, {0, -1}}, kDiagonal{{1, 1}, {1, -1}, {-1, 1}, {-1, -1}};

struct Rook : Piece { using Piece::Piece; char symbol() const override { return 'R'; } void pseudoMoves(const Board& b, Square f, vector<Square>& o) const override { slide(b, f, color_, kStraight, o); } unique_ptr<Piece> clone() const override { return make_unique<Rook>(color_); } };
struct Bishop : Piece { using Piece::Piece; char symbol() const override { return 'B'; } void pseudoMoves(const Board& b, Square f, vector<Square>& o) const override { slide(b, f, color_, kDiagonal, o); } unique_ptr<Piece> clone() const override { return make_unique<Bishop>(color_); } };
struct Queen : Piece { using Piece::Piece; char symbol() const override { return 'Q'; } void pseudoMoves(const Board& b, Square f, vector<Square>& o) const override { slide(b, f, color_, kStraight, o); slide(b, f, color_, kDiagonal, o); } unique_ptr<Piece> clone() const override { return make_unique<Queen>(color_); } };
struct Knight : Piece { using Piece::Piece; char symbol() const override { return 'N'; } void pseudoMoves(const Board& b, Square f, vector<Square>& o) const override { jump(b, f, color_, {{1, 2}, {2, 1}, {-1, 2}, {-2, 1}, {1, -2}, {2, -1}, {-1, -2}, {-2, -1}}, o); } unique_ptr<Piece> clone() const override { return make_unique<Knight>(color_); } };
struct King : Piece { using Piece::Piece; char symbol() const override { return 'K'; } bool isKing() const override { return true; } void pseudoMoves(const Board& b, Square f, vector<Square>& o) const override { jump(b, f, color_, {{1, 0}, {-1, 0}, {0, 1}, {0, -1}, {1, 1}, {1, -1}, {-1, 1}, {-1, -1}}, o); } unique_ptr<Piece> clone() const override { return make_unique<King>(color_); } };
struct Pawn : Piece {
    using Piece::Piece;
    char symbol() const override { return 'P'; }
    bool isPawn() const override { return true; }
    unique_ptr<Piece> clone() const override { return make_unique<Pawn>(color_); }
    void pseudoMoves(const Board& b, Square f, vector<Square>& o) const override {
        int dir = color_ == Color::White ? 1 : -1, startRank = color_ == Color::White ? 1 : 6;
        Square one{f.file, f.rank + dir};
        if (one.valid() && !b.at(one)) {
            o.push_back(one);
            Square two{f.file, f.rank + 2 * dir};
            if (f.rank == startRank && !b.at(two)) o.push_back(two);
        }
        for (int df : {-1, 1}) { Square c{f.file + df, f.rank + dir}; if (c.valid() && b.at(c) && b.at(c)->color() != color_) o.push_back(c); }       // diagonal captures only when there is a piece
    }
};

void Board::promoteToQueen(Square s, Color c) { grid_[s.file][s.rank] = make_unique<Queen>(c); }

bool Board::isAttacked(Square target, Color by) const {
    vector<Square> targets;
    for (int f = 0; f < 8; ++f) for (int r = 0; r < 8; ++r) {
        const Piece* p = at({f, r});
        if (!p || p->color() != by) continue;
        if (p->isPawn()) {                                  // pawns attack diagonally, whether or not a piece stands there
            int dir = by == Color::White ? 1 : -1;
            for (int df : {-1, 1}) if (Square{f + df, r + dir} == target) return true;
            continue;
        }
        targets.clear(); p->pseudoMoves(*this, {f, r}, targets);
        for (Square s : targets) if (s == target) return true;
    }
    return false;
}

enum class Status { Playing, Check, Checkmate, Stalemate };
const char* name(Status s) { static const char* n[] = {"playing", "check", "CHECKMATE", "stalemate"}; return n[static_cast<int>(s)]; }

class Game {
    Board board_; Color turn_ = Color::White; vector<Move> history_;
    static optional<Square> parse(const string& s) { if (s.size() != 2 || s[0] < 'a' || s[0] > 'h' || s[1] < '1' || s[1] > '8') return nullopt; return Square{s[0] - 'a', s[1] - '1'}; }
public:
    Game() {
        auto back = [&](Color c, int rank) {
            const char* order = "RNBQKBNR";
            for (int f = 0; f < 8; ++f) {
                unique_ptr<Piece> p;
                switch (order[f]) { case 'R': p = make_unique<Rook>(c); break; case 'N': p = make_unique<Knight>(c); break; case 'B': p = make_unique<Bishop>(c); break; case 'Q': p = make_unique<Queen>(c); break; default: p = make_unique<King>(c); }
                board_.place({f, rank}, move(p));
                board_.place({f, rank == 0 ? 1 : 6}, make_unique<Pawn>(c));
            }
        };
        back(Color::White, 0); back(Color::Black, 7);
    }
    const Board& board() const { return board_; }
    Color turn() const { return turn_; }

    bool inCheck(Color c) const { return board_.isAttacked(board_.findKing(c), other(c)); }

    // legal = pseudo-legal moves that do not leave our own king attacked: try the move, test, undo
    vector<pair<Square, Square>> legalMoves() {
        vector<pair<Square, Square>> out;
        for (int f = 0; f < 8; ++f) for (int r = 0; r < 8; ++r) {
            const Piece* p = board_.at({f, r});
            if (!p || p->color() != turn_) continue;
            vector<Square> cands; p->pseudoMoves(board_, {f, r}, cands);
            for (Square to : cands) {
                Move m({f, r}, to);
                board_.apply(m);
                bool safe = !board_.isAttacked(board_.findKing(turn_), other(turn_));
                board_.undo(m);
                if (safe) out.push_back({{f, r}, to});
            }
        }
        return out;
    }
    Status status() {
        bool check = inCheck(turn_);
        if (legalMoves().empty()) return check ? Status::Checkmate : Status::Stalemate;
        return check ? Status::Check : Status::Playing;
    }
    string play(const string& text) {                        // "e2e4"
        auto a = text.size() == 4 ? parse(text.substr(0, 2)) : nullopt, b = text.size() == 4 ? parse(text.substr(2, 2)) : nullopt;
        if (!a || !b) return "cannot read '" + text + "'";
        const Piece* p = board_.at(*a);
        if (!p || p->color() != turn_) return "no " + string(turn_ == Color::White ? "white" : "black") + " piece on " + a->str();
        auto legal = legalMoves();
        if (none_of(legal.begin(), legal.end(), [&](auto& m) { return m.first == *a && m.second == *b; })) return "illegal move " + text;
        Move m(*a, *b);
        board_.apply(m);
        history_.push_back(move(m));
        turn_ = other(turn_);
        return "";
    }
    bool undo() { if (history_.empty()) return false; board_.undo(history_.back()); history_.pop_back(); turn_ = other(turn_); return true; }
};

int main() {
    Game g;
    cout << "initial position: " << g.legalMoves().size() << " legal moves for white\n";
    for (const char* mv : {"f2f3", "e7e5", "g2g4", "d8h4"}) {                // Fool's mate: the fastest checkmate
        string err = g.play(mv);
        cout << "  " << (g.turn() == Color::Black ? "white" : "black") << " plays " << mv << (err.empty() ? "" : "  -> " + err) << "\n";
    }
    g.board().print();
    cout << "status: " << name(g.status()) << ", white has " << g.legalMoves().size() << " legal moves\n";

    cout << "rejections:\n";
    cout << "  " << g.play("a2a3") << "\n";

    cout << "undo the mate, then try an illegal move:\n";
    g.undo();
    cout << "  status after undo: " << name(g.status()) << "\n";
    cout << "  black plays d8h4 again: " << (g.play("d8h4").empty() ? "ok" : "failed") << ", status " << name(g.status()) << "\n";

    Game h;
    cout << "illegal moves are refused: e2e5 -> " << h.play("e2e5") << "; e7e5 (not black's turn) -> " << h.play("e7e5") << "; b1b3 (knight moves like a knight) -> " << h.play("b1b3") << "\n";
    cout << "a check must be answered (1.e4 e5 2.Qh5 Nc6 3.Qxf7+):\n";
    for (const char* mv : {"e2e4", "e7e5", "d1h5", "b8c6", "h5f7"}) h.play(mv);   // queen takes f7, check: only the king may respond
    cout << "  status: " << name(h.status()) << ", black's legal moves: " << h.legalMoves().size() << " (must answer the check)\n";
}
```

## Why undo-based legality is a good design

- **One source of truth:** the movement rules live only in `pseudoMoves`. Legality is a general test on top.
- **The same tool as the game's undo:** a chess engine's search uses `apply` and `undo` thousands of times each second.
- **Cost:** for each candidate move you check whether the king is attacked, so the time is about (pieces × moves). That is fine for a screen. Engines use bitboards and attack maps that update step by step.

## Edge cases

| Case | What happens |
|---|---|
| Moving a pinned piece | `apply`, then `isAttacked(king)`, then `undo`, so the move is refused |
| Capturing the king | impossible. A position where the king is attacked is "check", and a move that leaves it there is illegal |
| A pawn capturing straight, or moving diagonally without a capture | `Pawn::pseudoMoves` has both rules. `isAttacked` uses the diagonals separately |
| Promotion | done in `apply`. The original pawn is kept for `undo` |
| Stalemate | no legal moves, and not in check |
| Not enough pieces, 50 moves, repeating | extra end rules (`Rule` objects in a chain checked after each move) |

## What if the interviewer asks for more?

| Follow-up | Our answer |
|---|---|
| "Castling" | `King::pseudoMoves` adds the two-square moves when the king and rook have not moved and the path is safe. `Move` gets `rookFrom/rookTo`. Pieces remember `hasMoved` |
| "En passant" | the game remembers the last pawn double step. `Pawn` adds the capture. `Move` records the captured square |
| "Choose what to promote to" | `Move.promotion` holds the chosen piece type |
| "A chess engine or AI" | a `Player` that uses minimax with alpha-beta over `legalMoves`, `apply/undo` and a score function (Strategy) |
| "Move notation (SAN), PGN files" | a `Notation` service over the list of moves |
| "Clocks and time" | a `Clock` that watches turns. When time runs out, the game ends |
| "Online play and watchers" | a stream of moves (Observer) |
| "Variants (Chess960, three-check)" | a `Rules` strategy that sets up the board and adds win conditions |
| "Speed" | bitboards, attack tables that update step by step, move ordering |

## Short answer to say in an interview

:::interview How do you check that a chess move is legal?
"Each piece class makes its pseudo-legal moves, which just follow how that piece moves. To find the legal ones, I apply each move on the board, check whether my own king is attacked, and then undo the move. If the king is attacked, the move is illegal. This reuses the movement rules and the undo mechanism, so pins and discovered checks need no special code. After a move, if the next player has no legal move, it is checkmate if they are in check, and stalemate if not."
:::

```quiz
? Why is legality tested by applying the move and undoing it?
- It is the fastest known way
+ It reuses the movement rules and the undo tool, so legality needs no special cases
- Pieces cannot know about check
> One general test handles pins, discovered checks and king safety.
? Why does Move store the captured piece?
- To show the move list
+ So undo can put the captured piece back exactly
- To give points
> Undo must bring back the earlier state.
```

:::keypoints
- Piece classes make pseudo-legal moves. The game filters them by king safety using apply, test, undo.
- Move is a small value with from, to, captured and promotion. The board owns pieces with `unique_ptr`.
- Status: no legal moves means checkmate (if in check) or stalemate. Extensions: castling, en passant, engines through Player, rules through Strategy.
:::
