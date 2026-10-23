---
title: Design an Expression Calculator
level: easy
time: 50
summary: A calculator that parses arithmetic text with precedence, parentheses, unary minus, variables and functions into a tree, evaluates it with a visitor-style interface, and reports errors with positions, built from a tokenizer, a recursive-descent parser and a Composite AST.
---

:::problem Design an Expression Calculator {level=easy tags="parsing,Composite,Interpreter,Visitor,error handling"}
Design a calculator that evaluates expressions such as `2 + 3 * (4 - 1)`, `-x ^ 2`, and `max(a, 10) / 4`. Support the operators `+ - * / ^`, parentheses, unary minus, named variables and a few built-in functions. Report clear errors (unknown variable, divide by zero, a syntax error with its position). Make it easy to add new operators and functions.

:::hint Hint
Split the work: a **tokenizer** (text to tokens), a **parser** (tokens to a tree, respecting precedence), and an **evaluator** (tree to number). The tree is a Composite. Functions live in a registry so adding one is a one-liner.
:::
:::

## Step 1: requirements

| Question | Assumption |
|---|---|
| Operators? | `+ - * / ^` with the usual precedence; `^` is right-associative; unary `-` |
| Numbers? | decimals (`3.14`); doubles |
| Variables? | letters/underscore names, looked up in a context |
| Functions? | `max`, `min`, `sqrt`, `abs`; extensible; any number of arguments |
| Errors? | unknown variable/function, division by zero, syntax errors reported with a column |
| Extras? | print the tree back as a string; evaluate many times with different variable values |
| Out of scope | complex numbers, units, statements |

## Step 2: the grammar and precedence

```text
expression := term (("+" | "-") term)*
term       := power (("*" | "/") power)*
power      := unary ("^" power)?                 right-associative
unary      := "-" unary | primary
primary    := number | name | name "(" args ")" | "(" expression ")"
```

Lower in the grammar binds tighter: `^` over `*` over `+`. A **recursive-descent parser** has one function per rule, which makes precedence and associativity visible in the code.

## Step 3: entities

```viz algo=uml title="Calculator"
class Calculator
  + evaluate(text: string, vars: Context): Result
class Tokenizer
  + tokenize(text: string): Token[]
class Parser
  + parse(tokens: Token[]): Node
interface Node
  + eval(ctx: Context): double
  + str(): string
class Number
class Variable
class Unary
class Binary
class Call
class FunctionRegistry
  + find(name: string): Function
Number ..|> Node
Variable ..|> Node
Unary ..|> Node
Binary ..|> Node
Call ..|> Node
Binary o-- Node
Unary o-- Node
Call o-- Node
Call --> FunctionRegistry
Calculator --> Tokenizer
Calculator --> Parser
Parser ..> Node
```

## Step 4: design decisions

- **Composite AST**: leaves (`Number`, `Variable`) and composites (`Unary`, `Binary`, `Call`) share `Node::eval`. A new operator is a new node type, and a new operation on trees (simplify, compile) can be a Visitor.
- **Errors carry a position**, thrown as a `CalcError` inside the parser/evaluator and converted to a `Result` at the `Calculator` boundary (one place).
- **Function registry** maps names to `function<double(const vector<double>&)>`; a new function is a registration line, with no change to the parser.
- **The parse is separate from evaluation**, so an expression can be parsed once and evaluated many times with different variables (a `Compiled` object).

## Step 5: the code

```cpp run title="Tokenizer, parser, AST and evaluator"
#include <algorithm>
#include <cctype>
#include <cmath>
#include <functional>
#include <iostream>
#include <map>
#include <memory>
#include <optional>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>
using namespace std;

struct CalcError : runtime_error {
    int column;
    CalcError(const string& m, int col) : runtime_error(m), column(col) {}
};

using Context = map<string, double>;
using Function = function<double(const vector<double>&)>;

// ---------- tokens ----------
enum class T { Number, Name, Op, LParen, RParen, Comma, End };
struct Token { T type; string text; double value = 0; int column = 0; };

vector<Token> tokenize(const string& s) {
    vector<Token> out;
    for (size_t i = 0; i < s.size();) {
        char c = s[i];
        if (isspace(static_cast<unsigned char>(c))) { ++i; continue; }
        int col = static_cast<int>(i) + 1;
        if (isdigit(static_cast<unsigned char>(c)) || c == '.') {
            size_t j = i; while (j < s.size() && (isdigit(static_cast<unsigned char>(s[j])) || s[j] == '.')) ++j;
            out.push_back({T::Number, s.substr(i, j - i), stod(s.substr(i, j - i)), col}); i = j;
        } else if (isalpha(static_cast<unsigned char>(c)) || c == '_') {
            size_t j = i; while (j < s.size() && (isalnum(static_cast<unsigned char>(s[j])) || s[j] == '_')) ++j;
            out.push_back({T::Name, s.substr(i, j - i), 0, col}); i = j;
        } else if (string("+-*/^").find(c) != string::npos) { out.push_back({T::Op, string(1, c), 0, col}); ++i; }
        else if (c == '(') { out.push_back({T::LParen, "(", 0, col}); ++i; }
        else if (c == ')') { out.push_back({T::RParen, ")", 0, col}); ++i; }
        else if (c == ',') { out.push_back({T::Comma, ",", 0, col}); ++i; }
        else throw CalcError(string("unexpected character '") + c + "'", col);
    }
    out.push_back({T::End, "", 0, static_cast<int>(s.size()) + 1});
    return out;
}

// ---------- the AST (Composite) ----------
struct Node {
    virtual ~Node() = default;
    virtual double eval(const Context& ctx) const = 0;
    virtual string str() const = 0;
};
using NodePtr = unique_ptr<Node>;

struct Number : Node {
    double v; explicit Number(double v) : v(v) {}
    double eval(const Context&) const override { return v; }
    string str() const override { ostringstream o; o << v; return o.str(); }
};
struct Variable : Node {
    string name; int col;
    Variable(string n, int c) : name(move(n)), col(c) {}
    double eval(const Context& ctx) const override { auto it = ctx.find(name); if (it == ctx.end()) throw CalcError("unknown variable '" + name + "'", col); return it->second; }
    string str() const override { return name; }
};
struct Unary : Node {
    NodePtr operand;
    explicit Unary(NodePtr o) : operand(move(o)) {}
    double eval(const Context& c) const override { return -operand->eval(c); }
    string str() const override { return "(-" + operand->str() + ")"; }
};
struct Binary : Node {
    char op; NodePtr l, r; int col;
    Binary(char o, NodePtr a, NodePtr b, int c) : op(o), l(move(a)), r(move(b)), col(c) {}
    double eval(const Context& ctx) const override {
        double a = l->eval(ctx), b = r->eval(ctx);
        switch (op) {
            case '+': return a + b;
            case '-': return a - b;
            case '*': return a * b;
            case '/': if (b == 0) throw CalcError("division by zero", col); return a / b;
            default:  return pow(a, b);
        }
    }
    string str() const override { return "(" + l->str() + " " + op + " " + r->str() + ")"; }
};
struct Call : Node {
    string name; vector<NodePtr> args; const map<string, Function>& registry; int col;
    Call(string n, vector<NodePtr> a, const map<string, Function>& reg, int c) : name(move(n)), args(move(a)), registry(reg), col(c) {}
    double eval(const Context& ctx) const override {
        auto it = registry.find(name);
        if (it == registry.end()) throw CalcError("unknown function '" + name + "'", col);
        vector<double> values; for (const auto& a : args) values.push_back(a->eval(ctx));
        return it->second(values);
    }
    string str() const override { string s = name + "("; for (size_t i = 0; i < args.size(); ++i) s += (i ? ", " : "") + args[i]->str(); return s + ")"; }
};

// ---------- recursive-descent parser: one function per grammar rule ----------
class Parser {
    vector<Token> tok_; size_t pos_ = 0; const map<string, Function>& registry_;
    const Token& peek() const { return tok_[pos_]; }
    Token take() { return tok_[pos_++]; }
    bool isOp(char c) const { return peek().type == T::Op && peek().text[0] == c; }
    NodePtr expression() {
        NodePtr left = term();
        while (isOp('+') || isOp('-')) { Token op = take(); left = make_unique<Binary>(op.text[0], move(left), term(), op.column); }
        return left;
    }
    NodePtr term() {
        NodePtr left = power();
        while (isOp('*') || isOp('/')) { Token op = take(); left = make_unique<Binary>(op.text[0], move(left), power(), op.column); }
        return left;
    }
    NodePtr power() {
        NodePtr base = unary();
        if (isOp('^')) { Token op = take(); return make_unique<Binary>('^', move(base), power(), op.column); }      // right-associative
        return base;
    }
    NodePtr unary() {
        if (isOp('-')) { take(); return make_unique<Unary>(unary()); }
        return primary();
    }
    NodePtr primary() {
        Token t = take();
        if (t.type == T::Number) return make_unique<Number>(t.value);
        if (t.type == T::Name) {
            if (peek().type != T::LParen) return make_unique<Variable>(t.text, t.column);
            take();                                          // '('
            vector<NodePtr> args;
            if (peek().type != T::RParen) { args.push_back(expression()); while (peek().type == T::Comma) { take(); args.push_back(expression()); } }
            if (peek().type != T::RParen) throw CalcError("expected ')' after the arguments", peek().column);
            take();
            return make_unique<Call>(t.text, move(args), registry_, t.column);
        }
        if (t.type == T::LParen) {
            NodePtr e = expression();
            if (peek().type != T::RParen) throw CalcError("missing ')'", peek().column);
            take();
            return e;
        }
        throw CalcError(t.type == T::End ? "unexpected end of expression" : "unexpected '" + t.text + "'", t.column);
    }
public:
    Parser(vector<Token> t, const map<string, Function>& r) : tok_(move(t)), registry_(r) {}
    NodePtr parse() {
        NodePtr e = expression();
        if (peek().type != T::End) throw CalcError("unexpected '" + peek().text + "'", peek().column);
        return e;
    }
};

class Calculator {
    map<string, Function> functions_;
public:
    Calculator() {
        functions_["max"] = [](const vector<double>& a) { return *max_element(a.begin(), a.end()); };
        functions_["min"] = [](const vector<double>& a) { return *min_element(a.begin(), a.end()); };
        functions_["abs"] = [](const vector<double>& a) { return fabs(a.at(0)); };
        functions_["sqrt"] = [](const vector<double>& a) { if (a.at(0) < 0) throw runtime_error("sqrt of a negative number"); return sqrt(a.at(0)); };
    }
    void addFunction(string name, Function f) { functions_[move(name)] = move(f); }       // extension point: one line

    NodePtr compile(const string& text) const { return Parser(tokenize(text), functions_).parse(); }   // parse once...

    string run(const string& text, const Context& vars = {}) const {                      // ...or one shot, with errors as text
        try {
            auto tree = compile(text);
            ostringstream o; o << tree->str() << " = " << tree->eval(vars); return o.str();
        } catch (const CalcError& e) {
            return "error at column " + to_string(e.column) + ": " + e.what();
        } catch (const exception& e) { return string("error: ") + e.what(); }
    }
};

int main() {
    Calculator calc;
    calc.addFunction("double", [](const vector<double>& a) { return 2 * a.at(0); });     // a new function without touching the parser
    for (const char* e : {"2 + 3 * (4 - 1)", "-2 ^ 2", "2 ^ 3 ^ 2", "10 / 4 - 1", "max(3, 9, 4) + double(5)"})
        cout << "  " << calc.run(e) << "\n";
    cout << "variables:\n";
    cout << "  " << calc.run("x * x + y", {{"x", 3}, {"y", 1}}) << "\n";
    cout << "errors:\n";
    for (const char* e : {"2 +", "(1 + 2", "1 / (3 - 3)", "foo + 1", "bar(1)", "3 $ 4", "sqrt(0 - 4)"}) cout << "  " << e << "   ->   " << calc.run(e) << "\n";

    cout << "parse once, evaluate many times:\n";
    auto f = calc.compile("a * x + b");
    for (double x : {0.0, 1.0, 2.0}) cout << "  f(" << x << ") = " << f->eval({{"a", 2}, {"b", 5}, {"x", x}}) << "\n";
}
```

## Edge cases

| Case | Handling |
|---|---|
| `-2 ^ 2` | unary binds tighter than `^` in this grammar, so it is `(-2) ^ 2 = 4` (many languages choose `-(2^2)`; state which you chose) |
| `2 ^ 3 ^ 2` | right-associative: `2 ^ 9 = 512` |
| Division by zero | a `CalcError` with the operator's column |
| Unknown names | variable at evaluation, function at evaluation (so one parse works for different contexts) |
| Empty argument list `max()` | a function may throw; registry functions validate arity |
| Deep nesting | recursion depth limited by the stack; add a depth limit if input is untrusted |

## Extensions and follow-ups

| Follow-up | Design response |
|---|---|
| "More operators (`%`, comparison, `&&`)" | add token kinds and a grammar level; new `Binary` ops |
| "Operator table instead of fixed functions" | precedence-climbing with a table of `{symbol, precedence, assoc}` |
| "Print/simplify/differentiate the tree" | a **Visitor** over `Node`; `simplify` folds constants |
| "Compile to bytecode for speed" | a `Compiler` visitor emitting a stack-machine program |
| "Assignments and a REPL" | a statement layer holding the variable map |
| "Units and types" | typed values (`Quantity`) instead of `double` |
| "Thread-safety" | trees are immutable after parsing; evaluation takes a const context, so it is safe to share |

```quiz
? Why does precedence appear in the grammar rather than in if-statements?
- It is faster
+ Each rule level (expression, term, power) binds tighter than the previous, so precedence is encoded by the call structure
- C++ requires it
> The recursive-descent functions mirror the grammar.
? Why register functions in a map?
- To avoid inheritance
+ A new function is added with one registration, without changing the parser or the nodes
- Because lambdas need maps
> That is the extension point (Open/Closed).
```

:::keypoints
- Tokenizer → recursive-descent parser → Composite AST → evaluator. Precedence and associativity come from the grammar functions.
- Errors carry columns; convert exceptions to results at the calculator boundary.
- Function registry for extension; parse once, evaluate many times; Visitor for further operations.
:::
