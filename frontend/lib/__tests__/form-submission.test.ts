import { describe, expect, it } from 'vitest';

import {
  buildFormSubmissionMessage,
  stripFormSubmissionPayload,
} from '../form-submission';

describe('form submission message formatting', () => {
  it('keeps a clean visible message while preserving a hidden payload', () => {
    const message = buildFormSubmissionMessage('Random Questions Survey', {
      favorite_color: 'Blue',
      lucky_number: 42,
    });

    expect(message).toContain('Submitted "Random Questions Survey".');
    expect(message).toContain('```nexus-form-response');
    expect(stripFormSubmissionPayload(message)).toBe(
      'Submitted "Random Questions Survey".',
    );
  });

  it('leaves normal content unchanged', () => {
    expect(stripFormSubmissionPayload('Plain message')).toBe('Plain message');
  });
});
