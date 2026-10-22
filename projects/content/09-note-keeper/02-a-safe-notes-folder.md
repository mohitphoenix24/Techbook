---
title: A safe notes folder
level: easy
time: 40
summary: Turn a note name into a file without ever letting the agent touch a path. A strict name rule, a refusal of symlinks, a check that the real location is the folder, and limits on size and count. Every way out of the folder is tried for real, in your browser.
tags: path traversal, sandbox, symlinks, validation, file safety, least privilege
---

Letting software read and write files is one of the oldest ways to get hurt in security. The classic mistake is a **path traversal**: the program joins a folder and a name, the name is `../../etc/passwd`, and the program cheerfully reads a file from somewhere else entirely. An agent makes this worse, because the "name" comes from a model that can be influenced by any text it has read.

NoteKeeper's answer is that the agent never sees a path at all. It deals in **names**, and one small class, `Notes`, is the only code that turns a name into a file. If that class is right, the whole project is safe from this whole family of attacks.

## Rule 1: a name is a plain word

```python src="note-keeper/backend/app/notes.py" region="names" title="backend/app/notes.py"
```

A valid name is 1 to 64 characters: lower-case letters, digits, `-` and `_`, starting with a letter or digit. That is it. There is no `/` in it, no `\`, and no `.` (so no `..`, and no extension tricks). `Ideas.md` and ` ideas ` are tidied up to `ideas`; anything else is **refused, not repaired**. (Quietly "fixing" a hostile name, by stripping the slashes say, is how people end up with a surprising path. Refusing is simpler to reason about.)

An allow-list is the right shape for this rule: you describe the *few* things that are acceptable, instead of trying to list every dangerous thing.

## Rule 2 and 3: check the real location, too

```python src="note-keeper/backend/app/notes.py" region="notes" title="backend/app/notes.py"
```

`_path` does three independent checks, and the comments say why each exists:

1. **The name has no slash and no dot**, so `root / "name.md"` stays in the folder.
2. **A symlink is refused.** A symbolic link is a file that *points* to another place. If a file called `shortcut.md` inside your notes folder linked to `/home/you/.ssh/id_rsa`, then reading "note `shortcut`" would read your private key, and rule 1 alone would not notice.
3. **The real location must be the folder.** `path.resolve().parent != self.root` asks the operating system where the file *really* is, after following every link and `..`.

Any *one* of these stops the usual tricks. Together they stop the surprising ones too. This is **defence in depth**: assume each layer may have a hole, and stack layers so the holes do not line up.

The rest of the class keeps its promises: reads, writes and deletes all go through `_path`; `write` enforces a maximum size and a maximum number of notes (so a runaway agent cannot fill your disk); an unreadable file (not valid UTF-8, say) is an error message, not a crash; and `search` and `info` skip a bad file instead of failing on it.

## Try every way out

This block runs the real `Notes` class on a temporary folder in your browser. It tries a list of hostile names, then plants a symlink that points at a "secret" file *outside* the folder and tries to read it through the notes.

```python run src="note-keeper/backend/app/notes.py" title="Escape attempts" level=easy
import os, tempfile
from pathlib import Path

base = Path(tempfile.mkdtemp())
notes = Notes(base / "notes")
notes.write("ideas", "# Ideas\n- build a to-do agent\n")
(base / "secret.txt").write_text("the password is hunter2")

attempts = ["../secret", "../../etc/passwd", "/etc/passwd", "a/b", "..", ".", "ideas.md.md", "Ideas", "my note", "ideas\x00", "x" * 65, ""]
print("hostile names:")
for name in attempts:
    shown = repr(name) if len(name) < 30 else f"'x' * {len(name)}"
    try:
        notes.read(name)
        print(f"  {shown:<24} READ IT  <-- a hole")
    except NoteError as exc:
        print(f"  {shown:<24} refused")

print("\nvalid names:", [clean_name(n) for n in ("ideas", "Ideas.md".lower(), " trip-ideas ")])

os.symlink(base / "secret.txt", notes.root / "shortcut.md")          # a note that is really a pointer to a file outside
print("\nthe symlink exists on disk:", (notes.root / "shortcut.md").exists())
print("listed as a note:", "shortcut" in notes.names())
for label, call in [("read", lambda: notes.read("shortcut")), ("write", lambda: notes.write("shortcut", "overwritten"))]:
    try:
        call()
        print(f"{label} through the symlink: allowed  <-- a hole")
    except NoteError as exc:
        print(f"{label} through the symlink: refused ({exc})")
print("the secret is untouched:", (base / "secret.txt").read_text() == "the password is hunter2")
```

```output
hostile names:
  '../secret'              refused
  '../../etc/passwd'       refused
  '/etc/passwd'            refused
  'a/b'                    refused
  '..'                     refused
  '.'                      refused
  'ideas.md.md'            refused
  'Ideas'                  refused
  'my note'                refused
  'ideas\x00'              refused
  'x' * 65                 refused
  ''                       refused

valid names: ['ideas', 'ideas', 'trip-ideas']

the symlink exists on disk: True
listed as a note: False
read through the symlink: refused ('shortcut' is not an ordinary note.)
write through the symlink: refused ('shortcut' is not an ordinary note.)
the secret is untouched: True
```

Every line says `refused`, and the secret is untouched. Try adding your own attempts to the list. If one gets through, you have found a bug in the rules.

## Limits are safety too

```python run src="note-keeper/backend/app/notes.py" title="Limits" level=easy
import tempfile

notes = Notes(tempfile.mkdtemp(), max_chars=20, max_notes=2)
notes.write("a", "x" * 20)
for label, call in [("too long", lambda: notes.write("a", "x" * 21)), ("third note", lambda: (notes.write("b", "1"), notes.write("c", "1")))]:
    try:
        call()
    except NoteError as exc:
        print(f"{label}: {exc}")
notes.write("b", "changed")                      # changing an existing note is not creating one
print("notes:", notes.names())
```

```output
too long: That note would be 21 characters; the limit is 20.
third note: The folder already holds 2 notes, which is the limit.
notes: ['a', 'b']
```

## The tests

```python src="note-keeper/backend/tests/test_notes.py" region="name-tests" title="backend/tests/test_notes.py"
```

```python src="note-keeper/backend/tests/test_notes.py" region="symlink-test" title="backend/tests/test_notes.py"
```

The first is a long list of hostile names, each tried against **every** operation (read, exists, delete, write). The second plants a real symlink to a real "secret" file and checks both that the note cannot be read and that the secret is not overwritten. When you write a safety rule, write the test that *attacks* it.

:::warn A sandbox is only as good as its single door
All the safety here depends on there being exactly **one** function that turns a name into a path. If someone later adds `open(f"notes/{name}.md")` in another file, the whole guarantee is gone. Keep the door single, and keep the test that tries every way through it.
:::

:::keypoints
- Path traversal turns a "name" into a path somewhere else. The agent must never handle paths, only names.
- Use an allow-list for names: a few characters, nothing else. Refuse, do not repair.
- Check the **real** location after resolving links, and refuse symlinks. Stack independent checks (defence in depth).
- Limit size and count, so a runaway agent cannot fill the disk.
- Keep exactly one function that makes paths, and write tests that attack it.
:::

```quiz
? Why does `Notes` refuse a name like `my note` instead of converting it to `my-note`?
- Spaces are illegal in files
+ Quietly repairing hostile input is how surprising paths appear; refusing is simpler to reason about
- It saves memory
> Allow-list, then refuse.
? Why is a symlink check needed when names are already plain words?
- Symlinks are slow
+ A file inside the folder can point to a file outside it, and a plain name would then read that file
- Names can contain slashes
> Each layer covers a hole the others could miss.
? What is "defence in depth"?
+ Stacking independent protections so that one failing does not mean the whole thing fails
- Writing very long code
- Using many models
> Assume each layer can have a hole, and make sure the holes do not line up.
```

:::exercise One more door
Add `rename(self, old, new)` to `Notes`. Both names must pass `_path`. Write the tests that attack it first: renaming onto an existing note must be refused, renaming to `../x` must be refused, and renaming a symlink must be refused. Then say why you would still not add a `rename` *tool* for the agent without going through the proposal system.
:::
