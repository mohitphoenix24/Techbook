"""A calculator the model can use, instead of doing arithmetic in its head. It reads the expression with Python's `ast` module
and allows only numbers, + - * / // % **, brackets and a few functions. It never calls eval(), so "__import__('os')" is just an error."""
import ast
import math
import operator

MAX_LENGTH = 200
MAX_EXPONENT = 1000


class CalcError(Exception):
    """The expression was not valid arithmetic. The message is written for the model to read."""


# region: allowed
BINARY = {ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul, ast.Div: operator.truediv,
          ast.FloorDiv: operator.floordiv, ast.Mod: operator.mod, ast.Pow: operator.pow}
UNARY = {ast.UAdd: operator.pos, ast.USub: operator.neg}
FUNCTIONS = {"sqrt": math.sqrt, "abs": abs, "round": round, "min": min, "max": max}
# endregion: allowed


# region: evaluate
def _eval(node: ast.AST) -> float:
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)) and not isinstance(node.value, bool):
        return node.value
    if isinstance(node, ast.BinOp) and type(node.op) in BINARY:
        left, right = _eval(node.left), _eval(node.right)
        if isinstance(node.op, ast.Pow) and abs(right) > MAX_EXPONENT:
            raise CalcError(f"The exponent {right} is too large (the limit is {MAX_EXPONENT}).")
        try:
            return BINARY[type(node.op)](left, right)
        except ZeroDivisionError:
            raise CalcError("Division by zero.") from None
        except OverflowError:
            raise CalcError("The result is too large to represent.") from None
    if isinstance(node, ast.UnaryOp) and type(node.op) in UNARY:
        return UNARY[type(node.op)](_eval(node.operand))
    if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id in FUNCTIONS and not node.keywords:
        try:
            return FUNCTIONS[node.func.id](*[_eval(a) for a in node.args])
        except OverflowError:
            raise CalcError(f"{node.func.id}() was given a number that is too large.") from None
        except (ValueError, TypeError) as exc:
            raise CalcError(f"{node.func.id}() could not be applied: {exc}") from None
    raise CalcError("Only numbers, + - * / // % **, brackets and sqrt, abs, round, min, max are allowed.")


def calculate(expression: str) -> float:
    if len(expression) > MAX_LENGTH:
        raise CalcError(f"The expression is too long (the limit is {MAX_LENGTH} characters).")
    try:
        tree = ast.parse(expression.strip(), mode="eval")
    except (SyntaxError, ValueError, RecursionError, MemoryError):
        raise CalcError("That is not a valid arithmetic expression. Write it like 240000 * 0.15 / 12, with no commas inside numbers.") from None
    return _eval(tree.body)


def show(value: float) -> str:
    """A tidy string: whole numbers without '.0', everything else to 10 significant digits."""
    if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
        raise CalcError("The result is not a finite number.")
    if float(value).is_integer() and abs(value) < 1e15:
        return str(int(value))
    return f"{value:.10g}"
# endregion: evaluate
