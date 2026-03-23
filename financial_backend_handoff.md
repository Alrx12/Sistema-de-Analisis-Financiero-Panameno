# Financial Analysis Backend -- Technical Handoff

Date: 2026-03-20

## 1. System Overview

Backend built with FastAPI that: - Receives bank statements
(CSV/XLS/XLSX) - Parses transactions (bank-specific logic) - Detects or
creates accounts - Generates financial analysis - Stores only aggregated
results (no raw data)

------------------------------------------------------------------------

## 2. Architecture

Client → API → FileService → ProcessingService → ParserFactory → Parsers
→ AccountDetection → AnalysisService → DB

------------------------------------------------------------------------

## 3. Core Flow

1.  Upload file
2.  Save temp file
3.  Detect parser (structure-based)
4.  Parse transactions
5.  Validate single account
6.  Detect/create account
7.  Generate analysis
8.  Save snapshot
9.  Delete file

------------------------------------------------------------------------

## 4. Modules

### FileService

-   Validates extension/size
-   Stores temp file

### ProcessingService

-   Orchestrates full pipeline
-   Handles errors (422 / 500)

### ParserFactory

-   Chooses parser via detect_score()
-   No filename-based logic

### Parsers

-   Banco General
-   BAC
-   Banistmo
-   Handle multiple layouts

### AccountDetectionService

-   Reuses or creates accounts
-   Confidence-based logic

### AnalysisService

-   Computes KPIs
-   Outputs JSON analysis

------------------------------------------------------------------------

## 5. Database

### ProcessingJob

-   Tracks processing lifecycle
-   Includes filename + file_type (nullable)

### AnalysisSnapshot

-   Stores aggregated analysis only

------------------------------------------------------------------------

## 6. Data Policy

Stored: - Aggregated metrics

NOT stored: - Raw transactions - Files - Personal identifiers

------------------------------------------------------------------------

## 7. Key Decisions

-   No file persistence (legal + security)
-   Structure-based parser detection
-   One account per file
-   Soft confidence model

------------------------------------------------------------------------

## 8. Known Issues

-   Weak categorization ("otros" too large)
-   Basic recommendations
-   Transfers counted as income
-   Parser fragility to format changes

------------------------------------------------------------------------

## 9. Testing

Run: python -m pytest -q

------------------------------------------------------------------------

## 10. Critical Rules

DO NOT: - Pass UploadFile.file to parsers - Depend on filename - Store
raw financial data

ALWAYS: - Use temp file path - Cleanup files - Validate account
consistency

------------------------------------------------------------------------

## 11. Next Phase

-   Improve categorization
-   Improve recommendations
-   Separate transfers vs income
-   Prepare frontend

------------------------------------------------------------------------

## 12. Status

✅ Parsing works with real bank data\
✅ Full pipeline operational\
⚠️ Intelligence layer needs improvement
