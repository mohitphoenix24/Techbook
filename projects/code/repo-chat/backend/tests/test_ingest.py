import io
import zipfile

import pytest

from app.rag.ingest import Limits, RepoError, clean_path, read_zip

from .conftest import make_zip


# region: ingest-tests
@pytest.mark.parametrize("bad", ["../secret.txt", "a/../../etc/passwd", "/etc/passwd", "C:/Windows/win.ini", "dir\\file.py", "a\x00b.py", "."])
def test_unsafe_paths_are_refused(bad):
    with pytest.raises(RepoError):
        clean_path(bad)


def test_safe_paths_are_normalised():
    assert clean_path("a//b/./c.py") == "a/b/c.py"


def test_a_zip_with_one_unsafe_path_is_refused_whole():
    with pytest.raises(RepoError, match="Unsafe"):
        read_zip(make_zip({"ok.py": "x = 1", "../evil.py": "boom"}))


def test_only_source_files_are_kept_and_the_rest_is_reported():
    result = read_zip(make_zip({"app.py": "x = 1\n", "logo.png": b"\x89PNG\r\n", "node_modules/lib/index.js": "var a;", ".git/config": "[core]", "notes.txt": "hello"}))
    assert [f.path for f in result.files] == ["app.py", "notes.txt"]
    assert {path for path, _ in result.skipped} == {"logo.png", "node_modules/lib/index.js", ".git/config"}


def test_the_wrapping_folder_of_a_github_zip_is_removed():
    result = read_zip(make_zip({"repo-main/src/a.py": "a = 1", "repo-main/README.md": "# hi"}))
    assert [f.path for f in result.files] == ["README.md", "src/a.py"]


def test_a_file_that_is_not_utf8_or_contains_nul_bytes_is_skipped():
    result = read_zip(make_zip({"ok.py": "x = 1", "latin.py": "caf\xe9".encode("latin-1"), "bin.py": b"a\x00b"}))
    assert [f.path for f in result.files] == ["ok.py"] and {w for _, w in result.skipped} == {"not UTF-8 text", "binary content"}


def test_a_zip_bomb_cannot_expand_past_the_limits():
    huge = "a" * 3_000_000                                              # 3 MB of text that compresses to about 3 KB
    data = make_zip({"big.py": huge})
    assert len(data) < 10_000
    with pytest.raises(RepoError, match="No readable"):
        read_zip(data, Limits(max_file_bytes=200_000))                  # the one file is over the per-file limit: skipped, nothing left
    many = make_zip({f"f{i}.py": "a" * 150_000 for i in range(30)})     # each file is allowed, together they are not
    with pytest.raises(RepoError, match="add up to more than"):
        read_zip(many, Limits(max_total_bytes=1_000_000))


def test_too_many_files_are_skipped_not_crashed_on():
    result = read_zip(make_zip({f"f{i}.py": "x = 1" for i in range(10)}), Limits(max_files=4))
    assert len(result.files) == 4 and len(result.skipped) == 6


def test_an_oversized_or_invalid_upload_is_refused():
    with pytest.raises(RepoError, match="too large"):
        read_zip(b"x" * 600, Limits(max_zip_bytes=500))
    with pytest.raises(RepoError, match="not a valid ZIP"):
        read_zip(b"this is not a zip")


def test_symbolic_links_are_never_followed():
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as z:
        link = zipfile.ZipInfo("link.py")
        link.external_attr = (0o120777 << 16)                           # a symlink pointing at /etc/passwd
        z.writestr(link, "/etc/passwd")
        z.writestr("real.py", "x = 1")
    assert [f.path for f in read_zip(buffer.getvalue()).files] == ["real.py"]
# endregion: ingest-tests
