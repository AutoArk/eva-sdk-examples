import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const podfile = readFileSync(new URL('../ios/Podfile', import.meta.url), 'utf8');
const appDelegate = readFileSync(
  new URL('../ios/Runner/AppDelegate.swift', import.meta.url),
  'utf8',
);

test('iOS uses Flutter plugin discovery without package-specific Pod wiring', () => {
  assert.match(podfile, /flutter_install_all_ios_pods/);
  assert.doesNotMatch(podfile, /pod\s+['"]autoark_eva_client_sdk['"]/);
  assert.doesNotMatch(podfile, /package_config|sdk_root|EXCLUDED_ARCHS/);
});

test('iOS registers plugins only through GeneratedPluginRegistrant', () => {
  assert.match(
    appDelegate,
    /GeneratedPluginRegistrant\.register\(with: engineBridge\.pluginRegistry\)/,
  );
  assert.doesNotMatch(appDelegate, /import autoark_eva_client_sdk/);
  assert.doesNotMatch(appDelegate, /AutoarkEvaClientSdkPlugin/);
});
