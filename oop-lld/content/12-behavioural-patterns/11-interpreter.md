---
title: Interpreter
level: advanced
time: 40
summary: Turn the rules of a tiny language into classes and evaluate sentences with them. See a rule like "age > 18 AND country == IN" built as a tree, a simple parser that reads text, and when you should not use this pattern.
---

## What is the Interpreter pattern?

Don't memorise the definition yet. Think of it like this:

> "Someone writes a small rule as text, like `age > 18 AND country == IN`. My program must **read it and decide true or false**."

The pattern teaches you how to do that neatly: turn each piece of the rule into a small class, and join them in a tree.

:::def Interpreter
For a small language, make **one class for each grammar rule**, so a sentence in that language becomes a **tree of objects** that can **evaluate itself**.
:::

(A **grammar** is just the list of rules that say how a sentence may look. For example: "a condition is two conditions joined by AND or OR".)

This is for small, simple **mini-languages**: search filters, pricing rules, validation rules, access rules, simple formulas. For a full programming language, use a parser tool and a real compiler design.

## The idea in four steps

1. Write the **grammar** of your mini-language.
2. Make **one class per rule**. Each has an `interpret(context)` method.
3. A sentence becomes a **tree** of these objects. This tree is a **Composite**: simple items are leaves, and bigger items combine smaller ones.
4. To evaluate, call `interpret` on the **root** of the tree.

Here is the grammar for yes/no conditions on a user record:

```text
expression := or_expr
or_expr    := and_expr ( "OR" and_expr )*
and_expr   := term ( "AND" term )*
term       := comparison | "NOT" term | "(" expression ")"
comparison := identifier ( "==" | ">" | "<" ) value
```

```viz algo=uml title="Interpreter: grammar rules as classes"
interface Expression
  + interpret(ctx: Context): bool
class AndExpr
  - left: Expression
  - right: Expression
class OrExpr
  - left: Expression
  - right: Expression
class NotExpr
  - inner: Expression
class Comparison
  - field: string
  - op: string
  - value: string
AndExpr ..|> Expression
OrExpr ..|> Expression
NotExpr ..|> Expression
Comparison ..|> Expression
AndExpr o-- Expression
OrExpr o-- Expression
NotExpr o-- Expression
```

## Step 1: the expression classes

```cpp run title="Build the tree by hand, then interpret it"
#include <iostream>
#include <map>
#include <memory>
#include <string>
using namespace std;

using Context = map<string, string>;                       // the "sentence's" variables: a user record

class Expression {
public:
    virtual ~Expression() = default;
    virtual bool interpret(const Context& ctx) const = 0;
};

class Comparison : public Expression {                     // terminal expression
    string field_, op_, value_;
public:
    Comparison(string f, string o, string v) : field_(move(f)), op_(move(o)), value_(move(v)) {}
    bool interpret(const Context& ctx) const override {
        auto it = ctx.find(field_);
        if (it == ctx.end()) return false;
        if (op_ == "==") return it->second == value_;
        double a = stod(it->second), b = stod(value_);
        return op_ == ">" ? a > b : a < b;
    }
};
class And : public Expression {                            // non-terminal expressions hold sub-expressions
    unique_ptr<Expression> l_, r_;
public:
    And(unique_ptr<Expression> l, unique_ptr<Expression> r) : l_(move(l)), r_(move(r)) {}
    bool interpret(const Context& c) const override { return l_->interpret(c) && r_->interpret(c); }
};
class Or : public Expression {
    unique_ptr<Expression> l_, r_;
public:
    Or(unique_ptr<Expression> l, unique_ptr<Expression> r) : l_(move(l)), r_(move(r)) {}
    bool interpret(const Context& c) const override { return l_->interpret(c) || r_->interpret(c); }
};
class Not : public Expression {
    unique_ptr<Expression> e_;
public:
    explicit Not(unique_ptr<Expression> e) : e_(move(e)) {}
    bool interpret(const Context& c) const override { return !e_->interpret(c); }
};

int main() {
    // age > 18 AND (country == IN OR plan == premium)
    auto rule = make_unique<And>(
        make_unique<Comparison>("age", ">", "18"),
        make_unique<Or>(make_unique<Comparison>("country", "==", "IN"),
                        make_unique<Comparison>("plan", "==", "premium")));

    Context asha{{"age", "25"}, {"country", "IN"}, {"plan", "free"}};
    Context ravi{{"age", "16"}, {"country", "IN"}, {"plan", "premium"}};
    Context john{{"age", "40"}, {"country", "US"}, {"plan", "free"}};
    cout << boolalpha << "asha: " << rule->interpret(asha) << ", ravi: " << rule->interpret(ravi) << ", john: " << rule->interpret(john) << "\n";
}
```

The tree is a **Composite**, and `interpret` is a recursive evaluation. The **shape of the grammar is the shape of the classes**.

## Step 2: read the text and build the tree

The pattern does not say how to make the tree from text. For that you use a **parser**. For a small grammar, a **recursive-descent parser** (one small function for each grammar rule) is short and clear.

```cpp run title="Rules as text: tokenizer + recursive-descent parser + interpreter"
#include <cctype>
#include <iostream>
#include <map>
#include <memory>
#include <stdexcept>
#include <string>
#include <vector>
using namespace std;

using Context = map<string, string>;
struct Expression { virtual ~Expression() = default; virtual bool interpret(const Context&) const = 0; };

struct Compare : Expression {
    string f, op, v;
    Compare(string f, string o, string v) : f(move(f)), op(move(o)), v(move(v)) {}
    bool interpret(const Context& c) const override {
        auto it = c.find(f); if (it == c.end()) return false;
        if (op == "==") return it->second == v;
        double a = stod(it->second), b = stod(v);
        return op == ">" ? a > b : a < b;
    }
};
struct And : Expression { unique_ptr<Expression> l, r; And(unique_ptr<Expression> a, unique_ptr<Expression> b) : l(move(a)), r(move(b)) {} bool interpret(const Context& c) const override { return l->interpret(c) && r->interpret(c); } };
struct Or  : Expression { unique_ptr<Expression> l, r; Or(unique_ptr<Expression> a, unique_ptr<Expression> b) : l(move(a)), r(move(b)) {} bool interpret(const Context& c) const override { return l->interpret(c) || r->interpret(c); } };
struct Not : Expression { unique_ptr<Expression> e; explicit Not(unique_ptr<Expression> x) : e(move(x)) {} bool interpret(const Context& c) const override { return !e->interpret(c); } };

// ---- tokenizer: "age > 18 AND (plan == pro)" -> ["age", ">", "18", "AND", "(", "plan", "==", "pro", ")"] ----
vector<string> tokenize(const string& s) {
    vector<string> t;
    for (size_t i = 0; i < s.size();) {
        if (isspace(static_cast<unsigned char>(s[i]))) { ++i; continue; }
        if (s[i] == '(' || s[i] == ')' || s[i] == '>' || s[i] == '<') { t.emplace_back(1, s[i]); ++i; continue; }
        if (s.compare(i, 2, "==") == 0) { t.push_back("=="); i += 2; continue; }
        size_t j = i;
        while (j < s.size() && !isspace(static_cast<unsigned char>(s[j])) && string("()<>=").find(s[j]) == string::npos) ++j;
        t.push_back(s.substr(i, j - i)); i = j;
    }
    return t;
}

// ---- recursive-descent parser: one function per grammar rule ----
class Parser {
    vector<string> tok_; size_t pos_ = 0;
    const string& peek() const { static const string end; return pos_ < tok_.size() ? tok_[pos_] : end; }
    string next() { if (pos_ >= tok_.size()) throw runtime_error("unexpected end"); return tok_[pos_++]; }
    unique_ptr<Expression> orExpr() {
        auto left = andExpr();
        while (peek() == "OR") { next(); left = make_unique<Or>(move(left), andExpr()); }
        return left;
    }
    unique_ptr<Expression> andExpr() {
        auto left = term();
        while (peek() == "AND") { next(); left = make_unique<And>(move(left), term()); }
        return left;
    }
    unique_ptr<Expression> term() {
        if (peek() == "NOT") { next(); return make_unique<Not>(term()); }
        if (peek() == "(") { next(); auto e = orExpr(); if (next() != ")") throw runtime_error("expected )"); return e; }
        string field = next(), op = next(), value = next();
        if (op != "==" && op != ">" && op != "<") throw runtime_error("bad operator " + op);
        return make_unique<Compare>(field, op, value);
    }
public:
    explicit Parser(vector<string> t) : tok_(move(t)) {}
    unique_ptr<Expression> parse() { auto e = orExpr(); if (pos_ != tok_.size()) throw runtime_error("trailing input: " + peek()); return e; }
};

int main() {
    Context asha{{"age", "25"}, {"country", "IN"}, {"plan", "free"}};
    Context ravi{{"age", "16"}, {"country", "IN"}, {"plan", "premium"}};
    Context john{{"age", "40"}, {"country", "US"}, {"plan", "free"}};
    for (const char* text : {"age > 18 AND (country == IN OR plan == premium)", "NOT plan == premium AND age < 30", "age >"}) {
        cout << text << "\n";
        try {
            auto rule = Parser(tokenize(text)).parse();
            cout << boolalpha << "   asha=" << rule->interpret(asha) << " ravi=" << rule->interpret(ravi) << " john=" << rule->interpret(john) << "\n";
        } catch (const exception& e) { cout << "   syntax error: " << e.what() << "\n"; }
    }
}
```

Now **non-programmers can write rules** as text (in a config file or an admin page), and the program turns them into objects. This is how many access, pricing and fraud rule engines begin.

## How Interpreter relates to Composite and Visitor

- The tree is a **Composite**.
- The `interpret` method in each class is one operation. If you need **many** operations on the same tree (evaluate, print, optimise, check types), move them into **Visitors**, so the node classes stay small.
- The tree is often made by a **parser** or a **Builder**.

## When to use it, and when not

| Use it when | Avoid it when |
|---|---|
| The language is **small and simple** | The grammar is big: the classes multiply. Use a parser tool (ANTLR, Bison, PEG) |
| Speed is **not critical** (walking a tree is slow) | You need speed: compile to bytecode or machine code |
| Rules change often and are set at run time | The rules are fixed and known while writing code: just write the code or use `std::function` |
| Non-developers supply the rules | A full language would do: embed Lua or Python |

## More places where this fits

- A **regular-expression** matcher.
- **Search filters**: `price < 500 AND brand == acme`.
- **Pricing rules**: `if quantity > 10 then 5% else 0%`.
- **Spreadsheet formulas** (you will see this in the Spreadsheet problem later).
- **Feature flags**: `country in [IN, US] AND version > 3`.

## Short answer to say in an interview

:::interview Explain Interpreter in a few lines.
"Interpreter turns the rules of a small language into classes, one class per rule. A sentence becomes a tree of objects, which is a Composite, and calling interpret on the root evaluates it. A parser, often recursive descent, builds the tree from text. It suits small rule languages, like filters and pricing rules, that change at run time. For big grammars or fast evaluation I would use a parser tool or compile the rules, and if there are many operations on the tree I would use Visitors."
:::

```quiz
? What does a sentence become in the Interpreter pattern?
- A hash map
+ A tree of expression objects, shaped like a Composite
- A queue
> Each grammar rule is a class, and the smaller parts are children.
? What builds the tree from text?
- The interpret method
+ A parser (for example recursive descent), which is separate from the pattern itself
- The Composite
> The pattern gives the classes and the evaluation. Parsing is a separate job.
? When should you avoid Interpreter?
- For small rule languages
+ For big grammars, or when evaluation must be very fast
- When rules change at run time
> The classes multiply and tree walking is slow. Use a parser tool or compile.
```

:::keypoints
- Interpreter = one class per grammar rule. A sentence becomes a tree. `interpret(context)` evaluates it step by step.
- A recursive-descent parser turns text into the tree. Great for small rule languages.
- For many operations use Visitors. For big or fast languages use real parser and compiler tools.
:::
