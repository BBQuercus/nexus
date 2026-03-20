// ============================================================
// Diff Viewer Component
// ============================================================

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export interface DiffLine {
  type: 'add' | 'remove' | 'context';
  lineNum?: number;
  text: string;
}

export function renderDiff(
  filename: string,
  additions: string[],
  deletions: string[]
): HTMLElement {
  const container = document.createElement('div');
  container.className = 'diff-block';

  // Header
  const header = document.createElement('div');
  header.className = 'diff-block__header';
  header.innerHTML = `
    <span>${escapeHtml(filename)}</span>
    <span style="color: var(--accent)">+${additions.length}</span>
    <span style="color: var(--error)">-${deletions.length}</span>
  `;
  container.appendChild(header);

  // Content
  const content = document.createElement('div');
  content.className = 'diff-block__content';

  // Interleave deletions and additions
  let lineNum = 1;
  for (const line of deletions) {
    content.innerHTML += `
      <div class="diff-line diff-line--remove">
        <span class="diff-line__num">${lineNum}</span>
        <span class="diff-line__text">- ${escapeHtml(line)}</span>
      </div>`;
    lineNum++;
  }

  for (const line of additions) {
    content.innerHTML += `
      <div class="diff-line diff-line--add">
        <span class="diff-line__num">${lineNum}</span>
        <span class="diff-line__text">+ ${escapeHtml(line)}</span>
      </div>`;
    lineNum++;
  }

  container.appendChild(content);
  return container;
}

export function renderDiffFromLines(filename: string, lines: DiffLine[]): HTMLElement {
  const container = document.createElement('div');
  container.className = 'diff-block';

  const adds = lines.filter((l) => l.type === 'add').length;
  const removes = lines.filter((l) => l.type === 'remove').length;

  const header = document.createElement('div');
  header.className = 'diff-block__header';
  header.innerHTML = `
    <span>${escapeHtml(filename)}</span>
    <span style="color: var(--accent)">+${adds}</span>
    <span style="color: var(--error)">-${removes}</span>
  `;
  container.appendChild(header);

  const content = document.createElement('div');
  content.className = 'diff-block__content';

  for (const line of lines) {
    const prefix = line.type === 'add' ? '+ ' : line.type === 'remove' ? '- ' : '  ';
    const lineNumStr = line.lineNum !== undefined ? String(line.lineNum) : '';
    content.innerHTML += `
      <div class="diff-line diff-line--${line.type}">
        <span class="diff-line__num">${lineNumStr}</span>
        <span class="diff-line__text">${prefix}${escapeHtml(line.text)}</span>
      </div>`;
  }

  container.appendChild(content);
  return container;
}
