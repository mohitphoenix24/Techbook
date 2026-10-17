"""A small, believable online shop, generated the same way every time.

Pure standard library (random + sqlite3), so lessons can build it in your browser. The data is seeded: the same
seed always gives the same shop, which is what makes the tests and the evals possible.
"""
# region: imports
import random
import sqlite3
from datetime import date, timedelta
# endregion: imports

# region: schema
SCHEMA = """
CREATE TABLE customers (
    id        INTEGER PRIMARY KEY,
    name      TEXT NOT NULL,
    email     TEXT NOT NULL,
    city      TEXT NOT NULL,
    country   TEXT NOT NULL,
    joined_on TEXT NOT NULL              -- YYYY-MM-DD
);
CREATE TABLE products (
    id       INTEGER PRIMARY KEY,
    name     TEXT NOT NULL,
    category TEXT NOT NULL,              -- Electronics, Home, Books, Fitness, Beauty
    price    REAL NOT NULL,              -- rupees
    stock    INTEGER NOT NULL
);
CREATE TABLE orders (
    id          INTEGER PRIMARY KEY,
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    ordered_on  TEXT NOT NULL,           -- YYYY-MM-DD
    status      TEXT NOT NULL,           -- delivered, shipped, cancelled, returned
    channel     TEXT NOT NULL            -- web, app, store
);
CREATE TABLE order_items (
    id         INTEGER PRIMARY KEY,
    order_id   INTEGER NOT NULL REFERENCES orders(id),
    product_id INTEGER NOT NULL REFERENCES products(id),
    quantity   INTEGER NOT NULL,
    unit_price REAL NOT NULL             -- rupees, the price at the time of the order
);
"""

# What each table means, and the business rules a question can hinge on. The model is told these.
DESCRIPTIONS = {
    "customers": "One row per customer.",
    "products": "The catalogue. price is in rupees.",
    "orders": "One row per order. Revenue only counts orders whose status is 'delivered' or 'shipped'; 'cancelled' and 'returned' orders earned nothing.",
    "order_items": "The lines of an order. A line's value is quantity * unit_price.",
}
# endregion: schema

# region: data
FIRST = ["Aarav", "Diya", "Vihaan", "Ananya", "Aditya", "Isha", "Arjun", "Meera", "Kabir", "Saanvi", "Rohan", "Priya", "Neha", "Karan",
         "Tara", "Imran", "Zoya", "Sofia", "Liam", "Emma", "Noah", "Olivia"]
LAST = ["Sharma", "Patel", "Iyer", "Reddy", "Nair", "Gupta", "Mehta", "Khan", "Das", "Joshi", "Kulkarni", "Singh", "Bose", "Rao", "Shah", "Smith"]
CITIES = [("Mumbai", "India", 14), ("Delhi", "India", 12), ("Bengaluru", "India", 14), ("Pune", "India", 8), ("Chennai", "India", 6),
          ("Hyderabad", "India", 6), ("Kolkata", "India", 4), ("Dubai", "UAE", 4), ("Singapore", "Singapore", 3), ("London", "UK", 3), ("New York", "USA", 2)]
PRODUCTS = [
    ("Wireless Earbuds Pro", "Electronics", 4999), ("Smart Watch S2", "Electronics", 8999), ("Bluetooth Speaker", "Electronics", 2499),
    ("Power Bank 20000mAh", "Electronics", 1799), ("USB-C Hub", "Electronics", 1299), ("Noise-Cancelling Headphones", "Electronics", 12999),
    ("Air Fryer 4L", "Home", 6499), ("Cotton Bedsheet Set", "Home", 1899), ("LED Desk Lamp", "Home", 1199), ("Steel Water Bottle", "Home", 699),
    ("Non-stick Cookware Set", "Home", 3999), ("Python Programming Handbook", "Books", 799), ("Data Structures Illustrated", "Books", 649),
    ("The Pragmatic Engineer", "Books", 899), ("Atlas of World History", "Books", 1299), ("Yoga Mat Pro", "Fitness", 1499),
    ("Adjustable Dumbbells", "Fitness", 5499), ("Resistance Band Set", "Fitness", 599), ("Running Shoes Flex", "Fitness", 3499),
    ("Fitness Tracker Band", "Fitness", 2299), ("Vitamin C Serum", "Beauty", 899), ("Herbal Shampoo", "Beauty", 449),
    ("Sunscreen SPF 50", "Beauty", 549), ("Beard Grooming Kit", "Beauty", 1199),
]
START = date(2025, 11, 1)                          # twelve months of orders: Nov 2025 to Oct 2026
MONTH_WEIGHT = [1.3, 1.1, 0.8, 0.8, 0.9, 0.9, 1.0, 1.0, 1.1, 1.0, 1.0, 1.4]       # a festive peak at both ends
# endregion: data


# region: build
def build_database(conn: sqlite3.Connection, seed: int = 42, customers: int = 60, orders: int = 420) -> None:
    """Create the tables and fill them. Same seed, same shop."""
    rng = random.Random(seed)
    conn.executescript(SCHEMA)

    cities = [(c, k) for c, k, w in CITIES for _ in range(w)]
    for cid in range(1, customers + 1):
        name = f"{rng.choice(FIRST)} {rng.choice(LAST)}"
        city, country = rng.choice(cities)
        joined = START - timedelta(days=rng.randrange(30, 700))
        conn.execute("INSERT INTO customers VALUES (?, ?, ?, ?, ?, ?)",
                     (cid, name, f"{name.lower().replace(' ', '.')}{cid}@example.com", city, country, joined.isoformat()))

    for pid, (name, category, price) in enumerate(PRODUCTS, start=1):
        conn.execute("INSERT INTO products VALUES (?, ?, ?, ?, ?)", (pid, name, category, price, rng.randrange(0, 300)))

    # a few customers order far more than the rest, as in a real shop
    weights = [3.0 if cid % 9 == 0 else 1.0 for cid in range(1, customers + 1)]
    month_starts = [date(START.year + (START.month - 1 + m) // 12, (START.month - 1 + m) % 12 + 1, 1) for m in range(12)]
    item_id = 1
    for oid in range(1, orders + 1):
        month = rng.choices(range(12), MONTH_WEIGHT)[0]
        ordered = month_starts[month] + timedelta(days=rng.randrange(0, 28))
        status = rng.choices(["delivered", "shipped", "cancelled", "returned"], [78, 6, 9, 7])[0]
        if ordered > date(2026, 10, 12):                                   # the data ends in mid-October 2026
            ordered, status = date(2026, 10, 12) - timedelta(days=rng.randrange(0, 12)), rng.choice(["shipped", "delivered"])
        conn.execute("INSERT INTO orders VALUES (?, ?, ?, ?, ?)",
                     (oid, rng.choices(range(1, customers + 1), weights)[0], ordered.isoformat(), status, rng.choices(["web", "app", "store"], [50, 35, 15])[0]))
        for pid in rng.sample(range(1, len(PRODUCTS) + 1), rng.choice([1, 1, 2, 2, 3, 4])):
            conn.execute("INSERT INTO order_items VALUES (?, ?, ?, ?, ?)", (item_id, oid, pid, rng.choice([1, 1, 1, 2, 3]), PRODUCTS[pid - 1][2]))
            item_id += 1
    conn.commit()
# endregion: build
