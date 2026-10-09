export function isUsageLimitError(body: string): boolean {
  return body.includes('subscription_sharing_usage_limit_exceeded');
}

export function formatApiError(status: number, body: string): string {
  if (isUsageLimitError(body)) {
    return (
      'Your shared ChatGPT plan usage limit was exceeded. Wait for the limit to reset, ' +
      'check usage in ChatGPT settings, or try again after the app refreshes your token.'
    );
  }
  return `Responses API error (${status}): ${body}`;
}
