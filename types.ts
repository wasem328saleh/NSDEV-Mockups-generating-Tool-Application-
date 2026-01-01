
export type Category = 'pizza' | 'burger' | 'shawarma' | 'chicken' | 'desserts';

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

export interface AppSettings {
  apiKey: string;
  autoSave: boolean;
  autoGenerate: boolean;
  delayBetweenGenerations: number;
  imageQuality: '1K' | '2K' | '4K';
  theme: 'light' | 'dark';
}

export interface AppState {
  settings: AppSettings;
  prompts: DesignPrompt[];
  currentIndex: number;
  isGenerating: boolean;
  activeLogo: string | null; // Base64 string
  logoLibrary: string[];
  logoEffects: LogoEffects;
}
