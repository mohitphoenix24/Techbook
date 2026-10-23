---
title: Design Blackjack
level: easy
time: 45
summary: Cards, a deck behind an injectable source, hand valuation with the soft ace rule, player and dealer behaviour as strategies, a round engine with settlement and payouts, and a deterministic demo with a stacked deck.
---

:::problem Design Blackjack {level=easy tags="games,cards,Strategy,state,simulation"}
Design a Blackjack game for one or more players against a dealer. Each player gets two cards and may hit or stand. A hand's value is the sum of the cards (face cards 10, ace 1 or 11 as best); over 21 is a bust. The dealer hits until reaching 17. Highest value not over 21 wins; a two-card 21 is a blackjack paying 3:2.

:::hint Hint
Separate **what the rules say** (hand value, bust, who wins) from **how a participant decides** (player strategy, dealer rule). The deck should be an interface so tests can stack it.
:::
:::

## Step 1: requirements

| Question | Assumption |
|---|---|
| Players? | 1 to 4 players plus the dealer; each places a bet from a bankroll |
| Deck? | one 52-card deck, reshuffled when fewer than 15 cards remain (mention); injectable order |
| Actions? | hit, stand (double down and split are extensions) |
| Ace? | counts 11 unless that busts, then 1 ("soft" hand while an ace counts 11) |
| Dealer? | stands on 17 or more |
| Payouts? | win 1:1, blackjack 3:2, push (tie) returns the bet, bust loses |
| Out of scope | insurance, side bets, UI |

## Step 2: entities

```viz algo=uml title="Blackjack"
class Card
  - rank: Rank
  - suit: Suit
class Hand
  - cards: Card[]
  + add(c: Card): void
  + value(): int
  + isSoft(): bool
  + isBust(): bool
  + isBlackjack(): bool
interface CardSource
  + draw(): Card
class ShuffledDeck
class StackedDeck
interface Decision
  + hit(h: Hand, dealerUp: Card): bool
class DealerRule
class ThresholdStrategy
class Participant
  - name: string
  - hand: Hand
  - bankroll: int
  - bet: int
class Round
  + play(): void
  + settle(): void
Hand *-- Card
Participant *-- Hand
Participant --> Decision
Round --> CardSource
Round o-- Participant
ShuffledDeck ..|> CardSource
StackedDeck ..|> CardSource
DealerRule ..|> Decision
ThresholdStrategy ..|> Decision
```

## Step 3: design decisions

- **`Hand::value()`** implements the ace rule: sum with every ace as 1, then add 10 once if there is an ace and it does not bust. That rule lives in one place.
- **`CardSource` interface**: `ShuffledDeck` (seeded `mt19937`) for play, `StackedDeck` for tests and demos.
- **`Decision` is a Strategy**: the dealer's "hit below 17" is just one implementation; a player may be a `ThresholdStrategy(15)` or an interactive one.
- **`Round`** runs: bets, deal, player turns, dealer turn, settlement. Settlement is a small pure function of (player hand, dealer hand) to an outcome, so it is trivially testable.
- **Outcomes as an enum** (`Blackjack, Win, Push, Lose`) with a payout table.

## Step 4: the code

```cpp run title="Blackjack round with a stacked deck"
#include <algorithm>
#include <iostream>
#include <memory>
#include <random>
#include <string>
#include <vector>
using namespace std;

enum class Suit { Clubs, Diamonds, Hearts, Spades };
enum class Rank { Two = 2, Three, Four, Five, Six, Seven, Eight, Nine, Ten, Jack, Queen, King, Ace };

struct Card { Rank rank; Suit suit; };
string str(const Card& c) {
    static const char* r[] = {"", "", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"};
    static const char* s[] = {"C", "D", "H", "S"};
    return string(r[static_cast<int>(c.rank)]) + s[static_cast<int>(c.suit)];
}

class Hand {
    vector<Card> cards_;
public:
    void add(Card c) { cards_.push_back(c); }
    const vector<Card>& cards() const { return cards_; }
    int value() const {
        int total = 0; bool ace = false;
        for (const auto& c : cards_) {
            int r = static_cast<int>(c.rank);
            if (c.rank == Rank::Ace) { ace = true; total += 1; }
            else total += r >= 10 ? 10 : r;
        }
        return (ace && total + 10 <= 21) ? total + 10 : total;           // one ace may count 11
    }
    bool isSoft() const { int hard = 0; bool ace = false; for (const auto& c : cards_) { int r = static_cast<int>(c.rank); if (c.rank == Rank::Ace) { ace = true; hard += 1; } else hard += r >= 10 ? 10 : r; } return ace && hard + 10 <= 21; }
    bool isBust() const { return value() > 21; }
    bool isBlackjack() const { return cards_.size() == 2 && value() == 21; }
    string show() const { string s; for (auto& c : cards_) s += str(c) + " "; return s + "= " + to_string(value()) + (isSoft() ? " (soft)" : ""); }
};

struct CardSource { virtual ~CardSource() = default; virtual Card draw() = 0; };
class ShuffledDeck : public CardSource {
    vector<Card> cards_; size_t next_ = 0;
public:
    explicit ShuffledDeck(unsigned seed) {
        for (int s = 0; s < 4; ++s) for (int r = 2; r <= 14; ++r) cards_.push_back({static_cast<Rank>(r), static_cast<Suit>(s)});
        mt19937 g(seed); shuffle(cards_.begin(), cards_.end(), g);
    }
    Card draw() override { return cards_.at(next_++); }
};
class StackedDeck : public CardSource {                    // deals exactly these cards, in order
    vector<Card> cards_; size_t next_ = 0;
public:
    explicit StackedDeck(vector<Card> c) : cards_(move(c)) {}
    Card draw() override { return cards_.at(next_++); }
};

struct Decision { virtual ~Decision() = default; virtual bool hit(const Hand& h, const Card& dealerUp) const = 0; };
struct DealerRule : Decision { bool hit(const Hand& h, const Card&) const override { return h.value() < 17; } };
struct ThresholdStrategy : Decision {
    int stopAt; explicit ThresholdStrategy(int s) : stopAt(s) {}
    bool hit(const Hand& h, const Card&) const override { return h.value() < stopAt; }
};

enum class Outcome { Blackjack, Win, Push, Lose };
Outcome settle(const Hand& player, const Hand& dealer) {                  // pure function: easy to test
    if (player.isBust()) return Outcome::Lose;
    if (player.isBlackjack() && !dealer.isBlackjack()) return Outcome::Blackjack;
    if (dealer.isBust()) return Outcome::Win;
    if (player.isBlackjack() && dealer.isBlackjack()) return Outcome::Push;
    if (player.value() > dealer.value()) return Outcome::Win;
    if (player.value() == dealer.value()) return Outcome::Push;
    return Outcome::Lose;
}
long payout(Outcome o, long bet) { switch (o) { case Outcome::Blackjack: return bet * 3 / 2; case Outcome::Win: return bet; case Outcome::Push: return 0; default: return -bet; } }
const char* name(Outcome o) { switch (o) { case Outcome::Blackjack: return "BLACKJACK"; case Outcome::Win: return "win"; case Outcome::Push: return "push"; default: return "lose"; } }

struct Participant { string name; Hand hand; long bankroll; long bet = 0; shared_ptr<Decision> decision; };

class Round {
    CardSource& deck_;
    vector<Participant>& players_;
    Participant dealer_{"Dealer", {}, 0, 0, make_shared<DealerRule>()};
public:
    Round(CardSource& d, vector<Participant>& p) : deck_(d), players_(p) {}
    void play() {
        for (auto& p : players_) p.bet = 10;
        for (int i = 0; i < 2; ++i) { for (auto& p : players_) p.hand.add(deck_.draw()); dealer_.hand.add(deck_.draw()); }      // two cards each
        Card up = dealer_.hand.cards()[0];
        cout << "  dealer shows " << str(up) << "\n";
        for (auto& p : players_) {
            cout << "  " << p.name << ": " << p.hand.show() << "\n";
            while (!p.hand.isBlackjack() && !p.hand.isBust() && p.decision->hit(p.hand, up)) {
                Card c = deck_.draw(); p.hand.add(c);
                cout << "    " << p.name << " hits " << str(c) << " -> " << p.hand.value() << "\n";
            }
        }
        while (dealer_.decision->hit(dealer_.hand, up)) { Card c = deck_.draw(); dealer_.hand.add(c); cout << "    dealer hits " << str(c) << "\n"; }
        cout << "  dealer: " << dealer_.hand.show() << "\n";
        for (auto& p : players_) {
            Outcome o = settle(p.hand, dealer_.hand);
            p.bankroll += payout(o, p.bet);
            cout << "  " << p.name << ": " << name(o) << " (" << (payout(o, p.bet) >= 0 ? "+" : "") << payout(o, p.bet) << "), bankroll " << p.bankroll << "\n";
        }
    }
};

int main() {
    using R = Rank; using S = Suit;
    // deal order: P1, P2, dealer, P1, P2, dealer, then hits
    StackedDeck deck({
        {R::Ace, S::Spades}, {R::Ten, S::Hearts}, {R::Nine, S::Clubs},       // first cards: Asha A, Ravi 10, dealer 9
        {R::King, S::Hearts}, {R::Six, S::Diamonds}, {R::Eight, S::Spades},  // second cards: Asha K (blackjack), Ravi 6, dealer 8 = 17
        {R::Seven, S::Clubs}, {R::Five, S::Hearts}                           // extra draws
    });
    vector<Participant> players;
    players.push_back({"Asha", {}, 100, 0, make_shared<ThresholdStrategy>(17)});
    players.push_back({"Ravi", {}, 100, 0, make_shared<ThresholdStrategy>(17)});
    Round(deck, players).play();

    cout << "ace rule checks:\n";
    Hand soft; soft.add({R::Ace, S::Clubs}); soft.add({R::Six, S::Clubs});
    cout << "  A+6 = " << soft.show() << "\n";
    soft.add({R::Ten, S::Clubs});
    cout << "  A+6+10 = " << soft.show() << "\n";
}
```

## Edge cases

| Case | Handling |
|---|---|
| Two aces | the first counts 11 at most once: A+A = 12 |
| Player and dealer both blackjack | push |
| Player busts | loses immediately, even if the dealer later busts |
| Deck runs out | `CardSource` reshuffles (a `ShuffledDeck` with a "cut card" policy) |
| Dealer must not draw if all players are bust | an optimisation rule in `Round` |
| Invalid bet (more than bankroll) | validated before dealing |

## Extensions and follow-ups

| Follow-up | Design response |
|---|---|
| "Double down, split, insurance" | `Decision` returns an `Action` enum (Hit, Stand, Double, Split); `Round` handles each |
| "Basic-strategy bot" | a `Decision` implementation using a table keyed by (hand value, dealer up card) |
| "Multiple decks and card counting" | `ShuffledDeck(numDecks)` and an observer counting cards |
| "Different casino rules (dealer hits soft 17)" | a `DealerRule` variant; rules as a config struct |
| "Persistence and statistics" | Observer events per round; a `StatsCollector` |
| "Online multiplayer" | rounds become state machines with timeouts per player |

```quiz
? Where should the soft-ace rule live?
- In every participant
+ In Hand::value(), once
- In the deck
> One place computes a hand's value; everything else uses it.
? Why is settle() a pure function?
- It is faster
+ It depends only on the two hands, so it is easy to unit test for every combination
- Because C++ requires it
> Rules as pure functions give simple, exhaustive tests.
```

:::keypoints
- Hand (value, soft, bust), CardSource (injectable), Decision (strategy), Round (engine), settle (pure rules).
- A stacked deck gives deterministic demos and tests. Extensions mostly add actions or strategies.
:::
