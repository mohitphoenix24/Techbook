---
title: Class Relationships and UML Diagrams
level: easy
time: 40
summary: Reading and drawing the diagrams LLD interviews use — class diagrams with visibility and stereotypes, the six relationships (association, aggregation, composition, dependency, inheritance, realization) with multiplicities, how each maps to C++ and JavaScript code, and sequence diagrams for the main flow.
---

In an LLD interview you'll sketch a **class diagram** before writing code. It's the fastest way to show the interviewer your model and get early feedback. You don't need full UML; you need the handful of notations below, drawn consistently, and an understanding of what each relationship means in code.

## Anatomy of a class box

```viz algo=uml title="One class, three compartments" legend=off
class Ticket
  - id: string
  - issuedAt: Time
  - spot: ParkingSpot
  # fee: Money
  + close(at: Time): Money
  + isPaid(): bool
  - computeFee(hours: int): Money
```

- **Name** at the top. *Italic* (or «abstract») for abstract classes; «interface» for interfaces; «enum» for enums.
- **Fields** (attributes): `name: Type`.
- **Methods** (operations): `name(param: Type): ReturnType`.
- **Visibility**: `+` public, `-` private, `#` protected, `~` package/internal.

Draw only the members that matter for the discussion. A diagram with every getter is noise.

## The six relationships

| Relationship | Meaning | Notation | Lifetime | In code |
|---|---|---|---|---|
| **Inheritance** (generalisation) | is-a | solid line, hollow triangle → parent | | `class Car : public Vehicle` / `class Car extends Vehicle` |
| **Realization** (implementation) | implements an interface | dashed line, hollow triangle → interface | | `class Card : public PaymentMethod` (pure virtual) / duck typing |
| **Composition** | owns a part; the part can't exist without the whole | solid line, **filled diamond** at the whole | part dies with the whole | member value or `unique_ptr`, created by the owner |
| **Aggregation** | has a part that can exist independently | solid line, **hollow diamond** at the whole | independent | reference / `shared_ptr` / id, passed in |
| **Association** | knows / uses for a long time | solid line, open arrow | independent | a field pointing to the other object |
| **Dependency** | temporarily uses | dashed line, open arrow | | a method parameter, local variable, or return type |

Here are all six in one small model:

```viz algo=uml title="All six relationships"
class Library
  - name: string
  + lend(b: Book, m: Member): Loan
class Shelf
  - code: string
class Book
  - isbn: string
abstract class Member
  - name: string
  + maxLoans(): int
class Student
class Faculty
class Loan
  - due: Date
interface Notifier
  + send(m: Member, text: string)
class EmailNotifier
Library *-- Shelf : owns
Shelf o-- Book : holds
Loan --> Book
Loan --> Member
Student --|> Member
Faculty --|> Member
EmailNotifier ..|> Notifier
Library ..> Notifier : uses to remind
```

Read it as: a library **owns** its shelves (destroy the library, the shelves go with it); a shelf **holds** books that can move to another shelf (aggregation); a loan **associates** a book with a member; students and faculty **are** members; the email notifier **implements** the notifier interface; the library **depends on** a notifier only while sending reminders.

:::tip Composition vs aggregation in practice
Ask: **who creates and destroys the part, and can it be shared?** A `Car` creates its `Engine` and nothing else uses it → composition. A `Team` has `Player`s who existed before the team and may join another → aggregation. Interviewers mostly care that you distinguish "owns" from "refers to", which in C++ is literally `unique_ptr` vs a reference or `shared_ptr`.
:::

### How the relationships look in code

:::tabs Relationships in code
```cpp run
#include <bits/stdc++.h>
using namespace std;

struct Book { string isbn; };

class Shelf {                                   // aggregation: holds books it doesn't own
    string code_;
    vector<Book*> books_;                        // non-owning pointers: books outlive shelves
public:
    explicit Shelf(string code) : code_(std::move(code)) {}
    void place(Book* b) { books_.push_back(b); }
    size_t count() const { return books_.size(); }
    const string& code() const { return code_; }
};

class Member {                                  // abstract base (inheritance)
public:
    explicit Member(string name) : name_(std::move(name)) {}
    virtual ~Member() = default;
    virtual int maxLoans() const = 0;
    const string& name() const { return name_; }
private:
    string name_;
};
class Student : public Member { public: using Member::Member; int maxLoans() const override { return 3; } };
class Faculty : public Member { public: using Member::Member; int maxLoans() const override { return 10; } };

class Notifier {                                // interface (realization)
public:
    virtual ~Notifier() = default;
    virtual void send(const Member& m, const string& text) = 0;
};
class EmailNotifier : public Notifier {
public:
    void send(const Member& m, const string& text) override { cout << "  email to " << m.name() << ": " << text << "\n"; }
};

struct Loan { Book* book; Member* member; string due; };   // association: long-lived links

class Library {
    vector<unique_ptr<Shelf>> shelves_;          // composition: the library owns its shelves
public:
    Shelf& addShelf(string code) { return *shelves_.emplace_back(make_unique<Shelf>(std::move(code))); }
    Loan lend(Book* b, Member* m) { return {b, m, "2026-04-01"}; }
    void remind(Notifier& n, const Loan& loan) {          // dependency: only used inside this call
        n.send(*loan.member, "please return " + loan.book->isbn + " by " + loan.due);
    }
};

int main() {
    Book b1{"978-0262033848"}, b2{"978-1449373320"};   // books exist independently
    Library lib;
    Shelf& s = lib.addShelf("A1");
    s.place(&b1); s.place(&b2);
    Student asha("Asha");
    Faculty rao("Prof. Rao");
    cout << "shelf " << s.code() << " holds " << s.count() << " books\n";
    cout << asha.name() << " may borrow " << asha.maxLoans() << ", " << rao.name() << " " << rao.maxLoans() << "\n";
    Loan loan = lib.lend(&b2, &asha);
    EmailNotifier email;
    lib.remind(email, loan);
}
```
```js run
class Book { constructor(isbn) { this.isbn = isbn; } }

class Shelf {                                    // aggregation: holds books it doesn't own
  #books = [];
  constructor(code) { this.code = code; }
  place(book) { this.#books.push(book); }       // the book was created elsewhere and can move
  get count() { return this.#books.length; }
}

class Member {                                   // abstract base (inheritance)
  constructor(name) { if (new.target === Member) throw new TypeError("abstract"); this.name = name; }
  maxLoans() { throw new Error("not implemented"); }
}
class Student extends Member { maxLoans() { return 3; } }
class Faculty extends Member { maxLoans() { return 10; } }

// Interface (realization): any object with send(member, text) is a Notifier
class EmailNotifier { send(member, text) { console.log(`  email to ${member.name}: ${text}`); } }

class Loan { constructor(book, member, due) { Object.assign(this, { book, member, due }); } }   // association

class Library {
  #shelves = [];                                 // composition: created and owned by the library
  addShelf(code) { const s = new Shelf(code); this.#shelves.push(s); return s; }
  lend(book, member) { return new Loan(book, member, "2026-04-01"); }
  remind(notifier, loan) {                       // dependency: only used inside this call
    notifier.send(loan.member, `please return ${loan.book.isbn} by ${loan.due}`);
  }
}

const b1 = new Book("978-0262033848"), b2 = new Book("978-1449373320");
const lib = new Library();
const s = lib.addShelf("A1");
s.place(b1); s.place(b2);
const asha = new Student("Asha"), rao = new Faculty("Prof. Rao");
console.log(`shelf ${s.code} holds ${s.count} books`);
console.log(`${asha.name} may borrow ${asha.maxLoans()}, ${rao.name} ${rao.maxLoans()}`);
lib.remind(new EmailNotifier(), lib.lend(b2, asha));
```
:::

## Multiplicity

Numbers at the line ends say **how many** objects participate:

| Notation | Meaning |
|---|---|
| `1` | exactly one |
| `0..1` | zero or one (optional) |
| `*` or `0..*` | any number |
| `1..*` | at least one |
| `2..4` | a range |

`ParkingLot "1" *-- "1..*" Level`: a lot has one or more levels, each level belongs to exactly one lot.

```viz algo=uml title="Multiplicities on a parking lot"
class ParkingLot
class Level
class Spot
class Vehicle
ParkingLot "1" *-- "1..*" Level
Level "1" *-- "1..*" Spot
Spot "1" --> "0..1" Vehicle : parked
```

## Sequence diagrams for behaviour

A class diagram shows **structure**. For the main use case, a quick **sequence diagram** shows **behaviour**: which object calls which, in what order. It's great for checking that every responsibility has an owner.

```viz algo=seq title="Main flow: a car enters the parking lot"
participant g EntryGate [gateway]
participant lot ParkingLot [box]
participant lvl Level [box]
participant sp Spot [box]
participant t Ticket [file]
g -> lot : park(car)
lot -> lvl : findSpot(car.size) | Each level searches its spots; the lot tries levels in order.
lvl --> lot : spot B-14
lot -> sp : assign(car)
lot -> t : new Ticket(car, spot, now)
lot --> g : ticket T-901
g -> g : print ticket, open barrier
```

:::interview How much diagram is enough?
Five to ten boxes with the right relationships and the 2–3 key methods each, drawn in a few minutes. Label the **variation points** (interfaces) clearly, since that's where the design discussion goes. Then move to code: a diagram is a tool for agreement, not a deliverable.
:::

```quiz
? A House has Rooms that are created with the house and destroyed with it. Which relationship?
+ Composition (filled diamond at House)
- Aggregation (hollow diamond)
- Dependency (dashed arrow)
> The parts' lifetime is bound to the whole and they aren't shared.

? `class OrderService { void place(Order o, PaymentGateway& pg) { pg.charge(...); } }` — what's the relationship between OrderService and PaymentGateway?
- Composition
- Inheritance
+ Dependency: it's only used as a parameter during one call
> A dashed arrow: OrderService temporarily uses PaymentGateway.

? What does a dashed line with a hollow triangle mean?
- Inheritance from a class
+ Realization: the class implements an interface
- Aggregation
> Solid line + triangle = extends a class; dashed + triangle = implements an interface.

? In UML, what does `-` before a member mean?
+ private
- protected
- static
- public
> + public, - private, # protected, ~ package.
```

:::keypoints
- A class box has a **name**, **fields** and **methods**, with visibility `+ - # ~`; mark «interface», «abstract», «enum».
- Six relationships: **inheritance** (is-a), **realization** (implements), **composition** (owns, same lifetime), **aggregation** (has, independent), **association** (knows), **dependency** (temporarily uses).
- In C++, composition ≈ value or `unique_ptr` member; aggregation/association ≈ references, raw non-owning pointers or `shared_ptr`; dependency ≈ parameter.
- **Multiplicities** (`1`, `0..1`, `*`, `1..*`) at line ends.
- Pair the class diagram with a **sequence diagram** of the main flow; keep both small and focused on variation points.
:::
