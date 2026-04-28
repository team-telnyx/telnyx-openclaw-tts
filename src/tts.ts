/**
 * Low-level Telnyx TTS WebSocket client.
 *
 * Telnyx exposes a WebSocket-based TTS API at:
 *   wss://api.telnyx.com/v2/text-to-speech/speech?voice=<voice>
 *
 * Protocol:
 *   1. Connect with Bearer auth header
 *   2. Send init frame: { "text": " " }
 *   3. Send text frame: { "text": "<content>" }
 *   4. Send stop frame: { "text": "" }
 *   5. Receive audio chunks (base64-encoded mp3):
 *      - Streaming chunks have text=null → collect these
 *      - Complete blob has text=<original> → skip (duplicate)
 *      - Final frame has isFinal=true → stop
 *
 * Uses the `ws` package for WebSocket with custom headers support.
 * Node.js built-in WebSocket doesn't support Authorization headers.
 */

import WebSocket from "ws";

/** Default WebSocket TTS endpoint. */
export const DEFAULT_TELNYX_TTS_BASE_URL = "wss://api.telnyx.com/v2/text-to-speech";

/** Default voice for synthesis. */
export const DEFAULT_TELNYX_VOICE = "Telnyx.NaturalHD.astra";

/**
 * Well-known Telnyx voice families.
 *
 * Telnyx has 950+ native voices across these families. This list
 * contains popular defaults; the full catalog is fetched live from
 * the `listVoices` API at `GET /v2/text-to-speech/voices`.
 */
export const TELNYX_TTS_VOICE_FAMILIES = [
  "Telnyx.NaturalHD",
  "Telnyx.Natural",
  "Telnyx.KokoroTTS",
  "Telnyx.Ultra",
  "Telnyx.Qwen3TTS",
  "Telnyx.LibriTTS",
] as const;

/**
 * Default/popular voices for quick reference.
 *
 * Note: Telnyx.Natural.* voices do NOT work via the WebSocket TTS API
 * (they return isFinal immediately with no audio). They're legacy
 * Call-Control-only voices. Only NaturalHD and KokoroTTS families
 * are confirmed working with the WebSocket endpoint.
 *
 * Ultra and Qwen3TTS may require specific plan tiers (403 without).
 */
export const TELNYX_TTS_DEFAULT_VOICES = [
  // NaturalHD — premium, refined prosody (confirmed working)
  "Telnyx.NaturalHD.astra",
  "Telnyx.NaturalHD.luna",
  "Telnyx.NaturalHD.andersen_johan",
  "Telnyx.NaturalHD.orion",
  "Telnyx.NaturalHD.celeste",
  "Telnyx.NaturalHD.bond",
  // KokoroTTS — budget-friendly, high-volume (confirmed working)
  "Telnyx.KokoroTTS.af_alloy",
  "Telnyx.KokoroTTS.af_bella",
  "Telnyx.KokoroTTS.am_adam",
  "Telnyx.KokoroTTS.am_michael",
] as const;

/** TTS synthesis parameters. */
export interface TelnyxTtsParams {
  text: string;
  apiKey: string;
  voice: string;
  baseUrl?: string;
  timeoutMs?: number;
}

/** Response frame from the Telnyx TTS WebSocket. */
interface TtsFrame {
  audio?: string;
  text?: string | null;
  isFinal?: boolean;
}

/**
 * Synthesize text to audio via Telnyx WebSocket TTS.
 *
 * Returns an mp3 audio buffer. Throws on connection errors, auth
 * failures, timeouts, or empty responses.
 */
export async function telnyxTts(params: TelnyxTtsParams): Promise<Buffer> {
  const {
    text,
    apiKey,
    voice,
    baseUrl = DEFAULT_TELNYX_TTS_BASE_URL,
    timeoutMs = 30_000,
  } = params;

  if (!text?.trim()) {
    throw new Error("Telnyx TTS: text is empty");
  }
  if (!apiKey?.trim()) {
    throw new Error("Telnyx TTS: API key is missing");
  }

  const url = `${baseUrl}/speech?voice=${encodeURIComponent(voice)}`;

  return new Promise<Buffer>((resolve, reject) => {
    let settled = false;
    const audioChunks: Buffer[] = [];

    // Timeout guard
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        try { ws.close(); } catch {}
        reject(new Error(`Telnyx TTS: timeout after ${timeoutMs}ms`));
      }
    }, timeoutMs);

    function finish(error?: Error) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { ws.close(); } catch {}

      if (error) {
        reject(error);
        return;
      }
      if (audioChunks.length === 0) {
        reject(new Error("Telnyx TTS: no audio received"));
        return;
      }
      resolve(Buffer.concat(audioChunks));
    }

    // Use `ws` package — supports custom headers for auth
    const ws = new WebSocket(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    ws.on("open", () => {
      try {
        // 1. Init frame (required by Telnyx protocol)
        ws.send(JSON.stringify({ text: " " }));
        // 2. Text frame
        ws.send(JSON.stringify({ text }));
        // 3. Stop frame — signals end of input
        ws.send(JSON.stringify({ text: "" }));
      } catch (err) {
        finish(new Error(`Telnyx TTS: failed to send frames — ${err}`));
      }
    });

    ws.on("message", (data: WebSocket.RawData) => {
      try {
        const raw = typeof data === "string"
          ? data
          : Buffer.isBuffer(data)
            ? data.toString("utf8")
            : Buffer.from(data as ArrayBuffer).toString("utf8");

        const frame: TtsFrame = JSON.parse(raw);

        // Collect audio from ANY frame that has it.
        //
        // Protocol varies by voice family:
        //  - NaturalHD: streams audio in text=null chunks, then a
        //    "complete blob" frame with text=<original>. We collect
        //    only the streaming chunks to avoid doubling.
        //  - KokoroTTS/others: may return all audio in a single
        //    frame where text=<original> (no text=null chunks).
        //
        // Strategy: always collect audio. If we already have
        // streaming chunks (text=null) when we see the complete
        // blob (text=<original>), skip the blob to avoid doubling.
        if (frame.audio) {
          const isStreamingChunk = frame.text === undefined || frame.text === null;
          const isCompletionBlob = !isStreamingChunk;

          if (isCompletionBlob && audioChunks.length > 0) {
            // Already have streaming chunks — skip the duplicate blob
          } else {
            audioChunks.push(Buffer.from(frame.audio, "base64"));
          }
        }

        // Final frame — we're done
        if (frame.isFinal) {
          finish();
          return;
        }
      } catch (err) {
        finish(new Error(`Telnyx TTS: failed to parse frame — ${err}`));
      }
    });

    ws.on("error", (err: Error) => {
      finish(new Error(`Telnyx TTS: WebSocket error — ${err.message ?? "unknown"}`));
    });

    ws.on("close", (code: number, reason: Buffer) => {
      if (!settled) {
        if (audioChunks.length > 0) {
          // Got audio before close — success
          finish();
        } else {
          finish(new Error(
            `Telnyx TTS: connection closed (code=${code}, reason=${reason?.toString() || "none"})`
          ));
        }
      }
    });
  });
}
