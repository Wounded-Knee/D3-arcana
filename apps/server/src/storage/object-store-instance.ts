import { loadObjectStoreConfig } from "./config.js";
import { InMemoryObjectStore } from "./memory-store.js";
import { S3CompatibleObjectStore } from "./s3-store.js";
import type { ObjectStore } from "./types.js";

let instance: ObjectStore | null = null;

function createObjectStore(): ObjectStore {
  return new S3CompatibleObjectStore(loadObjectStoreConfig());
}

export function getObjectStore(): ObjectStore {
  if (!instance) {
    instance = createObjectStore();
  }

  return instance;
}

export function resetObjectStoreForTests(): void {
  instance = null;
}

export function setObjectStoreForTests(store: ObjectStore): void {
  instance = store;
}

export function createTestObjectStore(): InMemoryObjectStore {
  const store = new InMemoryObjectStore();
  setObjectStoreForTests(store);
  return store;
}

export type { ObjectStore } from "./types.js";
