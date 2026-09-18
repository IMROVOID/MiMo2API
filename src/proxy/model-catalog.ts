import type { OpenAIModel, OpenAIModelListResponse } from "../types/openai.js";

/**
 * Mapping of user-facing aliases to canonical upstream MiMo model identifiers
 */
const MODEL_ALIASES: Readonly<Record<string, string>> = {
  "mimo-x-pro": "MiMo-X-Pro-Preview",
  "mimo-x": "MiMo-X-Pro-Preview",
  "gpt-4o": "MiMo-X-Pro-Preview",
  "MiMo-X-Pro-Preview": "MiMo-X-Pro-Preview",

  "mimo-x-flash": "MiMo-X-Flash-Preview",
  "mimo-flash": "MiMo-X-Flash-Preview",
  "MiMo-X-Flash-Preview": "MiMo-X-Flash-Preview",

  "mimo-v2.5-pro": "mimo-v2.5-pro",
  "mimo-v2.5": "mimo-v2.5-pro",
  "mimo-v2.5-flash": "mimo-v2.5-flash",
};

/**
 * List of publicly advertised models in /v1/models
 */
const ADVERTISED_MODELS: readonly OpenAIModel[] = [
  {
    id: "mimo-x-pro",
    object: "model",
    created: 1758234000,
    owned_by: "xiaomi-mimo",
    root: "MiMo-X-Pro-Preview",
  },
  {
    id: "mimo-x-flash",
    object: "model",
    created: 1758234000,
    owned_by: "xiaomi-mimo",
    root: "MiMo-X-Flash-Preview",
  },
  {
    id: "MiMo-X-Pro-Preview",
    object: "model",
    created: 1758234000,
    owned_by: "xiaomi-mimo",
    root: "MiMo-X-Pro-Preview",
  },
  {
    id: "MiMo-X-Flash-Preview",
    object: "model",
    created: 1758234000,
    owned_by: "xiaomi-mimo",
    root: "MiMo-X-Flash-Preview",
  },
  {
    id: "mimo-v2.5-pro",
    object: "model",
    created: 1758234000,
    owned_by: "xiaomi-mimo",
    root: "mimo-v2.5-pro",
  },
  {
    id: "mimo-v2.5-flash",
    object: "model",
    created: 1758234000,
    owned_by: "xiaomi-mimo",
    root: "mimo-v2.5-flash",
  },
];

/**
 * Resolves a requested model name or alias to the canonical upstream model ID
 */
export function resolveModelId(requestedModel: string): string {
  const normalized = requestedModel.trim();
  const directMatch = MODEL_ALIASES[normalized];
  if (directMatch !== undefined) {
    return directMatch;
  }

  const lower = normalized.toLowerCase();
  const lowerMatch = MODEL_ALIASES[lower];
  if (lowerMatch !== undefined) {
    return lowerMatch;
  }

  return normalized;
}

/**
 * Checks if a model or alias is recognized
 */
export function isSupportedModel(modelId: string): boolean {
  const resolved = resolveModelId(modelId);
  return Object.values(MODEL_ALIASES).includes(resolved);
}

/**
 * Returns OpenAI-compliant /v1/models response
 */
export function getModelList(): OpenAIModelListResponse {
  return {
    object: "list",
    data: ADVERTISED_MODELS,
  };
}
