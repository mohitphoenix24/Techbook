import pytest

from app.calc import CalcError, calculate, show


@pytest.mark.parametrize("expr,expected", [
    ("2 + 3 * 4", 14), ("(2 + 3) * 4", 20), ("240000 * 0.15 / 12", 3000), ("10 / 4", 2.5), ("10 // 4", 2), ("10 % 4", 2),
    ("2 ** 10", 1024), ("-5 + 8", 3), ("+7", 7), ("sqrt(144)", 12), ("abs(-3.5)", 3.5), ("round(3.14159, 2)", 3.14), ("max(3, 9, 4)", 9), ("min(3, 9, 4)", 3),
    ("  1 + 1  ", 2), ("1e3 + 1", 1001), ("100 * (1 + 0.07) ** 3", pytest.approx(122.5043)),
])
def test_arithmetic(expr, expected):
    assert calculate(expr) == expected


# region: refusals
@pytest.mark.parametrize("expr", [
    "__import__('os').system('echo hi')", "open('/etc/passwd').read()", "x + 1", "print(1)", "eval('1')", "(1).__class__", "[1, 2][0]", "'a' * 3",
    "lambda: 1", "1 if True else 2", "True + 1", "1 < 2", "sqrt(1, key=2)", "abs.__call__(1)", "max(*[1, 2])", "1; 2", "",
])
def test_anything_but_arithmetic_is_refused(expr):
    with pytest.raises(CalcError):
        calculate(expr)


def test_nothing_runs_while_refusing(tmp_path):
    target = tmp_path / "pwned"
    with pytest.raises(CalcError):
        calculate(f"__import__('pathlib').Path({str(target)!r}).touch()")
    assert not target.exists()
# endregion: refusals


# region: limits
def test_runaway_expressions_are_stopped():
    with pytest.raises(CalcError, match="too large"):
        calculate("9 ** 9 ** 9")
    with pytest.raises(CalcError, match="exponent"):
        calculate("2 ** 100000")
    with pytest.raises(CalcError, match="too long"):
        calculate("1+" * 150 + "1")
    with pytest.raises(CalcError, match="Division by zero"):
        calculate("1 / 0")
    with pytest.raises(CalcError, match="Division by zero"):
        calculate("5 % 0")
    with pytest.raises(CalcError, match="sqrt"):
        calculate("sqrt(-1)")
    with pytest.raises(CalcError, match="too large"):
        calculate("sqrt(9 ** 999)")                                    # an int too big for a float: OverflowError inside sqrt
    assert calculate("1+(" * 40 + "1" + ")" * 40) == 41                 # deep nesting inside the length limit is fine...
    with pytest.raises(CalcError, match="too long"):
        calculate("1+(" * 80 + "1" + ")" * 80)                         # ...and the length limit bounds how deep the recursion can ever go
# endregion: limits


def test_a_comma_inside_a_number_is_an_error_not_a_different_number():
    with pytest.raises(CalcError):
        calculate("2,40,000 * 2")
    assert calculate("max(1,2)") == 2                                  # but commas between arguments are fine


def test_show():
    assert show(3000.0) == "3000" and show(2.5) == "2.5" and show(1 / 3) == "0.3333333333" and show(122.504300000001) == "122.5043"
    assert show(1e20) == "1e+20"
    with pytest.raises(CalcError):
        show(float("inf"))
