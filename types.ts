
export interface CategoryInfo {
  id: string;
  name: string;
  color: string;
}

export type Category = string;

export interface PromptMetadata {
  dimensions: string;
  style: string;
  estimatedTime: number;
  priority: 'low' | 'medium' | 'high';
}

export interface DesignPrompt {
  id: string;
  category: Category;
  name: string;
  prompt: string;
  logoPrompt?: string;
  description: string;
  status: 'pending' | 'generating' | 'completed' | 'failed' | 'skipped';
  resultImageUrl?: string;
  error?: string;
  metadata: PromptMetadata;
}

export interface LogoEffects {
  size: number; // 5 to 40
  opacity: number; // 20 to 100
  rotation: number; // 0 to 360
  position: 'top-left' | 'top-center' | 'top-right' | 'middle-left' | 'middle-center' | 'middle-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';
  shadow: {
    enabled: boolean;
    color: string;
    blur: number;
    offset: { x: number; y: number };
  };
  border: {
    enabled: boolean;
    color: string;
    width: number;
    radius: number;
  };
  glow: {
    enabled: boolean;
    color: string;
    strength: number;
  };
}

export type ImageModel = 'gemini-2.5-flash-image' | 'gemini-3-pro-image-preview';
export type AspectRatio = '1:1' | '3:4' | '4:3' | '9:16' | '16:9';

export interface AppSettings {
  apiKey: string;
  model: ImageModel;
  aspectRatio: AspectRatio;
  seed: number | null;
  autoSave: boolean;
  autoGenerate: boolean;
  delayBetweenGenerations: number;
  imageQuality: '1K' | '2K' | '4K';
  theme: 'light' | 'dark';
  pauseOnError: boolean;
}

export interface AppState {
  settings: AppSettings;
  categories: CategoryInfo[];
  prompts: DesignPrompt[];
  currentIndex: number;
  isGenerating: boolean;
  activeLogo: string | null; // Base64 string
  logoLibrary: string[];
  logoEffects: LogoEffects;
}
