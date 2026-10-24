---
title: Design a Library Management System
level: easy
time: 50
summary: Books and their physical copies, members with a loan limit, reservations with a waiting line and a message when a copy comes back, fines using a rule you can swap, and search built from small combinable rules.
---

:::problem Design a Library Management System {level=easy tags="classic,reservations,Observer,Specification,Strategy"}
Design a library management system. The library has books, and each book has one or more physical copies. Members can search the catalogue, borrow and return copies, and reserve a book that has no free copy. A late return costs a fine. Librarians add books and copies.

:::hint Hint
Keep the **Book** (title, author, ISBN) separate from the **Copy** (the real item on the shelf). A reservation belongs to the Book. A loan belongs to the Copy. A waiting line for reservations, plus a message when a copy comes back, fits the Observer pattern.
:::
:::

## Step 1: Ask questions (requirements)

| Question | Our assumption |
|---|---|
| Main things? | Book (ISBN, title, author), Copy (id, status), Member, Loan, Reservation |
| Loan rules? | at most 3 loans per member, 14 days |
| Late fine? | per day. The rate is set by a rule that can change |
| Reservations? | a member can reserve a book with no free copy. When a copy is returned, the **first member in the line** gets a message, and the copy is kept for them |
| Search? | by title and/or author, and the two can be combined |
| Roles? | member and librarian (permissions are not needed) |
| Not needed | payments, e-books, many branches |

(The earlier lesson "From requirements to classes" built a smaller library. This one adds reservations, messages and better search.)

## Step 2: Find the classes

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

## Step 3: The main flows

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

A copy goes through these states: **Available**, then **Borrowed**, and if someone is waiting, **Held** for the first person in the line.

## Step 4: Design decisions

- **Book vs Copy.** Reservations are for the title, and loans are for a copy. Mixing the two is the most common mistake.
- **Reservation line** for each ISBN (`deque<Member*>`). When a copy comes back, if the line is not empty, the copy becomes `Held` and the first member gets a **message** (Observer: `MemberListener`). A held copy cannot be borrowed by anyone else.
- **FinePolicy is a Strategy.** A new rule (student discount, maximum fine) is a new class.
- **Search with Specification:** `TitleContains("c++") && AuthorIs("Stroustrup")` works without writing a function for each combination.
- **Time is a `day` number**, so tests give the same result every time.
- **Refusals are results** (a `Result` with a reason), because refusing is a normal thing here.

## Step 5: The code

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

| Case | What happens |
|---|---|
| Borrowing a copy that is held for someone else | refused. Only the one it is held for can take it |
| Member already has the maximum loans | refused with a reason |
| Reserving a book that has a free copy | no reservation is needed |
| Returning a copy you did not borrow | refused |
| A reservation is never collected | add a hold time limit and a clean-up job (extension) |
| The same member reserves twice | ignore the repeat in the line |

## What if the interviewer asks for more?

| Follow-up | Our answer |
|---|---|
| "Different loan days or limits for students and staff" | a `MembershipType` strategy that gives `maxLoans` and `loanDays` |
| "Renew a loan" | a method that extends the due date unless someone has reserved the book |
| "Many branches" | a `Branch` owns copies. `Library` becomes a facade over branches. Add transfer requests |
| "Messages by email or SMS" | the listener passes the message to a `Notifier` interface |
| "Search on a very big catalogue" | an inverted index behind the same `SearchService` or `Specification` interface |
| "A record of what happened" | add events (`Borrowed`, `Returned`, `FineCharged`) to an event log |
| "Two people want the last copy together" | lock the book (or the ISBN) while finding and marking a copy |

## Short answer to say in an interview

:::interview How do you handle reservations in a library system?
"I keep the Book and the Copy as separate classes. A reservation belongs to the book. Each book has a waiting line of members. When a copy is returned and the line is not empty, the copy becomes held for the first member, and the member gets a message through an observer. Nobody else can borrow a held copy. The fine rule is a strategy, so it can change without touching the library class."
:::

```quiz
? Why separate Book from Copy?
- Fewer classes
+ Reservations belong to the title, and loans belong to a real copy. Mixing them breaks both
- Books have no data
> A title can be unavailable even though it is in the catalogue.
? How does the member learn that the reserved copy is ready?
- They check every minute
+ The library tells the first member in the line (Observer)
- Nothing happens
> A listener is called when a copy is returned.
```

:::keypoints
- Book (the catalogue entry) and Copy (the real item). Reservations belong to the title. A held state protects the person who reserved.
- Observer for "your book is ready", Strategy for fines, Specification for search.
- Check limits and ownership in one place. Return clear refusals instead of exceptions.
:::
