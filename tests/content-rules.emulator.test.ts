import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, Timestamp, updateDoc } from 'firebase/firestore';
import { getBytes, ref, uploadBytes } from 'firebase/storage';
import { defaultContent, siteContentLists } from '../src/lib/siteContent';

const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_STORAGE_EMULATOR_HOST);
const rulesTest = (name: string, fn: () => Promise<void>) => test(name, { skip: !enabled }, fn);
let environment: RulesTestEnvironment;
const verified = { email: 'tuan303@gmail.com', email_verified: true };
const fullContent = () => ({ ...defaultContent, ...Object.fromEntries(siteContentLists.map(field => [field, defaultContent[field].split('\n')])) });
const job = (uid: string) => ({ title: 'Vị trí thử nghiệm', description: '<p>Mô tả</p>', requirements: '<p>Yêu cầu</p>', deadline: '31/12/2026', authorUid: uid, createdAt: Timestamp.fromMillis(1000), jdUrl: null });

before(async () => {
  if (!enabled) return;
  environment = await initializeTestEnvironment({
    projectId: 'demo-tuyendung-security',
    firestore: { rules: await readFile(new URL('../firestore.rules', import.meta.url), 'utf8') },
    storage: { rules: await readFile(new URL('../storage.rules', import.meta.url), 'utf8') },
  });
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'jobs', 'fixture-public'), job('owner'));
    await setDoc(doc(db, 'siteContent', 'main'), fullContent());
    for (const path of ['applications/fixture', 'settings/smtp', 'settings_private/smtp']) await setDoc(doc(db, path), { fixture: true });
    await uploadBytes(ref(context.storage(), 'cv/fixture.pdf'), new Uint8Array([37, 80, 68, 70]), { contentType: 'application/pdf' });
  });
});
after(async () => { if (environment) await environment.cleanup(); });

rulesTest('rules keep public jobs and page content readable', async () => {
  const db = environment.unauthenticatedContext().firestore();
  assert.equal((await assertSucceeds(getDoc(doc(db, 'jobs', 'fixture-public')))).exists(), true);
  assert.equal((await assertSucceeds(getDoc(doc(db, 'siteContent', 'main')))).exists(), true);
});

rulesTest('anonymous, ordinary and unverified allowlisted users cannot edit jobs', async () => {
  for (const context of [environment.unauthenticatedContext(), environment.authenticatedContext('ordinary', { email: 'other@example.test', email_verified: true }), environment.authenticatedContext('unverified', { email: verified.email, email_verified: false })]) {
    await assertFails(setDoc(doc(context.firestore(), 'jobs', `denied-${context === undefined}`), job('unverified')));
  }
});

rulesTest('verified allowlisted users and trusted admin claims can create jobs', async () => {
  await assertSucceeds(setDoc(doc(environment.authenticatedContext('verified', verified).firestore(), 'jobs', 'verified'), job('verified')));
  await assertSucceeds(setDoc(doc(environment.authenticatedContext('claimed', { admin: true }).firestore(), 'jobs', 'claimed'), { ...job('claimed'), jdUrl: 'https://example.test/jd.pdf' }));
});

rulesTest('admins cannot forge job ownership or change immutable audit fields', async () => {
  const db = environment.authenticatedContext('verified', verified).firestore();
  await assertFails(setDoc(doc(db, 'jobs', 'forged'), job('someone-else')));
  await assertFails(updateDoc(doc(db, 'jobs', 'fixture-public'), { authorUid: 'verified' }));
  await assertFails(updateDoc(doc(db, 'jobs', 'fixture-public'), { createdAt: Timestamp.fromMillis(2000) }));
  await assertFails(updateDoc(doc(db, 'jobs', 'fixture-public'), { jdUrl: 'javascript:alert(1)' }));
});

rulesTest('all actual site settings including twenty-item lists can be saved', async () => {
  await assertSucceeds(setDoc(doc(environment.authenticatedContext('verified', verified).firestore(), 'siteContent', 'main'), fullContent()));
  const settings: Record<string, unknown> = fullContent();
  for (const field of siteContentLists) settings[field] = Array(20).fill(field === 'policy5Benefits' ? 'Phúc lợi' : 'https://example.test/image.png');
  settings.trainingImages = ['https://example.test/' + 'x'.repeat(2000 - 'https://example.test/'.length), ...Array(19).fill('https://example.test/image.png')];
  settings.policy5Benefits = ['x'.repeat(1000), ...Array(19).fill('Phúc lợi')];
  settings.policy1Desc = 'x'.repeat(10000);
  await assertSucceeds(setDoc(doc(environment.authenticatedContext('verified', verified).firestore(), 'siteContent', 'main'), settings));
});

rulesTest('empty image and benefit lists remain valid', async () => {
  await assertSucceeds(setDoc(doc(environment.authenticatedContext('verified', verified).firestore(), 'siteContent', 'main'), { ...fullContent(), ...Object.fromEntries(siteContentLists.map(field => [field, []])) }));
});

rulesTest('site settings rules reject invalid colors, ranges, list types and section order', async () => {
  const db = environment.authenticatedContext('verified', verified).firestore();
  for (const changes of [{ primaryColor: 'red' }, { heroOverlayOpacity: 2 }, { trainingImages: ['javascript:alert(1)'] }, { policy5Benefits: [1] }, { trainingImages: ['https://example.test/' + 'x'.repeat(2001)] }, { policy5Benefits: ['x'.repeat(1001)] }, { policy5Benefits: ['a\nb'] }, { sectionOrder: ['hero', 'hero', 'jobs', 'policies', 'form'] }, { unknownField: 'no' }, { policy1Desc: 'x'.repeat(10001) }, { heroTitle: 42 }, { showForm: 'false' }]) {
    await assertFails(setDoc(doc(db, 'siteContent', 'main'), { ...fullContent(), ...changes }));
  }
});

rulesTest('application records and SMTP settings are server-only for every browser client', async () => {
  for (const context of [environment.unauthenticatedContext(), environment.authenticatedContext('verified', verified), environment.authenticatedContext('claimed', { admin: true })]) {
    for (const path of ['applications/fixture', 'settings/smtp', 'settings_private/smtp']) {
      await assertFails(getDoc(doc(context.firestore(), path)));
      await assertFails(setDoc(doc(context.firestore(), path), { fixture: true }));
    }
  }
});

rulesTest('CV storage refuses direct browser reads and uploads even to admins', async () => {
  for (const context of [environment.unauthenticatedContext(), environment.authenticatedContext('verified', verified), environment.authenticatedContext('claimed', { admin: true })]) {
    await assertFails(getBytes(ref(context.storage(), 'cv/fixture.pdf')));
    await assertFails(uploadBytes(ref(context.storage(), 'cv/new.pdf'), new Uint8Array([37, 80, 68, 70])));
  }
});
