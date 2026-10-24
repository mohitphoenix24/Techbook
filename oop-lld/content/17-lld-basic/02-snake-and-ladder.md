---
title: Design Snake and Ladder
level: easy
time: 40
summary: A dice game on a 100-square board. Learn to treat snakes and ladders as one idea (a jump), to hide the dice behind an interface so tests are predictable, and to keep rule options simple.
---

:::problem Design Snake and Ladder {level=easy tags="games,simulation,strategy,randomness"}
Design the classic Snake and Ladder game for 2 to 6 players on a 100-square board. Players roll a die one after another and move forward. If you land at the bottom of a ladder, you go up to its top. If you land on a snake's head, you go down to its tail. The first player to reach square 100 wins. Make the dice and the rule options easy to change.

:::hint Hint
Snakes and ladders are really the same thing: a **jump** from one square to another. Ladders jump up, snakes jump down. So the board is just a map of jumps. Also, hide the dice behind an interface, so a test can give a fixed list of rolls.
:::
:::

## Step 1: Ask questions (requirements)

| Question | Our assumption |
|---|---|
| The board? | 100 squares (can be changed). Snakes and ladders are given as (from, to) pairs. No square is the start of two jumps |
| Players? | 2 to 6, all start at 0 |
| Dice? | one die, 1 to 6, behind an interface (random in real use, fixed list in tests) |
| How to finish? | Option A: you need the **exact** number to land on 100 (if you roll too much, you stay). Option B: any roll that reaches 100 wins |
| Extra turn on a six? | optional rule, off by default |
| Not needed | screen, network |

## Step 2: Find the classes

- **Board**: knows its size and a `map<int,int> jumps`. `resolve(square)` gives the final square after any jump.
- **Dice** (interface): `roll()`. Two versions: `RandomDice` (with a seed) and `SequenceDice` (a fixed list).
- **Player**: a name and a position.
- **Rules** (options): `exactFinish`, `extraTurnOnSix`.
- **Game**: the players in order, the dice, the board. It has `playTurn()` and `winner()`.

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

## Step 3: One turn

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

In words: the game asks the dice for a number, moves the player, asks the board if there is a jump at the new square, and then checks if the player has won.

## Step 4: Design decisions

- **One idea for snakes and ladders** (`jump`). This removes repeated code. We check that a jump does not end on another jump's start (no chains).
- **`Dice` is an interface.** Tests become predictable, and a "crooked dice" can be added later without touching `Game`.
- **Rules are a small struct** that we pass in. We do not scatter flags inside the loop.
- **`playTurn` does exactly one player's move** and tells what happened. So a screen, a console log or a test can all drive it.

## Step 5: The code

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

| Case | What happens |
|---|---|
| The roll goes past the last square | with `exactFinish` the player stays. Otherwise the player stops at the last square |
| A ladder top is the start of a snake | `addJump` rejects it (no chains), or we resolve one more level |
| Two players on the same square | allowed (no capturing in the basic game) |
| A very long game | the demo stops after a fixed number of turns. In real games, the game always ends in the end |

## What if the interviewer asks for more?

| Follow-up | Our answer |
|---|---|
| "Two dice" or "crooked dice" | a new `Dice` class (`TwoDice`, `LoadedDice`) |
| "Send a player back to the start if another player lands on them" | a check in `playTurn` for other players' positions |
| "More than one winner, a ranking" | keep playing until all finish, and keep the finishing order in a vector |
| "Watchers for a screen or log" | `Game` announces `Moved`, `Jumped`, `Won` to listeners |
| "Save and continue later" | players and the turn number are plain data, so save them (Memento) |
| "Make a random board" | a `BoardBuilder` that places jumps and checks the rules |

## Short answer to say in an interview

:::interview How would you design Snake and Ladder so it is easy to test?
"I treat snakes and ladders as one idea, a jump, stored in a map on the board. I put the dice behind an interface, so a test can pass a fixed list of rolls and get the same game every time. Rule options like exact finish are a small struct. The game's playTurn does exactly one move and returns what happened."
:::

```quiz
? Why treat snakes and ladders as one "jump" idea?
- Fewer files
+ They work the same way (from, to), so the board needs only a map
- Ladders are rare
> One rule replaces two almost identical code paths.
? Why pass the Dice in?
- It is faster
+ A fixed-list dice makes games predictable for tests and demos
- C++ does not allow rand()
> Randomness is a hidden helper. Make it replaceable.
```

:::keypoints
- Board = size and a map of jumps. Dice = an interface. Rules = small options. Game = the turn loop.
- Snakes and ladders are one idea (a jump), checked once.
- A replaceable dice gives predictable tests. Rule options are data, not scattered `if`s.
:::
