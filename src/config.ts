/** Display name sent on first dynamic registration (agent_name_hint). */
export const AGENT_NAME_HINT = 'Capgo Browser';

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

/** Model for ChatGPT plan usage via Responses API (adjust when OpenAI documents a default). */
export const RESPONSES_MODEL = 'gpt-4.1';

export const SECURE_STORAGE_KEYS = {
  hostId: 'capgo_browser_ext_agent_host_id',
  credentialsPrefix: 'capgo_browser_oauth_',
} as const;

export const APP_LINKS = {
  privacy: 'https://capgo.app/privacy/',
  terms: 'https://capgo.app/tos/',
  support: 'https://capgo.app/contact/',
  openaiUsage: 'https://openai.com/policies/usage-policies/',
} as const;

/** Non-secret UI preferences (localStorage is fine here; never store tokens). */
export const PREF_KEYS = {
  onboarded: 'capgo_browser_onboarded_v1',
} as const;
