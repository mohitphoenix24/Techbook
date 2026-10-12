---
title: Start Here — How to Become Interview-Ready
level: easy
time: 15
summary: What data structures and algorithms are, why interviews test them, how this course is built (patterns, proofs, visualizers, runnable C++), and the study loop that makes it stick.
---

Welcome! This course takes you from "I know some C++" to **solving interview problems with confidence**. You don't need to have studied algorithms before. You do need to be curious and willing to type code.

## What are data structures and algorithms?

:::def Data structure
A way of **organising data in memory** so that the operations you need are fast. An array, a hash map, a tree and a graph are all data structures. Each one makes some operations cheap and others expensive.
:::

:::def Algorithm
A **finite, step-by-step procedure** that turns an input into the correct output. "Sort these numbers", "find the shortest route" and "check if this word is in the dictionary" are all solved by algorithms.
:::

The two go together. The right data structure often *is* the algorithm. Here is one question solved two ways:

> Do any two numbers in this list of 1,000,000 numbers add up to 100?

- **Check every pair**: about $\frac{n^2}{2} = 5 \times 10^{11}$ checks. That's minutes of work for a computer.
- **Remember what you've seen in a hash set**: one pass, about $10^6$ operations. That's a few milliseconds.

Same answer, but one version is roughly **500,000 times faster**. That gap is what this course is about.

:::analogy
A library with books thrown in a pile works, but finding one book means checking every book. A library sorted by catalogue number lets you jump straight to the right shelf. The books are the same. The **organisation** (data structure) and the **search method** (algorithm) make the difference.
:::

## Why interviews test DSA

Companies can't watch you work for six months before hiring you, so they use 45-minute problems as a proxy. A DSA question shows them:

| What they see | What it tells them |
|---|---|
| You restate the problem and ask about edge cases | You understand before you build |
| You start with a brute force, then improve it | You can reason step by step |
| You know the cost (Big-O) of your solution | You can predict how code behaves at scale |
| You write clean, correct code | You can actually ship |
| You test with examples and fix bugs | You check your own work |

:::interview
Interviewers almost never want a memorised answer. They want to see you **think**: notice a pattern, explain why it works, state the complexity, and handle edge cases. This course teaches each topic in that order.
:::

## How this course is built

Every lesson follows the same structure, so you always know where to look:

:::flow Each lesson
Intuition | the idea in plain English, with a picture
Definition | the precise version, in a definition box
Visualizer | watch it run step by step
Code | real C++ you can edit and run
Math | why it's correct and how fast it is
Problems | classic interview questions, brute force → optimal
:::

### The boxes you will see

:::def Like this one
Definitions are collected in the **Glossary** (top bar), so you can look up any term later.
:::

:::tip
Tips are shortcuts and good habits.
:::

:::warn
"Common mistake" boxes show the bugs that cost people interviews.
:::

:::proof Proof boxes
Proof boxes show *why* something is true. Read them slowly. They are what make the idea stick, and interviewers love it when you can explain the reason.
:::

:::derive Derivation boxes show math step by step
\sum_{i=1}^{n} i = 1 + 2 + \cdots + n || each line has a reason on the right
= \frac{n(n+1)}{2} || pair the first and last terms (proved in the Complexity module)
! = O(n^2) || a line starting with ∴ is the result
:::

:::complexity
Time | O(n) | Complexity cards summarise the cost of an algorithm
Space | O(1) | how much extra memory it needs
:::

### Code you can run

Every **▶ Run** block is a complete C++ program. The output you see first was produced by really compiling the program with `g++` when this course was built. **Edit anything** and press Run again (or `Ctrl` + `Enter`). Your code is then compiled live with GCC on [Compiler Explorer](https://godbolt.org). Try it:

```cpp run level=easy title="Your first program"
#include <bits/stdc++.h>
using namespace std;

int main() {
    vector<int> scores = {72, 95, 61, 88, 79};
    sort(scores.begin(), scores.end());            // O(n log n)
    cout << "sorted:";
    for (int s : scores) cout << ' ' << s;
    cout << "\nbest: " << scores.back() << "\n";
}
```

Change `72` to `100` and run it again. Some programs read input with `cin`. For those, click **Input** to edit what they read:

```cpp run level=easy title="Reading input"
#include <bits/stdc++.h>
using namespace std;

int main() {
    int n;
    cin >> n;                       // first number: how many values follow
    long long sum = 0;
    for (int i = 0; i < n; i++) {
        int x;
        cin >> x;
        sum += x;
    }
    cout << "sum of " << n << " numbers = " << sum << "\n";
}
```
```stdin
5
10 20 30 40 50
```

### Visualizers

Many lessons have a step-by-step player. Press ▶, step with the arrow buttons, type your own input, or hit **Random**. The highlighted line of C++ is the one being executed:

```viz algo=binary-search
```

### Problems and the tracker

Interview problems appear as cards like the one below. Each card links to the same problem on LeetCode so you can submit there. Each one has hints you can open one at a time, then a full solution. Tick **Solved** and it shows up on the **Problems** page, which tracks your progress across the whole course.

:::problem Running Sum of 1d Array {level=easy lc=running-sum-of-1d-array tags="array,prefix sum"}
Given an array `nums`, return an array where `out[i] = nums[0] + nums[1] + … + nums[i]`.

Example: `[1, 2, 3, 4]` → `[1, 3, 6, 10]`

:::hint Hint
Each answer is the previous answer plus one new number.
:::

:::solution
Keep a running total. `out[i] = out[i-1] + nums[i]`, so each element costs O(1).

```cpp run
#include <bits/stdc++.h>
using namespace std;

vector<int> runningSum(vector<int> nums) {
    for (int i = 1; i < (int)nums.size(); i++)
        nums[i] += nums[i - 1];            // reuse the previous answer
    return nums;
}

int main() {
    for (int x : runningSum({1, 2, 3, 4})) cout << x << ' ';
    cout << "\n";
}
```

:::complexity
Time | O(n) | one pass
Space | O(1) | extra, if we modify the input in place
:::
:::
:::

## The study loop that works

Reading about algorithms feels productive, but it doesn't stick. This loop does:

:::flow For every topic
Learn | read the lesson, run the code, watch the visualizer
Explain | say out loud why it works and what it costs
Solve | do the problems *without* the solution, 20–40 min each
Review | read the solution, even if you solved it
Repeat | revisit problems after 3 days, then 1 week, then 1 month
:::

:::tip Struggle is the point
If you're stuck after 25–30 minutes, open **one hint**, not the solution. The few minutes of "almost there" are when your brain builds the pattern. Read the full solution only after a real attempt, then **re-solve it from scratch the next day**.
:::

## The roadmap

| Module | What you'll be able to do |
|---|---|
| 1. C++ for DSA | Write fast, correct C++ with the STL, with no syntax fumbling in interviews |
| 2. Complexity & math | Work out the Big-O of any code, and prove it |
| 3. Array patterns | Solve most "easy/medium" array & string questions (two pointers, sliding window, hashing, prefix sums) |
| 4. Searching & sorting | Write binary search without off-by-one bugs, and know every sort inside out |
| 5. Lists, stacks, queues | Handle pointer problems and monotonic stack/queue tricks |
| 6. Recursion & backtracking | Generate subsets/permutations, solve constraint puzzles |
| 7. Trees & heaps | Tackle any binary tree question, BSTs, top-k with heaps, tries, segment trees |
| 8. Graphs | BFS/DFS, topological sort, Dijkstra, union-find, MST |
| 9. Dynamic programming | Turn "try every option" into fast, tabulated solutions |
| 10. Greedy & strings | Prove greedy choices; match strings in linear time |
| 11. Interview playbook | A repeatable method, a pattern map, cheat sheets, and a plan |
| Project Lab | Build real data structures from scratch |

:::note If you already know C++ well
Skim Module 1 (the STL lessons are still worth a look) and start at Module 2. The complexity math there is used all through the course.
:::

## Check yourself

```quiz
? What is the main reason the hash-set solution beats checking every pair?
- Hash sets use less memory
+ It does about n operations instead of about n²/2
- C++ runs hash sets in parallel
> Organising data cleverly removes almost all the repeated work.

? You've been stuck on a problem for 30 minutes. What's the best next step?
- Read the full solution right away
+ Open a single hint, then keep trying
- Skip it forever
> Small nudges keep the useful struggle going. Solutions are for after a real attempt.
```

:::keypoints
- A **data structure** organises data; an **algorithm** is the step-by-step procedure. Choosing them well can make code millions of times faster.
- Interviews test reasoning: brute force → better idea → complexity → clean code → testing.
- Every lesson goes: intuition → definition → visualizer → code → math → problems.
- Run and edit every example. Use hints before solutions. Re-solve problems days later.
:::
