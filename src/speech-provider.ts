/**
 * Telnyx speech provider for OpenClaw.
 *
 * Implements the `SpeechProviderPlugin` contract using Telnyx's
 * WebSocket-based TTS API. This is a drop-in replacement for ElevenLabs
 * at ~10x lower cost.
 *
 * Auto-select priority **15** places Telnyx before ElevenLabs (20) and
 * Microsoft Edge (50), making it the preferred remote TTS provider when
 * `TELNYX_API_KEY` is present.
 */

import {
  telnyxTts,
  DEFAULT_TELNYX_TTS_BASE_URL,
  DEFAULT_TELNYX_VOICE,
  TELNYX_TTS_DEFAULT_VOICES,
  TELNYX_TTS_VOICE_FAMILIES,
} from "./tts.js";

// ─── Types ───────────────────────────────────────────────────────────
// These match OpenClaw's SpeechProviderPlugin contract from
// ocplatform/plugin-sdk/speech. We define them inline to avoid
// tight coupling to specific OpenClaw type versions.

interface SpeechProviderConfig {
  [key: string]: unknown;
}

interface SpeechProviderConfiguredContext {
  cfg?: any;
  providerConfig: SpeechProviderConfig;
  timeoutMs: number;
}

interface SpeechSynthesisRequest {
  text: string;
  cfg: any;
  providerConfig: SpeechProviderConfig;
  target: string;
  providerOverrides?: SpeechProviderConfig;
  timeoutMs: number;
}

interface SpeechSynthesisResult {
  audioBuffer: Buffer;
  outputFormat: string;
  fileExtension: string;
  voiceCompatible: boolean;
}

interface SpeechTelephonySynthesisRequest {
  text: string;
  cfg: any;
  providerConfig: SpeechProviderConfig;
  timeoutMs: number;
}

interface SpeechTelephonySynthesisResult {
  audioBuffer: Buffer;
  outputFormat: string;
  sampleRate: number;
}

interface SpeechVoiceOption {
  id: string;
  name?: string;
  category?: string;
  description?: string;
}

interface SpeechListVoicesRequest {
  cfg?: any;
  providerConfig?: SpeechProviderConfig;
  apiKey?: string;
  baseUrl?: string;
}

interface SpeechProviderResolveConfigContext {
  cfg: any;
  rawConfig: Record<string, unknown>;
  timeoutMs: number;
}

interface SpeechDirectiveTokenParseContext {
  key: string;
  value: string;
  policy: { allowVoice: boolean; allowModelId?: boolean; [k: string]: unknown };
  selectedProvider?: string;
  providerConfig?: SpeechProviderConfig;
  currentOverrides?: SpeechProviderConfig;
}

interface SpeechDirectiveTokenParseResult {
  handled: boolean;
  overrides?: SpeechProviderConfig;
  warnings?: string[];
}

interface SpeechProviderResolveTalkConfigContext {
  cfg: any;
  baseTtsConfig: Record<string, unknown>;
  talkProviderConfig: Record<string, unknown>;
  timeoutMs: number;
}

interface SpeechProviderResolveTalkOverridesContext {
  talkProviderConfig: Record<string, unknown>;
  params: Record<string, unknown>;
}

// ─── Helpers ─────────────────────────────────────────────────────────

function asObject(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** Known voice ID prefixes (lowercased) for validation. */
const KNOWN_VOICE_PREFIXES = [
  "telnyx.naturalhd.",
  "telnyx.natural.",
  "telnyx.kokorotts.",
  "telnyx.ultra.",
  "telnyx.qwen3tts.",
  "telnyx.libritts.",
];

/** Check if a string looks like a valid Telnyx voice ID. */
export function isValidTelnyxVoice(voice: string): boolean {
  if (!voice?.trim()) return false;
  const lower = voice.trim().toLowerCase();
  return KNOWN_VOICE_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

/** Normalize the Telnyx TTS base URL (strip trailing slash). */
export function normalizeTelnyxBaseUrl(baseUrl?: string): string {
  const url = baseUrl?.trim();
  if (!url) return DEFAULT_TELNYX_TTS_BASE_URL;
  return url.replace(/\/+$/, "");
}

// ─── Config resolution ───────────────────────────────────────────────

interface TelnyxTtsConfig {
  apiKey?: string;
  baseUrl: string;
  voice: string;
}

/**
 * Resolve the Telnyx API key from multiple sources in priority order:
 *
 * 1. Explicit TTS provider config (`messages.tts.providers.telnyx.apiKey`)
 * 2. Global provider config (`models.providers.telnyx.apiKey` from ocplatform.json)
 * 3. `TELNYX_API_KEY` environment variable
 *
 * This mirrors the resolution chain used by telnyx-embeddings, ensuring
 * the "just set TELNYX_API_KEY" promise works out of the box while also
 * supporting explicit config overrides.
 */
function resolveTelnyxApiKey(
  providerConfig: SpeechProviderConfig,
  cfg?: any,
): string | undefined {
  // 1. Explicit provider config (highest priority)
  const directKey = asString(providerConfig.apiKey);
  if (directKey) return directKey;

  // 2. Global provider config from openclaw.json
  if (cfg) {
    const providers = asObject(asObject(cfg.models)?.providers);
    const telnyxProvider = asObject(providers?.telnyx);
    const globalKey = asString(telnyxProvider?.apiKey);
    if (globalKey) return globalKey;
  }

  // 3. Environment variable (most common — the "just works" path)
  const envKey = process.env.TELNYX_API_KEY?.trim();
  if (envKey) return envKey;

  return undefined;
}

/**
 * Read the provider config into a normalized TelnyxTtsConfig.
 *
 * Provider config comes from `messages.tts.providers.telnyx` in
 * openclaw.json, or from the raw config resolved by `resolveConfig`.
 */
function readTelnyxProviderConfig(
  providerConfig: SpeechProviderConfig,
  cfg?: any,
): TelnyxTtsConfig {
  return {
    apiKey: resolveTelnyxApiKey(providerConfig, cfg),
    baseUrl: normalizeTelnyxBaseUrl(asString(providerConfig.baseUrl)),
    voice: asString(providerConfig.voice) ?? DEFAULT_TELNYX_VOICE,
  };
}

/**
 * Resolve config from the raw TTS config block.
 *
 * Reads from `messages.tts.providers.telnyx` or `messages.tts.telnyx`
 * in the raw config map.
 */
function normalizeTelnyxRawConfig(
  rawConfig: Record<string, unknown>,
  cfg?: any,
): TelnyxTtsConfig {
  const providers = asObject(rawConfig.providers);
  const raw = asObject(providers?.telnyx) ?? asObject(rawConfig.telnyx) ?? {};

  return {
    apiKey: asString(raw.apiKey) ?? resolveTelnyxApiKey({}, cfg),
    baseUrl: normalizeTelnyxBaseUrl(asString(raw.baseUrl)),
    voice: asString(raw.voice) ?? DEFAULT_TELNYX_VOICE,
  };
}

// ─── Speech provider ─────────────────────────────────────────────────

/**
 * Build the Telnyx speech provider plugin object.
 *
 * This is the object registered with `api.registerSpeechProvider()` in
 * the plugin entry. It implements every method of the SpeechProviderPlugin
 * contract that is relevant for a TTS-only provider.
 */
export function buildTelnyxSpeechProvider() {
  return {
    id: "telnyx" as const,
    label: "Telnyx",

    // Priority 15: before ElevenLabs (20), before Microsoft Edge (50).
    // When TELNYX_API_KEY is set, Telnyx becomes the default remote TTS.
    autoSelectOrder: 15,

    // Telnyx uses a single TTS engine — no user-facing model variants.
    // Exposed for contract completeness (ElevenLabs exposes model IDs here).
    models: ["telnyx-tts"] as readonly string[],

    // Default/popular voice IDs (full catalog via listVoices)
    voices: TELNYX_TTS_DEFAULT_VOICES as unknown as readonly string[],

    /**
     * Resolve config from the raw TTS configuration block.
     */
    resolveConfig: (ctx: SpeechProviderResolveConfigContext): SpeechProviderConfig => {
      return normalizeTelnyxRawConfig(ctx.rawConfig, ctx.cfg) as unknown as SpeechProviderConfig;
    },

    /**
     * Parse voice/model directive tokens.
     *
     * Supports:
     * - `[[voice:Telnyx.NaturalHD.luna]]`
     * - `[[telnyx_voice:Telnyx.KokoroTTS.af]]`
     */
    parseDirectiveToken: (ctx: SpeechDirectiveTokenParseContext): SpeechDirectiveTokenParseResult => {
      switch (ctx.key) {
        case "voice":
        case "voiceid":
        case "voice_id":
        case "telnyx_voice":
        case "telnyxvoice":
          if (!ctx.policy.allowVoice) return { handled: true };
          if (!isValidTelnyxVoice(ctx.value)) {
            return {
              handled: true,
              warnings: [`invalid Telnyx voice "${ctx.value}" — use Telnyx.NaturalHD.* or Telnyx.KokoroTTS.*`],
            };
          }
          return {
            handled: true,
            overrides: {
              ...ctx.currentOverrides,
              voice: ctx.value,
            },
          };

        default:
          return { handled: false };
      }
    },

    /**
     * Resolve talk (voice call) config by merging base TTS config with
     * talk-specific provider overrides.
     */
    resolveTalkConfig: (ctx: SpeechProviderResolveTalkConfigContext): SpeechProviderConfig => {
      const base = normalizeTelnyxRawConfig(ctx.baseTtsConfig, ctx.cfg);
      const talk = ctx.talkProviderConfig;

      return {
        ...base,
        ...(asString(talk.apiKey) ? { apiKey: asString(talk.apiKey) } : {}),
        ...(asString(talk.baseUrl) ? { baseUrl: normalizeTelnyxBaseUrl(asString(talk.baseUrl)) } : {}),
        ...(asString(talk.voice) ? { voice: asString(talk.voice) } : {}),
      } as unknown as SpeechProviderConfig;
    },

    /**
     * Resolve runtime talk parameter overrides.
     *
     * Called during voice calls to apply per-utterance overrides from
     * talk commands (e.g., changing voice mid-call). Mirrors the
     * ElevenLabs pattern.
     */
    resolveTalkOverrides: (ctx: SpeechProviderResolveTalkOverridesContext): SpeechProviderConfig | undefined => {
      const { params } = ctx;
      const overrides: Record<string, unknown> = {};

      // Voice override
      const voiceId = asString(params.voiceId) ?? asString(params.voice);
      if (voiceId) overrides.voice = voiceId;

      // Only return overrides if we have any
      return Object.keys(overrides).length > 0 ? overrides : undefined;
    },

    /**
     * Check whether the provider is configured (has an API key).
     */
    isConfigured: (ctx: SpeechProviderConfiguredContext): boolean => {
      const config = readTelnyxProviderConfig(ctx.providerConfig, ctx.cfg);
      return !!config.apiKey;
    },

    /**
     * Synthesize text to audio.
     *
     * Returns an mp3 buffer for webchat TTS (voice notes, audio replies).
     * Output format is always mp3 — Telnyx's WebSocket TTS streams
     * mp3-encoded audio chunks.
     */
    synthesize: async (req: SpeechSynthesisRequest): Promise<SpeechSynthesisResult> => {
      const config = readTelnyxProviderConfig(req.providerConfig, req.cfg);
      const overrides = req.providerOverrides ?? {};

      const apiKey = asString(overrides.apiKey) ?? config.apiKey;
      if (!apiKey) throw new Error("Telnyx API key missing — set TELNYX_API_KEY");

      const voice = asString(overrides.voice) ?? config.voice;
      const isVoiceNote = req.target === "voice-note";

      const audioBuffer = await telnyxTts({
        text: req.text,
        apiKey,
        voice,
        baseUrl: config.baseUrl,
        timeoutMs: req.timeoutMs,
      });

      return {
        audioBuffer,
        outputFormat: "mp3",
        fileExtension: ".mp3",
        voiceCompatible: isVoiceNote,
      };
    },

    /**
     * Synthesize text for telephony (voice calls via ClawdTalk).
     *
     * Returns mp3 audio — OpenClaw's telephony runtime handles format
     * conversion to the target codec (μ-law, PCM, etc.) as needed.
     */
    synthesizeTelephony: async (req: SpeechTelephonySynthesisRequest): Promise<SpeechTelephonySynthesisResult> => {
      const config = readTelnyxProviderConfig(req.providerConfig, req.cfg);
      const apiKey = config.apiKey;
      if (!apiKey) throw new Error("Telnyx API key missing — set TELNYX_API_KEY");

      const audioBuffer = await telnyxTts({
        text: req.text,
        apiKey,
        voice: config.voice,
        baseUrl: config.baseUrl,
        timeoutMs: req.timeoutMs,
      });

      return {
        audioBuffer,
        outputFormat: "mp3",
        sampleRate: 44100,
      };
    },

    /**
     * List available voices.
     *
     * Fetches the full Telnyx voice catalog from the REST API.
     * Falls back to a curated default list if the API is unreachable.
     */
    listVoices: async (req: SpeechListVoicesRequest): Promise<SpeechVoiceOption[]> => {
      const apiKey = req.apiKey
        ?? asString(req.providerConfig?.apiKey)
        ?? resolveTelnyxApiKey({}, req.cfg);

      if (apiKey) {
        try {
          const baseUrl = asString(req.baseUrl) ?? "https://api.telnyx.com";
          const response = await fetch(`${baseUrl}/v2/text-to-speech/voices`, {
            headers: { Authorization: `Bearer ${apiKey}` },
            signal: AbortSignal.timeout(10_000),
          });

          if (response.ok) {
            const data = await response.json() as {
              voices?: Array<{
                id?: string;
                name?: string;
                language?: string;
                gender?: string;
                provider?: string;
              }>;
            };

            if (Array.isArray(data.voices)) {
              // Filter to Telnyx-native voices only
              return data.voices
                .filter((v) => v.id?.startsWith("Telnyx."))
                .map((v) => ({
                  id: v.id!,
                  name: v.name ?? v.id!.split(".").pop(),
                  category: v.id!.split(".")[1] ?? "Telnyx",
                  description: [
                    v.gender,
                    v.language,
                  ].filter(Boolean).join(", ") || undefined,
                }));
            }
          }
        } catch {
          // Fall through to defaults
        }
      }

      // Fallback: curated defaults when API is unreachable
      return [
        { id: "Telnyx.NaturalHD.astra", name: "Astra", category: "NaturalHD", description: "Female, en-US (default)" },
        { id: "Telnyx.NaturalHD.luna", name: "Luna", category: "NaturalHD", description: "Female, en-US" },
        { id: "Telnyx.NaturalHD.andersen_johan", name: "Andersen Johan", category: "NaturalHD", description: "Male, en-US" },
        { id: "Telnyx.NaturalHD.orion", name: "Orion", category: "NaturalHD", description: "Male, en-US" },
        { id: "Telnyx.NaturalHD.celeste", name: "Celeste", category: "NaturalHD", description: "Female, en-US" },
        { id: "Telnyx.NaturalHD.bond", name: "Bond", category: "NaturalHD", description: "Male, en-US" },
        { id: "Telnyx.KokoroTTS.af_alloy", name: "AF Alloy", category: "KokoroTTS", description: "Female, en-US" },
        { id: "Telnyx.KokoroTTS.am_adam", name: "AM Adam", category: "KokoroTTS", description: "Male, en-US" },
      ];
    },
  };
}
