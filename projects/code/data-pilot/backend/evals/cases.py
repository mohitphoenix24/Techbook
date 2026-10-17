"""Golden questions for the data agent: a question and a SQL query that a careful analyst would write.

The agent is judged by EXECUTION: we run the golden query, run whatever query the agent used last, and compare the
RESULTS. Two differently-written queries that return the same rows are both right. Writing the SQL out in different
style from the agent's (subqueries instead of joins) is a feature: it checks the meaning, not the spelling.
"""

# region: cases
PAID = "status IN ('delivered', 'shipped')"

CASES: list[dict] = [
    {"id": "top-3-customers", "question": "Who are the top 3 customers by revenue?", "ordered": True,
     "golden": f"SELECT name, city, ROUND(revenue) AS revenue FROM (SELECT c.name AS name, c.city AS city, (SELECT SUM(i.quantity * i.unit_price) FROM orders o JOIN order_items i ON i.order_id = o.id "
               f"WHERE o.customer_id = c.id AND o.{PAID}) AS revenue FROM customers c) WHERE revenue IS NOT NULL ORDER BY revenue DESC LIMIT 3"},
    {"id": "revenue-by-month", "question": "Show revenue by month", "ordered": True,
     "golden": f"SELECT substr(ordered_on, 1, 7) AS month, ROUND((SELECT SUM(quantity * unit_price) FROM order_items WHERE order_id IN (SELECT id FROM orders o2 WHERE substr(o2.ordered_on, 1, 7) = substr(o.ordered_on, 1, 7) AND o2.{PAID}))) AS revenue FROM orders o GROUP BY month ORDER BY month"},
    {"id": "orders-by-status", "question": "How many orders are there by status?", "ordered": False,
     "golden": "SELECT status, COUNT(1) AS orders FROM orders GROUP BY status"},
    {"id": "best-sellers", "question": "What are the 5 best selling products?", "ordered": True,
     "golden": f"SELECT name, category, (SELECT SUM(i.quantity) FROM order_items i JOIN orders o ON o.id = i.order_id WHERE i.product_id = p.id AND o.{PAID}) AS units FROM products p ORDER BY units DESC LIMIT 5"},
    {"id": "revenue-by-category", "question": "Revenue per category", "ordered": True,
     "golden": f"SELECT category, ROUND(SUM(rev)) AS revenue FROM (SELECT p.category AS category, i.quantity * i.unit_price AS rev FROM order_items i JOIN products p ON p.id = i.product_id WHERE i.order_id IN (SELECT id FROM orders WHERE {PAID})) GROUP BY category ORDER BY revenue DESC"},
    {"id": "total-revenue", "question": "What is our total revenue?", "ordered": False,
     "golden": f"SELECT ROUND(SUM(quantity * unit_price)) AS revenue, (SELECT COUNT(*) FROM orders WHERE {PAID}) AS orders FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE {PAID})"},
    {"id": "cancel-rate", "question": "What is the cancellation rate?", "ordered": False,
     "golden": "SELECT ROUND(100.0 * (SELECT COUNT(*) FROM orders WHERE status = 'cancelled') / (SELECT COUNT(*) FROM orders), 1) AS cancelled_pct, ROUND(100.0 * (SELECT COUNT(*) FROM orders WHERE status = 'returned') / (SELECT COUNT(*) FROM orders), 1) AS returned_pct"},
    {"id": "customers-by-city", "question": "How many customers do we have in each city?", "ordered": False,
     "golden": "SELECT city, COUNT(*) AS customers FROM customers GROUP BY city"},
    {"id": "low-stock", "question": "Which products are low on stock?", "ordered": True,
     "golden": "SELECT name, category, stock FROM products WHERE stock < 20 ORDER BY stock, name LIMIT 10"},
    {"id": "count-cancelled", "question": "how many cancelled orders are there", "ordered": False,
     "golden": "SELECT COUNT(*) FROM orders WHERE status = 'cancelled'"},

    # Harder questions. The template-based offline model is expected to fail these; a real model should manage them.
    {"id": "city-aov", "question": "Which city has the highest average order value?", "ordered": True,
     "golden": f"SELECT c.city, ROUND(SUM(i.quantity * i.unit_price) / COUNT(DISTINCT o.id)) AS aov FROM customers c JOIN orders o ON o.customer_id = c.id JOIN order_items i ON i.order_id = o.id WHERE o.{PAID} GROUP BY c.city ORDER BY aov DESC LIMIT 1"},
    {"id": "joined-2025", "question": "How many customers joined in 2025?", "ordered": False,
     "golden": "SELECT COUNT(*) FROM customers WHERE joined_on >= '2025-01-01'"},
    {"id": "repeat-buyers", "question": "How many customers placed more than 5 orders?", "ordered": False,
     "golden": f"SELECT COUNT(*) FROM (SELECT customer_id FROM orders WHERE {PAID} GROUP BY customer_id HAVING COUNT(*) > 5)"},
    {"id": "returns-by-category", "question": "Which category has the most returned items?", "ordered": True,
     "golden": "SELECT p.category, SUM(i.quantity) AS units FROM order_items i JOIN orders o ON o.id = i.order_id JOIN products p ON p.id = i.product_id WHERE o.status = 'returned' GROUP BY p.category ORDER BY units DESC LIMIT 1"},
]
# endregion: cases
