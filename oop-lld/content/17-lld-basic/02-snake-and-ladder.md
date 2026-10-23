---
title: Design Snake and Ladder
level: easy
time: 40
summary: A dice-driven board game with snakes and ladders as jump rules, an injectable dice for deterministic tests, rule variants (exact finish, bonus turn on six) as options, and a clean turn-by-turn game loop.
---

:::problem Design Snake and Ladder {level=easy tags="games,simulation,strategy,randomness"}
Design the classic Snake and Ladder game for 2 to 6 players on a 100-square board. Players roll a die in turn and move forward. Landing on the bottom of a ladder moves you up to its top; landing on a snake's head moves you down to its tail. The first player to reach square 100 wins. Make the dice and the rule variants easy to change.

:::hint Hint
Model snakes and ladders as one concept: a **jump** from one square to another (ladders jump up, snakes down). The board is then just a map. Hide the dice behind an interface so a test can supply a fixed sequence of rolls.
:::
:::

## Step 1: requirements

| Question | Assumption |
|---|---|
| Board? | 100 squares (configurable size); snakes and ladders given as (from, to) pairs, no square is the start of two jumps |
| Players? | 2 to 6, all start at 0 |
| Dice? | one die, 1 to 6, behind an interface (random in production, scripted in tests) |
| Finishing? | variant A: **exact roll** needed to land on 100 (overshoot = stay); variant B: any roll reaching 100 wins |
| Bonus turn on a six? | optional rule, off by default |
| Out of scope | UI, networking |

## Step 2: entities

- **Board**: size and a `map<int,int> jumps`; `int resolve(int square)` returns the final square after any jump.
- **Dice** (interface): `int roll()`. `RandomDice` (seeded), `SequenceDice` (scripted).
- **Player**: name and position.
- **Rules** (options): `exactFinish`, `extraTurnOnSix`.
- **Game**: players in turn order, the dice, the board; `playTurn()`; `winner()`.

```viz algo=uml title="Snake and Ladder"
class Game
  - players: Player[]
  - turn: int
  + playTurn(): void
  + isOver(): bool
class Board
  - size: int
  - jumps: map<int,int>
  + resolve(square: int): int
class Player
  - name: string
  - position: int
interface Dice
  + roll(): int
class RandomDice
class SequenceDice
class Rules
  + exactFinish: bool
  + extraTurnOnSix: bool
Game *-- Player
Game --> Board
Game --> Dice
Game --> Rules
RandomDice ..|> Dice
SequenceDice ..|> Dice
```

## Step 3: a turn

```viz algo=seq title="One turn"
participant g Game [box]
participant d Dice [box]
participant p Player [user]
participant b Board [db]
g -> d : roll()
d --> g : 5
g -> p : candidate = position + 5 | Check the finish rule: overshooting 100 means the player does not move.
g -> b : resolve(candidate) | If a snake or ladder starts there, the final square is its other end.
b --> g : final square
g -> p : moveTo(final)
g -> g : did the player reach 100? else next player (or same on a six, if enabled)
```

## Step 4: design decisions

- **One concept for snakes and ladders** (`jump`) removes duplicate code. Validation: a jump's end cannot itself be a jump start (no chains), and a snake must go down, a ladder up (optional check).
- **`Dice` interface** gives deterministic tests and the ability to add a "crooked dice" later without touching `Game`.
- **Rules as a small struct** passed in, not hard-coded flags scattered in the loop (a simple Strategy; a full strategy class would be overkill).
- `Game::playTurn` does exactly one player's move and returns what happened, so a UI, a console log or a test can drive it.

## Step 5: the code

```cpp run title="Snake and Ladder: complete, with scripted dice"
#include <iostream>
#include <map>
#include <memory>
#include <random>
#include <stdexcept>
#include <string>
#include <vector>
using namespace std;

class Dice {
public:
    virtual ~Dice() = default;
    virtual int roll() = 0;
};
class RandomDice : public Dice {
    mt19937 gen_; uniform_int_distribution<int> d_{1, 6};
public:
    explicit RandomDice(unsigned seed) : gen_(seed) {}
    int roll() override { return d_(gen_); }
};
class SequenceDice : public Dice {                         // deterministic: returns a fixed list of rolls
    vector<int> rolls_; size_t i_ = 0;
public:
    explicit SequenceDice(vector<int> r) : rolls_(move(r)) {}
    int roll() override { return rolls_.at(i_++ % rolls_.size()); }
};

class Board {
    int size_;
    map<int, int> jumps_;                                  // from -> to (ladders go up, snakes go down)
public:
    explicit Board(int size = 100) : size_(size) {}
    int size() const { return size_; }
    void addJump(int from, int to) {
        if (from <= 0 || from >= size_ || to <= 0 || to > size_ || from == to) throw invalid_argument("bad jump");
        if (jumps_.count(from)) throw invalid_argument("square already has a jump");
        jumps_[from] = to;
    }
    int resolve(int square) const { auto it = jumps_.find(square); return it == jumps_.end() ? square : it->second; }
    bool isLadder(int from) const { auto it = jumps_.find(from); return it != jumps_.end() && it->second > from; }
};

struct Rules {
    bool exactFinish = true;
    bool extraTurnOnSix = false;
};

struct Player { string name; int position = 0; };

class Game {
    Board board_;
    vector<Player> players_;
    unique_ptr<Dice> dice_;
    Rules rules_;
    size_t turn_ = 0;
    int winner_ = -1;
public:
    Game(Board b, vector<string> names, unique_ptr<Dice> d, Rules r) : board_(move(b)), dice_(move(d)), rules_(r) {
        if (names.size() < 2 || names.size() > 6) throw invalid_argument("2 to 6 players");
        for (auto& n : names) players_.push_back({move(n), 0});
    }
    bool isOver() const { return winner_ >= 0; }
    const string& winner() const { return players_.at(winner_).name; }

    void playTurn() {
        Player& p = players_[turn_];
        int roll = dice_->roll();
        int target = p.position + roll;
        cout << "  " << p.name << " rolls " << roll << ": " << p.position;
        if (target > board_.size() && rules_.exactFinish) {
            cout << " -> stays (needs an exact roll)\n";
        } else {
            target = min(target, board_.size());
            int landed = board_.resolve(target);
            cout << " -> " << target;
            if (landed != target) cout << (board_.isLadder(target) ? " (ladder up to " : " (snake down to ") << landed << ")";
            cout << "\n";
            p.position = landed;
            if (p.position == board_.size()) { winner_ = static_cast<int>(turn_); return; }
        }
        if (!(rules_.extraTurnOnSix && roll == 6)) turn_ = (turn_ + 1) % players_.size();
        else cout << "  " << p.name << " rolled a six: bonus turn\n";
    }
};

int main() {
    Board board(30);                                       // a small board keeps the demo short
    board.addJump(3, 22);  board.addJump(11, 26);          // ladders
    board.addJump(27, 5);  board.addJump(21, 9);           // snakes

    // scripted rolls: Asha, Ravi, Asha, Ravi, ...
    Game game(board, {"Asha", "Ravi"}, make_unique<SequenceDice>(vector<int>{3, 4, 4, 6, 2, 5, 6, 1, 3, 5, 4, 2}), Rules{true, true});
    int turns = 0;
    while (!game.isOver() && turns++ < 40) game.playTurn();
    if (game.isOver()) cout << "winner: " << game.winner() << "\n";
}
```

## Edge cases

| Case | Handling |
|---|---|
| Roll overshoots the last square | `exactFinish`: the player stays; otherwise capped at the last square |
| Ladder top is the start of a snake | rejected by `addJump` (no chains) or allow one level of resolution by repeating `resolve` |
| Two players on the same square | allowed (no capture in the basic game; capture is an extension) |
| Many turns without a winner | the loop bound in `main` protects the demo; real games always finish with probability 1 |

## Extensions and follow-ups

| Follow-up | Design response |
|---|---|
| "Two dice" or "crooked dice" | new `Dice` implementation (`TwoDice`, `LoadedDice`) |
| "A player sent back to start when landing on another" | rule hook in `playTurn`: check other players' positions |
| "Multiple winners / ranking" | continue until all finish, record the finishing order in a vector |
| "Observers for UI/logging" | `Game` emits events (`Moved`, `Jumped`, `Won`) to listeners |
| "Save and resume" | players and turn index are plain data: serialise them (Memento) |
| "Random board generator" | a `BoardBuilder` that places jumps while checking constraints |

```quiz
? Why model snakes and ladders as one "jump" concept?
- Fewer files
+ They behave identically (from, to); the board only needs a map
- Because ladders are rare
> One rule replaces two near-duplicate code paths.
? Why inject the Dice?
- It is faster
+ A scripted dice makes games deterministic for tests and demos
- C++ forbids rand()
> Randomness is a classic hidden dependency; make it a seam.
```

:::keypoints
- Board = size + jump map; Dice = interface; Rules = small options; Game = turn loop.
- Snakes and ladders are the same concept (a jump), validated once.
- Injectable dice gives deterministic tests; rule variants stay data, not scattered `if`s.
:::
