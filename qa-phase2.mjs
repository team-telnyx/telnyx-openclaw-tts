// Phase 2: Blind Agent Integration tests — corrected signatures per SpeechProviderPlugin contract
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

globalThis.require = createRequire(import.meta.url); // shim for ws CJS bundle

const distUrl = pathToFileURL(resolve('./dist/index.js')).href;
const mod = await import(distUrl);

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
}

console.log('--- exports ---');
console.log('export keys:', Object.keys(mod).join(', '));
const entry = mod.default ?? mod;
console.log('entry keys:', Object.keys(entry).join(', '));
check('export.id is string', typeof entry.id === 'string', `id="${entry.id}"`);
check('export.name is string', typeof entry.name === 'string', `name="${entry.name}"`);
check('export.register is function', typeof entry.register === 'function');

let provider = null;
const fakeApi = { registerSpeechProvider(p) { provider = p; } };
let regErr = null;
try { await entry.register(fakeApi); } catch (e) { regErr = e; }
check('register() runs without error', !regErr, regErr ? String(regErr) : '');
check('provider was registered', !!provider);

console.log('\n--- provider methods ---');
const expected = [
  'id', 'label', 'autoSelectOrder', 'models', 'voices', 'isConfigured',
  'synthesize', 'synthesizeTelephony', 'listVoices', 'resolveConfig',
  'parseDirectiveToken', 'resolveTalkConfig', 'resolveTalkOverrides',
];
for (const k of expected) {
  const v = provider[k];
  check(`has ${k}`, v !== undefined, `type=${typeof v}`);
}

console.log('\n--- isConfigured (correct ctx shape) ---');
delete process.env.TELNYX_API_KEY;
let r;

r = provider.isConfigured({ providerConfig: {}, cfg: {}, timeoutMs: 5000 });
check('isConfigured w/ empty providerConfig+no env => false', r === false, `got=${r}`);

r = provider.isConfigured({ providerConfig: { apiKey: 'KEYxxx' }, cfg: {}, timeoutMs: 5000 });
check('isConfigured w/ providerConfig.apiKey => true', r === true, `got=${r}`);

process.env.TELNYX_API_KEY = 'KEYenvtest';
r = provider.isConfigured({ providerConfig: {}, cfg: {}, timeoutMs: 5000 });
check('isConfigured via TELNYX_API_KEY env => true', r === true, `got=${r}`);
delete process.env.TELNYX_API_KEY;

r = provider.isConfigured({
  providerConfig: {},
  cfg: { models: { providers: { telnyx: { apiKey: 'KEYglobal' } } } },
  timeoutMs: 5000,
});
check('isConfigured via cfg.models.providers.telnyx.apiKey => true', r === true, `got=${r}`);

console.log('\n--- parseDirectiveToken (correct ctx shape) ---');
const policy = { allowVoice: true, allowModelId: false };

let t = provider.parseDirectiveToken({ key: 'voice', value: 'Telnyx.NaturalHD.luna', policy });
console.log('valid voice =>', JSON.stringify(t));
check('valid voice handled w/ overrides.voice', t.handled === true && t.overrides?.voice === 'Telnyx.NaturalHD.luna');

t = provider.parseDirectiveToken({ key: 'voice', value: 'BogusProvider.Foo.bar', policy });
console.log('invalid voice =>', JSON.stringify(t));
check('invalid voice handled w/ warnings, no overrides', t.handled === true && Array.isArray(t.warnings) && !t.overrides);

t = provider.parseDirectiveToken({ key: 'voice', value: 'Telnyx.NaturalHD.luna', policy: { allowVoice: false } });
console.log('voice when allowVoice=false =>', JSON.stringify(t));
check('voice w/ policy.allowVoice=false => handled, no overrides', t.handled === true && !t.overrides);

t = provider.parseDirectiveToken({ key: 'unknownkey', value: 'anything', policy });
console.log('unknown key =>', JSON.stringify(t));
check('unknown directive key => handled:false', t.handled === false);

t = provider.parseDirectiveToken({ key: 'telnyx_voice', value: 'Telnyx.KokoroTTS.af_alloy', policy });
console.log('telnyx_voice =>', JSON.stringify(t));
check('telnyx_voice key parsed', t.handled === true && t.overrides?.voice === 'Telnyx.KokoroTTS.af_alloy');

console.log('\n--- resolveConfig ---');
const resolved = provider.resolveConfig({
  cfg: {},
  rawConfig: { providers: { telnyx: { voice: 'Telnyx.NaturalHD.luna', apiKey: 'KEYraw' } } },
  timeoutMs: 5000,
});
console.log('resolved:', JSON.stringify(resolved));
check('resolveConfig pulls voice/apiKey out', resolved.voice === 'Telnyx.NaturalHD.luna' && resolved.apiKey === 'KEYraw');

console.log('\n--- resolveTalkOverrides ---');
const overr = provider.resolveTalkOverrides({ talkProviderConfig: {}, params: { voiceId: 'Telnyx.NaturalHD.orion' } });
console.log('overr:', JSON.stringify(overr));
check('resolveTalkOverrides reads voiceId', overr?.voice === 'Telnyx.NaturalHD.orion');

console.log('\n--- summary ---');
console.log('id:', provider.id, '| label:', provider.label, '| autoSelectOrder:', provider.autoSelectOrder);
console.log('models:', provider.models);
console.log('voices count:', provider.voices.length, 'first:', provider.voices[0]);

const fails = results.filter(r => !r.ok);
console.log(`\n=== Phase 2 Result: ${results.length - fails.length}/${results.length} pass ===`);
if (fails.length) for (const f of fails) console.log(' - FAIL:', f.name, '|', f.detail);
