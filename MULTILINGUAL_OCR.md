# CoalGuard.AI — Multilingual OCR Documentation

## Overview

CoalGuard.AI's OCR pipeline uses **Tesseract.js** for optical character recognition. It supports **100+ languages** including all major Indian languages, enabling document processing in the languages most relevant to Indian coal mining operations.

## Supported Languages

Tesseract.js language packs use ISO 639-2 or ISO 639-3 language codes. Below are the languages most relevant to Indian coal sector documentation:

| Code | Language | Script | Common Use Cases |
|------|----------|--------|------------------|
| `eng` | English | Latin | General documents, reports, forms |
| `hin` | Hindi | Devanagari | Hindi-language mine reports, safety notices |
| `tam` | Tamil | Tamil | Tamil Nadu mining documents |
| `tel` | Telugu | Telugu | Telangana/Andhra Pradesh mining docs |
| `mar` | Marathi | Devanagari | Maharashtra mining records |
| `guj` | Gujarati | Gujarati | Gujarat mining documentation |
| `kan` | Kannada | Kannada | Karnataka mining records |
| `mal` | Malayalam | Malayalam | Kerala mining documentation |
| `pan` | Punjabi | Gurmukhi | Punjab mining documents |
| `ory` | Odia | Odia | Odisha mining records |
| `asm` | Assamese | Bengali | Assam mining documentation |
| `urd` | Urdu | Arabic | Urdu-language mining records |
| `ben` | Bengali | Bengali | West Bengal mining docs |

For a complete list of 100+ supported languages, see: https://tesseract.projectnaptha.com/langs.html

## Configuration

### Environment Variable

Set the `COALGUARD_AI_OCR_LANGUAGES` environment variable with a comma-separated list of language codes:

```bash
# Single language (English only - default)
COALGUARD_AI_OCR_LANGUAGES=eng

# Multiple languages (English + Hindi + Tamil)
COALGUARD_AI_OCR_LANGUAGES=eng,hin,tam

# Multiple Indian languages
COALGUARD_AI_OCR_LANGUAGES=eng,hin,tam,tel,mar,guj,kan,mal,pan,ory,asm,urd,ben
```

### Configuration Priority

1. Environment variable `COALGUARD_AI_OCR_LANGUAGES` (highest priority)
2. Default: `eng` (English only)

### Example .env.local

```ini
# OCR Language Configuration
COALGUARD_AI_OCR_LANGUAGES=eng,hin,tam,tel,mar
```

## How Multilingual OCR Works

### Language Loading

When the OCR worker initializes (first OCR request), it loads **all** specified language packs simultaneously:

```typescript
const worker = await createWorker();
await worker.loadLanguage('eng,hin,tam');  // Load multiple languages
await worker.initialize('eng,hin,tam');    // Initialize all languages
```

### Language Detection & Recognition

Tesseract.js automatically detects which language(s) are present in each document page and recognizes text accordingly. No manual language selection is needed per document.

**Example workflow:**
1. User uploads a Hindi inspection report
2. OCR worker loads `eng,hin,tam` languages
3. Tesseract detects Hindi text and recognizes it using the `hin` language model
4. Extracted text is returned in the original language script
5. Confidence scores reflect OCR confidence per page

### Mixed-Language Documents

Tesseract.js handles documents containing text in multiple languages. For example, a document with English headers and Hindi body text will be processed correctly with `eng,hin` configured.

## Performance Considerations

| Factor | Impact |
|--------|--------|
| **More languages** = Slower initialization | Each language pack adds ~5-10 MB to memory |
| **More languages** = Slightly slower recognition | More language models to evaluate |
| **More languages** = Higher accuracy for multilingual docs | Better recognition of mixed-language documents |

**Recommendation:** Configure only the languages you expect to process. For most CoalGuard.AI deployments:
- English only: `eng`
- English + Hindi: `eng,hin`
- Regional focus: `eng,hin,tam,tel` (or relevant regional languages)

## Error Handling

If a requested language pack is not available:
- Tesseract.js will throw an error during `loadLanguage()`
- The OCR worker initialization will fail
- Document processing will return an error: `"OCR processing failed: ..."`

**Troubleshooting:**
1. Verify the language code is valid (ISO 639-2/639-3 format)
2. Ensure the language pack is available in the Tesseract.js installation
3. Check network connectivity (language packs are downloaded on first use)

## API Usage

### Document Upload with Language Detection

```bash
curl -X POST http://localhost:4000/api/v1/documents/upload \
  -F "file=@inspection_report.pdf" \
  -F "name=Hindi Inspection Report" \
  -F "type=inspection_report" \
  -F "mineId=mine-01" \
  -H "Authorization: Bearer <token>"
```

The system automatically detects the document language(s) using the configured OCR languages.

### Retrieving Extracted Text

```bash
curl -X GET http://localhost:4000/api/v1/documents/:id/extraction \
  -H "Authorization: Bearer <token>"
```

Response includes:
- `extractedText`: Full extracted text in original language
- `extractedFields`: Candidate fields with page references
- `detectedLanguage`: Detected language code
- `ocrEngine`: `"tesseract.js"`
- `ocrConfidence`: OCR confidence score (0-1)

## Integration with AI Assistant

The AI chatbot (`/api/v1/chat/sessions/{id}/message`) uses RAG to search extracted document text across all supported languages. When a user asks a question in any supported language, the system:

1. Retrieves relevant document chunks via vector search
2. Passes context to the LLM (using `CHATBOT_API_KEY`)
3. Returns answers in the user's language with document citations

## Best Practices

### For Hindi Documents
```ini
COALGUARD_AI_OCR_LANGUAGES=eng,hin
```
Use this for documents containing English headers/forms with Hindi content.

### For Multi-State Operations
```ini
COALGUARD_AI_OCR_LANGUAGES=eng,hin,tam,tel,mar,guj,kan,mal
```
Covers major mining states: Jharkhand, Odisha, Chhattisgarh, West Bengal, Madhya Pradesh, Maharashtra, Telangana, Andhra Pradesh, Karnataka, Kerala, Gujarat, Punjab.

### For Single-State Operations
```ini
COALGUARD_AI_OCR_LANGUAGES=eng,tam
```
Example: Tamil Nadu operations only.

## Limitations

1. **Language detection is automatic but not perfect** - Mixed scripts may reduce accuracy
2. **Handwritten text** - OCR accuracy is lower for handwritten documents regardless of language
3. **Low-quality scans** - Blurry or skewed documents reduce accuracy for all languages
4. **Language pack size** - Each language adds ~5-10 MB to memory usage; loading 10+ languages may exceed memory limits on small instances

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| `Language data not found` | Invalid language code | Verify ISO 639-2/639-3 code |
| `OCR worker failed to initialize` | Missing language pack | Check network connectivity; verify language code |
| `Poor recognition accuracy` | Low-quality scan or handwritten text | Improve scan quality; use higher resolution |
| `Mixed language not recognized` | Missing one language code | Add all relevant language codes to config |
| `Slow OCR processing` | Too many languages loaded | Reduce to only needed languages |

## Examples

### Single-Language (English)
```ini
COALGUARD_AI_OCR_LANGUAGES=eng
```
Use for: English-only documentation, reports, forms.

### Dual-Language (English + Hindi)
```ini
COALGUARD_AI_OCR_LANGUAGES=eng,hin
```
Use for: Bilingual documents common in Indian mining sector.

### Multi-Regional (Major Indian Languages)
```ini
COALGUARD_AI_OCR_LANGUAGES=eng,hin,tam,tel,mar,guj,kan,mal
```
Use for: Multi-state mining operations across India.

## Related Configuration

- `COALGUARD_AI_MAX_BYTES` — Maximum document size for OCR (default: 5 MB)
- `COALGUARD_AI_MAX_PAGES` — Maximum PDF pages to process (default: 50)
- `COALGUARD_AI_WORKFLOW_MAX_DURATION_MINUTES` — OCR processing timeout (default: 60 minutes)
- `CHATBOT_API_KEY` — Required for AI assistant chatbot with RAG over OCR'd documents