---
title: Classes & Objects (OOP)
level: intermediate
time: 30
summary: Bundle data and behaviour together. Classes, __init__, methods, inheritance and magic methods — the way PyTorch models, SDK clients and LangChain components are built.
---

When you write `client = anthropic.Anthropic()` or `model = nn.Linear(10, 2)`, you are creating **objects** from **classes**. Understanding classes turns AI libraries from magic into something you can read — and build — yourself.

:::def Class
A **blueprint** for creating objects. It defines what data each object holds (attributes) and what it can do (methods).
:::

:::def Object (instance)
One concrete thing built from a class. `Dog` is a class; your dog `rex = Dog("Rex")` is an object. Each object has its own data.
:::

:::analogy
A class is a **cookie cutter**; objects are the **cookies**. One cutter, many cookies — each cookie can have different sprinkles (data), but they all have the same shape (structure and methods).
:::

## Your first class

:::syntax
```python
class ClassName:
    def __init__(self, param):      # runs when an object is created
        self.attribute = param      # store data on the object

    def method(self):               # a function that belongs to the class
        return self.attribute
```
:::

```python run level=easy
class ChatBot:
    def __init__(self, name, personality):
        self.name = name
        self.personality = personality
        self.history = []                      # each bot gets its OWN list

    def reply(self, message):
        self.history.append(message)
        return f"{self.name} ({self.personality}): You said '{message}'"

bot = ChatBot("Ada", "cheerful")            # create an object
other = ChatBot("Max", "grumpy")

print(bot.reply("Hi!"))
print(bot.reply("How are you?"))
print(other.reply("Hello"))
print(bot.history)                           # bot remembers its messages
print(other.history)                         # other has its own history
```

:::def self
The first parameter of every method. It refers to **the specific object** the method was called on. When you write `bot.reply("Hi")`, Python passes `bot` as `self` automatically.
:::

:::def __init__ (constructor)
A special method that runs automatically when you create an object. Use it to set up the object's starting data.
:::

## Attributes and methods

```python run level=easy
class Counter:
    def __init__(self):
        self.count = 0

    def increment(self, by=1):
        self.count += by
        return self          # returning self allows chaining

    def reset(self):
        self.count = 0

c = Counter()
c.increment().increment().increment(5)
print(c.count)
c.reset()
print(c.count)
```

### Class attributes vs instance attributes

```python run level=intermediate
class Model:
    provider = "anthropic"            # CLASS attribute: shared by all objects
    instances_created = 0

    def __init__(self, name):
        self.name = name              # INSTANCE attribute: one per object
        Model.instances_created += 1

a = Model("claude-opus-5-5")
b = Model("claude-haiku-4-5")
print(a.name, b.name)
print(a.provider, b.provider)
print("created:", Model.instances_created)
```

## Magic (dunder) methods

:::def Dunder method
A method with **d**ouble **under**scores on both sides, like `__init__`, `__str__` or `__len__`. Python calls them automatically for built-in operations: `print(obj)` calls `__str__`, `len(obj)` calls `__len__`, `a + b` calls `__add__`.
:::

```python run level=intermediate
class Conversation:
    def __init__(self):
        self.messages = []

    def add(self, role, content):
        self.messages.append({"role": role, "content": content})

    def __len__(self):                 # len(conv)
        return len(self.messages)

    def __getitem__(self, i):          # conv[i] and also makes it loopable
        return self.messages[i]

    def __str__(self):                 # print(conv) — friendly
        return "\n".join(f"{m['role']}: {m['content']}" for m in self.messages)

    def __repr__(self):                # shown in the console / debugger — precise
        return f"Conversation({len(self)} messages)"

conv = Conversation()
conv.add("user", "Hi")
conv.add("assistant", "Hello! How can I help?")

print(len(conv))
print(conv[0])
print(conv)
print(repr(conv))
for m in conv:
    print("-", m["role"])
```

| You write | Python calls |
|---|---|
| `len(x)` | `x.__len__()` |
| `x[i]` | `x.__getitem__(i)` |
| `str(x)`, `print(x)` | `x.__str__()` |
| `repr(x)` | `x.__repr__()` |
| `a + b` | `a.__add__(b)` |
| `a == b` | `a.__eq__(b)` |
| `x(...)` | `x.__call__(...)` |
| `item in x` | `x.__contains__(item)` |

### A tiny vector class

```python run level=intermediate
import math

class Vector:
    def __init__(self, *values):
        self.values = list(values)

    def __add__(self, other):
        return Vector(*[a + b for a, b in zip(self.values, other.values)])

    def __mul__(self, scalar):
        return Vector(*[a * scalar for a in self.values])

    def dot(self, other):
        return sum(a * b for a, b in zip(self.values, other.values))

    def norm(self):
        return math.sqrt(self.dot(self))

    def __repr__(self):
        return f"Vector({', '.join(f'{v:g}' for v in self.values)})"

king, man, woman = Vector(0.9, 0.8, 0.1), Vector(0.5, 0.9, 0.0), Vector(0.5, 0.1, 0.9)
print(king + woman)
print(king * 2)
print("dot:", king.dot(woman))
print("length:", round(king.norm(), 3))
```

:::def __call__
Makes an object callable like a function: `obj(x)`. PyTorch models use it — `model(x)` actually runs `model.__call__(x)`, which calls your `forward()` method.
:::

```python run level=advanced
class Linear:
    """A tiny 'layer': y = w * x + b. Calling the object runs forward()."""
    def __init__(self, w, b):
        self.w, self.b = w, b

    def forward(self, x):
        return self.w * x + self.b

    def __call__(self, x):
        return self.forward(x)

layer = Linear(w=2.0, b=1.0)
print(layer(3))                  # looks like a function call!
print([layer(x) for x in range(4)])
```

## Inheritance

:::def Inheritance
Creating a new class **based on** an existing one. The new **child** class gets all the parent's attributes and methods, and can add new ones or **override** (replace) existing ones.
:::

```python run level=intermediate
class LLM:
    def __init__(self, model):
        self.model = model

    def generate(self, prompt):
        raise NotImplementedError("subclasses must implement generate()")

    def chat(self, prompt):                       # shared behaviour
        answer = self.generate(prompt)
        return f"[{self.model}] {answer}"

class EchoLLM(LLM):
    def generate(self, prompt):
        return prompt

class ShoutLLM(LLM):
    def __init__(self, model, volume=3):
        super().__init__(model)                   # run the parent's __init__
        self.volume = volume

    def generate(self, prompt):
        return prompt.upper() + "!" * self.volume

for llm in [EchoLLM("echo-1"), ShoutLLM("shout-2")]:
    print(llm.chat("hello there"))

print(isinstance(ShoutLLM("x"), LLM))
```

:::def super()
Gives you access to the **parent class**. `super().__init__(model)` runs the parent's setup so you do not repeat it.
:::

This "one interface, many implementations" idea is called **polymorphism**. It is how frameworks let you swap Claude for another model without changing the rest of your code.

### Abstract base classes

To **force** subclasses to implement a method, use `abc`:

```python run level=advanced
from abc import ABC, abstractmethod

class Embedder(ABC):
    @abstractmethod
    def embed(self, text: str) -> list[float]:
        ...

    def embed_many(self, texts):
        return [self.embed(t) for t in texts]

class LengthEmbedder(Embedder):
    def embed(self, text):
        return [len(text), text.count(" ") + 1]

print(LengthEmbedder().embed_many(["hi", "hello world"]))

try:
    Embedder()          # cannot create an abstract class
except TypeError as e:
    print("TypeError:", e)
```

## Properties, classmethods and staticmethods

```python run level=advanced
class Prompt:
    MAX_CHARS = 200

    def __init__(self, text):
        self.text = text

    @property
    def text(self):                      # read like an attribute: p.text
        return self._text

    @text.setter
    def text(self, value):               # validate on every assignment
        if len(value) > self.MAX_CHARS:
            raise ValueError("prompt too long")
        self._text = value.strip()

    @property
    def word_count(self):                # computed attribute
        return len(self.text.split())

    @classmethod
    def from_template(cls, template, **values):   # alternative constructor
        return cls(template.format(**values))

    @staticmethod
    def is_question(s):                  # helper that does not need self
        return s.strip().endswith("?")

p = Prompt.from_template("Explain {topic} to a {age}-year-old.", topic="RAG", age=10)
print(p.text, "|", p.word_count, "words")
print(Prompt.is_question(p.text))
try:
    p.text = "x" * 500
except ValueError as e:
    print("rejected:", e)
```

| Decorator | First parameter | Use it for |
|---|---|---|
| (none) | `self` — the object | normal methods |
| `@classmethod` | `cls` — the class | alternative constructors like `from_file()` |
| `@staticmethod` | nothing | helpers that live in the class for organisation |
| `@property` | `self` | computed or validated attributes |

## Composition: objects that contain objects

Often better than inheritance: build big things from small parts.

```python run level=advanced
class Memory:
    def __init__(self, max_messages=4):
        self.max_messages = max_messages
        self.messages = []

    def add(self, role, content):
        self.messages.append({"role": role, "content": content})
        self.messages = self.messages[-self.max_messages:]   # keep only recent

class FakeModel:
    def generate(self, messages):
        return f"I remember {len(messages)} messages; last: {messages[-1]['content']!r}"

class Assistant:
    def __init__(self, model, memory):
        self.model = model          # "has a" model
        self.memory = memory        # "has a" memory

    def ask(self, text):
        self.memory.add("user", text)
        answer = self.model.generate(self.memory.messages)
        self.memory.add("assistant", answer)
        return answer

bot = Assistant(FakeModel(), Memory(max_messages=3))
for q in ["hi", "what is AI?", "and ML?", "thanks"]:
    print(bot.ask(q))
```

:::ai
- **PyTorch**: every model is a class inheriting from `nn.Module`, with layers set up in `__init__` and the math in `forward()`.
- **SDK clients**: `anthropic.Anthropic()` is an object holding your API key and settings, with methods like `.messages.create()`.
- **LangChain / LlamaIndex**: retrievers, chains and agents are classes you subclass and compose.
:::

## Check yourself

```quiz
? What is `self` inside a method?
+ The specific object the method was called on
- The class itself
- A reserved keyword that does nothing
> `bot.reply("hi")` passes bot as self automatically.

? Which method runs when you write `print(obj)`?
- __init__
+ __str__
- __call__
> print() uses __str__ (falling back to __repr__ if __str__ is missing).

? A child class defines `__init__`. How does it also run the parent's setup?
+ super().__init__(...)
- parent.__init__()
- It happens automatically
> Overriding __init__ replaces the parent's; call super().__init__() to run it too.

? What does `@property` let you do?
+ Access a method like an attribute, e.g. `p.word_count` without brackets
- Make an attribute private
- Share a value between all objects
> Properties compute (or validate) values while looking like plain attributes.
```

:::exercise Token budget tracker
Write a class `Budget` with:
- `__init__(self, limit)` storing a token limit and `used = 0`
- `spend(self, tokens)` that raises `ValueError` if spending would go over the limit
- a `remaining` **property**
- `__repr__` returning e.g. `Budget(used=300/1000)`
:::

:::solution
```python run
class Budget:
    def __init__(self, limit):
        self.limit = limit
        self.used = 0

    def spend(self, tokens):
        if self.used + tokens > self.limit:
            raise ValueError(f"over budget: {self.used + tokens} > {self.limit}")
        self.used += tokens

    @property
    def remaining(self):
        return self.limit - self.used

    def __repr__(self):
        return f"Budget(used={self.used}/{self.limit})"

b = Budget(1000)
b.spend(300)
print(b, "remaining:", b.remaining)
try:
    b.spend(800)
except ValueError as e:
    print(e)
```
:::

:::keypoints
- A **class** is a blueprint; **objects** are instances with their own data.
- `__init__` sets up each object; `self` is the object itself.
- **Dunder methods** (`__len__`, `__str__`, `__call__`, `__add__`…) hook into Python's built-in syntax.
- **Inheritance** + `super()` reuse and extend behaviour; **composition** builds objects from parts.
- `@property`, `@classmethod`, `@staticmethod` add computed attributes, alternate constructors and helpers.
:::
