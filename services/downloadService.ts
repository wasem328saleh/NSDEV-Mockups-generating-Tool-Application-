
import { DesignPrompt } from '../types';

export const downloadService = {
  /**
   * Converts a base64 string to a Blob for safer downloading.
   */
  base64ToBlob: (base64: string): Blob | null => {
    try {
      const parts = base64.split(';base64,');
      if (parts.length < 2) return null;
      
      const contentType = parts[0].split(':')[1];
      const raw = window.atob(parts[1]);
      const rawLength = raw.length;
      const uInt8Array = new Uint8Array(rawLength);
      
      for (let i = 0; i < rawLength; ++i) {
        uInt8Array[i] = raw.charCodeAt(i);
      }
      
      return new Blob([uInt8Array], { type: contentType });
    } catch (e) {
      console.error("Blob conversion failed:", e);
      return null;
    }
  },

  /**
   * Professional download with structured naming: NSDEV-[ID]-[NAME].png
   */
  downloadPromptImage: (prompt: DesignPrompt) => {
    if (!prompt.resultImageUrl) return;

    const blob = downloadService.base64ToBlob(prompt.resultImageUrl);
    if (blob) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const safeName = prompt.name.replace(/[^a-z0-9\u0600-\u06FF]/gi, '_');
      a.href = url;
      a.download = `NSDEV-${prompt.id}-${safeName}.png`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 200);
    } else {
      const a = document.createElement('a');
      a.href = prompt.resultImageUrl;
      a.download = `NSDEV-${prompt.id}.png`;
      a.click();
    }
  }
};
