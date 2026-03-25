const FORM_RESPONSE_FENCE = 'nexus-form-response';

export interface FormSubmissionEnvelope {
  title: string;
  data: Record<string, unknown>;
}

export function buildFormSubmissionMessage(
  title: string,
  data: Record<string, unknown>,
): string {
  const envelope: FormSubmissionEnvelope = { title, data };
  return `Submitted "${title}".\n\n\`\`\`${FORM_RESPONSE_FENCE}\n${JSON.stringify(envelope)}\n\`\`\``;
}

export function stripFormSubmissionPayload(content: string): string {
  return content
    .replace(
      new RegExp(`\\n?\\n?\\\`\\\`\\\`${FORM_RESPONSE_FENCE}[\\s\\S]*?\\\`\\\`\\\`\\s*`, 'g'),
      '',
    )
    .trim();
}
