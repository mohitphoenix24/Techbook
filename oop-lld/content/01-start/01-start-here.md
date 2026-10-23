---
title: Welcome, and how to use this course
level: easy
time: 10
summary: What OOPLab teaches, how it is organised, how to study from it in 2, 6 or 12 weeks, and how to run the code on your own computer.
---

This course is one place to prepare for **object-oriented programming (OOP)** and **low-level design (LLD)** interviews, with **C++** as the language. It starts from "what is a class?" and ends with "design a chess game, thread-safe, with undo".

:::analogy Think of it like this
Learning OOP and LLD is like learning to build with LEGO. First you learn what each brick does (classes, inheritance, virtual functions). Then you learn the famous ways of joining bricks (design patterns). Finally you build real models (LLD problems) without looking at the picture on the box.
:::

## What is inside

| Part | Modules | What you get |
|---|---|---|
| **I. OOP in C++** | 2 to 7 | Types and memory, classes, constructors, copy and move, inheritance, virtual functions and the vtable, operators, templates, smart pointers, exceptions, modern C++ idioms |
| **II. LLD concepts** | 8 to 15 | UML, cohesion and coupling, **SOLID**, **all 23 Gang-of-Four patterns** plus the useful extras, concurrency in C++, testability |
| **III. LLD problems** | 16 to 19 | A method for any LLD question, then **40+ worked problems** in three levels: **Basic**, **Intermediate**, **Advanced** |
| **IV. Interview bank** | 20 and 21 | Every interview question in one place: one bank for **OOP**, one for **LLD**, each grouped by topic, with answers short enough to say aloud |
| **V. Plan** | 22 | Study schedules and a short list of verified resources |

You can jump straight to the [Interview Q&A](#/qa) page at any time. It collects every question in the course.

## How every lesson is built

1. **A picture or an analogy first**, in plain words.
2. **Small runnable C++ programs.** Each one shows the real output. Press **Run** to see it, edit the code, press **Run** again.
3. **The rules and corner cases**, with the mistakes people make.
4. **`Interview tip` boxes** that say what interviewers actually ask.
5. **A quick quiz and key points** at the end.

:::note The code is real
Every example in this course was compiled with `g++ -std=c++20 -Wall -Wextra` with AddressSanitizer and UBSan turned on, and it ran without errors. The output you see is the output the program printed. Programs that show a bug on purpose are marked, and say so.
:::

## Your first class

Here is a complete program. Read it once, then press **Run**.

```cpp run title="Hello, object"
#include <iostream>
#include <string>
using namespace std;

class Greeter {
    string name_;                          // private data: only Greeter's own functions can touch it
public:
    explicit Greeter(string name) : name_(move(name)) {}
    void greet() const { cout << "Hello, " << name_ << "!\n"; }
};

int main() {
    Greeter g("OOPLab");                   // create an object
    g.greet();                             // call its function
}
```

A **class** is a blueprint. `g` is an **object**, one thing made from that blueprint. The data (`name_`) is hidden inside. The only way to use it is through the function `greet()`. That one idea, "keep data and the functions that use it together, and hide the data", is where all of OOP begins.

## Running the code on your own computer

You do not need to install anything to use this site. But to practise, a local compiler helps:

```bash
# Linux / macOS (g++ or clang++), Windows (MSYS2 or WSL)
g++ -std=c++20 -Wall -Wextra -g main.cpp -o main
./main

# the same, with the sanitizers we use to check every example in this course
g++ -std=c++20 -Wall -Wextra -g -fsanitize=address,undefined main.cpp -o main
./main
```

Use `-Wall -Wextra` always. Many OOP bugs (a missing `virtual`, an uninitialised member, a wrong init order) are caught by these warnings before you even run the program.

## How long will it take?

| You have | Plan |
|---|---|
| **2 weeks** (crash course) | Skim Part I (read the key points and the Q&A bank). Do SOLID and the 10 most-asked patterns: Singleton, Factory, Builder, Strategy, Observer, Decorator, State, Command, Adapter, Facade. Solve 8 basic and 6 intermediate problems. |
| **6 weeks** | Part I in weeks 1 to 2, Part II in weeks 3 and 4, problems in weeks 5 and 6, with the Q&A bank every day for 20 minutes. |
| **12 weeks** | Everything, in order. Write each LLD problem yourself first on paper. |

The full day-by-day schedule is in the last module.

## Three rules for studying from this course

:::tip Learn it by typing it
Reading code gives you about 20% of the value. After each lesson, close the page and write the main example again from memory. Then compare. The gaps you find are exactly what you would miss in an interview.
:::

:::tip Say it out loud
In an interview you must explain, not only write. Open a question in the Q&A bank, say your answer aloud, then check. Say "because", "so that" and "the trade-off is" often.
:::

:::tip Break things on purpose
Delete a `virtual`. Remove a `const`. Forget a destructor. Run it. The compiler messages and sanitizer reports are the best teachers for C++.
:::

```quiz
? What is the relationship between a class and an object?
- A class is an instance of an object
+ An object is one instance made from a class (the blueprint)
- They are the same thing
> A class describes the data and behaviour. An object is one concrete thing created from it, with its own copy of the data.
? Which part of this course collects every interview question in one place?
- Module 1
+ The Interview Q&A page (the OOP bank and the LLD bank)
- Only the glossary
> Use the Interview Q&A page from the top bar. It is organised by topic, and you can mark the questions you know.
```

:::keypoints
- OOPLab teaches OOP in C++ first, then LLD (principles, patterns, concurrency), then 40+ LLD problems, then a question bank.
- All code is real and verified. Edit and run it. Break it on purpose.
- Use the problems tracker for LLD practice and the Q&A page for revision.
- Compile locally with `-std=c++20 -Wall -Wextra` and the sanitizers.
:::
