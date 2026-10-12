---
title: A diff Tool (like git diff)
level: advanced
time: 60
icon: file
cover: #64748b,#22c55e
tags: dynamic programming, LCS, edit script, hashing, strings
summary: Build a line-based diff — read two versions of a text, compute the longest common subsequence of lines with DP, walk the table back into an edit script of kept/deleted/inserted lines, print it in unified-diff style with hunks and context, and add word-level edit distance for changed lines.
---

`git diff`, code review tools and document comparisons all answer the same question: **what's the smallest set of changes that turns version A into version B?** If you keep the longest common subsequence of lines unchanged, everything else is a deletion or an insertion. That's String DP applied to a real tool.

:::flow Plan
Split | text → lines (hash them for fast comparisons)
LCS table | dp[i][j] over line prefixes
Edit script | walk back from dp[n][m]: keep / delete / insert
Hunks | group the changes with a few lines of context
Polish | word-level edit distance for changed lines
:::

## From LCS to an edit script

With `dp[i][j]` = the LCS length of the first `i` lines of A and the first `j` lines of B, walk back from `(n, m)`:

- `A[i−1] == B[j−1]` → **keep** that line, move ↖
- `dp[i][j−1] ≥ dp[i−1][j]` → line `B[j−1]` was **inserted**, move ←
- otherwise → line `A[i−1]` was **deleted**, move ↑

(Preferring insertions on ties during the backward walk makes deletions print **before** insertions in a changed block, as `git diff` does.)

The number of changed lines is $n + m - 2 \cdot \text{LCS}$: everything outside the common part is either removed or added. Reversing the walk gives the script in forward order.

:::tip Hash the lines first
Comparing lines character by character inside an $O(nm)$ table is slow. Map each distinct line to an integer id once (with a hash map). Then each table comparison is $O(1)$.
:::

```cpp run title="Line diff with unified-style hunks"
#include <bits/stdc++.h>
using namespace std;

vector<string> splitLines(const string& text) {
    vector<string> out; string line; istringstream in(text);
    while (getline(in, line)) out.push_back(line);
    return out;
}

struct Edit { char op; string line; };                 // ' ' keep, '-' delete, '+' insert

vector<Edit> diff(const vector<string>& A, const vector<string>& B) {
    unordered_map<string, int> id;                      // intern lines: O(1) comparisons
    auto intern = [&](const vector<string>& v) { vector<int> r; for (auto& s : v) r.push_back(id.emplace(s, id.size()).first->second); return r; };
    vector<int> a = intern(A), b = intern(B);
    int n = a.size(), m = b.size();
    vector<vector<int>> dp(n + 1, vector<int>(m + 1, 0));
    for (int i = 1; i <= n; i++)
        for (int j = 1; j <= m; j++)
            dp[i][j] = a[i - 1] == b[j - 1] ? dp[i - 1][j - 1] + 1 : max(dp[i - 1][j], dp[i][j - 1]);
    vector<Edit> script;
    int i = n, j = m;
    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && a[i - 1] == b[j - 1]) { script.push_back({' ', A[i - 1]}); i--; j--; }
        else if (j > 0 && (i == 0 || dp[i][j - 1] >= dp[i - 1][j])) { script.push_back({'+', B[j - 1]}); j--; }   // on ties take '+' first:
        else { script.push_back({'-', A[i - 1]}); i--; }                                                           // after reversing, '-' comes first
    }
    reverse(script.begin(), script.end());
    return script;
}

void printUnified(const vector<Edit>& s, int context = 1) {
    int n = s.size();
    vector<bool> show(n, false);
    for (int k = 0; k < n; k++) if (s[k].op != ' ')
        for (int t = max(0, k - context); t <= min(n - 1, k + context); t++) show[t] = true;
    int oldLine = 1, newLine = 1;
    for (int k = 0; k < n; ) {
        if (!show[k]) { if (s[k].op != '+') oldLine++; if (s[k].op != '-') newLine++; k++; continue; }
        int start = k, oldCount = 0, newCount = 0;
        while (k < n && show[k]) { if (s[k].op != '+') oldCount++; if (s[k].op != '-') newCount++; k++; }
        cout << "@@ -" << oldLine << ',' << oldCount << " +" << newLine << ',' << newCount << " @@\n";
        for (int t = start; t < k; t++) cout << s[t].op << s[t].line << '\n';
        oldLine += oldCount; newLine += newCount;
    }
}

int main() {
    string before =
        "#include <iostream>\n"
        "int main() {\n"
        "    int x = 1;\n"
        "    int y = 2;\n"
        "    std::cout << x + y;\n"
        "    return 0;\n"
        "}\n";
    string after =
        "#include <iostream>\n"
        "#include <string>\n"
        "int main() {\n"
        "    int x = 1;\n"
        "    int z = 3;\n"
        "    std::cout << x + z << '\\n';\n"
        "    return 0;\n"
        "}\n";
    auto A = splitLines(before), B = splitLines(after);
    auto script = diff(A, B);
    int adds = 0, dels = 0;
    for (auto& e : script) { adds += e.op == '+'; dels += e.op == '-'; }
    cout << "--- before.cpp\n+++ after.cpp\n";
    printUnified(script);
    cout << "\n" << adds << " insertions(+), " << dels << " deletions(-)  [n + m - 2*LCS = "
         << A.size() + B.size() - 2 * (A.size() - dels) << "]\n";
}
```

## Word-level detail for changed lines

When a line is replaced by a similar one, showing **which words** changed helps reviewers (GitHub highlights them). Edit distance over words, plus a walk-back, gives exactly that:

```cpp run title="Word-level edit distance with highlights"
#include <bits/stdc++.h>
using namespace std;

vector<string> words(const string& s) { vector<string> w; string t; istringstream in(s); while (in >> t) w.push_back(t); return w; }

int main() {
    string oldLine = "the quick brown fox jumps over the lazy dog";
    string newLine = "the quick red fox leaps over the very lazy dog";
    auto a = words(oldLine), b = words(newLine);
    int n = a.size(), m = b.size();
    vector<vector<int>> dp(n + 1, vector<int>(m + 1));
    for (int i = 0; i <= n; i++) dp[i][0] = i;
    for (int j = 0; j <= m; j++) dp[0][j] = j;
    for (int i = 1; i <= n; i++)
        for (int j = 1; j <= m; j++)
            dp[i][j] = a[i - 1] == b[j - 1] ? dp[i - 1][j - 1] : 1 + min({dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]});
    vector<string> out;
    int i = n, j = m;
    while (i || j) {
        if (i && j && a[i - 1] == b[j - 1]) { out.push_back(a[i - 1]); i--; j--; }
        else if (i && j && dp[i][j] == dp[i - 1][j - 1] + 1) { out.push_back("[-" + a[i - 1] + "-]{+" + b[j - 1] + "+}"); i--; j--; }
        else if (i && dp[i][j] == dp[i - 1][j] + 1) { out.push_back("[-" + a[i - 1] + "-]"); i--; }
        else { out.push_back("{+" + b[j - 1] + "+}"); j--; }
    }
    reverse(out.begin(), out.end());
    cout << dp[n][m] << " word edits:\n";
    for (auto& w : out) cout << w << ' ';
    cout << '\n';
}
```

## How real diff tools differ

The $O(nm)$ table is fine for a few thousand lines, but `git` diffs files with 100,000 lines. Real tools use **Myers' algorithm**, which runs in $O((n + m) \cdot D)$, where $D$ is the number of differences. It's very fast when the files are similar, which is the common case. They also clean up the result (*patience diff* and *histogram diff* anchor on unique lines) so the output reads naturally to humans.

## Extensions

:::exercise Make it your own
1. Reduce memory to $O(\min(n, m))$ for the **length** only, then look up **Hirschberg's algorithm**, which also recovers the script in linear space.
2. Write `patch`: apply an edit script to A and check that you get B.
3. Implement a 3-way merge: diff base→ours and base→theirs, and flag overlapping hunks as conflicts.
:::

:::keypoints
- Diff = keep an LCS of lines; everything else becomes `−` or `+`. Changes = $n + m - 2\,\text{LCS}$.
- Intern (hash) lines so comparisons are $O(1)$. Walk the DP table back to get the edit script.
- Group changes into hunks with context lines for readable output.
- Word-level edit distance highlights in-line changes. Myers' algorithm scales to huge, similar files.
:::
