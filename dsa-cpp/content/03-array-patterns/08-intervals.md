---
title: Intervals & Sweep Line
level: intermediate
time: 50
summary: The interval toolkit — the exact overlap condition, sort-by-start for merging, sort-by-end for greedy selection (with the exchange-argument proof), sweep lines with +1/−1 events to find maximum overlap, and a min-heap of end times. Seven classic problems from Merge Intervals to Meeting Rooms II.
---

Calendars, bookings, CPU jobs, video segments: interval problems are everywhere in interviews. Almost all of them start by **sorting**, and the only real question is **by what**.

## When do two intervals overlap?

For closed intervals $[a_1, b_1]$ and $[a_2, b_2]$:

$$\text{overlap} \iff a_1 \le b_2 \;\text{ and }\; a_2 \le b_1$$

:::proof The overlap condition
They **don't** overlap exactly when one ends before the other starts: $b_1 < a_2$ or $b_2 < a_1$. Negating with De Morgan's law gives $a_2 \le b_1$ and $a_1 \le b_2$. The overlapping part, when it exists, is $[\max(a_1, a_2),\ \min(b_1, b_2)]$.
:::

:::warn Closed vs half-open
Does `[1,3]` overlap `[3,5]`? For **closed** intervals (sharing the point 3) yes. For meetings `[start, end)` no: one ends as the other starts. Read the problem carefully and use `<` versus `<=` to match.
:::

## Which sort?

| Goal | Sort by | Why |
|---|---|---|
| Merge overlapping intervals | **start** | overlapping intervals become neighbours |
| Choose the most non-overlapping intervals / fewest removals | **end** | finishing earliest leaves the most room (greedy) |
| Maximum number overlapping at once | events (sweep line) | count +1 at starts, −1 at ends |
| Assign to the fewest rooms | start + a min-heap of end times | reuse the room that frees up earliest |

## Sweep line

Turn each interval into two **events**, `(start, +1)` and `(end, −1)`. Sort the events by time and add up the deltas. The running total is the number of intervals active at that moment, and its maximum is the peak overlap.

:::tip Tie-breaking
For half-open intervals `[s, e)`, process `-1` **before** `+1` at the same time, so a meeting ending at 10 frees its room for one starting at 10. Sorting `pair<int,int>` events does this automatically, because −1 < +1.
:::

## Problems

:::problem Merge Intervals {level=medium lc=merge-intervals tags="intervals,sorting"}
Merge all overlapping intervals.

Example: `[[1,3],[2,6],[8,10],[15,18]]` → `[[1,6],[8,10],[15,18]]`.

:::hint Hint
Sort by start. Then each interval either overlaps the **last merged** interval (extend its end) or starts a new one.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

vector<vector<int>> merge(vector<vector<int>> iv) {
    sort(iv.begin(), iv.end());                           // by start (then end)
    vector<vector<int>> out;
    for (auto& cur : iv) {
        if (!out.empty() && cur[0] <= out.back()[1])      // overlaps the last merged one
            out.back()[1] = max(out.back()[1], cur[1]);   // max matters: [1,10] then [2,3]
        else out.push_back(cur);
    }
    return out;
}

int main() {
    for (auto& v : merge({{1, 3}, {2, 6}, {8, 10}, {15, 18}})) cout << '[' << v[0] << ',' << v[1] << "] ";
    cout << '\n';
    for (auto& v : merge({{1, 10}, {2, 3}, {4, 5}})) cout << '[' << v[0] << ',' << v[1] << "] ";
    cout << '\n';
}
```

:::proof Why comparing with only the last merged interval is enough
After sorting by start, the merged list is a sequence of disjoint intervals whose starts increase. A new interval starts at or after all previous starts. It can't overlap an earlier merged interval without also overlapping the last one, because the last one ends after every earlier one does.
:::

:::complexity
Time | O(n \log n) | sorting dominates
Space | O(n) | the output (plus the sort)
:::
:::
:::

:::problem Insert Interval {level=medium lc=insert-interval tags="intervals"}
Insert a new interval into a sorted list of non-overlapping intervals, merging where needed.

Example: `[[1,2],[3,5],[6,7],[8,10],[12,16]] + [4,8]` → `[[1,2],[3,10],[12,16]]`.

:::hint Hint
Three phases, no sorting needed: copy the intervals that end before the new one starts; merge everything that overlaps it; copy the rest.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

vector<vector<int>> insert(const vector<vector<int>>& iv, vector<int> nw) {
    vector<vector<int>> out;
    int i = 0, n = iv.size();
    while (i < n && iv[i][1] < nw[0]) out.push_back(iv[i++]);          // entirely before
    while (i < n && iv[i][0] <= nw[1]) {                               // overlapping: absorb
        nw[0] = min(nw[0], iv[i][0]);
        nw[1] = max(nw[1], iv[i][1]);
        i++;
    }
    out.push_back(nw);
    while (i < n) out.push_back(iv[i++]);                              // entirely after
    return out;
}

int main() {
    for (auto& v : insert({{1, 2}, {3, 5}, {6, 7}, {8, 10}, {12, 16}}, {4, 8})) cout << '[' << v[0] << ',' << v[1] << "] ";
    cout << '\n';
}
```

:::complexity
Time | O(n) |
Space | O(n) | the output
:::
:::
:::

:::problem Non-overlapping Intervals {level=medium lc=non-overlapping-intervals tags="intervals,greedy"}
Return the minimum number of intervals to remove so that the rest don't overlap. (Touching at an endpoint is fine: `[1,2]` and `[2,3]` don't overlap.)

Example: `[[1,2],[2,3],[3,4],[1,3]]` → `1`.

:::hint Hint 1
Minimizing removals is the same as **maximizing the intervals you keep**.
:::

:::hint Hint 2
Sort by **end**. Greedily keep each interval that starts at or after the end of the last kept one.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

int eraseOverlapIntervals(vector<vector<int>> iv) {
    sort(iv.begin(), iv.end(), [](auto& a, auto& b) { return a[1] < b[1]; });   // by end
    int kept = 0;
    long long lastEnd = LLONG_MIN;
    for (auto& x : iv)
        if (x[0] >= lastEnd) { kept++; lastEnd = x[1]; }
    return iv.size() - kept;
}

int main() {
    cout << eraseOverlapIntervals({{1, 2}, {2, 3}, {3, 4}, {1, 3}}) << ' '
         << eraseOverlapIntervals({{1, 2}, {1, 2}, {1, 2}}) << ' '
         << eraseOverlapIntervals({{1, 2}, {2, 3}}) << '\n';
}
```

:::proof Greedy by earliest end is optimal (exchange argument)
Let $g$ be the interval with the earliest end, and take any optimal solution $O$. Let $o$ be the interval in $O$ with the earliest end. Since $g$ ends no later than $o$, replacing $o$ with $g$ in $O$ creates no new conflicts: everything else in $O$ starts after $o$ ends, so also after $g$ ends. So there is an optimal solution that contains $g$. Remove $g$ and everything overlapping it, and apply the same argument to the rest (induction). The greedy choice is never worse than optimal.
:::

:::complexity
Time | O(n \log n) |
Space | O(1) | besides sorting
:::

This is the classic **activity selection** problem. You'll meet exchange arguments again in the Greedy lesson.
:::
:::

:::problem Minimum Number of Arrows to Burst Balloons {level=medium lc=minimum-number-of-arrows-to-burst-balloons tags="intervals,greedy"}
Each balloon spans `[xstart, xend]` on a line. A vertical arrow shot at `x` bursts every balloon with `xstart ≤ x ≤ xend`. Return the minimum number of arrows needed to burst all balloons.

Example: `[[10,16],[2,8],[1,6],[7,12]]` → `2`.

:::hint Hint
Sort by end. Shoot at the end of the first balloon. That arrow bursts every balloon that starts at or before that point. Repeat with the first balloon it missed.
:::

:::solution
Same greedy as above, but here the endpoints are **closed** (touching balloons share the arrow), so the comparison is `>` rather than `>=`.

```cpp run
#include <bits/stdc++.h>
using namespace std;

int findMinArrowShots(vector<vector<int>> p) {
    sort(p.begin(), p.end(), [](auto& a, auto& b) { return a[1] < b[1]; });
    int arrows = 0;
    long long arrowX = LLONG_MIN;
    for (auto& b : p)
        if (b[0] > arrowX) { arrows++; arrowX = b[1]; }   // not hit by the last arrow: shoot a new one
    return arrows;
}

int main() { cout << findMinArrowShots({{10, 16}, {2, 8}, {1, 6}, {7, 12}}) << ' ' << findMinArrowShots({{1, 2}, {2, 3}, {3, 4}, {4, 5}}) << '\n'; }
```

:::complexity
Time | O(n \log n) |
Space | O(1) |
:::

Using `long long` for `arrowX` (and `a[1] < b[1]` rather than `a[1] - b[1] < 0`) avoids overflow on inputs near $\pm 2^{31}$. That's a real LeetCode trap.
:::
:::

:::problem Meeting Rooms {level=easy lc=meeting-rooms tags="intervals,sorting"}
Given meeting times `[start, end)`, can one person attend all of them?

Example: `[[0,30],[5,10],[15,20]]` → `false`.

:::hint Hint
Sort by start, then check each meeting against the previous one.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

bool canAttendMeetings(vector<vector<int>> iv) {
    sort(iv.begin(), iv.end());
    for (int i = 1; i < (int)iv.size(); i++)
        if (iv[i][0] < iv[i - 1][1]) return false;    // starts before the previous one ends
    return true;
}

int main() { cout << boolalpha << canAttendMeetings({{0, 30}, {5, 10}, {15, 20}}) << ' ' << canAttendMeetings({{7, 10}, {2, 4}}) << '\n'; }
```

:::complexity
Time | O(n \log n) |
Space | O(1) |
:::
:::
:::

:::problem Meeting Rooms II {level=medium lc=meeting-rooms-ii tags="intervals,heap,sweep line"}
Return the minimum number of conference rooms needed to hold all the meetings `[start, end)`.

Example: `[[0,30],[5,10],[15,20]]` → `2`.

:::hint Hint 1
The answer is the **maximum number of meetings in progress at the same moment**. A sweep line computes it directly.
:::

:::hint Hint 2
Alternative: sort by start, and keep a min-heap of the end times of rooms in use. If the earliest-ending room is free by the time this meeting starts, reuse it.
:::

:::solution
Both approaches, $O(n \log n)$ each.

```cpp run
#include <bits/stdc++.h>
using namespace std;

int minMeetingRoomsSweep(const vector<vector<int>>& iv) {
    vector<pair<int, int>> ev;
    for (auto& m : iv) { ev.push_back({m[0], +1}); ev.push_back({m[1], -1}); }
    sort(ev.begin(), ev.end());                  // at equal times -1 comes first: rooms free up
    int cur = 0, best = 0;
    for (auto [t, d] : ev) best = max(best, cur += d);
    return best;
}

int minMeetingRoomsHeap(vector<vector<int>> iv) {
    sort(iv.begin(), iv.end());
    priority_queue<int, vector<int>, greater<int>> ends;     // end times of busy rooms
    for (auto& m : iv) {
        if (!ends.empty() && ends.top() <= m[0]) ends.pop();  // reuse the room that frees earliest
        ends.push(m[1]);
    }
    return ends.size();
}

int main() {
    vector<vector<int>> a = {{0, 30}, {5, 10}, {15, 20}}, b = {{7, 10}, {2, 4}}, c = {{1, 5}, {5, 10}, {2, 7}, {3, 6}};
    for (auto& v : {a, b, c}) cout << minMeetingRoomsSweep(v) << '/' << minMeetingRoomsHeap(v) << ' ';
    cout << '\n';
}
```

:::proof Why the peak overlap is the answer
**At least**: at the moment when $k$ meetings overlap, they need $k$ different rooms. **At most**: the heap method never opens a new room unless every open room is busy at that start time, which means that many meetings are in progress together. So the number of rooms it uses equals the peak overlap.
:::

:::complexity
Time | O(n \log n) |
Space | O(n) |
:::
:::
:::

:::problem Interval List Intersections {level=medium lc=interval-list-intersections tags="intervals,two pointers"}
Two lists of **disjoint, sorted** closed intervals. Return their intersection.

Example: `A=[[0,2],[5,10],[13,23],[24,25]]`, `B=[[1,5],[8,12],[15,24],[25,26]]` → `[[1,2],[5,5],[8,10],[15,23],[24,24],[25,25]]`.

:::hint Hint
Two pointers. The overlap of `A[i]` and `B[j]` is `[max(starts), min(ends)]` when that's non-empty. Then advance whichever interval **ends first**: it can't overlap anything else.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

vector<vector<int>> intervalIntersection(const vector<vector<int>>& A, const vector<vector<int>>& B) {
    vector<vector<int>> out;
    int i = 0, j = 0;
    while (i < (int)A.size() && j < (int)B.size()) {
        int lo = max(A[i][0], B[j][0]), hi = min(A[i][1], B[j][1]);
        if (lo <= hi) out.push_back({lo, hi});
        if (A[i][1] < B[j][1]) i++; else j++;          // drop the one that ends first
    }
    return out;
}

int main() {
    for (auto& v : intervalIntersection({{0, 2}, {5, 10}, {13, 23}, {24, 25}}, {{1, 5}, {8, 12}, {15, 24}, {25, 26}}))
        cout << '[' << v[0] << ',' << v[1] << "] ";
    cout << '\n';
}
```

:::complexity
Time | O(n + m) |
Space | O(1) | besides the output
:::
:::
:::

## Check yourself

```quiz
? To merge overlapping intervals, sort by…
+ start
- end
- length
> Then overlapping intervals are neighbours.

? To keep the MOST non-overlapping intervals, greedily pick by…
- earliest start
+ earliest end
- shortest length
> Finishing earliest leaves the most room. The exchange argument proves it.

? A sweep line over +1/−1 events computes…
+ The number of intervals active at each moment (its max is the peak overlap)
- The total length covered
- The intervals sorted by length
> The running sum of deltas is the count in progress.
```

:::keypoints
- Overlap ⇔ $a_1 \le b_2$ and $a_2 \le b_1$; the intersection is $[\max \text{starts}, \min \text{ends}]$. Closed vs half-open changes `<` vs `<=`.
- Merge: sort by start, compare with the last merged. Select or remove: sort by **end**, greedy (exchange argument).
- Peak overlap / rooms: sweep line (+1/−1) or a min-heap of end times.
- Two sorted interval lists: two pointers, advance the one that ends first.
:::
