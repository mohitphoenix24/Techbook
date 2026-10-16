/* ==========================================================================
   DSA Sheets — the catalogue: the 75 canonical Blind 75 problems (in the usual
   category order) plus Binary Search as a warm-up. The dashboard, sidebar and
   search read this list; the lesson itself lives in problems/<id>.js and is
   loaded when you open it. `viz` is the specialised visualizer the problem uses.
   [id, title, difficulty, category, patterns, leetcode-slug, viz, premium?]
   ========================================================================== */
(function () {
  "use strict";
  const SX = (window.SHEETS = window.SHEETS || {});
  const E = "Easy", M = "Medium", H = "Hard";
  const rows = [
    // Foundation (not in the Blind 75 — the warm-up that Search in Rotated Array builds on)
    ["binary-search", "Binary Search", E, "Foundation", ["Binary Search"], "binary-search", "binary"],
    // Array
    ["two-sum", "Two Sum", E, "Array", ["Hash Map"], "two-sum", "hashmap"],
    ["best-time-to-buy-and-sell-stock", "Best Time to Buy and Sell Stock", E, "Array", ["Greedy", "One Pass"], "best-time-to-buy-and-sell-stock", "array"],
    ["contains-duplicate", "Contains Duplicate", E, "Array", ["Hash Set"], "contains-duplicate", "hashmap"],
    ["product-of-array-except-self", "Product of Array Except Self", M, "Array", ["Prefix Sum", "Suffix Product"], "product-of-array-except-self", "array"],
    ["maximum-subarray", "Maximum Subarray", M, "Array", ["Kadane", "Dynamic Programming"], "maximum-subarray", "array"],
    ["maximum-product-subarray", "Maximum Product Subarray", M, "Array", ["Dynamic Programming"], "maximum-product-subarray", "array"],
    ["find-minimum-in-rotated-sorted-array", "Find Minimum in Rotated Sorted Array", M, "Array", ["Binary Search"], "find-minimum-in-rotated-sorted-array", "binary"],
    ["search-in-rotated-sorted-array", "Search in Rotated Sorted Array", M, "Array", ["Binary Search"], "search-in-rotated-sorted-array", "binary"],
    ["3sum", "3Sum", M, "Array", ["Two Pointers", "Sorting"], "3sum", "twopointer"],
    ["container-with-most-water", "Container With Most Water", M, "Array", ["Two Pointers", "Greedy"], "container-with-most-water", "twopointer"],
    // Binary
    ["sum-of-two-integers", "Sum of Two Integers", M, "Binary", ["Bit Manipulation"], "sum-of-two-integers", "bit"],
    ["number-of-1-bits", "Number of 1 Bits", E, "Binary", ["Bit Manipulation"], "number-of-1-bits", "bit"],
    ["counting-bits", "Counting Bits", E, "Binary", ["Bit Manipulation", "Dynamic Programming"], "counting-bits", "bit"],
    ["missing-number", "Missing Number", E, "Binary", ["Bit Manipulation", "Math"], "missing-number", "bit"],
    ["reverse-bits", "Reverse Bits", E, "Binary", ["Bit Manipulation"], "reverse-bits", "bit"],
    // Dynamic Programming
    ["climbing-stairs", "Climbing Stairs", E, "Dynamic Programming", ["Dynamic Programming", "1D DP"], "climbing-stairs", "dp"],
    ["coin-change", "Coin Change", M, "Dynamic Programming", ["Dynamic Programming", "Unbounded Knapsack"], "coin-change", "dp"],
    ["longest-increasing-subsequence", "Longest Increasing Subsequence", M, "Dynamic Programming", ["Dynamic Programming", "Binary Search"], "longest-increasing-subsequence", "array"],
    ["longest-common-subsequence", "Longest Common Subsequence", M, "Dynamic Programming", ["Dynamic Programming", "2D DP"], "longest-common-subsequence", "dp"],
    ["word-break", "Word Break", M, "Dynamic Programming", ["Dynamic Programming"], "word-break", "dp"],
    ["combination-sum-iv", "Combination Sum IV", M, "Dynamic Programming", ["Dynamic Programming", "Unbounded Knapsack"], "combination-sum-iv", "dp"],
    ["house-robber", "House Robber", M, "Dynamic Programming", ["Dynamic Programming", "1D DP"], "house-robber", "dp"],
    ["house-robber-ii", "House Robber II", M, "Dynamic Programming", ["Dynamic Programming", "1D DP"], "house-robber-ii", "dp"],
    ["decode-ways", "Decode Ways", M, "Dynamic Programming", ["Dynamic Programming", "1D DP"], "decode-ways", "dp"],
    ["unique-paths", "Unique Paths", M, "Dynamic Programming", ["Dynamic Programming", "2D DP"], "unique-paths", "dp"],
    ["jump-game", "Jump Game", M, "Dynamic Programming", ["Greedy"], "jump-game", "greedy"],
    // Graph
    ["clone-graph", "Clone Graph", M, "Graph", ["DFS", "Hash Map"], "clone-graph", "graph"],
    ["course-schedule", "Course Schedule", M, "Graph", ["Topological Sort", "BFS"], "course-schedule", "graph"],
    ["pacific-atlantic-water-flow", "Pacific Atlantic Water Flow", M, "Graph", ["BFS", "Multi-source"], "pacific-atlantic-water-flow", "matrix"],
    ["number-of-islands", "Number of Islands", M, "Graph", ["DFS", "BFS", "Flood Fill"], "number-of-islands", "matrix"],
    ["longest-consecutive-sequence", "Longest Consecutive Sequence", M, "Graph", ["Hash Set"], "longest-consecutive-sequence", "hashmap"],
    ["alien-dictionary", "Alien Dictionary", H, "Graph", ["Topological Sort"], "alien-dictionary", "graph", true],
    ["graph-valid-tree", "Graph Valid Tree", M, "Graph", ["Union Find"], "graph-valid-tree", "unionfind", true],
    ["number-of-connected-components-in-an-undirected-graph", "Number of Connected Components in an Undirected Graph", M, "Graph", ["Union Find", "DFS"], "number-of-connected-components-in-an-undirected-graph", "unionfind", true],
    // Interval
    ["insert-interval", "Insert Interval", M, "Interval", ["Intervals"], "insert-interval", "interval"],
    ["merge-intervals", "Merge Intervals", M, "Interval", ["Intervals", "Sorting"], "merge-intervals", "interval"],
    ["non-overlapping-intervals", "Non-overlapping Intervals", M, "Interval", ["Greedy", "Intervals"], "non-overlapping-intervals", "interval"],
    ["meeting-rooms", "Meeting Rooms", E, "Interval", ["Intervals", "Sorting"], "meeting-rooms", "interval", true],
    ["meeting-rooms-ii", "Meeting Rooms II", M, "Interval", ["Heap", "Intervals"], "meeting-rooms-ii", "interval", true],
    // Linked List
    ["reverse-linked-list", "Reverse Linked List", E, "Linked List", ["Linked List", "Pointers"], "reverse-linked-list", "list"],
    ["linked-list-cycle", "Linked List Cycle", E, "Linked List", ["Fast/Slow Pointer"], "linked-list-cycle", "list"],
    ["merge-two-sorted-lists", "Merge Two Sorted Lists", E, "Linked List", ["Linked List", "Two Pointers"], "merge-two-sorted-lists", "list"],
    ["merge-k-sorted-lists", "Merge K Sorted Lists", H, "Linked List", ["Heap", "Linked List"], "merge-k-sorted-lists", "heap"],
    ["remove-nth-node-from-end-of-list", "Remove Nth Node From End of List", M, "Linked List", ["Two Pointers", "Linked List"], "remove-nth-node-from-end-of-list", "list"],
    ["reorder-list", "Reorder List", M, "Linked List", ["Fast/Slow Pointer", "Reverse"], "reorder-list", "list"],
    // Matrix
    ["set-matrix-zeroes", "Set Matrix Zeroes", M, "Matrix", ["Matrix", "In-place"], "set-matrix-zeroes", "matrix"],
    ["spiral-matrix", "Spiral Matrix", M, "Matrix", ["Matrix", "Simulation"], "spiral-matrix", "matrix"],
    ["rotate-image", "Rotate Image", M, "Matrix", ["Matrix", "In-place"], "rotate-image", "matrix"],
    ["word-search", "Word Search", M, "Matrix", ["Backtracking", "DFS"], "word-search", "backtracking"],
    // String
    ["longest-substring-without-repeating-characters", "Longest Substring Without Repeating Characters", M, "String", ["Sliding Window", "Hash Map"], "longest-substring-without-repeating-characters", "sliding"],
    ["longest-repeating-character-replacement", "Longest Repeating Character Replacement", M, "String", ["Sliding Window"], "longest-repeating-character-replacement", "sliding"],
    ["minimum-window-substring", "Minimum Window Substring", H, "String", ["Sliding Window", "Hash Map"], "minimum-window-substring", "sliding"],
    ["valid-anagram", "Valid Anagram", E, "String", ["Hash Map", "Counting"], "valid-anagram", "hashmap"],
    ["group-anagrams", "Group Anagrams", M, "String", ["Hash Map"], "group-anagrams", "hashmap"],
    ["valid-parentheses", "Valid Parentheses", E, "String", ["Stack"], "valid-parentheses", "stack"],
    ["valid-palindrome", "Valid Palindrome", E, "String", ["Two Pointers"], "valid-palindrome", "twopointer"],
    ["longest-palindromic-substring", "Longest Palindromic Substring", M, "String", ["Expand Around Center", "DP"], "longest-palindromic-substring", "twopointer"],
    ["palindromic-substrings", "Palindromic Substrings", M, "String", ["Expand Around Center", "DP"], "palindromic-substrings", "twopointer"],
    ["encode-and-decode-strings", "Encode and Decode Strings", M, "String", ["Design", "String"], "encode-and-decode-strings", "array", true],
    // Tree
    ["maximum-depth-of-binary-tree", "Maximum Depth of Binary Tree", E, "Tree", ["DFS", "Recursion"], "maximum-depth-of-binary-tree", "recursion"],
    ["same-tree", "Same Tree", E, "Tree", ["DFS", "Recursion"], "same-tree", "recursion"],
    ["invert-binary-tree", "Invert Binary Tree", E, "Tree", ["DFS", "Recursion"], "invert-binary-tree", "tree"],
    ["binary-tree-maximum-path-sum", "Binary Tree Maximum Path Sum", H, "Tree", ["DFS", "Dynamic Programming"], "binary-tree-maximum-path-sum", "recursion"],
    ["binary-tree-level-order-traversal", "Binary Tree Level Order Traversal", M, "Tree", ["BFS", "Queue"], "binary-tree-level-order-traversal", "queue"],
    ["serialize-and-deserialize-binary-tree", "Serialize and Deserialize Binary Tree", H, "Tree", ["BFS", "Design"], "serialize-and-deserialize-binary-tree", "tree"],
    ["subtree-of-another-tree", "Subtree of Another Tree", E, "Tree", ["DFS", "Recursion"], "subtree-of-another-tree", "recursion"],
    ["construct-binary-tree-from-preorder-and-inorder-traversal", "Construct Binary Tree from Preorder and Inorder Traversal", M, "Tree", ["Divide and Conquer", "Hash Map"], "construct-binary-tree-from-preorder-and-inorder-traversal", "tree"],
    ["validate-binary-search-tree", "Validate Binary Search Tree", M, "Tree", ["DFS", "BST"], "validate-binary-search-tree", "tree"],
    ["kth-smallest-element-in-a-bst", "Kth Smallest Element in a BST", M, "Tree", ["Inorder", "BST"], "kth-smallest-element-in-a-bst", "tree"],
    ["lowest-common-ancestor-of-a-binary-search-tree", "Lowest Common Ancestor of a BST", M, "Tree", ["BST"], "lowest-common-ancestor-of-a-binary-search-tree", "tree"],
    ["implement-trie-prefix-tree", "Implement Trie (Prefix Tree)", M, "Tree", ["Trie", "Design"], "implement-trie-prefix-tree", "trie"],
    ["design-add-and-search-words-data-structure", "Design Add and Search Words Data Structure", M, "Tree", ["Trie", "DFS"], "design-add-and-search-words-data-structure", "trie"],
    ["word-search-ii", "Word Search II", H, "Tree", ["Trie", "Backtracking"], "word-search-ii", "trie"],
    // Heap
    ["top-k-frequent-elements", "Top K Frequent Elements", M, "Heap", ["Heap", "Bucket Sort", "Hash Map"], "top-k-frequent-elements", "heap"],
    ["find-median-from-data-stream", "Find Median from Data Stream", H, "Heap", ["Two Heaps", "Design"], "find-median-from-data-stream", "heap"],
  ];
  SX.catalog = rows.map(([id, title, difficulty, category, patterns, lc, viz, premium], i) => ({
    id, title, difficulty, category, patterns, lc, viz, premium: !!premium, order: i, no: category === "Foundation" ? 0 : i,
  }));
  SX.categories = ["Foundation", "Array", "Binary", "Dynamic Programming", "Graph", "Interval", "Linked List", "Matrix", "String", "Tree", "Heap"];
  SX.catIcon = { Foundation: "target", Array: "list", Binary: "cpu", "Dynamic Programming": "grid", Graph: "network", Interval: "layers", "Linked List": "route", Matrix: "grid", String: "code", Tree: "tree", Heap: "stack" };
  SX.loaded = SX.loaded || {};
})();
