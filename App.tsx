
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Play, Pause, FastForward, Trash2, Settings, Image as ImageIcon, 
  CheckCircle2, AlertCircle, Loader2, Download, Filter, Layers, 
  LayoutGrid, Edit2, RotateCcw, FileJson, Key, Sliders, ExternalLink, Type, PlusCircle, Upload, Trash
} from 'lucide-react';
import { 
  DesignPrompt, 
  Category, 
  AppState, 
  LogoEffects,
  AspectRatio,
  ImageModel
} from './types';
import { 
  CATEGORY_COLORS, 
  CATEGORY_NAMES, 
  DEFAULT_LOGO_EFFECTS, 
  DEFAULT_SETTINGS, 
  generateInitialPrompts 
} from './constants';
import { storageService } from './services/storageService';
import { geminiService } from './services/geminiService';
import { imageProcessor } from './services/imageProcessor';

const NavItem: React.FC<{ 
  label: string; 
  active: boolean; 
  onClick: () => void; 
  color: string;
  count: number;
}> = ({ label, active, onClick, color, count }) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
      active ? 'bg-white shadow-md text-slate-900 border-b-2' : 'text-slate-600 hover:bg-slate-100'
    }`}
    style={active ? { borderColor: color } : {}}
  >
    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: color }}></span>
    <span className="font-bold">{label}</span>
    <span className="text-xs bg-slate-200 px-2 py-0.5 rounded-full">{count}</span>
  </button>
);

const App: React.FC = () => {
  const [state, setState] = useState<AppState>(() => {
    const savedSettings = storageService.getSettings() || DEFAULT_SETTINGS;
    const savedLogos = storageService.getLogoLibrary();
    return {
      settings: savedSettings,
      prompts: generateInitialPrompts(),
      currentIndex: 0,
      isGenerating: false,
      activeLogo: savedLogos[0] || null,
      logoLibrary: savedLogos,
      logoEffects: DEFAULT_LOGO_EFFECTS,
    };
  });

  const [filter, setFilter] = useState<Category | 'all'>('all');
  const [showSettings, setShowSettings] = useState(false);
  const [activeTab, setActiveTab] = useState<'prompts' | 'gallery' | 'control'>('prompts');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [editingPrompt, setEditingPrompt] = useState<DesignPrompt | null>(null);
  
  // New Management UI states
  const [showAddModal, setShowAddModal] = useState(false);
  const [newPromptData, setNewPromptData] = useState<Partial<DesignPrompt>>({
    category: 'pizza',
    name: '',
    prompt: '',
    logoPrompt: '',
    description: ''
  });
  const [bulkImportMode, setBulkImportMode] = useState<'append' | 'overwrite'>('append');
  const [categoryLogoUpdate, setCategoryLogoUpdate] = useState<{cat: Category, prompt: string}>({ cat: 'pizza', prompt: '' });

  // Sync state to storage
  useEffect(() => {
    storageService.saveSettings(state.settings);
    storageService.saveLogoLibrary(state.logoLibrary);
  }, [state.settings, state.logoLibrary]);

  const filteredPrompts = state.prompts.filter(p => filter === 'all' || p.category === filter);
  
  const stats = {
    total: state.prompts.length,
    completed: state.prompts.filter(p => p.status === 'completed').length,
    pending: state.prompts.filter(p => p.status === 'pending').length,
    failed: state.prompts.filter(p => p.status === 'failed').length,
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
      await window.aistudio.openSelectKey();
      setShowSettings(false);
    } catch (e) {
      setErrorMsg("فشل في اختيار مفتاح API");
    }
  };

  const generateSingle = async (index: number) => {
    const currentApiKey = state.settings.apiKey || (process.env.API_KEY as string);
    
    if (!currentApiKey && state.settings.model === 'gemini-3-pro-image-preview') {
      // @ts-ignore
      const hasKey = await window.aistudio.hasSelectedApiKey();
      if (!hasKey) {
        setErrorMsg("يجب اختيار مفتاح API لموديل Pro أولاً.");
        setShowSettings(true);
        return;
      }
    }

    const promptToProcess = state.prompts[index];
    
    setState(prev => ({
      ...prev,
      prompts: prev.prompts.map((p, i) => i === index ? { ...p, status: 'generating' } : p)
    }));

    try {
      const combinedPrompt = `${promptToProcess.prompt}. ${promptToProcess.logoPrompt || ''}`;

      const baseImage = await geminiService.generateMockup(
        combinedPrompt, 
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
          ...p, 
          status: 'completed', 
          resultImageUrl: finalImage 
        } : p)
      }));
    } catch (err: any) {
      if (err.message === "KEY_RESET_REQUIRED") {
        setErrorMsg("انتهت صلاحية مفتاح API أو المشروع غير صالح. يرجى إعادة الاختيار.");
        setShowSettings(true);
      }
      setState(prev => ({
        ...prev,
        isGenerating: state.settings.pauseOnError ? false : prev.isGenerating,
        prompts: prev.prompts.map((p, i) => i === index ? { 
          ...p, 
          status: 'failed', 
          error: err.message 
        } : p)
      }));
    }
  };

  const runAutomation = useCallback(async () => {
    if (!state.isGenerating) return;

    const nextIndex = state.prompts.findIndex((p, i) => i >= state.currentIndex && p.status === 'pending');
    
    if (nextIndex === -1) {
      setState(prev => ({ ...prev, isGenerating: false }));
      return;
    }

    setState(prev => ({ ...prev, currentIndex: nextIndex }));
    await generateSingle(nextIndex);

    if (state.isGenerating) {
      setTimeout(() => {
        runAutomation();
      }, state.settings.delayBetweenGenerations);
    }
  }, [state.isGenerating, state.currentIndex, state.prompts, state.settings]);

  useEffect(() => {
    if (state.isGenerating) {
      runAutomation();
    }
  }, [state.isGenerating]);

  const toggleAuto = () => setState(prev => ({ ...prev, isGenerating: !prev.isGenerating }));

  const resetAll = (targetStatus: 'pending' | 'failed' | 'completed') => {
    if (confirm(`هل أنت متأكد من إعادة تعيين جميع البرومبتات ذات الحالة: ${targetStatus}؟`)) {
      setState(prev => ({
        ...prev,
        prompts: prev.prompts.map(p => p.status === targetStatus ? { ...p, status: 'pending', resultImageUrl: undefined, error: undefined } : p)
      }));
    }
  };

  const clearAllPrompts = () => {
    if (confirm("هل أنت متأكد من مسح جميع البرومبتات؟ لا يمكن التراجع عن هذه الخطوة.")) {
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
    if (confirm("حذف هذا البرومبت؟")) {
      setState(prev => ({
        ...prev,
        prompts: prev.prompts.filter(p => p.id !== id)
      }));
    }
  };

  const addIndividualPrompt = () => {
    if (!newPromptData.prompt) {
      alert("البرومبت الرئيسي مطلوب");
      return;
    }

    const prompt: DesignPrompt = {
      id: `custom-${Date.now()}`,
      category: newPromptData.category as Category || 'pizza',
      name: newPromptData.name || `تصميم جديد ${state.prompts.length + 1}`,
      prompt: newPromptData.prompt!,
      logoPrompt: newPromptData.logoPrompt || '',
      description: newPromptData.description || '',
      status: 'pending',
      metadata: {
        dimensions: '1024x1024',
        style: 'professional',
        estimatedTime: 45,
        priority: 'medium'
      }
    };

    setState(prev => ({
      ...prev,
      prompts: [...prev.prompts, prompt]
    }));
    setShowAddModal(false);
    setNewPromptData({ category: 'pizza', name: '', prompt: '', logoPrompt: '', description: '' });
  };

  const handleBulkImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (!Array.isArray(json)) throw new Error("الملف يجب أن يحتوي على مصفوفة JSON");

        const validPrompts: DesignPrompt[] = json
          .filter(item => item.prompt) // Mandatory prompt check
          .map(item => ({
            id: item.id || `${item.category || 'pizza'}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            category: (['pizza', 'burger', 'shawarma', 'chicken', 'desserts'].includes(item.category) ? item.category : 'pizza') as Category,
            name: item.name || `مستورد ${Date.now()}`,
            prompt: item.prompt,
            logoPrompt: item.logoPrompt || '',
            description: item.description || '',
            status: 'pending',
            metadata: item.metadata || {
              dimensions: '1024x1024',
              style: 'professional',
              estimatedTime: 45,
              priority: 'medium'
            }
          }));

        if (validPrompts.length === 0) {
          alert("لم يتم العثور على برومبتات صالحة في الملف");
          return;
        }

        setState(prev => ({
          ...prev,
          prompts: bulkImportMode === 'overwrite' ? validPrompts : [...prev.prompts, ...validPrompts]
        }));
        
        alert(`تم استيراد ${validPrompts.length} برومبت بنجاح`);
      } catch (err) {
        alert("خطأ في قراءة ملف JSON: " + (err as Error).message);
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset for next import
  };

  const applyCategoryLogoPrompt = () => {
    if (!categoryLogoUpdate.prompt) {
      alert("الرجاء إدخال برومبت اللوغو");
      return;
    }
    if (confirm(`هل تريد تحديث برومبت اللوغو لجميع التصاميم في قسم ${CATEGORY_NAMES[categoryLogoUpdate.cat]}؟`)) {
      setState(prev => ({
        ...prev,
        prompts: prev.prompts.map(p => 
          p.category === categoryLogoUpdate.cat 
            ? { ...p, logoPrompt: categoryLogoUpdate.prompt } 
            : p
        )
      }));
      alert("تم التحديث بنجاح");
    }
  };

  const exportPrompts = () => {
    const data = JSON.stringify(state.prompts, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nsdev_prompts_${new Date().toISOString()}.json`;
    a.click();
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-slate-900 text-white p-4 shadow-xl sticky top-0 z-50">
        <div className="container mx-auto flex flex-wrap justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-blue-500 p-2 rounded-lg">
              <Layers className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">NSDEV Mockups Generator</h1>
              <p className="text-xs text-slate-400">Integrated Design Automation Tool</p>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="hidden md:flex gap-4 text-sm font-medium">
              <div className="flex flex-col items-center">
                <span className="text-green-400 font-bold">{stats.completed}</span>
                <span className="text-[10px] text-slate-400">مكتمل</span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-yellow-400 font-bold">{stats.pending}</span>
                <span className="text-[10px] text-slate-400">متبقي</span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-red-400 font-bold">{stats.failed}</span>
                <span className="text-[10px] text-slate-400">فاشل</span>
              </div>
            </div>

            <button 
              onClick={() => setShowSettings(true)}
              className="p-2 hover:bg-slate-800 rounded-full transition-colors relative"
            >
              <Settings className="w-6 h-6" />
              {errorMsg && <div className="absolute top-0 right-0 w-3 h-3 bg-red-500 rounded-full border-2 border-slate-900"></div>}
            </button>
          </div>
        </div>
      </header>

      {/* Main Layout */}
      <main className="flex-1 container mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Sidebar / Controls */}
        <aside className="lg:col-span-4 flex flex-col gap-6">
          
          {/* Main Controls Card */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Play className="w-5 h-5 text-blue-500" />
              لوحة التحكم
            </h2>
            
            <div className="grid grid-cols-2 gap-3 mb-6">
              <button 
                onClick={toggleAuto}
                className={`flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-white transition-all shadow-lg active:scale-95 ${
                  state.isGenerating ? 'bg-orange-500 hover:bg-orange-600' : 'bg-green-600 hover:bg-green-700'
                }`}
              >
                {state.isGenerating ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                {state.isGenerating ? 'إيقاف مؤقت' : 'بدء التلقائي'}
              </button>
              
              <button 
                onClick={() => generateSingle(state.currentIndex)}
                disabled={state.isGenerating}
                className="flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl font-bold transition-all shadow-lg active:scale-95"
              >
                <FastForward className="w-5 h-5" />
                توليد فردي
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500 font-medium">التقدم العام</span>
                <span className="text-blue-600 font-bold">{Math.round((stats.completed / stats.total) * 100)}%</span>
              </div>
              <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-blue-600 transition-all duration-500" 
                  style={{ width: `${(stats.completed / stats.total) * 100}%` }}
                ></div>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              <button 
                onClick={() => resetAll('failed')}
                className="flex-1 py-2 text-xs font-bold border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors flex items-center justify-center gap-1"
              >
                <RotateCcw className="w-3 h-3" />
                إعادة الفاشل
              </button>
              <button 
                onClick={exportPrompts}
                className="flex-1 py-2 text-xs font-bold border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors flex items-center justify-center gap-1"
              >
                <FileJson className="w-3 h-3" />
                تصدير البيانات
              </button>
            </div>
          </div>

          {/* Logo Management Card */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
              <ImageIcon className="w-5 h-5 text-purple-500" />
              إدارة الهوية (Logo)
            </h2>
            
            <label className="block w-full cursor-pointer group">
              <div className="border-2 border-dashed border-slate-200 group-hover:border-purple-300 rounded-xl p-6 text-center transition-all bg-slate-50 group-hover:bg-purple-50">
                <div className="bg-white w-12 h-12 rounded-full shadow-md flex items-center justify-center mx-auto mb-3 text-purple-600">
                  <Download className="w-6 h-6 rotate-180" />
                </div>
                <p className="text-sm font-bold text-slate-700">رفع شعار جديد</p>
                <p className="text-[10px] text-slate-400 mt-1">Transparent PNG Preferred</p>
              </div>
              <input type="file" className="hidden" accept="image/*" onChange={handleLogoUpload} />
            </label>

            {state.activeLogo && (
              <div className="mt-4 p-4 bg-slate-50 rounded-xl border border-slate-100">
                <div className="flex items-center gap-3 mb-4">
                  <img src={state.activeLogo} className="w-12 h-12 object-contain bg-slate-200 rounded-lg" />
                  <div>
                    <p className="text-xs font-bold text-slate-700">الشعار النشط</p>
                    <p className="text-[10px] text-slate-400">سيتم تطبيقه تلقائياً</p>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-[10px] mb-1">
                      <span className="font-bold text-slate-500">الحجم</span>
                      <span className="font-bold text-purple-600">{state.logoEffects.size}%</span>
                    </div>
                    <input 
                      type="range" min="5" max="40" value={state.logoEffects.size} 
                      onChange={(e) => setState(prev => ({ ...prev, logoEffects: { ...prev.logoEffects, size: parseInt(e.target.value) }}))}
                      className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-purple-600" 
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-1 p-1 bg-slate-200 rounded-lg">
                    {(['top-left', 'top-center', 'top-right', 'middle-left', 'middle-center', 'middle-right', 'bottom-left', 'bottom-center', 'bottom-right'] as any).map((pos: any) => (
                      <button 
                        key={pos}
                        onClick={() => setState(prev => ({ ...prev, logoEffects: { ...prev.logoEffects, position: pos }}))}
                        className={`h-6 rounded-md transition-all ${state.logoEffects.position === pos ? 'bg-purple-600' : 'hover:bg-slate-300'}`}
                      ></button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* Content Area */}
        <section className="lg:col-span-8 flex flex-col gap-6">
          
          {/* Tabs / Filters */}
          <div className="flex flex-col gap-4">
            <div className="bg-slate-100/50 p-2 rounded-xl flex gap-2 overflow-x-auto no-scrollbar">
              <NavItem 
                label="الكل" active={filter === 'all'} onClick={() => setFilter('all')} 
                color="#64748b" count={state.prompts.length} 
              />
              {Object.entries(CATEGORY_NAMES).map(([key, label]) => (
                <NavItem 
                  key={key} label={label} active={filter === key} 
                  onClick={() => setFilter(key as Category)} 
                  color={CATEGORY_COLORS[key as Category]} 
                  count={state.prompts.filter(p => p.category === key).length}
                />
              ))}
            </div>
          </div>

          {/* Main Interaction Area */}
          <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="flex border-b border-slate-100 bg-slate-50/50">
              <button 
                onClick={() => setActiveTab('prompts')}
                className={`flex-1 py-4 text-sm font-bold transition-all ${activeTab === 'prompts' ? 'text-blue-600 bg-white border-b-2 border-blue-600' : 'text-slate-500 hover:text-slate-800'}`}
              >
                قائمة التصاميم
              </button>
              <button 
                onClick={() => setActiveTab('control')}
                className={`flex-1 py-4 text-sm font-bold transition-all ${activeTab === 'control' ? 'text-blue-600 bg-white border-b-2 border-blue-600' : 'text-slate-500 hover:text-slate-800'}`}
              >
                لوحة الإدارة
              </button>
              <button 
                onClick={() => setActiveTab('gallery')}
                className={`flex-1 py-4 text-sm font-bold transition-all ${activeTab === 'gallery' ? 'text-blue-600 bg-white border-b-2 border-blue-600' : 'text-slate-500 hover:text-slate-800'}`}
              >
                معرض المخرجات
              </button>
            </div>

            <div className="p-4 min-h-[600px]">
              {activeTab === 'prompts' && (
                <div className="flex flex-col gap-4">
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="font-bold text-slate-800">إجمالي التصاميم: {filteredPrompts.length}</h3>
                    <button 
                      onClick={() => setShowAddModal(true)}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold transition-all active:scale-95 shadow-md"
                    >
                      <PlusCircle className="w-4 h-4" />
                      إضافة تصميم جديد
                    </button>
                  </div>
                  <div className="grid grid-cols-1 gap-3">
                    {filteredPrompts.slice(0, 100).map((p, idx) => {
                      const globalIdx = state.prompts.indexOf(p);
                      return (
                        <div 
                          key={p.id}
                          className={`group p-4 rounded-2xl border transition-all hover:shadow-md flex items-center gap-4 ${
                            state.currentIndex === globalIdx ? 'border-blue-200 bg-blue-50/30 ring-2 ring-blue-100' : 'border-slate-100 bg-white'
                          }`}
                        >
                          <div 
                            className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0 shadow-sm"
                            style={{ backgroundColor: CATEGORY_COLORS[p.category] }}
                          >
                            <span className="font-bold text-xs">{globalIdx + 1}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-bold text-slate-800 text-sm truncate">{p.name}</h3>
                              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                                p.status === 'completed' ? 'bg-green-100 text-green-700' : 
                                p.status === 'failed' ? 'bg-red-100 text-red-700' : 
                                p.status === 'generating' ? 'bg-blue-100 text-blue-700 animate-pulse' : 'bg-slate-100 text-slate-500'
                              }`}>
                                {p.status === 'completed' ? 'تم الانتهاء' : p.status === 'pending' ? 'بانتظار البدء' : p.status === 'failed' ? 'فشل' : 'جاري العمل...'}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500 truncate italic">{p.prompt}</p>
                          </div>
                          <div className="flex gap-2 shrink-0">
                            <button 
                              onClick={() => setEditingPrompt(p)}
                              className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => removePrompt(p.id)}
                              className="p-2 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-500 transition-colors"
                            >
                              <Trash className="w-4 h-4" />
                            </button>
                            {p.status === 'generating' ? (
                              <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
                            ) : (
                              <button 
                                onClick={() => generateSingle(globalIdx)}
                                className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-blue-500 transition-colors"
                              >
                                <Play className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {activeTab === 'control' && (
                <div className="space-y-8">
                  {/* Bulk Actions */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div className="p-6 bg-slate-50 rounded-2xl border border-slate-200">
                      <h4 className="font-bold text-slate-800 mb-2 flex items-center gap-2">
                        <Upload className="w-4 h-4 text-blue-600" />
                        استيراد برومبتات (JSON)
                      </h4>
                      <p className="text-xs text-slate-500 mb-4">ارفع ملف JSON يحتوي على مجموعة من البرومبتات.</p>
                      
                      <div className="flex items-center gap-4 mb-4 text-xs font-bold">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input 
                            type="radio" name="importMode" value="append" 
                            checked={bulkImportMode === 'append'} 
                            onChange={() => setBulkImportMode('append')}
                            className="accent-blue-600"
                          />
                          إضافة للبرومبتات الحالية
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input 
                            type="radio" name="importMode" value="overwrite" 
                            checked={bulkImportMode === 'overwrite'} 
                            onChange={() => setBulkImportMode('overwrite')}
                            className="accent-red-600"
                          />
                          مسح الكل والاستبدال
                        </label>
                      </div>

                      <label className="block w-full cursor-pointer">
                        <div className="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center hover:bg-white transition-all">
                          <FileJson className="w-8 h-8 mx-auto mb-2 text-slate-400" />
                          <p className="text-xs font-bold text-slate-600">اختر ملف JSON للرفع</p>
                        </div>
                        <input type="file" accept=".json" onChange={handleBulkImport} className="hidden" />
                      </label>
                    </div>

                    <div className="p-6 bg-slate-50 rounded-2xl border border-slate-200">
                      <h4 className="font-bold text-slate-800 mb-2 flex items-center gap-2">
                        <Trash2 className="w-4 h-4 text-red-600" />
                        إدارة شاملة
                      </h4>
                      <p className="text-xs text-slate-500 mb-4">أوامر سريعة للتحكم في قاعدة بيانات البرومبتات.</p>
                      <div className="flex flex-col gap-3">
                        <button 
                          onClick={clearAllPrompts}
                          className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-sm transition-all active:scale-95 shadow-md flex items-center justify-center gap-2"
                        >
                          <Trash2 className="w-4 h-4" />
                          مسح جميع البرومبتات نهائياً
                        </button>
                        <button 
                          onClick={() => resetAll('pending')}
                          className="w-full py-3 border-2 border-slate-200 hover:bg-white text-slate-600 font-bold rounded-xl text-sm transition-all flex items-center justify-center gap-2"
                        >
                          <RotateCcw className="w-4 h-4" />
                          إعادة تعيين الجميع لحالة "معلق"
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Standardized Category Pilot */}
                  <div className="p-6 bg-slate-50 rounded-2xl border border-slate-200">
                    <h4 className="font-bold text-slate-800 mb-2 flex items-center gap-2">
                      <Type className="w-4 h-4 text-purple-600" />
                      تحديث موحد للوغو (حسب القسم)
                    </h4>
                    <p className="text-xs text-slate-500 mb-4">قم بتغيير برومبت اللوغو لجميع التصاميم في قسم معين بضغطة واحدة.</p>
                    
                    <div className="flex flex-col sm:flex-row gap-4">
                      <select 
                        value={categoryLogoUpdate.cat}
                        onChange={(e) => setCategoryLogoUpdate({...categoryLogoUpdate, cat: e.target.value as Category})}
                        className="px-4 py-2 bg-white border border-slate-200 rounded-xl outline-none text-sm font-bold"
                      >
                        {Object.entries(CATEGORY_NAMES).map(([key, label]) => (
                          <option key={key} value={key}>{label}</option>
                        ))}
                      </select>
                      <input 
                        type="text"
                        value={categoryLogoUpdate.prompt}
                        onChange={(e) => setCategoryLogoUpdate({...categoryLogoUpdate, prompt: e.target.value})}
                        placeholder="أدخل برومبت اللوغو الجديد هنا..."
                        className="flex-1 px-4 py-2 bg-white border border-slate-200 rounded-xl outline-none text-sm"
                      />
                      <button 
                        onClick={applyCategoryLogoPrompt}
                        className="px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl text-sm shadow-md transition-all active:scale-95"
                      >
                        تحديث القسم
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'gallery' && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                  {state.prompts.filter(p => p.status === 'completed' && p.resultImageUrl).map(p => (
                    <div key={p.id} className="relative group aspect-square rounded-2xl overflow-hidden shadow-sm border border-slate-100 bg-slate-50">
                      <img src={p.resultImageUrl} className="w-full h-full object-cover" loading="lazy" />
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3">
                        <p className="text-[10px] text-white font-bold truncate mb-2">{p.name}</p>
                        <div className="flex gap-2">
                          <a 
                            href={p.resultImageUrl} 
                            download={`${p.id}.png`}
                            className="flex-1 bg-white text-slate-900 text-[10px] font-bold py-1.5 rounded-lg text-center hover:bg-blue-50"
                          >
                            تنزيل
                          </a>
                        </div>
                      </div>
                    </div>
                  ))}
                  {stats.completed === 0 && (
                    <div className="col-span-full py-20 text-center">
                      <div className="bg-slate-50/50 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300">
                        <LayoutGrid className="w-12 h-12" />
                      </div>
                      <h3 className="text-slate-500 font-bold">المعرض فارغ حالياً</h3>
                      <p className="text-xs text-slate-400">ابدأ في توليد الصور لرؤية النتائج المذهلة هنا</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>
      </main>

      {/* Add Individual Prompt Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden">
            <div className="p-6 bg-slate-900 text-white flex justify-between items-center">
               <h3 className="font-bold flex items-center gap-2">
                 <PlusCircle className="w-5 h-5 text-blue-400" />
                 إضافة تصميم جديد
               </h3>
               <button onClick={() => setShowAddModal(false)} className="p-1 rounded-full hover:bg-white/10 transition-colors">
                 <Trash2 className="w-5 h-5 rotate-45" />
               </button>
             </div>
             <div className="p-6 space-y-4 max-h-[80vh] overflow-y-auto custom-scroll">
               <div className="grid grid-cols-2 gap-4">
                 <div className="col-span-2 sm:col-span-1">
                   <label className="text-xs font-bold text-slate-500 mb-1 block">القسم</label>
                   <select 
                     value={newPromptData.category}
                     onChange={(e) => setNewPromptData({...newPromptData, category: e.target.value as Category})}
                     className="w-full px-4 py-2 bg-slate-50 border rounded-xl outline-none font-bold text-sm"
                   >
                     {Object.entries(CATEGORY_NAMES).map(([key, label]) => (
                       <option key={key} value={key}>{label}</option>
                     ))}
                   </select>
                 </div>
                 <div className="col-span-2 sm:col-span-1">
                   <label className="text-xs font-bold text-slate-500 mb-1 block">اسم التصميم</label>
                   <input 
                     type="text" value={newPromptData.name} 
                     onChange={(e) => setNewPromptData({ ...newPromptData, name: e.target.value })}
                     placeholder="مثلاً: برجر كلاسيك"
                     className="w-full px-4 py-2 bg-slate-50 border rounded-xl outline-none"
                   />
                 </div>
               </div>
               <div>
                 <label className="text-xs font-bold text-slate-500 mb-1 block">البرومبت الرئيسي (Mockup Prompt)</label>
                 <textarea 
                   rows={3} value={newPromptData.prompt} 
                   onChange={(e) => setNewPromptData({ ...newPromptData, prompt: e.target.value })}
                   className="w-full px-4 py-2 bg-slate-50 border rounded-xl outline-none text-sm font-mono"
                   placeholder="Describe the packaging mockup in English..."
                 />
               </div>
               <div>
                 <label className="text-xs font-bold text-slate-500 mb-1 block">برومبت اللوغو (Logo Prompt)</label>
                 <textarea 
                   rows={2} value={newPromptData.logoPrompt} 
                   onChange={(e) => setNewPromptData({ ...newPromptData, logoPrompt: e.target.value })}
                   className="w-full px-4 py-2 bg-slate-50 border rounded-xl outline-none text-sm font-mono"
                   placeholder="Describe the logo to integrate..."
                 />
               </div>
               <div>
                 <label className="text-xs font-bold text-slate-500 mb-1 block">وصف التصميم (بالعربية)</label>
                 <input 
                   type="text" value={newPromptData.description} 
                   onChange={(e) => setNewPromptData({ ...newPromptData, description: e.target.value })}
                   className="w-full px-4 py-2 bg-slate-50 border rounded-xl outline-none"
                 />
               </div>
               <div className="grid grid-cols-1 pt-2">
                 <button 
                   onClick={addIndividualPrompt}
                   className="py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-lg transition-all active:scale-95"
                 >
                   إضافة للقائمة
                 </button>
               </div>
             </div>
          </div>
        </div>
      )}

      {/* Edit Prompt Modal */}
      {editingPrompt && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
           <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden">
             <div className="p-6 bg-slate-900 text-white flex justify-between items-center">
               <h3 className="font-bold flex items-center gap-2">
                 <Edit2 className="w-5 h-5 text-blue-400" />
                 تعديل التصميم
               </h3>
               <button onClick={() => setEditingPrompt(null)} className="p-1 rounded-full hover:bg-white/10 transition-colors">
                 <RotateCcw className="w-5 h-5 rotate-45" />
               </button>
             </div>
             <div className="p-6 space-y-4 max-h-[80vh] overflow-y-auto custom-scroll">
               <div>
                 <label className="text-xs font-bold text-slate-500 mb-1 block">اسم التصميم</label>
                 <input 
                   type="text" value={editingPrompt.name} 
                   onChange={(e) => setEditingPrompt({ ...editingPrompt, name: e.target.value })}
                   className="w-full px-4 py-2 bg-slate-50 border rounded-xl outline-none focus:ring-2 ring-blue-500/20"
                 />
               </div>
               <div>
                 <label className="text-xs font-bold text-slate-500 mb-1 block flex items-center gap-1">
                   <ImageIcon className="w-3 h-3" /> برومبت التصميم الرئيسي
                 </label>
                 <textarea 
                   rows={3} value={editingPrompt.prompt} 
                   onChange={(e) => setEditingPrompt({ ...editingPrompt, prompt: e.target.value })}
                   className="w-full px-4 py-2 bg-slate-50 border rounded-xl outline-none focus:ring-2 ring-blue-500/20 text-sm font-mono"
                 />
               </div>
               <div>
                 <label className="text-xs font-bold text-slate-500 mb-1 block flex items-center gap-1">
                   <Type className="w-3 h-3" /> برومبت الشعار المدمج (Logo Prompt)
                 </label>
                 <textarea 
                   rows={2} value={editingPrompt.logoPrompt || ''} 
                   onChange={(e) => setEditingPrompt({ ...editingPrompt, logoPrompt: e.target.value })}
                   className="w-full px-4 py-2 bg-slate-50 border rounded-xl outline-none focus:ring-2 ring-blue-500/20 text-sm font-mono"
                   placeholder="مثلاً: Place a minimal circular logo with a white chef icon on the package..."
                 />
                 <p className="text-[10px] text-slate-400 mt-1 italic">سيتم دمج هذا البرومبت مع التصميم الرئيسي للحصول على شعار مدمج بتقنية AI.</p>
               </div>
               <div className="grid grid-cols-2 gap-4 pt-2">
                 <button 
                   onClick={() => updatePrompt(editingPrompt)}
                   className="py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-lg transition-all active:scale-95"
                 >
                   حفظ التعديلات
                 </button>
                 <button 
                   onClick={() => setEditingPrompt(null)}
                   className="py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl transition-all"
                 >
                   إلغاء
                 </button>
               </div>
             </div>
           </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 bg-slate-900 text-white flex justify-between items-center">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Settings className="w-6 h-6 text-blue-400" />
                الإعدادات المتقدمة
              </h2>
              <button onClick={() => setShowSettings(false)} className="hover:bg-white/10 p-1 rounded-full">
                <Trash2 className="w-6 h-6 rotate-45" />
              </button>
            </div>
            
            <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto custom-scroll">
              {errorMsg && (
                <div className="bg-red-50 text-red-600 p-3 rounded-xl text-sm font-bold flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    {errorMsg}
                  </div>
                  {errorMsg.includes("Pro") && (
                    <button onClick={handleApiKeySelect} className="text-xs bg-red-600 text-white py-1 px-3 rounded-md w-fit">
                      إعداد مفتاح Pro الآن
                    </button>
                  )}
                </div>
              )}

              {/* API Key / Model Section */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 uppercase flex items-center gap-1">
                    <Key className="w-3 h-3" /> نموذج الذكاء الاصطناعي
                  </span>
                </div>
                
                <div className="flex bg-slate-200 p-1 rounded-xl">
                   <button 
                     onClick={() => setState(prev => ({ ...prev, settings: { ...prev.settings, model: 'gemini-2.5-flash-image' }}))}
                     className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${state.settings.model === 'gemini-2.5-flash-image' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500'}`}
                   >
                     Flash (سريع)
                   </button>
                   <button 
                     onClick={() => setState(prev => ({ ...prev, settings: { ...prev.settings, model: 'gemini-3-pro-image-preview' }}))}
                     className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${state.settings.model === 'gemini-3-pro-image-preview' ? 'bg-white shadow-sm text-purple-600' : 'text-slate-500'}`}
                   >
                     Pro (جودة عالية)
                   </button>
                </div>

                {state.settings.model === 'gemini-3-pro-image-preview' ? (
                  <button 
                    onClick={handleApiKeySelect}
                    className="w-full flex items-center justify-center gap-2 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold shadow-md transition-all active:scale-95"
                  >
                    <Key className="w-4 h-4" />
                    اختيار مفتاح Pro المدفوع
                  </button>
                ) : (
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400">Flash API Key (اختياري)</label>
                    <input 
                      type="password"
                      value={state.settings.apiKey}
                      onChange={(e) => setState(prev => ({ ...prev, settings: { ...prev.settings, apiKey: e.target.value } }))}
                      className="w-full px-4 py-2 bg-white border rounded-xl outline-none text-xs"
                      placeholder="اتركه فارغاً لاستخدام المفتاح الافتراضي"
                    />
                  </div>
                )}
                <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" className="text-[10px] text-blue-500 flex items-center gap-1 justify-center">
                  تعلم المزيد عن الفوترة والمفاتيح المدفوعة <ExternalLink className="w-2 h-2" />
                </a>
              </div>

              {/* Technical Params */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
                 <span className="text-xs font-bold text-slate-700 uppercase flex items-center gap-1">
                    <Sliders className="w-3 h-3" /> المعايير التقنية
                 </span>
                 
                 <div className="grid grid-cols-2 gap-4">
                   <div className="space-y-1">
                     <label className="text-[10px] font-bold text-slate-400">نسبة العرض (Aspect)</label>
                     <select 
                       value={state.settings.aspectRatio}
                       onChange={(e) => setState(prev => ({ ...prev, settings: { ...prev.settings, aspectRatio: e.target.value as any } }))}
                       className="w-full px-3 py-2 bg-white border rounded-xl text-xs"
                     >
                       <option value="1:1">1:1 (مربع)</option>
                       <option value="3:4">3:4 (عمودي)</option>
                       <option value="4:3">4:3 (أفقي)</option>
                       <option value="9:16">9:16 (سناب/تيك توك)</option>
                       <option value="16:9">16:9 (عريض)</option>
                     </select>
                   </div>
                   <div className="space-y-1">
                     <label className="text-[10px] font-bold text-slate-400">الجودة (Size)</label>
                     <select 
                       value={state.settings.imageQuality}
                       disabled={state.settings.model !== 'gemini-3-pro-image-preview'}
                       onChange={(e) => setState(prev => ({ ...prev, settings: { ...prev.settings, imageQuality: e.target.value as any } }))}
                       className="w-full px-3 py-2 bg-white border rounded-xl text-xs disabled:opacity-50"
                     >
                       <option value="1K">1K</option>
                       <option value="2K">2K</option>
                       <option value="4K">4K</option>
                     </select>
                   </div>
                 </div>

                 <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400">بذرة التوليد (Seed)</label>
                    <div className="flex gap-2">
                       <input 
                         type="number"
                         value={state.settings.seed || ''}
                         onChange={(e) => setState(prev => ({ ...prev, settings: { ...prev.settings, seed: e.target.value ? parseInt(e.target.value) : null } }))}
                         className="flex-1 px-4 py-2 bg-white border rounded-xl text-xs"
                         placeholder="عشوائي..."
                       />
                       <button 
                         onClick={() => setState(prev => ({ ...prev, settings: { ...prev.settings, seed: Math.floor(Math.random() * 100000) } }))}
                         className="px-3 bg-slate-200 rounded-xl text-[10px] font-bold"
                       >
                         عشوائي
                       </button>
                    </div>
                 </div>
              </div>

              <button 
                onClick={() => { setShowSettings(false); setErrorMsg(null); }}
                className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl shadow-lg transition-all active:scale-95"
              >
                حفظ وتطبيق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer Status Bar */}
      <footer className="bg-white border-t border-slate-200 p-3 text-xs flex justify-between items-center text-slate-500">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1">
            <div className={`w-2 h-2 rounded-full ${state.settings.model === 'gemini-3-pro-image-preview' ? 'bg-purple-500' : 'bg-blue-500'}`}></div>
            <span>Model: {state.settings.model.split('-')[2].toUpperCase()}</span>
          </div>
          <div className="flex items-center gap-1">
            <div className={`w-2 h-2 rounded-full ${state.isGenerating ? 'bg-green-500 animate-pulse' : 'bg-slate-300'}`}></div>
            <span>Batch Process: {state.isGenerating ? 'Active' : 'Paused'}</span>
          </div>
        </div>
        <div className="font-medium">
          NSDEV Mockups Tool • Built for Quality
        </div>
      </footer>
    </div>
  );
};

export default App;
