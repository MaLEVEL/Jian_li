"""Deterministic material retrieval with an optional persistent BGE path."""

from __future__ import annotations

import importlib
import json
import math
import re
import threading
from collections import Counter
from typing import Any

import jieba
from rank_bm25 import BM25Okapi

_ENGLISH_TOKEN = re.compile(r"[a-z0-9]+(?:[._-][a-z0-9]+)*")
_CJK_RUN = re.compile(r"[\u4e00-\u9fff]+")
_RRF_K = 60
_COLLECTION_NAME = "jobfit_materials_v1"
_EMBEDDING_MODEL = "BAAI/bge-small-zh-v1.5"
_RERANKER_MODEL = "BAAI/bge-reranker-base"


def _tokenize(text: str) -> list[str]:
    """Tokenize mixed Chinese/English text without substring English matches."""
    lowered = text.casefold()
    tokens = [match.group(0) for match in _ENGLISH_TOKEN.finditer(lowered)]
    for run in _CJK_RUN.findall(lowered):
        tokens.extend(jieba.lcut(run))
    return [token for token in tokens if token]


def _features(tokens: list[str]) -> list[str]:
    """Build sparse-vector features, including Chinese character n-grams."""
    features: list[str] = []
    for token in tokens:
        features.append(token)
        if _CJK_RUN.search(token):
            characters = list(token)
            features.extend(characters)
            features.extend("".join(pair) for pair in zip(characters, characters[1:]))
    return features


def _material_text(material: dict[str, Any]) -> str:
    tags = " ".join(material.get("tags", []))
    return "\n".join((material.get("title", ""), material.get("content", ""), tags))


def _cosine_scores(query_features: list[str], material_features: list[list[str]]) -> list[float]:
    query_vector = Counter(_features(query_features))
    query_norm = math.sqrt(sum(value * value for value in query_vector.values()))
    if query_norm == 0:
        return [0.0 for _ in material_features]

    scores: list[float] = []
    for features in material_features:
        vector = Counter(_features(features))
        dot = sum(
            count * query_vector[token]
            for token, count in vector.items()
            if token in query_vector
        )
        norm = math.sqrt(sum(value * value for value in vector.values()))
        scores.append(dot / (query_norm * norm) if norm else 0.0)
    return scores


def _positive_ranks(scores: list[float]) -> dict[int, int]:
    ranked = sorted(
        (index for index, score in enumerate(scores) if score > 1e-12),
        key=lambda index: (-scores[index], index),
    )
    return {index: rank for rank, index in enumerate(ranked, start=1)}


def _as_list(value: Any) -> list[Any]:
    return value.tolist() if hasattr(value, "tolist") else list(value)


class MaterialRetriever:
    """Retrieve evidence from the materials supplied to each search call.

    ``local`` is offline and stateless. ``bge`` lazily initializes Chroma, BGE
    embeddings, and the BGE reranker on the first search.
    """

    def __init__(self, mode: str = "local", persist_directory: str = "data/chroma") -> None:
        if mode == "local":
            self._mode = "local-hybrid"
        elif mode == "bge":
            self._mode = "chroma-bge-rerank"
        else:
            raise ValueError("mode must be 'local' or 'bge'")
        self.persist_directory = persist_directory
        self._bge_runtime: tuple[Any, Any, Any] | None = None
        self._bge_lock = threading.RLock()
        self.last_error: str | None = None

    @property
    def mode(self) -> str:
        return self._mode

    def _import_optional(self, module_name: str) -> Any:
        return importlib.import_module(module_name)

    def _load_bge_runtime(self) -> tuple[Any, Any, Any]:
        try:
            chromadb = self._import_optional("chromadb")
            sentence_transformers = self._import_optional("sentence_transformers")
            client = chromadb.PersistentClient(path=self.persist_directory)
            collection = client.get_or_create_collection(
                name=_COLLECTION_NAME,
                metadata={"hnsw:space": "cosine"},
            )
            embedder = sentence_transformers.SentenceTransformer(_EMBEDDING_MODEL)
            reranker = sentence_transformers.CrossEncoder(_RERANKER_MODEL)
        except Exception as exc:
            self.last_error = str(exc)
            raise RuntimeError(
                "BGE retrieval requires chromadb and sentence-transformers with the "
                f"BGE models; use mode='local' instead. Initialization error: {exc}"
            ) from exc
        self.last_error = None
        return collection, embedder, reranker

    def _bge(self) -> tuple[Any, Any, Any]:
        if self._bge_runtime is None:
            self._bge_runtime = self._load_bge_runtime()
        return self._bge_runtime

    def search(
        self,
        query: str,
        materials: list[dict[str, Any]],
        top_k: int = 5,
    ) -> list[dict[str, Any]]:
        """Return up to ``top_k`` evidence records copied from ``materials``."""
        if self._mode == "chroma-bge-rerank":
            # The whole operation is serialized: one request must not delete or
            # replace IDs while another has already queried the same collection.
            with self._bge_lock:
                return self._search(query, materials, top_k)
        return self._search(query, materials, top_k)

    def _search(
        self,
        query: str,
        materials: list[dict[str, Any]],
        top_k: int,
    ) -> list[dict[str, Any]]:
        if top_k <= 0:
            return []

        query_tokens = _tokenize(query)
        if not query_tokens or not materials:
            return []

        material_texts = [_material_text(material) for material in materials]
        material_tokens = [_tokenize(text) for text in material_texts]
        by_id = {str(material["id"]): material for material in materials}

        bm25_scores = self._bm25_scores(query_tokens, material_tokens)
        sparse_scores = _cosine_scores(query_tokens, material_tokens)
        rankings = [_positive_ranks(bm25_scores), _positive_ranks(sparse_scores)]

        if self._mode == "chroma-bge-rerank":
            dense_ids = self._sync_and_query_chroma(by_id, query, top_k)
            dense_index_by_id = {
                str(material["id"]): index for index, material in enumerate(materials)
            }
            rankings.append(
                {
                    dense_index_by_id[material_id]: rank
                    for rank, material_id in enumerate(dense_ids, start=1)
                }
            )

        rrf_scores: dict[int, float] = {}
        for ranking in rankings:
            for index, rank in ranking.items():
                rrf_scores[index] = rrf_scores.get(index, 0.0) + 1.0 / (_RRF_K + rank)

        selected = sorted(rrf_scores, key=lambda index: (-rrf_scores[index], index))[:top_k]
        if not selected:
            return []

        scores_by_index = {index: rrf_scores[index] for index in selected}
        if self._mode == "chroma-bge-rerank":
            _, _, reranker = self._bge()
            pairs = [(query, material_texts[index]) for index in selected]
            rerank_values = _as_list(reranker.predict(pairs))
            scores_by_index = {
                index: float(rerank_values[position])
                for position, index in enumerate(selected)
            }
            selected = sorted(
                selected,
                key=lambda index: (-scores_by_index[index], index),
            )

        return [
            {
                "id": materials[index]["id"],
                "title": materials[index]["title"],
                "content": materials[index]["content"],
                "score": float(scores_by_index[index]),
                "source": self.mode,
            }
            for index in selected
        ]

    @staticmethod
    def _bm25_scores(query_tokens: list[str], material_tokens: list[list[str]]) -> list[float]:
        if not any(material_tokens):
            return [0.0 for _ in material_tokens]
        try:
            return _as_list(BM25Okapi(material_tokens).get_scores(query_tokens))
        except ZeroDivisionError:
            return [0.0 for _ in material_tokens]

    def _sync_and_query_chroma(
        self,
        by_id: dict[str, dict[str, Any]],
        query: str,
        top_k: int,
    ) -> list[str]:
        collection, embedder, _ = self._bge()
        current_ids = list(by_id)
        existing = collection.get(include=["metadatas"])
        existing_ids = set(_as_list(existing.get("ids", [])))
        stale_ids = [material_id for material_id in existing_ids if material_id not in by_id]
        if stale_ids:
            collection.delete(ids=stale_ids)

        texts = [_material_text(by_id[material_id]) for material_id in current_ids]
        embeddings = _as_list(embedder.encode(texts, normalize_embeddings=True))
        collection.upsert(
            ids=current_ids,
            embeddings=embeddings,
            documents=texts,
            metadatas=[
                {
                    "title": by_id[material_id].get("title", ""),
                    "tags": json.dumps(
                        by_id[material_id].get("tags", []),
                        ensure_ascii=False,
                    ),
                }
                for material_id in current_ids
            ],
        )

        query_embedding = _as_list(embedder.encode([query], normalize_embeddings=True))
        result = collection.query(
            query_embeddings=query_embedding,
            n_results=min(top_k, len(current_ids)),
        )
        return [str(material_id) for material_id in _as_list(result.get("ids", [[]])[0])]
