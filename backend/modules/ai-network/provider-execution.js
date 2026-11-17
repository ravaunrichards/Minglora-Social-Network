const safeModelId = value => typeof value === 'string' &&
  /^[A-Za-z0-9][A-Za-z0-9._:-]{0,179}$/.test(value);

const ordered = rows => [...rows].sort((a,b) =>
  (Number(a?.assignment?.routing_priority) || 10000) -
  (Number(b?.assignment?.routing_priority) || 10000) ||
  String(b?.assignment?.assigned_at || '').localeCompare(String(a?.assignment?.assigned_at || ''))
);

/**
 * Resolve a provider route only from persisted, owner-scoped assignment rows.
 * Browser-supplied provider/model overrides are never considered here.
 * The initial execution adapter intentionally supports OpenAI text models only.
 */
export function resolveAssignedProviderRoute(identityId, assignmentRows, modelCatalogue) {
  const id = String(identityId || '').trim();
  if (!id) return { ok: false, reason: 'identity_missing' };
  const rows = ordered((Array.isArray(assignmentRows) ? assignmentRows : [])
    .filter(row => String(row?.identity?.identity_id || row?.assignment?.identity_id || '') === id));
  const active = rows.find(row => row?.assignment?.assignment_status === 'active');
  if (!active) return { ok: false, reason: 'active_assignment_missing' };

  const assignment = active.assignment || {};
  const account = active.provider_account || {};
  const models = Array.isArray(modelCatalogue) ? modelCatalogue : [];
  const model = models.find(item => String(item?.model_id || '') === String(assignment.model_id || ''));
  if (!model || model.is_active === false) return { ok: false, reason: 'model_not_active' };
  const providerName = String(model.provider_name || '').trim().toLowerCase();
  if (!providerName || providerName !== String(account.provider_name || '').trim().toLowerCase()) {
    return { ok: false, reason: 'provider_account_mismatch' };
  }
  if (assignment.provider_health_status !== 'healthy' ||
      account.status !== 'configured' || account.health_status !== 'healthy') {
    return { ok: false, reason: 'provider_not_healthy' };
  }
  if (model.text_capability !== true ||
      !Array.isArray(assignment.assigned_capabilities) ||
      !assignment.assigned_capabilities.includes('text')) {
    return { ok: false, reason: 'text_capability_not_assigned' };
  }
  if (!safeModelId(model.model_identifier)) return { ok: false, reason: 'model_identifier_invalid' };
  if (providerName !== 'openai') return { ok: false, reason: 'provider_adapter_not_available', provider: providerName };

  const fallbackId = String(assignment.fallback_model_id || '');
  const fallbackModel = fallbackId ? models.find(item => String(item?.model_id || '') === fallbackId) : null;
  const fallback = fallbackModel &&
      fallbackModel.is_active !== false &&
      String(fallbackModel.provider_name || '').trim().toLowerCase() === providerName &&
      fallbackModel.text_capability === true &&
      safeModelId(fallbackModel.model_identifier)
    ? {
        provider: providerName,
        modelId: String(fallbackModel.model_id),
        model: String(fallbackModel.model_identifier),
        modelName: String(fallbackModel.model_name || fallbackModel.model_identifier)
      }
    : null;

  return {
    ok: true,
    assignmentId: String(assignment.assignment_id || ''),
    providerAccountId: String(account.provider_account_id || ''),
    primary: {
      provider: providerName,
      modelId: String(model.model_id),
      model: String(model.model_identifier),
      modelName: String(model.model_name || model.model_identifier)
    },
    fallback
  };
}

const FALLBACK_ELIGIBLE_ERRORS = new Set([
  'timeout', 'network_error', 'provider_error', 'model_unavailable',
  'rate_limited', 'incomplete_generation', 'invalid_generation'
]);

/** Moderation and policy failures must never trigger a fallback retry. */
export function canUseProviderFallback(error) {
  return FALLBACK_ELIGIBLE_ERRORS.has(String(error?.code || ''));
}
