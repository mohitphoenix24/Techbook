---
title: A calculator you can trust
level: easy
time: 40
summary: Models slip on arithmetic, so give them a calculator. The obvious way to build one (eval) hands a stranger your computer. How Python's ast module lets you accept numbers and operators and nothing else, how the limits stop runaway sums, and a long list of attacks that all fail. Runs in your browser.
tags: client tool, ast, eval, code injection, calculator, safe parsing, resource limits
---

Language models are good at reasoning and unreliable at arithmetic. Ask one for 7.4 x 1.1 and you will usually get 8.14, but ask for a chain of percentages over big numbers and it may be confidently off in the last digits. For a research agent that reports figures from sources, that is unacceptable. So: **give it a calculator**, and tell it (the prompt does) to use it for every sum.

The calculator is the project's one **client tool**: Claude asks, our code runs it. And it holds the most dangerous mistake in this whole course.

## The tempting, terrible way

```python
result = eval(expression)          # NEVER do this with text that came from a model
```

`eval` runs Python code. If the "expression" is `__import__('os').system('rm -rf ~')`, it runs that. A model can be tricked into sending exactly such a string by something it read on a web page, which is the worst possible place to take instructions from. **Any `eval`, `exec` or shell call on model-controlled text is remote code execution waiting to be found.**

## The safe way: read it, do not run it

Python's `ast` module *parses* an expression into a tree of nodes **without running it**. You then walk the tree yourself and accept only the node types you understand. Anything else is an error.

```python src="research-buddy/backend/app/calc.py" region="allowed" title="backend/app/calc.py"
```

```python src="research-buddy/backend/app/calc.py" region="evaluate" title="backend/app/calc.py"
```

This is an **allow-list**:

- A **number** (`int` or `float`, and explicitly *not* `True`/`False`, which Python counts as numbers).
- A **binary operation** with one of seven operators.
- A **unary** plus or minus.
- A **call** to one of five named functions (`sqrt`, `abs`, `round`, `min`, `max`), with no keyword arguments.

Everything else (a name like `x`, an attribute like `(1).__class__`, a string, a list, a lambda, an `if`, a comparison, a call to anything not on the list) falls to the last line and raises `CalcError`. There is no way to reach `__import__`, because there is no node type that lets you name it.

**Limits** keep a harmless-looking expression from becoming an attack of its own:

- The expression may be at most 200 characters.
- An exponent above 1,000 is refused (`9 ** 9 ** 9` would otherwise try to build a number with hundreds of millions of digits and freeze the server).
- Division by zero, overflow, and `sqrt` of a negative number or an enormous integer each become a clear `CalcError`, never a crash.
- The length limit also bounds how deep an expression can nest, so the recursive walk can never run out of stack.

## The tool around it

```python src="research-buddy/backend/app/tools.py" region="toolbox" title="backend/app/tools.py"
```

`run_client_tool` follows the pattern from the other projects: validate the input with Pydantic, run, and turn every failure into a message the model can read ("Division by zero.", "Only numbers, + - * / // % **, brackets and sqrt, abs, round, min, max are allowed."). The result is `"240000 * 0.15 / 12 = 3000"`: it repeats the expression, so the model can see exactly what was computed. A last-resort `except Exception` makes sure a bug never takes the agent down.

## Attack it

This block runs the real calculator. The first part is arithmetic it should do correctly. The second is a list of attacks, every one of which must be refused. The third checks that a refused attack did not run anything.

```python run src="research-buddy/backend/app/calc.py" title="The calculator, and everything it refuses" level=easy
good = ["2 + 3 * 4", "240000 * 0.15 / 12", "(100 + 7.5) / 2", "2 ** 10", "sqrt(144) + abs(-3)", "round(10 / 3, 2)", "max(3, 9, 4)", "17 % 5", "-5 + 8"]
print("arithmetic:")
for e in good:
    print(f"   {e:<22} = {show(calculate(e))}")

attacks = [
    "__import__('os').system('echo pwned')", "open('/etc/passwd').read()", "(1).__class__.__mro__", "exec('x = 1')", "eval('1')",
    "lambda: 1", "[1, 2][0]", "'a' * 3", "x + 1", "1 if True else 2", "1 < 2", "True + 1", "print(1)", "sqrt(1, key=2)", "max(*[1, 2])",
    "9 ** 9 ** 9", "2 ** 100000", "1 / 0", "sqrt(-1)", "1+" * 150 + "1", "(" * 150 + "1" + ")" * 150,
]
print("\nattacks and mistakes:")
for e in attacks:
    shown = e if len(e) < 38 else e[:20] + "...(%d chars)" % len(e)
    try:
        calculate(e)
        print(f"   {shown:<40} RAN  <-- a hole")
    except CalcError as exc:
        print(f"   {shown:<40} refused: {str(exc)[:46]}")

print("\nnothing was executed:", "pwned" not in globals())
```

```output
arithmetic:
   2 + 3 * 4              = 14
   240000 * 0.15 / 12     = 3000
   (100 + 7.5) / 2        = 53.75
   2 ** 10                = 1024
   sqrt(144) + abs(-3)    = 15
   round(10 / 3, 2)       = 3.33
   max(3, 9, 4)           = 9
   17 % 5                 = 2
   -5 + 8                 = 3

attacks and mistakes:
   __import__('os').system('echo pwned')    refused: Only numbers, + - * / // % **, brackets and sq
   open('/etc/passwd').read()               refused: Only numbers, + - * / // % **, brackets and sq
   (1).__class__.__mro__                    refused: Only numbers, + - * / // % **, brackets and sq
   exec('x = 1')                            refused: Only numbers, + - * / // % **, brackets and sq
   eval('1')                                refused: Only numbers, + - * / // % **, brackets and sq
   lambda: 1                                refused: Only numbers, + - * / // % **, brackets and sq
   [1, 2][0]                                refused: Only numbers, + - * / // % **, brackets and sq
   'a' * 3                                  refused: Only numbers, + - * / // % **, brackets and sq
   x + 1                                    refused: Only numbers, + - * / // % **, brackets and sq
   1 if True else 2                         refused: Only numbers, + - * / // % **, brackets and sq
   1 < 2                                    refused: Only numbers, + - * / // % **, brackets and sq
   True + 1                                 refused: Only numbers, + - * / // % **, brackets and sq
   print(1)                                 refused: Only numbers, + - * / // % **, brackets and sq
   sqrt(1, key=2)                           refused: Only numbers, + - * / // % **, brackets and sq
   max(*[1, 2])                             refused: Only numbers, + - * / // % **, brackets and sq
   9 ** 9 ** 9                              refused: The exponent 387420489 is too large (the limit
   2 ** 100000                              refused: The exponent 100000 is too large (the limit is
   1 / 0                                    refused: Division by zero.
   sqrt(-1)                                 refused: sqrt() could not be applied: math domain error
   1+1+1+1+1+1+1+1+1+1+...(301 chars)       refused: The expression is too long (the limit is 200 c
   ((((((((((((((((((((...(301 chars)       refused: The expression is too long (the limit is 200 c

nothing was executed: True
```

Every attack is refused with a short, honest reason. A model that sends `x + 1` gets "Only numbers, ..." and tries again with a number, which is what you want.

## The tests

```python src="research-buddy/backend/tests/test_calc.py" region="refusals" title="backend/tests/test_calc.py"
```

```python src="research-buddy/backend/tests/test_calc.py" region="limits" title="backend/tests/test_calc.py"
```

`test_nothing_runs_while_refusing` goes one step beyond "it raises an error". It tries to make the calculator *create a file* (`Path(...).touch()`) and then checks the file does not exist. A safety test should check the **harm did not happen**, not merely that an error was reported.

:::note Is ast enough?
For arithmetic with an allow-list, yes: you are not running Python, you are walking a tree and calling `operator.add` and friends yourself. Be wary of the moment you add a function to the allow-list. `sqrt` is safe; a function that opens files, sleeps or loops is not. Add functions one at a time, with a test for each. If you ever need *real* code execution (data analysis, plotting), do not build it by hand: use a sandbox that is designed for it, such as Anthropic's code execution tool, which runs in an isolated container on their side.
:::

:::keypoints
- Models are unreliable at arithmetic; give them a calculator, and tell them to use it.
- Never `eval` text that came from a model: it is remote code execution. Parse with `ast` and **allow-list** the node types and functions you accept.
- Add limits (length, exponent size, nesting) so a harmless-looking expression cannot be an attack.
- Turn every refusal into a message the model can act on.
- Test the harm did not happen, not just that an error was raised.
:::

```quiz
? Why is `eval(expression)` dangerous when the expression came from a model?
- It is slow
+ It runs any Python code, and a model can be tricked into sending hostile code
- It only handles integers
> Never evaluate model-controlled text.
? What does an allow-list calculator accept?
- Everything except a list of bad words
+ Only the node types and functions you explicitly allowed; anything else is an error
- Anything that parses
> Describe the few acceptable things, not the many dangerous ones.
? Why limit the exponent to 1,000?
- Python cannot do larger powers
+ `9 ** 9 ** 9` would try to build an enormous number and freeze the server
- To keep answers short
> Resource limits turn a denial-of-service into a clear error.
```

:::exercise Add a function
Add `log10` to the allow-list. Before you do, write the tests: `log10(1000)` is 3, `log10(0)` and `log10(-1)` must give a clear `CalcError` (hint: Python raises `ValueError`), and `log10` of a huge integer must not crash. Then say what you would check before allowing a function like `factorial`, and why.
:::
