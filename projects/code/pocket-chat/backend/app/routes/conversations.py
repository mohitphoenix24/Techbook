from fastapi import APIRouter, Depends, HTTPException

from ..db import Store
from ..deps import get_store
from ..personas import PERSONAS
from ..schemas import ConversationDetail, ConversationOut, PersonaOut

router = APIRouter(prefix="/api", tags=["conversations"])


@router.get("/health")
def health() -> dict:
    return {"status": "ok"}


@router.get("/personas", response_model=list[PersonaOut])
def personas():
    return [{"id": pid, "name": p["name"], "blurb": p["blurb"]} for pid, p in PERSONAS.items()]


@router.get("/conversations", response_model=list[ConversationOut])
def list_conversations(store: Store = Depends(get_store)):
    return store.list_conversations()


@router.get("/conversations/{conversation_id}", response_model=ConversationDetail)
def get_conversation(conversation_id: str, store: Store = Depends(get_store)):
    conversation = store.get_conversation(conversation_id)
    if conversation is None:
        raise HTTPException(404, "Conversation not found")
    return {**conversation, "messages": store.messages(conversation_id)}


@router.delete("/conversations/{conversation_id}", status_code=204)
def delete_conversation(conversation_id: str, store: Store = Depends(get_store)):
    if not store.delete_conversation(conversation_id):
        raise HTTPException(404, "Conversation not found")
