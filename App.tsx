
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Play, Pause, FastForward, Trash2, Settings, Image as ImageIcon, 
  CheckCircle2, AlertCircle, Loader2, Download, Filter, Layers, 
  LayoutGrid, Edit2, RotateCcw, FileJson, Key, Sliders, ExternalLink, Type, PlusCircle, Upload, Trash, Palette, DownloadCloud, Check, FlaskConical, Sparkles, Wand2, Info, Clock
} from 'lucide-react';
import { 
  DesignPrompt, 
  Category, 
  CategoryInfo,
  AppState, 
  LogoEffects,
  AspectRatio,
  ImageModel,
  TemplateComponent
} from './types';
import { 
  INITIAL_CATEGORIES,
  DEFAULT_LOGO_EFFECTS, 
  DEFAULT_SETTINGS, 
  generateInitialPrompts,
  DEFAULT_TEMPLATE
} from './constants';
import { storageService } from './services/storageService';
import { geminiService } from './services/geminiService';
import { imageProcessor } from './services/imageProcessor';
import { downloadService } from './services/downloadService';

const NavItem: React.FC<{ 
  label: string; 
  active: boolean; 
  onClick: () => void; 
  color: string;
  count: number;
}> = ({ label, active, onClick, color, count }) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all duration-300 ${
      active ? 'bg-white shadow-lg text-slate-900 scale-105 border-b-2' : 'text-slate-500 hover:bg-white/50'
    }`}
    style={active ? { borderColor: color } : {}}
  >
    <span className="w-2.5 h-2.5 rounded-full shadow-sm" style={{ backgroundColor: color }}></span>
    <span className="font-bold text-sm">{label}</span>
    <span className="text-[10px] bg-slate-200/50 px-2 py-0.5 rounded-full font-mono">{count}</span>
  </button>
);

const App: React.FC = () => {
  const [state, setState] = useState<AppState>(() => {
    const savedSettings = storageService.getSettings() || DEFAULT_SETTINGS;
    const savedLogos = storageService.getLogoLibrary();
    const savedCategories = storageService.getCategories() || INITIAL_CATEGORIES;
    return {
      settings: savedSettings,
      categories: savedCategories,
      prompts: generateInitialPrompts(savedCategories),
      template: DEFAULT_TEMPLATE,
      currentIndex: 0,
      isGenerating: false,
      activeLogo: savedLogos[0] || null,
      logoLibrary: savedLogos,
      logoEffects: DEFAULT_LOGO_EFFECTS,
    };
  });

  const [filter, setFilter] = useState<Category | 'all'>('all');
  const [showSettings, setShowSettings] = useState(false);
  const [activeTab, setActiveTab] = useState<'prompts' | 'gallery' | 'control' | 'lab'>('prompts');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [editingPrompt, setEditingPrompt] = useState<DesignPrompt | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  
  const [labSelection, setLabSelection] = useState({
    subject: '',
    environment: '',
    lighting: '',
    style: '',
    logoPrompt: 'Integrate the logo naturally onto the primary packaging surface.',
    category: 'pizza'
  });

  const [showAddModal, setShowAddModal] = useState(false);
  const [newPromptData, setNewPromptData] = useState<Partial<DesignPrompt>>({
    category: state.categories[0]?.id || '',
    name: '',
    prompt: '',
    logoPrompt: '',
    description: ''
  });
  const [bulkImportMode, setBulkImportMode] = useState<'append' | 'overwrite'>('append');
  const [categoryLogoUpdate, setCategoryLogoUpdate] = useState<{cat: Category, prompt: string}>({ cat: state.categories[0]?.id || '', prompt: '' });
  
  const [showSectionModal, setShowSectionModal] = useState(false);
  const [newSection, setNewSection] = useState({ name: '', color: '#3b82f6' });
  const [editingSection, setEditingSection] = useState<CategoryInfo | null>(null);

  useEffect(() => {
    storageService.saveSettings(state.settings);
    storageService.saveLogoLibrary(state.logoLibrary);
    storageService.saveCategories(state.categories);
  }, [state.settings, state.logoLibrary, state.categories]);

  const filteredPrompts = useMemo(() => 
    state.prompts.filter(p => filter === 'all' || p.category === filter),
  [state.prompts, filter]);

  const stats = {
    total: state.prompts.length,
    completed: state.prompts.filter(p => p.status === 'completed').length,
    pending: state.prompts.filter(p => p.status === 'pending').length,
    failed: state.prompts.filter(p => p.status === 'failed').length,
    selected: state.prompts.filter(p => p.selected).length,
  };

  const toggleSelectPrompt = (id: string) => {
    setState(prev => ({
      ...prev,
      prompts: prev.prompts.map(p => p.id === id ? { ...p, selected: !p.selected } : p)
    }));
  };

  const toggleSelectAll = () => {
    const allVisibleSelected = filteredPrompts.length > 0 && filteredPrompts.every(p => p.selected);
    setState(prev => ({
      ...prev,
      prompts: prev.prompts.map(p => {
        if (filter === 'all' || p.category === filter) {
          return { ...p, selected: !allVisibleSelected };
        }
        return p;
      })
    }));
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const base64 = ev.target?.result as string;
        setState(prev => ({
          ...prev,
          activeLogo: base64,
          logoLibrary: [base64, ...prev.logoLibrary].slice(0, 50)
        }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleApiKeySelect = async () => {
    try {
      // @ts-ignore
      if (window.aistudio) {
        await window.aistudio.openSelectKey();
        setShowSettings(false);
        setErrorMsg(null);
      }
    } catch (e) {
      setErrorMsg("فشل في اختيار مفتاح API");
    }
  };

  const generateSingle = async (index: number) => {
    if (index < 0 || index >= state.prompts.length) return;
    
    const currentApiKey = state.settings.apiKey || (process.env.API_KEY as string);
    const promptToProcess = state.prompts[index];
    if (!promptToProcess) return;

    if (!currentApiKey && state.settings.model === 'gemini-3-pro-image-preview') {
      // @ts-ignore
      const hasKey = window.aistudio ? await window.aistudio.hasSelectedApiKey() : false;
      if (!hasKey) {
        setErrorMsg("يجب اختيار مفتاح API لموديل Pro أولاً لتتمكن من توليد الصور.");
        setShowSettings(true);
        setState(prev => ({ ...prev, isGenerating: false }));
        return;
      }
    }
    
    setState(prev => ({
      ...prev,
      prompts: prev.prompts.map((p, i) => i === index ? { ...p, status: 'generating' } : p)
    }));

    try {
      const finalPrompt = `${promptToProcess.prompt}. ${promptToProcess.logoPrompt || ''}`.trim();
      const baseImage = await geminiService.generateMockup(
        finalPrompt, 
        currentApiKey, 
        state.settings.imageQuality,
        state.settings.model, 
        state.settings.aspectRatio, 
        state.settings.seed
      );

      let finalImage = baseImage;
      if (state.activeLogo) {
        finalImage = await imageProcessor.applyLogo(baseImage, state.activeLogo, state.logoEffects);
      }

      await storageService.saveImage(promptToProcess.id, finalImage);

      setState(prev => ({
        ...prev,
        prompts: prev.prompts.map((p, i) => i === index ? { 
          ...p, status: 'completed', resultImageUrl: finalImage 
        } : p)
      }));
    } catch (err: any) {
      console.error(err);
      
      let displayError = err.message;
      if (err.message === "KEY_RESET_REQUIRED") {
        setErrorMsg("انتهت صلاحية مفتاح API أو المشروع غير صالح. يرجى إعادة اختيار مفتاح نشط.");
        setShowSettings(true);
        setState(prev => ({ ...prev, isGenerating: false }));
      } else if (err.message === "QUOTA_EXHAUSTED") {
        displayError = "تم تجاوز حصة الاستخدام (Quota). يرجى المحاولة لاحقاً أو زيادة التأخير الزمني.";
        setErrorMsg("لقد تجاوزت الحصة المتاحة. تم إيقاف التوليد التلقائي لتجنب تكرار الخطأ.");
        setState(prev => ({ ...prev, isGenerating: false }));
      }

      setState(prev => ({
        ...prev,
        prompts: prev.prompts.map((p, i) => i === index ? { ...p, status: 'failed', error: displayError } : p)
      }));
    }
  };

  const generateFromLab = () => {
    const { subject, environment, lighting, style, logoPrompt, category } = labSelection;
    if (!subject || !environment) return alert("يرجى اختيار العنصر والبيئة على الأقل");

    const subjectText = state.template.subjects.find(s => s.id === subject)?.snippet;
    const envText = state.template.environments.find(e => e.id === environment)?.snippet;
    const lightText = state.template.lightings.find(l => l.id === lighting)?.snippet || '';
    const styleText = state.template.styles.find(s => s.id === style)?.snippet || '';

    const finalPromptText = `${subjectText}, ${envText}, ${lightText}, ${styleText}`.replace(/, ,/g, ',').trim();
    const catName = state.categories.find(c => c.id === category)?.name || 'غير معروف';

    const newPrompt: DesignPrompt = {
      id: `smart-${Date.now()}`,
      category: category,
      name: `نموذج ${catName} ذكي`,
      prompt: finalPromptText,
      logoPrompt: logoPrompt,
      description: `توليد آلي من المختبر الذكي`,
      status: 'pending',
      selected: false,
      metadata: { dimensions: '1024x1024', style: 'professional', estimatedTime: 45, priority: 'high' }
    };

    setState(prev => ({ ...prev, prompts: [newPrompt, ...prev.prompts] }));
    setActiveTab('prompts');
    alert("تمت إضافة النموذج الذكي بنجاح!");
  };

  const simulateCompletion = () => {
    const selected = state.prompts.filter(p => p.selected && p.status !== 'completed');
    if (selected.length === 0) return alert("يرجى اختيار عناصر غير مكتملة.");
    const placeholder = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";
    setState(prev => ({
      ...prev,
      prompts: prev.prompts.map(p => (p.selected && p.status !== 'completed') ? { ...p, status: 'completed', resultImageUrl: placeholder } : p)
    }));
  };

  const runAutomation = useCallback(async () => {
    if (!state.isGenerating) return;

    const promptsToSearch = state.prompts.filter(p => {
      const isPending = p.status === 'pending' || p.status === 'failed';
      const isTargeted = stats.selected === 0 || p.selected;
      return isPending && isTargeted;
    });

    if (promptsToSearch.length === 0) {
      setState(prev => ({ ...prev, isGenerating: false }));
      return;
    }

    const nextPrompt = promptsToSearch[0];
    const nextIndex = state.prompts.findIndex(p => p.id === nextPrompt.id);

    setState(prev => ({ ...prev, currentIndex: nextIndex }));
    await generateSingle(nextIndex);

    if (state.isGenerating) {
      setTimeout(() => {
        runAutomation();
      }, state.settings.delayBetweenGenerations);
    }
  }, [state.isGenerating, state.prompts, state.settings, stats.selected, generateSingle]);

  useEffect(() => {
    if (state.isGenerating) runAutomation();
  }, [state.isGenerating, runAutomation]);

  const toggleAuto = () => {
    if (!state.isGenerating && stats.pending === 0 && stats.failed === 0 && stats.selected === 0) {
      return alert("لا توجد مهام معلقة للبدء.");
    }
    setState(prev => ({ ...prev, isGenerating: !prev.isGenerating }));
  };

  const downloadAll = async () => {
    const targetPrompts = state.prompts.filter(p => p.selected && p.status === 'completed' && p.resultImageUrl);
    if (targetPrompts.length === 0) return alert("يرجى تحديد التصاميم المكتملة أولاً.");
    if (!confirm(`هل تريد تحميل ${targetPrompts.length} صورة تتابعياً؟`)) return;

    setIsDownloading(true);
    setDownloadProgress(0);

    for (let i = 0; i < targetPrompts.length; i++) {
      downloadService.downloadPromptImage(targetPrompts[i]);
      setDownloadProgress(Math.round(((i + 1) / targetPrompts.length) * 100));
      await new Promise(r => setTimeout(r, 700));
    }
    setIsDownloading(false);
  };

  const resetAll = (targetStatus: 'pending' | 'failed' | 'completed' | 'all') => {
    if (confirm(`إعادة تعيين الحالة المحددة؟`)) {
      setState(prev => ({
        ...prev,
        prompts: prev.prompts.map(p => 
          (targetStatus === 'all' || p.status === targetStatus) 
          ? { ...p, status: 'pending', resultImageUrl: undefined, error: undefined } 
          : p
        )
      }));
    }
  };

  const clearAllPrompts = () => {
    if (confirm("سيتم مسح جميع البيانات، هل أنت متأكد؟")) {
      setState(prev => ({ ...prev, prompts: [], currentIndex: 0, isGenerating: false }));
    }
  };

  const updatePrompt = (updated: DesignPrompt) => {
    setState(prev => ({
      ...prev,
      prompts: prev.prompts.map(p => p.id === updated.id ? updated : p)
    }));
    setEditingPrompt(null);
  };

  const removePrompt = (id: string) => {
    if (confirm("حذف هذا التصميم؟")) {
      setState(prev => ({ ...prev, prompts: prev.prompts.filter(p => p.id !== id) }));
    }
  };

  const addIndividualPrompt = () => {
    if (!newPromptData.prompt) return alert("البرومبت الرئيسي مطلوب");
    const prompt: DesignPrompt = {
      id: `custom-${Date.now()}`,
      category: newPromptData.category || (state.categories[0]?.id || 'pizza'),
      name: newPromptData.name || `تصميم جديد ${state.prompts.length + 1}`,
      prompt: newPromptData.prompt!,
      logoPrompt: newPromptData.logoPrompt || '',
      description: newPromptData.description || '',
      status: 'pending',
      selected: false,
      metadata: { dimensions: '1024x1024', style: 'professional', estimatedTime: 45, priority: 'medium' }
    };
    setState(prev => ({ ...prev, prompts: [prompt, ...prev.prompts] }));
    setShowAddModal(false);
    setNewPromptData({ category: state.categories[0]?.id || '', name: '', prompt: '', logoPrompt: '', description: '' });
  };

  const handleBulkImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (!Array.isArray(json)) throw new Error("JSON should be an array");
        const valid: DesignPrompt[] = json.map(item => ({
          id: String(item.id || `imported-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`),
          category: String(item.category || 'pizza'),
          name: String(item.name || 'تصميم مستورد'),
          prompt: String(item.prompt || ''),
          logoPrompt: String(item.logoPrompt || ''),
          description: String(item.description || ''),
          status: 'pending',
          selected: false,
          metadata: item.metadata || { dimensions: '1024x1024', style: 'professional', estimatedTime: 45, priority: 'medium' }
        }));
        setState(prev => ({
          ...prev,
          prompts: bulkImportMode === 'overwrite' ? valid : [...prev.prompts, ...valid]
        }));
        alert(`تم استيراد ${valid.length} عنصر.`);
      } catch (err) { alert("خطأ في قراءة ملف JSON."); }
    };
    reader.readAsText(file);
  };

  const applyCategoryLogoPrompt = () => {
    if (!categoryLogoUpdate.prompt) return alert("الرجاء إدخال البرومبت");
    if (confirm(`تحديث شعار جميع عناصر قسم ${categoryLogoUpdate.cat}؟`)) {
      setState(prev => ({
        ...prev,
        prompts: prev.prompts.map(p => p.category === categoryLogoUpdate.cat ? { ...p, logoPrompt: categoryLogoUpdate.prompt } : p)
      }));
    }
  };

  const handleAddSection = () => {
    if (!newSection.name) return;
    const id = newSection.name.toLowerCase().replace(/\s+/g, '-');
    const category: CategoryInfo = { id, name: newSection.name, color: newSection.color };
    setState(prev => ({ ...prev, categories: [...prev.categories, category] }));
    setNewSection({ name: '', color: '#3b82f6' });
  };

  const handleDeleteSection = (id: string) => {
    if (confirm("حذف القسم؟")) {
      setState(prev => ({
        ...prev,
        categories: prev.categories.filter(c => c.id !== id)
      }));
      if (filter === id) setFilter('all');
    }
  };

  const exportPrompts = () => {
    const data = JSON.stringify(state.prompts, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `NSDEV_Prompts_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#f8fafc] text-slate-900" dir="rtl">
      <header className="bg-slate-900 text-white p-4 shadow-2xl sticky top-0 z-[100] border-b border-slate-700/50">
        <div className="container mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="bg-gradient-to-br from-blue-500 to-indigo-600 p-2.5 rounded-2xl shadow-lg">
              <Layers className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight flex items-center gap-2">
                NSDEV <span className="text-blue-400 font-light">Mockups Tool</span>
              </h1>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Premium Branding Automation</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden lg:flex items-center gap-3 bg-slate-800/50 px-4 py-1.5 rounded-full border border-slate-700">
              <div className="flex flex-col items-center">
                <span className="text-[9px] text-slate-500 font-bold uppercase">DONE</span>
                <span className="text-xs font-black text-green-400">{stats.completed}</span>
              </div>
              <div className="w-px h-6 bg-slate-700"></div>
              <div className="flex flex-col items-center">
                <span className="text-[9px] text-slate-500 font-bold uppercase">QUEUE</span>
                <span className="text-xs font-black text-yellow-400">{stats.pending}</span>
              </div>
            </div>
            <button 
              onClick={() => setShowSettings(true)} 
              className="p-2.5 hover:bg-slate-800 rounded-2xl transition-colors border border-transparent hover:border-slate-700 shadow-sm"
            >
              <Settings className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 container mx-auto p-4 md:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        <aside className="lg:col-span-4 flex flex-col gap-6">
          <div className="bg-white p-6 rounded-[2rem] shadow-xl shadow-slate-200/50 border border-slate-200/60 relative overflow-hidden group">
            <h2 className="text-lg font-black mb-6 flex items-center gap-3 relative"><Play className="w-5 h-5 text-blue-600" /> لوحة التحكم</h2>
            
            <div className="grid grid-cols-2 gap-4 mb-6 relative">
              <button 
                onClick={(e) => { e.stopPropagation(); toggleAuto(); }} 
                className={`flex flex-col items-center justify-center gap-2 py-4 rounded-2xl font-black text-sm transition-all shadow-xl active:scale-95 ${state.isGenerating ? 'bg-orange-500 text-white' : 'bg-slate-900 text-white hover:bg-black'}`}
              >
                {state.isGenerating ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6" />}
                {state.isGenerating ? 'إيقاف' : 'بدء آلي'}
              </button>
              <button 
                onClick={(e) => { e.stopPropagation(); generateSingle(state.currentIndex); }} 
                disabled={state.isGenerating} 
                className="flex flex-col items-center justify-center gap-2 py-4 bg-blue-600 text-white rounded-2xl font-black text-sm transition-all shadow-xl hover:bg-blue-700 disabled:opacity-50 active:scale-95"
              >
                <FastForward className="w-6 h-6" />
                توليد فوري
              </button>
            </div>

            <div className="space-y-4 relative">
              <div className="flex justify-between text-[11px] font-black uppercase text-slate-500">
                <span>نسبة الإنجاز</span>
                <span className="text-blue-600 font-mono">{Math.round((stats.completed / (stats.total || 1)) * 100)}%</span>
              </div>
              <div className="h-4 bg-slate-100 rounded-full overflow-hidden border border-slate-200 shadow-inner p-0.5">
                <div 
                  className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full transition-all duration-700 shadow-sm" 
                  style={{ width: `${(stats.completed / (stats.total || 1)) * 100}%` }}
                ></div>
              </div>
            </div>

            <div className="mt-8 grid grid-cols-2 gap-3 relative">
              <button 
                onClick={(e) => { e.stopPropagation(); downloadAll(); }} 
                disabled={isDownloading}
                className="col-span-2 py-4 bg-slate-900 text-white font-black rounded-2xl flex items-center justify-center gap-3 hover:bg-black shadow-lg transition-transform active:scale-95 disabled:opacity-50"
              >
                {isDownloading ? <Loader2 className="w-5 h-5 animate-spin" /> : <DownloadCloud className="w-5 h-5" />} 
                {isDownloading ? `جاري التحميل (${downloadProgress}%)` : (stats.selected > 0 ? `تحميل المختار (${stats.selected})` : 'تحميل المكتمل')}
              </button>
              <button onClick={(e) => { e.stopPropagation(); resetAll('failed'); }} className="py-3 text-[11px] font-black border-2 border-slate-100 rounded-xl hover:bg-slate-50 transition-colors flex items-center justify-center gap-2 text-slate-600">
                <RotateCcw className="w-4 h-4" /> إعادة الفاشل
              </button>
              <button onClick={(e) => { e.stopPropagation(); exportPrompts(); }} className="py-3 text-[11px] font-black border-2 border-slate-100 rounded-xl hover:bg-slate-50 transition-colors flex items-center justify-center gap-2 text-slate-600">
                <FileJson className="w-4 h-4" /> تصدير البيانات
              </button>
            </div>
          </div>

          <div className="bg-white p-6 rounded-[2rem] shadow-xl shadow-slate-200/50 border border-slate-200/60">
            <h2 className="text-lg font-black mb-6 flex items-center gap-3"><ImageIcon className="w-5 h-5 text-purple-600" /> معالج الهوية</h2>
            <label className="block w-full cursor-pointer group">
              <div className="border-2 border-dashed border-slate-200 group-hover:border-purple-300 rounded-[1.5rem] p-8 text-center transition-all bg-slate-50/50 group-hover:bg-purple-50/30">
                <Upload className="w-6 h-6 text-purple-600 mx-auto mb-4" />
                <p className="text-sm font-black text-slate-700">رفع شعار بصيغة PNG</p>
              </div>
              <input type="file" className="hidden" accept="image/*" onChange={handleLogoUpload} />
            </label>

            {state.activeLogo && (
              <div className="mt-6 p-5 bg-slate-50 rounded-2xl border border-slate-100 space-y-6">
                <div className="flex items-center gap-4 bg-white p-3 rounded-xl border border-slate-100 shadow-sm">
                  <div className="w-16 h-16 bg-slate-100 rounded-lg p-2 flex items-center justify-center overflow-hidden">
                    <img src={state.activeLogo} className="max-w-full max-h-full object-contain" alt="Current Logo" />
                  </div>
                  <div className="text-xs font-black text-slate-800 uppercase tracking-tighter">الشعار النشط</div>
                </div>
                <div className="space-y-4">
                  <div className="flex justify-between items-center text-[10px] font-black uppercase text-slate-500 tracking-tighter">
                    <span>حجم الشعار الفعلي</span>
                    <span className="text-purple-600 bg-purple-100 px-2 py-0.5 rounded-full">{state.logoEffects.size}%</span>
                  </div>
                  <input type="range" min="5" max="45" value={state.logoEffects.size} onChange={(e) => setState(prev => ({ ...prev, logoEffects: { ...prev.logoEffects, size: parseInt(e.target.value) }}))} className="w-full accent-purple-600 appearance-none bg-slate-200 h-1.5 rounded-lg cursor-pointer" />
                  <div className="grid grid-cols-3 gap-2 p-2 bg-slate-200/50 rounded-xl">
                    {['top-left', 'top-center', 'top-right', 'middle-left', 'middle-center', 'middle-right', 'bottom-left', 'bottom-center', 'bottom-right'].map((pos: any) => (
                      <button 
                        key={pos} 
                        onClick={() => setState(prev => ({ ...prev, logoEffects: { ...prev.logoEffects, position: pos }}))} 
                        className={`h-8 rounded-lg transition-all ${state.logoEffects.position === pos ? 'bg-purple-600 shadow-lg' : 'bg-white hover:bg-slate-100'}`}
                        title={pos}
                      ></button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </aside>

        <section className="lg:col-span-8 flex flex-col gap-6">
          <div className="bg-slate-200/50 p-2 rounded-2xl flex gap-2 overflow-x-auto no-scrollbar scroll-smooth shadow-inner">
            <NavItem label="الكل" active={filter === 'all'} onClick={() => setFilter('all')} color="#64748b" count={state.prompts.length} />
            {state.categories.map((cat) => (
              <NavItem key={cat.id} label={cat.name} active={filter === cat.id} onClick={() => setFilter(cat.id)} color={cat.color} count={state.prompts.filter(p => p.category === cat.id).length} />
            ))}
          </div>

          <div className="bg-white rounded-[2.5rem] shadow-2xl shadow-slate-200/50 border border-slate-200/60 overflow-hidden flex flex-col min-h-[700px]">
            <div className="flex border-b border-slate-100 bg-slate-50/50 overflow-x-auto no-scrollbar">
              {[
                { id: 'prompts', label: 'النماذج الذكية', icon: Layers }, 
                { id: 'lab', label: 'المختبر الذكي', icon: Sparkles },
                { id: 'control', label: 'إدارة المحتوى', icon: Settings }, 
                { id: 'gallery', label: 'المعرض النهائي', icon: ImageIcon }
              ].map((tab) => (
                <button 
                  key={tab.id} 
                  onClick={() => setActiveTab(tab.id as any)} 
                  className={`flex-1 min-w-[120px] py-5 text-sm font-black flex items-center justify-center gap-3 transition-all ${activeTab === tab.id ? 'text-blue-600 bg-white border-b-2 border-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  <tab.icon className="w-4 h-4" />
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="p-6 flex-1 overflow-y-auto max-h-[1000px]">
              {activeTab === 'prompts' && (
                <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-2">
                  <div className="flex justify-between items-center bg-slate-50 p-4 rounded-3xl border border-slate-100">
                    <label className="flex items-center gap-3 cursor-pointer group">
                      <input 
                        type="checkbox" 
                        checked={filteredPrompts.length > 0 && filteredPrompts.every(p => p.selected)} 
                        onChange={toggleSelectAll} 
                        className="w-6 h-6 rounded-lg accent-blue-600 cursor-pointer shadow-sm" 
                      />
                      <span className="font-black text-sm text-slate-700">تحديد الكل في هذا القسم ({filteredPrompts.length})</span>
                    </label>
                    <button onClick={() => setShowAddModal(true)} className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-2xl text-xs font-black hover:bg-blue-700 shadow-xl transition-all active:scale-95">
                      <PlusCircle className="w-4 h-4" /> إضافة برومبت مخصص
                    </button>
                  </div>

                  {errorMsg && (
                    <div className="bg-red-50 border border-red-100 p-4 rounded-2xl flex items-center gap-4 text-red-600 animate-in slide-in-from-top-2">
                      <AlertCircle className="w-6 h-6 shrink-0" />
                      <div className="flex-1">
                        <p className="text-xs font-black">{errorMsg}</p>
                        {errorMsg.includes("Quota") && (
                          <p className="text-[10px] mt-1 font-bold">تلميح: جرب زيادة "التأخير الزمني" في الإعدادات.</p>
                        )}
                      </div>
                      <button onClick={() => setErrorMsg(null)} className="p-1 hover:bg-red-100 rounded-full transition-colors"><Trash2 className="w-4 h-4 rotate-45" /></button>
                    </div>
                  )}

                  <div className="grid grid-cols-1 gap-3">
                    {filteredPrompts.map((p) => {
                      const globalIdx = state.prompts.findIndex(item => item.id === p.id);
                      const cat = state.categories.find(c => c.id === p.category);
                      return (
                        <div key={p.id} className={`group p-4 rounded-3xl border transition-all flex items-center gap-5 ${p.selected ? 'bg-blue-50/40 border-blue-200 shadow-sm' : 'bg-white border-slate-100 hover:border-slate-200'}`}>
                          <input 
                            type="checkbox" 
                            checked={p.selected} 
                            onChange={(e) => { e.stopPropagation(); toggleSelectPrompt(p.id); }} 
                            className="w-6 h-6 rounded-lg accent-blue-600 cursor-pointer shrink-0" 
                          />
                          <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-white font-black text-sm shrink-0 shadow-md" style={{ backgroundColor: cat?.color || '#64748b' }}>
                            {globalIdx + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-black text-slate-800 text-sm truncate mb-1">{p.name}</h3>
                            <div className="flex items-center gap-2">
                              <span className={`text-[9px] px-2 py-0.5 rounded-full font-black uppercase tracking-wider ${p.status === 'completed' ? 'bg-green-100 text-green-700' : p.status === 'failed' ? 'bg-red-100 text-red-700' : p.status === 'generating' ? 'bg-blue-600 text-white animate-pulse' : 'bg-slate-100 text-slate-500'}`}>
                                {p.status}
                              </span>
                              <p className="text-[11px] text-slate-400 truncate italic font-medium">
                                {p.status === 'failed' ? <span className="text-red-500 font-bold">{p.error}</span> : p.prompt}
                              </p>
                            </div>
                          </div>
                          <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                             <button onClick={(e) => { e.stopPropagation(); setEditingPrompt(p); }} className="p-2.5 bg-slate-100 hover:bg-blue-50 rounded-xl text-slate-400 hover:text-blue-600 transition-colors"><Edit2 className="w-4 h-4" /></button>
                             <button onClick={(e) => { e.stopPropagation(); removePrompt(p.id); }} className="p-2.5 bg-slate-100 hover:bg-red-50 rounded-xl text-slate-400 hover:text-red-600 transition-colors"><Trash className="w-4 h-4" /></button>
                             <button onClick={(e) => { e.stopPropagation(); generateSingle(globalIdx); }} className="p-2.5 bg-slate-100 hover:bg-green-50 rounded-xl text-slate-400 hover:text-green-600 transition-colors"><Play className="w-4 h-4" /></button>
                             {p.status === 'completed' && (
                               <button onClick={(e) => { e.stopPropagation(); downloadService.downloadPromptImage(p); }} className="p-2.5 bg-slate-100 hover:bg-blue-50 rounded-xl text-slate-400 hover:text-blue-600 transition-colors"><Download className="w-4 h-4" /></button>
                             )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {activeTab === 'lab' && (
                <div className="flex flex-col gap-10 animate-in fade-in">
                  <div className="bg-gradient-to-br from-indigo-50 to-blue-50 p-8 rounded-[2.5rem] border border-blue-100 shadow-sm relative overflow-hidden">
                    <Sparkles className="absolute -top-6 -right-6 w-32 h-32 text-blue-200/50 rotate-12" />
                    <div className="relative">
                      <h3 className="text-2xl font-black text-slate-900 mb-2 flex items-center gap-3"><Wand2 className="w-6 h-6 text-blue-600" /> المختبر الذكي للبرومبتات</h3>
                      <p className="text-sm text-slate-600 font-medium mb-8">صمم برومبتات احترافية بمجرد دمج المكونات.</p>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-6">
                          <div>
                            <label className="text-[10px] font-black text-slate-500 block mb-3 uppercase tracking-widest">العنصر</label>
                            <div className="grid grid-cols-2 gap-2">
                              {state.template.subjects.map(s => (
                                <button key={s.id} onClick={() => setLabSelection({...labSelection, subject: s.id})} className={`px-4 py-3 rounded-2xl text-[11px] font-black border transition-all ${labSelection.subject === s.id ? 'bg-blue-600 text-white border-blue-600 shadow-lg scale-105' : 'bg-white text-slate-600 border-slate-200'}`}>{s.label}</button>
                              ))}
                            </div>
                          </div>
                          <div>
                            <label className="text-[10px] font-black text-slate-500 block mb-3 uppercase tracking-widest">البيئة</label>
                            <div className="grid grid-cols-2 gap-2">
                              {state.template.environments.map(e => (
                                <button key={e.id} onClick={() => setLabSelection({...labSelection, environment: e.id})} className={`px-4 py-3 rounded-2xl text-[11px] font-black border transition-all ${labSelection.environment === e.id ? 'bg-blue-600 text-white border-blue-600 shadow-lg scale-105' : 'bg-white text-slate-600 border-slate-200'}`}>{e.label}</button>
                              ))}
                            </div>
                          </div>
                        </div>

                        <div className="space-y-6">
                          <div>
                            <label className="text-[10px] font-black text-slate-500 block mb-3 uppercase tracking-widest text-blue-600">دمج الشعار</label>
                            <textarea value={labSelection.logoPrompt} onChange={(e) => setLabSelection({...labSelection, logoPrompt: e.target.value})} className="w-full px-5 py-4 border border-blue-200 rounded-[1.5rem] bg-white text-xs font-medium outline-none shadow-sm focus:ring-2 ring-blue-500/20" rows={3} />
                          </div>
                          <button onClick={generateFromLab} className="w-full px-12 py-5 bg-slate-900 text-white font-black rounded-2xl shadow-2xl hover:bg-black transition-all active:scale-95 flex items-center justify-center gap-3">
                            <Sparkles className="w-5 h-5 text-blue-400" /> توليد البرومبت الذكي
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'control' && (
                <div className="space-y-10 animate-in fade-in">
                  <div className="p-8 bg-slate-50 rounded-[2rem] border border-slate-100 shadow-sm">
                    <h4 className="font-black text-slate-800 flex items-center gap-3 mb-6"><Palette className="w-5 h-5 text-green-600" /> تنظيم الأقسام</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {state.categories.map(cat => (
                        <div key={cat.id} className="bg-white p-4 rounded-2xl border border-slate-200 flex items-center justify-between shadow-sm">
                          <div className="flex items-center gap-3">
                            <div className="w-4 h-4 rounded-full" style={{ backgroundColor: cat.color }}></div>
                            <span className="text-sm font-black text-slate-700">{cat.name}</span>
                          </div>
                          <button onClick={() => handleDeleteSection(cat.id)} className="p-2 hover:bg-red-50 rounded-lg text-slate-400 transition-colors"><Trash className="w-3.5 h-3.5" /></button>
                        </div>
                      ))}
                      <button onClick={() => setShowSectionModal(true)} className="p-4 rounded-2xl border-2 border-dashed border-slate-200 text-slate-400 hover:text-blue-600 hover:border-blue-300 transition-all font-black text-xs flex items-center justify-center gap-2">
                        <PlusCircle className="w-4 h-4" /> إضافة قسم
                      </button>
                    </div>
                  </div>

                  <div className="p-8 bg-slate-50 rounded-[2rem] border border-slate-100 shadow-sm">
                    <h4 className="font-black mb-4 flex items-center gap-3 text-red-600 uppercase"><Trash2 className="w-5 h-5" /> إدارة البيانات الكلية</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <button onClick={clearAllPrompts} className="py-4 bg-red-600 text-white font-black rounded-2xl text-xs shadow-xl hover:bg-red-700 transition-all">حذف جميع البرومبتات</button>
                      <button onClick={() => resetAll('all')} className="py-4 border-2 border-slate-200 bg-white text-slate-600 font-black rounded-2xl text-xs hover:bg-slate-50 transition-all">تصفير حالة الجميع</button>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'gallery' && (
                <div className="flex flex-col gap-8 animate-in fade-in">
                  <div className="flex justify-between items-center bg-slate-900 text-white p-6 rounded-[2rem] shadow-2xl">
                    <div>
                      <h3 className="font-black text-xl">معرض النتائج المكتملة</h3>
                      <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">يتم التحميل تتابعياً لتجنب الحظر</p>
                    </div>
                    <button 
                      onClick={downloadAll} 
                      disabled={isDownloading}
                      className="flex items-center gap-3 px-8 py-4 bg-blue-600 text-white rounded-2xl font-black text-sm hover:bg-blue-700 transition-all active:scale-95 disabled:opacity-50"
                    >
                      {isDownloading ? <Loader2 className="w-5 h-5 animate-spin" /> : <DownloadCloud className="w-5 h-5" />}
                      {isDownloading ? `جاري التحميل...` : `تحميل المختار (${stats.selected})`}
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
                    {state.prompts.filter(p => p.status === 'completed' && p.resultImageUrl).map(p => (
                        <div key={p.id} className={`relative group aspect-square rounded-[2rem] overflow-hidden shadow-xl transition-all duration-300 ${p.selected ? 'ring-4 ring-blue-500 scale-95' : 'border-4 border-white hover:scale-105'} bg-slate-100`}>
                          <img src={p.resultImageUrl} className="w-full h-full object-cover" loading="lazy" alt={p.name} />
                          <div className="absolute top-3 right-3 z-20">
                            <input 
                              type="checkbox" 
                              checked={p.selected} 
                              onChange={(e) => { e.stopPropagation(); toggleSelectPrompt(p.id); }} 
                              className="w-5 h-5 rounded-lg cursor-pointer accent-blue-600 shadow-xl" 
                            />
                          </div>
                          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-4">
                            <p className="text-[10px] text-white font-black truncate mb-2">{p.name}</p>
                            <button onClick={(e) => { e.stopPropagation(); downloadService.downloadPromptImage(p); }} className="w-full bg-white text-slate-900 text-[10px] font-black py-2 rounded-xl text-center">تحميل</button>
                          </div>
                        </div>
                      ))}
                  </div>
                  {stats.completed === 0 && (
                    <div className="text-center py-32 text-slate-400 font-black text-sm uppercase tracking-widest">المعرض فارغ حالياً</div>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-white border-t border-slate-200 p-4 text-[10px] flex justify-between items-center text-slate-500 font-bold uppercase tracking-widest shadow-inner">
        <div className="flex gap-8">
          <div className="flex items-center gap-2"><div className={`w-2 h-2 rounded-full ${state.isGenerating ? 'bg-green-500 animate-pulse' : 'bg-slate-300'}`}></div> Automation: {state.isGenerating ? 'Active' : 'Idle'}</div>
          <div className="flex items-center gap-2 font-mono">Delay: {state.settings.delayBetweenGenerations}ms</div>
        </div>
        <div>NSDEV <span className="text-blue-500">MOCKUPS</span> © 2024</div>
      </footer>

      {showSettings && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-6">
          <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden">
            <div className="p-8 bg-slate-900 text-white flex justify-between items-center">
              <h2 className="text-xl font-black flex items-center gap-3"><Settings className="w-6 h-6 text-blue-400" /> الإعدادات</h2>
              <button onClick={() => setShowSettings(false)} className="hover:bg-white/10 rounded-full p-2"><RotateCcw className="w-6 h-6 rotate-45" /></button>
            </div>
            <div className="p-8 space-y-8 max-h-[70vh] overflow-y-auto">
              {errorMsg && <div className="bg-red-50 text-red-600 p-5 rounded-3xl text-xs font-bold border border-red-100">{errorMsg}</div>}
              
              <div className="space-y-4">
                <label className="text-[10px] font-black text-slate-500 block uppercase tracking-widest flex items-center gap-2"><Clock className="w-3 h-3" /> التأخير بين عمليات التوليد (ms)</label>
                <div className="flex items-center gap-4">
                  <input 
                    type="range" min="1000" max="10000" step="500" 
                    value={state.settings.delayBetweenGenerations} 
                    onChange={(e) => setState(prev => ({ ...prev, settings: { ...prev.settings, delayBetweenGenerations: parseInt(e.target.value) }}))}
                    className="flex-1 accent-blue-600"
                  />
                  <span className="text-sm font-black font-mono w-16 text-center">{state.settings.delayBetweenGenerations}</span>
                </div>
                <p className="text-[9px] text-slate-400 font-bold">زيادة هذا الرقم يساعد في تجنب أخطاء Quota (429).</p>
              </div>

              <div className="p-6 bg-slate-50 rounded-[2rem] border border-slate-100 space-y-6">
                <span className="text-[10px] font-black text-slate-500 flex items-center gap-2 uppercase tracking-widest"><Key className="w-3 h-3" /> نموذج الذكاء الاصطناعي</span>
                <div className="flex bg-slate-200/50 p-1.5 rounded-2xl shadow-inner">
                   <button onClick={() => setState(prev => ({ ...prev, settings: { ...prev.settings, model: 'gemini-2.5-flash-image' }}))} className={`flex-1 py-3 text-[10px] font-black rounded-xl transition-all ${state.settings.model === 'gemini-2.5-flash-image' ? 'bg-white text-blue-600 shadow-md' : 'text-slate-500'}`}>FLASH</button>
                   <button onClick={() => setState(prev => ({ ...prev, settings: { ...prev.settings, model: 'gemini-3-pro-image-preview' }}))} className={`flex-1 py-3 text-[10px] font-black rounded-xl transition-all ${state.settings.model === 'gemini-3-pro-image-preview' ? 'bg-white text-purple-600 shadow-md' : 'text-slate-500'}`}>PRO</button>
                </div>
                {state.settings.model === 'gemini-3-pro-image-preview' ? <button onClick={handleApiKeySelect} className="w-full py-4 bg-purple-600 text-white rounded-2xl font-black text-xs shadow-xl active:scale-95">اختيار مفتاح المشروع</button> : <input type="password" value={state.settings.apiKey} onChange={(e) => setState(prev => ({ ...prev, settings: { ...prev.settings, apiKey: e.target.value } }))} className="w-full px-5 py-4 border border-slate-200 rounded-2xl outline-none text-xs bg-white shadow-inner" placeholder="API Key" />}
              </div>
              <button onClick={() => setShowSettings(false)} className="w-full py-5 bg-blue-600 text-white font-black rounded-2xl shadow-2xl active:scale-95 transition-all text-sm">حفظ</button>
            </div>
          </div>
        </div>
      )}

      {showSectionModal && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-6">
          <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl p-8">
            <h3 className="text-xl font-black mb-6 text-green-600">إضافة قسم جديد</h3>
            <div className="space-y-6">
              <input type="text" value={newSection.name} onChange={(e) => setNewSection({...newSection, name: e.target.value})} placeholder="اسم القسم..." className="w-full px-5 py-4 border border-slate-200 rounded-2xl bg-slate-50 font-black text-sm outline-none shadow-inner" />
              <input type="color" value={newSection.color} onChange={(e) => setNewSection({...newSection, color: e.target.value})} className="w-full h-14 border-4 border-white rounded-2xl shadow-sm cursor-pointer" />
              <div className="flex gap-4">
                <button onClick={() => { handleAddSection(); setShowSectionModal(false); }} className="flex-1 py-4 bg-green-600 text-white font-black rounded-2xl shadow-xl transition-all active:scale-95">إضافة</button>
                <button onClick={() => setShowSectionModal(false)} className="flex-1 py-4 bg-slate-100 rounded-2xl font-black text-slate-600">إلغاء</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-6">
          <div className="bg-white w-full max-w-xl rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95">
            <div className="p-8 bg-slate-900 text-white flex justify-between items-center">
              <h3 className="font-black text-xl">إضافة نموذج تصميم</h3>
              <button onClick={() => setShowAddModal(false)} className="hover:bg-white/10 rounded-full p-2"><Trash2 className="w-6 h-6 rotate-45" /></button>
            </div>
            <div className="p-8 space-y-6">
              <input type="text" value={newPromptData.name} onChange={(e) => setNewPromptData({...newPromptData, name: e.target.value})} placeholder="اسم التصميم" className="w-full px-5 py-3 border border-slate-200 rounded-2xl text-sm font-bold bg-slate-50 outline-none" />
              <textarea rows={3} value={newPromptData.prompt} onChange={(e) => setNewPromptData({...newPromptData, prompt: e.target.value})} placeholder="وصف المشهد" className="w-full px-5 py-3 border border-slate-200 rounded-2xl text-xs font-medium bg-slate-50 resize-none outline-none" />
              <textarea rows={2} value={newPromptData.logoPrompt} onChange={(e) => setNewPromptData({...newPromptData, logoPrompt: e.target.value})} placeholder="كيفية دمج الشعار" className="w-full px-5 py-3 border border-blue-100 rounded-2xl text-xs font-medium bg-blue-50/30 resize-none outline-none" />
              <button onClick={addIndividualPrompt} className="w-full py-5 bg-blue-600 text-white font-black rounded-2xl shadow-xl active:scale-95 transition-all text-sm mt-4">إدراج</button>
            </div>
          </div>
        </div>
      )}

      {editingPrompt && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-6">
          <div className="bg-white w-full max-w-xl rounded-[2.5rem] shadow-2xl overflow-hidden">
            <div className="p-8 bg-slate-900 text-white flex justify-between items-center">
              <h3 className="font-black text-xl">تعديل التصميم</h3>
              <button onClick={() => setEditingPrompt(null)} className="hover:bg-white/10 rounded-full p-2"><RotateCcw className="w-6 h-6 rotate-45" /></button>
            </div>
            <div className="p-8 space-y-6">
              <input type="text" value={editingPrompt.name} onChange={(e) => setEditingPrompt({...editingPrompt, name: e.target.value})} className="w-full px-5 py-3 border border-slate-200 rounded-2xl text-sm font-black bg-slate-50 outline-none" />
              <textarea rows={3} value={editingPrompt.prompt} onChange={(e) => setEditingPrompt({...editingPrompt, prompt: e.target.value})} className="w-full px-5 py-3 border border-slate-200 rounded-2xl text-xs font-medium bg-slate-50 resize-none outline-none" />
              <textarea rows={2} value={editingPrompt.logoPrompt} onChange={(e) => setEditingPrompt({...editingPrompt, logoPrompt: e.target.value})} placeholder="وصف دمج الشعار..." className="w-full px-5 py-3 border border-blue-100 rounded-2xl text-xs font-medium bg-blue-50/30 resize-none outline-none shadow-inner" />
              <div className="flex gap-4 mt-6">
                <button onClick={() => updatePrompt(editingPrompt!)} className="flex-1 py-4 bg-blue-600 text-white font-black rounded-2xl shadow-xl active:scale-95 transition-all">حفظ</button>
                <button onClick={() => setEditingPrompt(null)} className="flex-1 py-4 bg-slate-100 text-slate-600 font-black rounded-2xl hover:bg-slate-200 transition-all active:scale-95">إلغاء</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
