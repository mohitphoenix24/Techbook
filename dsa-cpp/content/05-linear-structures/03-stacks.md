---
title: Stacks
level: intermediate
time: 50
summary: The LIFO stack and the problems it fits — matching brackets, undo, expression evaluation (postfix and infix with precedence), nested decoding — plus the "stack of pairs" trick for O(1) getMin. Six classic problems including Min Stack, Decode String, Asteroid Collision and Basic Calculator II.
---

A stack fits whenever the **most recent unfinished thing** has to be handled first: the innermost bracket, the latest undo, the operator waiting for its right operand. If a problem has **nesting** or "cancel the previous one", reach for a stack.

:::def Stack
A **LIFO** (last in, first out) collection with three $O(1)$ operations: `push(x)` adds on top, `top()` reads the top, `pop()` removes it. In C++ use `std::stack<T>`, or a `vector<T>` with `push_back`/`back`/`pop_back` (also lets you look inside).
:::

:::pattern
Signals for a stack:
- **Matching/nesting:** brackets, tags, nested structures like `3[a2[c]]`.
- **"Cancel the previous one":** backspaces, collisions, removing adjacent duplicates.
- **Evaluate expressions:** postfix directly; infix with an operator stack.
- **Undo / history / back button.**
- **Iterative DFS:** replacing recursion's call stack.
- **"Next greater / smaller element":** a *monotonic* stack (next lesson).
:::

## Problems

:::problem Valid Parentheses {level=easy lc=valid-parentheses tags="stack,matching"}
A string has only `()[]{}`. Return whether every bracket closes in the correct order.

Example: `"([]{})"` → `true`; `"(]"` → `false`; `"(("` → `false`.

:::hint Hint
Push opening brackets. On a closing bracket, the top of the stack must be its matching opener. At the end, the stack must be empty.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

bool isValid(const string& s) {
    vector<char> st;
    for (char c : s) {
        if (c == '(' || c == '[' || c == '{') st.push_back(c);
        else {
            char want = c == ')' ? '(' : c == ']' ? '[' : '{';
            if (st.empty() || st.back() != want) return false;
            st.pop_back();
        }
    }
    return st.empty();
}

int main() {
    for (string s : {"([]{})", "(]", "((", "]", "{[()()]}"}) cout << s << " -> " << boolalpha << isValid(s) << '\n';
}
```

:::complexity
Time | O(n) |
Space | O(n) |
:::

With only **one** bracket type, a counter is enough: +1 for `(`, −1 for `)`, never negative, zero at the end. That's a nice simplification to mention.
:::
:::

:::problem Min Stack {level=medium lc=min-stack tags="stack,design"}
Design a stack that supports `push`, `pop`, `top` and `getMin` in $O(1)$ each.

:::hint Hint
Whenever you push, also record **the minimum of the stack at that moment**. Popping then restores the previous minimum for free.
:::

:::solution
Store pairs `(value, min so far)`. The minimum of the stack is always in the top pair.

```cpp run
#include <bits/stdc++.h>
using namespace std;

class MinStack {
public:
    void push(int x) { st.push_back({x, st.empty() ? x : min(x, st.back().second)}); }
    void pop() { st.pop_back(); }
    int top() const { return st.back().first; }
    int getMin() const { return st.back().second; }
private:
    vector<pair<int, int>> st;     // (value, minimum of this element and everything below it)
};

int main() {
    MinStack s;
    s.push(-2); s.push(0); s.push(-3);
    cout << s.getMin() << ' ';     // -3
    s.pop();
    cout << s.top() << ' ' << s.getMin() << '\n';   // 0 -2
}
```

:::complexity
Time | O(1) | every operation
Space | O(n) |
:::
:::
:::

:::problem Evaluate Reverse Polish Notation {level=medium lc=evaluate-reverse-polish-notation tags="stack,expression evaluation"}
Evaluate an expression in postfix notation, e.g. `["2","1","+","3","*"]` = `(2 + 1) * 3` = `9`. Division truncates toward zero.

:::hint Hint
Numbers are pushed. An operator pops two operands. The **second** one popped is the left operand. Then it pushes the result.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

int evalRPN(const vector<string>& tokens) {
    vector<long long> st;
    for (const string& t : tokens) {
        if (t.size() == 1 && string("+-*/").find(t[0]) != string::npos) {
            long long b = st.back(); st.pop_back();
            long long a = st.back(); st.pop_back();       // a is the LEFT operand
            st.push_back(t[0] == '+' ? a + b : t[0] == '-' ? a - b : t[0] == '*' ? a * b : a / b);
        } else st.push_back(stoll(t));                    // handles "-11" too
    }
    return st.back();
}

int main() {
    cout << evalRPN({"2", "1", "+", "3", "*"}) << ' ' << evalRPN({"4", "13", "5", "/", "+"}) << ' '
         << evalRPN({"10", "6", "9", "3", "+", "-11", "*", "/", "*", "17", "+", "5", "+"}) << '\n';
}
```

:::complexity
Time | O(n) |
Space | O(n) |
:::
:::
:::

:::problem Decode String {level=medium lc=decode-string tags="stack,nesting"}
Decode strings like `3[a2[c]]` → `accaccacc`. `k[...]` repeats the bracketed part `k` times, and brackets can be nested.

:::hint Hint
On `[`, push the **current string and current number** and start fresh. On `]`, pop them and set `cur = prevString + k × cur`.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

string decodeString(const string& s) {
    vector<pair<string, int>> st;        // (string before '[', repeat count)
    string cur;
    int num = 0;
    for (char c : s) {
        if (isdigit(c)) num = num * 10 + (c - '0');
        else if (c == '[') { st.push_back({cur, num}); cur.clear(); num = 0; }
        else if (c == ']') {
            auto [prev, k] = st.back(); st.pop_back();
            string rep;
            for (int i = 0; i < k; i++) rep += cur;
            cur = prev + rep;
        } else cur += c;
    }
    return cur;
}

int main() { cout << decodeString("3[a]2[bc]") << ' ' << decodeString("3[a2[c]]") << ' ' << decodeString("2[abc]3[cd]ef") << '\n'; }
```

:::complexity
Time | O(\text{output length}) | plus the input
Space | O(\text{output length}) |
:::
:::
:::

:::problem Asteroid Collision {level=medium lc=asteroid-collision tags="stack,simulation"}
Asteroids move along a line. Positive values move right, negative values move left, and the absolute value is the size. When two collide, the smaller one explodes (both explode if they're equal). Return the state after all collisions.

Example: `[5,10,-5]` → `[5,10]`; `[10,2,-5]` → `[10]`; `[8,-8]` → `[]`.

:::hint Hint
A collision happens only when a **left-moving** asteroid meets a **right-moving** one before it, i.e. at the top of the stack. Resolve those collisions in a loop.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

vector<int> asteroidCollision(const vector<int>& a) {
    vector<int> st;
    for (int x : a) {
        bool alive = true;
        while (alive && x < 0 && !st.empty() && st.back() > 0) {   // head-on collision
            if (st.back() < -x) st.pop_back();                     // the top explodes; keep checking
            else {
                if (st.back() == -x) st.pop_back();                // both explode
                alive = false;                                     // x explodes
            }
        }
        if (alive) st.push_back(x);
    }
    return st;
}

int main() {
    for (auto v : vector<vector<int>>{{5, 10, -5}, {8, -8}, {10, 2, -5}, {-2, -1, 1, 2}}) {
        cout << '[';
        for (int x : asteroidCollision(v)) cout << x << ' ';
        cout << "] ";
    }
    cout << '\n';
}
```

:::complexity
Time | O(n) | each asteroid is pushed and popped at most once
Space | O(n) |
:::
:::
:::

:::problem Basic Calculator II {level=medium lc=basic-calculator-ii tags="stack,expression evaluation,precedence"}
Evaluate a string with non-negative integers, `+ - * /` and spaces (no parentheses). `*` and `/` bind tighter than `+` and `-`. Division truncates toward zero.

Example: `"3+2*2"` → `7`; `" 3/2 "` → `1`; `" 3+5 / 2 "` → `5`.

:::hint Hint
Remember the **previous operator**. When a number ends: for `+`, push it; for `-`, push its negative; for `*` and `/`, combine it with the top of the stack right away. The answer is the sum of the stack.
:::

:::solution
High-precedence operations are applied immediately, and low-precedence ones are delayed by pushing signed terms.

```cpp run
#include <bits/stdc++.h>
using namespace std;

int calculate(const string& s) {
    vector<long long> st;
    long long num = 0;
    char op = '+';
    for (int i = 0; i < (int)s.size(); i++) {
        char c = s[i];
        if (isdigit(c)) num = num * 10 + (c - '0');
        if ((!isdigit(c) && c != ' ') || i == (int)s.size() - 1) {   // an operator or the end: apply the previous op
            if (op == '+') st.push_back(num);
            else if (op == '-') st.push_back(-num);
            else if (op == '*') st.back() *= num;
            else st.back() /= num;
            op = c;
            num = 0;
        }
    }
    return accumulate(st.begin(), st.end(), 0LL);
}

int main() { cout << calculate("3+2*2") << ' ' << calculate(" 3/2 ") << ' ' << calculate(" 3+5 / 2 ") << ' ' << calculate("14-3*2") << '\n'; }
```

:::complexity
Time | O(n) |
Space | O(n) | (O(1) is possible by keeping only the running sum and the last term)
:::

With parentheses (Basic Calculator I/III), push the current result and sign on `(` and pop them on `)`. It's the same idea as Decode String. The general method is Dijkstra's **shunting-yard** algorithm with an operator stack.
:::
:::

## Check yourself

```quiz
? Which situation most strongly suggests a stack?
+ Matching nested brackets
- Finding the shortest path in a grid
- Counting frequencies
> Nesting means handling the most recent unfinished item first.

? How does Min Stack get the minimum in O(1)?
+ Each element stores the minimum of itself and everything below it
- It sorts the stack on each push
- It scans the stack
> Popping automatically restores the previous minimum.

? In postfix evaluation, after popping b then a for an operator, the result is…
+ a op b
- b op a
- It doesn't matter
> For − and /, order matters: the first value popped is the RIGHT operand.
```

:::keypoints
- Stack = LIFO with $O(1)$ push/pop/top. Use it for nesting, cancellation, expression evaluation and iterative DFS.
- Store extra info alongside each element (min so far, saved string and count) to answer queries in $O(1)$.
- Each element is pushed and popped at most once, so loops like asteroid collision are $O(n)$ amortized.
- Precedence: apply `* /` right away, delay `+ -` by pushing signed terms.
:::
