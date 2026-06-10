# 👥 MOC — Teams

> Organizational structure and team distribution for the DocLens AI project (50-member team).

---

## Leadership

- [[Engineering Head]] — Oversees all squads, technical direction, and delivery.
- [[Project Management]] — Manages schedules, roadmaps, and agile sprint coordination.

---

## Delivery Squads

```mermaid
graph TD
    EH[Engineering Head] --> PM[Project Management]
    EH --> A[Squad A: PDF Extraction]
    EH --> B[Squad B: Translation]
    EH --> C: [Squad C: TTS]
    EH --> SS[Shared Services]
    EH --> BR[Buffer Reserve]
```

### Squad A — PDF Extraction

- **Scope:** Ingests document binaries, extracts text content, handles layout analysis, and generates page thumbnails.
- **Details:** [[Squad A — PDF Extraction]]
- **Pipeline:** [[PDF Extraction Pipeline]]

### Squad B — Translation

- **Scope:** Connects to LLM services, handles translation logic, matches terminology lists, and manages context memory.
- **Details:** [[Squad B — Translation]]
- **Pipeline:** [[Translation Pipeline]]

### Squad C — TTS

- **Scope:** Manages text-to-speech features, configures voice engines, handles WASM loading, and coordinates playback.
- **Details:** [[Squad C — TTS]]
- **Pipeline:** [[TTS Pipeline]]

---

## Shared & Support Services

- [[Shared Services]] — Infrastructure, security, API routing, QA, and deployment support.
- [[Buffer Reserve]] — Agile team members allocated on-demand to support squads with high workloads.

---

## Related MOCs

- [[MOC — Roles]] — Roles and responsibilities within each team
- [[MOC — Pipelines]] — Technical pipelines owned by the squads

---

_Part of [[00 — MOC — Project]]_
