---
title: Queues, Deques & the Monotonic Deque
level: advanced
time: 50
summary: FIFO queues and where they're used, building a queue from two stacks (with the amortized O(1) proof), a circular buffer from scratch, deques, and the monotonic deque that gives sliding-window maximums in O(n) — plus Shortest Subarray with Sum at Least K, which combines prefix sums with a monotonic deque.
---

Queues process things **in arrival order**: requests, BFS frontiers, tasks. Deques add the other end. A *monotonic* deque turns "maximum of every window" from $O(nk)$ into $O(n)$.

:::def Queue
A **FIFO** (first in, first out) collection: `push` at the back, `pop` from the front, both $O(1)$. `std::queue<T>` (built on `deque` by default).
:::

:::def Deque
A double-ended queue: $O(1)$ push and pop at **both** ends, plus $O(1)$ random access. `std::deque<T>`.
:::

## Queue from two stacks

A classic design question, and a lovely amortized argument.

```cpp run level=intermediate title="Queue using two stacks"
#include <bits/stdc++.h>
using namespace std;

class MyQueue {
public:
    void push(int x) { in.push_back(x); }
    int pop() { int x = peek(); out.pop_back(); return x; }
    int peek() {
        if (out.empty())                                  // refill only when out is empty
            while (!in.empty()) { out.push_back(in.back()); in.pop_back(); }
        return out.back();
    }
    bool empty() const { return in.empty() && out.empty(); }
private:
    vector<int> in, out;                                  // in: newest on top; out: oldest on top
};

int main() {
    MyQueue q;
    q.push(1); q.push(2);
    cout << q.peek() << ' ' << q.pop() << ' ';
    q.push(3);
    cout << q.pop() << ' ' << q.pop() << ' ' << boolalpha << q.empty() << '\n';
}
```

:::proof Each operation is amortized O(1)
Follow one element: it's pushed onto `in` once, moved from `in` to `out` **at most once** (we only refill when `out` is empty, so an element never moves back), and popped from `out` once. That's at most 4 stack operations per element over its lifetime. So any sequence of $m$ queue operations costs $O(m)$ in total. A single `pop` can cost $O(n)$, but only right after $n$ cheap pushes paid for it.
:::

## Circular buffer (ring buffer)

A fixed-capacity queue in an array: `head` points to the front, and the back is at `(head + size) % capacity`. The indexes wrap around, so no element ever shifts. Used in networking buffers, audio, logging and rate limiters.

## The monotonic deque: sliding window maximum

To know the maximum of every window of size `k`, keep a deque of **indexes whose values are decreasing**. The front is always the current window's maximum. Indexes leave from the front when they slide out of the window, and from the back when a newer, bigger value makes them useless.

```viz algo=sliding-window-max
```

:::proof Why dropping smaller older elements is safe
If `j < i` and `a[j] <= a[i]`, then `a[j]` can **never** be the maximum of any future window. Every window that contains `j` and is still to come also contains `i`, which is newer, so it stays longer, and is at least as big. Removing `j` loses nothing. The deque stays decreasing, so its front is the maximum.
:::

## Problems

:::problem Sliding Window Maximum {level=hard lc=sliding-window-maximum tags="monotonic deque,sliding window"}
Return the maximum of each contiguous window of size `k`.

Example: `[1,3,-1,-3,5,3,6,7], k=3` → `[3,3,5,5,6,7]`.

:::hint Hint 1
A max-heap with lazy deletion gives $O(n \log n)$. A `multiset` window also works in $O(n \log k)$.
:::

:::hint Hint 2
For $O(n)$, use a decreasing deque of indexes. Pop the front if it's outside the window, and pop the back while it's ≤ the new value.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

vector<int> maxSlidingWindow(const vector<int>& a, int k) {
    deque<int> dq;                                   // indexes, values decreasing front -> back
    vector<int> out;
    for (int i = 0; i < (int)a.size(); i++) {
        if (!dq.empty() && dq.front() <= i - k) dq.pop_front();           // slid out of the window
        while (!dq.empty() && a[dq.back()] <= a[i]) dq.pop_back();        // can never be the max again
        dq.push_back(i);
        if (i >= k - 1) out.push_back(a[dq.front()]);
    }
    return out;
}

int main() { for (int x : maxSlidingWindow({1, 3, -1, -3, 5, 3, 6, 7}, 3)) cout << x << ' '; cout << '\n'; }
```

:::complexity
Time | O(n) | each index enters and leaves the deque at most once
Space | O(k) |
:::
:::
:::

:::problem Design Circular Queue {level=medium lc=design-circular-queue tags="queue,design,ring buffer"}
Implement a fixed-size FIFO queue on an array: `enQueue`, `deQueue`, `Front`, `Rear`, `isEmpty`, `isFull`, all in $O(1)$.

:::hint Hint
Store `head` and `count`. The back slot is `(head + count) % cap`, and the rear element is at `(head + count − 1) % cap`. Keeping `count` separately removes the "full or empty?" ambiguity when head == tail.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

class MyCircularQueue {
public:
    explicit MyCircularQueue(int k) : buf(k), head(0), count(0) {}
    bool enQueue(int x) { if (isFull()) return false; buf[(head + count) % buf.size()] = x; count++; return true; }
    bool deQueue() { if (isEmpty()) return false; head = (head + 1) % buf.size(); count--; return true; }
    int Front() const { return isEmpty() ? -1 : buf[head]; }
    int Rear() const { return isEmpty() ? -1 : buf[(head + count - 1) % buf.size()]; }
    bool isEmpty() const { return count == 0; }
    bool isFull() const { return count == (int)buf.size(); }
private:
    vector<int> buf;
    int head, count;
};

int main() {
    MyCircularQueue q(3);
    cout << boolalpha << q.enQueue(1) << q.enQueue(2) << q.enQueue(3) << q.enQueue(4) << ' ';
    cout << q.Rear() << ' ' << q.isFull() << ' ' << q.deQueue() << ' ' << q.enQueue(4) << ' ' << q.Rear() << ' ' << q.Front() << '\n';
}
```

:::complexity
Time | O(1) | every operation
Space | O(k) |
:::
:::
:::

:::problem Number of Recent Calls {level=easy lc=number-of-recent-calls tags="queue,sliding window"}
`ping(t)` records a request at time `t` (times strictly increase) and returns how many requests happened in `[t − 3000, t]`.

:::hint Hint
Keep the timestamps in a queue. Before answering, pop from the front everything older than `t − 3000`.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

class RecentCounter {
public:
    int ping(int t) {
        q.push(t);
        while (q.front() < t - 3000) q.pop();
        return q.size();
    }
private:
    queue<int> q;
};

int main() {
    RecentCounter rc;
    for (int t : {1, 100, 3001, 3002}) cout << rc.ping(t) << ' ';
    cout << '\n';
}
```

:::complexity
Time | O(1) | amortized per ping
Space | O(W) | W = requests in the window
:::

This is the core of a **sliding-window rate limiter**: "allow at most N requests per minute" pops old timestamps exactly like this.
:::
:::

:::problem Shortest Subarray with Sum at Least K {level=hard lc=shortest-subarray-with-sum-at-least-k tags="monotonic deque,prefix sum"}
Return the length of the shortest non-empty subarray with sum ≥ `k`, or −1. Values **can be negative**, so a plain sliding window fails.

Example: `[2,-1,2], k=3` → `3`.

:::hint Hint 1
With prefix sums `P`, you want the smallest `j − i` with `P[j] − P[i] ≥ k` and `i < j`.
:::

:::hint Hint 2
Keep a deque of candidate starts `i` with **increasing** `P[i]`. For each `j`: while `P[j] − P[front] ≥ k`, record the length and pop the front (a later `j` can only give a longer answer for it). Then pop the back while `P[back] ≥ P[j]` (`j` is a better start: later and smaller).
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

int shortestSubarray(const vector<int>& a, int k) {
    int n = a.size(), best = INT_MAX;
    vector<long long> P(n + 1, 0);
    for (int i = 0; i < n; i++) P[i + 1] = P[i] + a[i];
    deque<int> dq;                                            // candidate starts, P increasing
    for (int j = 0; j <= n; j++) {
        while (!dq.empty() && P[j] - P[dq.front()] >= k) { best = min(best, j - dq.front()); dq.pop_front(); }
        while (!dq.empty() && P[dq.back()] >= P[j]) dq.pop_back();
        dq.push_back(j);
    }
    return best == INT_MAX ? -1 : best;
}

int main() { cout << shortestSubarray({1}, 1) << ' ' << shortestSubarray({1, 2}, 4) << ' ' << shortestSubarray({2, -1, 2}, 3) << ' ' << shortestSubarray({84, -37, 32, 40, 95}, 167) << '\n'; }
```

:::complexity
Time | O(n) |
Space | O(n) |
:::

This is the "prefix sums when sliding window fails" idea from the Sliding Window lesson, made fast with the monotonic-deque trick.
:::
:::

## Check yourself

```quiz
? In the two-stack queue, how many times can one element move from `in` to `out`?
+ At most once
- Once per pop
- Up to n times
> That's why the amortized cost is O(1).

? Why may the monotonic deque drop an older element that's ≤ the new one?
+ Every future window containing the old element also contains the newer, bigger-or-equal one
- Because the deque is full
- To keep it sorted by index
> The old element can never be a window maximum again.

? A circular queue stores head and count. Where does the next element go?
+ (head + count) % capacity
- head + 1
- count % head
> Indexes wrap around the array.
```

:::keypoints
- Queue = FIFO (BFS, scheduling, rate limiting). Deque = both ends in $O(1)$.
- Queue from two stacks: refill `out` only when it's empty. Amortized $O(1)$, since each element moves at most once.
- Ring buffer: `head` + `count`, indexes modulo the capacity.
- Monotonic deque: window max/min in $O(n)$. Pop the front when it's stale, pop the back when it's dominated.
- With negative numbers, combine prefix sums with a monotonic deque (shortest subarray with sum ≥ k).
:::
