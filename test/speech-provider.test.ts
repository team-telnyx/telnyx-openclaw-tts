import { describe, expect, it } from "vitest";
import {
  isValidTelnyxVoice,
  normalizeTelnyxBaseUrl,
  buildTelnyxSpeechProvider,
} from "../src/speech-provider.js";
import {
  DEFAULT_TELNYX_TTS_BASE_URL,
  DEFAULT_TELNYX_VOICE,
  TELNYX_TTS_DEFAULT_VOICES,
  TELNYX_TTS_VOICE_FAMILIES,
} from "../src/tts.js";

// ─── Voice validation ────────────────────────────────────────────────

describe("isValidTelnyxVoice", () => {
  it("accepts NaturalHD voices", () => {
    expect(isValidTelnyxVoice("Telnyx.NaturalHD.astra")).toBe(true);
    expect(isValidTelnyxVoice("Telnyx.NaturalHD.luna")).toBe(true);
    expect(isValidTelnyxVoice("Telnyx.NaturalHD.andersen_johan")).toBe(true);
  });

  it("accepts Natural voices", () => {
    expect(isValidTelnyxVoice("Telnyx.Natural.astra")).toBe(true);
    expect(isValidTelnyxVoice("Telnyx.Natural.iris")).toBe(true);
  });

  it("accepts KokoroTTS voices (full names)", () => {
    expect(isValidTelnyxVoice("Telnyx.KokoroTTS.af_alloy")).toBe(true);
    expect(isValidTelnyxVoice("Telnyx.KokoroTTS.am_adam")).toBe(true);
    expect(isValidTelnyxVoice("Telnyx.KokoroTTS.bf_emma")).toBe(true);
  });

  it("accepts Ultra voices", () => {
    expect(isValidTelnyxVoice("Telnyx.Ultra.some_voice")).toBe(true);
  });

  it("accepts Qwen3TTS voices", () => {
    expect(isValidTelnyxVoice("Telnyx.Qwen3TTS.some_voice")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isValidTelnyxVoice("telnyx.naturalhd.astra")).toBe(true);
    expect(isValidTelnyxVoice("TELNYX.NATURALHD.ASTRA")).toBe(true);
  });

  it("rejects empty strings", () => {
    expect(isValidTelnyxVoice("")).toBe(false);
    expect(isValidTelnyxVoice("  ")).toBe(false);
  });

  it("rejects ElevenLabs voice IDs", () => {
    expect(isValidTelnyxVoice("pMsXgVXv3BLzUgSXRplE")).toBe(false);
  });

  it("rejects random strings", () => {
    expect(isValidTelnyxVoice("some-random-voice")).toBe(false);
    expect(isValidTelnyxVoice("microsoft.en-US-JennyNeural")).toBe(false);
  });

  it("rejects AWS.Polly voices (non-Telnyx)", () => {
    expect(isValidTelnyxVoice("AWS.Polly.Joanna-Neural")).toBe(false);
  });
});

// ─── Base URL normalization ──────────────────────────────────────────

describe("normalizeTelnyxBaseUrl", () => {
  it("returns default for empty input", () => {
    expect(normalizeTelnyxBaseUrl()).toBe(DEFAULT_TELNYX_TTS_BASE_URL);
    expect(normalizeTelnyxBaseUrl("")).toBe(DEFAULT_TELNYX_TTS_BASE_URL);
    expect(normalizeTelnyxBaseUrl("  ")).toBe(DEFAULT_TELNYX_TTS_BASE_URL);
  });

  it("strips trailing slashes", () => {
    expect(normalizeTelnyxBaseUrl("wss://example.com/")).toBe("wss://example.com");
    expect(normalizeTelnyxBaseUrl("wss://example.com///")).toBe("wss://example.com");
  });

  it("preserves valid URLs", () => {
    expect(normalizeTelnyxBaseUrl("wss://custom.telnyx.com/v2/tts")).toBe(
      "wss://custom.telnyx.com/v2/tts"
    );
  });
});

// ─── Constants ───────────────────────────────────────────────────────

describe("constants", () => {
  it("DEFAULT_TELNYX_VOICE is Telnyx.NaturalHD.astra", () => {
    expect(DEFAULT_TELNYX_VOICE).toBe("Telnyx.NaturalHD.astra");
  });

  it("DEFAULT_TELNYX_TTS_BASE_URL is the WebSocket endpoint", () => {
    expect(DEFAULT_TELNYX_TTS_BASE_URL).toBe(
      "wss://api.telnyx.com/v2/text-to-speech"
    );
  });

  it("TELNYX_TTS_VOICE_FAMILIES covers all known families", () => {
    expect(TELNYX_TTS_VOICE_FAMILIES).toContain("Telnyx.NaturalHD");
    expect(TELNYX_TTS_VOICE_FAMILIES).toContain("Telnyx.Natural");
    expect(TELNYX_TTS_VOICE_FAMILIES).toContain("Telnyx.KokoroTTS");
    expect(TELNYX_TTS_VOICE_FAMILIES).toContain("Telnyx.Ultra");
    expect(TELNYX_TTS_VOICE_FAMILIES).toContain("Telnyx.Qwen3TTS");
  });

  it("TELNYX_TTS_DEFAULT_VOICES has at least 8 entries", () => {
    expect(TELNYX_TTS_DEFAULT_VOICES.length).toBeGreaterThanOrEqual(8);
  });

  it("default voice is in the defaults list", () => {
    expect(TELNYX_TTS_DEFAULT_VOICES).toContain(DEFAULT_TELNYX_VOICE);
  });

  it("all default voices are valid", () => {
    for (const voice of TELNYX_TTS_DEFAULT_VOICES) {
      expect(isValidTelnyxVoice(voice)).toBe(true);
    }
  });
});

// ─── Speech provider object ─────────────────────────────────────────

describe("buildTelnyxSpeechProvider", () => {
  const provider = buildTelnyxSpeechProvider();

  it("has correct id and label", () => {
    expect(provider.id).toBe("telnyx");
    expect(provider.label).toBe("Telnyx");
  });

  it("has autoSelectOrder before ElevenLabs", () => {
    expect(provider.autoSelectOrder).toBe(15);
    expect(provider.autoSelectOrder).toBeLessThan(20); // ElevenLabs
  });

  it("exposes models array", () => {
    expect(provider.models).toBeDefined();
    expect(provider.models.length).toBeGreaterThan(0);
  });

  it("exposes voices array matching default voices", () => {
    expect(provider.voices).toBeDefined();
    expect(provider.voices.length).toBe(TELNYX_TTS_DEFAULT_VOICES.length);
  });

  // Required methods
  it("has all required SpeechProviderPlugin methods", () => {
    expect(typeof provider.isConfigured).toBe("function");
    expect(typeof provider.synthesize).toBe("function");
  });

  // Optional methods
  it("has all optional SpeechProviderPlugin methods", () => {
    expect(typeof provider.resolveConfig).toBe("function");
    expect(typeof provider.parseDirectiveToken).toBe("function");
    expect(typeof provider.resolveTalkConfig).toBe("function");
    expect(typeof provider.resolveTalkOverrides).toBe("function");
    expect(typeof provider.synthesizeTelephony).toBe("function");
    expect(typeof provider.listVoices).toBe("function");
  });

  // isConfigured
  it("isConfigured returns false without API key", () => {
    const orig = process.env.TELNYX_API_KEY;
    delete process.env.TELNYX_API_KEY;
    expect(provider.isConfigured({ providerConfig: {}, timeoutMs: 5000 })).toBe(false);
    if (orig) process.env.TELNYX_API_KEY = orig;
  });

  it("isConfigured returns true with providerConfig.apiKey", () => {
    expect(
      provider.isConfigured({ providerConfig: { apiKey: "test-key" }, timeoutMs: 5000 })
    ).toBe(true);
  });

  // parseDirectiveToken
  it("parseDirectiveToken accepts valid NaturalHD voice", () => {
    const result = provider.parseDirectiveToken({
      key: "voice",
      value: "Telnyx.NaturalHD.luna",
      policy: { allowVoice: true },
    });
    expect(result.handled).toBe(true);
    expect(result.overrides?.voice).toBe("Telnyx.NaturalHD.luna");
  });

  it("parseDirectiveToken accepts valid KokoroTTS voice", () => {
    const result = provider.parseDirectiveToken({
      key: "telnyx_voice",
      value: "Telnyx.KokoroTTS.af_alloy",
      policy: { allowVoice: true },
    });
    expect(result.handled).toBe(true);
    expect(result.overrides?.voice).toBe("Telnyx.KokoroTTS.af_alloy");
  });

  it("parseDirectiveToken rejects invalid voice", () => {
    const result = provider.parseDirectiveToken({
      key: "voice",
      value: "invalid-voice",
      policy: { allowVoice: true },
    });
    expect(result.handled).toBe(true);
    expect(result.warnings).toBeDefined();
    expect(result.warnings!.length).toBeGreaterThan(0);
  });

  it("parseDirectiveToken ignores unknown keys", () => {
    const result = provider.parseDirectiveToken({
      key: "unknown_key",
      value: "anything",
      policy: { allowVoice: true },
    });
    expect(result.handled).toBe(false);
  });

  it("parseDirectiveToken respects allowVoice=false", () => {
    const result = provider.parseDirectiveToken({
      key: "voice",
      value: "Telnyx.NaturalHD.luna",
      policy: { allowVoice: false },
    });
    expect(result.handled).toBe(true);
    expect(result.overrides).toBeUndefined();
  });

  // resolveTalkOverrides
  it("resolveTalkOverrides returns voice override from voiceId", () => {
    const result = provider.resolveTalkOverrides!({
      talkProviderConfig: {},
      params: { voiceId: "Telnyx.NaturalHD.luna" },
    });
    expect(result).toBeDefined();
    expect(result!.voice).toBe("Telnyx.NaturalHD.luna");
  });

  it("resolveTalkOverrides returns voice override from voice param", () => {
    const result = provider.resolveTalkOverrides!({
      talkProviderConfig: {},
      params: { voice: "Telnyx.Natural.iris" },
    });
    expect(result).toBeDefined();
    expect(result!.voice).toBe("Telnyx.Natural.iris");
  });

  it("resolveTalkOverrides returns undefined when no params", () => {
    const result = provider.resolveTalkOverrides!({
      talkProviderConfig: {},
      params: {},
    });
    expect(result).toBeUndefined();
  });

  // listVoices (fallback — no API key)
  it("listVoices returns fallback defaults when no API key", async () => {
    const orig = process.env.TELNYX_API_KEY;
    delete process.env.TELNYX_API_KEY;
    const voices = await provider.listVoices({ providerConfig: {} });
    expect(voices.length).toBeGreaterThanOrEqual(8);
    expect(voices[0].id).toBe("Telnyx.NaturalHD.astra");
    expect(voices[0].category).toBe("NaturalHD");
    if (orig) process.env.TELNYX_API_KEY = orig;
  });
});
