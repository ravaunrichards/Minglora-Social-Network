import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AI_PROVIDER_CATALOG,
  getAIProviderCredentialStatus,
  listAIProviderCredentialStatuses
} from '../../backend/modules/ai-network/provider-config.js';
import { getAIProviderStatus } from '../../backend/modules/ai-network/service.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const envExample = readFileSync(resolve(root, '.env.example'), 'utf8');

test('provider catalogue has unique IDs and includes ChatGPT guest plus independent OpenAI API', () => {
  const ids = AI_PROVIDER_CATALOG.map(item => item.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.includes('chatgpt_guest'));
  assert.ok(ids.includes('openai'));
  assert.ok(ids.includes('google_gemini'));
});

test('transactional email providers are catalogued with their required environment keys', () => {
  const emailProviders = new Set(AI_PROVIDER_CATALOG.filter(item => item.category === 'email_delivery').map(item => item.id));
  assert.deepEqual([...emailProviders].sort(), ['amazon_ses','mailgun','postmark','resend','sendgrid','smtp']);
  for (const key of ['SMTP_HOST','SMTP_USER','SMTP_PASS','EMAIL_FROM','RESEND_API_KEY','SENDGRID_API_KEY','POSTMARK_SERVER_TOKEN','MAILGUN_API_KEY','MAILGUN_DOMAIN','AMAZON_SES_REGION']) {
    assert.ok(envExample.split(String.fromCharCode(10)).some(line => line.startsWith(key + '=')), 'Missing email provider environment variable: ' + key);
  }
});

test('the provider registry returns safe readiness for every catalogued model and service', () => {
  const inventory = listAIProviderCredentialStatuses({
    OPENAI_API_KEY: 'private-openai-test-key',
    RESEND_API_KEY: 'private-resend-test-key'
  });
  assert.equal(inventory.length, AI_PROVIDER_CATALOG.length);
  assert.equal(inventory.length, 44);
  assert.equal(inventory.find(item => item.providerId === 'openai').credentialsPresent, true);
  assert.equal(inventory.find(item => item.providerId === 'openai').healthProbeAvailable, true);
  assert.equal(inventory.find(item => item.providerId === 'openai').adapterAvailable, true);
  assert.equal(inventory.find(item => item.providerId === 'google_gemini').healthProbeAvailable, true);
  assert.equal(inventory.find(item => item.providerId === 'google_gemini').adapterAvailable, true);
  assert.equal(inventory.find(item => item.providerId === 'anthropic').healthProbeAvailable, false);
  assert.equal(inventory.find(item => item.providerId === 'resend').credentialsPresent, true);
  assert.equal(inventory.find(item => item.providerId === 'chatgpt_guest').serverSelectable, false);
  assert.ok(inventory.every(item => item.connected === false && item.executionEnabled === false));
  assert.ok(inventory.filter(item => !['openai','google_gemini'].includes(item.providerId)).every(item => item.adapterAvailable === false));
  const serialized = JSON.stringify(inventory);
  assert.equal(serialized.includes('private-openai-test-key'), false);
  assert.equal(serialized.includes('private-resend-test-key'), false);
});

test('ChatGPT guest is explicitly non-routable and cannot be marked connected', () => {
  const guest = getAIProviderCredentialStatus('chatgpt_guest', {});
  assert.equal(guest.known, true);
  assert.equal(guest.serverSelectable, false);
  assert.equal(guest.credentialsPresent, false);
  assert.equal(guest.adapterAvailable, false);
  assert.equal(guest.connected, false);
  assert.equal(guest.executionEnabled, false);
  assert.match(guest.note, /not a server API endpoint/i);
});

test('provider-specific credential presence reports the bot chat and Creator Studio adapters but never enables execution', () => {
  const status = getAIProviderCredentialStatus('openai', { OPENAI_API_KEY: 'test-secret-do-not-return' });
  assert.equal(status.credentialsPresent, true);
  assert.equal(status.adapterAvailable, true);
  assert.equal(status.connected, false);
  assert.equal(status.executionEnabled, false);
  assert.ok(status.presentEnvironmentVariables.includes('OPENAI_API_KEY'));
  assert.equal(JSON.stringify(status).includes('test-secret-do-not-return'), false);
});

test('provider credential helper recognizes complete and incomplete credential sets', () => {
  const missing = getAIProviderCredentialStatus('azure_openai', {
    AZURE_OPENAI_API_KEY: 'test-key',
    AZURE_OPENAI_ENDPOINT: 'https://example.invalid'
  });
  assert.equal(missing.credentialsPresent, false);
  assert.ok(missing.missingCredentialEnvironmentVariables.includes('AZURE_OPENAI_DEPLOYMENT'));
  const complete = getAIProviderCredentialStatus('azure_openai', {
    AZURE_OPENAI_API_KEY: 'test-key',
    AZURE_OPENAI_ENDPOINT: 'https://example.invalid',
    AZURE_OPENAI_API_VERSION: '2024-10-21',
    AZURE_OPENAI_DEPLOYMENT: 'minglora-test'
  });
  assert.equal(complete.credentialsPresent, true);
  assert.deepEqual(complete.missingCredentialEnvironmentVariables, []);
  assert.equal(complete.executionEnabled, false);
});

test('legacy generic provider status contract remains unchanged and execution stays disabled', () => {
  const configured = getAIProviderStatus({
    MINGLORA_AI_PROVIDER: 'openai',
    MINGLORA_AI_MODEL: 'unit-test-model',
    MINGLORA_AI_API_KEY: 'test-generic-secret'
  });
  assert.equal(configured.configured, true);
  assert.equal(configured.provider, 'openai');
  assert.equal(configured.model, 'unit-test-model');
  assert.equal(configured.executionEnabled, false);
  assert.equal(JSON.stringify(configured).includes('test-generic-secret'), false);

  const providerSpecificOnly = getAIProviderStatus({
    MINGLORA_AI_PROVIDER: 'openai',
    MINGLORA_AI_MODEL: 'unit-test-model',
    OPENAI_API_KEY: 'test-specific-secret'
  });
  assert.equal(providerSpecificOnly.configured, true);
  assert.equal(providerSpecificOnly.credentialsPresent, true);
  assert.equal(providerSpecificOnly.providerCredentialStatus.adapterAvailable, true);
  assert.equal(providerSpecificOnly.manualDraftsAvailable, true);
  assert.equal(providerSpecificOnly.botChatAvailable, true);
  assert.equal(providerSpecificOnly.ownerControlsAvailable, true);
  assert.equal(providerSpecificOnly.creatorStudioAvailable, true);
  assert.equal(providerSpecificOnly.executionEnabled, false);
  assert.equal(JSON.stringify(providerSpecificOnly).includes('test-specific-secret'), false);
});


test('Gemini enables owner-initiated bot chat without enabling Creator Studio or autonomous execution', () => {
  const status = getAIProviderStatus({
    MINGLORA_AI_PROVIDER: 'google_gemini',
    GEMINI_API_KEY: 'private-gemini-test-key',
    GEMINI_DEFAULT_MODEL: 'gemini-test-model'
  });
  assert.equal(status.configured, true);
  assert.equal(status.provider, 'google_gemini');
  assert.equal(status.model, 'gemini-test-model');
  assert.equal(status.providerCredentialStatus.adapterAvailable, true);
  assert.equal(status.botChatAvailable, true);
  assert.equal(status.ownerControlsAvailable, true);
  assert.equal(status.manualDraftsAvailable, false);
  assert.equal(status.creatorStudioAvailable, false);
  assert.equal(status.executionEnabled, false);
  assert.equal(status.connected, false);
  assert.equal(JSON.stringify(status).includes('private-gemini-test-key'), false);

  const missingModel = getAIProviderStatus({
    MINGLORA_AI_PROVIDER: 'google_gemini',
    GEMINI_API_KEY: 'private-gemini-test-key'
  });
  assert.equal(missingModel.configured, false);
  assert.equal(missingModel.botChatAvailable, false);
});

test('all provider credential environment variables have blank placeholders in .env.example', () => {
  const requiredVariables = new Set(
    AI_PROVIDER_CATALOG.flatMap(item => item.credentialGroups.flat())
      .concat(AI_PROVIDER_CATALOG.flatMap(item => item.optionalEnvironmentVariables))
  );
  for (const name of requiredVariables) {
    const line = envExample.split(/\r?\n/).find(row => row.startsWith(name + '='));
    assert.ok(line, 'Missing .env.example variable: ' + name);
    assert.equal(line.slice(name.length + 1).trim(), '', 'Credential/config placeholder must be blank: ' + name);
  }
});
