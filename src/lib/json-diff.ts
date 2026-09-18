export type DiffLineType = 'add' | 'del' | 'same';

export interface DiffLine {
  type: DiffLineType;
  oldLineNumber?: number;
  newLineNumber?: number;
  text: string;
}

export interface SplitDiffCell {
  lineNumber?: number;
  type: DiffLineType | 'empty';
  text: string;
}

export interface SplitDiffRow {
  left: SplitDiffCell;
  right: SplitDiffCell;
}

export interface JsonDiffResult {
  lines: DiffLine[];
  splitRows: SplitDiffRow[];
  stats: {
    additions: number;
    deletions: number;
  };
  patch: string;
}

/**
 * Computes line-by-line diff using Myers diff algorithm.
 */
export function computeLineDiff(oldLines: string[], newLines: string[]): DiffLine[] {
  const n = oldLines.length;
  const m = newLines.length;

  if (n === 0 && m === 0) {
    return [];
  }

  if (n === 0) {
    return newLines.map((text, i) => ({
      type: 'add',
      newLineNumber: i + 1,
      text,
    }));
  }

  if (m === 0) {
    return oldLines.map((text, i) => ({
      type: 'del',
      oldLineNumber: i + 1,
      text,
    }));
  }

  const max = n + m;
  const offset = max;
  const v = new Int32Array(2 * max + 1);
  v.fill(-1);
  v[1 + offset] = 0;

  const trace: Int32Array[] = [];

  let reached = false;
  for (let d = 0; d <= max; d++) {
    const vCopy = new Int32Array(v);
    trace.push(vCopy);

    for (let k = -d; k <= d; k += 2) {
      let x: number;
      if (k === -d || (k !== d && v[k - 1 + offset] < v[k + 1 + offset])) {
        x = v[k + 1 + offset];
      } else {
        x = v[k - 1 + offset] + 1;
      }
      let y = x - k;
      while (x < n && y < m && oldLines[x] === newLines[y]) {
        x++;
        y++;
      }
      v[k + offset] = x;
      if (x >= n && y >= m) {
        reached = true;
        break;
      }
    }
    if (reached) break;
  }

  // Backtrack through trace to build the diff script
  const script: { type: DiffLineType; x: number; y: number }[] = [];
  let x = n;
  let y = m;

  for (let d = trace.length - 1; d > 0; d--) {
    const vPrev = trace[d];
    const k = x - y;
    let prevK: number;
    if (k === -d || (k !== d && vPrev[k - 1 + offset] < vPrev[k + 1 + offset])) {
      prevK = k + 1;
    } else {
      prevK = k - 1;
    }
    const prevX = vPrev[prevK + offset];
    const prevY = prevX - prevK;

    while (x > prevX && y > prevY) {
      x--;
      y--;
      script.push({ type: 'same', x, y });
    }
    if (x === prevX) {
      y--;
      script.push({ type: 'add', x: -1, y });
    } else {
      x--;
      script.push({ type: 'del', x, y: -1 });
    }
  }

  while (x > 0 && y > 0) {
    x--;
    y--;
    script.push({ type: 'same', x, y });
  }

  script.reverse();

  const result: DiffLine[] = [];
  let curOld = 1;
  let curNew = 1;

  for (const item of script) {
    if (item.type === 'same') {
      result.push({
        type: 'same',
        oldLineNumber: curOld++,
        newLineNumber: curNew++,
        text: oldLines[item.x],
      });
    } else if (item.type === 'del') {
      result.push({
        type: 'del',
        oldLineNumber: curOld++,
        text: oldLines[item.x],
      });
    } else if (item.type === 'add') {
      result.push({
        type: 'add',
        newLineNumber: curNew++,
        text: newLines[item.y],
      });
    }
  }

  return result;
}

/**
 * Builds side-by-side (split) rows from unified diff lines.
 */
export function buildSplitRows(lines: DiffLine[]): SplitDiffRow[] {
  const rows: SplitDiffRow[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.type === 'same') {
      rows.push({
        left: { lineNumber: line.oldLineNumber, type: 'same', text: line.text },
        right: { lineNumber: line.newLineNumber, type: 'same', text: line.text },
      });
      i++;
    } else {
      // Gather contiguous block of deletions and additions
      const delBlock: DiffLine[] = [];
      const addBlock: DiffLine[] = [];

      while (i < lines.length && lines[i].type !== 'same') {
        if (lines[i].type === 'del') {
          delBlock.push(lines[i]);
        } else if (lines[i].type === 'add') {
          addBlock.push(lines[i]);
        }
        i++;
      }

      const count = Math.max(delBlock.length, addBlock.length);
      for (let j = 0; j < count; j++) {
        const d = delBlock[j];
        const a = addBlock[j];
        rows.push({
          left: d
            ? { lineNumber: d.oldLineNumber, type: 'del', text: d.text }
            : { type: 'empty', text: '' },
          right: a
            ? { lineNumber: a.newLineNumber, type: 'add', text: a.text }
            : { type: 'empty', text: '' },
        });
      }
    }
  }

  return rows;
}

/**
 * Compares two JSON objects (already cleaned or raw) and computes
 * unified diff lines, split view rows, addition/deletion stats, and patch text.
 */
export function computeJsonDiff(
  beforeObj: Record<string, unknown> | null | undefined,
  afterObj: Record<string, unknown> | null | undefined
): JsonDiffResult {
  const beforeStr = beforeObj != null ? JSON.stringify(beforeObj, null, 2) : '';
  const afterStr = afterObj != null ? JSON.stringify(afterObj, null, 2) : '';

  const oldLines = beforeStr ? beforeStr.split('\n') : [];
  const newLines = afterStr ? afterStr.split('\n') : [];

  const lines = computeLineDiff(oldLines, newLines);
  const splitRows = buildSplitRows(lines);

  let additions = 0;
  let deletions = 0;
  const patchLines: string[] = [];

  for (const line of lines) {
    if (line.type === 'add') {
      additions++;
      patchLines.push(`+ ${line.text}`);
    } else if (line.type === 'del') {
      deletions++;
      patchLines.push(`- ${line.text}`);
    } else {
      patchLines.push(`  ${line.text}`);
    }
  }

  return {
    lines,
    splitRows,
    stats: { additions, deletions },
    patch: patchLines.join('\n'),
  };
}
