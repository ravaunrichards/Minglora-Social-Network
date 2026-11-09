import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSupabaseProviderCredentialPatch } from '../../src/auth-provider-credentials.js';

const google = {
  id: 'google',
  keys: ['external_google_client_id', 'external_google_secret'],
  optionalKeys: ['external_google_additional_client_ids']
};

test('OAuth credential patch includes only allow-listed trimmed provider fields', () => {
  const patch = buildSupabaseProviderCredentialPatch({
    definition: google,
    credentials: {
      external_google_client_id: '  google-client-id  ',
      external_google_secret: '  google-client-secret  ',
      external_google_additional_client_ids: ' app-one,app-two ',
      external_facebook_secret: 'must-not-leak',
      admin: true
    },
    current: {}
  });
  assert.deepEqual(patch, {
    external_google_client_id: 'google-client-id',
    external_google_secret: 'google-client-secret',
    external_google_additional_client_ids: 'app-one,app-two'
  });
  assert.equal(Object.hasOwn(patch, 'external_facebook_secret'), false);
  assert.equal(Object.hasOwn(patch, 'admin'), false);
});

test('blank credential fields are omitted so saved Supabase secrets remain unchanged', () => {
  const patch = buildSupabaseProviderCredentialPatch({
    definition: google,
    credentials: { external_google_client_id: '   ', external_google_secret: '' },
    current: { external_google_client_id: 'already-saved', external_google_secret: 'secret-is-saved' }
  });
  assert.deepEqual(patch, {});
});

test('provider issuer and discovery URLs must be valid HTTPS URLs', () => {
  const definition = { id: 'keycloak', keys: ['external_keycloak_client_id', 'external_keycloak_secret', 'external_keycloak_url'] };
  assert.deepEqual(
    buildSupabaseProviderCredentialPatch({
      definition,
      credentials: {
        external_keycloak_client_id: 'client',
        external_keycloak_secret: 'secret',
        external_keycloak_url: 'https://identity.example.com/realms/minglora'
      }
    }),
    {
      external_keycloak_client_id: 'client',
      external_keycloak_secret: 'secret',
      external_keycloak_url: 'https://identity.example.com/realms/minglora'
    }
  );
  assert.throws(
    () => buildSupabaseProviderCredentialPatch({
      definition,
      credentials: { external_keycloak_url: 'http://identity.example.com' }
    }),
    error => error.status === 400 && /HTTPS/.test(error.message)
  );
  assert.throws(
    () => buildSupabaseProviderCredentialPatch({
      definition,
      credentials: { external_keycloak_url: 'not-a-url' }
    }),
    error => error.status === 400 && /valid HTTPS URL/.test(error.message)
  );
});

test('credential values longer than the supported limit are rejected', () => {
  assert.throws(
    () => buildSupabaseProviderCredentialPatch({
      definition: google,
      credentials: { external_google_secret: 'x'.repeat(4097) }
    }),
    error => error.status === 400 && /too long/.test(error.message)
  );
});

test('phone setup accepts only a configured SMS gateway and its allow-listed fields', () => {
  const smsProviders = {
    twilio: {
      required: ['sms_twilio_account_sid', 'sms_twilio_auth_token'],
      optional: ['sms_twilio_message_service_sid']
    }
  };
  const patch = buildSupabaseProviderCredentialPatch({
    definition: { id: 'phone', keys: [] },
    smsProviders,
    credentials: {
      sms_provider: ' TWILIO ',
      sms_twilio_account_sid: ' AC123 ',
      sms_twilio_auth_token: ' token ',
      sms_twilio_message_service_sid: ' MG123 ',
      sms_vonage_api_secret: 'must-not-leak'
    },
    current: {}
  });
  assert.deepEqual(patch, {
    sms_provider: 'twilio',
    sms_twilio_account_sid: 'AC123',
    sms_twilio_auth_token: 'token',
    sms_twilio_message_service_sid: 'MG123'
  });
});

test('phone setup can retain the selected saved gateway and rejects unsupported gateways', () => {
  const smsProviders = {
    twilio: { required: ['sms_twilio_account_sid', 'sms_twilio_auth_token'], optional: [] }
  };
  assert.deepEqual(
    buildSupabaseProviderCredentialPatch({
      definition: { id: 'phone' },
      smsProviders,
      current: { sms_provider: 'twilio' },
      credentials: { sms_twilio_account_sid: 'AC123' }
    }),
    { sms_provider: 'twilio', sms_twilio_account_sid: 'AC123' }
  );
  assert.throws(
    () => buildSupabaseProviderCredentialPatch({
      definition: { id: 'phone' },
      smsProviders,
      credentials: { sms_provider: 'unsupported' }
    }),
    error => error.status === 400 && /supported SMS gateway/.test(error.message)
  );
});

test('invalid credential payload types are rejected', () => {
  assert.throws(
    () => buildSupabaseProviderCredentialPatch({ definition: google, credentials: ['not', 'an', 'object'] }),
    error => error.status === 400 && /must be an object/.test(error.message)
  );
  assert.throws(
    () => buildSupabaseProviderCredentialPatch({ credentials: {} }),
    TypeError
  );
});
