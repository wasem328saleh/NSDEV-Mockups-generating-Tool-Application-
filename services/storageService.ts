
const DB_NAME = 'NSDEV_MOCKUPS_DB';
const STORE_NAME = 'images';

export const storageService = {
  saveSettings: (settings: any) => {
    localStorage.setItem('nsdev_settings', JSON.stringify(settings));
  },

  getSettings: () => {
    const saved = localStorage.getItem('nsdev_settings');
    return saved ? JSON.parse(saved) : null;
  },

  saveLogoLibrary: (logos: string[]) => {
    localStorage.setItem('nsdev_logos', JSON.stringify(logos));
  },

  getLogoLibrary: (): string[] => {
    const saved = localStorage.getItem('nsdev_logos');
    return saved ? JSON.parse(saved) : [];
  },

  // Simple IndexedDB Wrapper for Images
  async initDB() {
    return new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  async saveImage(id: string, base64: string) {
    const db = await this.initDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(base64, id);
    return new Promise((resolve) => {
      tx.oncomplete = () => resolve(true);
    });
  },

  async getImage(id: string): Promise<string | null> {
    const db = await this.initDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).get(id);
    return new Promise((resolve) => {
      request.onsuccess = () => resolve(request.result || null);
    });
  },

  async clearAll() {
    const db = await this.initDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
    localStorage.removeItem('nsdev_settings');
    localStorage.removeItem('nsdev_logos');
  }
};
