export interface AiProviderPreset {
  id: string;
  provider: string;
  defaultModel: string;
  defaultName: string;
  defaultWireApi: 'chat_completions' | 'responses';
  defaultBaseUrl: string;
  requiresApiKey: boolean;
}

export const AI_PROVIDER_PRESETS: readonly AiProviderPreset[] = [
  {
    id: 'custom',
    provider: 'openai-compatible',
    defaultName: '',
    defaultBaseUrl: '',
    defaultModel: '',
    defaultWireApi: 'chat_completions',
    requiresApiKey: false,
  },
  {
    id: 'deepseek',
    provider: 'deepseek',
    defaultName: 'DeepSeek',
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    defaultWireApi: 'chat_completions',
    requiresApiKey: true,
  },
  {
    id: 'openai',
    provider: 'openai',
    defaultName: 'OpenAI',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    defaultWireApi: 'chat_completions',
    requiresApiKey: true,
  },
  {
    id: 'local-openai-compatible',
    provider: 'local-openai-compatible',
    defaultName: 'Local OpenAI Compatible',
    defaultBaseUrl: '',
    defaultModel: '',
    defaultWireApi: 'chat_completions',
    requiresApiKey: false,
  },
];

export function findAiProviderPreset(id?: string) {
  return AI_PROVIDER_PRESETS.find((preset) => preset.id === id) || AI_PROVIDER_PRESETS[0];
}
