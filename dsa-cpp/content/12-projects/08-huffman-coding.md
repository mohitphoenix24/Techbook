---
title: Huffman Compression
level: advanced
time: 60
icon: box
cover: #eab308,#f97316
tags: greedy, heap, binary tree, bits, information theory
summary: Compress text with Huffman coding — count frequencies, build the optimal prefix-free code with a min-heap (greedy), assign codes by walking the tree, pack the bits into bytes, decode back, and compare the result with Shannon entropy, the theoretical limit. Includes the greedy optimality argument.
---

Every character in a normal text file takes 8 bits. But `e` is far more common than `z`, so why give them the same length? **Huffman coding** gives frequent symbols short codes and rare symbols long codes, and it's provably the best possible code of this kind. It's used inside ZIP (DEFLATE), JPEG and MP3. It's also the textbook example of a **greedy algorithm with a heap**.

:::flow Plan
Count | the frequency of each byte
Build tree | repeatedly merge the two rarest nodes (a min-heap)
Codes | left = 0, right = 1, read the path from root to leaf
Encode | concatenate codes, pack them into bytes
Decode | walk the tree bit by bit
Measure | the compression ratio vs entropy
:::

## Prefix-free codes

:::def Prefix-free code
A code where **no codeword is a prefix of another**. Then a bit stream decodes unambiguously without separators: read bits until they spell a whole codeword, output it, and repeat. Any prefix-free code corresponds to a binary tree whose **leaves** are the symbols.
:::

The cost of a code is the total number of encoded bits, $\sum_s \text{freq}(s) \cdot \text{depth}(s)$. Huffman's algorithm minimizes it.

## The greedy algorithm

Put every symbol in a min-heap keyed by frequency. Repeatedly remove the two smallest nodes, join them under a new parent whose weight is their sum, and push the parent back. After $k - 1$ merges, one tree is left.

:::proof Why merging the two rarest symbols first is optimal (sketch)
**Exchange argument.** In some optimal tree, the two least frequent symbols $x, y$ are **siblings at the deepest level**. If a more frequent symbol sat deeper than $x$, swapping them would not increase the cost (a more frequent symbol moves up, a less frequent one moves down). So we can assume $x$ and $y$ are deepest siblings.
**Reduction.** Merging $x, y$ into one symbol $z$ with weight $f_x + f_y$ turns any tree for the new alphabet into one for the original alphabet with cost exactly $f_x + f_y$ more, and vice versa. So an optimal tree for the smaller problem gives an optimal tree for the original. By induction on the alphabet size, Huffman is optimal.
:::

```cpp run title="Huffman encode + decode, with bit packing and statistics"
#include <bits/stdc++.h>
using namespace std;

struct Node {
    long long freq; int sym;            // sym = -1 for internal nodes
    Node *left = nullptr, *right = nullptr;
};

class Huffman {
public:
    explicit Huffman(const string& text) {
        array<long long, 256> freq{};
        for (unsigned char c : text) freq[c]++;
        auto cmp = [](Node* a, Node* b) { return a->freq != b->freq ? a->freq > b->freq : a->sym > b->sym; };
        priority_queue<Node*, vector<Node*>, decltype(cmp)> pq(cmp);
        for (int s = 0; s < 256; s++) if (freq[s]) pq.push(make(freq[s], s));
        if (pq.size() == 1) pq.push(make(0, -2));          // edge case: a single symbol still needs 1 bit
        while (pq.size() > 1) {                             // greedy: merge the two rarest
            Node* a = pq.top(); pq.pop();
            Node* b = pq.top(); pq.pop();
            Node* p = make(a->freq + b->freq, -1);
            p->left = a; p->right = b;
            pq.push(p);
        }
        root_ = pq.top();
        assign(root_, "");
    }

    vector<uint8_t> encode(const string& text, size_t& bitCount) const {
        vector<uint8_t> out;
        bitCount = 0;
        for (unsigned char c : text)
            for (char bit : codes_.at(c)) {
                if (bitCount % 8 == 0) out.push_back(0);
                if (bit == '1') out.back() |= 1 << (7 - bitCount % 8);   // pack MSB first
                bitCount++;
            }
        return out;
    }

    string decode(const vector<uint8_t>& data, size_t bitCount) const {
        string out;
        const Node* cur = root_;
        for (size_t i = 0; i < bitCount; i++) {
            bool bit = data[i / 8] >> (7 - i % 8) & 1;
            cur = bit ? cur->right : cur->left;
            if (cur->sym >= 0) { out += (char)cur->sym; cur = root_; }   // reached a leaf: emit, restart
        }
        return out;
    }

    const map<int, string>& codes() const { return codes_; }

private:
    Node* root_;
    map<int, string> codes_;
    vector<unique_ptr<Node>> pool_;                         // owns every node (RAII cleanup)
    Node* make(long long f, int s) { pool_.push_back(make_unique<Node>(Node{f, s})); return pool_.back().get(); }
    void assign(Node* n, const string& path) {
        if (!n) return;
        if (n->sym >= 0) { codes_[n->sym] = path.empty() ? "0" : path; return; }
        assign(n->left, path + "0");
        assign(n->right, path + "1");
    }
};

int main() {
    string text = "it was the best of times, it was the worst of times, it was the age of wisdom, "
                  "it was the age of foolishness, it was the epoch of belief, it was the epoch of incredulity";
    Huffman h(text);
    size_t bits;
    auto packed = h.encode(text, bits);
    string back = h.decode(packed, bits);

    map<char, int> freq;
    for (char c : text) freq[c]++;
    double entropy = 0;
    for (auto [c, f] : freq) { double p = (double)f / text.size(); entropy -= p * log2(p); }

    cout << "some codes: ";
    for (char c : string(" etaswz")) if (h.codes().count((unsigned char)c)) cout << "'" << c << "'=" << h.codes().at((unsigned char)c) << "  ";
    cout << "\noriginal:   " << text.size() * 8 << " bits (" << text.size() << " bytes)\n";
    cout << "huffman:    " << bits << " bits (" << packed.size() << " bytes) -> "
         << fixed << setprecision(1) << 100.0 * bits / (text.size() * 8) << "% of the original\n";
    cout << "avg bits/char: " << setprecision(3) << (double)bits / text.size() << "   entropy: " << entropy << " (the lower bound)\n";
    cout << "decoded matches: " << boolalpha << (back == text) << '\n';
}
```

## Reading the numbers

**Shannon entropy** $H = -\sum_s p_s \log_2 p_s$ is the minimum average number of bits per symbol that **any** code can achieve for symbols drawn independently with these probabilities. Huffman always satisfies $H \le \text{avg bits} < H + 1$. On the text above it lands within a few hundredths of a bit of $H$.

:::note What real compressors add
A real file format must also store the code table (or the tree) so the decoder can rebuild it. DEFLATE (ZIP, gzip, PNG) first replaces repeated substrings with back-references (**LZ77**), then Huffman-codes the result. *Arithmetic coding* and ANS (used in zstd) get even closer to the entropy than Huffman's whole-bit codes can.
:::

## Extensions

:::exercise Make it your own
1. Write **canonical Huffman codes**: store only the code lengths, then rebuild the codes in sorted order. That's how DEFLATE keeps headers tiny.
2. Make it a real tool: read a file from `stdin`, write a header (lengths + bit count) and the payload, and check the round trip.
3. What happens on **random bytes**? Explain why the output can't get smaller (entropy ≈ 8 bits per byte).
:::

:::keypoints
- Huffman = greedy merging of the two rarest nodes with a min-heap: $O(k \log k)$ to build, $O(n)$ to encode.
- Prefix-free codes = leaves of a binary tree, so decoding is unambiguous.
- Optimal by an exchange argument plus a reduction. Within 1 bit per symbol of Shannon entropy.
- Bit-level work: pack MSB first, track the exact bit count, and handle the single-symbol edge case.
:::
