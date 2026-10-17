---
title: Reading a repository safely
level: intermediate
time: 50
summary: A ZIP someone uploads is untrusted input. Refuse paths that escape the folder, ZIP bombs, links and binaries; never write to disk; and mask API keys and private keys before anything is indexed, without changing a single line number. Every attack runs against the real code in your browser.
tags: security, ZIP, path traversal, secrets, input validation, ingestion
---

The first feature of any "upload your project" tool is also its first vulnerability. A ZIP file is a small program that the *sender* wrote, and your server is about to open it. Before a single line is chunked or searched, the ingestion step has to decide what it is willing to read.

## What a hostile ZIP can do

| Attack | How | Without a defence |
|---|---|---|
| **Path traversal** | an entry named `../../etc/cron.d/evil` or `/etc/passwd` | extracting writes outside the folder: files overwritten, code planted |
| **ZIP bomb** | a 3 KB file that expands to 3 GB (a long run of one character compresses to almost nothing) | memory or disk exhausted; the server falls over |
| **Many files** | 500,000 tiny entries | the index and the file list become huge |
| **Symbolic links** | an entry that is a *link* to `/etc/passwd` | a file you never meant to read appears inside the "repository" |
| **Lies about size** | the header says 1 KB, the data is 1 GB | any check that trusts the header is useless |
| **Binary and vendored files** | images, `node_modules`, `.git` | a useless, enormous index |

The defences, in one picture: **read everything into memory, decide with your own limits, and never write the archive to disk.** If nothing is extracted, a path cannot overwrite anything; the worst a hostile path can do is be refused.

## Limits are settings

```python src="repo-chat/backend/app/rag/ingest.py" region="limits" title="backend/app/rag/ingest.py"
```

Each number answers one of the attacks above, and each is a setting (`MAX_ZIP_BYTES`, `MAX_FILES`, `MAX_FILE_BYTES`, `MAX_TOTAL_BYTES`) so an operator can tighten them. `max_total_bytes` is the real defence against a bomb: it counts bytes **actually read**, not bytes the archive claims.

## Clean the path

```python src="repo-chat/backend/app/rag/ingest.py" region="clean-path" title="backend/app/rag/ingest.py"
```

`posixpath.normpath` collapses `a//b/./c` into `a/b/c`. Then the function **refuses** (it does not try to repair) anything absolute, containing `..`, a Windows drive letter (`C:`), a backslash, or a NUL byte. Refusing is safer than rewriting: if an archive contains one unsafe path, it was built to attack you, and the right response is to reject the whole upload, not to quietly keep the other files.

## Read the ZIP

```python src="repo-chat/backend/app/rag/ingest.py" region="read-zip" title="backend/app/rag/ingest.py"
```

Walk through the order of the checks, because order is the design:

1. **The archive's own size** against `max_zip_bytes`, before opening it.
2. **Symbolic links are skipped** (the permission bits in `external_attr` say a link). A link is never followed.
3. **Every path is cleaned first**, so an unsafe name aborts the upload before any content is read.
4. **A wrapping folder is removed.** GitHub's "Download ZIP" puts everything under `repo-main/`, which would otherwise make every citation say `repo-main/src/...`.
5. **Skip what is not source**: hidden and vendored folders, and extensions that are not text. Skipped files are *listed with a reason*, so a person can see what was left out and why.
6. **`handle.read(max_file_bytes + 1)`**: read at most one byte more than allowed, whatever the header claims. If we got that extra byte, the file is too big and is skipped.
7. **Decode as UTF-8 and reject NUL bytes**: a binary file renamed `.py` is skipped.
8. **Count files and total bytes**, with a clear message when the total is exceeded.

## Masking secrets

Repositories are full of things that must not travel: AWS keys, API tokens, private keys, `password = "..."` in a config file. Everything the app indexes can be shown to a model, to anyone who uses the app, and to a log. So secrets are masked **on the way in**:

```python src="repo-chat/backend/app/rag/secrets.py" region="patterns" title="backend/app/rag/secrets.py"
```

```python src="repo-chat/backend/app/rag/secrets.py" region="mask" title="backend/app/rag/secrets.py"
```

Four decisions are worth understanding:

- **Known formats** (an AWS key starts `AKIA`, a GitHub token `ghp_`, an Anthropic key `sk-ant-`) are matched directly: precise, few false alarms.
- **Assignments are matched in two steps.** One simple pattern finds `name = "value"`; then ordinary code asks whether the *name* sounds secret (`password`, `token`, `api_key`). It keeps the name, so the code still reads sensibly: `DB_PASSWORD = "[REDACTED]"`.
- **References and placeholders are left alone**: `"${DB_PASSWORD}"`, `"changeme"`, `os.environ["SECRET"]` are not secrets, and masking them would only make the code harder to read.
- **A masked file keeps its line count.** A private key block spanning five lines becomes five lines of `[REDACTED]`. Citations are line numbers; if masking shifted them, the viewer would show different lines from the ones the model read.

:::warn A regular expression is code that runs on hostile input
The first version of the assignment pattern did the name check *inside* the regex, with nested quantifiers. On a long, crafted line it took minutes: a classic *regular-expression denial of service*. A pattern that guards an upload must never be something an upload can slow down. The fix was structural (a simple, linear pattern, then a plain Python check), and the tests now scan five kinds of hostile text and fail if any takes more than two seconds. The private-key pattern is bounded for the same reason (`{0,6000}`).
:::

## Attack it

This block builds hostile ZIPs in memory and feeds them to the real `read_zip`. Then it masks a file full of secrets. Add your own attacks at the bottom.

```python run src="repo-chat/backend/app/rag/secrets.py,repo-chat/backend/app/rag/ingest.py" flat title="Attack the ingestion" level=advanced
import io, time, zipfile


def make_zip(files, compression=zipfile.ZIP_DEFLATED):
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression) as z:
        for name, content in files.items():
            z.writestr(name, content)
    return buffer.getvalue()


def try_it(label, data, limits=Limits()):
    try:
        result = read_zip(data, limits)
        kept = ", ".join(f.path for f in result.files)
        print(f"{label:<38}KEPT    {kept}" + (f"   (skipped {len(result.skipped)}, masked {result.masked})" if result.skipped or result.masked else ""))
    except RepoError as e:
        print(f"{label:<38}REFUSED {e}")


print("--- hostile archives")
try_it("a normal repository", make_zip({"repo-main/app.py": "x = 1\n", "repo-main/README.md": "# hi"}))
try_it("path traversal", make_zip({"ok.py": "x = 1", "../../etc/cron.d/evil.py": "boom"}))
try_it("an absolute path", make_zip({"/etc/passwd": "root:x:0:0"}))
try_it("a Windows drive path", make_zip({"C:/Windows/win.ini": "[fonts]"}))
try_it("not a zip at all", b"this is not a zip")
try_it("binary and vendored files", make_zip({"app.py": "x = 1", "logo.png": b"\x89PNG\r\n", "node_modules/a/index.js": "var a;", ".git/config": "[core]"}))
try_it("a binary file named .py", make_zip({"fake.py": b"MZ\x00\x00\x03"}))
bomb = make_zip({"big.py": "a" * 3_000_000})
print(f"\n--- a ZIP bomb: {len(bomb):,} bytes on disk, {3_000_000:,} when expanded")
try_it("a 3 MB file (limit 200 KB)", bomb)
many = make_zip({f"f{i}.py": "a" * 150_000 for i in range(30)})
try_it("30 allowed files, too big together", many, Limits(max_total_bytes=1_000_000))
try_it("12 files, limit is 5", make_zip({f"f{i}.py": "x = 1" for i in range(12)}), Limits(max_files=5))

print("\n--- secrets are masked, and the line count never changes")
source = '''import os
AWS_KEY = "AKIAIOSFODNN7EXAMPLE"
DB_PASSWORD = "hunter2hunter2"
DB_HOST = os.environ["DB_HOST"]
token = "${GITHUB_TOKEN}"
-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEAxxxxxxxxxxxx
yyyyyyyyyyyyyyyyyyyyyyyyyyyy
-----END RSA PRIVATE KEY-----
def connect(): return DB_HOST
'''
masked, found = mask_secrets(source)
print(f"found {found} secrets; lines before {len(source.splitlines())}, after {len(masked.splitlines())}\n")
print(masked)

print("--- hostile text cannot make the scan slow")
for name, text in {"200,000 letters (the file limit)": "A" * 200_000, "repeated BEGIN markers": "-----BEGIN PRIVATE KEY-----\n" * 8000, "a quote that never ends": 'x = "' + "a" * 150_000}.items():
    start = time.perf_counter()
    mask_secrets(text)
    print(f"{name:<34}{(time.perf_counter() - start) * 1000:7.0f} ms")
```

Read the results as a security review. The traversal, absolute, drive-letter and non-ZIP uploads are **refused whole**. Binary, vendored and hidden files are **skipped, with reasons**. The bomb is 3,000,000 bytes expanded but the per-file limit makes it a skipped file, and the total limit stops many allowed files adding up. Secrets are masked and the file still has the same number of lines, so line 6 of the viewer is line 6 of what the model read.

## Reading a folder you trust

The built-in sample repository lives on disk, and is trusted, so it takes a simpler path (still skipping what is not source, and still masking):

```python src="repo-chat/backend/app/rag/ingest.py" region="directory" title="backend/app/rag/ingest.py"
```

## Tests

```python src="repo-chat/backend/tests/test_ingest.py" region="ingest-tests" title="backend/tests/test_ingest.py"
```

```python src="repo-chat/backend/tests/test_secrets.py" region="secrets-tests" title="backend/tests/test_secrets.py"
```

Notice that each test is one attack with one expected outcome. When you meet a new way to abuse an upload, it becomes a new test *first*.

:::keypoints
- A ZIP is untrusted input: refuse unsafe paths, bombs, links, binaries and over-limit uploads, and never write it to disk.
- Check what you actually read, not what the archive claims: `read(limit + 1)` and a running total.
- Refuse a whole archive that contains an unsafe path; report what you skipped, and why.
- Mask secrets on the way in, with known formats plus a name check, and leave references and placeholders alone.
- A masked file must keep its line count, because citations are line numbers.
- Regular expressions are code that runs on hostile input: keep them linear and bounded, and test them against hostile text.
:::

```quiz
? Why is the ZIP read into memory and never extracted to disk?
- It is faster
+ If nothing is written, an entry's path cannot overwrite anything; at worst it is refused
- The disk is too small
> Path traversal is only dangerous when you write files. Do not write them.
? A ZIP header says a file is 1 KB, but it expands to 1 GB. What stops it?
- The header check
+ Reading at most max_file_bytes + 1 bytes, whatever the header claims, and counting the total actually read
- Nothing: it is allowed
> Never trust the size the sender declares.
? Why must a masked file keep exactly the same number of lines?
- For tidiness
+ Citations are line numbers: the viewer must show the same line 12 that the model read
- Python requires it
> If masking shifted the lines, every citation after it would point at the wrong code.
```

:::exercise Another secret
Add a pattern for a **database URL with a password** such as `postgres://app:s3cr3tpass@db.example.com/shop`: mask only the password part, so the host stays visible. Write the test first, including a URL without a password (which must be left alone) and a hostile string of 100,000 characters (which must be scanned in under two seconds). Which of the two constraints, correctness or speed, did you have to think harder about?
:::
