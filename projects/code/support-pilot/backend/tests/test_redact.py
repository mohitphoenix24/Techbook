import pytest

from app.redact import find_personal_data, luhn_ok, redact


# region: redact-tests
def test_each_kind_of_personal_data_is_replaced_by_a_placeholder():
    text = "Call 98765 43210 or mail asha.verma@example.com. UPI: asha@oksbi. Card 4111 1111 1111 1111. Aadhaar 2345 6789 0123."
    result = redact(text)
    assert result.text == "Call [PHONE_1] or mail [EMAIL_1]. UPI: [UPI_1]. Card [CARD_1]. Aadhaar [AADHAAR_1]."
    assert result.counts() == {"PHONE": 1, "EMAIL": 1, "UPI": 1, "CARD": 1, "AADHAAR": 1}


def test_the_same_value_gets_the_same_placeholder_and_different_values_get_new_ones():
    result = redact("a@x.com wrote, a@x.com again, then b@x.com")
    assert result.text == "[EMAIL_1] wrote, [EMAIL_1] again, then [EMAIL_2]"
    assert [i.original for i in result.items] == ["a@x.com", "b@x.com"]


def test_a_card_is_masked_whole_before_shorter_patterns_can_bite_pieces_out_of_it():
    assert redact("my card is 4111-1111-1111-1111 ok").text == "my card is [CARD_1] ok"


def test_ordinary_long_numbers_are_not_cards_but_order_numbers_survive():
    text = "Tracking 1234567890123456 and order AUR-1001"
    assert luhn_ok("4111111111111111") and not luhn_ok("1234567890123456")
    assert redact(text).text == text


@pytest.mark.parametrize("phone", ["9876543210", "+91 98765 43210", "098765-43210", "+91-9876543210"])
def test_indian_phone_formats(phone):
    assert redact(f"call {phone} now").text == "call [PHONE_1] now"


def test_text_without_personal_data_is_unchanged():
    assert redact("My order AUR-1004 is late, please help.").items == []
# endregion: redact-tests


def test_hostile_text_of_the_largest_allowed_size_is_still_scanned_quickly():
    import time
    for text in ("a@" + "a." * 2000 + "!", "1 " * 2000, "a.b@" * 1000, "+91 " * 1000):            # 4,000 characters: the API's limit for a ticket
        started = time.perf_counter()
        redact(text)
        find_personal_data(text)
        assert time.perf_counter() - started < 1.0


def test_the_leak_detector_finds_what_is_left():
    assert find_personal_data("Reach me on 98765 43210 or a@b.com") == ["EMAIL", "PHONE"]
    assert find_personal_data("Your order AUR-1001 ships soon.") == []
    assert find_personal_data(redact("a@b.com 98765 43210").text) == []
