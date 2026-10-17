from typing import Literal

from pydantic import BaseModel, Field


# region: ask-request
class AskRequest(BaseModel):
    question: str = Field(min_length=3, max_length=1000)
    expand: bool = Field(default=True, description="Also bring in the functions the best matches call, and the ones that call them.")
    simulate: Literal["none", "bad_citation"] = Field(
        default="none", description="Offline model only: make the answer cite code that does not exist, to watch the citation check flag it.")
# endregion: ask-request
