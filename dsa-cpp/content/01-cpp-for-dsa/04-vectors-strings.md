---
title: vector & string In Depth
level: easy
time: 40
summary: The two containers you'll use in nearly every solution — how vector grows, the cost of every operation, 2D grids, erase/insert pitfalls, and string handling (char math, substrings, building strings efficiently, stringstream splitting).
---

`vector` and `string` are the workhorses of interview C++. Know the cost of every operation on them and you'll catch slow solutions before you write them.

## vector: a dynamic array

:::def Dynamic array (`vector`)
A contiguous block of memory that **grows automatically**. It stores `size` elements in a buffer that has room for `capacity` elements. When it's full, it allocates a bigger buffer (usually twice the size), copies everything over, and frees the old one.
:::

:::syntax
```cpp
vector<int> a;                 // empty
vector<int> b(5);              // 5 zeros
vector<int> c(5, -1);          // 5 copies of -1
vector<int> d = {3, 1, 4};     // from a list
vector<vector<int>> g(n, vector<int>(m, 0));   // n x m grid of zeros

a.push_back(x);  a.pop_back();  a.back();  a.front();
a.size();  a.empty();  a.clear();  a.resize(k);  a.reserve(k);
a.insert(a.begin() + i, x);   a.erase(a.begin() + i);
```
:::

### What every operation costs

| Operation | Cost | Why |
|---|---|---|
| `v[i]`, `v.at(i)` | $O(1)$ | address = start + i × size |
| `push_back`, `pop_back` | $O(1)$ **amortized** | occasional regrowth is spread over many pushes |
| `insert` / `erase` at position `i` | $O(n - i)$ | everything after `i` shifts |
| `insert` / `erase` at the front | $O(n)$ | shifts everything, so avoid it in loops |
| search for a value (`find`) | $O(n)$ | unsorted: must look at each element |
| `sort` | $O(n \log n)$ | |
| copy (`auto b = a;`) | $O(n)$ | |

:::def Amortized O(1)
An operation is amortized O(1) if **any sequence of n operations costs O(n) in total**, even though a single one can be slow now and then. For `push_back`, the regrowth copies add up to fewer than $2n$ element copies in total. This is proved in the *Amortized Analysis* lesson.
:::

Watch the capacity double as you push:

```cpp run level=easy title="How a vector grows"
#include <bits/stdc++.h>
using namespace std;

int main() {
    vector<int> v;
    size_t lastCap = v.capacity();
    int copies = 0;
    for (int i = 1; i <= 100; i++) {
        if (v.size() == v.capacity()) copies += v.size();   // a regrow copies every element
        v.push_back(i);
        if (v.capacity() != lastCap) {
            cout << "size " << setw(3) << v.size() << " -> capacity " << v.capacity() << '\n';
            lastCap = v.capacity();
        }
    }
    cout << "100 pushes caused " << copies << " element copies in total (< 2 * 100)\n";
}
```

:::tip reserve()
If you know the final size, call `v.reserve(n)` first. No regrowth then happens at all. It's a free speedup for big inputs.
:::

### at() vs []

`v[i]` doesn't check the index. Out of range is undefined behaviour: maybe garbage, maybe a crash later. `v.at(i)` checks and throws an exception. When debugging, `at` turns a mysterious bug into a clear error message.

```cpp run level=easy title="at() catches the bug" runtime-error
#include <bits/stdc++.h>
using namespace std;

int main() {
    vector<int> v = {1, 2, 3};
    for (int i = 0; i <= 3; i++)            // off-by-one: should be i < 3
        cout << v.at(i) << ' ';
}
```

### Erasing while looping

Erasing shifts later elements left, which invalidates indexes and iterators after that point. The idiom to remove all elements matching a condition is **erase–remove**, and it runs in O(n):

```cpp run level=intermediate title="Remove all even numbers in O(n)"
#include <bits/stdc++.h>
using namespace std;

int main() {
    vector<int> v = {1, 2, 3, 4, 5, 6, 7, 8};

    // remove_if moves the kept elements to the front and returns the new logical end
    auto newEnd = remove_if(v.begin(), v.end(), [](int x) { return x % 2 == 0; });
    v.erase(newEnd, v.end());                // chop off the leftovers
    for (int x : v) cout << x << ' ';
    cout << '\n';

    // C++20 shortcut that does both steps:
    vector<int> w = {1, 2, 3, 4, 5, 6};
    erase_if(w, [](int x) { return x > 3; });
    for (int x : w) cout << x << ' ';
    cout << '\n';
}
```

:::warn Erasing one by one is O(n²)
`for (...) if (bad) v.erase(v.begin() + i);` shifts the tail on every erase. With many removals that's quadratic. Use erase–remove, or build a new vector of the elements you keep.
:::

### 2D vectors (grids)

```cpp run level=easy title="Grids: rows, columns and the 4 neighbours"
#include <bits/stdc++.h>
using namespace std;

int main() {
    int R = 3, C = 4;
    vector<vector<int>> g(R, vector<int>(C));
    for (int r = 0; r < R; r++)
        for (int c = 0; c < C; c++)
            g[r][c] = r * C + c;              // row-major numbering

    // neighbours of (1, 1) using direction arrays
    int dr[] = {-1, 1, 0, 0}, dc[] = {0, 0, -1, 1};
    int r = 1, c = 1;
    cout << "neighbours of g[1][1] = " << g[r][c] << ":";
    for (int k = 0; k < 4; k++) {
        int nr = r + dr[k], nc = c + dc[k];
        if (nr >= 0 && nr < R && nc >= 0 && nc < C) cout << ' ' << g[nr][nc];
    }
    cout << '\n';
}
```

Direction arrays (`dr`, `dc`) are the standard way to visit neighbours in grid problems. You'll use them all through the Graphs module.

## string

A C++ `string` is basically a `vector<char>` with text helpers. Characters are small integers, so you can do arithmetic on them.

:::syntax
```cpp
string s = "hello";
s.size();  s[0];  s.back();  s += "!";  s.push_back('x');
s.substr(pos, len);        // copy of a piece: O(len)
s.find("ll");              // index or string::npos
to_string(42);  stoi("42");  stoll("123456789012");
c - 'a'   // 'a'..'z' -> 0..25        c - '0'   // '0'..'9' -> 0..9
isdigit(c), isalpha(c), isalnum(c), tolower(c), toupper(c)
```
:::

```cpp run level=easy title="Character math: counting letters"
#include <bits/stdc++.h>
using namespace std;

int main() {
    string s = "interview";
    int cnt[26] = {0};
    for (char c : s) cnt[c - 'a']++;          // map 'a'..'z' to 0..25
    for (int i = 0; i < 26; i++)
        if (cnt[i]) cout << char('a' + i) << ':' << cnt[i] << ' ';
    cout << '\n';

    string digits = "4096";
    int value = 0;
    for (char c : digits) value = value * 10 + (c - '0');   // parse by hand
    cout << "parsed " << value << ", plus one = " << value + 1 << '\n';
}
```

A fixed `int cnt[26]` array is faster and simpler than a hash map when the keys are lowercase letters. This is a very common interview trick.

### Building strings efficiently

:::warn `s = s + c` in a loop is O(n²)
`s = s + c` builds a **new** string each time, copying everything. Use `s += c` or `s.push_back(c)`, which are amortized O(1). The same goes for `substr` inside loops: each call copies.
:::

```cpp run level=intermediate title="Reverse words: split, then join"
#include <bits/stdc++.h>
using namespace std;

int main() {
    string line = "  the quick   brown fox ";
    stringstream ss(line);               // treat the string like an input stream
    vector<string> words;
    string w;
    while (ss >> w) words.push_back(w);  // >> skips any amount of whitespace

    reverse(words.begin(), words.end());
    string out;
    for (int i = 0; i < (int)words.size(); i++) {
        if (i) out += ' ';
        out += words[i];
    }
    cout << '[' << out << "]\n";
}
```

## Problems

:::problem Valid Palindrome {level=easy lc=valid-palindrome tags="string,two pointers"}
A phrase is a palindrome if, after converting to lowercase and keeping only letters and digits, it reads the same forwards and backwards. Return whether `s` is a palindrome.

Example: `"A man, a plan, a canal: Panama"` → `true`; `"race a car"` → `false`.

:::hint Hint
You don't need to build a cleaned-up copy. Put one index at each end and skip characters that aren't letters or digits.
:::

:::solution
Two indexes walk inwards. Skip anything that isn't alphanumeric, compare the rest case-insensitively.

```cpp run
#include <bits/stdc++.h>
using namespace std;

bool isPalindrome(const string& s) {
    int i = 0, j = (int)s.size() - 1;
    while (i < j) {
        if (!isalnum((unsigned char)s[i])) { i++; continue; }
        if (!isalnum((unsigned char)s[j])) { j--; continue; }
        if (tolower((unsigned char)s[i]) != tolower((unsigned char)s[j])) return false;
        i++; j--;
    }
    return true;
}

int main() {
    cout << boolalpha << isPalindrome("A man, a plan, a canal: Panama") << ' '
         << isPalindrome("race a car") << ' ' << isPalindrome(" ") << '\n';
}
```

:::complexity
Time | O(n) | each index moves inward only
Space | O(1) | no copy of the string
:::

The `(unsigned char)` cast matters: `isalnum` on a negative `char` (non-ASCII byte) is undefined behaviour.
:::
:::

:::problem Longest Common Prefix {level=easy lc=longest-common-prefix tags="string"}
Return the longest common prefix of a list of strings, or `""` if there is none.

Example: `["flower","flow","flight"]` → `"fl"`.

:::hint Hint
Compare column by column: character 0 of every word, then character 1, and so on. Stop at the first mismatch or when a word runs out.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

string longestCommonPrefix(const vector<string>& strs) {
    if (strs.empty()) return "";
    for (int i = 0; i < (int)strs[0].size(); i++) {
        char c = strs[0][i];
        for (const string& s : strs)
            if (i >= (int)s.size() || s[i] != c) return strs[0].substr(0, i);
    }
    return strs[0];
}

int main() {
    cout << '"' << longestCommonPrefix({"flower", "flow", "flight"}) << "\" "
         << '"' << longestCommonPrefix({"dog", "racecar", "car"}) << "\"\n";
}
```

:::complexity
Time | O(S) | S = total characters; we stop at the first mismatch
Space | O(1) | besides the answer
:::

**Alternative:** sort the strings. The common prefix of the *whole* list equals the common prefix of the first and last strings in sorted order. That's O(S log n) and a nice one-liner to mention.
:::
:::

:::problem Reverse Words in a String {level=medium lc=reverse-words-in-a-string tags="string,two pointers"}
Reverse the order of words in a string. Words are separated by one or more spaces. The result must have single spaces and no leading or trailing spaces.

Example: `"  the sky  is blue "` → `"blue is sky the"`.

:::hint Hint 1
`stringstream` splitting (shown above) solves it in a few lines. Mention it, then offer the in-place version.
:::

:::hint Hint 2
In place, with O(1) extra space: reverse the **whole** string, then reverse **each word** back, then squeeze out the extra spaces.
:::

:::solution
In-place version. Reversing everything puts the words in the right order, but each word is spelled backwards. Reversing each word fixes the spelling.

```cpp run
#include <bits/stdc++.h>
using namespace std;

string reverseWords(string s) {
    reverse(s.begin(), s.end());                     // whole string
    int n = s.size(), write = 0;
    for (int i = 0; i < n; i++) {
        if (s[i] == ' ') continue;
        if (write) s[write++] = ' ';                 // one space between words
        int start = write;
        while (i < n && s[i] != ' ') s[write++] = s[i++];   // copy the word
        reverse(s.begin() + start, s.begin() + write);      // fix its spelling
    }
    s.resize(write);
    return s;
}

int main() {
    cout << '[' << reverseWords("  the sky  is blue ") << "]\n";
    cout << '[' << reverseWords("a good   example") << "]\n";
}
```

:::complexity
Time | O(n) | each character is moved and reversed a constant number of times
Space | O(1) | extra, beyond the string itself
:::
:::
:::

## Check yourself

```quiz
? Why is `push_back` O(1) amortized and not O(1) always?
+ Occasionally the vector must regrow and copy everything, but that cost averages out over many pushes
- Because of cache misses
- It is always O(1)
> Doubling makes the total copying across n pushes less than 2n.

? What is the cost of `v.erase(v.begin())` on a vector of n elements?
- O(1)
- O(log n)
+ O(n)
> Every remaining element shifts one place left.

? Which builds a string of n characters in O(n) total?
- `s = s + c;` in a loop
+ `s += c;` in a loop
- `s = c + s;` in a loop
> `+=` appends in place. The others create a new string each time.

? `'7' - '0'` equals?
+ 7
- 55
- '7'
> Digit characters are consecutive, so subtracting '0' gives the digit's value.
```

:::keypoints
- `vector`: O(1) index and push_back (amortized); O(n) insert/erase in the middle or front. Use `reserve` when you know the size.
- Use erase–remove (or C++20 `erase_if`) to filter in O(n). Never erase one by one in a loop.
- Grids: `vector<vector<int>> g(R, vector<int>(C))` plus direction arrays `dr/dc`.
- Strings: `c - 'a'` / `c - '0'` math, `int cnt[26]` counters, `+=` (never `s = s + c`), `stringstream` to split.
:::
