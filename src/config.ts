/** Display name sent on first dynamic registration (agent_name_hint). */
export const AGENT_NAME_HINT = 'Auto Browse';

export const OAUTH_AUTHORIZE_URL = 'https://auth.openai.com/api/accounts/authorize';
export const OAUTH_TOKEN_URL = 'https://auth.openai.com/api/accounts/oauth/token';
export const OAUTH_JWKS_URL = 'https://auth.openai.com/api/accounts/oauth/jwks';
export const OAUTH_ISSUER = 'https://auth.openai.com';

export const OAUTH_DYNAMIC_CLIENT_ID = 'dynamic_agent_client';
export const OAUTH_RESOURCE = 'https://api.openai.com/v1';

export const OAUTH_SCOPES = [
  'openid',
  'profile',
  'email',
  'offline_access',
  'resource.invoke',
  'chatgpt.tokens.use.direct',
].join(' ');

/** Default loopback path. Port may change per attempt; path must stay fixed. */
export const OAUTH_CALLBACK_PATH = '/auth/callback';


export const RESPONSES_API_URL = 'https://api.openai.com/v1/responses';
export const MODELS_API_URL = 'https://api.openai.com/v1/models';

/** Preferred model; falls back to the first model listed for the account. */
export const RESPONSES_MODEL = 'gpt-6.1-sol';

export const SECURE_STORAGE_KEYS = {
  hostId: 'capgo_browser_ext_agent_host_id',
  credentialsPrefix: 'capgo_browser_oauth_',
} as const;

export const APP_LINKS = {
  site: 'https://autobrowse.dev/',
  privacy: 'https://autobrowse.dev/privacy/',
  terms: 'https://autobrowse.dev/terms/',
  support: 'https://autobrowse.dev/support/',
  openaiUsage: 'https://openai.com/policies/usage-policies/',
  openaiPrivacy: 'https://openai.com/policies/privacy-policy/',
  capgo: 'https://capgo.app/?utm_source=autobrowse&utm_medium=app&utm_campaign=settings',
  makerX: 'https://x.com/martindonadieu',
} as const;

/** Non-secret UI preferences (localStorage is fine here; never store tokens). */
export const PREF_KEYS = {
  onboarded: 'capgo_browser_onboarded_v1',
  /** User allowed sending prompts and page content to OpenAI (guideline 5.1.2(i)). */
  aiConsent: 'capgo_browser_ai_consent_v1',
} as const;

/** Receives "Report this answer" (workers/report). */
export const REPORT_URL = 'https://autobrowse-report.digitalshift-ee.workers.dev/report';
