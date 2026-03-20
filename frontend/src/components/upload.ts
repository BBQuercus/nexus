// ============================================================
// File Upload / Drag-and-Drop
// ============================================================

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
const MAX_FILES = 10;

export type FilesCallback = (files: File[]) => void;

export function initUploadZone(container: HTMLElement, onFiles: FilesCallback): void {
  let dragCounter = 0;

  // Create drop zone overlay
  const dropZone = document.createElement('div');
  dropZone.className = 'drop-zone';
  dropZone.innerHTML = '<span class="drop-zone__text">Drop files here</span>';
  container.style.position = 'relative';
  container.appendChild(dropZone);

  container.addEventListener('dragenter', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter++;
    dropZone.classList.add('active');
  });

  container.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter--;
    if (dragCounter <= 0) {
      dragCounter = 0;
      dropZone.classList.remove('active');
    }
  });

  container.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  container.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter = 0;
    dropZone.classList.remove('active');

    const dt = e.dataTransfer;
    if (!dt) return;

    const files = Array.from(dt.files);
    const validated = validateFiles(files);
    if (validated.length > 0) {
      onFiles(validated);
    }
  });
}

function validateFiles(files: File[]): File[] {
  const valid: File[] = [];
  for (const file of files) {
    if (valid.length >= MAX_FILES) {
      showToast(`Maximum ${MAX_FILES} files allowed`, 'error');
      break;
    }
    if (file.size > MAX_FILE_SIZE) {
      showToast(`${file.name} exceeds 20MB limit`, 'error');
      continue;
    }
    valid.push(file);
  }
  return valid;
}

export function renderFileChips(files: File[], onRemove: (index: number) => void): HTMLElement {
  const container = document.createElement('div');
  container.className = 'chat-input__chips';

  files.forEach((file, index) => {
    const chip = document.createElement('div');
    chip.className = 'file-chip';

    const name = document.createElement('span');
    name.textContent = file.name;

    const size = document.createElement('span');
    size.textContent = formatSize(file.size);
    size.style.color = 'var(--text-tertiary)';

    const remove = document.createElement('button');
    remove.className = 'file-chip__remove';
    remove.textContent = '\u2715';
    remove.addEventListener('click', () => onRemove(index));

    chip.appendChild(name);
    chip.appendChild(size);
    chip.appendChild(remove);
    container.appendChild(chip);
  });

  return container;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function showToast(message: string, type: 'error' | 'success' = 'error'): void {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('leaving');
    setTimeout(() => toast.remove(), 150);
  }, 3000);
}

export function createFileInput(onFiles: FilesCallback): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  input.style.display = 'none';
  input.addEventListener('change', () => {
    if (input.files) {
      const validated = validateFiles(Array.from(input.files));
      if (validated.length > 0) {
        onFiles(validated);
      }
    }
    input.value = '';
  });
  return input;
}
