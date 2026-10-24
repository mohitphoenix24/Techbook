---
title: From requirements to classes
level: easy
time: 30
summary: How to turn a problem statement into classes step by step. Underline nouns and verbs, decide what becomes a class, give every class a clear job, and reach working code. The example is a library system.
---

The hardest part of LLD is not writing code. It is deciding **which classes to make** and **who does what**. The good news: there is a simple method for it.

## Step A: Write the requirements as short sentences

The question is "Design a library management system". Ask questions until you can write short points like these:

- A library has many **books**. One book can have many **copies**. A copy is borrowed by one **member** at a time.
- A member can borrow at most 3 copies, for 14 days.
- If a copy is returned late, there is a **fine** of 2 rupees per day.
- A **librarian** can add and remove books. Members can search by title or author.
- If no copy is free, a member can **reserve** the book.

## Step B: Underline the nouns and the verbs

- **Nouns** (names of things) are *possible classes*.
- **Verbs** (actions) are *possible methods*.

| Nouns (possible classes) | Verbs (possible methods) |
|---|---|
| Library, Book, Copy, Member, Librarian, Fine, Reservation | add book, remove book, search, borrow, return, reserve, calculate fine |

But **not every noun should become a class**. Filter them like this:

| Noun | Decision | Why |
|---|---|---|
| Book | class | has details and an ISBN number |
| Copy | class | a real physical item with its own id and status |
| Member | class | has an id and remembers what they borrowed |
| Fine | just a number, or a small helper | it is only an amount, worked out by a rule |
| 14 days | constant | it is a number, not a class |
| Librarian | a role | maybe a Member with a special role |
| Library | the main class that coordinates | the entry point for everything |
| Reservation | class | it has a life: waiting, then done |
| Status (available, borrowed) | enum | a small fixed list of values |

:::def Four words you will hear again and again
- **Entity**: a thing with an **identity** that stays the same even when its data changes. Example: Account number 42.
- **Value object**: a thing defined only by its **value**, like Money 100 rupees or a date range. Two with the same value are the same.
- **Service**: a helper class that does a job but does not hold much data, like `FineCalculator`.
- **Enum**: a fixed list of names, like `Available` and `Borrowed`.
:::

## Step C: Make a small card for each class (CRC card)

CRC stands for **Class, Responsibility, Collaborators**. It is just a small card with three things:

- the **class name**,
- its **jobs** (what it is responsible for),
- **who it works with**.

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

How to use the cards:

- If one card has more than 3 or 4 jobs, or a job with the word "and", the class is doing too much. **Split it.**
- If a class has no job except holding data, it may just be a simple `struct`.

## Step D: Which class should do which job?

Use one easy rule: **give the job to the class that already has the data needed for it.**

(This rule is called the *Information Expert* rule. You do not need the name, just the idea.)

| Job | Who has the data? | Put it in |
|---|---|---|
| "Can this member borrow one more book?" | the member knows what they borrowed | `Member` |
| "Is this copy free?" | the copy knows its own status | `Copy` |
| "How late is this loan?" | the loan knows its due date | `Loan` |
| "How much is the fine?" | the days late, plus a rate that may change | `FinePolicy` |
| "Find books by author" | the catalogue holds all books | `Catalogue` / `Library` |

The wrong way is one giant `LibraryManager` that asks every object for its data and then makes all decisions itself. That is called a **god class**, and it is hard to read and hard to change.

A better habit is **"tell, don't ask"**. Do not ask the member "how many books do you have?" and then decide yourself. Just tell the member "borrow this", and the member decides.

## Step E: From cards to code

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

Read the code and notice who does what:

- `Copy` protects its own status.
- `Member` knows the borrowing limit.
- `FinePolicy` holds the rule that is most likely to change (the fine amount).
- `Library` only coordinates between them.

Each class has **one reason to change**. That is the goal.

## Short answer to say in an interview

:::interview How do you find the classes in a problem?
"I write the requirements as short points. I underline the nouns as possible classes and the verbs as possible methods. Then I filter them: which things have an identity, which are just values, and which are small fixed lists. I give each job to the class that owns the needed data, and I put an interface wherever the rule can change."
:::

```quiz
? Which one is best treated as a value object?
- A Member (has an id)
+ A Money amount, like 100 rupees
- A book copy with a status
> A value object has no identity. Two "100 rupees" are the same thing.
? What does "give the job to the class that has the data" help you avoid?
- Using interfaces
+ One giant class that does everything
- Writing tests
> The job stays close to its data, so classes stay small.
? A class card has six jobs. What should you do?
- Keep it as it is
+ Split it into smaller classes with one clear job each
> Too many jobs means the class is doing too much.
```

:::keypoints
- Underline nouns (possible classes) and verbs (possible methods), then filter them.
- Make a small card for each class: name, jobs, who it works with.
- Give each job to the class that has the data for it. Avoid one giant manager class.
- Put the rules that can change (like fines) behind a small interface.
:::
