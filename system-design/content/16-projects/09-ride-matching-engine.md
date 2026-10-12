---
title: Build a Ride-Matching Engine
level: advanced
time: 60
icon: globe
cover: #0891b2,#a855f7
tags: geospatial index, k-nearest neighbours, assignment problem, simulation, trade-offs
summary: Build the matching core of a ride-hailing service in C++ — a grid index for thousands of moving drivers with O(1) updates and exact k-nearest search verified against brute force, then a one-hour dispatch simulation comparing greedy nearest-driver matching with batched optimal assignment (the Hungarian algorithm) at normal load and at rush hour.
---

The Uber case study described an in-memory geo index and atomic dispatch. Here you build the **matching engine** itself and answer a question real dispatch teams obsess over: should each rider get the nearest driver **immediately**, or should requests be **batched** for a few seconds and matched together to minimise total pickup distance?

:::flow What you'll build
Grid index | 500 m cells, drivers move every few seconds
k-nearest | expanding rings with a provably safe stopping rule
Verification | 1,000 random queries vs brute force
Dispatch sim | one hour, 150 drivers, downtown-heavy demand
Greedy vs batched | nearest-now vs min-cost assignment every N s
:::

## Step 1: a grid index with exact k-nearest

Moving objects need cheap updates, so a uniform **grid** (or H3 hexagons) beats trees here: an update is a hash-map move between two cells. A query scans rings of cells around the rider. The stopping rule: after ring `r`, any unvisited driver is at least `r × cellSize` away, so once the k-th best found is closer than that, the answer is exact.

```cpp run title="Grid index: updates, ring search, checked against brute force"
// Step 1: a grid index for moving drivers — O(1) updates, k-nearest by expanding rings
#include <bits/stdc++.h>
using namespace std;

struct Pt { double x, y; };                             // kilometres in a 20 × 20 km city
double dist(Pt a, Pt b) { return hypot(a.x - b.x, a.y - b.y); }

class GridIndex {
    double cell;
    unordered_map<long long, vector<int>> cells;        // cell id → driver ids
    unordered_map<int, pair<Pt, long long>> where;      // driver → (position, cell)
    long long key(int cx, int cy) const { return (long long)cx << 32 | (unsigned)cy; }
    pair<int, int> cellOf(Pt p) const { return {(int)floor(p.x / cell), (int)floor(p.y / cell)}; }
public:
    explicit GridIndex(double cellKm) : cell(cellKm) {}
    void upsert(int id, Pt p) {
        auto [cx, cy] = cellOf(p);
        long long k = key(cx, cy);
        if (auto it = where.find(id); it != where.end() && it->second.second != k) {   // moved to another cell
            auto& v = cells[it->second.second];
            v.erase(find(v.begin(), v.end(), id));
        }
        if (!where.count(id) || where[id].second != k) cells[k].push_back(id);
        where[id] = {p, k};
    }
    vector<pair<double, int>> nearest(Pt q, int k, int* cellsVisited = nullptr) const {
        auto [cx, cy] = cellOf(q);
        vector<pair<double, int>> found;
        int visited = 0;
        for (int r = 0; r < 50; r++) {
            for (int dx = -r; dx <= r; dx++) for (int dy = -r; dy <= r; dy++) {
                if (max(abs(dx), abs(dy)) != r) continue;              // only the new ring
                visited++;
                if (auto it = cells.find(key(cx + dx, cy + dy)); it != cells.end())
                    for (int id : it->second) found.push_back({dist(q, where.at(id).first), id});
            }
            // stop when the k-th best is closer than anything a further ring could contain
            if ((int)found.size() >= k) {
                nth_element(found.begin(), found.begin() + k - 1, found.end());
                if (found[k - 1].first <= r * cell) break;
            }
        }
        sort(found.begin(), found.end());
        if ((int)found.size() > k) found.resize(k);
        if (cellsVisited) *cellsVisited = visited;
        return found;
    }
};

int main() {
    mt19937 rng(11);
    uniform_real_distribution<double> U(0, 20);
    GridIndex idx(0.5);                                 // 500 m cells
    vector<Pt> pos(5000);
    for (int i = 0; i < 5000; i++) { pos[i] = {U(rng), U(rng)}; idx.upsert(i, pos[i]); }
    for (int step = 0; step < 3; step++)                // drivers move: 15,000 updates, each O(1)
        for (int i = 0; i < 5000; i++) { pos[i].x = clamp(pos[i].x + U(rng) / 40 - 0.25, 0.0, 19.99); pos[i].y = clamp(pos[i].y + U(rng) / 40 - 0.25, 0.0, 19.99); idx.upsert(i, pos[i]); }

    int mismatches = 0, totalVisited = 0;
    for (int t = 0; t < 1000; t++) {                    // verify against brute force
        Pt q{U(rng), U(rng)};
        int visited;
        auto got = idx.nearest(q, 5, &visited);
        totalVisited += visited;
        vector<pair<double, int>> all;
        for (int i = 0; i < 5000; i++) all.push_back({dist(q, pos[i]), i});
        partial_sort(all.begin(), all.begin() + 5, all.end());
        for (int j = 0; j < 5; j++) if (got[j].second != all[j].second) mismatches++;
    }
    Pt q{10, 10};
    cout << "5 nearest to (10, 10):";
    for (auto [d, id] : idx.nearest(q, 5)) cout << " d" << id << "@" << fixed << setprecision(2) << d << "km";
    cout << "\n1,000 random queries: " << mismatches << " differences from brute force, "
         << totalVisited / 1000.0 << " cells visited per query (of 1,600)\n";
}
```

## Step 2: greedy vs batched dispatch

Greedy matching gives each request the nearest idle driver the moment it arrives. **Batching** waits a few seconds, then solves the **assignment problem** for all waiting requests and idle drivers at once (the Hungarian algorithm finds the minimum total pickup distance). Which is better depends on load:

```cpp run title="One hour of dispatch at two demand levels"
// Step 2: a dispatch engine — greedy "nearest driver now" vs batched optimal assignment every few seconds
#include <bits/stdc++.h>
using namespace std;

struct Pt { double x, y; };
double dist(Pt a, Pt b) { return hypot(a.x - b.x, a.y - b.y); }

// Hungarian algorithm (min-cost assignment), rows ≤ cols; returns the column for each row. O(n²m)
vector<int> hungarian(const vector<vector<double>>& a) {
    int n = a.size(), m = a[0].size();
    vector<double> u(n + 1), v(m + 1); vector<int> p(m + 1), way(m + 1);
    for (int i = 1; i <= n; i++) {
        p[0] = i; int j0 = 0;
        vector<double> minv(m + 1, 1e18); vector<bool> used(m + 1, false);
        do {
            used[j0] = true; int i0 = p[j0], j1 = 0; double delta = 1e18;
            for (int j = 1; j <= m; j++) if (!used[j]) {
                double cur = a[i0 - 1][j - 1] - u[i0] - v[j];
                if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
                if (minv[j] < delta) { delta = minv[j]; j1 = j; }
            }
            for (int j = 0; j <= m; j++) if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta;
            j0 = j1;
        } while (p[j0] != 0);
        do { int j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
    }
    vector<int> rowToCol(n);
    for (int j = 1; j <= m; j++) if (p[j]) rowToCol[p[j] - 1] = j - 1;
    return rowToCol;
}

struct Driver { Pt p; double freeAt = 0; };
struct Request { Pt from, to; double t; };

struct Result { double pickupKm = 0, waitS = 0; int n = 0; };

Result simulate(int batchSeconds, double secondsBetweenRequests, unsigned seed) {
    mt19937 rng(seed);
    uniform_real_distribution<double> U(0, 1);
    auto spot = [&]() -> Pt {                           // demand concentrated downtown, drivers everywhere
        if (U(rng) < 0.6) return {4 + U(rng) * 2, 4 + U(rng) * 2};
        return {U(rng) * 10, U(rng) * 10};
    };
    vector<Driver> drivers(150);
    for (auto& d : drivers) d.p = {U(rng) * 10, U(rng) * 10};
    const double SPEED = 0.5;                           // km per minute in city traffic → 120 s per km
    Result res; vector<Request> pending;
    double nextArrival = 0;
    for (double t = 0; t < 3600; t += 1) {
        while (nextArrival <= t) { pending.push_back({spot(), spot(), nextArrival}); nextArrival += -log(U(rng)) * secondsBetweenRequests; }
        if ((int)t % batchSeconds != 0 || pending.empty()) continue;
        vector<int> idle;
        for (int i = 0; i < (int)drivers.size(); i++) if (drivers[i].freeAt <= t) idle.push_back(i);
        if (idle.empty()) continue;
        int n = min(pending.size(), idle.size());
        vector<int> chosen(n);
        if (batchSeconds == 1) {                        // greedy: oldest request first takes the nearest idle driver
            vector<bool> taken(idle.size());
            for (int r = 0; r < n; r++) {
                int best = -1;
                for (int j = 0; j < (int)idle.size(); j++)
                    if (!taken[j] && (best < 0 || dist(pending[r].from, drivers[idle[j]].p) < dist(pending[r].from, drivers[idle[best]].p))) best = j;
                taken[best] = true; chosen[r] = best;
            }
        } else {                                        // batched: minimise the TOTAL pickup distance of the batch
            vector<vector<double>> cost(n, vector<double>(idle.size()));
            for (int r = 0; r < n; r++) for (int j = 0; j < (int)idle.size(); j++) cost[r][j] = dist(pending[r].from, drivers[idle[j]].p);
            chosen = hungarian(cost);
        }
        for (int r = 0; r < n; r++) {
            Driver& d = drivers[idle[chosen[r]]];
            double pickup = dist(pending[r].from, d.p), trip = dist(pending[r].from, pending[r].to);
            res.pickupKm += pickup; res.waitS += (t - pending[r].t) + pickup / SPEED * 60; res.n++;
            d.freeAt = t + (pickup + trip) / SPEED * 60;
            d.p = pending[r].to;
        }
        pending.erase(pending.begin(), pending.begin() + n);
    }
    return res;
}

int main() {
    cout << fixed << setprecision(2);
    for (auto [label, gap] : {pair{"normal evening (a request every 7 s)", 7.0}, pair{"rush hour (a request every 3 s)", 3.0}})
    for (int batch : {1, 2, 5, 10}) {
        if (batch == 1) cout << label << "\n";
        Result r = simulate(batch, gap, 5);
        cout << "  " << (batch == 1 ? "greedy, every 1 s  " : "batched every " + to_string(batch) + " s" + string(batch < 10 ? 2 : 1, ' '))
             << ": " << r.n << " rides, avg pickup " << r.pickupKm / r.n << " km, avg rider wait "
             << setprecision(0) << r.waitS / r.n << " s" << setprecision(2) << "\n";
    }
}
```

At normal load, there are plenty of idle drivers and rarely more than one waiting request: greedy is already near-optimal and batching only adds delay. At **rush hour**, drivers are scarce and requests pile up downtown; greedy wastes drivers on long pickups, while batching cuts the average pickup distance by about 16%, which frees drivers sooner, so it completes more rides and **reduces** waits despite the batching delay. Real systems adapt the batch window to supply and demand.

## How it works

| Piece | Here | In production |
|---|---|---|
| Index | uniform 500 m grid in a hash map | H3 hexagons / S2 cells, sharded by city |
| k-nearest | ring search with an exact stopping rule | the same, then re-ranked by **road ETA** from a routing engine |
| Matching cost | straight-line pickup distance | ETA, driver rating, vehicle type, detour for pooled rides |
| Batch solver | Hungarian algorithm, O(n²m) | min-cost flow or auction algorithms on sparse candidate graphs |
| Driver state | idle until `freeAt` | state machine with offers, timeouts and acceptance (see the Uber case study) |

:::exercise Extend it
1. Restrict each request's candidates to its **10 nearest idle drivers** (from the grid index) and build a sparse cost matrix. How much faster is it, and does quality change?
2. Make the batch window **adaptive**: 1 s when more than 30% of drivers are idle, 10 s when fewer than 5% are.
3. Add **driver rejections**: each offer is declined with probability 15%, and the request goes back to the queue.
4. Reposition idle drivers towards downtown (where demand is) and measure the effect on waits.
5. Replace straight-line distance with travel time on a grid of streets (Manhattan distance with slower downtown speeds).
:::

:::keypoints
- For **moving** objects, a hashed **grid** of cells gives O(1) updates; ring search with a distance bound gives **exact** k-nearest.
- Always verify an index against **brute force** on random queries.
- **Greedy** matching is near-optimal when supply is plentiful; **batched assignment** wins when supply is scarce, because shorter pickups free drivers sooner.
- Match on **ETA** and business costs, not raw distance; adapt the batch window to conditions.
:::
