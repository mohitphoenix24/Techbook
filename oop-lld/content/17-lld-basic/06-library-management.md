---
title: Design a Library Management System
level: easy
time: 50
summary: Books and physical copies, members with loan limits, reservations queued per title with notification when a copy returns, fines by a pluggable policy, and flexible search built from composable specifications.
---

:::problem Design a Library Management System {level=easy tags="classic,reservations,Observer,Specification,Strategy"}
Design a library management system. The library has books, each with one or more physical copies. Members can search the catalogue, borrow and return copies, and reserve a title that has no free copy. Late returns incur a fine. Librarians add books and copies.

:::hint Hint
Separate the abstract **Book** (title, author, ISBN) from the physical **Copy** (which one is on the shelf). Reservations belong to the Book, loans to the Copy. A reservation queue plus a notification when a copy returns is a natural Observer.
:::
:::

## Step 1: requirements

| Question | Assumption |
|---|---|
| Entities? | Book (ISBN, title, author), Copy (id, status), Member, Loan, Reservation |
| Loan rules? | at most 3 loans per member, 14 days |
| Late fine? | per day, rate set by a policy (changes with rules) |
| Reservations? | a member can reserve a title with no free copy; when a copy is returned the **first in the queue** is notified and the copy is held for them |
| Search? | by title and/or author, combinable |
| Roles? | member and librarian; permissions out of scope |
| Out of scope | payments, e-books, multiple branches |

(The earlier lesson "From requirements to classes" built a smaller library. This one adds reservations, notifications and richer search.)

## Step 2: entities

```viz algo=uml title="Library: class diagram"
class Library
  + addBook(b: Book, copies: int): void
  + borrow(m: Member, isbn: string, day: int): Result
  + giveBack(m: Member, copyId: int, day: int): Result
  + reserve(m: Member, isbn: string): Result
  + search(spec: Specification): Book[]
class Book
  - isbn: string
  - title: string
  - author: string
class Copy
  - id: int
  - status: CopyStatus
  - heldFor: string
class Member
  - name: string
  - loans: Loan[]
  + canBorrow(): bool
interface MemberListener
  + onCopyAvailable(isbn: string): void
interface FinePolicy
  + fine(daysLate: int): long
interface Specification
  + matches(b: Book): bool
class PerDayFine
class TitleContains
class AuthorIs
class AndSpec
Library *-- Book
Library *-- Copy
Library o-- Member
Library --> FinePolicy
Library ..> Specification
Member ..|> MemberListener
PerDayFine ..|> FinePolicy
TitleContains ..|> Specification
AuthorIs ..|> Specification
AndSpec ..|> Specification
```

## Step 3: key flows

```viz algo=state title="A copy's life"
state Available "Available" [initial] @0,0
state Borrowed "Borrowed" @1,0
state Held "On hold for a reserver" @2,0
Available -> Borrowed : borrow
Borrowed -> Available : return (no reservations)
Borrowed -> Held : return (someone waiting)
Held -> Borrowed : reserver borrows
play: borrow, return (someone waiting), reserver borrows, return (no reservations)
```

## Step 4: design decisions

- **Book vs Copy**: reservations are per title, loans per copy. Mixing them is the commonest mistake.
- **Reservation queue** per ISBN (`deque<Member*>`). On `giveBack`, if the queue is non-empty the copy goes to `Held`, and the first member is **notified** (Observer: `MemberListener`). A held copy cannot be borrowed by anyone else.
- **FinePolicy** is a Strategy, so a new rule (student discount, cap) is a new class.
- **Search with Specification**: `TitleContains("c++") && AuthorIs("Stroustrup")` without a function per combination.
- **Time** is a `day` integer so tests are deterministic.
- **Errors** as result strings (`Result`), because refusals are normal.

## Step 5: the code

```cpp run title="Library: borrow, return, reserve, fines, search"
#include <algorithm>
#include <deque>
#include <iostream>
#include <map>
#include <memory>
#include <string>
#include <vector>
using namespace std;

struct Book { string isbn, title, author; };

// ---------- Specification for search ----------
struct Spec { virtual ~Spec() = default; virtual bool matches(const Book& b) const = 0; };
using SpecPtr = shared_ptr<const Spec>;
struct TitleContains : Spec { string t; explicit TitleContains(string t) : t(move(t)) {} bool matches(const Book& b) const override { return b.title.find(t) != string::npos; } };
struct AuthorIs : Spec { string a; explicit AuthorIs(string a) : a(move(a)) {} bool matches(const Book& b) const override { return b.author == a; } };
struct AndSpec : Spec { SpecPtr l, r; AndSpec(SpecPtr l, SpecPtr r) : l(move(l)), r(move(r)) {} bool matches(const Book& b) const override { return l->matches(b) && r->matches(b); } };
SpecPtr operator&&(SpecPtr a, SpecPtr b) { return make_shared<AndSpec>(move(a), move(b)); }

// ---------- fine strategy ----------
struct FinePolicy { virtual ~FinePolicy() = default; virtual long fine(int daysLate) const = 0; };
struct PerDayFine : FinePolicy { long rate; explicit PerDayFine(long r) : rate(r) {} long fine(int d) const override { return d > 0 ? d * rate : 0; } };

// ---------- observer: told when a held copy is ready ----------
struct MemberListener { virtual ~MemberListener() = default; virtual void onCopyAvailable(const Book& b) = 0; };

enum class CopyStatus { Available, Borrowed, Held };
struct Copy { int id; const Book* book; CopyStatus status = CopyStatus::Available; string heldFor; };

class Member : public MemberListener {
    string name_;
    vector<Copy*> loans_;
    vector<int> due_;
    static constexpr size_t kMax = 3;
public:
    explicit Member(string n) : name_(move(n)) {}
    const string& name() const { return name_; }
    bool canBorrow() const { return loans_.size() < kMax; }
    void addLoan(Copy* c, int due) { loans_.push_back(c); due_.push_back(due); }
    int removeLoan(int copyId) {                           // returns the due day, or -1
        for (size_t i = 0; i < loans_.size(); ++i)
            if (loans_[i]->id == copyId) { int d = due_[i]; loans_.erase(loans_.begin() + i); due_.erase(due_.begin() + i); return d; }
        return -1;
    }
    void onCopyAvailable(const Book& b) override { cout << "  [notify " << name_ << "] '" << b.title << "' is ready for you\n"; }
};

class Library {
    vector<unique_ptr<Book>> books_;
    vector<unique_ptr<Copy>> copies_;
    map<string, deque<Member*>> reservations_;              // per ISBN, first come first served
    unique_ptr<FinePolicy> fines_;
    int nextCopy_ = 1;
    static constexpr int kLoanDays = 14;
public:
    explicit Library(unique_ptr<FinePolicy> f) : fines_(move(f)) {}

    void addBook(Book b, int copies) {
        books_.push_back(make_unique<Book>(move(b)));
        for (int i = 0; i < copies; ++i) copies_.push_back(make_unique<Copy>(Copy{nextCopy_++, books_.back().get(), CopyStatus::Available, ""}));
    }
    vector<const Book*> search(const SpecPtr& spec) const {
        vector<const Book*> out;
        for (const auto& b : books_) if (spec->matches(*b)) out.push_back(b.get());
        return out;
    }
    string borrow(Member& m, const string& isbn, int day) {
        if (!m.canBorrow()) return "refused: " + m.name() + " has reached the loan limit";
        Copy* pick = nullptr;
        bool heldForOthers = false;
        for (auto& c : copies_) {
            if (c->book->isbn != isbn) continue;
            if (c->status == CopyStatus::Held && c->heldFor != m.name()) heldForOthers = true;
            if (c->status == CopyStatus::Available) pick = pick ? pick : c.get();                       // a free copy
            if (c->status == CopyStatus::Held && c->heldFor == m.name()) { pick = c.get(); break; }    // held for me: take it
        }
        if (!pick) return heldForOthers ? "refused: the copy is on hold for another member" : "refused: no copy available (reserve it)";
        auto& q = reservations_[isbn];
        if (pick->status == CopyStatus::Available && !q.empty() && q.front() != &m) return "refused: reserved by others first";
        if (!q.empty() && q.front() == &m) q.pop_front();
        pick->status = CopyStatus::Borrowed; pick->heldFor.clear();
        m.addLoan(pick, day + kLoanDays);
        return m.name() + " borrowed '" + pick->book->title + "' (copy " + to_string(pick->id) + "), due day " + to_string(day + kLoanDays);
    }
    string reserve(Member& m, const string& isbn) {
        for (auto& c : copies_) if (c->book->isbn == isbn && c->status == CopyStatus::Available) return "no need to reserve: a copy is free";
        reservations_[isbn].push_back(&m);
        return m.name() + " is #" + to_string(reservations_[isbn].size()) + " in the queue";
    }
    string giveBack(Member& m, int copyId, int day) {
        int due = m.removeLoan(copyId);
        if (due < 0) return "refused: no such loan";
        Copy& c = *find_if(copies_.begin(), copies_.end(), [&](auto& p) { return p->id == copyId; })->get();
        string out = m.name() + " returned copy " + to_string(copyId);
        long fine = fines_->fine(day - due);
        if (fine) out += ", fine Rs " + to_string(fine);
        auto& q = reservations_[c.book->isbn];
        if (!q.empty()) {                                   // hand over to the first reserver
            c.status = CopyStatus::Held; c.heldFor = q.front()->name();
            cout << "  " << out << "\n";
            q.front()->onCopyAvailable(*c.book);
            return "  copy " + to_string(copyId) + " is held for " + c.heldFor;
        }
        c.status = CopyStatus::Available;
        return out;
    }
};

int main() {
    Library lib(make_unique<PerDayFine>(2));
    lib.addBook({"111", "Programming in C++", "Stroustrup"}, 1);
    lib.addBook({"222", "Effective C++", "Meyers"}, 1);
    lib.addBook({"333", "The C++ Standard Library", "Josuttis"}, 2);

    cout << "search 'C++' by Meyers:\n";
    SpecPtr cpp = make_shared<TitleContains>("C++");
    SpecPtr meyers = make_shared<AuthorIs>("Meyers");
    for (auto* b : lib.search(cpp && meyers)) cout << "  " << b->title << "\n";

    Member asha("Asha"), ravi("Ravi"), meera("Meera");
    cout << lib.borrow(asha, "111", 1) << "\n";
    cout << lib.borrow(ravi, "111", 2) << "\n";
    cout << lib.reserve(ravi, "111") << "\n";
    cout << lib.reserve(meera, "111") << "\n";
    cout << "Asha returns 6 days late:\n";
    cout << lib.giveBack(asha, 1, 21) << "\n";
    cout << lib.borrow(meera, "111", 22) << "\n";            // held for Ravi, so Meera is refused
    cout << lib.borrow(ravi, "111", 22) << "\n";             // Ravi takes the held copy
}
```

## Edge cases

| Case | Handling |
|---|---|
| Borrowing a copy held for someone else | refused; only the holder (or no one if the queue is empty) may take it |
| Member at the loan limit | refused with a reason |
| Reserving a title that has a free copy | no reservation needed |
| Returning a copy you did not borrow | refused |
| Reservation expires if not collected | add a hold expiry and a cleanup job (extension) |
| Same member reserving twice | ignore duplicates in the queue |

## Extensions and follow-ups

| Follow-up | Design response |
|---|---|
| "Different loan periods or limits for students and staff" | a `MembershipType` strategy providing `maxLoans` and `loanDays` |
| "Renew a loan" | a method that extends `due` unless someone has reserved the title |
| "Several branches" | a `Branch` owning copies; `Library` becomes a facade over branches; transfer requests |
| "Notifications by email/SMS" | the listener forwards to a `Notifier` interface |
| "Catalogue search at scale" | an inverted index behind the same `Specification`/`SearchService` interface |
| "Audit trail" | events (`Borrowed`, `Returned`, `FineCharged`) appended to an event log |
| "Concurrent borrowers for the last copy" | lock the Book (or ISBN) while finding and marking a copy |

```quiz
? Why separate Book from Copy?
- Fewer classes
+ Reservations belong to the title and loans to a physical copy; mixing them breaks both
- Books have no data
> The title can be unavailable even though the catalogue entry exists.
? How does the member learn that a reserved copy is ready?
- They poll every minute
+ The library notifies the first member in the queue (Observer)
- Nothing happens
> A listener callback is invoked when a copy is returned.
```

:::keypoints
- Book (catalogue) vs Copy (physical); reservations per title; a held state protects the reserver.
- Observer for "your book is ready", Strategy for fines, Specification for search.
- Check limits and ownership in one place; return clear refusals rather than exceptions.
:::
