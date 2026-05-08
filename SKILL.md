---
name: telnyx-openclaw-tts
description: Add Telnyx as an OpenClaw text-to-speech provider with TELNYX_API_KEY-based auth, auto-selection, voice listing, and low-latency synthesis.
homepage: https://github.com/team-telnyx/telnyx-openclaw-tts
metadata:
  {
    "openclaw": {
      "emoji": "🗣️",
      "requires": { "env": ["TELNYX_API_KEY"] },
      "install": [
        {
          "id": "npm",
          "kind": "npm",
          "package": "openclaw-telnyx-tts",
          "label": "Install the Telnyx TTS OpenClaw plugin"
        }
      ]
    }
  }
---

# Telnyx OpenClaw TTS

Use Telnyx as your OpenClaw text-to-speech provider.

## What it provides

- Telnyx speech provider registration for OpenClaw
- Auto-selection when `TELNYX_API_KEY` is configured
- Voice listing support
- Streaming/low-latency synthesis via Telnyx TTS
- NaturalHD and KokoroTTS voice support

## Install

```bash
openclaw install npm:openclaw-telnyx-tts
```

Or install the package directly:

```bash
npm install -g openclaw-telnyx-tts
```

## Setup

Set your Telnyx API key:

```bash
export TELNYX_API_KEY="KEY..."
```

Then restart the gateway:

```bash
openclaw gateway restart
```

## Verify

Test TTS:

```text
/tts Hello from Telnyx
```

Check active provider:

```text
/tts-status
```

## Notes

- Package: `openclaw-telnyx-tts`
- Repo: `team-telnyx/telnyx-openclaw-tts`
- OpenClaw compatibility: `>=2026.4.0`
