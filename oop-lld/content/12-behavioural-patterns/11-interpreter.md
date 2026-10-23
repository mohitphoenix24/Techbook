---
title: Interpreter
level: advanced
time: 40
summary: Representing a small language as a class hierarchy and evaluating sentences with it: grammar rules as classes, an AST built with Composite, a tokenizer and a recursive-descent parser, a rule engine for conditions like age > 18 AND country == IN, and when not to use it.
---

:::def Interpreter
Given a language, define a **representation for its grammar** along with an **interpreter** that uses the representation to interpret sentences in the language.
:::

It is for small, stable **domain-specific languages** (DSLs): search filters, pricing rules, validation rules, access policies, simple formulas, configuration expressions. For a full programming language, use a parser generator and a proper compiler design.

## The idea

1. Write the **grammar** of your mini-language.
2. Make **one class per grammar rule**. Each class has an `interpret(context)` method.
3. A sentence becomes a **tree of these objects** (an abstract syntax tree, AST), which is a **Composite**: terminals are leaves, non-terminals combine sub-expressions.
4. Evaluating the sentence = calling `interpret` on the root.

Grammar for boolean conditions over a user record:

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

The tree is a **Composite**; `interpret` is a recursive evaluation. The grammar's structure *is* the class structure.

## Step 2: parse text into the tree

The pattern itself does not say how to build the tree. Usually a **parser** turns text into the AST. For a small grammar, a **recursive-descent parser** (one function per grammar rule) is short and clear.

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

Now **non-programmers can write rules** as text (a config file, an admin panel), and the engine turns them into objects. This is how many access-control, pricing and fraud-rule engines start.

## Interpreter vs Composite vs Visitor

- The AST is a **Composite**.
- The `interpret` method in each node is one operation. If you need **several** operations over the same grammar (evaluate, print, optimise, type-check), move them out into **Visitors** so node classes do not grow.
- The tree is often built with **Builder** or a **parser**.

## When to use Interpreter, and when not

| Use it when | Avoid it when |
|---|---|
| The language is **small and simple** (a handful of rules) | The grammar is large or complex: classes multiply; use a parser generator (ANTLR, Bison, PEG) |
| **Performance is not critical** (tree walking is slow) | You need speed: compile to bytecode or machine code |
| The rules change often and are configured at run time | A fixed set of rules known at compile time: just write code or use `std::function` |
| Non-developers or external config supply the sentences | A general-purpose language would do: embed Lua, Python, JavaScript |

## Other examples where this pattern fits

- A **regular-expression** matcher (grammar: union, concatenation, star).
- **SQL-like filters** for a search box: `price < 500 AND brand == acme`.
- **Pricing rules**: `if quantity > 10 then 5% else 0%`.
- **Spreadsheet formulas** (see the Spreadsheet problem later in this course).
- **Feature flags**: `country in [IN, US] AND version > 3`.

:::interview Interpreter in one paragraph
"Interpreter represents a small language's grammar as classes, one per rule, so that a sentence becomes a tree (an AST, which is a Composite) and evaluating it is a recursive `interpret(context)` call. A parser, often recursive descent, builds the tree from text. It suits small DSLs such as filter and pricing rules that change at run time. For large grammars or performance-critical use, I would use a parser generator or compile to bytecode, and if there are many operations over the tree I would move them into Visitors."
:::

```quiz
? What data structure does an Interpreter's sentence become?
- A hash map
+ A tree of expression objects (an AST), structured like a Composite
- A queue
> Each grammar rule is a class; sub-expressions are children.
? What builds the tree from text?
- The interpret method
+ A parser (for example recursive descent), which is separate from the pattern itself
- The Composite
> The pattern gives the classes and evaluation; parsing is a separate concern.
? When should you avoid Interpreter?
- For small rule languages
+ For large grammars or performance-critical evaluation
- When rules change at run time
> Tree-walking classes multiply and are slow; use a parser generator or compile.
```

:::keypoints
- Interpreter: one class per grammar rule; sentences become an AST (Composite); `interpret(context)` evaluates recursively.
- A recursive-descent parser turns text into the tree. Great for small DSLs: filters, rules, formulas.
- Many operations over the grammar → use Visitors. For big or fast languages use real parser/compiler tools.
:::
