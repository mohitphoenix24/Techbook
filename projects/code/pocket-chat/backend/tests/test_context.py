from app.context import estimate_tokens, trim_history


def msg(role, text):
    return {"role": role, "content": text}


def test_estimate_is_about_four_chars_per_token():
    assert estimate_tokens("a" * 40) == 10
    assert estimate_tokens("") == 1           # never zero


def test_short_history_is_untouched():
    history = [msg("user", "hi"), msg("assistant", "hello"), msg("user", "how are you?")]
    kept, dropped = trim_history(history, budget=1000)
    assert kept == history and dropped == 0


def test_oldest_messages_are_dropped_first():
    history = [msg("user", "a" * 400), msg("assistant", "b" * 400), msg("user", "c" * 40)]
    kept, dropped = trim_history(history, budget=50)           # 100 + 100 + 10 tokens; only the last fits
    assert [m["content"][0] for m in kept] == ["c"] and dropped == 2


def test_result_never_starts_with_an_assistant_message():
    history = [msg("user", "a" * 400), msg("assistant", "b" * 40), msg("user", "c" * 40)]
    kept, _ = trim_history(history, budget=25)                 # fits b (10) + c (10) but b would lead
    assert kept[0]["role"] == "user" and kept[-1]["content"].startswith("c")


def test_newest_message_is_kept_even_when_it_alone_is_too_big():
    kept, dropped = trim_history([msg("user", "x" * 4000)], budget=10)
    assert len(kept) == 1 and dropped == 0
