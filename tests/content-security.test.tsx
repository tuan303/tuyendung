import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://recruitment.example.test' });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
const { sanitizeRichHtml, safeExternalUrl } = await import('../src/lib/safeHtml');
const { default: RichTextEditor } = await import('../src/RichTextEditor');
const { defaultContent, normalizeSiteContent, validateSiteContent } = await import('../src/lib/siteContent');
after(() => dom.window.close());

test('rich job HTML preserves basic formatting and safe external links', () => {
  const clean = sanitizeRichHtml('<h2>Giáo viên</h2><p><strong>Yêu cầu</strong> <em>chuyên môn</em></p><ul><li>Tốt nghiệp</li></ul><a href="https://example.test/jd">JD</a>');
  assert.match(clean, /<h2>Giáo viên<\/h2>/);
  assert.match(clean, /<strong>Yêu cầu<\/strong>/);
  assert.match(clean, /<ul><li>Tốt nghiệp<\/li><\/ul>/);
  assert.match(clean, /target="_blank" rel="noopener noreferrer"/);
});

test('stored XSS removes scripts, event handlers, CSS and executable media', () => {
  const dirty = '<p style="background:url(javascript:alert(1))" onclick="alert(1)">Ứng tuyển</p><img src=x onerror=alert(1)><script>alert(1)</script><svg><a href="javascript:alert(1)">bad</a></svg><iframe srcdoc="<script>alert(1)</script>"></iframe><object data="data:text/html,bad"></object>';
  const clean = sanitizeRichHtml(dirty);
  assert.equal(clean, '<p>Ứng tuyển</p>');
});

test('obfuscated URL schemes and unsafe link attributes cannot survive sanitizing', () => {
  for (const href of ['javascript:alert(1)', 'jAvaScript:alert(1)', 'java&#x73;cript:alert(1)', 'java&#x0a;script:alert(1)', 'data:text/html,bad', '//example.test', 'file:///etc/passwd', 'https://user:password@example.test']) {
    const template = document.createElement('template');
    template.innerHTML = sanitizeRichHtml(`<a href="${href}" target="_self" onclick="alert(1)">X</a>`);
    const link = template.content.querySelector('a');
    assert.ok(link, href);
    assert.equal(link.getAttribute('href'), null, href);
    assert.equal(link.getAttribute('onclick'), null, href);
    assert.equal(link.getAttribute('target'), null, href);
  }
});

test('external URL policy rejects controls, credentials and non-web URLs', () => {
  for (const url of [null, {}, '/admin', '//evil.test', 'mailto:a@example.test', 'https://user@example.test', 'https://example.test/\npath', 'blob:https://example.test/file', 'javascript:alert(1)']) assert.equal(safeExternalUrl(url), undefined);
  assert.equal(safeExternalUrl(' https://example.test/a?q=1 '), 'https://example.test/a?q=1');
});

test('site content normalizes old array fields and rejects malformed controls and unknown keys', () => {
  const settings = normalizeSiteContent({ policy5Benefits: ['A', 'B'], trainingImages: ['javascript:alert(1)', 'https://example.test/a.png'], primaryColor: 'red', fontScale: Number.NaN, sectionOrder: ['hero', 'hero'], showHero: 'yes', heroTitle: 'Tuyển dụng mới', attack: 'unknown', logoUrl: 'data:image/svg+xml,bad' });
  assert.equal(settings.policy5Benefits, 'A\nB');
  assert.equal(settings.trainingImages, 'https://example.test/a.png');
  assert.equal(settings.primaryColor, defaultContent.primaryColor);
  assert.equal(settings.fontScale, defaultContent.fontScale);
  assert.deepEqual(settings.sectionOrder, defaultContent.sectionOrder);
  assert.equal(settings.showHero, defaultContent.showHero);
  assert.equal(settings.heroTitle, 'Tuyển dụng mới');
  assert.equal(settings.logoUrl, defaultContent.logoUrl);
  assert.equal('attack' in settings, false);
});

test('admin settings validation refuses invalid URLs, colors, ranges and oversized lists', () => {
  assert.doesNotThrow(() => validateSiteContent({ ...defaultContent }));
  for (const changes of [{ logoUrl: 'javascript:alert(1)' }, { trainingImages: 'https://example.test/a.png\ndata:text/html,bad' }, { primaryColor: 'red' }, { heroOverlayOpacity: 1.5 }, { policy5Benefits: Array(21).fill('x').join('\n') }]) {
    assert.throws(() => validateSiteContent({ ...defaultContent, ...changes }));
  }
});

test('editor removes hostile stored HTML before displaying it', async () => {
  const container = document.createElement('div'); document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(<RichTextEditor value={'<p onclick="alert(1)">Nội dung</p><script>alert(1)</script>'} onChange={() => {}} />));
  assert.equal(container.querySelector('[role="textbox"]').innerHTML, '<p>Nội dung</p>');
  assert.equal(container.querySelectorAll('button[type="button"]').length, 7);
  await act(async () => root.unmount()); container.remove();
});

test('editor sanitizes pasted HTML before inserting and saving it', async () => {
  const container = document.createElement('div'); document.body.append(container);
  const root = createRoot(container); let saved = ''; let command = '';
  await act(async () => root.render(<RichTextEditor value="" onChange={(html) => { saved = html; }} />));
  const editor = container.querySelector('[role="textbox"]');
  (document as unknown as { execCommand: (name: string, show: boolean, html: string) => boolean }).execCommand = (name, _show, html) => {
    command = name; editor.innerHTML = html; return true;
  };
  const paste = new dom.window.Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(paste, 'clipboardData', { value: { getData: (type: string) => type === 'text/html' ? '<p onmouseover="alert(1)"><strong>CV</strong><img src=x onerror=alert(1)></p>' : 'CV' } });
  await act(async () => { editor.dispatchEvent(paste); });
  assert.equal(paste.defaultPrevented, true);
  assert.equal(command, 'insertHTML');
  assert.equal(saved, '<p><strong>CV</strong></p>');
  assert.equal(editor.innerHTML, saved);
  await act(async () => root.unmount()); container.remove();
});
