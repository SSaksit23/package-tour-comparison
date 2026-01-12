# Comparison Module Issue Analysis

## Problem
- **Daily Comparison view (Structured Data tab)**: Shows ALL competitors with full daily breakdown details ✅
- **Comparison module (Comparison tab)**: Only shows 5-6 products ❌

## Root Cause

Found in `services/geminiService.ts` at **line 402-404**:

```typescript
// Limit columns for better table formatting
const maxColumns = 6;
const displayCompetitors = competitors.slice(0, maxColumns);
```

This limits the AI-generated comparison text to only **6 competitors maximum**, even if more competitors are analyzed.

## Impact

1. **DataComparisonTable component** (`components/DataComparisonTable.tsx`):
   - Shows ALL analyzed competitors ✅
   - No limiting found in this component
   - Line 168: `const analyzedCompetitors = competitors.filter(c => c.analysis);`
   - Displays all competitors that have analysis data

2. **getComparison function** (`services/geminiService.ts`):
   - Limits to 6 competitors when generating AI comparison text
   - Line 404: `const displayCompetitors = competitors.slice(0, maxColumns);`
   - Line 434: Creates table with only `displayCompetitors`
   - This affects the "AI Analysis" view mode in ComparisonView

3. **ComparisonView component** (`components/ComparisonView.tsx`):
   - Has two view modes: "Stored Data" and "AI Analysis"
   - "Stored Data" mode uses DataComparisonTable (shows all)
   - "AI Analysis" mode uses the comparison text from getComparison (limited to 6)

## Key Files

1. **services/geminiService.ts** (lines 402-404, 434)
   - `maxColumns = 6` hardcoded limit
   - `displayCompetitors = competitors.slice(0, maxColumns)`

2. **services/aiService.ts** (lines 250-313)
   - No limiting found - processes all competitors
   - Different implementation (OpenAI vs Gemini)

3. **components/DataComparisonTable.tsx**
   - No limiting - shows all analyzed competitors

## Which Service is Being Used?

The app uses `aiProvider.ts` which routes to different services based on configuration:
- `geminiService.ts` (has the 6-competitor limit)
- `aiService.ts` (no limit)
- `vertexAiService.ts` (need to check)

## Notes

- The limit of 6 is likely for markdown table formatting reasons (mentioned in comments)
- The StructuredDataView correctly shows all competitors
- DataComparisonTable correctly shows all competitors
- Only the AI-generated comparison text is limited

## Recommendation

To fix this, we need to:
1. Remove or increase the `maxColumns` limit in `geminiService.ts`
2. Or make it dynamic/configurable
3. Or handle more competitors in the table formatting logic
