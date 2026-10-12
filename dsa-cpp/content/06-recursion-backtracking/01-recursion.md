---
title: Thinking Recursively
level: intermediate
time: 45
summary: How to design recursive functions with confidence — the "leap of faith" and its link to mathematical induction, base cases and progress, tracing the call stack, recursion trees, tail recursion, converting recursion to an explicit stack, and when recursion is the wrong tool. Problems include Swap Nodes in Pairs and K-th Symbol in Grammar.
---

Recursion is the backbone of trees, graphs, backtracking, divide and conquer and dynamic programming. Most people struggle with it because they try to trace every call in their head. The trick is to **trust the recursion**, the same way a proof by induction trusts the induction hypothesis.

## What recursion is

:::def Recursive function
A function that solves a problem by calling **itself on smaller instances** of the same problem. It has:
1. **Base case(s):** small inputs answered directly, with no recursive call.
2. **Recursive case:** reduce to smaller input(s), call yourself, combine the results.
3. **Progress:** every call must move toward a base case.
:::

## The leap of faith

To write `f(n)`, **assume `f` already works for every smaller input**. Then ask only: *how do I build the answer for `n` from answers for smaller inputs?*

:::analogy
You're in a long line and want to know your position. Ask the person in front of you for their position and add 1. You don't need to know how *they* found theirs. You trust that it works for them, and the person at the front knows they're number 1 (the base case).
:::

This is exactly **mathematical induction**:

| Induction | Recursion |
|---|---|
| base case: prove $P(0)$ | base case: return the answer for the smallest input |
| inductive step: assume $P(k)$, prove $P(k+1)$ | recursive case: assume `f(smaller)` is correct, build `f(n)` |
| conclusion: $P(n)$ for all $n$ | the function is correct for all inputs (if it always makes progress) |

```cpp run level=easy title="Three tiny recursive functions"
#include <bits/stdc++.h>
using namespace std;

long long factorial(int n) { return n <= 1 ? 1 : n * factorial(n - 1); }       // n! = n * (n-1)!
int sumDigits(int n) { return n < 10 ? n : n % 10 + sumDigits(n / 10); }        // last digit + the rest
bool isPal(const string& s, int l, int r) {                                      // the ends match and the inside is a palindrome
    return l >= r || (s[l] == s[r] && isPal(s, l + 1, r - 1));
}

int main() {
    cout << factorial(10) << ' ' << sumDigits(98765) << ' ' << boolalpha << isPal("racecar", 0, 6) << ' ' << isPal("abca", 0, 3) << '\n';
}
```

## The call stack

Every call gets a **stack frame** holding its parameters and local variables. Frames are stacked: the newest call runs, and when it returns, its frame is popped and the caller continues where it left off.

```cpp run level=easy title="Watching the stack grow and shrink"
#include <bits/stdc++.h>
using namespace std;

int depth = 0;
int sumTo(int n) {
    cout << string(depth * 2, ' ') << "-> sumTo(" << n << ")\n";
    depth++;
    int r = (n == 0) ? 0 : n + sumTo(n - 1);
    depth--;
    cout << string(depth * 2, ' ') << "<- sumTo(" << n << ") = " << r << '\n';
    return r;
}

int main() { sumTo(4); }
```

The recursion goes 5 frames deep, so it uses $O(n)$ stack space. Each frame costs some memory (typically 32–200 bytes), and the default stack is 1–8 MB. Recursion depth around $10^5$–$10^6$ can crash. That's the main practical limit of recursion in C++.

## Recursion trees

When a function calls itself more than once, draw the calls as a tree. The **number of nodes** gives the time (times the work per call), and the **height** gives the stack space.

```viz algo=fib-recursion
```

| Pattern | Calls | Time | Space (stack) |
|---|---|---|---|
| one call on `n−1` | linear chain | $O(n)$ | $O(n)$ |
| one call on `n/2` | short chain | $O(\log n)$ | $O(\log n)$ |
| two calls on `n/2` + $O(n)$ work | balanced tree | $O(n\log n)$ | $O(\log n)$ |
| two calls on `n−1` | full binary tree | $O(2^n)$ | $O(n)$ |
| branching factor `b`, depth `d` | | $O(b^d)$ | $O(d)$ |

:::warn Exponential recursion
Two recursive calls on `n−1` (or `n−1` and `n−2`) is exponential **unless subproblems repeat and you memoize them**. Spotting repeated subproblems in a recursion tree is the doorway to dynamic programming.
:::

## Tail recursion and iteration

:::def Tail call
A recursive call that is the **very last thing** a function does (`return f(n - 1, acc)`, with nothing left to do after it). Compilers *may* optimise it into a loop, but C++ doesn't guarantee this. Don't rely on it for deep recursion.
:::

Any recursion can be converted into a loop with an **explicit stack** that holds what the call stack would have held. You need this when the depth could reach $10^5$ or more (a skewed tree, a long linked list, a large grid DFS):

```cpp run level=intermediate title="Recursive vs explicit-stack DFS on a deep 'tree'"
#include <bits/stdc++.h>
using namespace std;

int main() {
    int n = 1'000'000;                       // a path 0-1-2-...-n: a recursive DFS would be 10^6 frames deep
    vector<vector<int>> adj(n);
    for (int i = 0; i + 1 < n; i++) adj[i].push_back(i + 1);

    vector<char> seen(n, 0);
    vector<int> st = {0};                    // explicit stack: no depth limit except heap memory
    int visited = 0;
    while (!st.empty()) {
        int u = st.back(); st.pop_back();
        if (seen[u]) continue;
        seen[u] = 1; visited++;
        for (int v : adj[u]) if (!seen[v]) st.push_back(v);
    }
    cout << "visited " << visited << " nodes without recursion\n";
}
```

## Problems

:::problem Swap Nodes in Pairs {level=medium lc=swap-nodes-in-pairs tags="recursion,linked list"}
Swap every two adjacent nodes of a linked list (by re-linking, not by swapping values).

Example: `1→2→3→4` → `2→1→4→3`; `1→2→3` → `2→1→3`.

:::hint Hint
Leap of faith: `swapPairs(head->next->next)` correctly handles the rest of the list. Now you only need to swap the first two nodes and attach the result.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;
struct ListNode { int val; ListNode* next; ListNode(int x, ListNode* n = nullptr) : val(x), next(n) {} };
ListNode* build(const vector<int>& v) { ListNode d(0); ListNode* t = &d; for (int x : v) t = t->next = new ListNode(x); return d.next; }
void print(ListNode* h) { for (; h; h = h->next) cout << h->val << (h->next ? "->" : ""); cout << '\n'; }

ListNode* swapPairs(ListNode* head) {
    if (!head || !head->next) return head;          // base case: 0 or 1 node
    ListNode* second = head->next;
    head->next = swapPairs(second->next);           // trust the recursion for the rest
    second->next = head;
    return second;
}

int main() { print(swapPairs(build({1, 2, 3, 4}))); print(swapPairs(build({1, 2, 3}))); }
```

:::complexity
Time | O(n) |
Space | O(n) | recursion depth n/2; the iterative version with a dummy node uses O(1)
:::
:::
:::

:::problem K-th Symbol in Grammar {level=medium lc=k-th-symbol-in-grammar tags="recursion,math"}
Row 1 is `0`. Each next row replaces every `0` with `01` and every `1` with `10`. Return the `k`-th symbol (1-indexed) of row `n`. ($n \le 30$, so the row has up to $2^{29}$ symbols. Don't build it!)

Example: `n=2, k=2` → `1` (row 2 is `01`); `n=4, k=5` → `1` (row 4 is `01101001`).

:::hint Hint
Symbol `k` of row `n` comes from symbol `ceil(k/2)` of row `n−1`. The **first** child copies its parent and the **second** child flips it.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

int kthGrammar(int n, int k) {
    if (n == 1) return 0;
    int parent = kthGrammar(n - 1, (k + 1) / 2);
    return (k % 2 == 1) ? parent : 1 - parent;     // the left child copies, the right child flips
}

int main() {
    for (int k = 1; k <= 8; k++) cout << kthGrammar(4, k);
    cout << "  (row 4)   n=30,k=434991989 -> " << kthGrammar(30, 434991989) << '\n';
}
```

:::complexity
Time | O(n) |
Space | O(n) | recursion depth
:::

There's also a one-liner: the answer is the parity of the number of 1 bits in `k − 1` (`__builtin_popcount(k - 1) & 1`), because every 1 bit in the path from the root means one flip.
:::
:::

:::problem Tower of Hanoi {level=easy id=tower-of-hanoi tags="recursion,classic"}
Move `n` disks from peg A to peg C using peg B, moving one disk at a time and never placing a larger disk on a smaller one. Print the moves. (A classic, not on LeetCode.)

:::hint Hint
Leap of faith: assume you can move `n − 1` disks between any two pegs. Then move `n − 1` disks from A to B, move the biggest disk from A to C, and move the `n − 1` disks from B to C.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

int moves = 0;
void hanoi(int n, char from, char via, char to) {
    if (n == 0) return;
    hanoi(n - 1, from, to, via);                         // clear the way
    cout << "disk " << n << ": " << from << " -> " << to << '\n';
    moves++;
    hanoi(n - 1, via, from, to);                         // put them back on top
}

int main() { hanoi(3, 'A', 'B', 'C'); cout << moves << " moves = 2^3 - 1\n"; }
```

:::complexity
Time | O(2^n) | T(n) = 2T(n−1) + 1 gives 2ⁿ − 1 moves, which is also proven optimal
Space | O(n) | recursion depth
:::
:::
:::

## Check yourself

```quiz
? The "leap of faith" in recursion corresponds to which part of an induction proof?
+ The inductive hypothesis: assume it's true for smaller cases
- The base case
- The conclusion
> Trust f(smaller), then build f(n).

? A function that calls itself twice on n−1 with O(1) work otherwise runs in…
- O(n)
- O(n log n)
+ O(2ⁿ)
> The recursion tree is a full binary tree of height n.

? Recursive DFS on a path graph of 10⁶ nodes in C++ is risky because…
+ It may overflow the call stack (10⁶ frames)
- It's O(n²)
- Recursion is slower than loops by 10⁶ times
> Use an explicit stack for very deep traversals.
```

:::keypoints
- Recursion = base case + recursive case + progress. Design it with the **leap of faith** (it's induction).
- Each call uses a stack frame, so space = $O(\text{max depth})$. Very deep recursion overflows the stack in C++.
- Recursion trees: nodes = time, height = space. Repeated subproblems call for memoization (DP).
- Tail calls aren't guaranteed to be optimised. Use an explicit stack when the depth can be about $10^5$ or more.
:::
