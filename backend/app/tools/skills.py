"""Canonical skill aliases. Related technologies are deliberately kept distinct."""
import re

ALIASES = {
    'Python': ['python', 'python3'], 'FastAPI': ['fastapi'],
    'Django': ['django'], 'Flask': ['flask'], 'SQL': ['sql'],
    'PostgreSQL': ['postgresql', 'postgres'], 'MySQL': ['mysql'],
    'SQLite': ['sqlite', 'sqlite3'], 'Redis': ['redis'], 'MongoDB': ['mongodb', 'mongo'],
    'Docker': ['docker'], 'Kubernetes': ['kubernetes', 'k8s'],
    'Linux': ['linux'], 'Git': ['git'], 'GitHub Actions': ['github actions'],
    'React': ['react', 'react.js', 'reactjs'], 'Vue': ['vue', 'vue.js', 'vuejs'],
    'TypeScript': ['typescript'], 'JavaScript': ['javascript', 'js'],
    'Java': ['java'], 'Go': ['golang', 'go'], 'C++': ['c++', 'cpp'],
    'LangGraph': ['langgraph'], 'LangChain': ['langchain'],
    'RAG': ['rag', '检索增强生成'], 'LLM': ['llm', '大语言模型', '大模型'],
    'Function Calling': ['function calling', 'tool calling', '函数调用', '工具调用'],
    'Agent': ['agent', '智能体'], 'ChromaDB': ['chromadb', 'chroma'],
    'FAISS': ['faiss'], 'Milvus': ['milvus'], 'BM25': ['bm25'],
    'RRF': ['rrf'], 'Embedding': ['embedding', 'embeddings', '向量嵌入'],
    'Reranker': ['reranker', 'rerank', '重排序', '重排'],
    'scikit-learn': ['scikit-learn', 'sklearn', 'scikit learn'],
    'PyTorch': ['pytorch', 'torch'], 'TensorFlow': ['tensorflow'],
    'Pandas': ['pandas'], 'NumPy': ['numpy'], 'pytest': ['pytest'],
    'asyncio': ['asyncio'], 'Celery': ['celery'], 'RabbitMQ': ['rabbitmq'],
    'Kafka': ['kafka'], 'Elasticsearch': ['elasticsearch', 'elastic search'],
    'REST API': ['rest api', 'restful', 'restful api'], 'GraphQL': ['graphql'],
    'WebSocket': ['websocket', 'websockets'], 'Nginx': ['nginx'],
}


def contains(text: str, alias: str) -> bool:
    escaped = re.escape(alias)
    if re.match(r'[a-zA-Z0-9]', alias):
        escaped = r'(?<![a-zA-Z0-9_])' + escaped
    if re.search(r'[a-zA-Z0-9]$', alias):
        escaped += r'(?![a-zA-Z0-9_])'
    return bool(re.search(escaped, text, re.IGNORECASE))


def canonical_skill(name: str) -> str:
    stripped = name.strip()
    for canonical, aliases in ALIASES.items():
        if stripped.casefold() in [a.casefold() for a in [canonical, *aliases]]:
            return canonical
    return stripped


def extract_skills(text: str) -> list[str]:
    return [name for name, aliases in ALIASES.items() if any(contains(text, a) for a in aliases)]


def skill_evidence(text: str, skill: str) -> str:
    aliases = ALIASES.get(canonical_skill(skill), [skill])
    for line in re.split(r'[\n。；;]', text):
        if any(contains(line, alias) for alias in aliases):
            return line.strip()[:300]
    return ''
