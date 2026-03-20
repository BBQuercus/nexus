// ============================================================
// Data Table Component
// ============================================================

function escapeHtml(text: string): string {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function isNumeric(value: string | number): boolean {
  if (typeof value === 'number') return true;
  return !isNaN(Number(value)) && value.trim() !== '';
}

export function renderDataTable(
  headers: string[],
  rows: (string | number)[][],
  totalRows: number,
  source?: string
): HTMLElement {
  const container = document.createElement('div');
  container.className = 'data-table';

  // Determine which columns are numeric
  const numericCols = headers.map((_, colIndex) => {
    return rows.slice(0, 10).every((row) => {
      const val = row[colIndex];
      return val === undefined || val === null || val === '' || isNumeric(val);
    });
  });

  // State
  let sortCol = -1;
  let sortDir: 'asc' | 'desc' = 'asc';
  let showAll = false;
  const INITIAL_ROWS = 20;

  function render(): void {
    let sortedRows = [...rows];

    if (sortCol >= 0) {
      sortedRows.sort((a, b) => {
        const aVal = a[sortCol];
        const bVal = b[sortCol];
        if (numericCols[sortCol]) {
          const diff = Number(aVal || 0) - Number(bVal || 0);
          return sortDir === 'asc' ? diff : -diff;
        }
        const cmp = String(aVal || '').localeCompare(String(bVal || ''));
        return sortDir === 'asc' ? cmp : -cmp;
      });
    }

    const displayRows = showAll ? sortedRows : sortedRows.slice(0, INITIAL_ROWS);

    // Header
    let html = `<div class="data-table__header">
      <span class="data-table__title">${source ? escapeHtml(source) + ' \u00B7 ' : ''}${totalRows} rows</span>
      <div class="data-table__actions">
        <button class="data-table__action-btn" data-action="copy-tsv">Copy TSV</button>
        <button class="data-table__action-btn" data-action="download-csv">Download CSV</button>
      </div>
    </div>`;

    // Table
    html += `<div class="data-table__scroll"><table>`;
    html += `<thead><tr>`;
    headers.forEach((h, i) => {
      const numClass = numericCols[i] ? ' numeric' : '';
      let sortClass = '';
      if (sortCol === i) {
        sortClass = sortDir === 'asc' ? ' sorted-asc' : ' sorted-desc';
      }
      html += `<th class="${numClass}${sortClass}" data-col="${i}">${escapeHtml(h)}</th>`;
    });
    html += `</tr></thead><tbody>`;

    for (const row of displayRows) {
      html += `<tr>`;
      headers.forEach((_, i) => {
        const val = row[i] ?? '';
        const numClass = numericCols[i] ? ' numeric' : '';
        html += `<td class="${numClass}">${escapeHtml(String(val))}</td>`;
      });
      html += `</tr>`;
    }

    html += `</tbody></table></div>`;

    if (!showAll && rows.length > INITIAL_ROWS) {
      html += `<button class="data-table__show-more" data-action="show-all">Show all ${totalRows} rows</button>`;
    }

    container.innerHTML = html;

    // Event listeners
    container.querySelectorAll('th[data-col]').forEach((th) => {
      th.addEventListener('click', () => {
        const col = parseInt((th as HTMLElement).dataset.col || '0', 10);
        if (sortCol === col) {
          sortDir = sortDir === 'asc' ? 'desc' : 'asc';
        } else {
          sortCol = col;
          sortDir = 'asc';
        }
        render();
      });
    });

    const showAllBtn = container.querySelector('[data-action="show-all"]');
    showAllBtn?.addEventListener('click', () => {
      showAll = true;
      render();
    });

    const copyBtn = container.querySelector('[data-action="copy-tsv"]');
    copyBtn?.addEventListener('click', () => {
      const tsv = [
        headers.join('\t'),
        ...rows.map((r) => r.map(String).join('\t')),
      ].join('\n');
      navigator.clipboard.writeText(tsv).catch(console.error);
    });

    const downloadBtn = container.querySelector('[data-action="download-csv"]');
    downloadBtn?.addEventListener('click', () => {
      const csv = [
        headers.map(escapeCsvField).join(','),
        ...rows.map((r) => r.map((v) => escapeCsvField(String(v))).join(',')),
      ].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${source || 'data'}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  render();
  return container;
}

function escapeCsvField(field: string): string {
  if (field.includes(',') || field.includes('"') || field.includes('\n')) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}
