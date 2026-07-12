/**
 * Diagnostic CLI: sends a real message to a stored connection and streams the reply.
 * Reuses the exact Vault, Store, and provider code the app uses, so it decrypts the
 * same token from the same keychain and exercises the same request path.
 *
 * Build then run:
 *   npm run build
 *   npm run test:chat -- --connection=copilot --prompt="Say hello"
 *
 * Flags:
 *   --connection=<id|label|providerType>   which connection to use (default: copilot)
 *   --model=<model-id>                     override the model
 *   --prompt=<text>                        the message to send
 *   --list                                 just list connections and exit
 */
import { app } from 'electron';
import { Store } from './store';
import { Vault } from './vault';
import { getProvider } from './providers';
import { PROVIDER_META } from '@shared/types';

app.setName('Agent Control Panel');

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}
const hasFlag = (name: string): boolean => process.argv.includes(`--${name}`);

async function main(): Promise<void> {
  const dir = app.getPath('userData');
  console.log(`\nData directory: ${dir}`);
  const store = new Store(dir);
  const vault = new Vault(dir);

  const connections = await store.listConnections();
  if (connections.length === 0) {
    console.error('No connections found. Create one in the app first.');
    return void app.exit(1);
  }

  if (hasFlag('list')) {
    console.log('\nConnections:');
    connections.forEach((c) =>
      console.log(`  • ${c.label}  [${c.providerType}]  key=${c.hasKey}  id=${c.id}`)
    );
    return void app.exit(0);
  }

  const selector = arg('connection') ?? 'copilot';
  const conn =
    connections.find(
      (c) => c.id === selector || c.label === selector || c.providerType === selector
    ) ?? connections.find((c) => c.providerType === 'copilot');

  if (!conn) {
    console.error(`\nNo connection matched "${selector}". Available:`);
    connections.forEach((c) => console.error(`  • ${c.label} [${c.providerType}] id=${c.id}`));
    return void app.exit(1);
  }

  const meta = PROVIDER_META[conn.providerType];
  console.log(`\n▶ Connection : ${conn.label}  [${conn.providerType}]`);
  console.log(`  Encryption : ${vault.isAvailable() ? 'available' : 'UNAVAILABLE'} (${vault.backendName()})`);

  const needsCred = meta.needsKey || meta.supportsDeviceFlow;
  const apiKey = needsCred ? await vault.getSecret(conn.id) : null;
  if (needsCred) {
    if (!apiKey) {
      console.error('  Credential : MISSING — sign in / add a key in the app first. ✗');
      return void app.exit(1);
    }
    console.log(`  Credential : decrypted from vault ✓ (${apiKey.length} chars)`);
  }

  const ctx = { baseUrl: conn.baseUrl, apiKey };
  const provider = getProvider(conn.providerType);

  console.log('\n▶ Listing models…');
  let firstModel: string | undefined;
  try {
    const models = await provider.listModels(ctx);
    firstModel = models[0]?.id;
    console.log(`  ${models.length} model(s). Sample: ${models.slice(0, 8).map((m) => m.id).join(', ')}`);
  } catch (err) {
    console.log(`  Could not list models: ${(err as Error).message}`);
  }

  const model =
    arg('model') ?? conn.defaultModel ?? firstModel ?? meta.suggestedModels?.[0] ?? 'gpt-4o';
  const prompt = arg('prompt') ?? 'Reply with a short one-sentence greeting and name the model you are.';

  console.log(`\n▶ Sending message   model=${model}`);
  console.log(`  Prompt: ${prompt}`);
  console.log('  ---------------- streamed reply ----------------');

  let full = '';
  const controller = new AbortController();
  const started = Date.now();
  try {
    await provider.streamChat(
      ctx,
      model,
      [{ role: 'user', content: prompt }],
      undefined,
      controller.signal,
      { onChunk: (delta) => { process.stdout.write(delta); full += delta; } }
    );
  } catch (err) {
    console.error(`\n\n❌ Chat failed: ${(err as Error).message}`);
    return void app.exit(1);
  }

  const ms = Date.now() - started;
  console.log('\n  ------------------------------------------------');
  if (full.trim().length > 0) {
    console.log(`\n✅ SUCCESS — received ${full.length} chars in ${ms} ms.`);
    return void app.exit(0);
  }
  console.log('\n⚠️  Stream ended but no text was returned.');
  return void app.exit(2);
}

app.whenReady().then(main).catch((err) => {
  console.error('\n❌ ERROR:', err?.message ?? err);
  app.exit(1);
});
