"""Who is acting: a name and a role. A plain dataclass, so the pipeline needs no web framework to know who asked."""
from dataclasses import dataclass


# region: principal
@dataclass(frozen=True)
class Principal:
    name: str
    role: str                 # "agent" or "lead"
# endregion: principal
