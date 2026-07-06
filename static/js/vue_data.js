const isElectron = window.electronAPI ? true : false;
const isSteamBuild = window.__IS_STEAM_BUILD__ || false;
// 事件监听改造
if (isElectron) {
    document.addEventListener('contextmenu', (e) => {
      const imgTarget = e.target.closest('img');
      
      if (imgTarget) {
        e.preventDefault();
        window.electronAPI.showContextMenu('image', { 
          src: imgTarget.src,
          x: e.x,
          y: e.y
        });
      } else {
        window.electronAPI.showContextMenu('default');
      }
    });
  
    HOST = "127.0.0.1"
    PORT = window.location.port
    document.addEventListener('click', async (event) => {
      const link = event.target.closest('a[href]');
      if (!link) return;
      const href = link.getAttribute('href');
      
      try {
        const url = new URL(href);
        
        if (url.hostname === HOST && 
            url.port === PORT &&
            url.pathname.startsWith('/uploaded_files/')) {
          event.preventDefault();
          
          // 使用预加载接口处理路径
          const filename = url.pathname.split('/uploaded_files/')[1];
          const filePath = window.electronAPI.pathJoin(
            window.electronAPI.getAppPath(), 
            'uploaded_files', 
            filename
          );
          
          await window.electronAPI.openPath(filePath);
          return;
        }
        if (['http:', 'https:'].includes(url.protocol)) {
          event.preventDefault();
          await window.electronAPI.openExternal(href); // 确保调用electronAPI
          return;
        }
        
      } catch {
        event.preventDefault();
        window.location.href = href;
      }
    });
  }
  else {
    HOST = window.location.hostname
    PORT = window.location.port
  }
  // 判断协议
  const protocol = window.location.protocol;
  const backendURL = `${window.location.protocol}//${window.location.host}`;
let vue_data = {
    isMac: false,
    isWindows: false,
    partyURL:`${window.location.protocol}//${window.location.host}`,
    downloadProgress: 0,
    updateDownloaded: false,
    updateAvailable: false,
    updateInfo: null,
    updateIcon: 'fa-solid fa-download',
    system_prompt: ' ',
    SystemPromptsList: [],          // 系统提示词数组
    extensionsSystemPromptsDict: {}, // 扩展提示词字典
    showPromptDialog: false,        // 对话框显隐
    promptForm: {                   // 对话框绑定
      id: null,
      name: '',
      content: ''
    },
    selectSystemPromptId: null,    // 选择的系统提示词id
    wakeWindowTimer: null,   // 计时器
    withinWakeWindow: false, // 是否处于“免唤醒”30s 窗口
    isdocker: false,
    isExpanded: true,
    isElectron: isElectron,
    isSteamBuild: isSteamBuild,
    isStandaloneChatPage: window.location.pathname.includes('chat.html'),
    isCollapse: true,
    isBtnCollapse: true,
    activeMenu: 'dashboard',
    activeLiveTab: 'live',
    isMaximized: false,
    hasUpdate: false,
    updateSuccess: false,
    audioCtx: null,          // WebAudio 上下文
    activeSources: [], 
    audioStartTime: 0,       // 下一帧应该开始的时间
    omniQueue: [],        // [{idx, text, expressions, voice, pcmBase64}, ...]
    omniIdx: 0,           // 当前正在播的索引
    isOmniPlaying: false, // 是否正在播放
    settings: {
      model: '',
      base_url: '',
      api_key: '',
      temperature: 1,  // 默认温度值
      max_tokens: 8192,    // 默认最大输出长度
      max_rounds: 0,    // 默认最大轮数
      selectedProvider: null,
      top_p: 1,
      reasoning_effort: null,
      enableOmniTTS: false,// 是否启用omniTTS
      omniVoice: 'Cherry', // omniTTS的语音
      extra_params: [], // 额外参数
    },
    fastSettings: {
      enabled: false, // 默认不启用
      triggerMode: 'conditional', // 默认触发模式条件触发
      model: '',
      base_url: '',
      api_key: '',
      temperature: 1,  // 默认温度值
      max_tokens: 8192,    // 默认最大输出长度
      max_rounds: 0,    // 默认最大轮数
      selectedProvider: null,
      top_p: 1,
      reasoning_effort: null,
      enableOmniTTS: false,// 是否启用omniTTS
      omniVoice: 'Cherry', // omniTTS的语音
      extra_params: [], // 额外参数
      conditionMaxLen: 200,       // 默认字数限制，小于此字数才触发
      conditionNoNewline: true,   // 是否要求不能有换行才触发
      conditionNoFiles: true,     // 是否要求无图片/文件才触发
    },
    reasonerSettings: {
      enabled: false, // 默认不启用
      model: '',
      base_url: '',
      api_key: '',
      selectedProvider: null,
      temperature: 1,  // 默认温度值
      max_tokens: 4096,  // 默认最大输出长度
      stop_words: [',', '.', '，', '。'], // 停止词列表
      reasoning_effort: null,
    },
    target_lang: 'zh-CN',
    reasoningEfforts:[
      { value: null, label: 'reason-null' },
      { value: 'minimal', label: 'reason-minimal' },
      { value: 'low', label: 'reason-low' },
      { value: 'medium', label: 'reason-medium' },
      { value: 'high', label: 'reason-high' },
      { value: 'xhigh', label: 'reason-xhigh' },
      { value: 'max', label: 'reason-max' },
      { value: 'none', label: 'reason-none' },
    ],
    visionSettings: {
      enabled: false, // 默认不启用
      model: '',
      base_url: '',
      api_key: '',
      selectedProvider: null,
      temperature: 1,  // 默认温度值
      desktopVision: false,
      wakeWord: '看\nsee\nlook\n桌面\ndesktop',
      enableWakeWord: false,
    },
    paramTypes:[
      { value: 'string', label: 'string' },
      { value: 'integer', label: 'integer' },
      { value: 'float', label: 'float' },
      { value: 'boolean', label: 'boolean' },
      { value: 'json', label: 'JSON' } // 合并为一个
    ],
    ws: null,
    messages: [],
    cur_audioDatas: [],
    userInput: '',
    isTyping: false,
    currentMessage: '',
    conversationId: null, // 当前对话ID
    conversations: [], // 对话历史记录
    conversationGroups: [],
    collapsedConversationGroups: {},
    chatHistoryPanelOpen: true,
    chatHistoryPanelWidth: 320,
    draftConversationGroupId: 'default',
    activeConversationGroupId: 'default',
    showConversationGroupDialog: false,
    conversationGroupDialogMode: 'create',
    conversationGroupForm: {
      id: null,
      name: '',
      memoryEnabled: false,
    },
    showConversationRenameDialog: false,
    conversationRenameForm: {
      id: null,
      name: '',
    },
    showDeleteConversationDialog: false,
    deleteConversationForm: {
      id: null,
      title: '',
      deleteMemory: false,
    },
    showDeleteGroupDialog: false,
    deleteGroupForm: {
      id: null,
      name: '',
      conversationCount: 0,
    },
    showHistoryDialog: false,
    showLLMToolsDialog: false,
    showHttpToolDialog: false,
    showComfyUIDialog: false,
    showStickerPacksDialog: false,
    showGsvRefAudioPathDialog: false,
    showModelDialog: false,
    showLogoDialog: false,
    deletingConversationId: null, // 正在被删除的对话ID
    jsonFile: null,
    models: [],
    modelsLoading: false,
    modelsError: null,
    isThinkOpen: false,
    showEditDialog: false,
    editContent: '',
    editType: 'system', // 或 'message'
    editIndex: null,
    asyncToolsID : [],
    TTSrunning:false,
    ASRrunning:false,
    isInputting: false,
    toolsSettings: {
      asyncTools: {
        enabled: false,
      },
      a2ui: {
        enabled: false,
      },
      time: {
        enabled: false,
        triggerMode: 'beforeThinking',
      },
      weather: {
        enabled: false
      },
      wikipedia: {
        enabled: false,
      },
      arxiv: {
        enabled: false,
      },
      hideToolResults: {
        enabled: false,
      },
      getFile: {
        enabled: false,
      },
      language: {
        enabled: false, // 默认不启用
        language: 'zh-CN',
        tone: 'normal',
      },
      inference: {
        enabled: false, // 默认不启用
      },
      deepsearch: {
        enabled: false, // 默认不启用
      },
      formula: {
        enabled: true
      },
      autoBehavior: {
        enabled: false
      },
    },
    toolForShowInfo: {"name": "", "description": ""},
    showToolInfoDialog: false,
    mcpServers: {},
    showAddMCPDialog: false,
    showMCPConfirm: false,
    deletingMCPName: null,
    newMCPJson: '',
    newMCPFormData: {
      name: 'mcp',
      command: '',
      args:'',
      env: '',
      url: '',
      apiKey: '',
    },
    newMCPType: 'stdio', // 新增类型字段
    mcpInputType: 'form', // 默认为JSON，还可以是 'form'
    currentMCPExample: '',
    mcpURLDict: {
      stdio: 'http://127.0.0.1:8000/mcp',
      sse: 'http://127.0.0.1:8000/sse',
      ws: 'ws://127.0.0.1:8000/ws',
      streamablehttp: 'http://127.0.0.1:8000/mcp'
    },
    mcpExamples: {
      stdio: `{
  "mcpServers": {
    "echo-server": {
      "command": "node",
      "args": [
        "path/to/echo-mcp/build/index.js"
      ],
      "disabled": false
    }
  }
}`,
      sse: `{
  "mcpServers": {
    "sse-server": {
      "url": "http://127.0.0.1:8000/sse",
      "headers": {
        "Content-Type": "text/event-stream",
        "Authorization": "Bearer YOUR_API_KEY"
      },
      "disabled": false
    }
  }
}`,
      ws: `{
  "mcpServers": {
    "websocket-server": {
      "url": "ws://127.0.0.1:8000/ws",
      "disabled": false
    }
  }
}`,
    streamablehttp: `{
  "mcpServers": {
    "streamablehttp-server": {
      "url": "http://127.0.0.1:8000/mcp",
      "headers": {
        "Content-Type": "application/json",
        "Authorization": "Bearer YOUR_API_KEY"
      },
      "disabled": false
    }
  }
}`
    },
    activeKbTab: 'settings', // 默认激活的标签页
    activeReadTab: 'full', // 默认激活的标签页
    webSearchSettings: {
      enabled: false,
      engine: 'tavily',
      crawler: 'mdnew',
      when: 'after_thinking',
      duckduckgo_max_results: 10, // 默认值
      searxng_url: `http://127.0.0.1:8080`,
      searxng_engines: "baidu,sogou,360search,quark",
      searxng_is_select:false,
      searxng_max_results: 10, // 默认值
      tavily_max_results: 10, // 默认值
      tavily_api_key: '',
      jina_api_key: '',
      Crawl4Ai_url: 'http://127.0.0.1:11235',
      Crawl4Ai_api_key: 'test_api_code',
      google_max_results: 10, // 默认值
      google_api_key: '',
      google_cse_id: '',
      brave_max_results: 10, // 默认值
      brave_api_key: '',
      exa_max_results:10,
      exa_api_key: '',
      serper_max_results:10,
      serper_api_key: '',
      bochaai_max_results:10,
      bochaai_api_key: '',
      firecrawl_url: 'https://api.firecrawl.dev/v2', // 官方API或自部署地址
      firecrawl_api_key: '',
      firecrawl_mode: 'scrape', 
    },
    codeSettings: {
      enabled: false,
      engine: 'e2b',
      e2b_api_key: '',
      sandbox_url: 'http://127.0.0.1:8080',
    },
    CLISettings: {
      enabled: false,
      visibilityScope: 'workspace',
      engine: 'local',
      cc_path: '',
      shortcut: true,
      max_iterations: 100,
      mode_change: false
    },
    visionControlSettings:{
      enabled: false,
      mouse:true,
      keyboard:true,
      desktopVision: true,
      onlyNewScreen: true,
      isEnableGrid: true, // 是否启用网格
      isFullScreen: true, // 是否全屏
      ScreenSize : [0,0,1280,720], // 非全屏时，截取x1 y1 x2 y2
    },
    ccSettings: {
      enabled: false,
      selectedProvider: null,
      base_url:'',
      api_key:'',
      model:'',
      permissionMode: 'default',
    },
    qcSettings: {
      enabled: false,
      selectedProvider: null,
      base_url:'',
      api_key:'',
      model:'',
      permissionMode: 'default',
    },
    dsSettings: {
      enabled: false,
      permissionMode: 'default',
    },
    localEnvSettings: {
      enabled: false,
      permissionMode: 'default',
    },
    ocSettings: {
      enabled: false,
      selectedProvider: null,
      base_url:'',
      api_key:'',
      model:'',
      permissionMode: 'default',
    },
    HASettings: {
      enabled: false,
      api_key: '',
      url: 'http://127.0.0.1:8123',
    },
    chromeMCPSettings: {
      enabled: false,
      mcpName: 'browser-mcp', // browser-mcp or playwright-mcp
      type:"external", // external or internal
      CDPport:9222,
      browserVision: false,
      onlyNewScreen: true,
    },
    sqlSettings:{
      enabled: false,
      engine: "sqlite",
      user: "",
      password: "",
      host:"",
      port:5432,
      dbname: "",
      dbpath: "",
    },
    knowledgeBases: [],
    KBSettings: {
      when: 'after_thinking',
      is_rerank: false,
      selectedProvider: null,
      model: '',
      base_url: '',
      api_key: '',
      top_n: 5,
    },
    showAddKbDialog: false,
    showKnowledgeDialog: false,
    showMCPServerDialog: false,
    a2aServers: {},
    showA2AServerDialog: false,
    showAddA2ADialog: false,
    newA2AUrl: '',
    activeCollapse: [],
    newKb: {
      name: '',
      introduction: '',
      providerId: null,
      model: '',
      base_url: '',
      api_key: '',
      chunk_size: 2048,
      chunk_overlap: 512,
      chunk_k: 5,
      weight: 0.5,
      processingStatus: 'processing',
    },
    newKbFiles: [],
    systemSettings: {
      language: 'auto',
      theme: 'light',
      fontScale: 1, 
      codeFontScale: 1, 
      autoCollapseInput: false, 
      network: "local",
      proxy: 'http://127.0.0.1:7890',
      proxyMode: 'system', 
      isChinaProxy: false,
      chatMode: 'standard', 
      githubProxy: '', 
      backgroundURL: '',
      bgHistoryList: [],
      customCSS: '',
      contentSafety: false,
      disclaimerAccepted: false,
      showDisclaimer: true,
      goal_iterations: 30,
      enableShortcuts: true,
    },
    saveBgDialogVisible: false,
    newBgName: '',
    networkOptions:[
      { value: 'local', label: 'local' }, 
      { value: 'global', label: 'allDevicesVisible' },
    ],
    imgHostOptions:[
      { value: 'easyImage2', label: 'easyImage2' }
    ],
    showRestartDialog: false,
    showCDPRestartDialog: false,
    agents: {},
    showAgentForm: false,
    editingAgent: null,
    showAgentDialog: false,
    mainAgent: 'super-model',
    newAgent: {
      id: '',
      name: '',
      system_prompt: ''
    },
    editingAgent: false,
    currentLanguage: 'zh-CN',
    translations: translations,
    themeValues: ['light', 'dark','midnight','desert','neon','marshmallow','ink','party',"rainbow"],
    isBrowserOpening: false,
    expandedSections: {
      settingsBase: true,
      reasonerConfig: true,
      language: true,
      superapi: true,
      webSearchConfig: true,
      duckduckgoConfig: true,
      searxngConfig: true,
      tavilyConfig: true,
      jinaConfig: true,
      Crawl4AiConfig: true,
      settingsAdvanced: true,
      reasonerAdvanced: true,
      knowledgeAdvanced: false,
    },
    abortController: null, // 用于中断请求的控制器
    isSending: false, // 是否正在发送
    showAddDialog: false,
    modelProviders: [],
    // 更新相关
    updateAvailable: false,
    updateInfo: null,
    updateDownloaded: false,
    downloadProgress: 0,
    fileLinks: [],
    audioContext: null,
    mediaStream: null,
    mediaRecorder: null,
    audioChunks: [],
    isRecording: false,
    vad: null,
    speechTimeout: null,
    currentAudioChunks: [],
    currentTranscriptionId: null,
    speechStartTime: null,
    recognition: null,
    sherpaModelExists: false,             // 模型是否已存在
    sherpaDownloading: false,             // 是否正在下载
    sherpaPercent: 0,                     // 实时进度 0-100
    sherpaEventSource: null,               // 当前 SSE 实例
    sherpaModelName: '',                 // 模型名称
    minilmModelExists: false,       // 模型是否已存在
    minilmDownloading: false,       // 是否正在下载
    minilmPercent: 0,               // 实时进度 0-100
    minilmEventSource: null,        // 当前 SSE 实例
    mossModelExists: false,
    mossDownloading: false,
    mossDownloadSource: '',
    mossPollInterval: null,
    mossPercent: 0, // 新增：真实进度条百分比

    asrSettings: {
      enabled: false,
      engine: 'sherpa',
      selectedProvider: null,
      webSpeechLanguage: 'auto',
      vendor: "OpenAI",
      model: "",
      base_url: "",
      api_key: "",
      funasr_ws_url: "ws://127.0.0.1:10095",
      funasr_mode: "offline",
      interactionMethod: "auto",
      hotkey : "Alt",
      wakeWord: "小派",
      endWord: "结束对话",
      hotwords: "小派 80\nagent party 60\n结束对话 80",
    },
    supportedLanguages: [
      { code: 'zh-CN', name: '中文' },
      { code: 'en-US', name: 'English' },
      { code: 'ja-JP', name: '日本語' },
      { code: 'ko-KR', name: '한국어' },
      { code: 'es-ES', name: 'Español' },
      { code: 'fr-FR', name: 'Français' },
      { code: 'de-DE', name: 'Deutsch' },
      { code: 'ru-RU', name: 'Русский' },
    ],
    userInputBuffer: '',
    sidePanelOpen: false,
    sidePanelHTML: '',
    chatAreaOpen: true,        // 对话区域是否展开
    chatAreaWidth: 50,         // 对话区域宽度百分比
    sidePanelWidth: 50,        // 侧边栏宽度百分比
    isResizing: false,         // 是否正在调整大小
    isHistoryPanelResizing: false,
    minPanelWidth: 25,         // 最小面板宽度百分比
    extensions: [],              // 所有发现的扩展
    currentExtension: null,      // 当前加载的扩展
    sidePanelURL: '',            // 侧边栏中显示的扩展URL
    showExtensionsDialog: false, // 控制扩展选择对话框的显示
    showExtensionForm: false, // 控制扩展表单的显示
    newExtensionUrl: '',   // 绑定输入框
    remotePlugins: [], // 远程插件列表
    installedPlugins: [], // 本地已安装
    installLoading: false,
    refreshing: false,
    refreshButtonText: "",
    showHistorySidebar: false,
    ttsSettings: {
      enabled: false,
      engine: 'edgetts',
      separators:["。", "\n", "？", "！", "，","～","!","?",",","~"],
      maxConcurrency: 2,
      enabledInterruption: false,
      bufferWordList: [],
      SampleText: 'super agent party链接一切！',
      edgettsLanguage: 'zh-CN',
      edgettsGender: 'Female',
      edgettsVoice: 'XiaoyiNeural',
      edgettsRate: 1.0,
      gsvServer: "http://127.0.0.1:9880",
      gsvTextLang: 'zh',
      gsvRate: 1.0,
      gsvPromptLang: 'zh',
      gsvPromptText: '',
      gsvSample_steps: 4,
      gsvRefAudioPath: '',
      gsvAudioOptions: [],
      selectedProvider: null,
      vendor: "OpenAI",
      model: "",
      base_url: "",
      api_key: "",
      openaiVoice:"alloy",
      openaiStream: false,
      openaiSpeed: 1.0,
      customTTSserver: "http://127.0.0.1:9880",
      customTTSspeaker: "",
      customTTSspeed: 1.0,
      customStream: false,
      customTTSKeyText: 'text',
      customTTSKeySpeaker: 'speaker',
      customTTSKeySpeed: 'speed',
      systemVoiceName: null,
      systemRate: 200,
      // Tetos 通用音色列表缓存 (当切换引擎时刷新)
      tetosVoices: [],
      isFetchingVoices: false,

      // Azure
      azureSpeechKey: '',
      azureRegion: '',
      azureVoice: '',

      // Volcengine
      volcAppId: '',
      volcAccessKey: '',
      volcResourceId: 'seed-tts-2.0', // 默认公共资源ID
      volcVoice: 'zh_female_vv_uranus_bigtts', // 默认大模型音色
      volcRate: 1.0,

      // Baidu
      baiduApiKey: '',
      baiduSecretKey: '',
      baiduVoice: '',

      // Minimax
      minimaxApiKey: '',
      minimaxGroupId: '',
      minimaxVoice: '',

      // Xunfei
      xunfeiAppId: '',
      xunfeiApiKey: '',
      xunfeiApiSecret: '',
      xunfeiVoice: '',

      // Fish Audio
      fishApiKey: '',
      fishVoice: '',

      // Google
      googleServiceAccount: '', // JSON 字符串
      googleVoice: '',
      newtts:{},


      // elevenLabs
      elevenLabsApiKey: '',
      elevenLabsVoice: 'JBFqnCBsd6RMkjVDRZzb',
      elevenLabsModel: 'eleven_multilingual_v2',
      elevenLabsRate: 1.0,


      // moss
      mossVoice: 'Junhao',
      mossSpeed: 1.0,
    },
    volcResourceOptions: [
        { value: 'volc_tts_release', label: '旧版/标准版 (Standard)' },
        // 豆包 1.0
        { value: 'seed-tts-1.0', label: '豆包模型1.0 (字符版)' },
        { value: 'volc.service_type.10029', label: '豆包1.0 (字符版-ServiceType)' },
        { value: 'seed-tts-1.0-concurr', label: '豆包模型1.0 (并发版)' },
        { value: 'volc.service_type.10048', label: '豆包1.0 (并发版-ServiceType)' },
        // 豆包 2.0
        { value: 'seed-tts-2.0', label: '豆包模型2.0 (字符版)' },
        // 声音复刻
        { value: 'seed-icl-1.0', label: '声音复刻1.0 (字符版)' },
        { value: 'seed-icl-1.0-concurr', label: '声音复刻1.0 (并发版)' },
        { value: 'seed-icl-2.0', label: '声音复刻2.0 (字符版)' }
    ],
    activeTTSTab: 'default', // 控制 TTS 标签页切换
    showAddTTSDialog: false, // 控制添加 TTS 的对话框显示
    newTTSConfig: {
      name: '',
      enabled: false,
      SampleText: 'super agent party链接一切！',
      engine: 'edgetts',
      edgettsLanguage: 'zh-CN',
      edgettsGender: 'Female',
      edgettsVoice: 'XiaoyiNeural',
      edgettsRate: 1.0,
      gsvServer: "http://127.0.0.1:9880",
      gsvTextLang: 'zh',
      gsvRate: 1.0,
      gsvSample_steps: 4,
      gsvPromptLang: 'zh',
      gsvPromptText: '',
      gsvRefAudioPath: '',
      gsvAudioOptions: [],
      selectedProvider: null,
      vendor: "OpenAI",
      model: "",
      base_url: "",
      api_key: "",
      openaiVoice:"alloy",
      openaiSpeed: 1.0,
      customTTSserver: "http://127.0.0.1:9880",
      customTTSspeaker: "",
      customTTSspeed: 1.0,
      systemVoiceName: null,
      systemRate: 200,
      // Tetos 通用音色列表缓存 (当切换引擎时刷新)
      tetosVoices: [],
      isFetchingVoices: false,

      // Azure
      azureSpeechKey: '',
      azureRegion: '',
      azureVoice: '',

      // Volcengine
      volcAppId: '',
      volcAccessKey: '',
      volcResourceId: 'seed-tts-2.0', // 默认公共资源ID
      volcVoice: 'zh_female_vv_uranus_bigtts', // 默认大模型音色
      volcRate: 1.0,

      // Baidu
      baiduApiKey: '',
      baiduSecretKey: '',
      baiduVoice: '',

      // Minimax
      minimaxApiKey: '',
      minimaxGroupId: '',
      minimaxVoice: '',

      // Xunfei
      xunfeiAppId: '',
      xunfeiApiKey: '',
      xunfeiApiSecret: '',
      xunfeiVoice: '',

      // Fish Audio
      fishApiKey: '',
      fishVoice: '',

      // Google
      googleServiceAccount: '', // JSON 字符串
      googleVoice: '',

      mossVoice: 'Junhao',
      mossSpeed: 1.0,

      newtts:{}
    },
    cur_voice :'default',
    openaiVoices:['alloy', 'ash', 'ballad', 'coral', 'echo', 'sage', 'shimmer', 'verse'],
    showMoreButtonDialog: false,
    isAssistantMode: false,
    isCapsuleMode: false,
    isMinimalMode: false,
    isFixedWindow: false,
    MoreButtonDict: [
      {"name": "brieflyButton", "enabled": true},
      {"name": "forceScrollButton", "enabled": true},
      {"name": "expandButton", "enabled": true},
      {"name": "fileButton", "enabled": true},
      {"name": "fastResponseButton", "enabled": true},
      {"name": "reasonerButton", "enabled": true},
      {"name": "deepSearchButton", "enabled": false},
      {"name": "visionButton", "enabled": false},
      {"name": "screenshotButton", "enabled": true},
      {"name": "desktopVisionButton", "enabled": false},
      {"name": "text2imgButton", "enabled": false},
      {"name": "asrButton", "enabled": true},
      {"name": "ttsButton", "enabled": true},
      {"name": "knowledgeBaseButton", "enabled": true},
      {"name": "webSearchButton", "enabled": true},
      {"name": "memoryButton", "enabled": true},
      {"name": "uiButton", "enabled": true},
      {"name": "codeButton", "enabled": false},
      {"name": "CLIButton", "enabled": false},
      {"name": "visionControl", "enabled": false},
      {"name": "stickerButton", "enabled": false},
      {"name": "haButton", "enabled": false},
      {"name": "chromeButton", "enabled": false},
      {"name": "sqlButton", "enabled": false},
      {"name": "agentButton", "enabled": false},
      {"name": "llmButton", "enabled": false},
      {"name": "mcpButton", "enabled": true},
      {"name": "a2aButton", "enabled": false},
      {"name": "httpButton", "enabled": false},
      {"name": "comfyuiButton", "enabled": false},
      {"name": "vrmButton", "enabled": true},
      {"name": "thaButton", "enabled": true},
      {"name": "behaviorBotton", "enabled": false},
      {"name": "groupChatBotton", "enabled": true},
    ],
    largeMoreButtonDict:[
      {"name": "brieflyButton", "enabled": true},
      {"name": "forceScrollButton", "enabled": true},
      {"name": "expandButton", "enabled": true},
      {"name": "fileButton", "enabled": true},
      {"name": "fastResponseButton", "enabled": true},
      {"name": "reasonerButton", "enabled": true},
      {"name": "deepSearchButton", "enabled": false},
      {"name": "visionButton", "enabled": false},
      {"name": "desktopVisionButton", "enabled": false},
      {"name": "screenshotButton", "enabled": true},
      {"name": "text2imgButton", "enabled": false},
      {"name": "asrButton", "enabled": true},
      {"name": "ttsButton", "enabled": true},
      {"name": "knowledgeBaseButton", "enabled": true},
      {"name": "webSearchButton", "enabled": true},
      {"name": "memoryButton", "enabled": true},
      {"name": "uiButton", "enabled": true},
      {"name": "codeButton", "enabled": false},
      {"name": "CLIButton", "enabled": false},
      {"name": "visionControl", "enabled": false},
      {"name": "stickerButton", "enabled": false},
      {"name": "haButton", "enabled": false},
      {"name": "chromeButton", "enabled": false},
      {"name": "sqlButton", "enabled": false},
      {"name": "agentButton", "enabled": false},
      {"name": "llmButton", "enabled": false},
      {"name": "mcpButton", "enabled": true},
      {"name": "a2aButton", "enabled": false},
      {"name": "httpButton", "enabled": false},
      {"name": "comfyuiButton", "enabled": false},
      {"name": "vrmButton", "enabled": true},
      {"name": "thaButton", "enabled": true},
      {"name": "behaviorBotton", "enabled": false},
      {"name": "groupChatBotton", "enabled": true},
    ],
    smallMoreButtonDict:[
      {"name": "brieflyButton", "enabled": false},
      {"name": "forceScrollButton", "enabled": false},
      {"name": "expandButton", "enabled": false},
      {"name": "fileButton", "enabled": false},
      {"name": "fastResponseButton", "enabled": false},
      {"name": "reasonerButton", "enabled": false},
      {"name": "deepSearchButton", "enabled": false},
      {"name": "visionButton", "enabled": false},
      {"name": "desktopVisionButton", "enabled": true},
      {"name": "screenshotButton", "enabled": true},
      {"name": "text2imgButton", "enabled": false},
      {"name": "asrButton", "enabled": false},
      {"name": "ttsButton", "enabled": false},
      {"name": "knowledgeBaseButton", "enabled": false},
      {"name": "webSearchButton", "enabled": false},
      {"name": "memoryButton", "enabled": false},
      {"name": "uiButton", "enabled": false},
      {"name": "codeButton", "enabled": false},
      {"name": "CLIButton", "enabled": false},
      {"name": "visionControl", "enabled": false},
      {"name": "stickerButton", "enabled": false},
      {"name": "haButton", "enabled": false},
      {"name": "chromeButton", "enabled": false},
      {"name": "sqlButton", "enabled": false},
      {"name": "agentButton", "enabled": false},
      {"name": "llmButton", "enabled": false},
      {"name": "mcpButton", "enabled": false},
      {"name": "a2aButton", "enabled": false},
      {"name": "httpButton", "enabled": false},
      {"name": "comfyuiButton", "enabled": false},
      {"name": "vrmButton", "enabled": true},
      {"name": "thaButton", "enabled": true},
      {"name": "behaviorBotton", "enabled": false},
      {"name": "groupChatBotton", "enabled": false},
    ],
    showVrmModelDialog: false,
    vrmOnline: false,   // 新增
    vrmPollTimer: null, // 新增
    newVrmModel: {
      name: '',
      displayName: '',
      file: null
    },
    showGaussSceneDialog: false, // GAUSS
    newGaussScene: { name: '', displayName: '' }, // GAUSS
    VRMConfig: {
      name: 'default',
      enabledExpressions: false,
      enabledMotions: false,
      selectedModelId: 'alice', // 默认选择Alice模型
      windowWidth: 540,
      windowHeight: 960,
      defaultModels: [], // 存储默认模型
      userModels: [],     // 存储用户上传的模型
      defaultMotions: [], // 存储默认动作
      userMotions: [],     // 存储用户上传的动作
      selectedMotionIds: [],
      selectedNewModelId: 'alice',
      selectedNewMotionIds: [],
      newVRM:{},
      gaussDefaultScenes: [],   // GAUSS
      gaussUserScenes: [],      // GAUSS
      selectedGaussSceneId: '',
    },
    THAConfig: {
      name: 'default',
      enabledEmotions: false,
      enabledFineControl: false,
      enabledMouthSync: false,
      srMode: 'cnnx2vl',
      selectedModelId: 'Lyra',
      windowWidth: 540,
      windowHeight: 540,
      defaultModels: [],
      userModels: []
    },
    showThaModelDialog: false,
    newThaModel: {
      file: null,
      name: '',
      displayName: ''
    },
    newAppearanceConfig: {
      name: '',
      windowWidth: 540,
      windowHeight: 960,
      selectedModelId: 'alice', // 默认选择Alice模型
      selectedMotionIds: [],
    },
    showAddAppearanceDialog: false,
    showVrmaMotionDialog: false,
    showFileDialog: false,
    newVrmaMotion: {
      name: '',
      displayName: '',
      file: null
    },
    expressionMap : [
      '<happy>', 
      '<angry>', 
      '<sad>',
      '<neutral>',
      '<surprised>', 
      '<relaxed>'],
    newGsvAudio: {
      name: '',
      path: '',
      text: '',
    },
    startTime: null,
    elapsedTime: 0,
    gsvTextLangs:["zh", "en" , "yue","ja","ko","auto","auto_yue"],
    audioPlayQueue: [],
    currentAudio: null,
    edgettsLanguage: 'zh-CN',
    edgettsGender: 'Female',
    edgettsvoices: [
    { language: "af-ZA", gender: "Female", name: "AdriNeural" },
    { language: "af-ZA", gender: "Male", name: "WillemNeural" },
    { language: "am-ET", gender: "Male", name: "AmehaNeural" },
    { language: "am-ET", gender: "Female", name: "MekdesNeural" },
    { language: "ar-AE", gender: "Female", name: "FatimaNeural" },
    { language: "ar-AE", gender: "Male", name: "HamdanNeural" },
    { language: "ar-BH", gender: "Male", name: "AliNeural" },
    { language: "ar-BH", gender: "Female", name: "LailaNeural" },
    { language: "ar-DZ", gender: "Female", name: "AminaNeural" },
    { language: "ar-DZ", gender: "Male", name: "IsmaelNeural" },
    { language: "ar-EG", gender: "Female", name: "SalmaNeural" },
    { language: "ar-EG", gender: "Male", name: "ShakirNeural" },
    { language: "ar-IQ", gender: "Male", name: "BasselNeural" },
    { language: "ar-IQ", gender: "Female", name: "RanaNeural" },
    { language: "ar-JO", gender: "Female", name: "SanaNeural" },
    { language: "ar-JO", gender: "Male", name: "TaimNeural" },
    { language: "ar-KW", gender: "Male", name: "FahedNeural" },
    { language: "ar-KW", gender: "Female", name: "NouraNeural" },
    { language: "ar-LB", gender: "Female", name: "LaylaNeural" },
    { language: "ar-LB", gender: "Male", name: "RamiNeural" },
    { language: "ar-LY", gender: "Female", name: "ImanNeural" },
    { language: "ar-LY", gender: "Male", name: "OmarNeural" },
    { language: "ar-MA", gender: "Male", name: "JamalNeural" },
    { language: "ar-MA", gender: "Female", name: "MounaNeural" },
    { language: "ar-OM", gender: "Male", name: "AbdullahNeural" },
    { language: "ar-OM", gender: "Female", name: "AyshaNeural" },
    { language: "ar-QA", gender: "Female", name: "AmalNeural" },
    { language: "ar-QA", gender: "Male", name: "MoazNeural" },
    { language: "ar-SA", gender: "Male", name: "HamedNeural" },
    { language: "ar-SA", gender: "Female", name: "ZariyahNeural" },
    { language: "ar-SY", gender: "Female", name: "AmanyNeural" },
    { language: "ar-SY", gender: "Male", name: "LaithNeural" },
    { language: "ar-TN", gender: "Male", name: "HediNeural" },
    { language: "ar-TN", gender: "Female", name: "ReemNeural" },
    { language: "ar-YE", gender: "Female", name: "MaryamNeural" },
    { language: "ar-YE", gender: "Male", name: "SalehNeural" },
    { language: "az-AZ", gender: "Male", name: "BabekNeural" },
    { language: "az-AZ", gender: "Female", name: "BanuNeural" },
    { language: "bg-BG", gender: "Male", name: "BorislavNeural" },
    { language: "bg-BG", gender: "Female", name: "KalinaNeural" },
    { language: "bn-BD", gender: "Female", name: "NabanitaNeural" },
    { language: "bn-BD", gender: "Male", name: "PradeepNeural" },
    { language: "bn-IN", gender: "Male", name: "BashkarNeural" },
    { language: "bn-IN", gender: "Female", name: "TanishaaNeural" },
    { language: "bs-BA", gender: "Male", name: "GoranNeural" },
    { language: "bs-BA", gender: "Female", name: "VesnaNeural" },
    { language: "ca-ES", gender: "Male", name: "EnricNeural" },
    { language: "ca-ES", gender: "Female", name: "JoanaNeural" },
    { language: "cs-CZ", gender: "Male", name: "AntoninNeural" },
    { language: "cs-CZ", gender: "Female", name: "VlastaNeural" },
    { language: "cy-GB", gender: "Male", name: "AledNeural" },
    { language: "cy-GB", gender: "Female", name: "NiaNeural" },
    { language: "da-DK", gender: "Female", name: "ChristelNeural" },
    { language: "da-DK", gender: "Male", name: "JeppeNeural" },
    { language: "de-AT", gender: "Female", name: "IngridNeural" },
    { language: "de-AT", gender: "Male", name: "JonasNeural" },
    { language: "de-CH", gender: "Male", name: "JanNeural" },
    { language: "de-CH", gender: "Female", name: "LeniNeural" },
    { language: "de-DE", gender: "Female", name: "AmalaNeural" },
    { language: "de-DE", gender: "Male", name: "ConradNeural" },
    { language: "de-DE", gender: "Male", name: "FlorianMultilingualNeural" },
    { language: "de-DE", gender: "Female", name: "KatjaNeural" },
    { language: "de-DE", gender: "Male", name: "KillianNeural" },
    { language: "de-DE", gender: "Female", name: "SeraphinaMultilingualNeural" },
    { language: "el-GR", gender: "Female", name: "AthinaNeural" },
    { language: "el-GR", gender: "Male", name: "NestorasNeural" },
    { language: "en-AU", gender: "Female", name: "NatashaNeural" },
    { language: "en-AU", gender: "Male", name: "WilliamNeural" },
    { language: "en-CA", gender: "Female", name: "ClaraNeural" },
    { language: "en-CA", gender: "Male", name: "LiamNeural" },
    { language: "en-GB", gender: "Female", name: "LibbyNeural" },
    { language: "en-GB", gender: "Female", name: "MaisieNeural" },
    { language: "en-GB", gender: "Male", name: "RyanNeural" },
    { language: "en-GB", gender: "Female", name: "SoniaNeural" },
    { language: "en-GB", gender: "Male", name: "ThomasNeural" },
    { language: "en-HK", gender: "Male", name: "SamNeural" },
    { language: "en-HK", gender: "Female", name: "YanNeural" },
    { language: "en-IE", gender: "Male", name: "ConnorNeural" },
    { language: "en-IE", gender: "Female", name: "EmilyNeural" },
    { language: "en-IN", gender: "Female", name: "NeerjaExpressiveNeural" },
    { language: "en-IN", gender: "Female", name: "NeerjaNeural" },
    { language: "en-IN", gender: "Male", name: "PrabhatNeural" },
    { language: "en-KE", gender: "Female", name: "AsiliaNeural" },
    { language: "en-KE", gender: "Male", name: "ChilembaNeural" },
    { language: "en-NG", gender: "Male", name: "AbeoNeural" },
    { language: "en-NG", gender: "Female", name: "EzinneNeural" },
    { language: "en-NZ", gender: "Male", name: "MitchellNeural" },
    { language: "en-NZ", gender: "Female", name: "MollyNeural" },
    { language: "en-PH", gender: "Male", name: "JamesNeural" },
    { language: "en-PH", gender: "Female", name: "RosaNeural" },
    { language: "en-SG", gender: "Female", name: "LunaNeural" },
    { language: "en-SG", gender: "Male", name: "WayneNeural" },
    { language: "en-TZ", gender: "Male", name: "ElimuNeural" },
    { language: "en-TZ", gender: "Female", name: "ImaniNeural" },
    { language: "en-US", gender: "Female", name: "AnaNeural" },
    { language: "en-US", gender: "Male", name: "AndrewMultilingualNeural" },
    { language: "en-US", gender: "Male", name: "AndrewNeural" },
    { language: "en-US", gender: "Female", name: "AriaNeural" },
    { language: "en-US", gender: "Female", name: "AvaMultilingualNeural" },
    { language: "en-US", gender: "Female", name: "AvaNeural" },
    { language: "en-US", gender: "Male", name: "BrianMultilingualNeural" },
    { language: "en-US", gender: "Male", name: "BrianNeural" },
    { language: "en-US", gender: "Male", name: "ChristopherNeural" },
    { language: "en-US", gender: "Female", name: "EmmaMultilingualNeural" },
    { language: "en-US", gender: "Female", name: "EmmaNeural" },
    { language: "en-US", gender: "Male", name: "EricNeural" },
    { language: "en-US", gender: "Male", name: "GuyNeural" },
    { language: "en-US", gender: "Female", name: "JennyNeural" },
    { language: "en-US", gender: "Female", name: "MichelleNeural" },
    { language: "en-US", gender: "Male", name: "RogerNeural" },
    { language: "en-US", gender: "Male", name: "SteffanNeural" },
    { language: "en-ZA", gender: "Female", name: "LeahNeural" },
    { language: "en-ZA", gender: "Male", name: "LukeNeural" },
    { language: "es-AR", gender: "Female", name: "ElenaNeural" },
    { language: "es-AR", gender: "Male", name: "TomasNeural" },
    { language: "es-BO", gender: "Male", name: "MarceloNeural" },
    { language: "es-BO", gender: "Female", name: "SofiaNeural" },
    { language: "es-CL", gender: "Female", name: "CatalinaNeural" },
    { language: "es-CL", gender: "Male", name: "LorenzoNeural" },
    { language: "es-CO", gender: "Male", name: "GonzaloNeural" },
    { language: "es-CO", gender: "Female", name: "SalomeNeural" },
    { language: "es-CR", gender: "Male", name: "JuanNeural" },
    { language: "es-CR", gender: "Female", name: "MariaNeural" },
    { language: "es-CU", gender: "Female", name: "BelkysNeural" },
    { language: "es-CU", gender: "Male", name: "ManuelNeural" },
    { language: "es-DO", gender: "Male", name: "EmilioNeural" },
    { language: "es-DO", gender: "Female", name: "RamonaNeural" },
    { language: "es-EC", gender: "Female", name: "AndreaNeural" },
    { language: "es-EC", gender: "Male", name: "LuisNeural" },
    { language: "es-ES", gender: "Male", name: "AlvaroNeural" },
    { language: "es-ES", gender: "Female", name: "ElviraNeural" },
    { language: "es-ES", gender: "Female", name: "XimenaNeural" },
    { language: "es-GQ", gender: "Male", name: "JavierNeural" },
    { language: "es-GQ", gender: "Female", name: "TeresaNeural" },
    { language: "es-GT", gender: "Male", name: "AndresNeural" },
    { language: "es-GT", gender: "Female", name: "MartaNeural" },
    { language: "es-HN", gender: "Male", name: "CarlosNeural" },
    { language: "es-HN", gender: "Female", name: "KarlaNeural" },
    { language: "es-MX", gender: "Female", name: "DaliaNeural" },
    { language: "es-MX", gender: "Male", name: "JorgeNeural" },
    { language: "es-NI", gender: "Male", name: "FedericoNeural" },
    { language: "es-NI", gender: "Female", name: "YolandaNeural" },
    { language: "es-PA", gender: "Female", name: "MargaritaNeural" },
    { language: "es-PA", gender: "Male", name: "RobertoNeural" },
    { language: "es-PE", gender: "Male", name: "AlexNeural" },
    { language: "es-PE", gender: "Female", name: "CamilaNeural" },
    { language: "es-PR", gender: "Female", name: "KarinaNeural" },
    { language: "es-PR", gender: "Male", name: "VictorNeural" },
    { language: "es-PY", gender: "Male", name: "MarioNeural" },
    { language: "es-PY", gender: "Female", name: "TaniaNeural" },
    { language: "es-SV", gender: "Female", name: "LorenaNeural" },
    { language: "es-SV", gender: "Male", name: "RodrigoNeural" },
    { language: "es-US", gender: "Male", name: "AlonsoNeural" },
    { language: "es-US", gender: "Female", name: "PalomaNeural" },
    { language: "es-UY", gender: "Male", name: "MateoNeural" },
    { language: "es-UY", gender: "Female", name: "ValentinaNeural" },
    { language: "es-VE", gender: "Female", name: "PaolaNeural" },
    { language: "es-VE", gender: "Male", name: "SebastianNeural" },
    { language: "et-EE", gender: "Female", name: "AnuNeural" },
    { language: "et-EE", gender: "Male", name: "KertNeural" },
    { language: "fa-IR", gender: "Female", name: "DilaraNeural" },
    { language: "fa-IR", gender: "Male", name: "FaridNeural" },
    { language: "fi-FI", gender: "Male", name: "HarriNeural" },
    { language: "fi-FI", gender: "Female", name: "NooraNeural" },
    { language: "fil-PH", gender: "Male", name: "AngeloNeural" },
    { language: "fil-PH", gender: "Female", name: "BlessicaNeural" },
    { language: "fr-BE", gender: "Female", name: "CharlineNeural" },
    { language: "fr-BE", gender: "Male", name: "GerardNeural" },
    { language: "fr-CA", gender: "Male", name: "AntoineNeural" },
    { language: "fr-CA", gender: "Male", name: "JeanNeural" },
    { language: "fr-CA", gender: "Female", name: "SylvieNeural" },
    { language: "fr-CA", gender: "Male", name: "ThierryNeural" },
    { language: "fr-CH", gender: "Female", name: "ArianeNeural" },
    { language: "fr-CH", gender: "Male", name: "FabriceNeural" },
    { language: "fr-FR", gender: "Female", name: "DeniseNeural" },
    { language: "fr-FR", gender: "Female", name: "EloiseNeural" },
    { language: "fr-FR", gender: "Male", name: "HenriNeural" },
    { language: "fr-FR", gender: "Male", name: "RemyMultilingualNeural" },
    { language: "fr-FR", gender: "Female", name: "VivienneMultilingualNeural" },
    { language: "ga-IE", gender: "Male", name: "ColmNeural" },
    { language: "ga-IE", gender: "Female", name: "OrlaNeural" },
    { language: "gl-ES", gender: "Male", name: "RoiNeural" },
    { language: "gl-ES", gender: "Female", name: "SabelaNeural" },
    { language: "gu-IN", gender: "Female", name: "DhwaniNeural" },
    { language: "gu-IN", gender: "Male", name: "NiranjanNeural" },
    { language: "he-IL", gender: "Male", name: "AvriNeural" },
    { language: "he-IL", gender: "Female", name: "HilaNeural" },
    { language: "hi-IN", gender: "Male", name: "MadhurNeural" },
    { language: "hi-IN", gender: "Female", name: "SwaraNeural" },
    { language: "hr-HR", gender: "Female", name: "GabrijelaNeural" },
    { language: "hr-HR", gender: "Male", name: "SreckoNeural" },
    { language: "hu-HU", gender: "Female", name: "NoemiNeural" },
    { language: "hu-HU", gender: "Male", name: "TamasNeural" },
    { language: "id-ID", gender: "Male", name: "ArdiNeural" },
    { language: "id-ID", gender: "Female", name: "GadisNeural" },
    { language: "is-IS", gender: "Female", name: "GudrunNeural" },
    { language: "is-IS", gender: "Male", name: "GunnarNeural" },
    { language: "it-IT", gender: "Male", name: "DiegoNeural" },
    { language: "it-IT", gender: "Female", name: "ElsaNeural" },
    { language: "it-IT", gender: "Male", name: "GiuseppeMultilingualNeural" },
    { language: "it-IT", gender: "Female", name: "IsabellaNeural" },
    { language: "iu-Cans-CA", gender: "Female", name: "SiqiniqNeural" },
    { language: "iu-Cans-CA", gender: "Male", name: "TaqqiqNeural" },
    { language: "iu-Latn-CA", gender: "Female", name: "SiqiniqNeural" },
    { language: "iu-Latn-CA", gender: "Male", name: "TaqqiqNeural" },
    { language: "ja-JP", gender: "Male", name: "KeitaNeural" },
    { language: "ja-JP", gender: "Female", name: "NanamiNeural" },
    { language: "jv-ID", gender: "Male", name: "DimasNeural" },
    { language: "jv-ID", gender: "Female", name: "SitiNeural" },
    { language: "ka-GE", gender: "Female", name: "EkaNeural" },
    { language: "ka-GE", gender: "Male", name: "GiorgiNeural" },
    { language: "kk-KZ", gender: "Female", name: "AigulNeural" },
    { language: "kk-KZ", gender: "Male", name: "DauletNeural" },
    { language: "km-KH", gender: "Male", name: "PisethNeural" },
    { language: "km-KH", gender: "Female", name: "SreymomNeural" },
    { language: "kn-IN", gender: "Male", name: "GaganNeural" },
    { language: "kn-IN", gender: "Female", name: "SapnaNeural" },
    { language: "ko-KR", gender: "Male", name: "HyunsuMultilingualNeural" },
    { language: "ko-KR", gender: "Male", name: "InJoonNeural" },
    { language: "ko-KR", gender: "Female", name: "SunHiNeural" },
    { language: "lo-LA", gender: "Male", name: "ChanthavongNeural" },
    { language: "lo-LA", gender: "Female", name: "KeomanyNeural" },
    { language: "lt-LT", gender: "Male", name: "LeonasNeural" },
    { language: "lt-LT", gender: "Female", name: "OnaNeural" },
    { language: "lv-LV", gender: "Female", name: "EveritaNeural" },
    { language: "lv-LV", gender: "Male", name: "NilsNeural" },
    { language: "mk-MK", gender: "Male", name: "AleksandarNeural" },
    { language: "mk-MK", gender: "Female", name: "MarijaNeural" },
    { language: "ml-IN", gender: "Male", name: "MidhunNeural" },
    { language: "ml-IN", gender: "Female", name: "SobhanaNeural" },
    { language: "mn-MN", gender: "Male", name: "BataaNeural" },
    { language: "mn-MN", gender: "Female", name: "YesuiNeural" },
    { language: "mr-IN", gender: "Female", name: "AarohiNeural" },
    { language: "mr-IN", gender: "Male", name: "ManoharNeural" },
    { language: "ms-MY", gender: "Male", name: "OsmanNeural" },
    { language: "ms-MY", gender: "Female", name: "YasminNeural" },
    { language: "mt-MT", gender: "Female", name: "GraceNeural" },
    { language: "mt-MT", gender: "Male", name: "JosephNeural" },
    { language: "my-MM", gender: "Female", name: "NilarNeural" },
    { language: "my-MM", gender: "Male", name: "ThihaNeural" },
    { language: "nb-NO", gender: "Male", name: "FinnNeural" },
    { language: "nb-NO", gender: "Female", name: "PernilleNeural" },
    { language: "ne-NP", gender: "Female", name: "HemkalaNeural" },
    { language: "ne-NP", gender: "Male", name: "SagarNeural" },
    { language: "nl-BE", gender: "Male", name: "ArnaudNeural" },
    { language: "nl-BE", gender: "Female", name: "DenaNeural" },
    { language: "nl-NL", gender: "Female", name: "ColetteNeural" },
    { language: "nl-NL", gender: "Female", name: "FennaNeural" },
    { language: "nl-NL", gender: "Male", name: "MaartenNeural" },
    { language: "pl-PL", gender: "Male", name: "MarekNeural" },
    { language: "pl-PL", gender: "Female", name: "ZofiaNeural" },
    { language: "ps-AF", gender: "Male", name: "GulNawazNeural" },
    { language: "ps-AF", gender: "Female", name: "LatifaNeural" },
    { language: "pt-BR", gender: "Male", name: "AntonioNeural" },
    { language: "pt-BR", gender: "Female", name: "FranciscaNeural" },
    { language: "pt-BR", gender: "Female", name: "ThalitaMultilingualNeural" },
    { language: "pt-PT", gender: "Male", name: "DuarteNeural" },
    { language: "pt-PT", gender: "Female", name: "RaquelNeural" },
    { language: "ro-RO", gender: "Female", name: "AlinaNeural" },
    { language: "ro-RO", gender: "Male", name: "EmilNeural" },
    { language: "ru-RU", gender: "Male", name: "DmitryNeural" },
    { language: "ru-RU", gender: "Female", name: "SvetlanaNeural" },
    { language: "si-LK", gender: "Male", name: "SameeraNeural" },
    { language: "si-LK", gender: "Female", name: "ThiliniNeural" },
    { language: "sk-SK", gender: "Male", name: "LukasNeural" },
    { language: "sk-SK", gender: "Female", name: "ViktoriaNeural" },
    { language: "sl-SI", gender: "Female", name: "PetraNeural" },
    { language: "sl-SI", gender: "Male", name: "RokNeural" },
    { language: "so-SO", gender: "Male", name: "MuuseNeural" },
    { language: "so-SO", gender: "Female", name: "UbaxNeural" },
    { language: "sq-AL", gender: "Female", name: "AnilaNeural" },
    { language: "sq-AL", gender: "Male", name: "IlirNeural" },
    { language: "sr-RS", gender: "Male", name: "NicholasNeural" },
    { language: "sr-RS", gender: "Female", name: "SophieNeural" },
    { language: "su-ID", gender: "Male", name: "JajangNeural" },
    { language: "su-ID", gender: "Female", name: "TutiNeural" },
    { language: "sv-SE", gender: "Male", name: "MattiasNeural" },
    { language: "sv-SE", gender: "Female", name: "SofieNeural" },
    { language: "sw-KE", gender: "Male", name: "RafikiNeural" },
    { language: "sw-KE", gender: "Female", name: "ZuriNeural" },
    { language: "sw-TZ", gender: "Male", name: "DaudiNeural" },
    { language: "sw-TZ", gender: "Female", name: "RehemaNeural" },
    { language: "ta-IN", gender: "Female", name: "PallaviNeural" },
    { language: "ta-IN", gender: "Male", name: "ValluvarNeural" },
    { language: "ta-LK", gender: "Male", name: "KumarNeural" },
    { language: "ta-LK", gender: "Female", name: "SaranyaNeural" },
    { language: "ta-MY", gender: "Female", name: "KaniNeural" },
    { language: "ta-MY", gender: "Male", name: "SuryaNeural" },
    { language: "ta-SG", gender: "Male", name: "AnbuNeural" },
    { language: "ta-SG", gender: "Female", name: "VenbaNeural" },
    { language: "te-IN", gender: "Male", name: "MohanNeural" },
    { language: "te-IN", gender: "Female", name: "ShrutiNeural" },
    { language: "th-TH", gender: "Male", name: "NiwatNeural" },
    { language: "th-TH", gender: "Female", name: "PremwadeeNeural" },
    { language: "tr-TR", gender: "Male", name: "AhmetNeural" },
    { language: "tr-TR", gender: "Female", name: "EmelNeural" },
    { language: "uk-UA", gender: "Male", name: "OstapNeural" },
    { language: "uk-UA", gender: "Female", name: "PolinaNeural" },
    { language: "ur-IN", gender: "Female", name: "GulNeural" },
    { language: "ur-IN", gender: "Male", name: "SalmanNeural" },
    { language: "ur-PK", gender: "Male", name: "AsadNeural" },
    { language: "ur-PK", gender: "Female", name: "UzmaNeural" },
    { language: "uz-UZ", gender: "Female", name: "MadinaNeural" },
    { language: "uz-UZ", gender: "Male", name: "SardorNeural" },
    { language: "vi-VN", gender: "Female", name: "HoaiMyNeural" },
    { language: "vi-VN", gender: "Male", name: "NamMinhNeural" },
    { language: "zh-CN", gender: "Female", name: "XiaoxiaoNeural" },
    { language: "zh-CN", gender: "Female", name: "XiaoyiNeural" },
    { language: "zh-CN", gender: "Male", name: "YunjianNeural" },
    { language: "zh-CN", gender: "Male", name: "YunxiNeural" },
    { language: "zh-CN", gender: "Male", name: "YunxiaNeural" },
    { language: "zh-CN", gender: "Male", name: "YunyangNeural" },
    { language: "zh-CN-liaoning", gender: "Female", name: "XiaobeiNeural" },
    { language: "zh-CN-shaanxi", gender: "Female", name: "XiaoniNeural" },
    { language: "zh-HK", gender: "Female", name: "HiuGaaiNeural" },
    { language: "zh-HK", gender: "Female", name: "HiuMaanNeural" },
    { language: "zh-HK", gender: "Male", name: "WanLungNeural" },
    { language: "zh-TW", gender: "Female", name: "HsiaoChenNeural" },
    { language: "zh-TW", gender: "Female", name: "HsiaoYuNeural" },
    { language: "zh-TW", gender: "Male", name: "YunJheNeural" },
    { language: "zu-ZA", gender: "Female", name: "ThandoNeural" },
    { language: "zu-ZA", gender: "Male", name: "ThembaNeural" }
],
    roleTiles:[
        { id: 'memory', title: 'CharacterMemory', icon: 'fa-solid fa-brain' },
        // { id: 'mind', title: 'CharacterMind', icon: 'fa-solid fa-heart' },
        { id: 'sticker', title: 'sticker/image', icon: 'fa-solid fa-face-smile' },
        { id: 'affection', title: 'affectionSystem', icon: 'fa-solid fa-heart' },
        { id: 'diary', title: 'DiarySystem', icon: 'fa-solid fa-book' },
        { id: 'vision', title: 'CharacterVision', icon: 'fa-solid fa-eye'},
        { id: 'behavior', title: 'CharacterBehavior', icon: 'fa-solid fa-person-running' },
        { id: 'voice', title: 'CharacterVoice', icon: 'fa-solid fa-volume-high' },
        { id: 'appearance', title: 'CharacterAppearance', icon: 'fa-solid fa-person' },
    ],
    modelTiles: [
      { id: 'service', title: 'modelService', icon: 'fa-solid fa-cloud' },
      { id: 'main', title: 'mainModel', icon: 'fa-solid fa-microchip' },
      { id: 'fast', title: 'fastModel', icon: 'fa-solid fa-gauge-high' },
      { id: 'reasoner', title: 'reasonerModel', icon: 'fa-solid fa-atom' },
      { id: 'vision', title: 'visionModel' , icon: 'fa-solid fa-camera'},
      { id: 'text2img', title: 'imgModel', icon: 'fa-solid fa-pencil' },
      { id: 'asr', title: 'asrModel', icon: 'fa-solid fa-microphone' },
      { id: 'tts', title: 'ttsModel', icon: 'fa-solid fa-volume-high' },
    ],
    toolkitTiles: [
      { id: 'tools', title: 'utilityTools', icon: 'fa-solid fa-screwdriver-wrench' },
      { id: 'websearch', title: 'webSearch', icon: 'fa-solid fa-globe' },
      { id: 'document', title: 'knowledgeBase', icon: 'fa-solid fa-book' },
        { id: 'interpreter', title: 'interpreter', icon: 'fa-solid fa-code'},
      { id: 'CLI', title: 'CLItool', icon: 'fa-solid fa-computer'},
      { id: 'visionControl', title: 'visionControl', icon: 'fa-solid fa-arrow-pointer'},
      { id: 'HA', title: 'homeAssistant', icon: 'fa-solid fa-house'},
      { id: 'chromeMCP', title: 'browserControl', icon: 'fa-solid fa-compass' },
      { id: 'sql', title: 'sqlControl', icon: 'fa-solid fa-database' },
      { id: 'comfyui', title: 'ComfyUI', icon: 'fa-solid fa-palette'},
      { id: 'mcp', title: 'mcpServers', icon: 'fa-solid fa-server'},
      { id: 'a2a', title: 'a2aServers', icon: 'fa-solid fa-plug'},
      { id: 'llmTool', title: 'llmTools', icon: 'fa-solid fa-network-wired'},
      { id: 'customHttpTool', title: 'customHttpTool', icon: 'fa-solid fa-wifi'},
    ],
    apiTiles: [
      { id: 'openai', title: 'openaiStyleAPI', icon: 'fa-solid fa-link' },
      { id: 'mcp', title: 'MCPStyleAPI', icon: 'fa-solid fa-server' },
      { id: 'agents', title: 'agentSnapshot', icon: 'fa-solid fa-robot'},
      { id: 'docker', title: 'docker', icon: 'fa-solid fa-box'},
      { id: 'browser', title: 'browserMode', icon: 'fa-solid fa-globe' },
      { id: 'develop', title: 'development', icon: 'fa-solid fa-code' },
      { id: 'extension', title: 'extension', icon: 'fa-solid fa-puzzle-piece' },
      { id: 'fastapi', title: 'fastAPIDocs', icon: 'fa-solid fa-book' },
    ],
    storageTiles: [
      { id: 'text', icon: 'fa-solid fa-file-lines', title: 'storageText' },
      { id: 'image', icon: 'fa-solid fa-image', title: 'storageImage' },
      { id: 'video', icon: 'fa-solid fa-video', title: 'storageVideo' }
    ],
    systemTiles: [
      { id: 'general', icon: 'fa-solid fa-gear', title: 'generalSettings' },
      { id: 'appearance', icon: 'fa-solid fa-palette', title: 'appearanceSettings' },
      { id: 'shortcuts', icon: 'fa-solid fa-terminal', title: 'shortcutSettings' },
    ],
    showShortcutHelp: false,
    shortcutMenuOpen: false,
    shortcutMenuIndex: 0,
    shortcutCommands: [
      { id: 'help', syntax: '/help', aliases: ['/帮助', '/?'], scope: 'both', descKey: 'cmd_help_desc' },
      { id: 'new', syntax: '/new', aliases: ['/reset', '/重启', '/新建'], scope: 'both', descKey: 'cmd_new_desc' },
      { id: 'stop', syntax: '/stop', aliases: ['/停止'], scope: 'both', descKey: 'cmd_stop_desc' },
      { id: 'retry', syntax: '/retry', aliases: ['/重试'], scope: 'web', descKey: 'cmd_retry_desc' },
      { id: 'model', syntax: '/model', aliases: ['/模型'], scope: 'both', descKey: 'cmd_model_desc' },
      { id: 'personality', syntax: '/personality', aliases: ['/角色'], scope: 'both', descKey: 'cmd_personality_desc' },
      { id: 'skills', syntax: '/skills', aliases: ['/技能'], scope: 'both', descKey: 'cmd_skills_desc' },
      { id: 'id', syntax: '/id', aliases: [], scope: 'im', descKey: 'cmd_id_desc' },
      { id: 'sub', syntax: '/sub', aliases: ['/订阅'], scope: 'im', descKey: 'cmd_sub_desc' },
      { id: 'unsub', syntax: '/unsub', aliases: ['/取消订阅'], scope: 'im', descKey: 'cmd_unsub_desc' },
      { id: 'mode_plan', syntax: '/plan', aliases: ['/计划'], scope: 'both', requiresCli: true, descKey: 'cmd_plan_desc' },
      { id: 'mode_read', syntax: '/read', aliases: ['/只读'], scope: 'both', requiresCli: true, descKey: 'cmd_read_desc' },
      { id: 'mode_edit', syntax: '/edit', aliases: ['/编辑'], scope: 'both', requiresCli: true, descKey: 'cmd_edit_desc' },
      { id: 'mode_yolo', syntax: '/yolo', aliases: [], scope: 'both', requiresCli: true, descKey: 'cmd_yolo_desc' },
      { id: 'mode_cowork', syntax: '/cowork', aliases: ['/协作'], scope: 'both', requiresCli: true, descKey: 'cmd_cowork_desc' },
      { id: 'mode_goal', syntax: '/goal', aliases: ['/目标'], scope: 'both', requiresCli: true, descKey: 'cmd_goal_desc' },
      { id: 'skill', syntax: '/<skill-name>', aliases: [], scope: 'both', requiresCli: true, descKey: 'cmd_skill_desc' },
      { id: 'memory', syntax: '#<text>', aliases: [], scope: 'both', requiresCli: true, descKey: 'cmd_memory_desc' },
      { id: 'file', syntax: '@<path>', aliases: [], scope: 'web', requiresCli: true, descKey: 'cmd_file_desc' },
    ],
    defaultSeparators: [
      // 转义字符
      { label: '\\n', value: '\n' },
      { label: '\\n\\n', value: '\n\n' },
      { label: '\\t', value: '\t' },
      { label: ' ', value: ' ' },
      // 中文标点符号
      { label: '。', value: '。' },
      { label: '...', value: '...' },
      { label: '？', value: '？' },
      { label: '！', value: '！' },
      { label: '，', value: '，' },
      { label: '；', value: ';' },
      { label: '：', value: '：' },
      { label: '～', value: '～' },
      // 英文标点符号
      { label: '~', value: '~' },
      { label: '.', value: '.' },
      { label: '…', value: '…' },
      { label: '?', value: '?' },
      { label: '!', value: '!' },
      { label: ',', value: ',' },
      { label: ';', value: ';' },
      { label: ':', value: ':' },
      { label: '"', value: '"' },
      { label: '\'', value: '\'' },
      // 其他
      { label: '*', value: '*' },
      { label: '`', value: '`' },
      { label: '·', value: '·' },
      { label: '-', value: '-' },
      { label: '—', value: '—' },
      { label: '/', value: '/' },
    ],
    behaviorSettings:{
      enabled: false,
      behaviorList:[]
    }, // 行为设置
    behaviorNameDict:{
      noInput: "noInputName",
      time: "timeName",
      cycle: "cycleName"
    },
    newBehavior:{
      enabled: false,
      trigger: {
        type: "noInput",
        time:{
          timeValue: "00:00:00", // 时间值，例如：12:00:00
          days: [] // 星期几的列表，例如：[1, 2, 3] 表示周一、周二、周三，为空表示不重复
        },
        noInput:{
          latency: 30, // 无输入时等待的秒数
        },
        cycle:{
          cycleValue: "00:00:30", // 时间值，例如：00:00:30
          repeatNumber: 1, // 周期次数，例如：3次
          isInfiniteLoop: false, // 是否无限循环
        }
      },
      action: {
        type: "prompt",
        prompt: "", // Prompt会向模型发送一条命令
        random:{
          events:[""],
          type:"random",
          orderIndex:0,
        },
      },
      platform:"chat",
    },
    allBriefly:false,
    qqBotConfig: {
      QQAgent:'super-model',
      memoryLimit: 30,
      appid: '',
      secret: '',
      separators: ["。", "\n", "？", "！"],
      reasoningVisible: false,
      quickRestart: true,
      is_sandbox: false,
    },
    feishuBotConfig: {
      FeishuAgent:'super-model',
      memoryLimit: 30,
      appid: '',
      secret: '',
      separators: ["。", "\n", "？", "！"],
      reasoningVisible: false,
      quickRestart: true,
      enableTTS: false,
      wakeWord: '',
      behaviorTargetChatIds: [], 
    },
    isFeishuBotRunning: false,
    isFeishuStarting: false,
    isFeishuStopping: false,
    isFeishuReloading: false,

    wechatBotConfig: {
      WeChatAgent: 'super-model',
      memoryLimit: 30,
      separators:["。", "\n", "？", "！"],
      reasoningVisible: false,
      quickRestart: true,
      enableTTS: false,
      wakeWord: '',
      behaviorTargetChatIds:[], 
    },
    isWechatBotRunning: false,
    isWechatStarting: false,
    isWechatStopping: false,
    isWechatReloading: false,

    showWechatQR: false,
    wechatQRCodeBase64: null,
    wechatStatusTimer: null, // 用来轮询状态的定时器

    weComBotConfig: {
      WeComAgent: 'super-model',
      memoryLimit: 30,
      bot_id: '',
      secret: '',
      reasoningVisible: false,
      quickRestart: true,
      enableTTS: false,
      wakeWord: '',
      behaviorTargetChatIds: [],
    },
    isWeComBotRunning: false,
    isWeComStarting: false,
    isWeComStopping: false,
    isWeComReloading: false,

    // 钉钉机器人状态控制
    isDingtalkStarting: false,
    isDingtalkStopping: false,
    isDingtalkReloading: false,
    isDingtalkBotRunning: false,
    
    // 钉钉配置对象 (一比一复刻飞书结构)
    dingtalkBotConfig: {
      DingtalkAgent: 'super-model',
      memoryLimit: 30,
      appKey: '',     // 钉钉专用
      appSecret: '',  // 钉钉专用
      separators: ["。", "\n", "？", "！"],
      reasoningVisible: false,
      quickRestart: true,
      enableTTS: false,
      wakeWord: '',
      behaviorTargetChatIds: [], 
    },

    telegramBotConfig: {
      TelegramAgent: 'super-model',
      memoryLimit: 20,
      separators: ['。', '\n', '？', '！'],
      reasoningVisible: false,
      quickRestart: true,
      enableTTS: false,
      bot_token: '',
      wakeWord: '',
      behaviorTargetChatIds: [],
    },
    isTelegramBotRunning: false,
    isTelegramStarting: false,
    isTelegramStopping: false,
    isTelegramReloading: false,
    discordBotConfig: {
      token: '',
      llm_model: 'super-model',
      memory_limit: 30,
      separators: ['。', '\n', '？', '！'],
      reasoning_visible: true,
      quick_restart: true,
      enable_tts: false,
      wakeWord: '',
      behaviorTargetChatIds: [],
    },
    isDiscordBotRunning: false,
    isDiscordStarting: false,
    isDiscordStopping: false,
    isDiscordReloading: false,
    isAudioSynthesizing: false, // 音频合成状态
    audioChunksCount: 0,        // 已生成的音频片段数
    totalChunksCount: 0,        // 总音频片段数
    isConvertingAudio: false,    // 音频转换状态
    isConvertStopping: false, // 新增状态
    ttsWebSocket: null,
    wsConnected: false,
    isVRMRunning: false,
    isVRMStarting: false,
    isTHAStarting: false,
    isVRMStopping: false,
    isVRMReloading: false,
    BotConfig: {
      imgHost_enabled: false,
      imgHost: 'smms',
      SMMS_api_key: '',
      EI2_base_url: '',
      EI2_api_key: '',
      gitee_repo_owner: "",
      gitee_repo_name: "",
      gitee_token: "",
      gitee_branch: "master",
      github_repo_owner: "",
      github_repo_name: "",
      github_token: "",
      github_branch: "main"
    },
    deployTiles: [
      { id: 'table_pet', title: 'tablePet', icon: "fa-solid fa-user-ninja"},
      { id: 'THA_pet', title: 'THAPet', icon: "fa-solid fa-hat-wizard"},
      { id: 'vts_config', title: 'vtsbot', icon: "fa-solid fa-child"},
      { id: 'live_stream', title: 'live_stream_bot', icon: "fa-solid fa-video"},
      { id: 'im_bot', title: 'imBot', icon: 'fa-solid fa-comment' },
      { id: 'read_bot', title: 'readBot', icon: "fa-solid fa-book-open-reader"}, 
      { id: 'translate_bot', title: 'translateBot', icon: "fa-solid fa-language"}, 
    ],
    activeImBotTab: 'qq',
    sourceText: '',
    translatedText: '',
    isTranslating: false,
    targetLangSelected: 'system',   //“系统默认”
    readConfig: {
      longText: "",
      longTextList: [],
    },
    longTextListIndex: 0,
    selectedFile: null,
    isReadStarting: false,
    isReadStopping: false,
    isReadRunning: false,
    readState: {
      ttsChunks: [],
      audioChunks: [],
      chunks_voice: [], 
      ttsQueue: new Set(),
      currentChunk: 0,
      isPlaying: false
    },
    segmentEditBuffer: '',  // 单个段落临时编辑区
    segmentVoiceEditBuffer: [],  // 单个段落临时编辑区
    activeSegmentIdx: -1,    // 当前手动编辑的段落索引
    _curAudio: null,        // 当前 Audio 实例
    isReadingOnetext: false,
    liveConfig: {
      filterMode: 'danmaku_only',
      danmakuQueueLimit: 5,
      wakeWord: '',
      bilibili_enabled: false,
      bilibili_type: 'open_live',
      bilibili_room_id: '',
      bilibili_sessdata: '',
      bilibili_ACCESS_KEY_ID: '',
      bilibili_ACCESS_KEY_SECRET: '',
      bilibili_APP_ID: '',
      bilibili_ROOM_OWNER_AUTH_CODE: '',
      youtube_enabled: false,
      youtube_vedio_id:  "",
      youtube_api_key:  "",
      twitch_enabled: false,
      twitch_channel: "",
      twitch_access_token: "",
      danmakuVoice:"default",
      enableDanmakuTTS: false,
    },
    WXBotConfig: {
      WXAgent:'super-model',
      memoryLimit: 30,
      separators: ["。", "\n", "？", "！"],
      reasoningVisible: false,
      quickRestart: true,
      nickNameList: [],
      wakeWord: '小派',
    },

    isSlackBotRunning: false,
    isSlackStarting: false,
    isSlackStopping: false,
    isSlackReloading: false,

    // Slack 配置对象
    slackBotConfig: {
      bot_token: '',      // Slack 的 xoxb token
      app_token: '',      // Slack 的 xapp token (Socket Mode)
      llm_model: 'super-model',
      memory_limit: 30,
      separators: ['。', '\n', '？', '！'],
      reasoning_visible: true,
      quick_restart: true,
      enable_tts: false,
      wakeWord: '',
      behaviorTargetChatIds: [],
    },

    danmu: [], // 弹幕列表
    bilibiliWs: null, // WebSocket连接
    danmuProcessTimer: null, // 弹幕处理定时器
    isProcessingDanmu: false, // 是否正在处理弹幕
    shouldReconnectWs :false,
    isLiveRunning: false,
    isLiveStarting: false,
    isLiveStopping: false,
    isLiveReloading: false,
    isWXStarting: false,
    isWXStopping: false,
    isWXReloading: false,
    isWXBotRunning: false,
    stickerPacks: [],
    showStickerDialog: false,
    newStickerPack: {
      name: '',
      stickers: [],
      tags: []
    },
    dialogVisible: false,
    imageUrl: '',
    uploadedStickers: [], // 格式: { uid: string, url: string, tags: string[] }
    isQQBotRunning: false, // QQ机器人状态
    isStarting: false,      // 启动中状态
    isStopping: false,      // 停止中状态
    isReloading: false,     // 重载中状态
    activeMemoryTab: 'config',
    activeBehaviorTab: 'config',
    activeMemoryTabName: 'autoUpdateSetting',
    activeMCPTab: 'config',
    activeCLITab: 'config',
    quickCreatePrompt: '',
    isGenerating: false, // 是否正在生成
    quickCreateSystemPrompt: '',
    isSystemPromptGenerating: false, // 是否正在生成
    isQuickGenerating: false, // 是否正在生成
    memories: [],
    newMemory: {
      id: null,
      name: '',
      infer: false,
      providerId: null,
      model: '',
      base_url: '',
      api_key: '',
      vendor: '',
      description: '',
      avatar: '',
      personality: '',
      mesExample: '',
      systemPrompt: '',
      firstMes: '',
      alternateGreetings: [],
      characterBook: [{ keysRaw: '', content: '' }]
    },
    firstMes: '',
    alternateGreetings: [],
    showAddMemoryDialog: false,
    showMemoryDialog: false,
    memorySettings: {
      selectedMemory: null,
      is_memory: false,
      memoryLimit: 10,
      userName:'user',
      genericSystemPrompt: '{{char}}必须使用{{user}}使用的语言与之交流，例如：当{{user}}使用中文时，你也必须尽可能地使用中文！当{{user}}使用英文时，你也必须尽可能地使用英文！包括交代旁白等文字也是同理！',
    },
    textFiles: [],
    imageFiles: [],
    videoFiles: [],
    selectedFiles: [],      // 存 unique_filename
    selectedImages: [],
    allImagesChecked: false,
    indeterminateImages: false,
    selectedVideos: [],
    allVideosChecked: false,
    indeterminateVideos: false,
    subMenu: '', // 新增子菜单状态
    isWorldviewSettingsExpanded: true,
    isRandomSettingsExpanded: true,
    isBasicCharacterExpanded: true,
    text2imgSettings: {
      enabled: false,
      engine: 'pollinations',
      pollinations_model: 'flux',
      pollinations_width: 512,
      pollinations_height: 512,
      selectedProvider: null,
      vendor: 'OpenAI',
      model: '',
      base_url: '',
      api_key: '',
      size: '1024x1024',
    },
    agentTiles: [
      { 
        id: 'agents',
        title: 'agentSnapshot',
        icon: 'fa-solid fa-robot'
      },
      {
        id: 'mcp',
        title: 'mcpServers', 
        icon: 'fa-solid fa-server'
      },
      {
        id: 'a2a',
        title: 'a2aServers',
        icon: 'fa-solid fa-plug'
      },
      {
        id: 'llmTool',
        title: 'llmTools',
        icon: 'fa-solid fa-network-wired'
      },
      {
        id: 'customHttpTool',
        title: 'customHttpTool',
        icon: 'fa-solid fa-wifi'
      },
      {
        id: 'comfyui',
        title: 'ComfyUI',
        icon: 'fa-solid fa-palette'
      },
    ],
    comfyuiServers: ['http://127.0.0.1:8188'], // 默认服务器
    comfyuiAPIkey: '',
    workflowDescription: "",
    activeComfyUIUrl: '',
    isConnecting: false,
    customHttpTools: [],  // 用于存储自定义HTTP工具的数组
    showCustomHttpToolForm: false,
    isInputExpanded: false,
    isChatInputActive: false, // 聊天输入框是否处于活跃（聚焦展开）状态，false 时仅显示 1 行并把模型/视图等 pill 折叠到发送按钮左侧
    sidebarVisible: false,
    isMobile: false,
    searchKeyword: '',
    newCustomHttpTool: {
      enabled: true,
      name: '',
      description: '',
      url: '',
      method: 'GET',
      headers: '',
      body: ''
    },
    editingCustomHttpTool: false,

    searchQuery: '', // 搜索框的值
    activeCategory: 'all', // 当前选中的分类：'all' | 'local' | 'cloud'
    
    // 定义属于本地/自建的供应商列表
    localVendors:[
      'llama.cpp','Ollama', 'Vllm', 'LMstudio','SGLang', 'xinference', 
      'LocalAI', 'ttswebui', 'Dify', 'newapi'
    ],

    // 供应商推荐参数（从 vendor_params.js 加载，供 UI 建议使用）
    vendorSuggestedParams: window.vendorSuggestedParams || {},
    vendorValues: [
      'custom','customAnthropic', 'OpenAI','Anthropic', 'Gemini','Grok',
      'llama.cpp', 'Ollama','Vllm','LMstudio','SGLang','xinference','Dify','newapi',
      'LocalAI','ttswebui', 'Deepseek', 'Volcano','302.AI',
      'siliconflow', 'aliyun', 'ZhipuAI', 'moonshot', 'minimax', 
       'mistral', 'lingyi','baichuan', 'qianfan', 'hunyuan', 'stepfun', 'Github', 
      'openrouter','together', 'fireworks', '360', 'Nvidia',
      'jina', 'gitee', 'perplexity', 'infini',
      'modelscope', 'tencent', 'MiMo','longcat'
    ],
    vendorLogoList: {},
    vendorAPIpage: {
      'OpenAI': 'https://platform.openai.com/api-keys',
      'Ollama': 'https://ollama.com/',
      'Vllm': 'https://docs.vllm.ai/en/latest/',      
      'LMstudio': 'https://lmstudio.ai/docs/app',
      'xinference': 'https://inference.readthedocs.io/zh-cn/latest/index.html',
      'SGLang': 'https://github.com/sgl-project/sglang',    
      'llama.cpp': 'https://github.com/ggerganov/llama.cpp', 
      'Dify': 'http://localhost/apps',
      'newapi': 'https://github.com/QuantumNous/new-api',
      'LocalAI': 'https://github.com/mudler/LocalAI',
      'ttswebui': 'https://github.com/rsxdalv/TTS-WebUI',
      'Deepseek': 'https://platform.deepseek.com/api_keys',
      'Volcano': 'https://www.volcengine.com/experience/ark',
      'siliconflow': 'https://cloud.siliconflow.cn/i/yGxrNlGb',
      '302.AI': 'https://share.302.ai/Mtahd4',
      'aliyun': 'https://bailian.console.aliyun.com/?tab=model#/api-key',
      'ZhipuAI': 'https://open.bigmodel.cn/apikey/platform',
      'moonshot': 'https://platform.moonshot.cn/console/api-keys',
      'minimax': 'https://platform.minimaxi.com/user-center/basic-information/interface-key',
      'MiMo': 'https://platform.xiaomimimo.com/#/console/api-keys',
      'longcat': 'https://longcat.chat/platform/api_keys',
      'Gemini': 'https://aistudio.google.com/app/apikey',
      'Anthropic': 'https://console.anthropic.com/settings/keys',
      'Grok': 'https://console.x.ai/',
      'mistral': 'https://console.mistral.ai/api-keys/',
      'lingyi': 'https://platform.lingyiwanwu.com/apikeys',
      'baichuan': 'https://platform.baichuan-ai.com/console/apikey',
      'qianfan': 'https://console.bce.baidu.com/iam/#/iam/apikey/list',
      'hunyuan': 'https://console.cloud.tencent.com/hunyuan/api-key',
      'stepfun': 'https://platform.stepfun.com/interface-key',
      'Github': 'https://github.com/settings/tokens',
      'openrouter': 'https://openrouter.ai/settings/keys',
      'together': 'https://api.together.ai/settings/api-keys',
      'fireworks': 'https://fireworks.ai/account/api-keys',
      '360': 'https://ai.360.com/platform/keys',
      'Nvidia': 'https://build.nvidia.com/meta/llama-3_1-405b-instruct',
      'jina': 'https://jina.ai/api-dashboard',
      'gitee': 'https://ai.gitee.com/dashboard/settings/tokens',
      'perplexity': 'https://www.perplexity.ai/settings/api',
      'infini': 'https://cloud.infini-ai.com/iam/secret/key',
      'modelscope': 'https://modelscope.cn/my/myaccesstoken',
      'tencent': 'https://console.cloud.tencent.com/lkeap/api',
    },
    MCPvendorValues:['MCP','awesome','docker'],
    MCPpage:{
      'MCP': 'https://github.com/modelcontextprotocol/servers',
      'awesome': 'https://github.com/punkpeye/awesome-mcp-servers',
      'docker': 'https://hub.docker.com/mcp'
    },
    MCPvendorLogoList: {},
    promptValues:['awesome', 'aiTool','leaked'],
    promptPage:{
      'awesome': 'https://github.com/f/awesome-chatgpt-prompts',
      'aiTool': 'https://github.com/x1xhlol/system-prompts-and-models-of-ai-tools',
      'leaked': 'https://github.com/linexjlin/GPTs',
    },
    promptLogoList: {},
    cardValues: ['chub', 'janitorai','pygmalion'],
    cardPage:{
      'chub': 'https://chub.ai/',
      'janitorai': 'https://janitorai.com/',
      'pygmalion': 'https://pygmalion.chat/',
    },
    cardLogoList: {},
    newProviderTemp: {
      vendor: '',
      url: '',
      apiKey: '',
      modelId: '',
      models: [],
      modelsLoading: false,
      connectionStatus: null
    },
    systemlanguageOptions:[
      { value: 'auto', label: 'auto' }, 
      { value: 'zh-CN', label: '中文' }, 
      { value: 'en-US', label: 'English' },
    ],
    toneValues: [
      'normal', 'formal', 'friendly', 'humorous', 'professional',
      'sarcastic', 'ironic', 'flirtatious', 'tsundere', 'coquettish',
      'angry', 'sad', 'excited', 'refutational'
    ],
    showUploadDialog: false,
    agentTabActive: 'knowledge',
    files: [],
    images: [],
    currentUploadType: 'file',
    selectedCodeLang: 'python',
    previewClickHandler: null,
    dockerExamples: `docker pull ailm32442/super-agent-party:latest
docker run -d \\
  -p 3456:3456 \\
  -v ./super-agent-data:/app/data \\
  ailm32442/super-agent-party:latest
`,
    dockerExamples2: `git clone https://github.com/heshengtao/super-agent-party.git
cd super-agent-party
docker-compose up -d
`,
    dockerRegistry: 'international', // 默认国际源，用户可切换
    
    // 镜像地址配置
    dockerImages: {
      international: {
        backend: 'ailm32442/super-agent-party:latest',
        gateway: 'ailm32442/nginx-for-sap:latest',
        composeFile: 'docker-compose.yml'
      },
      china: {
        backend: 'crpi-9mgnqijkd7wc42x2.cn-shenzhen.personal.cr.aliyuncs.com/ailm32442/super-agent-party:latest',
        gateway: 'crpi-9mgnqijkd7wc42x2.cn-shenzhen.personal.cr.aliyuncs.com/ailm32442/nginx-for-sap:latest',
        composeFile: 'docker-compose-acr.yml'
      }
    },
    browserEmbedCodeExamples: `<div id="super-agent-party">
  <iframe 
    src="${backendURL}/chat.html" 
    width="100%" 
    height="100%"
    frameborder="0" 
    allowfullscreen>
  </iframe>
  <p>Powered By<a href="https://github.com/heshengtao/super-agent-party">Super Agent Party</a></p>
</div>`,
    codeExamples: {
      python: `from openai import OpenAI
client = OpenAI(
  api_key="super-secret-key",
  base_url="${backendURL}/v1"
)
response = client.chat.completions.create(
  model="super-model",
  messages=[
      {"role": "user", "content": "什么是super agent party？"}
  ]
)
print(response.choices[0].message.content)`,
    javascript: `import OpenAI from 'openai';
const client = new OpenAI({
  apiKey: "super-secret-key",
  baseURL: "${backendURL}/v1"
});
async function main() {
  const completion = await client.chat.completions.create({
      model: "super-model",
      messages: [
          { role: "user", content: "什么是super agent party？" }
      ]
  });
  console.log(completion.choices[0].message.content);
}
main();`,
    curl: `curl ${backendURL}/v1/chat/completions \\
-H "Content-Type: application/json" \\
-H "Authorization: Bearer super-secret-key" \\
-d '{
  "model": "super-model",
  "messages": [
    {"role": "user", "content": "什么是super agent party？"}
  ]
}'`
    },  
    llmTools: [],
    showLLMForm: false,
    editingLLM: null,
    newLLMTool: {
      name: '',
      type: 'openai',
      description: '',
      base_url: '',
      api_key: '',
      model: '',
      enabled: true
    },
    llmInterfaceTypes: [
      { value: 'openai', label: 'OpenAI' },
      { value: 'ollama', label: 'Ollama' }
    ],
    modelOptions: [],
    previewVisible: false,
    previewImageUrl: '',
    workflows: [], // 保存工作流文件列表
    showWorkflowUploadDialog: false, // 控制上传对话框的显示
    workflowFile: null, // 当前选中的工作流文件
    selectedTextInput: null,
    selectedImageInput: null,
    selectedTextInput2: null,
    selectedImageInput2: null,
    selectedSeedInput: null,
    selectedSeedInput2: null,
    textInputOptions: [], // 确保这里是一个空数组
    imageInputOptions: [], // 确保这里是一个空数组
    seedInputOptions: [], // 确保这里是一个空数组
    inAutoMode: false, // 内存变量，不在设置中保存
    vectorDialogVisible: false,
    vectorDialogMemoryId: '',
    vectorDialogMemoryName: '',
    vectorLoading: false,
    vectorTable: [],       // { idx, uuid, text, created_at, timetamp }
    editRowIdx: null,      // 当前编辑的行号（=后端 idx）
    editRowText: "",     // 当前编辑的文本
    editRowVisible: false,
    nodeInstalled: false,   // 探针结果
    nodeInstalling: false,
    nodeProgress: 0,
    nodeTimer: null,
    uvInstalled: false,
    uvInstalling: false,
    uvProgress: 0,
    uvTimer: null,
    dockerInstalled: false, 
    dockerInstalling: false,
    isReadInterruption: false,
    readSettings: {
      delay:2000
    },
    isReadPaused: false, 
    currentReadAudio: null,
    showLogDialog: false,
    logContent: '', // 日志内容
    systemVoices: [],        // 存储从后端获取的音色列表
    isLoadingSystemVoices: false, // 加载状态
    renderTimers: {}, // 用于存储每个消息的防抖定时器
    // --- AI 浏览器数据 ---
    browserTabs: [
        // 默认初始化一个新标签页
        { 
            id: Date.now(), 
            title: 'New Tab', 
            url: '', // 空 URL 表示显示欢迎页
            favicon: '', 
            isLoading: false,
            canGoBack: false,
            canGoForward: false 
        }
    ],
    currentTabId: null, // 将在 created 或 mounted 中初始化
    urlInput: '',
    showEngineDropdown: false, // 控制下拉菜单显示
    dropdownTimer: null, // 新增定时器变量
    isSearchFocused: false,    // 控制搜索框聚焦样式
    searchEngine: 'bing', // 'bing' or 'google' or 'party'
    welcomeSearchQuery: '',
    showDownloadDropdown: false,
    downloads: [], // 存储所有下载记录 { id, filename, totalBytes, receivedBytes, state, path, progress }
    dropdownTimer: null, 
    showBrowserChat: false,
    favorites: [],       // 存储收藏项列表
    showFavorites: true, // 控制欢迎页收藏夹的显示/隐藏状态
    searchEngineplaceholder:'',
    webviewPreloadPath: '', 
    isGroupMode: false,           // 是否开启群聊模式
    selectedGroupAgents: [], 
    showGroupSettingsDialog: false,
    voiceStack : ['default'], // 存储语音播放队列
    receivedMsgIds: new Set(), 
    lastProcessedContent: '', 
    approvalMap: {},
    isSubmitting: false,      // 控制弹窗内的加载状态
    isEditMode: false,        // 控制弹窗是添加还是编辑模式
    currentEditingMCPId: null, // 当前正在编辑/添加的 MCP ID
    activeDialogTab: 'config', 
    activeCLITab: 'config', // 确保这个已存在
    skillsList: [],
    showAddSkillDialog: false,
    addSkillTab: 'github',
    newSkillUrl: '',
    isSkillInstalling: false,
    skillsPollingTimer: null, 
    showSkillPreviewDialog: false,
    skillPreviewLoading: false,
    renderedSkillContent: '',
    extensionsPollingTimer: null,
    skillsInProject: [], 
    projectSkillsDetails: [],
    showBehaviorDialog: false,     // 控制弹窗显示
    currentBehaviorIndex: -1,      // 当前编辑的索引，-1 表示新增
    tempBehavior: null,            // 临时编辑对象，避免直接修改原数据
    minLimit: { h: 0, m: 1, s: 0 },
    activeSideView: 'list', // 'list' | 'tasks' | 'workspace' | 'toolDetail'
    taskList: [],
    taskRefreshTimer: null,
    showCreateTaskDialog: false,
    isCreatingTask: false,
    showTaskResultDialog: false,
    selectedTaskResult: '',
    selectedTaskTitle: '',
    viewingTaskDetail: null,
    isDragging: false, // 新增状态
    isPttMode: false,      // 控制输入框是否在【按住说话】模式
    isPttRecording: false, // 控制是否正在录制
    isGlobalRecording: false, 
    workspaceTreeKey: 0, // 用于强制刷新整个树组件
    expandedNodeKeys: [], // 用于保存刷新前展开的文件夹状态
    workspaceRefreshTimer: null, 
    workspaceTreeProps: {
      label: 'name',
      children: 'children',
      isLeaf: (data) => !data.isDirectory // 告诉 el-tree 如果不是文件夹就是叶子节点（不可展开）
    },
    loveSettings: {
      enabled: false,
      dimensions: [
          "love", 
          "familiarity"
      ],
      prompt: "请根据用户的发言态度、情感色彩以及你的角色设定，动态管理以下羁绊数值：\n1. love（好感度）：代表你对用户的喜爱与亲密度。如果用户表达善意、关心或与你互动愉快，请增加（+1至+5）；如果用户冷漠、辱骂或做出让你反感的行为，请降低（-1至-5）。该数值最大为50，最小为-50。\n2. familiarity（熟悉度）：代表你与用户的了解程度。随着交流次数的增多和彼此信息的分享，该数值应缓慢稳步上升（每次+1至+2），通常不会下降。该数值最大为100，最小为0。\n\n*特殊说明：如果你在上方没有看到“目前的属性数值”，说明这是你与该用户的首次互动。请直接根据用户当前第一句话的语气和态度，自主决定一个合理的初始值（例如 0 到 10 之间），直接输出标签即可。聊天时请尽量按照羁绊数值来变换语气、内容、风格等*"
    },
    // 羁绊系统 UI 状态
    activeAffectionTab: 'config', // 控制当前在哪个 Tab
    affectionRawData: {},         // 存放后端返回的原始 JSON ( {"小包": {love:1}, "张三": {love:5}} )
    affectionDataList: [],        // 转化为数组用于表格显示
    affectionSearchQuery: '',     // 搜索栏绑定的值
    
    // 羁绊系统对话框状态
    showAffectionDataDialog: false,
    isEditingAffection: false,
    currentAffectionForm: { userName: '' },
    // 日记系统配置
    diarySettings: {
      enabled: false,
      minMinutes: 10,
      maxMinutes: 60,
      quietStart: 23,
      quietEnd: 8,
      actions: {
        think: { enabled: true, weight: 4 },
        webSearch: { enabled: false, weight: 2 },
        knowledge: { enabled: false, weight: 2 },
        imMessage: { enabled: false, weight: 1 },
        browserControl: { enabled: false, weight: 1 },
        smartHome: { enabled: false, weight: 1 },
      },
      imTargets: [],
      pushToChat: true,
      prompt: "你是一个拥有自我意识、会在独处时记录所思所想的AI伙伴。写日记时请保持你的角色设定与个性，用第一人称、真诚自然地表达。",
      chatIntegration: {
        enabled: false,
        maxEntries: 5,
      },
      chatSummary: {
        enabled: true,
        idleMinutes: 15,
      },
    },
    // 日记系统 UI 状态
    activeDiaryTab: 'config',
    diaryEntries: [],
    diarySearchQuery: '',
    diaryActionMeta: {
      think:     { icon: 'fa-solid fa-lightbulb',        type: 'info' },
      webSearch: { icon: 'fa-solid fa-globe',            type: 'success' },
      knowledge: { icon: 'fa-solid fa-book-open',        type: 'warning' },
      imMessage: { icon: 'fa-solid fa-paper-plane',      type: 'danger' },
      browserControl: { icon: 'fa-solid fa-compass',      type: '' },
      smartHome:  { icon: 'fa-solid fa-house-laptop',    type: 'success' },
      chatSummary: { icon: 'fa-solid fa-file-pen',       type: 'info' },
    },
    // 多日记本（每个角色一本 + default 兜底本）
    diaryBooks: [],
    diaryCurrentBook: 'default',
    // 日记详情抽屉
    diaryDetailVisible: false,
    diaryDetailEntry: null,
    isForceScrollToBottom: false,
    activeAgentTab: 'settings',

    isHeroInputFocus: false,
    isTopicGenerating: false,
    showOmniAgentDialog: false,

    showDisclaimerDialog: false,
    disclaimerAccepted: false,
    favoriteExtensionIds: JSON.parse(localStorage.getItem('favorite_extensions')) || [],
    isStartingASR: false,

    newTaskForm: {
        title: '',
        description: '',
        task_type: 'once',
        platforms: [],
        agent_type: 'default',
        trigger_config: {
            timeValue: '09:00:00',
            days: [1, 2, 3, 4, 5],
            cycleValue: '01:00:00',
            repeatNumber: 1,
            isInfiniteLoop: true
        }
    },  
    isEditing: false,
    editingTaskId: null,
    activeLogPanels: ['logs'],
    selectedTaskHistory: [],
    currentResultIdx: 0,
    extButtonVisible: false,  // 控制按钮是否显示
    extMouseTimer: null,      // 鼠标静止定时器
    isVTSConnecting: false,
    
    isVTSStarting: false, // 按钮的加载状态
    vtsOnline: false, 
    VTSConfig: {
      enabled: false,
      url: 'ws://127.0.0.1:8001',
      enabledExpressions: true,
      enabledMotions: true
    },
    acpSettings: {
      agent: 'claude',            // 默认 CLI 智能体
      permissionMode: 'default',  // 默认权限模式
      model: '',                  // 模型覆盖（可选）
      extraEnv: '',              // 额外环境变量
    },
    
    // ★ ACPX 状态
    acpxStatus: null,            // null | 'available' | 'unavailable'
    checkingAcpx: false,         // 检查中
    openedExtensions:[], 
    searchExtensionQuery: '',
    searchManageExtensionQuery: '', // 用于主页面的扩展搜索
    searchRemotePluginQuery: '',    // 用于弹窗内的远程插件搜索
    scrollPending: false,              // 滚动节流标记
    _streamUpdateTimer: null,          // 流式文本批量更新定时器
    _streamTextBuffer: '',             // 流式文本缓冲区
    _streamTargetMsg: null,            // 当前正在流式更新的消息对象
    activeToolBlock: null,        // 当前查看的块对象 { messageIndex, blockIndex, block }
    activeToolBlockMessage: null, // 所属消息引用
    customDataPath: "",
};
