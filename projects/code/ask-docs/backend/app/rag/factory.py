from ..config import Settings
from .embeddings import Embedder, HashEmbedder


# region: factory
def build_embedder(settings: Settings) -> Embedder:
    """Pick the embedder once at start-up. Vectors from different embedders cannot be compared: change this setting and
    you must re-embed every chunk (POST /api/reindex does it)."""
    if settings.embeddings_provider == "fastembed":
        from .embeddings import FastEmbedder

        return FastEmbedder()
    if settings.embeddings_provider == "voyage":
        from .embeddings import VoyageEmbedder

        if not settings.voyage_api_key:
            raise RuntimeError("EMBEDDINGS_PROVIDER=voyage needs VOYAGE_API_KEY.")
        return VoyageEmbedder(settings.voyage_api_key)
    return HashEmbedder()
# endregion: factory
