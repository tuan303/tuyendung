import fs from 'fs/promises';
import path from 'path';

export interface ApplicationRecord {
  id: string;
  jobId?: string;
  jobTitle: string;
  name: string;
  dob?: string;
  phone: string;
  email: string;
  cvUrl?: string;
  downloadURL?: string;
  fileName?: string;
  status: string; // 'new' | 'reviewed' | 'contacted' | 'passed' | 'rejected'
  notes?: string;
  createdAt: string; // ISO date string
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'applications.json');

export async function getApplications(): Promise<ApplicationRecord[]> {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const content = await fs.readFile(DATA_FILE, 'utf-8');
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return [];
    }
    console.error("Error reading applications.json:", error);
    return [];
  }
}

export async function saveApplications(apps: ApplicationRecord[]): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(apps, null, 2), 'utf-8');
}

export async function addApplication(data: Partial<ApplicationRecord>): Promise<ApplicationRecord> {
  const apps = await getApplications();
  const newApp: ApplicationRecord = {
    id: data.id || `app_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    jobId: data.jobId || '',
    jobTitle: data.jobTitle || 'Vị trí tuyển dụng',
    name: data.name || 'Ứng viên',
    dob: data.dob || '',
    phone: data.phone || '',
    email: data.email || '',
    cvUrl: data.cvUrl || data.downloadURL || '',
    downloadURL: data.downloadURL || data.cvUrl || '',
    fileName: data.fileName || '',
    status: data.status || 'new',
    notes: data.notes || '',
    createdAt: data.createdAt || new Date().toISOString()
  };

  apps.unshift(newApp);
  await saveApplications(apps);
  return newApp;
}

export async function updateApplication(id: string, updates: Partial<ApplicationRecord>): Promise<ApplicationRecord | null> {
  const apps = await getApplications();
  const index = apps.findIndex(a => a.id === id);
  if (index === -1) return null;

  apps[index] = {
    ...apps[index],
    ...updates,
    id: apps[index].id // keep immutable ID
  };

  await saveApplications(apps);
  return apps[index];
}

export async function deleteApplication(id: string): Promise<boolean> {
  const apps = await getApplications();
  const filtered = apps.filter(a => a.id !== id);
  if (filtered.length === apps.length) return false;

  await saveApplications(filtered);
  return true;
}
