---
title: Design an Expression Calculator
level: easy
time: 50
summary: A calculator that reads text like 2 + 3 * (4 - 1), builds a tree, and evaluates it. Learn the tokenizer, the recursive-descent parser, operator precedence, variables and functions, and clear error messages with positions.
---

:::problem Design an Expression Calculator {level=easy tags="parsing,Composite,Interpreter,Visitor,error handling"}
Design a calculator that evaluates expressions like `2 + 3 * (4 - 1)`, `-x ^ 2` and `max(a, 10) / 4`. Support the operators `+ - * / ^`, brackets, unary minus, named variables and a few built-in functions. Give clear errors (unknown variable, divide by zero, a syntax error with its position). Make it easy to add new operators and functions.

:::hint Hint
Split the work in three: a **tokenizer** (text to tokens), a **parser** (tokens to a tree, respecting precedence), and an **evaluator** (tree to a number). The tree is a Composite. Keep functions in a registry, so adding one is a single line.
:::
:::

## Step 1: Ask questions (requirements)

| Question | Our assumption |
|---|---|
| Operators? | `+ - * / ^` with the usual precedence. `^` groups from the right. Unary `-` too |
| Numbers? | decimals (`3.14`), as doubles |
| Variables? | names with letters and underscore, looked up in a context |
| Functions? | `max`, `min`, `sqrt`, `abs`. Can be extended. Any number of arguments |
| Errors? | unknown variable or function, divide by zero, syntax errors shown with a column |
| Extras? | print the tree back as text. Evaluate again and again with different variable values |
| Not needed | complex numbers, units, statements |

## Step 2: The grammar and precedence

First, a quick word. A **grammar** is a list of rules that say how an expression may look. Here it is:

```text
expression := term (("+" | "-") term)*
term       := power (("*" | "/") power)*
power      := unary ("^" power)?                 right-associative
unary      := "-" unary | primary
primary    := number | name | name "(" args ")" | "(" expression ")"
```

The rules lower down bind **tighter**: `^` before `*` before `+`. A **recursive-descent parser** has one small function for each rule. That makes precedence and grouping easy to see in the code.

## Step 3: Find the classes

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

## Step 4: Design decisions

- **Composite tree.** Leaves (`Number`, `Variable`) and nodes with children (`Unary`, `Binary`, `Call`) all share `Node::eval`. A new operator is a new node type. A new job on trees (simplify, compile) can be a Visitor.
- **Errors carry a position.** A `CalcError` is thrown inside the parser and evaluator, and turned into a `Result` at one place: the `Calculator`.
- **A function registry** maps names to `function<double(const vector<double>&)>`. A new function is one line of registration. The parser does not change.
- **Parsing is separate from evaluating.** So we can parse once and evaluate many times with different variables (a `Compiled` object).

## Step 5: The code

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

| Case | What happens |
|---|---|
| `-2 ^ 2` | in this grammar, unary minus binds tighter than `^`, so it is `(-2) ^ 2 = 4`. (Many languages choose `-(2^2)`. Say which one you chose) |
| `2 ^ 3 ^ 2` | groups from the right: `2 ^ 9 = 512` |
| Divide by zero | a `CalcError` with the column of the operator |
| Unknown names | variables and functions are checked when evaluating, so one parse works for different contexts |
| Empty argument list `max()` | the function can throw. Registry functions check the number of arguments |
| Very deep nesting | the stack limits recursion. Add a depth limit if the input is not trusted |

## What if the interviewer asks for more?

| Follow-up | Our answer |
|---|---|
| "More operators (`%`, comparisons, `&&`)" | add token kinds and a grammar level, and new `Binary` operations |
| "A table of operators instead of fixed code" | precedence climbing with a table of `{symbol, precedence, grouping}` |
| "Print, simplify or differentiate the tree" | a **Visitor** over `Node`. `simplify` can fold constants |
| "Compile to bytecode for speed" | a `Compiler` visitor that makes a stack-machine program |
| "Assignments and a REPL" | a statement layer that holds the variable map |
| "Units and types" | typed values (`Quantity`) instead of `double` |
| "Threads" | trees never change after parsing, and evaluation takes a read-only context, so sharing is safe |

## Short answer to say in an interview

:::interview How do you design an expression calculator?
"I split it into a tokenizer, a recursive-descent parser and an evaluator. The parser has one function for each grammar rule, so precedence and grouping come from the order of the rules. It builds a tree of nodes, which is a Composite, and each node knows how to evaluate itself. Functions live in a registry, so adding one needs no parser change. Errors carry a column, and I turn exceptions into a result at one place."
:::

```quiz
? Why is precedence in the grammar and not in if-statements?
- It is faster
+ Each rule level binds tighter than the one before, so precedence comes from how the functions call each other
- C++ requires it
> The parser functions copy the grammar.
? Why keep functions in a map?
- To avoid inheritance
+ A new function needs only one registration, with no change to the parser or the nodes
- Because lambdas need maps
> That is the extension point (open for adding, closed for editing).
```

:::keypoints
- Tokenizer, then recursive-descent parser, then a Composite tree, then the evaluator. Precedence and grouping come from the grammar functions.
- Errors carry columns. Turn exceptions into results at the calculator's edge.
- A function registry for extension. Parse once, evaluate many times. Use a Visitor for more jobs.
:::
