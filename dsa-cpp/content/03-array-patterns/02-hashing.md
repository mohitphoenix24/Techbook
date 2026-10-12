---
title: Hashing — Hash Maps & Sets
level: easy
time: 55
summary: How hash tables really work (hash functions, buckets, chaining vs open addressing, load factor), why lookups are O(1) on average — with the derivation — and when they degrade to O(n), plus the five hashing patterns (seen-set, complement lookup, frequency count, canonical-key grouping, index map) across six classic problems.
---

If you only learn one trick for interviews, learn this one: **trade memory for time with a hash map**. It turns countless $O(n^2)$ "compare everything with everything" solutions into $O(n)$.

## How a hash table works

:::def Hash function
A function that turns a key (a number, string, pair…) into an integer, its **hash code**. Equal keys must give equal hashes. Good hash functions spread different keys evenly.
:::

:::def Hash table
An array of $m$ **buckets**. A key is stored in bucket `hash(key) % m`. To look a key up, compute the same bucket and search only there, not the whole table.
:::

:::def Collision
Two different keys landing in the same bucket. They're unavoidable: there are more possible keys than buckets (pigeonhole!). Every hash table needs a way to handle them.
:::

Two ways to handle collisions:

| Strategy | How | Used by |
|---|---|---|
| **Separate chaining** | each bucket holds a small list of the keys that landed there | `std::unordered_map` |
| **Open addressing** | if a bucket is taken, probe the next one (linear probing: `+1, +2, …`) | Python's `dict`, Abseil, most fast hash maps |

:::def Load factor
$\alpha = \frac{n}{m}$: the average number of keys per bucket. When it gets too high (`unordered_map` default: above 1.0), the table **rehashes**: it allocates more buckets (roughly doubling) and re-inserts every key. Like vector growth, this is $O(1)$ amortized.
:::

### Why lookups are O(1) on average

:::derive Expected cost of a lookup with chaining
P(\text{a given key lands in bucket } b) = \frac1m || simple uniform hashing assumption
E[\text{length of the chain at } b] = \frac{n}{m} = \alpha || linearity: n keys, each with probability 1/m
E[\text{lookup cost}] = \underbrace{O(1)}_{\text{hash}} + O(\alpha) || hash, then scan one chain
\alpha \le c \text{ (rehash keeps the load factor bounded)} ||
! E[\text{lookup}] = O(1) ||
:::

:::warn Worst case is O(n)
If **all** keys collide into one bucket, every operation scans a list of length $n$, so the total becomes $O(n^2)$. With random data that practically never happens. But hackers on Codeforces deliberately craft inputs that collide with `std::hash<int>` (which is just the identity function!), and some judges include such tests.
:::

The standard defence is a **randomized** hash that an attacker can't predict:

```cpp run level=advanced title="An anti-hack hash for unordered_map"
#include <bits/stdc++.h>
using namespace std;

struct SplitMix64 {
    // a fast, well-mixing hash with a random seed fixed at program start
    static uint64_t mix(uint64_t x) {
        x += 0x9e3779b97f4a7c15ULL;
        x = (x ^ (x >> 30)) * 0xbf58476d1ce4e5b9ULL;
        x = (x ^ (x >> 27)) * 0x94d049bb133111ebULL;
        return x ^ (x >> 31);
    }
    size_t operator()(uint64_t x) const {
        static const uint64_t SEED = chrono::steady_clock::now().time_since_epoch().count();
        return mix(x + SEED);
    }
};

int main() {
    unordered_map<long long, int, SplitMix64> freq;
    freq.reserve(1 << 10);                     // pre-size: avoids rehashing
    for (long long x : {5LL, 7LL, 5LL, 1'000'000'000'000LL}) freq[x]++;
    cout << "freq[5] = " << freq[5] << ", buckets = " << freq.bucket_count()
         << ", load factor = " << freq.load_factor() << '\n';
}
```

:::tip Speed tips for unordered_map
`reserve(n)` up front avoids rehashing. If keys are small integers (up to about $10^6$), a plain `vector<int>` indexed by key is **much** faster than any hash map. If keys are lowercase letters, use `int cnt[26]`.
:::

## The five hashing patterns

:::pattern
1. **Seen-set:** "have I seen this before?" → `unordered_set`. *(Contains Duplicate)*
2. **Complement lookup:** for each `x`, look up `target - x` among the elements **before** it. *(Two Sum)*
3. **Frequency count:** `map[x]++`, then compare or scan the counts. *(Valid Anagram, Top K Frequent)*
4. **Canonical key:** group items by a normalized form (sorted letters, a count signature). *(Group Anagrams)*
5. **Value → index / prefix → count:** remember **where** or **how often** you saw something. *(Subarray Sum Equals K, in the next lesson)*
:::

## Problems

:::problem Two Sum {level=easy lc=two-sum tags="hash map,complement lookup"}
Return the indices of the two numbers that add up to `target`. Exactly one solution exists, and you can't use the same element twice.

Example: `[2,7,11,15], target 9` → `[0,1]`.

:::hint Hint 1
Brute force checks all pairs: $O(n^2)$. For each `x`, which value are you looking for?
:::

:::hint Hint 2
You're looking for `target - x`. Store the values seen so far (value → index) in a hash map and look up the complement in O(1).
:::

:::solution
Scan once. Before inserting `nums[i]`, check whether its complement has already been seen. Checking **before** inserting is what stops an element from pairing with itself.

```cpp run
#include <bits/stdc++.h>
using namespace std;

vector<int> twoSum(const vector<int>& nums, int target) {
    unordered_map<int, int> idx;                    // value -> index
    for (int i = 0; i < (int)nums.size(); i++) {
        auto it = idx.find(target - nums[i]);
        if (it != idx.end()) return {it->second, i};
        idx[nums[i]] = i;
    }
    return {};
}

int main() {
    for (auto [v, t] : vector<pair<vector<int>, int>>{{{2, 7, 11, 15}, 9}, {{3, 2, 4}, 6}, {{3, 3}, 6}}) {
        auto r = twoSum(v, t);
        cout << '[' << r[0] << ',' << r[1] << "] ";
    }
    cout << '\n';
}
```

:::complexity
Time | O(n) | average; one pass, O(1) per lookup
Space | O(n) | the map
:::

**Follow-up:** if the array were sorted, two pointers would give $O(n)$ time with $O(1)$ space (next-but-one lesson).
:::
:::

:::problem Contains Duplicate {level=easy lc=contains-duplicate tags="hash set"}
Return `true` if any value appears at least twice.

:::hint Hint
Seen-set pattern. Alternatively, sort first and compare neighbours.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

bool containsDuplicate(const vector<int>& nums) {
    unordered_set<int> seen;
    seen.reserve(nums.size());
    for (int x : nums)
        if (!seen.insert(x).second) return true;    // insert returns {it, false} if x was already there
    return false;
}

int main() {
    cout << boolalpha << containsDuplicate({1, 2, 3, 1}) << ' ' << containsDuplicate({1, 2, 3, 4}) << '\n';
}
```

:::complexity
Time | O(n) | average. Sorting instead: O(n log n) time, O(1) extra space
Space | O(n) |
:::
:::
:::

:::problem Valid Anagram {level=easy lc=valid-anagram tags="hash map,counting"}
Return whether `t` is an anagram of `s` (the same letters with the same counts). The strings contain lowercase English letters.

Example: `"anagram", "nagaram"` → `true`.

:::hint Hint
Count the letters of `s` (+1) and `t` (−1). Are all counts zero at the end? With only 26 possible keys, an array is better than a hash map.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

bool isAnagram(const string& s, const string& t) {
    if (s.size() != t.size()) return false;
    int cnt[26] = {0};
    for (int i = 0; i < (int)s.size(); i++) { cnt[s[i] - 'a']++; cnt[t[i] - 'a']--; }
    for (int c : cnt) if (c) return false;
    return true;
}

int main() {
    cout << boolalpha << isAnagram("anagram", "nagaram") << ' ' << isAnagram("rat", "car") << '\n';
}
```

:::complexity
Time | O(n) |
Space | O(1) | 26 counters. With Unicode, use unordered_map<char32_t, int>
:::
:::
:::

:::problem Group Anagrams {level=medium lc=group-anagrams tags="hash map,canonical key"}
Group the strings that are anagrams of each other.

Example: `["eat","tea","tan","ate","nat","bat"]` → `[["eat","tea","ate"],["tan","nat"],["bat"]]` (any order).

:::hint Hint 1
Two words are anagrams if and only if they have the same **canonical form**. What's a good canonical form?
:::

:::hint Hint 2
Sorted letters work: `"eat"` → `"aet"`. Use it as a hash-map key that maps to the list of words in that group.
:::

:::solution
Key = the sorted word. That costs $O(k \log k)$ per word. A **count signature** (26 counts, e.g. `"1#0#0#…"`) costs $O(k)$ per word.

```cpp run
#include <bits/stdc++.h>
using namespace std;

vector<vector<string>> groupAnagrams(const vector<string>& strs) {
    unordered_map<string, vector<string>> groups;
    for (const string& s : strs) {
        string key = s;
        sort(key.begin(), key.end());               // canonical form
        groups[key].push_back(s);
    }
    vector<vector<string>> out;
    for (auto& [key, g] : groups) out.push_back(move(g));
    sort(out.begin(), out.end());                   // only to make the output stable for display
    return out;
}

int main() {
    for (auto& g : groupAnagrams({"eat", "tea", "tan", "ate", "nat", "bat"})) {
        for (auto& w : g) cout << w << ' ';
        cout << "| ";
    }
    cout << '\n';
}
```

:::complexity
Time | O(n \cdot k \log k) | n words of length up to k; O(nk) with count keys
Space | O(nk) |
:::
:::
:::

:::problem Top K Frequent Elements {level=medium lc=top-k-frequent-elements tags="hash map,bucket sort,heap"}
Return the `k` most frequent elements. Your algorithm must be better than $O(n \log n)$.

Example: `[1,1,1,2,2,3], k = 2` → `[1,2]`.

:::hint Hint 1
Count with a hash map. Sorting the (value, count) pairs is $O(n \log n)$. A size-`k` min-heap is $O(n \log k)$.
:::

:::hint Hint 2
A frequency is an integer between 1 and n. Put each value in **bucket[frequency]**, then walk the buckets from high to low.
:::

:::solution
**Bucket sort by frequency**, $O(n)$. (A heap of size k gives $O(n \log k)$; see the Heaps lesson.)

```cpp run
#include <bits/stdc++.h>
using namespace std;

vector<int> topKFrequent(const vector<int>& nums, int k) {
    unordered_map<int, int> freq;
    for (int x : nums) freq[x]++;
    vector<vector<int>> bucket(nums.size() + 1);     // bucket[f] = values seen exactly f times
    for (auto& [v, f] : freq) bucket[f].push_back(v);
    vector<int> out;
    for (int f = nums.size(); f >= 1 && (int)out.size() < k; f--)
        for (int v : bucket[f]) if ((int)out.size() < k) out.push_back(v);
    return out;
}

int main() {
    for (int x : topKFrequent({1, 1, 1, 2, 2, 3}, 2)) cout << x << ' ';
    cout << '\n';
}
```

:::complexity
Time | O(n) | count, distribute, sweep
Space | O(n) |
:::
:::
:::

:::problem Longest Consecutive Sequence {level=medium lc=longest-consecutive-sequence tags="hash set"}
Return the length of the longest run of **consecutive integers** in an unsorted array, in $O(n)$ time.

Example: `[100,4,200,1,3,2]` → `4` (1, 2, 3, 4).

:::hint Hint 1
Sorting gives $O(n \log n)$. For $O(n)$, put everything in a hash set.
:::

:::hint Hint 2
Only start counting from a number `x` that **begins** a run, meaning `x - 1` is not in the set. Then walk `x+1, x+2, …`.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

int longestConsecutive(const vector<int>& nums) {
    unordered_set<int> s(nums.begin(), nums.end());
    int best = 0;
    for (int x : s) {
        if (s.count(x - 1)) continue;              // not the start of a run
        int len = 1;
        while (s.count(x + len)) len++;
        best = max(best, len);
    }
    return best;
}

int main() {
    cout << longestConsecutive({100, 4, 200, 1, 3, 2}) << ' ' << longestConsecutive({0, 3, 7, 2, 5, 8, 4, 6, 0, 1}) << '\n';
}
```

:::proof Why this is O(n) despite the inner while loop
The inner `while` runs only from the **start** of each run, and walks exactly that run's length. Runs don't overlap, so the total number of inner steps over the whole loop is at most the number of distinct elements, $n$. Together with the outer loop, that's $O(n)$ set operations in total.
:::

:::complexity
Time | O(n) | average
Space | O(n) |
:::
:::
:::

## Check yourself

```quiz
? What does the load factor α = n/m control?
+ The expected length of each chain, and so the expected lookup cost
- The size of each key
- The number of hash functions
> Expected cost O(1 + α); rehashing keeps α bounded.

? Why can unordered_map be attacked on competitive programming judges?
+ std::hash<int> is predictable (often the identity), so inputs can be crafted to collide
- It uses too much memory
- It's not allowed
> A randomized hash like splitmix64 with a time-based seed fixes it.

? In Two Sum, why check the map BEFORE inserting nums[i]?
+ So an element can't pair with itself
- It's faster
- To keep the map sorted
> E.g. target 6 and nums[i] = 3 must not match itself.

? Which is the best canonical key for grouping anagrams?
+ The sorted word (or its letter-count signature)
- The word's length
- The first letter
> Two words are anagrams exactly when these keys are equal.
```

:::keypoints
- Hash table = array of buckets + hash function + collision handling. Expected $O(1)$ per operation when the load factor is bounded (rehashing is amortized $O(1)$).
- Worst case is $O(n)$ per operation. Use a randomized hash (splitmix64) against adversarial inputs; `reserve` to avoid rehashing.
- Patterns: seen-set, complement lookup, frequency count, canonical key, value→index.
- Prefer `int cnt[26]` or a `vector` when the keys are small integers.
:::
