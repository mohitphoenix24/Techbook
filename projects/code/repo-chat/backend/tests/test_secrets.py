from app.rag.ingest import read_zip
from app.rag.secrets import mask_secrets

from .conftest import make_zip

# region: secrets-tests
KEY = "AKIA" + "ABCDEFGHIJKLMNOP"
SLACK = "xox" + "b-123456789012-" + "abcdefghijklmn"             # assembled at run time: a token-shaped literal in a repository trips secret scanners


def test_known_key_formats_and_assigned_passwords_are_masked():
    text = f'aws = "{KEY}"\nDB_PASSWORD = "hunter2hunter2"\napi_key: \'abcd1234efgh\'\nslack = "{SLACK}"\n'
    masked, found = mask_secrets(text)
    assert found == 4 and KEY not in masked and "hunter2" not in masked and "abcd1234" not in masked and "xoxb-" not in masked
    assert masked.count("[REDACTED]") == 4 and 'DB_PASSWORD = "[REDACTED]"' in masked        # the name stays, so the code still makes sense


def test_a_private_key_block_is_masked_and_the_file_keeps_its_line_count():
    text = "before = 1\n-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA\nabcdefghij\n-----END RSA PRIVATE KEY-----\nafter = 2\n"
    masked, found = mask_secrets(text)
    assert found == 1 and "MIIEow" not in masked
    assert len(masked.splitlines()) == len(text.splitlines()) and masked.splitlines()[0] == "before = 1" and masked.splitlines()[-1] == "after = 2"


def test_references_and_placeholders_are_not_secrets():
    text = 'password = "${DB_PASSWORD}"\ntoken = "changeme"\nsecret = os.environ["SECRET"]\napi_key = "<your key here>"\nPASSWORD_MIN_LENGTH = 12\n'
    assert mask_secrets(text) == (text, 0)


def test_masking_never_changes_how_many_lines_a_file_has():
    text = "\n".join(f'token_{i} = "{"x" * 20}"' for i in range(5))
    masked, _ = mask_secrets(text)
    assert len(masked.splitlines()) == 5


def test_hostile_input_cannot_make_the_scan_slow():
    import time
    hostile = ["password" * 25_000, "-----BEGIN PRIVATE KEY-----\n" * 8_000, 'x = "' + "a" * 150_000, "api_key" + "=" * 100_000, "A" * 200_000]
    for text in hostile:
        started = time.perf_counter()
        mask_secrets(text)
        assert time.perf_counter() - started < 2.0, text[:30]


def test_an_uploaded_repository_is_masked_on_the_way_in_and_the_count_is_reported():
    result = read_zip(make_zip({"config.py": f'KEY = "{KEY}"\nDEBUG = True\n', "ok.py": "x = 1\n"}))
    assert result.masked == 1 and "[REDACTED]" in result.files[0].text and KEY not in result.files[0].text


def test_the_masked_text_is_what_every_later_stage_sees(client):
    import io, zipfile
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as z:
        z.writestr("settings.py", f'STRIPE_KEY = "{KEY}"\n\ndef charge_card(amount):\n    """Charge a card."""\n    return amount\n')
    repo = client.post("/api/repos", files={"file": ("shop.zip", buffer.getvalue(), "application/zip")}).json()
    assert repo["secrets_masked"] == 1
    assert KEY not in "".join(client.get(f"/api/repos/{repo['id']}/file", params={"path": "settings.py"}).json()["lines"])
    assert KEY not in client.post(f"/api/repos/{repo['id']}/ask", json={"question": "Which Stripe key is used?"}).text
# endregion: secrets-tests
