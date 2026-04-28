/**
 * openclaw-telnyx-tts
 *
 * Registers Telnyx as a first-class speech (TTS) provider for OpenClaw.
 * Uses Telnyx's WebSocket-based Text-to-Speech API for low-latency,
 * carrier-grade speech synthesis at ~10x lower cost than ElevenLabs.
 *
 * Architecture:
 * - Telnyx exposes a WebSocket TTS endpoint at
 *   wss://api.telnyx.com/v2/text-to-speech/speech
 * - We implement the OpenClaw `speechProviders` contract, same as
 *   the built-in ElevenLabs provider.
 * - Auto-select priority 15 (before ElevenLabs at 20) so Telnyx is
 *   preferred when TELNYX_API_KEY is present.
 * - Voices: NaturalHD (premium) and KokoroTTS (budget) families.
 */

import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { buildTelnyxSpeechProvider } from "./speech-provider.js";

export default definePluginEntry({
  id: "telnyx-tts",
  name: "Telnyx Text-to-Speech Provider",
  description:
    "Speech provider using Telnyx TTS. 10x cheaper than ElevenLabs — just set TELNYX_API_KEY.",

  register(api) {
    api.registerSpeechProvider(buildTelnyxSpeechProvider());
  },
});
