
import { CategoryInfo, LogoEffects, AppSettings, DesignPrompt, PromptTemplate } from './types';

export const INITIAL_CATEGORIES: CategoryInfo[] = [
  { id: 'pizza', name: 'بيتزا', color: '#e74c3c' },
  { id: 'burger', name: 'برجر', color: '#d35400' },
  { id: 'shawarma', name: 'شاورما', color: '#f39c12' },
  { id: 'chicken', name: 'دجاج', color: '#27ae60' },
  { id: 'desserts', name: 'حلويات', color: '#9b59b6' },
];

export const DEFAULT_TEMPLATE: PromptTemplate = {
  subjects: [
    { id: '1', label: 'صندوق بيتزا كرتوني', snippet: 'A professional cardboard pizza box packaging' },
    { id: '2', label: 'كوب قهوة ورقي', snippet: 'A premium disposable paper coffee cup' },
    { id: '3', label: 'كيس شاورما ورقي', snippet: 'A clean white paper shawarma wrap bag' },
    { id: '4', label: 'علبة برجر ورقية', snippet: 'An eco-friendly burger clamshell container' }
  ],
  environments: [
    { id: '1', label: 'طاولة خشبية ريفية', snippet: 'placed on a rustic textured oak wood table' },
    { id: '2', label: 'مطبخ عصري أبيض', snippet: 'sitting on a minimalist white marble kitchen counter' },
    { id: '3', label: 'إضاءة ستوديو داكنة', snippet: 'isolated on a dark slate background with dramatic contrast' },
    { id: '4', label: 'خلفية ملونة باستيل', snippet: 'on a solid pastel soft blue surface with soft shadows' }
  ],
  lightings: [
    { id: '1', label: 'إضاءة سينمائية', snippet: 'cinematic side lighting, long soft shadows' },
    { id: '2', label: 'ضوء النهار الطبيعي', snippet: 'natural bright sunlight coming from a window, fresh atmosphere' },
    { id: '3', label: 'إضاءة نيون', snippet: 'cyberpunk style neon blue and purple rim lighting' }
  ],
  styles: [
    { id: '1', label: 'تصوير تجاري', snippet: 'commercial food photography, high-end catalog style' },
    { id: '2', label: 'واقعية فائقة', snippet: 'hyper-realistic 8k, ultra-detailed texture, photorealistic' },
    { id: '3', label: 'حد أدنى', snippet: 'minimalist product shot, clean composition' }
  ]
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

export const generateInitialPrompts = (categories: CategoryInfo[]): DesignPrompt[] => {
  const prompts: DesignPrompt[] = [];
  const counts: Record<string, number> = { pizza: 30, burger: 23, shawarma: 24, chicken: 23, desserts: 28 };

  categories.forEach(cat => {
    const count = counts[cat.id] || 25;
    for (let i = 1; i <= count; i++) {
      prompts.push({
        id: `${cat.id}-${i.toString().padStart(3, '0')}`,
        category: cat.id,
        name: `تصميم ${cat.name} رقم ${i}`,
        prompt: `High-quality, professional food mockup of a ${cat.id} dish, studio lighting, commercial photography style, clean background, photorealistic 8k.`,
        logoPrompt: `Integrate a modern, minimalist restaurant logo onto the front of the packaging, ensuring it looks naturally embossed or printed.`,
        description: `تصميم احترافي لقسم ${cat.name}`,
        status: 'pending',
        selected: false,
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
