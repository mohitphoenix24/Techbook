"""Masking secrets before a repository is indexed.

Source code often contains things that must never reach a search index, a prompt, or a screen: API keys, tokens, private
keys, passwords written into a config file. Everything the app indexes can be shown to a model and to anyone who uses
the app, so secrets are masked on the way in.

One rule matters more than the patterns: **a masked file keeps its line count.** Citations are line numbers, and a
person who opens `config.py:12` must see line 12 of the file the model read.
"""
# region: imports
import re
# endregion: imports

# region: patterns
MASK = "[REDACTED]"

KEY_FORMATS = [
    re.compile(r"\bAKIA[0-9A-Z]{16}\b"),                                    # an AWS access key id
    re.compile(r"\bsk-ant-[A-Za-z0-9_\-]{20,}"),                            # an Anthropic API key
    re.compile(r"\bsk-[A-Za-z0-9]{32,}\b"),                                 # an OpenAI-style key
    re.compile(r"\bgh[pousr]_[A-Za-z0-9]{36,}\b"),                          # a GitHub token
    re.compile(r"\bxox[abprs]-[A-Za-z0-9\-]{20,}"),                         # a Slack token
]
PRIVATE_KEY = re.compile(r"-----BEGIN [A-Z ]{0,30}PRIVATE KEY-----.{0,6000}?-----END [A-Z ]{0,30}PRIVATE KEY-----", re.S)     # bounded, so it cannot go quadratic
# Two steps, not one clever pattern: a plain regex finds `name = "value"`, then ordinary code asks whether the NAME sounds secret.
# (An earlier version put the name check inside the regex, and its nested quantifiers made a long line take minutes to scan:
# a pattern that guards uploads must never be something an upload can slow down.)
ASSIGNMENT = re.compile(r"""([A-Za-z0-9_\-]{1,60})(\s*[:=]\s*)(["'])([^"'\s]{8,200})\3""")
SECRET_NAME = re.compile(r"api[_-]?key|secret|token|password|passwd|pwd", re.I)
# endregion: patterns


# region: mask
def mask_secrets(text: str) -> tuple[str, int]:
    """The text with secrets replaced by [REDACTED], and how many were found. The number of lines never changes."""
    count = 0

    def block(match: re.Match) -> str:
        nonlocal count
        count += 1
        return "\n".join([f"-----PRIVATE KEY {MASK}-----"] + [MASK] * match.group(0).count("\n"))        # as many lines as the key had

    def assignment(match: re.Match) -> str:
        nonlocal count
        value = match.group(4)
        if not SECRET_NAME.search(match.group(1)):
            return match.group(0)
        if value.startswith(("$", "{", "%", "<")) or value.lower() in ("changeme", "password", "example", "placeholder"):
            return match.group(0)                                                                         # a reference or a placeholder, not a secret
        count += 1
        return f"{match.group(1)}{match.group(2)}{match.group(3)}{MASK}{match.group(3)}"

    text = PRIVATE_KEY.sub(block, text)
    text = ASSIGNMENT.sub(assignment, text)
    for pattern in KEY_FORMATS:
        text, n = pattern.subn(MASK, text)
        count += n
    return text, count
# endregion: mask
