const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'static/js/vue_methods.js'), 'utf8');
const context = vm.createContext({ console: { log() {} }, showNotification() {} });
vm.runInContext(source.slice(source.indexOf('let vue_methods = {')) + '\nthis.methods = vue_methods;', context);
const methods = context.methods;
const plain = value => JSON.parse(JSON.stringify(value));
const current = ['MiniMax-M3.1-Flash', 'MiniMax-M3'];
const fixtures = [];

async function main() {
  for (const url of ['https://api.minimaxi.com/v1', 'https://api.minimax.io/v1/']) {
    const saved = { vendor: 'minimax', url, modelId: 'MiniMax-M2.7', models: ['MiniMax-M2.7', 'MiniMax-M3', 'abab6.5s-chat', 'speech-2.8-hd', 'MiniMax-Hailuo-2.3', 'other-model'] };
    const before = plain(saved);
    assert.deepEqual(plain(methods.getProviderModelChoices(saved)), [...current, ...saved.models.slice(3)]);
    assert.deepEqual(plain(saved), before);
    fixtures.push({ ...saved, model: saved.modelId });
    for (const vendor of ['custom', 'customAnthropic', 'OpenAIResponses']) {
      assert.deepEqual(plain(methods.getProviderModelChoices({ ...saved, vendor })), saved.models);
    }
  }
  const custom = { vendor: 'minimax', url: 'https://proxy.example/v1', models: ['MiniMax-M2.7'], modelId: 'custom-id' };
  assert.deepEqual(plain(methods.getProviderModelChoices(custom)), custom.models);
  fixtures.push({ ...custom, model: custom.modelId });
  const gateway = { vendor: 'openrouter', url: 'https://openrouter.ai/api/v1', models: ['other-model', 'minimax/minimax-m2.7', 'minimax/minimax-m3', 'minimax/hailuo-2.3'] };
  assert.deepEqual(plain(methods.getProviderModelChoices(gateway)), ['other-model', 'minimax/minimax-m3.1-flash:free', 'minimax/minimax-m3', 'minimax/hailuo-2.3']);
  fixtures.push({ ...gateway, model: 'minimax/minimax-m3.1-flash:free' });
  assert.deepEqual(plain(methods.getProviderModelChoices({ ...gateway, models: ['other-model'] })), ['other-model']);

  const app = {
    ...methods, newProviderTemp: { vendor: 'minimax', models: [] }, modelProviders: [],
    settings: {}, async autoSaveSettings() {}, isdocker: false,
    reasoningEfforts: [null, 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'none'].map(value => ({ value }))
  };
  app.handleVendorChange('minimax');
  assert.deepEqual(plain(app.newProviderTemp.models), current);
  app.confirmAddProvider();
  assert.equal(app.modelProviders[0].modelId, current[0]);
  await app.selectMainProvider(app.modelProviders[0].id);
  assert.equal(app.settings.model, current[0]);
  assert.equal(app.settings.base_url, 'https://api.minimaxi.com/v1');
  fixtures.unshift({ vendor: 'minimax', url: app.settings.base_url, model: app.settings.model });
  fixtures.push({ vendor: 'minimax', url: 'https://api.minimax.io/v1', model: current[0] });
  fixtures.push({ vendor: 'minimax', url: 'https://api.minimax.io/v1', model: current[1] });

  for (const url of ['https://api.minimaxi.com/v1', 'https://api.minimax.io/v1/']) {
    const config = { model: current[0], base_url: url, reasoning_effort: 'none' };
    assert.deepEqual(plain(app.getReasoningEfforts(config).map(item => item.value)), [null, 'low', 'medium', 'high', 'xhigh', 'max']);
    assert.equal(config.reasoning_effort, 'none');
    assert.equal(app.getReasoningEfforts({ ...config, model: 'MiniMax-M2.7' }), app.reasoningEfforts);
  }

  context.fetch = async () => ({ ok: true, json: async () => ({ data: ['MiniMax-M2.7', 'speech-2.8-hd'] }) });
  app.t = value => value;
  app.newProviderTemp = { vendor: 'minimax', url: 'https://api.minimax.io/v1', apiKey: 'offline-test', models: [] };
  await app.testAndFetchModels();
  assert.deepEqual(plain(app.newProviderTemp.models), [...current, 'speech-2.8-hd']);
  const saved = { ...app.newProviderTemp, modelId: 'MiniMax-M2.7' };
  await app.fetchModelsForProvider(saved);
  assert.equal(saved.modelId, 'MiniMax-M2.7');
  assert.deepEqual(plain(app.getProviderModelChoices(saved)), [...current, 'speech-2.8-hd']);
  context.fetch = async () => ({ ok: false });
  await app.testAndFetchModels();
  assert.equal(app.newProviderTemp.connectionStatus, 'failed');
  assert.deepEqual(plain(app.newProviderTemp.models), current);

  const html = fs.readFileSync(path.join(root, 'static/index.html'), 'utf8');
  assert.ok(html.includes('v-for="model in getProviderModelChoices(provider)"'));
  for (const config of ['settings', 'fastSettings', 'reasonerSettings']) {
    assert.ok(html.includes(`v-for="effort in getReasoningEfforts(${config})"`));
  }
  const paramsContext = vm.createContext({ window: {} });
  vm.runInContext(fs.readFileSync(path.join(root, 'static/js/vendor_params.js'), 'utf8'), paramsContext);
  const suggested = paramsContext.window.vendorSuggestedParams.minimax;
  assert.equal(suggested[0].name, 'reasoning_effort');
  assert.equal(suggested[0].default, 'max');
  console.log(process.argv.includes('--fixtures') ? JSON.stringify(fixtures) : 'MiniMax model selection checks passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
