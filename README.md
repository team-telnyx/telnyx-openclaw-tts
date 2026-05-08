# openclaw-telnyx-tts

> Telnyx TTS speech provider for OpenClaw — 10x cheaper than ElevenLabs, carrier-grade latency.

Use [Telnyx AI](https://telnyx.com/products/voice-ai-agents) as your OpenClaw text-to-speech backend. Every `/tts` command, voice note, and ClawdTalk voice call will use Telnyx TTS — premium NaturalHD voices at a fraction of ElevenLabs' cost.

## Why Telnyx TTS?

| Feature | Telnyx | ElevenLabs |
|---------|--------|------------|
| **Price** | ~10x cheaper | $5-99/mo or per-char |
| **Extra key needed** | No — same `TELNYX_API_KEY` | Yes — `ELEVENLABS_API_KEY` |
| **Latency** | Carrier-grade, edge-hosted | Cloud-based |
| **Voices** | NaturalHD (premium) + KokoroTTS (budget) | 1000+ cloned voices |
| **Co-located** | ✅ Same infra as voice/SMS | ❌ External |

## Quick Start

### 1. Install

```bash
openclaw install npm:openclaw-telnyx-tts
```

Or manually:

```bash
npm install -g openclaw-telnyx-tts
```

### 2. Set your API key

```bash
export TELNYX_API_KEY="KEY..."
```

Or in `openclaw.json`:

```json
{
  "models": {
    "providers": {
      "telnyx": {
        "apiKey": "KEY..."
      }
    }
  }
}
```

### 3. Restart the gateway

```bash
openclaw gateway restart
```

That's it. TTS will automatically detect and use Telnyx when `TELNYX_API_KEY` is set.

## How It Works

This plugin registers `telnyx` as a first-class speech provider in OpenClaw's TTS system. Under the hood:

1. **Auto-detection**: When `TELNYX_API_KEY` is set, the plugin is auto-selected with priority 15 (before ElevenLabs at 20).
2. **WebSocket TTS**: Uses `wss://api.telnyx.com/v2/text-to-speech/speech` for low-latency streaming synthesis.
3. **Zero config**: No `messages.tts` config block needed. Just set the API key and restart.
4. **Full contract**: Implements `synthesize`, `synthesizeTelephony`, `listVoices`, and directive parsing.

## Configuration

### Explicit provider selection

Force Telnyx as the TTS provider:

```json
{
  "messages": {
    "tts": {
      "provider": "telnyx"
    }
  }
}
```

### Custom voice

```json
{
  "messages": {
    "tts": {
      "providers": {
        "telnyx": {
          "voice": "Telnyx.NaturalHD.luna"
        }
      }
    }
  }
}
```

### Available voices

| Voice | Family | Description |
|-------|--------|-------------|
| `Telnyx.NaturalHD.astra` | Premium | Female, warm and clear (default) |
| `Telnyx.NaturalHD.luna` | Premium | Female, soft and calm |
| `Telnyx.NaturalHD.andersen_johan` | Premium | Male, professional |
| `Telnyx.NaturalHD.constance` | Premium | Female, confident |
| `Telnyx.NaturalHD.orion` | Premium | Male, deep and authoritative |
| `Telnyx.NaturalHD.iris` | Premium | Female, friendly and bright |
| `Telnyx.KokoroTTS.af` | Budget | Female, high-volume |
| `Telnyx.KokoroTTS.am` | Budget | Male, high-volume |
| `Telnyx.KokoroTTS.bf` | Budget | Female alternative |
| `Telnyx.KokoroTTS.bm` | Budget | Male alternative |

### Voice directives

Override the voice per-message using directives:

```
[[voice:Telnyx.NaturalHD.luna]] Hello, this is Luna speaking.
```

### Custom base URL

For proxy setups:

```json
{
  "messages": {
    "tts": {
      "providers": {
        "telnyx": {
          "baseUrl": "wss://your-proxy.example.com/v2/text-to-speech"
        }
      }
    }
  }
}
```

## Auto-Select Priority

When TTS provider is `"auto"` (the default), OpenClaw tries speech providers in order:

| Priority | Provider | Notes |
|----------|----------|-------|
| **15** | **`telnyx`** | **This plugin — preferred when TELNYX_API_KEY is set** |
| 20 | `elevenlabs` | Requires ELEVENLABS_API_KEY |
| 50 | `microsoft` | Edge TTS (free, lower quality) |

## Verify It's Working

After installation and restart, test with:

```
/tts Hello from Telnyx!
```

Or check provider status:

```
/tts-status
```

## Troubleshooting

### "Telnyx API key missing"

Set your API key:
```bash
export TELNYX_API_KEY="KEY..."
```

Get one at [portal.telnyx.com](https://portal.telnyx.com/#/app/api-keys).

### "WebSocket error" or timeout

- Check your network connection
- Ensure `wss://api.telnyx.com` is reachable
- Try increasing timeout in config

### TTS still using ElevenLabs

- Make sure the plugin is installed: `openclaw plugins list`
- Restart the gateway: `openclaw gateway restart`
- Remove any explicit `"provider": "elevenlabs"` in your TTS config

## Development

```bash
git clone https://github.com/team-telnyx/telnyx-openclaw-tts.git
cd telnyx-openclaw-tts
npm install
npm run build
```

### Testing locally

```bash
npm link
openclaw install link:openclaw-telnyx-tts
```

## Architecture

```
┌──────────────────────────────────────────────────┐
│                OpenClaw Gateway                │
│                                                  │
│  /tts "Hello!"  or  voice-note synthesis         │
│       │                                          │
│       ▼                                          │
│  ┌─────────────────────┐                         │
│  │  Speech Provider    │  auto-select chain:     │
│  │  Manager            │  telnyx → elevenlabs    │
│  └────────┬────────────┘  → microsoft            │
│           │                                      │
│           ▼                                      │
│  ┌─────────────────────────────────────┐         │
│  │  telnyx-tts plugin                  │         │
│  │  (this package)                     │         │
│  │                                     │         │
│  │  buildTelnyxSpeechProvider() →      │         │
│  │    telnyxTts({                      │         │
│  │      voice: "NaturalHD.astra",     │         │
│  │      apiKey: TELNYX_API_KEY         │         │
│  │    }) → mp3 Buffer                  │         │
│  └────────┬────────────────────────────┘         │
│           │                                      │
└───────────┼──────────────────────────────────────┘
            │ WebSocket (wss://)
            ▼
   ┌────────────────────┐
   │  Telnyx TTS API    │
   │  /v2/text-to-      │
   │  speech/speech     │
   │                    │
   │  NaturalHD voices  │
   └────────────────────┘
```

## License

MIT

## Credits

Built for the [OpenClaw](https://github.com/openclaw/openclaw) ecosystem by the Telnyx AI FDE team.
