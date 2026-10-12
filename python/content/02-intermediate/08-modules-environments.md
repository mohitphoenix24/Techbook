---
title: Modules, Packages & Environments
level: intermediate
time: 22
summary: Organise code into files and packages, install libraries with pip or uv, isolate projects with virtual environments, and keep API keys safe in .env files.
---

Real AI projects are not one file. They have a folder of modules, a list of dependencies, and secret API keys that must never end up on GitHub. This lesson shows the professional setup. Most of it runs **on your computer**, so the examples here are for reading and copying.

## Modules and imports

:::def Module
Any `.py` file. If you have `utils.py`, other files can `import utils` and use its functions.
:::

:::def Package
A **folder** of modules (usually with an `__init__.py` file). It lets you organise code like `myapp/llm/client.py` and import it as `from myapp.llm import client`.
:::

:::syntax
```python
import math                          # whole module: math.sqrt(2)
import numpy as np                   # with a nickname: np.array(...)
from pathlib import Path             # one name: Path(".")
from collections import Counter, deque
from .utils import clean_text        # relative import inside a package
```
:::

```python run level=easy
import math
import json as j
from statistics import mean, median

print(math.pi)
print(j.dumps({"ok": True}))
print(mean([1, 2, 3, 10]), median([1, 2, 3, 10]))

import random
print(random.__name__, "lives at", random.__file__.split("/")[-1])
```

### Writing your own module

```python run level=intermediate
from pathlib import Path
import importlib
import sys

# create a small package on disk: textkit/
Path("textkit").mkdir(exist_ok=True)
Path("textkit/__init__.py").write_text('from .clean import normalize\n__version__ = "0.1.0"\n')
Path("textkit/clean.py").write_text('''
def normalize(text: str) -> str:
    """Lowercase and collapse whitespace."""
    return " ".join(text.lower().split())
''')

sys.path.insert(0, ".")          # make the current folder importable
importlib.invalidate_caches()

import textkit
from textkit.clean import normalize

print(textkit.__version__)
print(normalize("  Hello    WORLD  "))
print(textkit.normalize("Also   exported   from __init__"))
```

### The `if __name__ == "__main__":` idiom

:::def `__name__`
A special variable Python sets for every module. It is `"__main__"` when the file is **run directly** (`python app.py`), and the module's name when it is **imported**. The idiom lets a file work both as a script and as an importable module.
:::

```python
# app.py
def main():
    print("running the app")

if __name__ == "__main__":     # only runs with: python app.py
    main()                     # NOT when another file does: import app
```

## A typical AI project layout

```text
my-rag-app/
├── pyproject.toml          # project info + dependencies
├── .env                    # secrets (NEVER commit this)
├── .env.example            # template showing which variables are needed
├── .gitignore              # tells git to ignore .env, .venv, data/ ...
├── README.md
├── src/
│   └── rag_app/
│       ├── __init__.py
│       ├── config.py       # settings loaded from the environment
│       ├── ingest.py       # load + chunk + embed documents
│       ├── retriever.py    # vector search
│       ├── llm.py          # wrapper around the Claude API
│       └── api.py          # FastAPI web server
├── tests/
│   └── test_retriever.py
└── data/
    └── docs/
```

## Virtual environments

:::def Virtual environment (venv)
A private folder containing its own Python and its own installed packages, just for one project. Project A can use `numpy 1.x` while project B uses `numpy 2.x` without conflict.
:::

:::analogy
Each virtual environment is a separate **toolbox** for one job. You do not throw every tool you own into one giant box — you pack the right tools for each project.
:::

### Option 1: venv + pip (built in)

```bash
python -m venv .venv                  # create
source .venv/bin/activate             # activate (macOS/Linux)
.venv\Scripts\activate                # activate (Windows)

pip install anthropic numpy pandas    # install packages
pip install "fastapi>=0.115"          # with a version constraint
pip freeze > requirements.txt         # save exact versions
pip install -r requirements.txt       # recreate elsewhere
deactivate                            # leave the environment
```

### Option 2: uv (fast and modern)

`uv` is a very fast package and project manager written in Rust. It creates the virtual environment and manages `pyproject.toml` for you.

```bash
# install uv once:  https://docs.astral.sh/uv/
uv init my-rag-app && cd my-rag-app   # new project with pyproject.toml
uv add anthropic numpy pandas         # add dependencies (creates .venv automatically)
uv add --dev pytest ruff              # development-only tools
uv run python main.py                 # run inside the project environment
uv sync                               # install everything from the lock file
```

:::tip Which one?
Both are fine. **pip + venv** comes with Python and every tutorial uses it. **uv** is 10–100× faster and handles lock files, Python versions and scripts in one tool — many AI teams switched to it.
:::

### pyproject.toml

:::def pyproject.toml
The standard configuration file for a modern Python project: its name, version, required Python version, and dependencies.
:::

```toml
[project]
name = "rag-app"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = [
    "anthropic>=1.0",
    "numpy>=2.0",
    "fastapi>=0.115",
    "python-dotenv>=1.0",
]

[dependency-groups]
dev = ["pytest>=8", "ruff>=0.6"]
```

## API keys and .env files

:::def Environment variable
A named setting that lives **outside** your code, in the operating system's environment. Programs read it with `os.environ`. It is the standard place to put secrets like API keys.
:::

:::warn Never hard-code API keys
`client = Anthropic(api_key="sk-ant-...")` in your code will eventually be pushed to GitHub, where bots scan for keys within minutes. Keep keys in environment variables or a `.env` file that is listed in `.gitignore`.
:::

A `.env` file:

```env
ANTHROPIC_API_KEY=sk-ant-your-key-here
APP_ENV=development
LOG_LEVEL=INFO
```

Load it with `python-dotenv`:

```python local title="config.py"
import os
from dotenv import load_dotenv     # pip install python-dotenv

load_dotenv()                      # reads .env into os.environ

API_KEY = os.environ["ANTHROPIC_API_KEY"]           # crash early if missing
APP_ENV = os.environ.get("APP_ENV", "production")   # optional, with a default
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
```

:::tip The SDK finds the key for you
`anthropic.Anthropic()` automatically reads `ANTHROPIC_API_KEY` from the environment — you usually do not need to pass it at all.
:::

Here is the same idea as a runnable example (with a fake key):

```python run level=intermediate
import os
from pathlib import Path

Path(".env").write_text("ANTHROPIC_API_KEY=sk-ant-demo-123\nAPP_ENV=dev\n# comment\n")

def load_env(path=".env"):
    """A tiny .env reader — python-dotenv does this (and more) for you."""
    for line in Path(path).read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"'))

load_env()
key = os.environ["ANTHROPIC_API_KEY"]
print("key loaded:", key[:7] + "…" + key[-3:])      # never print a full key!
print("env:", os.environ.get("APP_ENV"))
```

A matching `.gitignore`:

```text
.venv/
.env
__pycache__/
*.pyc
data/raw/
.ipynb_checkpoints/
```

## Settings objects (the clean way)

Bigger apps gather all settings in one typed object. `pydantic-settings` reads environment variables, validates their types and gives helpful errors:

```python local title="settings.py with pydantic-settings"
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env")

    anthropic_api_key: str
    model: str = "claude-opus-5-5"
    max_tokens: int = 1024
    debug: bool = False

settings = Settings()      # reads ANTHROPIC_API_KEY, MODEL, MAX_TOKENS, DEBUG
print(settings.model, settings.max_tokens)
```

## Jupyter notebooks

:::def Jupyter notebook
An interactive document (`.ipynb`) mixing code cells, output, charts and notes. Hugely popular for data exploration and ML experiments. Run with `jupyter lab`, or open `.ipynb` files directly in VS Code.
:::

Notebooks are great for **exploring**; move stable code into `.py` modules so it can be tested and reused. Google Colab gives you free notebooks with GPUs in the browser.

## Check yourself

```quiz
? What is a virtual environment for?
+ Keeping each project's packages separate so versions don't conflict
- Running Python in the cloud
- Making code run faster
> One project = one environment.

? Where should your ANTHROPIC_API_KEY live?
- In your Python file
+ In an environment variable or a .env file listed in .gitignore
- In README.md
> Never commit secrets. Load them from the environment.

? When is `__name__ == "__main__"` true?
+ When the file is run directly, e.g. `python app.py`
- When the file is imported
- Always
> It lets a module behave differently as a script vs as an import.

? What does `uv add anthropic` do?
+ Adds anthropic to pyproject.toml and installs it into the project's environment
- Uploads your code to Anthropic
- Updates Python
> uv manages dependencies and the virtual environment together.
```

:::keypoints
- A module is a `.py` file; a package is a folder of modules. Import with `import x`, `from x import y`, `import x as z`.
- Use `if __name__ == "__main__":` to make files both runnable and importable.
- One **virtual environment** per project: `python -m venv .venv` + `pip`, or `uv`.
- Dependencies go in `pyproject.toml` (or `requirements.txt`).
- Secrets go in **environment variables** / `.env` (git-ignored) — never in code.
:::
