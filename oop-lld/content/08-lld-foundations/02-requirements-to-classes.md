---
title: From requirements to classes
level: easy
time: 30
summary: Turning a problem statement into entities by underlining nouns and verbs, CRC cards, deciding between entity, value object, service and enum, placing behaviour with the information-expert rule, and avoiding god classes, with a library example taken to running code.
---

The hardest part of LLD is not code. It is deciding **what the classes are** and **who does what**. A repeatable method makes this routine.

## Step A: write the requirements as short sentences

Take the prompt "Design a library management system" and ask questions until you can write bullets like these:

- A library has many **books**. A book can have many **copies**; each copy is borrowed by one **member** at a time.
- A **member** can borrow at most 3 copies, for 14 days.
- Returning late gives a **fine** of 2 rupees per day.
- A **librarian** can add and remove books. Members can search by title or author.
- A member can **reserve** a title that has no free copy.

## Step B: underline nouns and verbs

| Nouns (candidate classes) | Verbs (candidate methods) |
|---|---|
| Library, Book, Copy (BookItem), Member, Librarian, Fine, Reservation | add book, remove book, search, borrow, return, reserve, calculate fine |

Not every noun becomes a class. Filter them:

| Noun | Decision | Why |
|---|---|---|
| Book | **entity** (class) | has identity (ISBN), details |
| Copy | **entity** | a physical item with its own id and status |
| Member | **entity** | has an id and borrowing state |
| Fine | **value object** or computed | just an amount; calculated by a rule |
| Days (14) | **constant / config** | a number, not a class |
| Librarian | **role** | maybe a `Member` with a role, or a separate `Staff` type |
| Library | **service / facade** | the entry point that coordinates the rest |
| Reservation | **entity** | has a lifecycle (pending, fulfilled) |
| Status (available, borrowed) | **enum** | a fixed set of values |

:::def Entity, value object, service, enum
- **Entity**: has an **identity** that persists as its data changes (an Account with id 42). Compare by id.
- **Value object**: defined only by its **values**, immutable, interchangeable (Money 100 INR, a `DateRange`). Compare by content.
- **Service**: a stateless coordinator of operations that do not belong to one entity (`FineCalculator`, `NotificationService`).
- **Enum**: a closed set of named constants (`CopyStatus`).
:::

## Step C: CRC cards

A **CRC card** (Class, Responsibility, Collaborators) is a quick way to check each class has a clear job and to see who talks to whom. One card per class:

```text
┌──────────────────────────────────────────┐
│ Class: Member                            │
├──────────────────────────────────────────┤
│ Responsibilities:                        │  Collaborators:
│  - know which copies it has borrowed     │   Copy
│  - decide if it may borrow another       │   FinePolicy
│  - know its unpaid fines                 │
└──────────────────────────────────────────┘
```

If a card needs more than 3 or 4 responsibilities, or one with "and" in it, the class is doing too much: split it. If a class has no responsibilities beyond holding data, ask whether it should be a plain `struct`.

## Step D: where does each behaviour go? (the Information Expert rule)

Put each behaviour in the class that **has the data needed to do it**. This single rule (from the GRASP principles) fixes most placement questions.

| Behaviour | Who has the data? | Put it in |
|---|---|---|
| "Can this member borrow more?" | the member's current loans | `Member` |
| "Is this copy available?" | the copy's status | `Copy` |
| "How late is this loan?" | the loan's due date | `Loan` |
| "How much is the fine?" | the days late + a rate that may change | `FinePolicy` (a strategy) |
| "Find books by author" | the catalogue of all books | `Catalogue` / `Library` |

The anti-pattern is a `LibraryManager` that **asks** every object for its data and decides everything (a *god class*). Prefer "tell, don't ask": the member decides if it may borrow; the library just coordinates.

## Step E: from cards to a skeleton, then to running code

```cpp run title="Library: entities, a policy, and the borrow/return flow"
#include <iostream>
#include <map>
#include <memory>
#include <optional>
#include <string>
#include <vector>
using namespace std;

using Day = int;                                         // simple day numbers keep the example deterministic

enum class CopyStatus { Available, Borrowed };

struct Book { string isbn, title, author; };

class Copy {
    int id_;
    const Book* book_;                                   // the Book is owned by the catalogue
    CopyStatus status_ = CopyStatus::Available;
public:
    Copy(int id, const Book* b) : id_(id), book_(b) {}
    int id() const { return id_; }
    const Book& book() const { return *book_; }
    bool available() const { return status_ == CopyStatus::Available; }
    void markBorrowed() { status_ = CopyStatus::Borrowed; }
    void markReturned() { status_ = CopyStatus::Available; }
};

// A policy object: the fine rule may change, so it is not hard-coded inside Member or Library
class FinePolicy {
public:
    virtual ~FinePolicy() = default;
    virtual long fine(int daysLate) const = 0;
};
class PerDayFine : public FinePolicy {
    long rate_;
public:
    explicit PerDayFine(long rate) : rate_(rate) {}
    long fine(int daysLate) const override { return daysLate > 0 ? daysLate * rate_ : 0; }
};

struct Loan { Copy* copy; Day dueOn; };

class Member {
    string name_;
    vector<Loan> loans_;
    static constexpr size_t kMaxLoans = 3;
public:
    explicit Member(string n) : name_(move(n)) {}
    const string& name() const { return name_; }
    bool canBorrow() const { return loans_.size() < kMaxLoans; }              // the member knows its own limit
    void addLoan(Copy* c, Day due) { loans_.push_back({c, due}); }
    optional<Loan> removeLoan(int copyId) {
        for (auto it = loans_.begin(); it != loans_.end(); ++it)
            if (it->copy->id() == copyId) { Loan l = *it; loans_.erase(it); return l; }
        return nullopt;
    }
    size_t loanCount() const { return loans_.size(); }
};

class Library {                                          // coordinates; holds no business rules of its own
    vector<unique_ptr<Book>> books_;
    vector<unique_ptr<Copy>> copies_;
    unique_ptr<FinePolicy> finePolicy_;
    static constexpr int kLoanDays = 14;
    int nextCopyId_ = 1;
public:
    explicit Library(unique_ptr<FinePolicy> p) : finePolicy_(move(p)) {}

    void addBook(Book b, int copies) {
        books_.push_back(make_unique<Book>(move(b)));
        for (int i = 0; i < copies; ++i) copies_.push_back(make_unique<Copy>(nextCopyId_++, books_.back().get()));
    }
    vector<const Book*> searchByAuthor(const string& author) const {
        vector<const Book*> found;
        for (const auto& b : books_) if (b->author == author) found.push_back(b.get());
        return found;
    }
    bool borrow(Member& m, const string& isbn, Day today) {
        if (!m.canBorrow()) { cout << "  " << m.name() << " has reached the loan limit\n"; return false; }
        for (auto& c : copies_)
            if (c->available() && c->book().isbn == isbn) {
                c->markBorrowed();
                m.addLoan(c.get(), today + kLoanDays);
                cout << "  " << m.name() << " borrowed '" << c->book().title << "' (copy " << c->id() << "), due day " << today + kLoanDays << "\n";
                return true;
            }
        cout << "  no free copy of " << isbn << "\n";
        return false;
    }
    long giveBack(Member& m, int copyId, Day today) {
        auto loan = m.removeLoan(copyId);
        if (!loan) { cout << "  no such loan\n"; return 0; }
        loan->copy->markReturned();
        long fine = finePolicy_->fine(today - loan->dueOn);
        cout << "  " << m.name() << " returned copy " << copyId << (fine ? ", fine " + to_string(fine) : ", no fine") << "\n";
        return fine;
    }
};

int main() {
    Library lib(make_unique<PerDayFine>(2));
    lib.addBook({"111", "Godaan", "Premchand"}, 1);
    lib.addBook({"222", "Gitanjali", "Tagore"}, 2);
    cout << "books by Tagore: " << lib.searchByAuthor("Tagore").size() << "\n";

    Member asha("Asha"), ravi("Ravi");
    lib.borrow(asha, "111", 1);
    lib.borrow(ravi, "111", 2);                          // the only copy is out
    lib.giveBack(asha, 1, 20);                           // 5 days late
    lib.giveBack(asha, 1, 20);                           // not a loan any more
}
```

Look at the split of responsibilities: `Copy` guards its own status, `Member` knows the loan limit, `FinePolicy` isolates the rule that will change, and `Library` coordinates. No class has more than one reason to change.

:::interview How do you find the classes in a problem?
"I read the requirements and underline the nouns for candidate classes and the verbs for candidate methods. I then filter: which nouns have identity (entities), which are just values, which are enums or constants. I assign each behaviour to the class that owns the data it needs, check each class with a CRC card, and look for variation points that deserve an interface."
:::

```quiz
? Which is best modelled as a value object?
- A Member (has an id)
+ A `Money` amount or a `DateRange`
- A Book copy with a status
> Value objects have no identity: two equal amounts are interchangeable and immutable.
? What does the Information Expert rule say?
- Put all logic in a Manager class
+ Give each behaviour to the class that has the data needed to do it
- Make every class an interface
> It keeps behaviour close to data and prevents god classes.
? A class has six responsibilities on its CRC card. What should you do?
- Nothing
+ Split it into smaller classes, each with one clear responsibility
> Too many responsibilities signal low cohesion.
```

:::keypoints
- Underline nouns (classes) and verbs (methods), then filter: entity, value object, service, enum, constant.
- CRC cards check each class has one clear job and show collaborators.
- Place behaviour where the data lives (Information Expert); avoid god classes and "Manager" dumping grounds.
- Isolate the rules most likely to change behind a small interface (a policy).
:::
