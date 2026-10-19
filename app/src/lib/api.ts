import Constants from 'expo-constants';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import type { Answers, Draft, Identification } from './types';

type Extra = { apiUrl?: string; apiToken?: string };

const extra = (Constants.expoConfig?.extra ?? {}) as Extra;
const API_URL = (process.env.EXPO_PUBLIC_API_URL || extra.apiUrl || '').replace(/\/$/, '');
const API_TOKEN = process.env.EXPO_PUBLIC_API_TOKEN || extra.apiToken || '';

/** Photos sent to the AI service; more rarely helps identification and slows the upload. */
const MAX_AI_PHOTOS = 4;

export const aiEnabled = API_URL !== '';

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(API_TOKEN ? { Authorization: `Bearer ${API_TOKEN}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Listing assistant error ${res.status}: ${text.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

async function toJpegBase64(uri: string): Promise<string> {
  const ref = await ImageManipulator.manipulate(uri).resize({ width: 1024 }).renderAsync();
  const out = await ref.saveAsync({ base64: true, compress: 0.7, format: SaveFormat.JPEG });
  if (!out.base64) throw new Error('Could not read photo');
  return out.base64;
}

export async function identifyItem(photos: string[]): Promise<Identification> {
  const images = await Promise.all(photos.slice(0, MAX_AI_PHOTOS).map(toJpegBase64));
  return post<Identification>('/identify', { images });
}

export async function composeListing(answers: Answers, identification?: Identification): Promise<Draft> {
  return post<Draft>('/compose', { answers, identification });
}
