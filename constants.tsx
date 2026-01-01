
import { Category, LogoEffects, AppSettings } from './types';

export const CATEGORY_COLORS: Record<Category, string> = {
  pizza: '#e74c3c',
  burger: '#d35400',
  shawarma: '#f39c12',
  chicken: '#27ae60',
  desserts: '#9b59b6',
};

export const CATEGORY_NAMES: Record<Category, string> = {
  pizza: 'بيتزا',
  burger: 'برجر',
  shawarma: 'شاورما',
  chicken: 'دجاج',
  desserts: 'حلويات',
};

export const DEFAULT_LOGO_EFFECTS: LogoEffects = {
  size: 20,
  opacity: 100,
  rotation: 0,
  position: 'bottom-right',
  shadow: {
    enabled: false,
    color: '#000000',
    blur: 5,
    offset: { x: 2, y: 2 },
  },
  border: {
    enabled: false,
    color: '#ffffff',
    width: 2,
    radius: 4,
  },
  glow: {
    enabled: false,
    color: '#ffffff',
    strength: 10,
  },
};

export const DEFAULT_SETTINGS: AppSettings = {
  apiKey: '',
  model: 'gemini-2.5-flash-image',
  aspectRatio: '1:1',
  seed: null,
  autoSave: true,
  autoGenerate: false,
  delayBetweenGenerations: 3000,
  imageQuality: '1K',
  theme: 'light',
  pauseOnError: true,
};

export const generateInitialPrompts = () => {
  const categories: Category[] = ['pizza', 'burger', 'shawarma', 'chicken', 'desserts'];
  const counts = { pizza: 30, burger: 23, shawarma: 24, chicken: 23, desserts: 28 };
  const prompts: any[] = [];

  categories.forEach(cat => {
    for (let i = 1; i <= (counts[cat] || 25); i++) {
      prompts.push({
        id: `${cat}-${i.toString().padStart(3, '0')}`,
        category: cat,
        name: `تصميم ${CATEGORY_NAMES[cat]} رقم ${i}`,
        prompt: `High-quality, professional food mockup of a ${cat} dish, studio lighting, commercial photography style, clean background, photorealistic 8k.`,
        logoPrompt: `Place for a restaurant brand logo on the packaging.`,
        description: `تصميم احترافي لقسم ${CATEGORY_NAMES[cat]}`,
        status: 'pending',
        metadata: {
          dimensions: '1024x1024',
          style: 'professional',
          estimatedTime: 45,
          priority: 'medium'
        }
      });
    }
  });
  return prompts;
};
