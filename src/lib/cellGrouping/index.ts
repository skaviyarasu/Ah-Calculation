/** Public API of the cell-grouping module. */
export { parseRules, parseRulesText } from './loadRules.ts';
export { normalizeRules } from './normalize.ts';
export type { NormalizeResult, RuleIssue } from './normalize.ts';
export { applySteps, outputTable, summarizeGroups, DEFAULT_GROUP_COL } from './engine.ts';
export type { GroupSummary } from './engine.ts';
export { readWorkbook, exportResults, buildResultWorkbook, labelText, DEFAULT_CELL_LIST, GROUP_COLUMN } from './excel.ts';
export type { Workbook, CellListSheet } from './excel.ts';
export { frameFromGrid } from './frame.ts';
export { readCsv, resultToCsv, frameToCsv, parseCsvRows } from './csv.ts';
export type { CsvReadOptions, CsvWriteOptions } from './csv.ts';
export { RuleEvaluationError, SUPPORTED_OPS } from './conditions.ts';
export { preprocessExcel, preprocessSheetRows, preprocessGrid, dropMatchingRows, gridToCsvText, PreprocessError } from './preprocess.ts';
export {
  convertBatch,
  isPerCellReport,
  machineColumns,
  machineSheetRows,
  flattenedNames,
  batchFileStem,
  batchPreprocess,
  LFP_CONSTANTS,
  LFP_EXTRA_COLUMNS,
} from './lfpConvert.ts';
export type { BatchResult, ConvertedReport, ReportInput, TableCell, LfpConstants } from './lfpConvert.ts';
export { readReportTable, readReportInputs, batchToXlsx, batchToCsv, rawFilesZip, mergedFiles, mergedFilesZip, mergedFileXlsx } from './reportFiles.ts';
export { summarizeRun, isUnassignedGroup } from './runRecord.ts';
export type { RunSummary } from './runRecord.ts';
export type { PreprocessedFile } from './preprocess.ts';
export { CHEMISTRIES, missingRuleColumns } from './chemistry.ts';
export type { Chemistry, PublishedRules } from './chemistry.ts';
export { PyFloat } from './types.ts';
export type * from './types.ts';
export {
  unassignedCells,
  unassignedRows,
  actionableCells,
  latestCellRows,
  ruleColumns,
  nearestGroups,
  suggestSteps,
  applySuggestions,
  validateProposal,
  adjacentBand,
  conditionText,
} from './naWorkbench.ts';
export type { DuplicateCell, RunReport, UnassignedCell, NearestGroup, ConditionCheck, Suggestion, ValidationReport, CellChange } from './naWorkbench.ts';
export { compareRules, rerunUnassigned, reportGroupColumn, stepLines } from './rerun.ts';
export type { RulesComparison, StepChange, RerunResult } from './rerun.ts';
