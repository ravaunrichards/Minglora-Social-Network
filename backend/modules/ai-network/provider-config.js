// Server-only inventory of provider credential slots.
// Credential presence is not proof of provider health or an available adapter.
const provider = (id, label, category, credentialGroups = [], options = {}) => Object.freeze({
  id, label, category,
  credentialGroups: Object.freeze(credentialGroups.map(group => Object.freeze([...group]))),
  optionalEnvironmentVariables: Object.freeze([...(options.optionalEnvironmentVariables || [])]),
  serverSelectable: options.serverSelectable !== false,
  healthProbeAvailable: options.healthProbeAvailable === true,
  inferenceAdapterAvailable: options.inferenceAdapterAvailable === true,
  note: options.note || ''
});

export const AI_PROVIDER_CATALOG = Object.freeze([
  provider('openai', 'OpenAI API (ChatGPT models)', 'language_model', [['OPENAI_API_KEY'], ['MINGLORA_AI_PROVIDER','MINGLORA_AI_API_KEY']], { healthProbeAvailable: true, inferenceAdapterAvailable: true, note: 'A server-side text-generation adapter is available for human-triggered, moderated Creator Studio drafts only; worker execution and publishing remain disabled.', optionalEnvironmentVariables: ['OPENAI_BASE_URL','OPENAI_ORGANIZATION_ID','OPENAI_PROJECT_ID','OPENAI_DEFAULT_MODEL'] }),
  provider('anthropic', 'Anthropic Claude API', 'language_model', [['ANTHROPIC_API_KEY']], { optionalEnvironmentVariables: ['ANTHROPIC_BASE_URL','ANTHROPIC_DEFAULT_MODEL'] }),
  provider('google_gemini', 'Google Gemini Developer API', 'language_model', [['GEMINI_API_KEY'],['GOOGLE_AI_API_KEY']], { optionalEnvironmentVariables: ['GEMINI_BASE_URL','GEMINI_DEFAULT_MODEL'] }),
  provider('xai', 'xAI API', 'language_model', [['XAI_API_KEY']], { optionalEnvironmentVariables: ['XAI_BASE_URL','XAI_DEFAULT_MODEL'] }),
  provider('mistral', 'Mistral AI API', 'language_model', [['MISTRAL_API_KEY']], { optionalEnvironmentVariables: ['MISTRAL_BASE_URL','MISTRAL_DEFAULT_MODEL'] }),
  provider('cohere', 'Cohere API', 'language_model', [['COHERE_API_KEY']], { optionalEnvironmentVariables: ['COHERE_BASE_URL','COHERE_DEFAULT_MODEL'] }),
  provider('groq', 'Groq API', 'language_model', [['GROQ_API_KEY']], { optionalEnvironmentVariables: ['GROQ_BASE_URL','GROQ_DEFAULT_MODEL'] }),
  provider('together_ai', 'Together AI API', 'language_model', [['TOGETHER_API_KEY']], { optionalEnvironmentVariables: ['TOGETHER_BASE_URL','TOGETHER_DEFAULT_MODEL'] }),
  provider('fireworks_ai', 'Fireworks AI API', 'language_model', [['FIREWORKS_API_KEY']], { optionalEnvironmentVariables: ['FIREWORKS_BASE_URL','FIREWORKS_DEFAULT_MODEL'] }),
  provider('deepseek', 'DeepSeek API', 'language_model', [['DEEPSEEK_API_KEY']], { optionalEnvironmentVariables: ['DEEPSEEK_BASE_URL','DEEPSEEK_DEFAULT_MODEL'] }),
  provider('openrouter', 'OpenRouter API', 'language_model', [['OPENROUTER_API_KEY']], { optionalEnvironmentVariables: ['OPENROUTER_BASE_URL','OPENROUTER_DEFAULT_MODEL','OPENROUTER_SITE_URL','OPENROUTER_APP_NAME'] }),
  provider('perplexity', 'Perplexity API', 'language_model', [['PERPLEXITY_API_KEY']], { optionalEnvironmentVariables: ['PERPLEXITY_BASE_URL','PERPLEXITY_DEFAULT_MODEL'] }),
  provider('huggingface', 'Hugging Face Inference', 'language_model', [['HUGGINGFACE_API_TOKEN']], { optionalEnvironmentVariables: ['HUGGINGFACE_ENDPOINT_URL','HUGGINGFACE_DEFAULT_MODEL'] }),
  provider('replicate', 'Replicate API', 'multimodal', [['REPLICATE_API_TOKEN']], { optionalEnvironmentVariables: ['REPLICATE_DEFAULT_MODEL'] }),
  provider('azure_openai', 'Azure OpenAI', 'language_model', [['AZURE_OPENAI_API_KEY','AZURE_OPENAI_ENDPOINT','AZURE_OPENAI_API_VERSION','AZURE_OPENAI_DEPLOYMENT']]),
  provider('aws_bedrock', 'AWS Bedrock', 'language_model', [
    ['AWS_REGION','AWS_ACCESS_KEY_ID','AWS_SECRET_ACCESS_KEY'],
    ['AWS_REGION','AWS_PROFILE'],
    ['AWS_REGION','AWS_WEB_IDENTITY_TOKEN_FILE']
  ], { optionalEnvironmentVariables: ['AWS_SESSION_TOKEN','BEDROCK_MODEL_ID'] }),
  provider('google_vertex', 'Google Vertex AI', 'language_model', [['GOOGLE_CLOUD_PROJECT','GOOGLE_CLOUD_LOCATION']], { optionalEnvironmentVariables: ['GOOGLE_APPLICATION_CREDENTIALS','GOOGLE_CLOUD_QUOTA_PROJECT'] }),
  provider('ollama', 'Ollama local runtime', 'local_model', [['OLLAMA_BASE_URL']], { optionalEnvironmentVariables: ['OLLAMA_DEFAULT_MODEL','OLLAMA_API_KEY'] }),
  provider('vllm', 'vLLM self-hosted runtime', 'local_model', [['VLLM_BASE_URL']], { optionalEnvironmentVariables: ['VLLM_API_KEY','VLLM_DEFAULT_MODEL'] }),
  provider('lm_studio', 'LM Studio local runtime', 'local_model', [['LM_STUDIO_BASE_URL']], { optionalEnvironmentVariables: ['LM_STUDIO_API_KEY','LM_STUDIO_DEFAULT_MODEL'] }),
  provider('openai_compatible', 'Custom OpenAI-compatible endpoint', 'language_model', [['MINGLORA_AI_COMPATIBLE_BASE_URL']], { optionalEnvironmentVariables: ['MINGLORA_AI_COMPATIBLE_API_KEY','MINGLORA_AI_COMPATIBLE_MODEL'] }),
  provider('chatgpt_guest', 'ChatGPT guest session (this ChatGPT conversation)', 'interactive_session', [], {
    serverSelectable: false,
    note: 'This interactive ChatGPT session is not a server API endpoint. Minglora cannot call this conversation as a provider. Use an OpenAI Platform API key for server-side OpenAI inference.'
  }),
  provider('elevenlabs', 'ElevenLabs voice generation', 'voice', [['ELEVENLABS_API_KEY']], { optionalEnvironmentVariables: ['ELEVENLABS_BASE_URL','ELEVENLABS_DEFAULT_VOICE_ID','ELEVENLABS_DEFAULT_MODEL_ID'] }),
  provider('deepgram', 'Deepgram speech recognition', 'speech_to_text', [['DEEPGRAM_API_KEY']], { optionalEnvironmentVariables: ['DEEPGRAM_BASE_URL','DEEPGRAM_DEFAULT_MODEL'] }),
  provider('assemblyai', 'AssemblyAI speech recognition', 'speech_to_text', [['ASSEMBLYAI_API_KEY']], { optionalEnvironmentVariables: ['ASSEMBLYAI_BASE_URL'] }),
  provider('cartesia', 'Cartesia voice generation', 'voice', [['CARTESIA_API_KEY']], { optionalEnvironmentVariables: ['CARTESIA_BASE_URL','CARTESIA_DEFAULT_VOICE_ID','CARTESIA_DEFAULT_MODEL'] }),
  provider('azure_speech', 'Azure AI Speech', 'speech_and_voice', [['AZURE_SPEECH_KEY','AZURE_SPEECH_REGION']]),
  provider('google_cloud_speech', 'Google Cloud Speech', 'speech_to_text', [['GOOGLE_CLOUD_PROJECT','GOOGLE_APPLICATION_CREDENTIALS']], { optionalEnvironmentVariables: ['GOOGLE_CLOUD_LOCATION'] }),
  provider('stability_ai', 'Stability AI image generation', 'image_generation', [['STABILITY_API_KEY']], { optionalEnvironmentVariables: ['STABILITY_BASE_URL','STABILITY_DEFAULT_MODEL'] }),
  provider('fal_ai', 'fal.ai media generation', 'image_and_video_generation', [['FAL_KEY']], { optionalEnvironmentVariables: ['FAL_DEFAULT_IMAGE_MODEL','FAL_DEFAULT_VIDEO_MODEL'] }),
  provider('runway', 'Runway video generation', 'video_generation', [['RUNWAY_API_KEY']], { optionalEnvironmentVariables: ['RUNWAY_BASE_URL','RUNWAY_DEFAULT_MODEL'] }),
  provider('luma_ai', 'Luma AI video generation', 'video_generation', [['LUMA_API_KEY']], { optionalEnvironmentVariables: ['LUMA_BASE_URL','LUMA_DEFAULT_MODEL'] }),
  provider('tavily', 'Tavily search', 'web_search', [['TAVILY_API_KEY']], { optionalEnvironmentVariables: ['TAVILY_BASE_URL'] }),
  provider('brave_search', 'Brave Search API', 'web_search', [['BRAVE_SEARCH_API_KEY']], { optionalEnvironmentVariables: ['BRAVE_SEARCH_BASE_URL'] }),
  provider('serpapi', 'SerpAPI search', 'web_search', [['SERPAPI_API_KEY']], { optionalEnvironmentVariables: ['SERPAPI_BASE_URL'] }),
  provider('pinecone', 'Pinecone vector database', 'vector_database', [['PINECONE_API_KEY','PINECONE_INDEX_NAME']], { optionalEnvironmentVariables: ['PINECONE_CLOUD','PINECONE_REGION','PINECONE_HOST'] }),
  provider('qdrant', 'Qdrant vector database', 'vector_database', [['QDRANT_URL','QDRANT_API_KEY']]),
  provider('weaviate', 'Weaviate vector database', 'vector_database', [['WEAVIATE_URL','WEAVIATE_API_KEY']]),
  provider('smtp', 'SMTP transactional email', 'email_delivery', [['SMTP_HOST','SMTP_USER','SMTP_PASS','EMAIL_FROM']]),
  provider('resend', 'Resend transactional email API', 'email_delivery', [['RESEND_API_KEY']]),
  provider('sendgrid', 'Twilio SendGrid email API', 'email_delivery', [['SENDGRID_API_KEY']]),
  provider('postmark', 'Postmark transactional email API', 'email_delivery', [['POSTMARK_SERVER_TOKEN']]),
  provider('mailgun', 'Mailgun email API', 'email_delivery', [['MAILGUN_API_KEY','MAILGUN_DOMAIN']], { optionalEnvironmentVariables: ['MAILGUN_BASE_URL'] }),
  provider('amazon_ses', 'Amazon Simple Email Service', 'email_delivery', [
    ['AMAZON_SES_REGION','AWS_ACCESS_KEY_ID','AWS_SECRET_ACCESS_KEY'],
    ['AMAZON_SES_REGION','AWS_PROFILE'],
    ['AMAZON_SES_REGION','AWS_WEB_IDENTITY_TOKEN_FILE']
  ], { optionalEnvironmentVariables: ['AMAZON_SES_CONFIGURATION_SET','AWS_SESSION_TOKEN'] })
]);

const hasValue = value => String(value ?? '').trim().length > 0;

export function getAIProviderCredentialStatus(providerId, env = process.env) {
  const id = String(providerId ?? '').trim().toLowerCase();
  const entry = AI_PROVIDER_CATALOG.find(item => item.id === id);
  if (!entry) {
    return {
      providerId: id, known: false, credentialsPresent: false,
      adapterAvailable: false, connected: false, executionEnabled: false,
      note: id ? 'This provider is not in the Minglora provider catalogue.' : 'No provider selected.'
    };
  }

  const requiredVariables = [...new Set(entry.credentialGroups.flat())];
  const presentVariables = requiredVariables.filter(name => hasValue(env[name]));
  const credentialsPresent = entry.credentialGroups.length > 0
    && entry.credentialGroups.some(group => group.every(name => hasValue(env[name])));
  const note = entry.note || (credentialsPresent
    ? 'Required credential fields are present. No tested Minglora adapter or provider health check is available yet.'
    : requiredVariables.length
      ? 'Provider credential placeholders are available; one complete credential set is still required.'
      : 'This provider has no server-callable credential configuration.');

  return {
    providerId: entry.id,
    label: entry.label,
    category: entry.category,
    known: true,
    serverSelectable: entry.serverSelectable,
    healthProbeAvailable: entry.healthProbeAvailable,
    adapterAvailable: entry.inferenceAdapterAvailable,
    credentialEnvironmentVariables: requiredVariables,
    optionalEnvironmentVariables: [...entry.optionalEnvironmentVariables],
    presentEnvironmentVariables: presentVariables,
    missingCredentialEnvironmentVariables: credentialsPresent
      ? []
      : requiredVariables.filter(name => !hasValue(env[name])),
    credentialsPresent,
    connected: false,
    executionEnabled: false,
    note
  };
}


export function listAIProviderCredentialStatuses(env = process.env) {
  return AI_PROVIDER_CATALOG.map(entry => getAIProviderCredentialStatus(entry.id, env));
}
