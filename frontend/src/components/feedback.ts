// ============================================================
// Feedback Buttons Component
// ============================================================

import { submitFeedback } from '../services/api';
import { getState } from '../state';

export function renderFeedbackButtons(
  messageId: string,
  currentFeedback: 'up' | 'down' | null
): HTMLElement {
  const container = document.createElement('div');
  container.className = 'feedback-buttons';

  const upBtn = document.createElement('button');
  upBtn.className = `feedback-btn${currentFeedback === 'up' ? ' active-up' : ''}`;
  upBtn.textContent = '\u25B2';
  upBtn.title = 'Good response';

  const downBtn = document.createElement('button');
  downBtn.className = `feedback-btn${currentFeedback === 'down' ? ' active-down' : ''}`;
  downBtn.textContent = '\u25BC';
  downBtn.title = 'Poor response';

  let feedback: 'up' | 'down' | null = currentFeedback;

  function updateButtons(): void {
    upBtn.className = `feedback-btn${feedback === 'up' ? ' active-up' : ''}`;
    downBtn.className = `feedback-btn${feedback === 'down' ? ' active-down' : ''}`;
  }

  upBtn.addEventListener('click', async () => {
    const newFeedback: 'up' | null = feedback === 'up' ? null : 'up';
    const conversationId = getState().activeConversationId;
    if (!conversationId) return;

    try {
      await submitFeedback(conversationId, messageId, newFeedback);
      feedback = newFeedback;
      updateButtons();
    } catch (e) {
      console.error('Feedback failed:', e);
    }
  });

  downBtn.addEventListener('click', async () => {
    const newFeedback: 'down' | null = feedback === 'down' ? null : 'down';
    const conversationId = getState().activeConversationId;
    if (!conversationId) return;

    try {
      await submitFeedback(conversationId, messageId, newFeedback);
      feedback = newFeedback;
      updateButtons();
    } catch (e) {
      console.error('Feedback failed:', e);
    }
  });

  container.appendChild(upBtn);
  container.appendChild(downBtn);

  return container;
}
