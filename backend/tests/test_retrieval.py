import pytest
from app.rag import MaterialRetriever


def _material(material_id, title, content, tags=None):
    return {
        "id": material_id,
        "title": title,
        "content": content,
        "tags": tags or [],
        "created_at": "2026-11-18T00:00:00Z",
    }


def test_local_hybrid_returns_evidence_from_actual_materials():
    materials = [
        _material("ml", "机器学习项目", "使用 Python 和 scikit-learn 开发推荐系统", ["机器学习"]),
        _material("frontend", "前端项目", "使用 JavaScript 和 React 开发界面", ["前端"]),
    ]
    retriever = MaterialRetriever()

    hits = retriever.search("Python scikit-learn 机器学习", materials, top_k=2)

    assert retriever.mode == "local-hybrid"
    assert hits[0]["id"] == "ml"
    assert hits[0] == {
        "id": "ml",
        "title": "机器学习项目",
        "content": "使用 Python 和 scikit-learn 开发推荐系统",
        "score": hits[0]["score"],
        "source": "local-hybrid",
    }
    assert 0 < hits[0]["score"] <= 1


def test_chinese_word_retrieval_prefers_matching_material():
    materials = [
        _material("pipeline", "数据工程", "负责电商平台的数据管道与性能优化"),
        _material("recommend", "推荐算法", "设计电商推荐算法和召回策略"),
    ]
    retriever = MaterialRetriever()

    hits = retriever.search("电商 数据管道", materials)

    assert hits[0]["id"] == "pipeline"


def test_english_matching_respects_word_boundaries():
    materials = [
        _material("js", "JavaScript", "JavaScript developer with React"),
        _material("java", "Java", "Java developer with Spring"),
    ]
    retriever = MaterialRetriever()

    hits = retriever.search("Java", materials)

    assert hits[0]["id"] == "java"
    assert all(hit["id"] != "js" for hit in hits)


def test_empty_materials_return_empty_list_without_fabricated_hits():
    assert MaterialRetriever().search("Python 机器学习", []) == []


def test_local_search_reflects_updates_and_deletions_immediately():
    removed = _material("removed", "旧项目", "Python FastAPI 旧内容")
    updated = _material("updated", "旧标题", "Java 旧内容")
    retriever = MaterialRetriever()
    first = retriever.search("Python FastAPI", [removed, updated])
    assert first[0]["id"] == "removed"

    updated.update({"title": "新标题", "content": "Python FastAPI 新内容"})
    hits = retriever.search("Python FastAPI 新内容", [updated])

    assert [hit["id"] for hit in hits] == ["updated"]
    assert hits[0]["title"] == "新标题"
    assert hits[0]["content"] == "Python FastAPI 新内容"


def test_bge_missing_dependency_fails_clearly_and_does_not_pretend_to_work(monkeypatch):
    def refuse_import(name):
        raise ImportError(name)

    monkeypatch.setattr(MaterialRetriever, "_import_optional", staticmethod(refuse_import))
    retriever = MaterialRetriever(mode="bge", persist_directory="unused-chroma")

    assert retriever.mode == "chroma-bge-rerank"
    with pytest.raises(RuntimeError, match="BGE retrieval requires chromadb and sentence-transformers"):
        retriever.search("Python", [_material("m", "Python", "Python experience")])


class FakeCollection:
    def __init__(self):
        self.records = {}
        self.deleted_ids = []

    def upsert(self, ids, embeddings, documents=None, metadatas=None):
        for index, material_id in enumerate(ids):
            self.records[material_id] = {
                "embedding": embeddings[index],
                "document": documents[index],
                "metadata": metadatas[index],
            }

    def get(self, include=None):
        return {"ids": list(self.records)}

    def delete(self, ids):
        for material_id in ids:
            self.deleted_ids.append(material_id)
            self.records.pop(material_id, None)

    def query(self, query_embeddings, n_results=5, where=None):
        ids = sorted(self.records, key=lambda item: (
            -sum(left * right for left, right in zip(query_embeddings[0], self.records[item]["embedding"])),
            item,
        ))
        return {"ids": [ids[:n_results]]}


class FakeSentenceTransformer:
    def encode(self, texts, **kwargs):
        vocabulary = ["python", "机器学习", "docker", "旧内容"]
        return [[1.0 if word in text else 0.0 for word in vocabulary] for text in texts]


class FakeCrossEncoder:
    def predict(self, pairs, **kwargs):
        return [0.9 if "机器学习" in text else 0.1 for _, text in pairs]


def test_bge_path_syncs_chroma_and_filters_stale_records(monkeypatch, tmp_path):
    collection = FakeCollection()
    cross_encoder = FakeCrossEncoder()

    def fake_runtime(self):
        return collection, FakeSentenceTransformer(), cross_encoder

    monkeypatch.setattr(MaterialRetriever, "_load_bge_runtime", fake_runtime)
    retriever = MaterialRetriever(mode="bge", persist_directory=str(tmp_path))

    old = _material("old", "旧经历", "Python 旧内容")
    updated = _material("updated", "机器学习", "Python 机器学习")
    first = retriever.search("机器学习", [old, updated], top_k=2)
    assert [hit["id"] for hit in first] == ["updated", "old"]
    assert first[0]["content"] == "Python 机器学习"
    assert set(collection.records) == {"old", "updated"}

    updated["content"] = "Python 机器学习更新后的内容"
    collection.records["stale"] = collection.records["old"]
    hits = retriever.search("机器学习", [updated])

    assert "old" in collection.deleted_ids
    assert "stale" in collection.deleted_ids
    assert [hit["id"] for hit in hits] == ["updated"]
    assert hits[0]["content"] == "Python 机器学习更新后的内容"
    assert hits[0]["source"] == "chroma-bge-rerank"


def test_bge_reranker_reorders_and_keeps_scores_with_correct_materials(monkeypatch, tmp_path):
    collection = FakeCollection()

    class LexicalBiasEmbedder:
        def encode(self, texts, **kwargs):
            return [[float(text.count("Python"))] for text in texts]

    def fake_runtime(self):
        return collection, LexicalBiasEmbedder(), FakeCrossEncoder()

    monkeypatch.setattr(MaterialRetriever, "_load_bge_runtime", fake_runtime)
    retriever = MaterialRetriever(mode="bge", persist_directory=str(tmp_path))
    lexical = _material("lexical", "Python", "Python " * 16)
    relevant = _material("relevant", "机器学习", "Python 机器学习")

    hits = retriever.search("Python", [lexical, relevant], top_k=2)

    assert [hit["id"] for hit in hits] == ["relevant", "lexical"]
    assert hits[0]["score"] == pytest.approx(0.9)
    assert hits[1]["score"] == pytest.approx(0.1)


def test_bge_empty_candidates_do_not_call_reranker(monkeypatch, tmp_path):
    class EmptyResultCollection(FakeCollection):
        def query(self, query_embeddings, n_results=5, where=None):
            return {"ids": [[]]}

    class NoPredictCrossEncoder:
        def predict(self, pairs, **kwargs):
            raise AssertionError("reranker.predict must not be called for empty candidates")

    def fake_runtime(self):
        return EmptyResultCollection(), FakeSentenceTransformer(), NoPredictCrossEncoder()

    monkeypatch.setattr(MaterialRetriever, "_load_bge_runtime", fake_runtime)
    retriever = MaterialRetriever(mode="bge", persist_directory=str(tmp_path))

    assert retriever.search("Docker", [_material("python", "Python", "Python")]) == []


def test_bge_sync_and_query_are_serialized_between_concurrent_searches(monkeypatch, tmp_path):
    import threading
    import time

    actions = []
    query_started = threading.Event()
    release_query = threading.Event()

    class SlowCollection(FakeCollection):
        def query(self, query_embeddings, n_results=5, where=None):
            actions.append("query:start")
            query_started.set()
            assert release_query.wait(timeout=2)
            actions.append("query:end")
            return super().query(query_embeddings, n_results=n_results, where=where)

        def get(self, include=None):
            actions.append("get")
            return super().get(include=include)

    def fake_runtime(self):
        return SlowCollection(), FakeSentenceTransformer(), FakeCrossEncoder()

    monkeypatch.setattr(MaterialRetriever, "_load_bge_runtime", fake_runtime)
    retriever = MaterialRetriever(mode="bge", persist_directory=str(tmp_path))
    materials = [_material("python", "Python", "Python")]

    first = threading.Thread(target=lambda: retriever.search("Python", materials))
    first.start()
    assert query_started.wait(timeout=2)
    second = threading.Thread(target=lambda: retriever.search("Python", materials))
    second.start()
    time.sleep(0.05)
    assert actions.count("get") == 1
    release_query.set()
    first.join(timeout=2)
    second.join(timeout=2)
    assert not first.is_alive() and not second.is_alive()
    assert actions == ["get", "query:start", "query:end", "get", "query:start", "query:end"]
