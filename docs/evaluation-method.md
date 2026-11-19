# Offline Evaluation Method

## Purpose and ownership

This evaluation provides a reproducible regression check for the offline 职启云帆 pipeline without changing production code. It exercises the exact functions used by the application:

- `app.nodes.parsers.local_job`
- `app.nodes.parsers.local_resume`
- `app.tools.scoring.score_match`
- `app.rag.MaterialRetriever(mode=..., persist_directory=...).search`

The fixtures and labels are project-authored synthetic data. They are not real candidates, real jobs, human real annotations, or manually reviewed production samples. The word “hand-authored” here means a deterministic project test expectation, not a claim about human annotation studies.

## Datasets

The score dataset contains 30 distinct JD/resume pairs:

- 15 `strong_coverage` cases, covering Python backend, agent, RAG, data, ML, testing, and deployment stacks.
- 15 `weak_or_nonmatching` cases, including partial Python coverage and unrelated Java, frontend, mobile, PM, operations, and non-technical stacks.
- Every company name contains `Synthetic`, every case sets `synthetic: true`, and IDs and `(jd_text, resume_text)` pairs are unique.
- Each case has a hand-authored expected score range. Ranges are deliberately narrower than 0–100 and constrain the expected quality band; they are not copied from the calculator output in the report.
- Strong cases start at 70 or above. Weak/nonmatching cases end at 45 or below.

Retrieval uses an independent set of eight synthetic material sets and queries. Each case has authored `relevant_ids`, and every relevant ID must exist in that case's material set. Retrieval labels are independent from score-case resumes and JDs.

## Metrics

### Score range accuracy

For every score case:

1. Parse the JD with the production `local_job`.
2. Parse the resume with the production `local_resume`.
3. Call production `score_match(requirements, resume_skills, resume_text)`.
4. Mark the case as passing when `expected_score_range.min <= actual_score <= expected_score_range.max`.

Score accuracy is the number of in-range cases divided by 30. Accuracy is also reported by category. Case-level output includes actual score, expected range, matched skills, missing skills, and the production breakdown. A fixture exception is reported as a failed case rather than replacing the metric with a fabricated value.

### Alias versus exact baseline

The alias check compares two spellings-only strategies:

- Production path: run `score_match` with one requirement and one resume skill/text item.
- Exact baseline: case-insensitive exact string equality, with no alias expansion.

True aliases include `sklearn` → `scikit-learn`, `postgres` → `PostgreSQL`, `k8s` → `Kubernetes`, `torch` → `PyTorch`, and `reactjs` → `React`. The exact baseline should miss spelling variants that production recognizes.

Distinct frameworks are tested as negative cases, including LangGraph versus LangChain, Java versus JavaScript, PyTorch versus TensorFlow, and FastAPI versus Django. Neither strategy may merge these related-but-different technologies.

### Retrieval Recall@k

The default evaluation instantiates the real local retriever and reports the mode exposed by `retriever.mode`, currently `local-hybrid`. For each retrieval case:

```text
recall@k = |returned IDs ∩ authored relevant_ids| / |authored relevant_ids|
```

The summary reports the mean across retrieval cases.

If current BM25 and local sparse-vector helper functions are accessible, the report also includes component-level BM25 and sparse-vector Recall@k for comparison with `local-hybrid`. If those helpers are unavailable or move without a callable replacement, comparison is disabled and the limitation says only the public hybrid result was measured. The evaluation does not create a simulated vector baseline.

`--rag-mode bge` uses the actual `MaterialRetriever(mode="bge")` path and its configured BGE/Chroma runtime. If optional dependencies or models are unavailable, the command fails clearly; it never substitutes local scores or fabricated BGE results.

### Timing

All reported durations are measured with `time.perf_counter()` around the real operations. Parser/scoring, alias, retrieval, and total durations are reported separately. Timing varies by machine and run and is not used as a quality gate.

## Command line

From `backend/`:

```powershell
..\.venv\Scripts\python.exe -m eval.run_eval --output ..\docs\evaluation-report.json
```

From the repository root with `backend` on `PYTHONPATH`:

```powershell
$env:PYTHONPATH='backend'
.venv\Scripts\python.exe -m eval.run_eval --output docs/evaluation-report.json
```

The default command is report-only and exits zero after writing the report. An optional unit-interval gate may be used by CI:

```powershell
.venv\Scripts\python.exe -m eval.run_eval --output docs/evaluation-report.json --min-score-accuracy 0.8
```

With the gate enabled, the CLI exits nonzero only when measured score-range accuracy is below the threshold. `--retrieval-top-k` controls the Recall cutoff, and `--rag-mode` selects `local` or actual `bge`.

The JSON report includes schema version, generation time, dataset provenance, score-case count, actual retrieval mode, metrics, case results, limitations, thresholds when supplied, and measured durations.

## Limitations

- All cases and labels are synthetic and deterministic; they do not estimate human agreement or hiring quality.
- Scores measure weighted skill-string coverage and are not probability of hire.
- The parser is lexical and has a limited negation filter; it does not provide general sentence-level semantic understanding. Synthetic evaluation fixtures avoid ambiguous negative claims, while focused parser tests cover selected negations.
- Default evaluation is offline and reports no Token counts or costs.
- Local mode does not run BGE and makes no BGE quality or latency claim.
- A separate dense-vector baseline is not measured in local mode; sparse-vector comparison, when present, uses the local lexical sparse-vector helper actually exposed by the implementation.
- Timings are local wall-clock observations, not controlled benchmarks.
