import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import type { Listing } from './types';

const STORAGE_KEY = 'snapandsell.listings.v1';

type Store = {
  ready: boolean;
  listings: Listing[];
  get: (id: string) => Listing | undefined;
  create: () => Listing;
  update: (id: string, patch: Partial<Listing>) => void;
  remove: (id: string) => void;
};

const StoreContext = createContext<Store | null>(null);

function newId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function photosDir(listingId: string): Directory {
  return new Directory(Paths.document, 'listings', listingId);
}

/** Copies a picker/camera photo out of the cache so it survives until the item is sold. */
export function keepPhoto(listingId: string, uri: string): string {
  const dir = photosDir(listingId);
  if (!dir.exists) dir.create({ intermediates: true });
  const dest = new File(dir, `${newId()}.jpg`);
  new File(uri).copySync(dest);
  return dest.uri;
}

export function deletePhoto(uri: string) {
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {
    // Already gone; nothing to clean up.
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [listings, setListings] = useState<Listing[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) setListings(JSON.parse(raw) as Listing[]);
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    if (ready) AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(listings)).catch(() => {});
  }, [listings, ready]);

  const get = useCallback((id: string) => listings.find((l) => l.id === id), [listings]);

  const create = useCallback(() => {
    const now = new Date().toISOString();
    const listing: Listing = { id: newId(), createdAt: now, updatedAt: now, photos: [], marketplaces: [], posts: {} };
    setListings((prev) => [listing, ...prev]);
    return listing;
  }, []);

  const update = useCallback((id: string, patch: Partial<Listing>) => {
    setListings((prev) =>
      prev.map((l) => (l.id === id ? { ...l, ...patch, updatedAt: new Date().toISOString() } : l)),
    );
  }, []);

  const remove = useCallback((id: string) => {
    try {
      const dir = photosDir(id);
      if (dir.exists) dir.delete();
    } catch {
      // Photos may already be gone.
    }
    setListings((prev) => prev.filter((l) => l.id !== id));
  }, []);

  const value = useMemo(() => ({ ready, listings, get, create, update, remove }), [ready, listings, get, create, update, remove]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider');
  return ctx;
}
