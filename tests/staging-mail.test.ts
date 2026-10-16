import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertStagingMailRecipient, getSmtpSettings, testSmtp, notifyApplication } from '../src/server/smtp';
import type { ApplicationRecord } from '../src/server/applicationsStore';

test('preview and explicit staging pin a single test inbox while production keeps existing routing', () => {
  assert.doesNotThrow(() => assertStagingMailRecipient('hr@example.invalid', { VERCEL_ENV: 'production' }));
  for (const environment of [{ VERCEL_ENV: 'preview' }, { APP_ENV: 'staging' }]) {
    for (const value of [undefined, '', 'invalid', 'one@example.invalid,two@example.invalid', 'test@example.invalid\r\nBcc:other@example.invalid']) {
      assert.throws(() => assertStagingMailRecipient('hr@example.invalid', { ...environment, SMTP_TEST_RECIPIENT: value }), { status: 503 });
    }
    assert.throws(() => assertStagingMailRecipient('hr@example.invalid', { ...environment, SMTP_TEST_RECIPIENT: 'test@example.invalid' }), { status: 400 });
    assert.doesNotThrow(() => assertStagingMailRecipient('Test@example.invalid', { ...environment, SMTP_TEST_RECIPIENT: 'test@example.invalid' }));
  }
});

test('SMTP tests and application notifications reject unsafe preview routing before DNS or delivery', async () => {
  const keys = ['VERCEL_ENV', 'APP_ENV', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_RECIPIENT', 'SMTP_TEST_RECIPIENT'];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  try {
    process.env.VERCEL_ENV = 'preview'; delete process.env.APP_ENV;
    process.env.SMTP_HOST = 'smtp-does-not-exist.example.invalid'; process.env.SMTP_PORT = '465';
    process.env.SMTP_USER = 'sender@example.invalid'; process.env.SMTP_PASSWORD = 'SYNTHETIC_ONLY';
    process.env.SMTP_RECIPIENT = 'hr@example.invalid'; delete process.env.SMTP_TEST_RECIPIENT;
    await assert.rejects(testSmtp(), { status: 503 });
    await assert.rejects(notifyApplication({} as ApplicationRecord), { status: 503 });
    process.env.SMTP_TEST_RECIPIENT = 'test@example.invalid';
    await assert.rejects(testSmtp(), { status: 400 });
    await assert.rejects(notifyApplication({} as ApplicationRecord), { status: 400 });
    process.env.SMTP_RECIPIENT = 'test@example.invalid';
    const settings = await getSmtpSettings();
    assert.equal(settings?.recipient, 'test@example.invalid');
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key];
    }
  }
});
