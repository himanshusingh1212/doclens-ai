# Squad A — PDF Extraction

> **Focus Area:** Document Ingestion, Parsing, and Layout Analysis  
> **Team Size:** 13 Members (1 Lead, 12 Engineers)  
> **Primary Pipeline:** [[PDF Extraction Pipeline]]

---

## Purpose

**Squad A** is responsible for the document ingestion phase. They handle file parsing, text extraction, OCR processing, and lay the structural foundation for the rest of the application pipelines.

---

## Key Responsibilities

- **PDF Parsing:** Extracts raw text layers, layouts, and coordinates from uploaded documents.
- **OCR Processing:** Converts scanned PDFs and images into structured text blocks.
- **Layout Analysis:** Detects text columns, lists, and headings, and removes document noise (e.g., page numbers, headers).
- **Ingestion UI:** Builds and maintains upload dropzones, libraries, and PDF viewer canvases.

---

## Team Roles

| Role | Count | Primary Focus |
|------|-------|---------------|
| **Squad Lead** | 1 | Team lead, coordinates extraction pipelines |
| **PDF Parsing Engineers** | 4 | Text and coordinate extraction (Depth 1) |
| **OCR Specialists** | 4 | Scan extraction and pre-processing (Depth 1) |
| **Text Cleaning Engineers** | 4 | Text cleaning and structural normalization (Depth 2) |

---

## Related

- [[PDF Extraction Pipeline]] — Technical pipeline owned by this squad.
- [[PDF Viewer]] — Core feature owned by this squad.
- [[MOC — Teams]] — Team structure.

---

*Part of [[MOC — Teams]]*
