# OOPLab: OOP and LLD in C++, for interviews

One place to prepare for object-oriented design interviews. It teaches OOP in modern C++ from the basics, then low-level design (UML, SOLID, every design pattern, concurrency), works through 43 LLD problems sorted into Basic, Intermediate and Advanced, and gathers every interview question into two topic-wise banks (OOP in C++ and LLD) with short answers, output puzzles, find-the-bug drills and code-from-scratch exercises.

## Open it

Open the site from the repo root (`../index.html`) and pick OOPLab, or serve the repo root:

```bash
python3 -m http.server 8000      # then open http://localhost:8000/oop-lld/
```

## How the pages work

- ` ```cpp run ` examples show output that was verified with `g++ -std=c++20` (with AddressSanitizer and UBSan) when the course was built. Edit one and press **Run**: the changed code is compiled live with GCC on Compiler Explorer.
- ` ```viz algo=uml|seq|state ` blocks are class diagrams, sequence diagrams (with a step-by-step replay) and state machines drawn from text.
- `:::problem` cards feed the **Problems** tracker (Basic / Intermediate / Advanced). `:::qa` boxes feed the **Q&A bank** page, grouped into OOP and LLD with search, level filter and a "known" tracker saved in your browser.

## Build and test

```bash
python3 build.py                       # bundles lessons, compiles and runs every C++ example, lints
python3 tools/outputs.py parking-lot   # prints the verified output of a lesson (to check the prose against it)
python3 -m http.server 8766            # from the repo root, then:
python3 oop-lld/tools/browser_test.py all      # Playwright: opens every lesson, runs examples, opens every answer
```

The build needs `g++` with C++20 support. Examples that must fail to compile (`expect-error`) or crash (`runtime-error`) are checked too.

## What's inside

| Module | Lessons |
|---|---|
| 1. Start Here | Welcome, and how to use this course; Why object-oriented programming?; How OOP and LLD interviews work |
| 2. C++ Foundations for OOP | Types, initialisation and functions; Memory: stack, heap, pointers and lifetime; References, const and value categories; Structs, enums, optional and tuples; Strings, containers and algorithms: a tour; Headers, source files and the build |
| 3. Classes and Objects | Classes and objects; Encapsulation and access control; Constructors and initialisation; Destructors and RAII; Copying objects: copy constructor, assignment and the Rule of Three; Move semantics, the Rule of Five and the Rule of Zero; static, const and mutable members; friend, nested classes, this chaining, default and delete; The special member functions |
| 4. Inheritance and Polymorphism | Inheritance basics; Access in inheritance: public, protected and private; Virtual functions and dynamic dispatch; Virtual destructors, final and covariant returns; Abstract classes and interfaces; How virtual functions work: vptr and vtable; Multiple inheritance, the diamond and virtual inheritance; Object slicing and C++ casts; Every kind of polymorphism in C++ |
| 5. Operators, Templates and Generic Code | Operator overloading; Conversions, streams, hashing and user-defined literals; Function objects and lambdas; Function and class templates; Concepts and constraints (C++20); CRTP, policy-based design and type erasure; std::variant and std::visit |
| 6. Ownership, Smart Pointers and Errors | Smart pointers: unique_ptr, shared_ptr and weak_ptr; Ownership, lifetimes and relationships; Exceptions; Exception safety guarantees; Error-handling strategies beyond exceptions; Storing objects in containers |
| 7. C++ Idioms and Modern Practice | Value semantics vs reference semantics; PIMPL, factories and hiding the implementation; A tour of modern C++ for designers; Undefined behaviour and the classic gotchas; Writing a good class: the checklist and a worked refactoring |
| 8. LLD Foundations | What is low-level design? The 8-step framework; From requirements to classes; UML class diagrams, and how they map to C++; Sequence, state and use-case diagrams; Cohesion, coupling and the Law of Demeter; Composition over inheritance; Designing for change: variation points and clean APIs |
| 9. SOLID Principles | S: Single Responsibility Principle; O: Open/Closed Principle; L: Liskov Substitution Principle; I: Interface Segregation Principle; D: Dependency Inversion and dependency injection; A full SOLID refactoring, step by step; Code smells and how to fix them |
| 10. Creational Design Patterns | Singleton; Factory Method and Simple Factory; Abstract Factory; Builder; Prototype; Object Pool, lazy initialisation and the registry |
| 11. Structural Design Patterns | Adapter; Bridge; Composite; Decorator; Facade; Flyweight; Proxy |
| 12. Behavioural Design Patterns | Strategy; Observer; Command; State; Template Method; Chain of Responsibility; Iterator; Mediator; Memento; Visitor; Interpreter |
| 13. Beyond the Gang of Four | Null Object; Specification; Repository, DAO and Unit of Work; MVC, MVP, MVVM and the event bus; Entity-Component-System (ECS); Choosing patterns, and anti-patterns to avoid |
| 14. Concurrency for LLD | Threads, data races and why they matter; Mutexes, lock types and deadlock; Condition variables, blocking queues and semaphores; Atomics and the memory model; std::async, future, promise and packaged_task; Building a thread pool; Designing thread-safe classes: patterns and a checklist |
| 15. Testability and Code Quality | Designing for testability: seams, fakes and mocks; Refactoring step by step toward patterns; Clean code for machine-coding rounds |
| 16. How to Solve an LLD Problem | The routine for any LLD problem; The LLD toolkit: building blocks you reuse in every problem; Problem index: all 43 LLD problems by level and by topic |
| 17. LLD Problems: Basic | Design Tic-Tac-Toe; Design Snake and Ladder; Design a Vending Machine; Design a Traffic Signal Controller; Design a Parking Lot; Design a Library Management System; Design an ATM; Design a Coffee Machine; Design a Logging Framework; Design a Shopping Cart with pricing rules; Design Blackjack; Design a Bank Account System; Design a URL Shortener (class level); Design an Expression Calculator |
| 18. LLD Problems: Intermediate | Design an Elevator System; Design a Movie Ticket Booking System; Design Splitwise (expense sharing); Design a Hotel Reservation System; Design a Food Delivery App; Design a Ride-Sharing Service; Design LRU and LFU Caches (generic, thread-safe); Design a Rate Limiter; Design a Notification Service; Design an In-Memory File System; Design a Q&A Platform (Stack Overflow); Design a Social Media News Feed; Design an In-Memory Pub/Sub Message Broker; Design a Task Scheduler; Design an Online Auction System; Design a Chat Application (WhatsApp-like) |
| 19. LLD Problems: Advanced | Design Chess; Design a Text Editor with Undo/Redo; Design a Spreadsheet; Design an In-Memory Key-Value Store with TTL and Transactions; Design an Order Matching Engine (stock exchange); Design a Payment Gateway; Design a Calendar and Meeting Scheduler; Design Search Autocomplete (Typeahead); Design a Cron-Style Job Scheduler; Design a Workflow Engine (DAG executor); Design a Mini Git (version control); Design a Web Crawler; Design a Rule Engine |
| 20. Interview Bank: OOP in C++ | OOP interview: core concepts; OOP interview: C++ basics; OOP interview: constructors and destructors; OOP interview: copying, moving and operators; OOP interview: inheritance and virtual functions; OOP interview: memory and smart pointers; OOP interview: templates, STL and lambdas; OOP interview: exceptions, casts and the rest; OOP interview: modern C++ (11 to 23); OOP interview: output puzzles on classes; OOP interview: output puzzles on the language and library; OOP interview: find the bug; OOP interview: write it from scratch; OOP interview: rapid fire; OOP cheat sheet |
| 21. Interview Bank: LLD and Design Patterns | LLD interview: process and approach; LLD interview: OOP design and UML; LLD interview: SOLID and design principles; LLD interview: creational patterns; LLD interview: structural patterns; LLD interview: behavioural patterns; LLD interview: which pattern would you use?; LLD interview: concurrency in design; LLD interview: follow-up questions for each problem; LLD interview: refactoring drills; LLD interview: trade-offs, testing and communication; LLD cheat sheet |
| 22. Study Plan and Resources | Study plans and the last-day checklist; Books, references and tools |

Totals: **174 lessons**, **43 LLD problems** (14 Basic, 16 Intermediate, 13 Advanced), **555 interview questions** with answers, **417 quiz questions**, **487 runnable C++ examples**.
