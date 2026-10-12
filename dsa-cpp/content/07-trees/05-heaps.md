---
title: Heaps & Priority Queues
level: intermediate
time: 60
summary: The binary heap — a complete tree stored in an array — with sift-up and sift-down, the O(n) build-heap proof, heap sort, and the four heap patterns interviews keep using (top-k with a size-k heap, k-way merge, two heaps for a running median, greedy scheduling), through six classic problems.
---

Whenever a problem says "repeatedly take the **smallest/largest**", or "the **top k**", or "process in order of **priority**", the answer is a heap. It's one of the most useful structures in interviews and in real systems (schedulers, Dijkstra, event simulation).

:::def Binary heap
A **complete** binary tree in which every parent is ≤ its children (**min-heap**) or ≥ them (**max-heap**). The root is always the minimum (or maximum). It's stored compactly in an array: the children of index $i$ are $2i+1$ and $2i+2$, and its parent is $\lfloor (i-1)/2 \rfloor$.
:::

:::warn A heap is not sorted
The heap property only orders parents relative to their children. Siblings and cousins can be in any order. That's what makes heaps cheap to maintain: $O(\log n)$ per operation instead of the $O(n)$ of keeping an array sorted.
:::

## The two operations

| Operation | How | Cost |
|---|---|---|
| `push(x)` | append at the end, then **sift up**: swap with the parent while smaller | $O(\log n)$ |
| `pop()` (remove the root) | move the last element to the root, then **sift down**: swap with the smaller child while larger | $O(\log n)$ |
| `top()` | read index 0 | $O(1)$ |
| build from $n$ items | sift down every internal node, from the last one to the root | $O(n)$ |

```viz algo=heap-ops
```

```cpp run level=intermediate title="A min-heap from scratch"
#include <bits/stdc++.h>
using namespace std;

class MinHeap {
public:
    void push(int x) {
        h.push_back(x);
        int i = h.size() - 1;
        while (i > 0 && h[(i - 1) / 2] > h[i]) { swap(h[i], h[(i - 1) / 2]); i = (i - 1) / 2; }   // sift up
    }
    int top() const { return h[0]; }
    void pop() {
        h[0] = h.back(); h.pop_back();
        siftDown(0);
    }
    bool empty() const { return h.empty(); }
    void build(vector<int> v) {                       // Floyd's heapify: O(n)
        h = move(v);
        for (int i = (int)h.size() / 2 - 1; i >= 0; i--) siftDown(i);
    }
private:
    vector<int> h;
    void siftDown(int i) {
        int n = h.size();
        while (true) {
            int l = 2 * i + 1, r = l + 1, m = i;
            if (l < n && h[l] < h[m]) m = l;
            if (r < n && h[r] < h[m]) m = r;
            if (m == i) return;
            swap(h[i], h[m]);
            i = m;
        }
    }
};

int main() {
    MinHeap pq;
    for (int x : {5, 3, 8, 1, 9, 2}) pq.push(x);
    while (!pq.empty()) { cout << pq.top() << ' '; pq.pop(); }
    cout << "| ";
    pq.build({9, 4, 7, 1, 8, 2, 6});
    while (!pq.empty()) { cout << pq.top() << ' '; pq.pop(); }
    cout << '\n';
}
```

## Why building a heap is O(n), not O(n log n)

Inserting $n$ items one at a time costs $O(n \log n)$. **Heapify** (sift down from the bottom up) is faster, because most nodes are near the bottom and sift down only a little.

:::derive Bottom-up heapify costs O(n)
\text{a node at height } h \text{ sifts down at most } h \text{ levels} || height = distance to the leaves
\text{there are at most } \lceil n / 2^{h+1} \rceil \text{ nodes of height } h || half the nodes are leaves, a quarter have height 1, …
\text{total} \le \sum_{h=0}^{\log n} \frac{n}{2^{h+1}} \cdot h = \frac n2 \sum_{h \ge 0} \frac{h}{2^h} ||
\sum_{h \ge 0} \frac{h}{2^h} = 2 || a standard series: differentiate Σxʰ = 1/(1−x) and set x = ½
! \text{total} \le \frac n2 \cdot 2 = n = O(n) ||
:::

So `priority_queue<int> pq(v.begin(), v.end())` (which heapifies) is $O(n)$, faster than pushing elements one by one.

## The four heap patterns

:::pattern
1. **Top-k with a heap of size k.** For the k largest, keep a **min**-heap of size k. Each new element replaces the smallest of the current top k if it's bigger. That's $O(n \log k)$ time and $O(k)$ memory, and it works on streams.
2. **K-way merge.** Put the head of each of k sorted lists in a min-heap. Pop the smallest, then push the next element from its list. $O(N \log k)$.
3. **Two heaps.** A max-heap for the lower half and a min-heap for the upper half. The median is at their tops: a running median.
4. **Greedy by priority.** Always process the most urgent, frequent or cheapest item next (scheduling, Dijkstra, Huffman, Prim).
:::

## Problems

:::problem Kth Largest Element in a Stream {level=easy lc=kth-largest-element-in-a-stream tags="heap,top-k,stream"}
Design a class that receives numbers one at a time and, after each `add(x)`, returns the current k-th largest element.

:::hint Hint
Keep a min-heap of the k largest elements so far. Its top is the k-th largest.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

class KthLargest {
public:
    KthLargest(int k, const vector<int>& nums) : k(k) { for (int x : nums) add(x); }
    int add(int x) {
        pq.push(x);
        if ((int)pq.size() > k) pq.pop();          // drop the smallest: it's not in the top k
        return pq.top();
    }
private:
    int k;
    priority_queue<int, vector<int>, greater<int>> pq;
};

int main() {
    KthLargest kl(3, {4, 5, 8, 2});
    for (int x : {3, 5, 10, 9, 4}) cout << kl.add(x) << ' ';
    cout << '\n';
}
```

:::complexity
Time | O(\log k) | per add
Space | O(k) |
:::
:::
:::

:::problem Merge k Sorted Lists {level=hard lc=merge-k-sorted-lists tags="heap,k-way merge,linked list"}
Merge `k` sorted linked lists into one sorted list.

:::hint Hint 1
Merging the lists one after another costs $O(kN)$. Pairwise merging (like merge sort) costs $O(N \log k)$.
:::

:::hint Hint 2
Or use a min-heap of the k current heads: pop the smallest, attach it, and push its `next`. The heap never holds more than k nodes.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;
struct ListNode { int val; ListNode* next; ListNode(int x, ListNode* n = nullptr) : val(x), next(n) {} };
ListNode* build(const vector<int>& v) { ListNode d(0); ListNode* t = &d; for (int x : v) t = t->next = new ListNode(x); return d.next; }

ListNode* mergeKLists(vector<ListNode*> lists) {
    auto cmp = [](ListNode* a, ListNode* b) { return a->val > b->val; };     // min-heap by value
    priority_queue<ListNode*, vector<ListNode*>, decltype(cmp)> pq(cmp);
    for (ListNode* l : lists) if (l) pq.push(l);
    ListNode dummy(0); ListNode* tail = &dummy;
    while (!pq.empty()) {
        ListNode* x = pq.top(); pq.pop();
        tail = tail->next = x;
        if (x->next) pq.push(x->next);
    }
    return dummy.next;
}

int main() {
    for (ListNode* c = mergeKLists({build({1, 4, 5}), build({1, 3, 4}), build({2, 6}), nullptr}); c; c = c->next) cout << c->val << ' ';
    cout << '\n';
}
```

:::complexity
Time | O(N \log k) | N total nodes
Space | O(k) |
:::
:::
:::

:::problem Find Median from Data Stream {level=hard lc=find-median-from-data-stream tags="two heaps,design,stream"}
Support `addNum(x)` and `findMedian()` on a growing stream of numbers.

Example: add 1, 2 → median 1.5; add 3 → median 2.

:::hint Hint
`lo` is a max-heap holding the smaller half and `hi` is a min-heap holding the larger half. Keep `lo.size() == hi.size()` or `lo.size() == hi.size() + 1`, and every element of `lo` ≤ every element of `hi`.
:::

:::solution
Add to `lo`, move `lo`'s max to `hi` (this keeps the halves ordered), then move one back if `hi` became larger. The median is `lo.top()`, or the average of both tops.

```cpp run
#include <bits/stdc++.h>
using namespace std;

class MedianFinder {
public:
    void addNum(int x) {
        lo.push(x);
        hi.push(lo.top()); lo.pop();                 // the biggest of the low half moves up
        if (hi.size() > lo.size()) { lo.push(hi.top()); hi.pop(); }   // rebalance sizes
    }
    double findMedian() const {
        return lo.size() > hi.size() ? lo.top() : (lo.top() + (double)hi.top()) / 2.0;
    }
private:
    priority_queue<int> lo;                                         // max-heap: the smaller half
    priority_queue<int, vector<int>, greater<int>> hi;              // min-heap: the larger half
};

int main() {
    MedianFinder mf;
    for (int x : {5, 15, 1, 3, 8}) { mf.addNum(x); cout << mf.findMedian() << ' '; }
    cout << '\n';
}
```

:::complexity
Time | O(\log n) | per add; O(1) per median
Space | O(n) |
:::

**Follow-up:** if all numbers are in `[0, 100]`, keep a count array and walk it: $O(1)$ add, $O(100)$ median. For a **sliding window** median, use two `multiset`s (they support deletion) or heaps with lazy deletion.
:::
:::

:::problem Task Scheduler {level=medium lc=task-scheduler tags="heap,greedy,math"}
Tasks are letters, and each takes one time unit. Two runs of the **same** task must be at least `n` units apart (idle slots are allowed). Return the minimum total time.

Example: `["A","A","A","B","B","B"], n=2` → `8` (`A B idle A B idle A B`).

:::hint Hint 1
Greedy simulation with a max-heap of remaining counts: in each window of `n+1` slots, run the most frequent tasks first.
:::

:::hint Hint 2
There's also a formula: frames of size `n+1` built around the most frequent task. `(maxCount − 1) × (n + 1) + (number of tasks with maxCount)`, but at least the total number of tasks.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

int leastIntervalHeap(const vector<char>& tasks, int n) {
    array<int, 26> cnt{};
    for (char t : tasks) cnt[t - 'A']++;
    priority_queue<int> pq;
    for (int c : cnt) if (c) pq.push(c);
    int time = 0;
    while (!pq.empty()) {
        vector<int> ranThisRound;
        for (int slot = 0; slot <= n && !pq.empty(); slot++) {     // one window of n+1 slots
            ranThisRound.push_back(pq.top() - 1);
            pq.pop();
        }
        for (int c : ranThisRound) if (c) pq.push(c);
        time += pq.empty() ? ranThisRound.size() : n + 1;        // the last window needs no idle tail
    }
    return time;
}

int leastIntervalFormula(const vector<char>& tasks, int n) {
    array<int, 26> cnt{};
    for (char t : tasks) cnt[t - 'A']++;
    int mx = *max_element(cnt.begin(), cnt.end());
    int numMax = count(cnt.begin(), cnt.end(), mx);
    return max((int)tasks.size(), (mx - 1) * (n + 1) + numMax);
}

int main() {
    vector<char> a = {'A', 'A', 'A', 'B', 'B', 'B'}, b = {'A', 'C', 'A', 'B', 'D', 'B'};
    cout << leastIntervalHeap(a, 2) << '/' << leastIntervalFormula(a, 2) << ' '
         << leastIntervalHeap(a, 0) << '/' << leastIntervalFormula(a, 0) << ' '
         << leastIntervalHeap(b, 1) << '/' << leastIntervalFormula(b, 1) << '\n';
}
```

:::complexity
Time | O(T) | the formula; the heap version is O(T log 26)
Space | O(1) |
:::

**Why the formula works:** the most frequent task needs `maxCount − 1` gaps of `n` slots after its runs, giving frames of size `n+1`. The tasks tied for the maximum fill the last frame. If there are so many different tasks that no idle slot is needed, the answer is just the number of tasks.
:::
:::

:::problem Reorganize String {level=medium lc=reorganize-string tags="heap,greedy"}
Rearrange the characters of `s` so that no two adjacent characters are equal, or return `""` if that's impossible.

Example: `"aab"` → `"aba"`; `"aaab"` → `""`.

:::hint Hint
It's impossible exactly when some letter appears more than `(n+1)/2` times. Otherwise, greedily place the most frequent remaining letter that differs from the last one placed, using a max-heap.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

string reorganizeString(const string& s) {
    array<int, 26> cnt{};
    for (char c : s) cnt[c - 'a']++;
    priority_queue<pair<int, char>> pq;
    for (int i = 0; i < 26; i++) if (cnt[i]) pq.push({cnt[i], char('a' + i)});
    if (pq.top().first > ((int)s.size() + 1) / 2) return "";
    string out;
    pair<int, char> held = {0, 0};                      // the letter we just used: it can't go next
    while (!pq.empty()) {
        auto [c, ch] = pq.top(); pq.pop();
        out += ch;
        if (held.first > 0) pq.push(held);              // the previous letter is allowed again
        held = {c - 1, ch};
    }
    return out;
}

int main() { cout << '"' << reorganizeString("aab") << "\" \"" << reorganizeString("aaab") << "\" \"" << reorganizeString("aaabbc") << "\"\n"; }
```

:::complexity
Time | O(n \log 26) = O(n) |
Space | O(1) |
:::
:::
:::

## Check yourself

```quiz
? In an array-stored heap, the children of index i are…
+ 2i+1 and 2i+2
- i+1 and i+2
- 2i and 2i−1
> And the parent is (i−1)/2.

? Building a heap bottom-up from n elements costs…
+ O(n)
- O(n log n)
- O(log n)
> Σ h·n/2^(h+1) = O(n): most nodes are near the leaves.

? For the k LARGEST elements of a stream, keep a…
+ min-heap of size k
- max-heap of size k
- sorted array of everything
> The top of the min-heap is the weakest member of the top k, so it's the one to evict.

? Running median: what invariant do the two heaps keep?
+ lo (max-heap) holds the smaller half, hi (min-heap) the larger, and their sizes differ by at most 1
- Both heaps are min-heaps
- lo holds the odd numbers
> The median is then at the tops.
```

:::keypoints
- Binary heap = a complete tree in an array: children `2i+1, 2i+2`. Push/pop $O(\log n)$, top $O(1)$, heapify $O(n)$.
- C++: `priority_queue<T>` is a max-heap; use `greater<T>` or a custom comparator for a min-heap.
- Patterns: top-k with a size-k heap ($O(n\log k)$), k-way merge ($O(N\log k)$), two heaps (median), greedy by priority.
- A heap is not sorted. Only parent–child order is guaranteed.
:::
