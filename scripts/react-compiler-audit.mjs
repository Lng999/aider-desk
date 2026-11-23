#!/usr/bin/env node
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createRequire } from 'node:module';

import { transformFromAstSync } from '@babel/core';
import * as BabelParser from '@babel/parser';
import BabelPluginReactCompiler, { ErrorSeverity } from 'babel-plugin-react-compiler';

const require = createRequire(import.meta.url);
const { version: pluginVersion } = require('babel-plugin-react-compiler/package.json');

const SRC_ROOT = 'src/renderer/src';
const FILE_RE = /\.(ts|tsx)$/;
const TEST_FILE_RE = /\.(test|spec)\.(ts|tsx)$/;
const EMITTED_RUNTIME_RE = /react\/compiler-runtime|useMemoCache/;

const SEVERITY_RANK = {
  [ErrorSeverity.Error]: 3,
  [ErrorSeverity.Warning]: 2,
  [ErrorSeverity.Hint]: 1,
  [ErrorSeverity.Off]: 0,
};

const walk = (dir) =>
  fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      if (entry.isDirectory()) {
        if (entry.name === '__tests__') return [];
        return walk(path.join(dir, entry.name));
      }
      if (!FILE_RE.test(entry.name) || TEST_FILE_RE.test(entry.name)) return [];
      return [path.join(dir, entry.name)];
    })
    .sort();

const collectOptOutLines = (ast) => {
  const lines = new Set();
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    const directives = node.body?.directives;
    if (Array.isArray(directives) && directives.some((d) => d?.value?.value === 'use no memo')) {
      if (node.loc?.start?.line != null) lines.add(node.loc.start.line);
      if (node.body?.loc?.start?.line != null) lines.add(node.body.loc.start.line);
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) {
        for (const item of value) visit(item);
      } else if (value && typeof value === 'object' && typeof value.type === 'string') {
        visit(value);
      }
    }
  };
  visit(ast);
  return lines;
};

const extractCategory = (detail) => detail?.options?.category ?? detail?.category ?? null;

const extractMessage = (detail) =>
  detail?.detail?.message ?? detail?.options?.message ?? detail?.message ?? detail?.options?.reason ?? String(detail);

const classifyEvents = (events, optOutLines) => {
  const compiled = [];
  const skipped = [];
  const failuresByFn = new Map();
  const seenSuccess = new Set();
  const seenSkip = new Set();

  for (const event of events) {
    const line = event.fnLoc?.start?.line ?? null;
    const fnKey = `${line ?? 'unknown'}:${event.fnName ?? ''}`;

    if (event.kind === 'CompileSuccess') {
      if (seenSuccess.has(fnKey)) continue;
      seenSuccess.add(fnKey);
      compiled.push({ name: event.fnName ?? null, line });
    } else if (event.kind === 'CompileSkip' || (line != null && optOutLines.has(line))) {
      if (seenSkip.has(fnKey)) continue;
      seenSkip.add(fnKey);
      skipped.push({ name: event.fnName ?? null, line });
    } else if (event.kind === 'CompileError' || event.kind === 'PipelineError') {
      const severity = event.kind === 'CompileError' ? (event.detail?.severity ?? ErrorSeverity.Error) : ErrorSeverity.Error;
      const category = extractCategory(event.detail);
      const message = extractMessage(event.detail);
      const existing = failuresByFn.get(fnKey);
      if (!existing) {
        failuresByFn.set(fnKey, {
          line,
          name: event.fnName ?? null,
          severity,
          category,
          message,
          errorCount: 1,
          extraCategories: new Set(),
        });
      } else {
        existing.errorCount++;
        if ((SEVERITY_RANK[severity] ?? 0) > (SEVERITY_RANK[existing.severity] ?? 0)) {
          if (existing.category) existing.extraCategories.add(existing.category);
          existing.severity = severity;
          existing.category = category;
          existing.message = message;
        } else if (category && category !== existing.category) {
          existing.extraCategories.add(category);
        }
      }
    }
  }

  const failures = Array.from(failuresByFn.values()).map((f) => ({
    line: f.line,
    name: f.name,
    severity: f.severity,
    category: f.category,
    message: f.message,
    errorCount: f.errorCount,
    extraCategories: Array.from(f.extraCategories),
  }));

  return { compiled, skipped, failures };
};

const auditFile = (file) => {
  const source = fs.readFileSync(file, 'utf8');
  const result = {
    file,
    compiled: [],
    skipped: [],
    failures: [],
    crash: null,
    emitsRuntime: false,
  };
  const events = [];
  try {
    const parserPlugins = file.endsWith('.ts') ? ['typescript'] : ['typescript', 'jsx'];
    const ast = BabelParser.parse(source, {
      sourceFilename: file,
      sourceType: 'module',
      plugins: parserPlugins,
    });
    const optOutLines = collectOptOutLines(ast);
    const babelResult = transformFromAstSync(ast, source, {
      filename: file,
      sourceType: 'module',
      configFile: false,
      babelrc: false,
      retainLines: false,
      plugins: [[BabelPluginReactCompiler, { logger: { logEvent: (_f, event) => events.push(event) } }]],
    });
    result.emitsRuntime = EMITTED_RUNTIME_RE.test(babelResult?.code ?? '');
    Object.assign(result, classifyEvents(events, optOutLines));
  } catch (error) {
    result.crash = String(error.message ?? error).split('\n')[0];
  }
  return result;
};

const formatFailure = (f) => {
  const suffixParts = [];
  if (f.errorCount > 1) suffixParts.push(`+${f.errorCount - 1} more`);
  if (f.extraCategories.length > 0) suffixParts.push(`also: ${f.extraCategories.join(', ')}`);
  const suffix = suffixParts.length > 0 ? ` (${suffixParts.join('; ')})` : '';
  const tag = f.category ? `[${f.category}] ` : '';
  return `${f.file}:${f.line}${f.name ? ` [${f.name}]` : ''} — ${tag}${f.message}${suffix}`;
};

const run = () => {
  const files = walk(SRC_ROOT);
  const results = files.map(auditFile);

  const compiledCount = results.reduce((acc, r) => acc + r.compiled.length, 0);
  const skipped = results.flatMap((r) => r.skipped.map((s) => ({ ...s, file: r.file })));
  const failures = results.flatMap((r) => r.failures.map((f) => ({ ...f, file: r.file })));
  const errors = failures.filter((f) => f.severity === ErrorSeverity.Error);
  const warnings = failures.filter((f) => f.severity === ErrorSeverity.Warning);
  const hints = failures.filter((f) => f.severity !== ErrorSeverity.Error && f.severity !== ErrorSeverity.Warning);
  const attempted = compiledCount + failures.length;
  const crashed = results.filter((r) => r.crash);
  const coverage = attempted > 0 ? ((compiledCount / attempted) * 100).toFixed(1) : 'n/a';

  console.log(`React Compiler coverage audit — babel-plugin-react-compiler@${pluginVersion}`);
  console.log(`Scanned ${files.length} production files in ${SRC_ROOT} (excluding tests)`);
  console.log('');
  console.log(`Compiled functions:   ${compiledCount}/${attempted} (${coverage}% of attempted)`);
  console.log(`Failed functions:     ${failures.length} (errors: ${errors.length}, warnings: ${warnings.length}, todos/hints: ${hints.length})`);
  console.log(`Explicit opt-outs:    ${skipped.length} ('use no memo')`);
  console.log(`Emitted runtime:      ${results.filter((r) => r.emitsRuntime).length} files`);
  console.log(`Parse/plugin crashes: ${crashed.length}`);

  const printList = (title, items, format) => {
    if (items.length === 0) return;
    console.log('');
    console.log(`${title} (${items.length}):`);
    for (const item of items) console.log(`  ${format(item)}`);
  };

  printList('Errors (Rules of React violations / ESLint suppressions)', errors, formatFailure);
  printList('Warnings (incompatible libraries / compiler warnings)', warnings, formatFailure);
  printList('Todos / Hints (compiler limitations)', hints, formatFailure);
  printList("Explicit 'use no memo' opt-outs", skipped, (s) => `${s.file}:${s.line}${s.name ? ` [${s.name}]` : ''}`);
  printList('Unparseable / plugin crashes (excluded from coverage)', crashed, (r) => `${r.file} — ${r.crash}`);
};

run();
