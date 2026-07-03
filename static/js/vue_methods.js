const md = window.markdownit({
    html: true,
    linkify: true,
    typographer: true,
    highlight: function (str, lang) {
    let language = lang === 'a2ui' || (lang && hljs.getLanguage(lang)) ? lang : 'plaintext';
    const isPotentialMermaid = (code) => {
    // 检测标准语法特征
    const mermaidPatterns = [
        // 检测图表类型声明
        /^\s*(graph|sequenceDiagram|gantt|classDiagram|pie|stateDiagram|gitGraph|journey|flowchart|mindmap|quadrantChart|erDiagram|requirementDiagram|gitGraph|C4Context|timeline|zenuml|sankey-beta|xychart-beta|block-beta|packet-beta|kanban|architecture-beta|radar-beta)\b/i,
        // 检测节点关系语法
        /-->|==>|:::|\|\|/,
        // 检测样式配置语法
        /^style\s+[\w]+\s+/im,
        // 检测注释语法
        /%%\{.*\}\n?/
    ];
    
    return mermaidPatterns.some(pattern => pattern.test(code));
    };
    // 自动升级普通文本中的 Mermaid 内容
    if (language === 'plaintext' && isPotentialMermaid(str)) {
    language = 'mermaid';
    };
    const previewable = ['html', 'mermaid'].includes(language);
    const downloadButton = previewable ? 
    `<button class="download-button" data-lang="${language}"><i class="fa-solid fa-download"></i></button>` : '';
    // 添加预览按钮
    const previewButton = previewable ? 
    `<button class="preview-button" data-lang="${language}"><i class="fa-solid fa-eye"></i></button>` : '';
    try {
    return `<pre class="code-block"><div class="code-header"><span class="code-lang">${language}</span><div class="code-actions">${previewButton}${downloadButton}<button class="copy-button"><i class="fa-solid fa-copy"></i></button></div></div><div class="code-content"><code class="hljs language-${language}">${hljs.highlight(str, { language }).value}</code></div></pre>`;
    } catch (__) {
    return `<pre class="code-block"><div class="code-header"><span class="code-lang">${language}</span><div class="code-actions">${previewButton}${downloadButton}<button class="copy-button"><i class="fa-solid fa-copy"></i></button></div></div><div class="code-content"><code class="hljs">${md.utils.escapeHtml(str)}</code></div></pre>`;
    }
}
});

// 1. 重写表格开始标签：直接输出带 wrapper 的 HTML
md.renderer.rules.table_open = function(tokens, idx, options, env, self) {
  // 返回：<div class="markdown-table-wrapper"><table>
  return '<div class="markdown-table-wrapper"><table' + self.renderAttrs(tokens[idx]) + '>';
};

// 2. 重写表格结束标签：闭合 table，添加按钮，闭合 div
md.renderer.rules.table_close = function(tokens, idx, options, env, self) {
  // 这里我们添加一个特殊的 class "download-xlsx-btn" 用于后续事件代理
  // 注意：onclick 这里不直接写逻辑，而是通过 Vue 的事件代理来处理
  return '</table><button class="table-download-btn download-xlsx-trigger" type="button"><i class="fa-solid fa-file-excel"></i> XLSX</button></div>';
};

if (window.markdownitFootnote) {
    md.use(window.markdownitFootnote);
    
    // 【新增】覆盖默认的脚注渲染规则，只返回数字，去掉方括号 []
    md.renderer.rules.footnote_caption = (tokens, idx) => {
        var n = Number(tokens[idx].meta.id + 1).toString();
        return n;
    };
}

if (window.markdownitTaskLists) {
    md.use(window.markdownitTaskLists, {
        enabled: true,   // 渲染为 <input type="checkbox">
        label: true,     // 将文字包裹在 <label> 中
        labelAfter: true // label 放在 checkbox 之后
    });
} else {
    console.warn('markdown-it-task-lists 插件未加载，任务列表将不会渲染。');
}

// 检查插件是否已加载
if (window.markdownitContainer) {
    
    // 1. 定义 "warning" 容器 (对应 CSS 中的 .highlight-block-reasoning)
    // 使用方法: 
    // ::: warning 标题
    // 内容...
    // :::
    md.use(window.markdownitContainer, 'warning', {
        validate: function(params) {
            return params.trim().match(/^warning\s*(.*)$/);
        },
        render: function (tokens, idx) {
            var m = tokens[idx].info.trim().match(/^warning\s*(.*)$/);
            if (tokens[idx].nesting === 1) {
                // 开头标签: <div class="highlight-block-reasoning"> ...
                var title = m[1] ? md.utils.escapeHtml(m[1]) : '';
                var titleHtml = title ? '<strong>' + title + '</strong><br>' : '';
                return '<div class="highlight-block-reasoning">' + titleHtml;
            } else {
                // 结束标签: </div>
                return '</div>\n\n';
            }
        }
    });

    // 2. 定义 "info" 容器 (对应 CSS 中的 .highlight-block)
    // 使用方法: 
    // ::: info 提示
    // 内容...
    // :::
    md.use(window.markdownitContainer, 'info', {
        validate: function(params) {
            return params.trim().match(/^info\s*(.*)$/);
        },
        render: function (tokens, idx) {
            var m = tokens[idx].info.trim().match(/^info\s*(.*)$/);
            if (tokens[idx].nesting === 1) {
                var title = m[1] ? md.utils.escapeHtml(m[1]) : '';
                var titleHtml = title ? '<strong>' + title + '</strong><br>' : '';
                return '<div class="highlight-block">' + titleHtml;
            } else {
                return '</div>\n\n';
            }
        }
    });
} else {
    console.warn('markdown-it-container 插件未加载，自定义容器将不会渲染。');
}

if (window.texmath) {
    md.use(window.texmath, {
        engine: window.katex, // 指定渲染引擎为 katex
        delims: 'dollars',    // 指定使用 $...$ 和 $$...$$ 语法
        katexOptions: {
            throwOnError: false,
            output: 'html'    // 强制输出 HTML，对流式渲染最友好
        }
    });
}

const ALLOWED_EXTENSIONS =[
  // 办公文档
  'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'pdf', 'pages', 
  'numbers', 'key', 'rtf', 'odt', 'epub',

  // 编程开发
  'js', 'ts', 'py', 'java', 'c', 'cpp', 'h', 'hpp', 'go', 'rs',
  'swift', 'kt', 'dart', 'rb', 'php', 'html', 'css', 'scss', 'less',
  'vue', 'svelte', 'jsx', 'tsx', 'json', 'xml', 'yml', 'yaml', 
  'sql', 'sh',

  // 数据配置
  'csv', 'tsv', 'txt', 'md', 'log', 'conf', 'ini', 'env', 'toml'
];

// MIME类型白名单
const MIME_WHITELIST =[
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument',
  'application/pdf',
  'application/json',
  'text/csv',
  'text/x-python',
  'application/xml',
  'text/x-go',
  'text/x-rust',
  'text/x-swift',
  'text/x-kotlin',
  'text/x-dart',
  'text/x-ruby',
  'text/x-php'
];

// 图片上传相关配置
const ALLOWED_IMAGE_EXTENSIONS =['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'];
const IMAGE_MIME_WHITELIST =[
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/bmp'
];

// ✨ 新增：视频上传相关配置
const ALLOWED_VIDEO_EXTENSIONS =['mp4', 'webm', 'ogg', 'mov', 'avi'];
const VIDEO_MIME_WHITELIST =[
  'video/mp4',
  'video/webm',
  'video/ogg',
  'video/quicktime',
  'video/x-msvideo'
];

// ✨ 修改：将视频扩展名合并到总允许列表中
const ALL_ALLOWED_EXTENSIONS = [...new Set([
  ...ALLOWED_EXTENSIONS, 
  ...ALLOWED_IMAGE_EXTENSIONS, 
  ...ALLOWED_VIDEO_EXTENSIONS // 加入这里
])];

let vue_methods = {
  stringifyEntityId(value) {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    return String(value);
  },
  handleUpdateAction() {
    if (this.updateDownloaded) {
      window.electronAPI.quitAndInstall();
    } else if (this.updateAvailable) {
      window.electronAPI.downloadUpdate();
    }
  },
formatFileUrl(originalUrl) {
    if (!this.isElectron) {
      try {
        const url = new URL(originalUrl);
        // 替换0.0.0.0为当前域名
        if (url.hostname === '0.0.0.0' || url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
          url.hostname = window.location.hostname;
          url.protocol = window.location.protocol;
          
          // ✨ 修复点：仅当原链接没有端口，或者是默认端口 3456、当前激活端口时才重写端口
          const isBackendPort = url.port === '' || url.port === '3456' || url.port === window.location.port;
          if (isBackendPort) {
            url.port = window.location.port;
          }
        }
        return url.toString();
      } catch(e) {
        return originalUrl;
      }
    }
    else {
      try {
        const url = new URL(originalUrl);
        if (url.hostname === '127.0.0.1') {
          url.hostname = "localhost";
          url.protocol = window.location.protocol;
          
          // ✨ 修复点：仅当原链接没有端口，或者是默认端口 3456、当前激活端口时才重写端口
          const isBackendPort = url.port === '' || url.port === '3456' || url.port === window.location.port;
          if (isBackendPort) {
            url.port = window.location.port;
          }
        }
        return url.toString();
      } catch(e) {
        return originalUrl;
      }
    }
    return originalUrl;
  },
  async resetMessage(index) {
    this.messages[index].content = " ";
    this.system_prompt = " ";
    await this.autoSaveSettings();
  },

  async deleteMessage(index) {
    this.stopGenerate();
    this.messages.splice(index, 1);
    if (this.conversationId === null) {
        this.conversationId = uuid.v4();
        const newConv = {
            id: this.conversationId,
            title: this.generateConversationTitle(messagesPayload),
            mainAgent: this.mainAgent,
            groupId: this.activeConversationGroupId || this.draftConversationGroupId || 'default',
            timestamp: Date.now(),
            messages: this.messages,
            fileLinks: this.fileLinks,
            system_prompt: this.system_prompt,
        };
        this.conversations.unshift(newConv);
    } else {
        const conv = this.conversations.find(conv => conv.id === this.conversationId);
        if (conv) {
            conv.messages = this.messages;
            conv.timestamp = Date.now();
            conv.fileLinks = this.fileLinks;
            conv.groupId = conv.groupId || this.activeConversationGroupId || this.draftConversationGroupId || 'default';
        }
    }
    await this.autoSaveSettings();
    await this.saveConversations();
    console.log("delete message");
  },

  openEditDialog(type, content, index = null) {
    this.editType = type;
    this.editContent = content;
    this.editIndex = index;
    this.showEditDialog = true;
    this.selectSystemPromptId =null;
  },
  async saveEdit() {
    this.showEditDialog = false;
    if (this.editType === 'system') {
      this.system_prompt = this.editContent;
      this.syncSystemPromptToMessages(this.system_prompt);
    }
    if (this.editType === 'user') {
      // 移除this.editIndex之后的所有消息
      this.messages.splice(this.editIndex);
      this.userInput = this.editContent;
      this.stopGenerate();
      await this.sendMessage();
    }else{
      // this.messages[this.editIndex].pure_content = this.editContent; // 更新this.editIndex对应的消息内容
    }
    await this.autoSaveSettings();
  },
    async addParam() {
      this.settings.extra_params.push({
        name: '',
        type: 'string',  // 默认类型
        value: ''        // 根据类型自动初始化
      });
      await this.autoSaveSettings();
    },

    async addFastParam() {
      this.fastSettings.extra_params.push({
        name: '',
        type: 'string',  // 默认类型
        value: ''        // 根据类型自动初始化
      });
      await this.autoSaveSettings();
    },

    isInvalidJson(param) {
      // 如果不是 json 类型，不需要进行 JSON 校验
      if (param.type !== 'json') return false;
      
      // 为空或纯空格视为无效
      if (!param.value || param.value.trim() === '') return true; 

      try {
        const parsed = JSON.parse(param.value);
        
        // 既然单独选了 json 类型，通常排除了基础类型(string/integer/boolean)。
        // 这里我们限制它解析后必须是 对象({}) 或 数组([])，且不能是 null
        if (typeof parsed !== 'object' || parsed === null) {
          return true;
        }
        
        return false; // 解析成功且是对象/数组，校验通过
      } catch (e) {
        return true; // JSON 语法错误，校验失败
      }
    },

  getParamPlaceholder(type) {
    if (type === 'dict') return '{"type": "enabled"}';
    if (type === 'list') return '["item1", "item2"]';
    return this.t('paramValue'); // 默认使用翻译
  },

    async updateParamType(index) {
      const param = this.settings.extra_params[index];
      switch(param.type) {
        case 'json':
          param.value = '{}'; // 默认给一个对象，用户需要数组自己改成[] 即可
          break;
        case 'boolean':
          param.value = false;
          break;
        case 'integer':
        case 'float':
          param.value = 0;
          break;
        default:
          param.value = '';
      }
      await this.autoSaveSettings();
    },

    async updateFastParamType(index) {
      const param = this.fastSettings.extra_params[index];
      // 根据类型初始化值
      switch(param.type) {
        case 'json':
          param.value = '{}'; // 默认给一个对象，用户需要数组自己改成[] 即可
          break;
        case 'boolean':
          param.value = false;
          break;
        case 'integer':
        case 'float':
          param.value = 0;
          break;
        default:
          param.value = '';
      }
      await this.autoSaveSettings();
    },


    // 从建议参数中添加
    async addMainSuggestedParam(param) {
      if (this.paramExistsInMain(param.name)) return;
      this.settings.extra_params.push({
        name: param.name,
        type: param.type,
        value: param.default !== undefined ? param.default : (param.type === 'boolean' ? false : (param.type === 'json' ? '{}' : (param.type === 'integer' || param.type === 'float' ? 0 : '')))
      });
      await this.autoSaveSettings();
    },
    async addFastSuggestedParam(param) {
      if (this.paramExistsInFast(param.name)) return;
      this.fastSettings.extra_params.push({
        name: param.name,
        type: param.type,
        value: param.default !== undefined ? param.default : (param.type === 'boolean' ? false : (param.type === 'json' ? '{}' : (param.type === 'integer' || param.type === 'float' ? 0 : '')))
      });
      await this.autoSaveSettings();
    },
    paramExistsInMain(name) {
      return this.settings.extra_params.some(p => p.name === name);
    },
    paramExistsInFast(name) {
      return this.fastSettings.extra_params.some(p => p.name === name);
    },
    // 获取供应商名称（从 providerId 反查 vendor）
    getVendorByProviderId(providerId) {
      if (!providerId) return null;
      const provider = this.modelProviders.find(p => p.id === providerId);
      return provider ? provider.vendor : null;
    },
    async removeParam(index) {
      this.settings.extra_params.splice(index, 1);
      await this.autoSaveSettings();
    },
    async removeFastParam(index) {
      this.fastSettings.extra_params.splice(index, 1);
      await this.autoSaveSettings();
    },

    switchTollmTools() {
      this.activeMenu = 'toolkit';
      this.subMenu = 'llmTool';
    },
    switchToHttpTools() {
      this.activeMenu = 'toolkit';
      this.subMenu = 'customHttpTool';
    },
    switchToComfyui() {
      this.activeMenu = 'toolkit';
      this.subMenu = 'comfyui';
    },
    switchToStickerPacks() {
      this.activeMenu = 'role';
      this.subMenu = 'sticker';
    },
    switchToVisionControl() {
      this.activeMenu = 'toolkit';
      this.subMenu = 'visionControl';
    },
    switchToDesktopVision() {
      this.activeMenu = 'role';
      this.subMenu = 'vision';
    },
    switchToMainAgent() {
      this.activeMenu = 'api-group';
      this.subMenu = 'agents';
    },
    switchToTTS() {
      this.activeMenu = 'model-config';
      this.subMenu = 'tts';
    },
    switchToExtensionPage() {
      this.activeMenu = 'api-group';
      this.subMenu = 'extension';
    },
    cancelLLMTool() {
      this.showLLMForm = false
      this.resetForm()
    },
    handleTypeChange(val) {
      this.newLLMTool.base_url = this.defaultBaseURL
      this.newLLMTool.api_key = this.defaultApikey
      this.fetchModelsForType(val)
    },
    changeImgHost(val) {
      this.BotConfig.img_host = val;
      this.autoSaveSettings()
    },
    // 获取模型列表
    async fetchModelsForType(type) {
      try {
        const response = await fetch(`/llm_models`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: type,
            base_url: this.newLLMTool.base_url,
            api_key: this.newLLMTool.api_key
          })
        })
        
        const { data } = await response.json()
        this.modelOptions = data.models || []
      } catch (error) {
        console.error('Failed to fetch models:', error)
      }
    },
    // 保存工具
    saveLLMTool() {
      const tool = { ...this.newLLMTool }
      // 添加工具ID
      tool.id = uuid.v4();
      if (this.editingLLM) {
        this.llmTools[this.editingLLM] = tool
      } else {
        this.llmTools.push(tool)
      }
      this.showLLMForm = false
      this.resetForm()
      this.autoSaveSettings()
    },
    // 删除工具
    removeLLMTool(index) {
      this.llmTools.splice(index, 1)
      this.autoSaveSettings()
    },
    // 重置表单
    resetForm() {
      this.newLLMTool = {
        name: '',
        type: 'openai',
        description: '',
        base_url: '',
        api_key: '',
        model: '',
        enabled: true
      }
      this.editingLLM = null
    },
    // 类型标签转换
    toolTypeLabel(type) {
      const found = this.llmInterfaceTypes.find(t => t.value === type)
      return found ? found.label : type
    },
    // 检查更新
    async checkForUpdates() {
      if (isElectron) {
        try {
          await window.electronAPI.checkForUpdates();
        } catch (err) {
          showNotification(err.message, 'error');
        }
      }
    },

    // 下载更新
    async downloadUpdate() {
      if (isElectron && this.updateAvailable) {
        try {
          await window.electronAPI.downloadUpdate();
        } catch (err) {
          showNotification(err.message, 'error');
        }
      }
    },

    // 安装更新
    async installUpdate() {
      if (isElectron && this.updateDownloaded) {
        await window.electronAPI.quitAndInstall();
      }
    },

    // 处理更新按钮点击
    async handleUpdate() {
      if (!this.updateSuccess) {
        try {
          await this.downloadUpdate();
          this.updateSuccess = true;
          setTimeout(() => {
            this.installUpdate();
          }, 1000);
        } catch (err) {
          showNotification(err.message, 'error');
        }
      } else {
        await this.installUpdate();
      }
    },

    generateConversationTitle(messages) {
      const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
      
      if (lastUserMessage) {
        let textContent;
        
        // 判断 content 是否为字符串还是对象数组
        if (typeof lastUserMessage.content === 'string') {
          textContent = lastUserMessage.content;
        } else if (Array.isArray(lastUserMessage.content)) {
          // 提取所有文本类型的内容并拼接
          textContent = lastUserMessage.content.filter(item => item.type === 'text')
                           .map(item => item.text).join(' ');
        } else {
          // 如果既不是字符串也不是对象数组，设置为空字符串或其他默认值
          textContent = '';
        }
    
        // 拼接 fileLinks_content 部分，如果有
        const fullContent = textContent + (lastUserMessage.fileLinks_content ?? '');
        
        return fullContent.substring(0, 30) + (fullContent.length > 30 ? '...' : '');
      }
      
      return this.t('newChat');
    },
    openDeleteConversationDialog(conversation) {
      if (!conversation?.id) return;
      this.deleteConversationForm = {
        id: conversation.id,
        title: conversation.title || this.t('untitled'),
        deleteMemory: false,
      };
      this.showDeleteConversationDialog = true;
    },
    async confirmDeleteConversation(convId) {
      const conversation = this.conversations.find(c => c.id === convId);
      if (!conversation) return;
      this.openDeleteConversationDialog(conversation);
    },
    ensureConversationGroups() {
      const defaultGroup = {
        id: 'default',
        name: this.t('defaultConversationGroup'),
        createdAt: 0,
        memoryConfig: {}
      };

      const rawGroups = Array.isArray(this.conversationGroups) ? this.conversationGroups : [];
      const groups = rawGroups
        .filter(group => group && group.id && group.id !== 'default')
        .map(group => ({
          ...group,
          memoryConfig: group.memoryConfig || {}
        }));

      this.conversationGroups = [defaultGroup, ...groups];
      if (Array.isArray(this.conversations)) {
        this.conversations.forEach(conv => {
          if (!conv.groupId) {
            conv.groupId = 'default';
          }
        });
      }
      const nextCollapsedState = { ...(this.collapsedConversationGroups || {}) };
      this.conversationGroups.forEach(group => {
        if (typeof nextCollapsedState[group.id] !== 'boolean') {
          nextCollapsedState[group.id] = false;
        }
      });
      Object.keys(nextCollapsedState).forEach(groupId => {
        if (!this.conversationGroups.some(group => group.id === groupId)) {
          delete nextCollapsedState[groupId];
        }
      });
      this.collapsedConversationGroups = nextCollapsedState;

      if (!this.conversationGroups.some(group => group.id === this.draftConversationGroupId)) {
        this.draftConversationGroupId = 'default';
      }
      if (!this.conversationGroups.some(group => group.id === this.activeConversationGroupId)) {
        this.activeConversationGroupId = this.draftConversationGroupId || 'default';
      }
    },
    setActiveConversationGroup(groupId = 'default') {
      this.ensureConversationGroups();
      const nextGroupId = this.conversationGroups.some(group => group.id === groupId) ? groupId : 'default';
      this.activeConversationGroupId = nextGroupId;
      this.draftConversationGroupId = nextGroupId;
    },
    isConversationGroupCollapsed(groupId = 'default') {
      return !!this.collapsedConversationGroups?.[groupId];
    },
    toggleConversationGroupCollapsed(groupId = 'default') {
      this.ensureConversationGroups();
      this.collapsedConversationGroups = {
        ...(this.collapsedConversationGroups || {}),
        [groupId]: !this.isConversationGroupCollapsed(groupId),
      };
    },
    toggleChatHistoryPanel() {
      if (this.isMobile) {
        this.showHistoryDialog = true;
        return;
      }
      this.chatHistoryPanelOpen = !this.chatHistoryPanelOpen;
    },
    createConversationGroup() {
      this.conversationGroupDialogMode = 'create';
      this.conversationGroupForm = {
        id: null,
        name: '',
        memoryEnabled: false,
      };
      this.showConversationGroupDialog = true;
    },
    openRenameConversationGroupDialog(group) {
      if (!group?.id || group.id === 'default') return;
      this.conversationGroupDialogMode = 'rename';
      this.conversationGroupForm = {
        id: group.id,
        name: group.name || '',
        memoryEnabled: !!group.memoryConfig?.enabled,
      };
      this.showConversationGroupDialog = true;
    },
    async submitConversationGroupDialog() {
      this.ensureConversationGroups();
      const name = String(this.conversationGroupForm?.name || '').trim();
      if (!name) {
        showNotification(this.t('groupNameRequired'), 'error');
        return;
      }

      const currentGroupId = this.conversationGroupForm?.id || null;
      const exists = this.conversationGroups.some(group =>
        group.id !== currentGroupId && (group.name || '').trim() === name
      );
      if (exists) {
        showNotification(this.t('groupNameExists'), 'error');
        return;
      }

      if (this.conversationGroupDialogMode === 'rename' && currentGroupId) {
        const targetGroup = this.conversationGroups.find(group => group.id === currentGroupId);
        if (!targetGroup) return;
        targetGroup.name = name;
        targetGroup.memoryConfig = {
          ...(targetGroup.memoryConfig || {}),
          enabled: !!this.conversationGroupForm?.memoryEnabled,
        };
        await this.saveConversations();
        this.showConversationGroupDialog = false;
        showNotification(this.t('groupRenamed'), 'success');
        return;
      }

      const newGroup = {
        id: uuid.v4(),
        name,
        createdAt: Date.now(),
        memoryConfig: {
          enabled: !!this.conversationGroupForm?.memoryEnabled,
        }
      };

      this.conversationGroups.push(newGroup);
      this.draftConversationGroupId = newGroup.id;
      this.activeConversationGroupId = newGroup.id;
      await this.saveConversations();
      this.showConversationGroupDialog = false;
      showNotification(this.t('groupCreated'), 'success');
    },
    async startConversationInGroup(groupId = null) {
      this.ensureConversationGroups();
      const targetGroupId = groupId || this.activeConversationGroupId || this.draftConversationGroupId || 'default';
      this.setActiveConversationGroup(targetGroupId);
      await this.clearMessages(targetGroupId);
    },
    async moveConversationToGroup(convId, groupId) {
      this.ensureConversationGroups();
      const targetGroupId = groupId || 'default';
      const conversation = this.conversations.find(conv => conv.id === convId);
      if (!conversation) return;

      conversation.groupId = targetGroupId;
      if (convId === this.conversationId) {
        this.draftConversationGroupId = targetGroupId;
        this.activeConversationGroupId = targetGroupId;
      }
      await this.saveConversations();
    },
    openDeleteGroupDialog(group) {
      if (!group?.id || group.id === 'default') return;
      this.deleteGroupForm = {
        id: group.id,
        name: group.name || '',
        conversationCount: this.conversations.filter(conv => (conv.groupId || 'default') === group.id).length,
      };
      this.showDeleteGroupDialog = true;
    },
    getDeleteGroupWarningText() {
      const count = this.deleteGroupForm?.conversationCount || 0;
      return String(this.t('deleteGroupWillDeleteChats')).replace('{count}', count);
    },
    async deleteConversationById(conversationId, options = {}) {
      const response = await fetch('/api/conversations/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: this.stringifyEntityId(conversationId),
          delete_memory: !!options.deleteMemory,
        }),
      });

      if (!response.ok) {
        throw new Error('delete_failed');
      }

      if (conversationId === this.conversationId) {
        this.conversationId = null;
        this.messages = [{ id: Date.now() + Math.random(), role: 'system', content: this.system_prompt }];
        this.fileLinks = [];
      }

      this.conversations = this.conversations.filter(c => c.id !== conversationId);
    },
    async clearGroupMemoriesByGroupId(groupId) {
      const response = await fetch('/api/group-memory/clear-group', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          group_id: this.stringifyEntityId(groupId),
        }),
      });

      if (!response.ok) {
        throw new Error('delete_failed');
      }
    },
    async clearAllGroupMemories() {
      const response = await fetch('/api/group-memory/clear-all', {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('delete_failed');
      }
    },
    async clearAllHistoryRecords() {
      try {
        await this.$confirm(this.t('confirmClearAllHistory'), this.t('warning'), {
          confirmButtonText: this.t('confirm'),
          cancelButtonText: this.t('cancel'),
          type: 'warning'
        });

        const conversationIds = this.conversations.map(conv => conv.id);
        for (const conversationId of conversationIds) {
          await this.deleteConversationById(conversationId, {
            deleteMemory: true,
          });
        }
        await this.clearAllGroupMemories();

        this.conversationId = null;
        this.messages = [{ id: Date.now() + Math.random(), role: 'system', content: this.system_prompt }];
        this.fileLinks = [];
        this.conversationGroups = [{
          id: 'default',
          name: this.t('defaultConversationGroup'),
          createdAt: 0,
          memoryConfig: {}
        }];
        this.collapsedConversationGroups = { default: false };
        this.activeConversationGroupId = 'default';
        this.draftConversationGroupId = 'default';
        await this.saveConversations();
      } catch (error) {
        if (error?.message === 'delete_failed') {
          showNotification(this.t('deleteFailed') || 'Delete failed', 'error');
        }
      }
    },
    async pruneHistoryToLastWeek() {
      try {
        await this.$confirm(this.t('confirmKeepLastWeek'), this.t('warning'), {
          confirmButtonText: this.t('confirm'),
          cancelButtonText: this.t('cancel'),
          type: 'warning'
        });

        const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
        const expiredConversationIds = this.conversations
          .filter(conv => !conv.timestamp || conv.timestamp < oneWeekAgo)
          .map(conv => conv.id);

        for (const conversationId of expiredConversationIds) {
          await this.deleteConversationById(conversationId, {
            deleteMemory: true,
          });
        }

        if (this.conversations.length === 0) {
          this.conversationId = null;
          this.messages = [{ id: Date.now() + Math.random(), role: 'system', content: this.system_prompt }];
          this.fileLinks = [];
        }

        await this.saveConversations();
      } catch (error) {
        if (error?.message === 'delete_failed') {
          showNotification(this.t('deleteFailed') || 'Delete failed', 'error');
        }
      }
    },
    async deleteConversationGroup(groupId, options = {}) {
      this.ensureConversationGroups();
      if (!groupId || groupId === 'default') return;

      const groupConversationIds = this.conversations
        .filter(conv => (conv.groupId || 'default') === groupId)
        .map(conv => conv.id);

        for (const conversationId of groupConversationIds) {
          await this.deleteConversationById(conversationId, {
            deleteMemory: true,
          });
        }
        await this.clearGroupMemoriesByGroupId(groupId);

        this.conversationGroups = this.conversationGroups.filter(group => group.id !== groupId);

      if (this.draftConversationGroupId === groupId) {
        this.draftConversationGroupId = 'default';
      }
      if (this.activeConversationGroupId === groupId) {
        this.activeConversationGroupId = 'default';
      }

      await this.saveConversations();
      if (!options.silent) {
        showNotification(this.t('groupDeleted'), 'success');
      }
    },

    async clearConversationGroupChats(groupId) {
      this.ensureConversationGroups();
      if (!groupId) return;
      try {
        await this.$confirm(this.t('clearGroupChatsConfirm'), this.t('warning'), {
          confirmButtonText: this.t('confirm'),
          cancelButtonText: this.t('cancel'),
          type: 'warning'
        });

        const groupConversationIds = this.conversations
          .filter(conv => (conv.groupId || 'default') === groupId)
          .map(conv => conv.id);

        for (const conversationId of groupConversationIds) {
          await this.deleteConversationById(conversationId, {
            deleteMemory: true,
          });
        }
        await this.clearGroupMemoriesByGroupId(groupId);

        if (this.conversationId === null) {
          this.messages = [{ id: Date.now() + Math.random(), role: 'system', content: this.system_prompt }];
          this.fileLinks = [];
        }

        await this.saveConversations();
        showNotification(this.t('groupChatsCleared'), 'success');
      } catch (error) {
        if (error?.message === 'delete_failed') {
          showNotification(this.t('deleteFailed') || 'Delete failed', 'error');
        }
      }
    },

    async confirmDeleteGroupDeletion() {
      const groupId = this.deleteGroupForm?.id;
      if (!groupId) return;
      try {
        await this.deleteConversationGroup(groupId);
        this.showDeleteGroupDialog = false;
      } catch (error) {
        showNotification(this.t('deleteFailed') || 'Delete failed', 'error');
      }
    },
    openRenameConversationDialog(conversation) {
      if (!conversation?.id) return;
      this.conversationRenameForm = {
        id: conversation.id,
        name: conversation.title || '',
      };
      this.showConversationRenameDialog = true;
    },
    async submitConversationRename() {
      const name = String(this.conversationRenameForm?.name || '').trim();
      if (!name) {
        showNotification(this.t('conversationNameRequired'), 'error');
        return;
      }
      const conversation = this.conversations.find(conv => conv.id === this.conversationRenameForm?.id);
      if (!conversation) return;
      conversation.title = name;
      await this.saveConversations();
      this.showConversationRenameDialog = false;
      showNotification(this.t('conversationRenamed'), 'success');
    },
    async confirmDeleteConversationDeletion() {
      const conversationId = this.deleteConversationForm?.id;
      if (!conversationId) return;
      try {
        await this.deleteConversationById(conversationId, {
          deleteMemory: !!this.deleteConversationForm?.deleteMemory,
        });
      } catch (error) {
        showNotification(this.t('deleteFailed') || 'Delete failed', 'error');
        return;
      }
      await this.saveConversations();
      this.showDeleteConversationDialog = false;
      showNotification(this.t('conversationDeleted'), 'success');
    },
    async loadConversation(convId) {
      const conversation = this.conversations.find(c => c.id === convId);
      if (conversation) {
        console.log("convid:"+convId);
        this.conversationId = convId;
        this.messages = [...conversation.messages];
        this.fileLinks = conversation.fileLinks;
        this.mainAgent = conversation.mainAgent;
        this.showHistoryDialog = false;
        this.system_prompt = conversation.system_prompt?conversation.system_prompt:" ";
        this.draftConversationGroupId = conversation.groupId || 'default';
        this.activeConversationGroupId = conversation.groupId || 'default';
      }
      else {
        this.system_prompt = " ";
        this.messages = [{ id: Date.now() + Math.random(), role: 'system', content: this.system_prompt }];
      }
      if(this.allBriefly){
        this.messages.forEach((m) => {
          m.briefly = true;
        })
      }else{
        this.messages.forEach((m) => {
          m.briefly = false;
        })
      }
      this.inAutoMode = false; // 重置自动模式状态
      this.requestScrollToBottom();
      this.sendMessagesToExtension(); // 发送消息到插件

      this.autoSaveSettings();
    },
    formatConversationTime(timestamp) {
      if (!timestamp) return '';
      const date = new Date(timestamp);
      const now = new Date();
      if (date.toDateString() === now.toDateString()) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
      return date.toLocaleDateString([], { month: 'numeric', day: 'numeric' });
    },
    // 修改 getConversationPreview，移除沉重的 DOM/正则替换，改用极简截取
    getConversationPreview(conversation) {
      const messages = Array.isArray(conversation?.messages) ? conversation.messages :[];
      const firstUsefulMessage = messages.find(msg => msg && msg.role !== 'system' && msg.content);
      if (!firstUsefulMessage) return this.t('newChat');
      
      // 仅做简单的字符串截取（最高效），或者直接返回首句的纯文本部分
      const rawContent = Array.isArray(firstUsefulMessage.content)
        ? firstUsefulMessage.content.map(item => item?.text || '').join(' ')
        : String(firstUsefulMessage.content);
        
      // 只取前 30 个字符，放弃全局正则替换
      return rawContent.substring(0, 30) + (rawContent.length > 30 ? '...' : '') || this.t('newChat');
    },
    async syncGroupMemoryAfterReply(userMessage, assistantMessage) {
      const groupId = this.activeConversationGroupId || this.draftConversationGroupId || 'default';
      if (!groupId || groupId === 'default') return;
      if (!userMessage?.id || !assistantMessage?.id) return;

      try {
        await fetch('/api/group-memory/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            group_id: this.stringifyEntityId(groupId),
            conversation_id: this.stringifyEntityId(this.conversationId),
            user_message_id: this.stringifyEntityId(userMessage.id),
            assistant_message_id: this.stringifyEntityId(assistantMessage.id),
            user_message: userMessage.pure_content ?? userMessage.content ?? '',
            assistant_message: assistantMessage.pure_content ?? assistantMessage.content ?? '',
          }),
        });
      } catch (error) {
        console.error('Failed to sync group memory:', error);
        showNotification(this.t('memorySyncFailed'), 'error');
      }
    },
    switchToagents() {
      this.activeMenu = 'api-group';
      this.subMenu = 'agents';
      this.activeAgentTab = 'add'
    },
    switchToa2aServers() {
      this.activeMenu = 'toolkit';
      this.subMenu = 'a2a';
    },
    switchToSystemPrompts() {
      this.showEditDialog = false;
      this.activeMenu = 'role';
      this.subMenu = 'memory';
      this.activeMemoryTab = 'prompts';
    },
    async syncProviderConfig(targetConfig) {
      if (targetConfig.selectedProvider) {
        const provider = this.modelProviders.find(
          p => p.id === targetConfig.selectedProvider && !p.disabled
        );
        if (provider) {
          let targetUrl = provider.url;

          // 判断当前同步的对象是否为 ccSettings (通过引用比较)
          // 如果是 CC 配置，则应用特殊的 vendor_list 映射逻辑
          if (targetConfig === this.ccSettings) {
             const vendor_list = {
              "Anthropic": "https://api.anthropic.com/",
              "Deepseek": "https://api.deepseek.com/anthropic/",
              "siliconflow": "https://api.siliconflow.cn/",
              "ZhipuAI":"https://open.bigmodel.cn/api/anthropic/",
              "moonshot":"https://api.moonshot.cn/anthropic/",
              "aliyun": "https://dashscope.aliyuncs.com/apps/anthropic/",
              "modelscope":"https://api-inference.modelscope.cn/",
              "302.AI":"https://api.302.ai/cc/",
              "MiMo":"https://api.xiaomimimo.com/anthropic/",
              "longcat":"https://api.longcat.chat/anthropic/",
              "newapi": provider.url.replace(/\/v1\/?$/, ''),
              "Ollama":provider.url.replace(/\/v1\/?$/, '')
            };
            // 使用映射的 URL，如果没有匹配则回退到默认 url
            targetUrl = vendor_list[provider.vendor] || provider.url;
          }

          // 同步核心配置 (注意：这里比较和赋值时使用 targetUrl)
          const shouldUpdate = 
            targetConfig.model !== provider.modelId ||
            targetConfig.base_url !== targetUrl || // 比较 targetUrl
            targetConfig.api_key !== provider.apiKey;
            
          if (shouldUpdate) {
            targetConfig.model = provider.modelId || '';
            targetConfig.base_url = targetUrl || ''; // 赋值 targetUrl
            targetConfig.api_key = provider.apiKey || '';
            console.log(`已同步 ${provider.vendor} 配置 (CC模式: ${targetConfig === this.ccSettings})`);
          }
        } else {
          // ... (保持原本的清理逻辑不变)
          console.warn('找不到匹配的供应商，已重置配置');
          targetConfig.selectedProvider = null;
          targetConfig.model = '';
          targetConfig.base_url = '';
          targetConfig.api_key = '';
        }
        await this.autoSaveSettings();
      }
    },
    updateMCPExample() {
      this.currentMCPExample = this.mcpExamples[this.newMCPType];
    },
    
    toggleMCPServer(name, status) {
      this.mcpServers[name].disabled = !status
      this.autoSaveSettings()
    },
    switchTomcpServers() {
      this.activeMenu = 'toolkit';
      this.subMenu = 'mcp'
    },
    // 窗口控制
    minimizeWindow() {
      if (isElectron) window.electronAPI.windowAction('minimize');
    },
    maximizeWindow() {
      if (isElectron) window.electronAPI.windowAction('maximize');
    },
    closeWindow() {
      if (isElectron) window.electronAPI.windowAction('close');
    },
    async handleSelect(key) {
      if (key === 'model-config') {
        this.activeMenu = 'model-config';
        this.subMenu = 'service'; // 默认显示第一个子菜单
      }
      else if (key === 'role') {
        this.activeMenu = 'role';
        this.subMenu = 'memory'; // 默认显示第一个子菜单
      }
      else if (key === 'toolkit') {
        this.activeMenu = 'toolkit';
        this.subMenu = 'tools'; // 默认显示第一个子菜单
      }
      else if (key === 'api-group') {
        this.activeMenu = 'api-group';
        this.subMenu = 'openai'; // 默认显示第一个子菜单
      }
      else if (key === 'storage') {
        this.activeMenu = 'storage';
        this.subMenu = 'text'; // 默认显示第一个子菜单
        response = await fetch(`/update_storage`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json'
            }
        });
        if (response.ok) {
          console.log('Storage files updated successfully');
          data = await response.json();
          this.textFiles = data.textFiles;
          this.imageFiles = data.imageFiles;
          this.videoFiles = data.videoFiles;
          this.autoSaveSettings();
        }
        else {
          console.error('Failed to update storage files');
        }
      }
      else if (key === 'deploy-bot') {
        this.activeMenu = 'deploy-bot';
        this.subMenu = 'table_pet'; // 默认显示第一个子菜单
      }
      else if (key === 'system') {
        this.activeMenu = 'system';
        this.subMenu = 'general'; // 默认显示通用设置子页
      }
      else {
        this.activeMenu = key;
      }
      this.activeMenu = key;
    }, 
    toggleIcon() {
      this.isExpanded = !this.isExpanded; // 点击时切换状态
      this.maximizeWindow();
    },

    throttledUpdate(index, newContent) {
      this.messages[index].content = newContent;
      if (!this._pendingRenderContent) this._pendingRenderContent = {};
      this._pendingRenderContent[index] = newContent;

      if (this.renderTimers[index]) return;

      this.renderTimers[index] = setTimeout(() => {
        const latestContent = this._pendingRenderContent[index];
        if (latestContent !== undefined) {
          this.messages[index].renderedHtml = this.formatMessage(latestContent, index);
        }
        this.renderTimers[index] = null;
        this._pendingRenderContent[index] = undefined;
      }, 16);
    },


preprocessEntertainmentText(content) {
  if (!content) return '';

  let formatted = content;

  // ============================================================
  // 【核心修复】自定义元数据标签与中文角色标签净化（如 <user=...>, <星莱>, </星莱>）
  // ============================================================
  const preservedHtmlTags = '(?:div|span|p|br|a|img|strong|em|code|pre|ul|ol|li|h[1-6]|blockquote|table|thead|tbody|tr|th|td|iframe|video|audio|canvas|svg|path|section|button|i|details|summary|think)';
  
  // 1. 过滤原始自定义标签（如 <星莱> 或 <user=派酱 ...>）
  // 仅匹配非白名单、且符合标签命名规范的节点，完美避开 “a < b” 这种普通数学公式
  const customTagRegex = new RegExp(`<\\/?(?!(?:${preservedHtmlTags})\\b)[a-zA-Z0-9\\u4e00-\\u9fa5_-]+[^>]*>`, 'gi');
  formatted = formatted.replace(customTagRegex, '');

  // 2. 过滤转义或被 LaTeX 机制转换后的自定义标签（如 \lt 星莱\gt 或 \lt /星莱\gt）
  const escapedCustomTagRegex = new RegExp(`(?:&lt;|\\\\lt\\b|\\\\lt\\s+)(?:\\/)?(?!(?:${preservedHtmlTags})\\b)([a-zA-Z0-9\\u4e00-\\u9fa5_-]+)[^&\\\\\\n]*(?:&gt;|\\\\gt\\b)`, 'gi');
  formatted = formatted.replace(escapedCustomTagRegex, '');


  // ============================================================
  // 1. 强力图片隔离：匹配文本中的图片（支持 silence 标签包裹及各种空白符）
  // 无论 AI 换行了几次、或者完全忘记换行，强行在其前后注入双换行符 (\n\n)
  // ============================================================
  formatted = formatted.replace(/(<silence>\s*)?(!\[.*?\]\([^\)]+\))(\s*<\/silence>)?/gi, '\n\n$1$2$3\n\n');

  // ============================================================
  // 2. 连续换行符压缩：收缩因强行注入或 AI 多次换行产生的冗余换行
  // 确保最终 Markdown 编译时，各元素之间只有标准的一个空行
  // ============================================================
  formatted = formatted.replace(/\n{3,}/g, '\n\n');

  // ============================================================
  // 3. UI 标签净化：在渲染阶段彻底移除 <silence> 与 </silence>
  // 避免其以纯文本或未知 HTML 标签的形式在气泡内残留，确保界面纯净
  // ============================================================
  formatted = formatted.replace(/<\/?silence>/gi, '');

  // ============================================================
  // 4. 娱乐模式智能换行：避开表格、列表、标题等排版结构，防止破坏 Markdown 渲染
  // ============================================================
  if (this.systemSettings && this.systemSettings.chatMode === 'entertainment') {
    const lines = formatted.split('\n');
    const processedLines = [];
    
    for (let i = 0; i < lines.length; i++) {
      const currentLine = lines[i].trim();
      const nextLine = (lines[i + 1] || '').trim();

      processedLines.push(lines[i]);

      if (i < lines.length - 1) {
        // 判断是否属于表格行
        const isCurrentTable = currentLine.includes('|');
        const isNextTable = nextLine.includes('|');

        // 判断是否是无序列表、有序列表或引用（如 `- `, `* `, `+ `, `1. `, `> `）
        const structurePattern = /^([-*+>]|\d+\.)\s/;
        const isCurrentStructure = structurePattern.test(currentLine);
        const isNextStructure = structurePattern.test(nextLine);

        // 判断是否是 Markdown 标题行
        const headingPattern = /^#{1,6}\s/;
        const isCurrentHeading = headingPattern.test(currentLine);
        const isNextHeading = headingPattern.test(nextLine);

        // 判断当前或下一行是否本身就是空行
        const isCurrentEmpty = currentLine === '';
        const isNextEmpty = nextLine === '';

        if (!isCurrentTable && !isNextTable && 
            !isCurrentStructure && !isNextStructure && 
            !isCurrentHeading && !isNextHeading &&
            !isCurrentEmpty && !isNextEmpty) {
          processedLines.push('');
        }
      }
    }
    formatted = processedLines.join('\n');
  }

  return formatted;
},

formatMessage(content, index) {
  if (!content) return '';

  // ============================================================
  // 【核心修复】自定义元数据标签与中文角色标签净化（如 <user=...>, <星莱>, </星莱>）
  // 在最开始拦截并清除，防止其被 LaTeX 保护机制混淆成 \lt 字符
  // ============================================================
  let processedForRender = content;
  
  const preservedHtmlTags = '(?:div|span|p|br|a|img|strong|em|code|pre|ul|ol|li|h[1-6]|blockquote|table|thead|tbody|tr|th|td|iframe|video|audio|canvas|svg|path|section|button|i|details|summary|think)';
  
  // 1. 过滤原始自定义标签（如 <星莱> 或 <user=派酱 ...>）
  const customTagRegex = new RegExp(`<\\/?(?!(?:${preservedHtmlTags})\\b)[a-zA-Z0-9\\u4e00-\\u9fa5_-]+[^>]*>`, 'gi');
  processedForRender = processedForRender.replace(customTagRegex, '');

  // 2. 过滤转义或被 LaTeX 机制转换后的自定义标签（如 \lt 星莱\gt 或 \lt /星莱\gt）
  const escapedCustomTagRegex = new RegExp(`(?:&lt;|\\\\lt\\b|\\\\lt\\s+)(?:\\/)?(?!(?:${preservedHtmlTags})\\b)([a-zA-Z0-9\\u4e00-\\u9fa5_-]+)[^&\\\\\\n]*(?:&gt;|\\\\gt\\b)`, 'gi');
  processedForRender = processedForRender.replace(escapedCustomTagRegex, '');

  processedForRender = processedForRender.trimEnd(); 
  
  const lines = processedForRender.split('\n');
  const lastLine = lines[lines.length - 1].trim();

  if (lastLine.startsWith('|') && !lastLine.endsWith('|') && !/^[|\s-:]+$/.test(lastLine)) {
    processedForRender += ' |';
  }

  // --- 预处理阶段 ---
  const parts = this.splitCodeAndText(processedForRender);
  let inUnclosedCodeBlock = false;

  let processedContent = parts.map(part => {
    if (part.type === 'code') {
      inUnclosedCodeBlock = !part.closed;
      return part.content; 
    } else if (inUnclosedCodeBlock) {
      return part.content; 
    } else {
      let formatted = part.content;

      // ============================================================
      // 娱乐模式下：智能单换行符（\n）转换为双换行符（\n\n）
      // 避开表格、列表、标题、引用等结构，防止破坏排版
      // ============================================================
      if (this.systemSettings && this.systemSettings.chatMode === 'entertainment') {
        const linesList = formatted.split('\n');
        const processedLines = [];
        
        for (let i = 0; i < linesList.length; i++) {
          const currentLine = linesList[i].trim();
          const nextLine = (linesList[i + 1] || '').trim();

          processedLines.push(linesList[i]);

          if (i < linesList.length - 1) {
            // 1. 判断是否属于表格行（包含 | 符号）
            const isCurrentTable = currentLine.includes('|');
            const isNextTable = nextLine.includes('|');

            // 2. 判断是否是无序列表、有序列表或引用（如 `- `, `* `, `+ `, `1. `, `> `）
            const structurePattern = /^([-*+>]|\d+\.)\s/;
            const isCurrentStructure = structurePattern.test(currentLine);
            const isNextStructure = structurePattern.test(nextLine);

            // 3. 判断是否是 Markdown 标题行（# ）
            const headingPattern = /^#{1,6}\s/;
            const isCurrentHeading = headingPattern.test(currentLine);
            const isNextHeading = headingPattern.test(nextLine);

            // 4. 判断当前或下一行是否本身就是空行（避免产生过大空白）
            const isCurrentEmpty = currentLine === '';
            const isNextEmpty = nextLine === '';

            // 只有当当前行和下一行都不是上述排版结构时，才进行双换行处理
            if (!isCurrentTable && !isNextTable && 
                !isCurrentStructure && !isNextStructure && 
                !isCurrentHeading && !isNextHeading &&
                !isCurrentEmpty && !isNextEmpty) {
              processedLines.push('');
            }
          }
        }
        formatted = processedLines.join('\n');
      }

      // ============================================================
      // 【新增】图片强制分离逻辑
      // 匹配文本中的图片（包含可能有 `<silence>` 包裹的情况），强行在其前后注入双换行符
      // ============================================================
      formatted = formatted.replace(/(<silence>)?(!\[.*?\]\([^\)]+\))(<\/silence>)?/g, '\n\n$1$2$3\n\n');

      // 收缩可能因为强行注入而产生的多余连续换行符，确保 Markdown 格式紧凑
      formatted = formatted.replace(/\n{3,}/g, '\n\n');

      // ============================================================
      // 【新增】UI 屏蔽过滤：彻底移除 <silence> 与 </silence> 标签
      // 由于此正则仅在 formatMessage 这一渲染管道内运行，因此绝对不影响
      // 底层 TTS 合成引擎（其直接读取原始 content/pure_content 文本流）
      // ============================================================
      formatted = formatted.replace(/<\/?silence>/gi, '');

      // ============================================================
      // LaTeX 公式保护机制
      // 防止公式内部的 < 和 > 被后续的 HTML 标签过滤正则误杀
      // ============================================================
      formatted = formatted.replace(/\$\$([\s\S]*?)(?:\$\$|$)|\$([^\$\n]+)\$/g, function(match) {
        return match.replace(/</g, '\\lt ').replace(/>/g, '\\gt ');
      });

      // ============================================================
      // 智能标签过滤
      // ============================================================
      const anyTagRegex = /<(\/?)([^\s>/>]+)([^>]*)>/g;
      formatted = formatted.replace(anyTagRegex, (match, slash, tagName, attrs) => {
        const lowerTagName = tagName.toLowerCase();
        if (lowerTagName === 'think') return match;
        const isStandardHtmlName = /^[a-zA-Z][a-zA-Z0-9-]*$/.test(tagName);
        if (isStandardHtmlName) {
          return match;
        } else {
          return ''; 
        }
      });

      // ============================================================
      // 处理 <think> 标签的 UI 转换
      // ============================================================
      const thinkTagRegexWithClose = /<think>([\s\S]*?)<\/think>/g;
      const thinkTagRegexOpenOnly = /<think>[\s\S]*$/;
      
      formatted = formatted
        .replace(thinkTagRegexWithClose, match => 
          match.replace('<think>', '<div class="highlight-block-reasoning">').replace('</think>', '</div>')
        )
        .replace(thinkTagRegexOpenOnly, match => 
          match.replace('<think>', '<div class="highlight-block-reasoning">')
        );

      return formatted;
    }
  }).join('');

  let rendered = md.render(processedContent);

  // --- 恢复阶段 ---
  rendered = rendered.replace(/\\\`/g, '`').replace(/\\\$/g, '$');

  // 注意增加对 currentMsg 存在的判断
  const currentMsg = this.messages && index >= 0 ? this.messages[index] : null;
  if (currentMsg && index === this.messages.length - 1 && currentMsg.role === 'assistant' && this.isTyping && currentMsg.content !== currentMsg.pure_content) {
    rendered = `<div class="thinking-header"><i class="fa-solid fa-lightbulb"></i> ${this.t('thinking')}</div>` + rendered;
  }

  // --- 后处理 ---
  this.$nextTick(() => {
    if(typeof this.initCopyButtons === 'function') this.initCopyButtons();
    if(typeof this.initPreviewButtons === 'function') this.initPreviewButtons();
  });

  rendered = rendered.replace(/<a\s+(?:[^>]*?\s+)?href="([^"]*)"([^>]*)>/g, (match, href, otherAttrs) => {
    if (otherAttrs.includes('footnote-ref') || otherAttrs.includes('footnote-backref') || href.startsWith('#')) {
      return match; 
    }
    const formattedHref = typeof this.formatFileUrl === 'function' ? this.formatFileUrl(href) : href;
    return `<a href="${formattedHref}" target="_blank"${otherAttrs}>`;
  });

  return rendered;
},

    formatMessageWrapper(content) {
        // 调用您现有的 formatMessage，这里传 index = -1 避免产生副作用（如 thinking 图标）
        return this.formatMessage(content, -1); 
    },
    copyLink(uniqueFilename) {
      const url = `${this.partyURL}/uploaded_files/${uniqueFilename}`
      navigator.clipboard.writeText(url)
        .then(() => {
          showNotification(this.t('copy_success'))
        })
        .catch(() => {
          showNotification(this.t('copy_failed'), 'error')
        })
    },
    copyApiKey(apiKey){
      navigator.clipboard.writeText(apiKey)
        .then(() => {
          showNotification(this.t('copy_success'))
        })
        .catch(() => {
          showNotification(this.t('copy_failed'), 'error')
        })
    },
    copyProvider(provider,index){
      // 在this.modelProviders的index之后插入一个复制版本
      this.modelProviders.splice(index + 1, 0, { ...provider, id: Date.now() });
      this.autoSaveSettings();
    },
    previewImage(img) {
      this.previewImageUrl = `${this.partyURL}/uploaded_files/${img.unique_filename}`
      this.previewVisible = true
      console.log(this.previewImageUrl)
    },
    copyMessageContent(message) {
      // 获取原始内容（用户消息直接复制，AI消息复制原始markdown）
      let content = message.role === 'user' 
        ? message.content 
        : message.pure_content || message.rawContent || message.content;
      // 处理文件链接
      if (message.fileLinks?.length) {
        content += '\n\n' + message.fileLinks.map(link => `[${link.name}](${link.path})`).join('\n');
      }
      navigator.clipboard.writeText(content)
        .then(() => showNotification(this.t('copy_success')))
        .catch(() => showNotification(this.t('copy_failed'), 'error'));
    },
    initPreviewButtons() {
      // 清理旧事件监听器
      if (this._previewEventHandler) {
        document.body.removeEventListener('click', this._previewEventHandler);
      }
      // 主事件处理器
      this._previewEventHandler = (e) => {
        const button = e.target.closest('.preview-button');
        if (!button) return;
        e.preventDefault();
        e.stopPropagation();
        console.debug('🏁 预览按钮触发:', button);
        // 获取代码上下文
        const codeBlock = button.closest('.code-block');
        if (!codeBlock) {
          console.error('❌ 未找到代码块容器');
          return;
        }
        // 获取代码内容
        const lang = button.dataset.lang;
        const codeContent = codeBlock.querySelector('code')?.textContent?.trim();
        if (!codeContent) {
          console.warn('⚠️ 空代码内容', codeBlock);
          this.showErrorToast('代码内容为空');
          return;
        }
        // codeBlock中查找/创建预览容器
        let previewContainer = codeBlock.querySelector('.preview-container');
        const isNewContainer = !previewContainer;
        
        if (isNewContainer) {
          previewContainer = document.createElement('div');
          previewContainer.className = 'preview-container loading';
          codeBlock.appendChild(previewContainer);
        }
        // 状态切换逻辑
        if (previewContainer.classList.contains('active')) {
          this.collapsePreview(previewContainer, button);
        } else {
          this.expandPreview({ previewContainer, button, lang, codeContent });
        }
      };
      // 绑定事件监听
      document.body.addEventListener('click', this._previewEventHandler);
      //console.log('🔧 预览按钮事件监听已初始化');
    },
    // 展开预览面板
    expandPreview({ previewContainer, button, lang, codeContent }) {
      console.log('🔼 展开预览:', { lang, length: codeContent.length });
      
      const codeBlock = button.closest('.code-block');
  
      // 检查是否已有预览
      const existingPreview = codeBlock.querySelector('.preview-container.active');
      if (existingPreview) {
        this.collapsePreview(existingPreview, button);
        return;
      }
      // 标记代码块状态
      codeBlock.dataset.previewActive = "true";
      
      // 隐藏代码内容
      const codeContentDiv = codeBlock.querySelector('.code-content');
      codeContentDiv.style.display = 'none';
      
      // 更新按钮状态
      button.innerHTML = '<i class="fa-solid fa-eye-slash"></i>';
      
      previewContainer.classList.add('active', 'loading');
      if (lang === 'mermaid'){
        previewContainer.style.width =  '85vw';
      }
      
      // 渲染内容
      requestAnimationFrame(() => {
        try {
          if (lang === 'html') {
            this.renderHtmlPreview(previewContainer, codeContent);
            // 动态调整iframe高度
            const iframe = previewContainer.querySelector('iframe');
            iframe.onload = () => {
              iframe.style.height = iframe.contentWindow.document.body.scrollHeight + 'px';
            };
          } else if (lang === 'mermaid') {
            this.renderMermaidPreview(previewContainer, codeContent).then(() => {
              // Mermaid渲染完成后调整高度
              const svg = previewContainer.querySelector('svg');
              if (svg) {
                previewContainer.style.minHeight = svg.getBBox().height + 'px';
              }
            });
          }
          previewContainer.classList.remove('loading');
        } catch (err) {
          console.error('🚨 预览渲染失败:', err);
          this.showPreviewError(previewContainer, err);
        }
      });
    },
    // 修改 collapsePreview 方法
    collapsePreview(previewContainer, button) {
      console.log('🔽 收起预览');
      
      const codeBlock = previewContainer.parentElement;
  
      // 重置代码块状态
      delete codeBlock.dataset.previewActive;
      
      // 显示代码内容
      const codeContentDiv = codeBlock.querySelector('.code-content');
      codeContentDiv.style.display = 'block';
      
      // 移除预览容器
      previewContainer.remove();
      
      // 重置按钮状态
      button.innerHTML = '<i class="fa-solid fa-eye"></i>';
    },
    // HTML渲染器
    renderHtmlPreview(container, code) {
      console.log('🌐 渲染HTML预览');
      
      const sandbox = document.createElement('iframe');
      sandbox.srcdoc = `<!DOCTYPE html>
        <html>
          <head>
            <base href="/">
          </head>
          <body>${code}</body>
        </html>`;
      
      sandbox.style.cssText = `
        width: 70vw;
        height: 70vh;
        border: none;
        border-radius: 8px;
        background: transparent;
      `;
      
      container.replaceChildren(sandbox);
    },
    // Mermaid渲染器（带重试机制）
    async renderMermaidPreview(container, code) {
      console.log('📊 渲染Mermaid图表');
      
      const diagramContainer = document.createElement('div');
      diagramContainer.className = 'mermaid-diagram';
      container.replaceChildren(diagramContainer);
      // 异步渲染逻辑
      let retryCount = 0;
      const maxRetries = 3;
      
      const attemptRender = async () => {
        try {
          diagramContainer.textContent = code;
          await mermaid.run({
            nodes: [diagramContainer],
            suppressErrors: false
          });
          console.log('✅ Mermaid渲染成功');
        } catch (err) {
          if (retryCount < maxRetries) {
            retryCount++;
            console.warn(`🔄 重试渲染 (${retryCount}/${maxRetries})`);
            diagramContainer.innerHTML = '';
            await new Promise(resolve => setTimeout(resolve, 500 * retryCount));
            await attemptRender();
          } else {
            throw new Error(`Mermaid渲染失败: ${err.message}`);
          }
        }
      };
      await attemptRender();
    },
    // 错误处理
    showPreviewError(container, error) {
      container.classList.add('error');
      container.innerHTML = `
        <div class="error-alert">
          <i class="fa-solid fa-triangle-exclamation"></i>
          <div>
            <h4>预览渲染失败</h4>
            <code>${error.message}</code>
          </div>
        </div>
      `;
    },
    // 新增方法：检测未闭合代码块
    hasUnclosedCodeBlock(parts) {
      return parts.some(p => p.type === 'code' && !p.closed);
    },

    splitCodeAndText(content) {
      const codeFenceRegex = /(```[\s\S]*?)(?:```|$)/g; // 修改正则表达式
      const parts = [];
      let lastIndex = 0;
      let hasUnclosed = false;

      // 处理代码块
      let match;
      while ((match = codeFenceRegex.exec(content)) !== null) {
        const textBefore = content.slice(lastIndex, match.index);
        if (textBefore) parts.push({ type: 'text', content: textBefore });

        // 判断是否闭合
        const isClosed = match[0].endsWith('```');
        const codeContent = isClosed ? 
          match[0] : 
          match[0] + '\n```'; // 自动补全闭合

        parts.push({
          type: 'code',
          content: codeContent,
          closed: isClosed
        });

        lastIndex = codeFenceRegex.lastIndex;
        hasUnclosed = !isClosed;
      }

      // 处理剩余内容
      const remaining = content.slice(lastIndex);
      if (remaining) {
        if (hasUnclosed) {
          // 将剩余内容视为代码块
          parts.push({
            type: 'code',
            content: remaining + '\n```',
            closed: false
          });
        } else {
          parts.push({ type: 'text', content: remaining });
        }
      }

      return parts;
    },
    initDownloadButtons() {
        document.body.addEventListener('click', async (e) => {
            const button = e.target.closest('.download-button');
            if (!button) return;
            const lang = button.dataset.lang;
            const codeBlock = button.closest('.code-block');
            const previewButton = codeBlock.querySelector('.preview-button');
            const existingPreview = codeBlock.querySelector('.preview-container.active');
            // 如果previewButton不在预览状态，则执行预览操作
            if (!existingPreview) {
                // 触发预览按钮的点击事件
                previewButton.click();
                // 等待预览完成
                await new Promise(resolve => setTimeout(resolve, 500)); // 根据实际情况调整延时
            }
            const previewContainer = codeBlock.querySelector('.preview-container');
            try {
                if (lang === 'mermaid') {
                    // 使用html2canvas来截图
                    html2canvas(previewContainer, {
                        // 如果Mermaid图表面板有滚动条，你可能需要设置宽度和高度
                        width: previewContainer.offsetWidth,
                        height: previewContainer.offsetHeight,
                    }).then(canvas => {
                        canvas.toBlob(blob => {
                            this.triggerDownload(blob, 'mermaid-diagram.png');
                        });
                    }).catch(error => {
                        console.error('截图失败:', error);
                        showNotification('截图失败，请检查控制台', 'error');
                    });
                }
                else if (lang === 'html') {
                    const iframe = previewContainer.querySelector('iframe');
                    const canvas = await html2canvas(iframe.contentDocument.body);
                    canvas.toBlob(blob => {
                        this.triggerDownload(blob, 'html-preview.png');
                    });
                }
            } catch (error) {
                console.error('下载失败:', error);
                showNotification('下载失败，请检查控制台', 'error');
            }
        });
    },

    triggerDownload(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },
    
    handleCopy(event) {
      const button = event.target.closest('.copy-button')
      if (button) {
        const codeBlock = button.closest('.code-block')
        const codeContent = codeBlock?.querySelector('code')?.textContent || ''
        
        navigator.clipboard.writeText(codeContent).then(() => {
          showNotification(this.t('copy_success'))
        }).catch(() => {
          showNotification(this.t('copy_failed'), 'error')
        })
        
        event.stopPropagation()
        event.preventDefault()
      }
    },
    
    initCopyButtons() {
      // 移除旧的ClipboardJS初始化代码
      document.querySelectorAll('.copy-button').forEach(btn => {
        btn.removeEventListener('click', this.handleCopy)
        btn.addEventListener('click', this.handleCopy)
      })
    },  
    // 滚动到最新消息
    /* 判断元素是否接近底部 */
    isElemNearBottom(el, threshold = 300) {
      if (!el) return true;               // 元素不存在就默认“需要滚底”
      return el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
    },

      /* ==========================================
       滚动区域逻辑优化（支持内部区块跟随滚动）
       ========================================== */
    scrollToBottom() {
      this.$nextTick(() => {
        const container = this.$refs.messagesContainer;
        if (container) {
          // 1. 滚动外层主容器
          if (this.isElemNearBottom(container) || this.isForceScrollToBottom) {
            container.scrollTop = container.scrollHeight;
          }
          
          // 2. 滚动内层带有滚动条的区块 (工具代码块、思考过程块)
          const innerBlocks = container.querySelectorAll('.sp-code, .type-reasoning .sp-content');
          innerBlocks.forEach(block => {
            if (block.scrollHeight > block.clientHeight) {
              // 同样复用 isElemNearBottom 判断，如果用户没故意往上翻，就自动贴底
              if (this.isElemNearBottom(block) || this.isForceScrollToBottom) {
                block.scrollTop = block.scrollHeight;
              }
            }
          });
        }
      });
      
      this.scrollPanelToBottom();
      // 兼容你原有的写法
      if (typeof isElectron !== 'undefined' ? isElectron : this.isElectron) {
        this.browserPanelToBottom();
      }
    },

    /* 侧边栏滚动 */
    scrollPanelToBottom() {
      this.$nextTick(() => {
        const panel = this.$refs.messagesPanel;
        if (panel) {
          // 1. 滚动侧边栏外层容器
          if (this.isElemNearBottom(panel) || this.isForceScrollToBottom) {
            panel.scrollTop = panel.scrollHeight;
          }

          // 2. 滚动侧边栏内层区块
          const innerBlocks = panel.querySelectorAll('.sp-code, .type-reasoning .sp-content');
          innerBlocks.forEach(block => {
            if (block.scrollHeight > block.clientHeight) {
              if (this.isElemNearBottom(block) || this.isForceScrollToBottom) {
                block.scrollTop = block.scrollHeight;
              }
            }
          });
        }
      });
    },

    /* 独立浏览器面板滚动 */
    browserPanelToBottom() {
      this.$nextTick(() => {
        const panel = this.$refs.browserMessagesContainer;
        if (panel) {
          // 1. 滚动独立面板外层容器
          if (this.isElemNearBottom(panel) || this.isForceScrollToBottom) {
            panel.scrollTop = panel.scrollHeight;
          }

          // 2. 滚动独立面板内层区块
          const innerBlocks = panel.querySelectorAll('.sp-code, .type-reasoning .sp-content');
          innerBlocks.forEach(block => {
            if (block.scrollHeight > block.clientHeight) {
              if (this.isElemNearBottom(block) || this.isForceScrollToBottom) {
                block.scrollTop = block.scrollHeight;
              }
            }
          });
        }
      });
    },
    changeMainAgent(agent) {
      this.mainAgent = agent;
      if (agent === 'super-model') {
        this.system_prompt = " "
      }
      else {
        this.system_prompt = this.agents[agent].system_prompt;
        console.log(this.system_prompt);
      }
      this.syncSystemPromptToMessages(this.system_prompt);
    },
    async changeQQAgent(agent) {
      this.qqBotConfig.QQAgent = agent;
      await this.autoSaveSettings();
    },
    // WebSocket相关
    initWebSocket() {
      const http_protocol = window.location.protocol;
      const ws_protocol = http_protocol === 'https:' ? 'wss:' : 'ws:';
      const ws_url = `${ws_protocol}//${window.location.host}/ws`;

      this.ws = new WebSocket(ws_url);

      // 设置心跳间隔和重连间隔（单位：毫秒）
      const HEARTBEAT_INTERVAL = 10000; // 每10秒发送一次 ping
      const RECONNECT_INTERVAL = 5000;  // 断开后每5秒尝试重连一次

      let heartbeatTimer = null;
      let reconnectTimer = null;

      const startHeartbeat = () => {
        heartbeatTimer = setInterval(() => {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            try {
              this.ws.send(JSON.stringify({ type: 'ping' })); // 发送心跳包
            } catch (e) {
              console.error('Failed to send ping:', e);
            }
          }
        }, HEARTBEAT_INTERVAL);
      };

      const stopHeartbeat = () => {
        if (heartbeatTimer) {
          clearInterval(heartbeatTimer);
          heartbeatTimer = null;
        }
      };

      const scheduleReconnect = () => {
        stopHeartbeat();
        if (!reconnectTimer) {
          reconnectTimer = setTimeout(() => {
            console.log('Reconnecting WebSocket...');
            this.initWebSocket(); // 重新初始化
            reconnectTimer = null;
          }, RECONNECT_INTERVAL);
        }
      };

      // WebSocket 打开事件
      this.ws.onopen = () => {
        console.log('WebSocket connection established');
        stopHeartbeat(); // 防止重复心跳
        startHeartbeat();
      };

      // 接收消息
      this.ws.onmessage = async (event) => {
        let data;
        try {
          data = JSON.parse(event.data);
        } catch (e) {
          console.log('Message from server:', event.data);
          return;
        }

      if (data.type === 'pong') {
        // 可以在这里处理 pong 回复，比如记录状态
        console.log('Received pong from server.');
      } 
      else if (data.type === 'behavior') {
          this.behaviorSettings = data.data.behaviorSettings || this.behaviorSettings;
          this.autoSaveSettings();
      }
      else if (data.type === 'settings_update') {
          this.settings = {
            model: data.data.model || '',
            base_url: data.data.base_url || '',
            api_key: data.data.api_key || '',
            temperature: data.data.temperature || 0.7,
            max_tokens: data.data.max_tokens || 4096,
            max_rounds: data.data.max_rounds || 0,
            selectedProvider: data.data.selectedProvider || '',
            top_p: data.data.top_p || 1,
            reasoning_effort: data.data.reasoning_effort || null,
            enableOmniTTS: data.data.enableOmniTTS || false,
            omniVoice: data.data.omniVoice || 'Cherry',
            extra_params: data.data.extra_params || [],
          };
          this.qqBotConfig = data.data.qqBotConfig || this.qqBotConfig;
          this.feishuBotConfig = data.data.feishuBotConfig || this.feishuBotConfig;
          this.wechatBotConfig = data.data.wechatBotConfig || this.wechatBotConfig;
          this.weComBotConfig = data.data.weComBotConfig || this.weComBotConfig;
          this.dingtalkBotConfig = data.data.dingtalkBotConfig || this.dingtalkBotConfig;
          this.discordBotConfig = data.data.discordBotConfig || this.discordBotConfig;
          this.telegramBotConfig = data.data.telegramBotConfig || this.telegramBotConfig;
          this.slackBotConfig = data.data.slackBotConfig || this.slackBotConfig;
          this.targetLangSelected = data.data.targetLangSelected || this.targetLangSelected;
          this.BotConfig = data.data.BotConfig || this.BotConfig;
          this.liveConfig = data.data.liveConfig || this.liveConfig;
          this.WXBotConfig = data.data.WXBotConfig || this.WXBotConfig;
          this.stickerPacks = data.data.stickerPacks || this.stickerPacks;
          this.toolsSettings = data.data.tools || this.toolsSettings;
          this.llmTools = data.data.llmTools || this.llmTools;
          this.reasonerSettings = data.data.reasoner || this.reasonerSettings;
          this.fastSettings = data.data.fast || this.fastSettings;
          this.visionSettings = data.data.vision || this.visionSettings;
          this.webSearchSettings = data.data.webSearch || this.webSearchSettings;
          this.codeSettings = data.data.codeSettings || this.codeSettings;
          this.CLISettings = data.data.CLISettings || this.CLISettings;
          this.acpSettings = data.data.acpSettings || this.acpSettings;
          this.visionControlSettings = data.data.visionControlSettings || this.visionControlSettings;
          this.loveSettings = data.data.loveSettings || this.loveSettings;
          this.diarySettings = data.data.diarySettings || this.diarySettings;
          this.ccSettings = data.data.ccSettings || this.ccSettings;
          this.qcSettings = data.data.qcSettings || this.qcSettings;
          this.dsSettings = data.data.dsSettings || this.dsSettings;
          this.localEnvSettings = data.data.localEnvSettings || this.localEnvSettings;
          this.ocSettings = data.data.ocSettings || this.ocSettings;
          this.HASettings = data.data.HASettings || this.HASettings;
          this.chromeMCPSettings = data.data.chromeMCPSettings || this.chromeMCPSettings;
          this.sqlSettings = data.data.sqlSettings || this.sqlSettings;
          this.KBSettings = data.data.KBSettings || this.KBSettings;
          this.mcpServers = data.data.mcpServers || this.mcpServers;
          this.a2aServers = data.data.a2aServers || this.a2aServers;
          this.memories = data.data.memories || this.memories;
          this.memorySettings = data.data.memorySettings || this.memorySettings;
          this.text2imgSettings = data.data.text2imgSettings || this.text2imgSettings;
          this.ttsSettings = data.data.ttsSettings || this.ttsSettings;
          if (isSteamBuild) {
            if (this.ttsSettings.engine === 'edgetts') this.ttsSettings.engine = 'systemtts';
            if (this.text2imgSettings.engine === 'pollinations') this.text2imgSettings.engine = 'openai';
            this.systemSettings.contentSafety = true;
          }
          this.behaviorSettings = data.data.behaviorSettings || this.behaviorSettings;
          this.VRMConfig = data.data.VRMConfig || this.VRMConfig;
          this.THAConfig = data.data.THAConfig || this.THAConfig;
          this.comfyuiServers = data.data.comfyuiServers || this.comfyuiServers;
          this.comfyuiAPIkey = data.data.comfyuiAPIkey || this.comfyuiAPIkey;
          this.workflows = data.data.workflows || this.workflows;
          this.customHttpTools = data.data.custom_http || this.customHttpTools;
          this.systemSettings = data.data.systemSettings || this.systemSettings;
          if (isSteamBuild && !this.systemSettings.contentSafety) this.systemSettings.contentSafety = true;
      }
      else if (data.type === 'settings') {
          this.ensureConversationGroups();
          this.isdocker = data.data.isdocker || false;
          this.settings = {
            model: data.data.model || '',
            base_url: data.data.base_url || '',
            api_key: data.data.api_key || '',
            temperature: data.data.temperature || 0.7,
            max_tokens: data.data.max_tokens || 4096,
            max_rounds: data.data.max_rounds || 0,
            selectedProvider: data.data.selectedProvider || '',
            top_p: data.data.top_p || 1,
            reasoning_effort: data.data.reasoning_effort || null,
            enableOmniTTS: data.data.enableOmniTTS || false,
            omniVoice: data.data.omniVoice || 'Cherry',
            extra_params: data.data.extra_params || [],
          };
          this.isBtnCollapse = data.data.isBtnCollapse || false;
          this.showHistorySidebar = data.data.showHistorySidebar || false;
          this.system_prompt = data.data.system_prompt || '';
          this.SystemPromptsList = data.data.SystemPromptsList || [];
          this.conversations = data.data.conversations || this.conversations;
          this.conversationGroups = data.data.conversationGroups || this.conversationGroups;
          this.conversationId = data.data.conversationId || this.conversationId;
          this.agents = data.data.agents || this.agents;
          this.mainAgent = data.data.mainAgent || this.mainAgent;
          this.qqBotConfig = data.data.qqBotConfig || this.qqBotConfig;
          this.feishuBotConfig = data.data.feishuBotConfig || this.feishuBotConfig;
          this.wechatBotConfig = data.data.wechatBotConfig || this.wechatBotConfig;
          this.weComBotConfig = data.data.weComBotConfig || this.weComBotConfig;
          this.dingtalkBotConfig = data.data.dingtalkBotConfig || this.dingtalkBotConfig;
          this.discordBotConfig = data.data.discordBotConfig || this.discordBotConfig;
          this.telegramBotConfig = data.data.telegramBotConfig || this.telegramBotConfig;
          this.slackBotConfig = data.data.slackBotConfig || this.slackBotConfig;
          this.targetLangSelected = data.data.targetLangSelected || this.targetLangSelected;
          this.allBriefly = data.data.allBriefly || this.allBriefly;
          this.isForceScrollToBottom = data.data.isForceScrollToBottom || this.isForceScrollToBottom;
          this.BotConfig = data.data.BotConfig || this.BotConfig;
          this.liveConfig = data.data.liveConfig || this.liveConfig;
          this.WXBotConfig = data.data.WXBotConfig || this.WXBotConfig;
          this.stickerPacks = data.data.stickerPacks || this.stickerPacks;
          this.toolsSettings = data.data.tools || this.toolsSettings;
          this.llmTools = data.data.llmTools || this.llmTools;
          this.reasonerSettings = data.data.reasoner || this.reasonerSettings;
          this.fastSettings = data.data.fast || this.fastSettings;
          this.visionSettings = data.data.vision || this.visionSettings;
          this.webSearchSettings = data.data.webSearch || this.webSearchSettings;
          this.codeSettings = data.data.codeSettings || this.codeSettings;
          this.CLISettings = data.data.CLISettings || this.CLISettings;
          this.acpSettings = data.data.acpSettings || this.acpSettings;
          this.visionControlSettings = data.data.visionControlSettings || this.visionControlSettings;
          this.loveSettings = data.data.loveSettings || this.loveSettings;
          this.diarySettings = data.data.diarySettings || this.diarySettings;
          this.ccSettings = data.data.ccSettings || this.ccSettings;
          this.qcSettings = data.data.qcSettings || this.qcSettings;
          this.dsSettings = data.data.dsSettings || this.dsSettings;
          this.localEnvSettings = data.data.localEnvSettings || this.localEnvSettings;
          this.ocSettings = data.data.ocSettings || this.ocSettings;
          this.HASettings = data.data.HASettings || this.HASettings;
          this.chromeMCPSettings = data.data.chromeMCPSettings || this.chromeMCPSettings;
          this.sqlSettings = data.data.sqlSettings || this.sqlSettings;
          this.KBSettings = data.data.KBSettings || this.KBSettings;
          this.textFiles = data.data.textFiles || this.textFiles;
          this.imageFiles = data.data.imageFiles || this.imageFiles;
          this.videoFiles = data.data.videoFiles || this.videoFiles;
          this.knowledgeBases = data.data.knowledgeBases || this.knowledgeBases;
          this.modelProviders = data.data.modelProviders || this.modelProviders;
          this.systemSettings = data.data.systemSettings || this.systemSettings;
          if (isSteamBuild && !this.systemSettings.contentSafety) this.systemSettings.contentSafety = true;
          if (this.systemSettings && (this.systemSettings.autoCollapseInput === undefined || this.systemSettings.autoCollapseInput === null)) {
            this.systemSettings.autoCollapseInput = false;
          }
          if (isSteamBuild || (this.systemSettings.showDisclaimer !== false && !this.systemSettings.disclaimerAccepted)) {
            this.showDisclaimerDialog = true;
          }
          if (this.systemSettings && (this.systemSettings.codeFontScale === undefined || this.systemSettings.codeFontScale === null)) {
            this.systemSettings.codeFontScale = 1;
          }
          if (this.systemSettings && (this.systemSettings.autoCollapseInput === undefined || this.systemSettings.autoCollapseInput === null)) {
            this.systemSettings.autoCollapseInput = false;
          }
          this.showBrowserChat = data.data.showBrowserChat || this.showBrowserChat;
          this.searchEngine = data.data.searchEngine || this.searchEngine;
          if (data.data.largeMoreButtonDict) {
            this.largeMoreButtonDict = this.largeMoreButtonDict.map(existingButton => {
              const newButton = data.data.largeMoreButtonDict.find(button => button.name === existingButton.name);
              if (newButton) {
                return { ...existingButton, enabled: newButton.enabled };
              }
              return existingButton;
            });
          }
          if (data.data.smallMoreButtonDict) {
            this.smallMoreButtonDict = this.smallMoreButtonDict.map(existingButton => {
              const newButton = data.data.smallMoreButtonDict.find(button => button.name === existingButton.name);
              if (newButton) {
                return { ...existingButton, enabled: newButton.enabled };
              }
              return existingButton;
            });
          }
          this.loadConversation(this.conversationId);
          this.currentLanguage = data.data.currentLanguage || this.currentLanguage;
          this.mcpServers = data.data.mcpServers || this.mcpServers;
          this.a2aServers = data.data.a2aServers || this.a2aServers;
          this.memories = data.data.memories || this.memories;
          this.memorySettings = data.data.memorySettings || this.memorySettings;
          this.text2imgSettings = data.data.text2imgSettings || this.text2imgSettings;
          this.asrSettings = data.data.asrSettings || this.asrSettings;
          this.ttsSettings = data.data.ttsSettings || this.ttsSettings;
          if (isSteamBuild && this.ttsSettings.engine === 'edgetts') this.ttsSettings.engine = 'systemtts';
          this.behaviorSettings = data.data.behaviorSettings || this.behaviorSettings;
          this.diarySettings = data.data.diarySettings || this.diarySettings;
          this.VRMConfig = data.data.VRMConfig || this.VRMConfig;
          this.THAConfig = data.data.THAConfig || this.THAConfig;
          this.comfyuiServers = data.data.comfyuiServers || this.comfyuiServers;
          this.comfyuiAPIkey = data.data.comfyuiAPIkey || this.comfyuiAPIkey;
          this.workflows = data.data.workflows || this.workflows;
          this.customHttpTools = data.data.custom_http || this.customHttpTools;
          this.isGroupMode = data.data.isGroupMode || this.isGroupMode;
          this.selectedGroupAgents = data.data.selectedGroupAgents || this.selectedGroupAgents;
          // 初始化时确保数据一致性
          this.edgettsLanguage = this.ttsSettings.edgettsLanguage;
          this.edgettsGender = this.ttsSettings.edgettsGender;
          this.handleSystemLanguageChange(this.systemSettings.language);
          this.refreshButtonText = this.t('refreshList');
          if (this.HASettings.enabled) {
            this.changeHAEnabled();
          };
          await this.initChromeMCPSettings();
          if (this.chromeMCPSettings.enabled){
            this.changeChromeMCPEnabled();
          }
          if (this.sqlSettings.enabled){
            this.changeSqlEnabled();
          }
          this.changeMemory();
          // this.target_lang改成navigator.language || navigator.userLanguage;
          this.target_lang = this.targetLangSelected!="system"? this.targetLangSelected: navigator.language || navigator.userLanguage || 'zh-CN';
          this.loadDefaultModels();
          this.loadDefaultMotions();
          this.loadGaussScenes();
          this.loadTHAModels();
          this.checkMobile();
          this.checkQQBotStatus(); 
          this.checkFeishuBotStatus();
          this.checkTelegramBotStatus();
          this.checkDiscordBotStatus();
          this.checkLiveStatus();
          this.fetchRemotePlugins();
          this.fetchSkills();
          this.fetchTetosVoices(this.ttsSettings.engine);
          if (this.asrSettings.enabled && this.asrSettings.interactionMethod != 'globalKeyTriggered' && this.asrSettings.interactionMethod != 'keyTriggered') {
            this.startASR();
          }
          if (this.activeMenu === 'home') this.startDriverGuide();
        } 
        else if (data.type === 'task_notification') {
            // 1. 调用前端的弹窗提醒 (保持原有逻辑)
            showNotification(`${data.data.title}\n${this.t('intask')}`, 'success');
            
            // 2. 核心改进：触发 runBehavior，让网页端发起对话总结
            if (data.data.behavior) {
                // 这里确保 this 指向正确，如果在箭头函数中直接用 this，否则用外层保存的_this/that
                this.runBehavior(data.data.behavior);
            }
        }
        else if (data.type === 'diary_entry') {
            // 日记系统：将后端生成的日记内容原样展示到当前对话
            if (data.data && data.data.content) {
                if (data.data.actionType === 'system_notify') {
                    const title = data.data.title || this.t('DiarySystem') || '日记系统';
                    showNotification(title + ': ' + data.data.content, 'warning');
                } else {
                    this.pushDiaryToChat(data.data.content, data.data.actionType);
                }
            }
        }
        else if (data.type === 'settings_saved') {
          if (!data.success) {
            showNotification(this.t('settings_save_failed'), 'error');
          }
        }
        // 新增：处理用户输入更新
        else if (data.type === 'update_user_input') {
          this.userInput = data.data.text;
        }
        // 更新或添加提示词
        else if (data.type === 'update_system_prompt') {
            const id = data.data.id;
            const text = data.data.text;
            this.extensionsSystemPromptsDict[id] = text; 
        }
        
        // 移除提示词 (对应后端 finally 中的逻辑)
        else if (data.type === 'remove_system_prompt') {
            const id = data.data.id;
            
            if (this.extensionsSystemPromptsDict[id]) {
                delete this.extensionsSystemPromptsDict[id];
            }
        }
        // 新增：处理工具输入
        else if (data.type === 'update_tool_input') {
          this.userInput = data.data.text;
          this.sendMessage(role = 'system')
        }
        // 新增：处理TTS输入
        else if (data.type === 'start_tts') {
          this.readConfig.longText = data.data.text;
          // 等待0.5s
          setTimeout(() => {
            this.startRead();
          }, 500);
        }
        // 新增：停止TTS
        else if (data.type === 'stop_tts') {
          this.stopTTSActivities();
          this.readConfig.longText = '';
        }
        // 新增：处理关闭扩展侧边栏
        else if (data.type === 'trigger_close_extension') {
          console.log('关闭侧边栏')
          this.resetToDefaultView();
        }
        // 新增：处理触发发送消息
        else if (data.type === 'trigger_send_message') {
          this.sendMessage();
        }
        // 新增：清空消息列表
        else if (data.type === "trigger_clear_message" ){
          this.clearMessages();
        }
        // 新增：接收来自其他窗口的消息同步
        else if (data.type === 'messages_update') {
          if (data.data && data.data.messages && !this.isSending) {
            this.messages = data.data.messages;
            if (data.data.conversationId) {
              this.conversationId = data.data.conversationId;
            }
            this.$nextTick(() => { this.requestScrollToBottom(); });
          }
        }
        // 新增：响应请求消息列表
        else if (data.type === 'request_messages') {
          // 发送当前消息列表给请求方
          this.sendMessagesToExtension();
        }
      };

      // WebSocket 关闭事件
      this.ws.onclose = (event) => {
        console.log('WebSocket connection closed:', event.reason);
        stopHeartbeat();
        scheduleReconnect();
      };

      // WebSocket 错误事件
      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        this.ws.close(); // 主动关闭连接，触发 onclose 事件
      };
    },

    disconnectWebSocket() {
      if (this.ws) {
        try {
          this.ws.onopen = null;
          this.ws.onmessage = null;
          this.ws.onclose = null;
          this.ws.onerror = null;
          this.ws.close();
        } catch (e) {
          console.error('Error closing WebSocket:', e);
        }
        this.ws = null;
      }
    },

   async updateGlobalShortcut() {
      if (this.asrSettings.interactionMethod === 'globalKeyTriggered' || this.asrSettings.interactionMethod === 'keyTriggered'){
        this.stopASR();
      }else if (this.asrSettings.enabled){
        await this.startASR();
      }

      if (!window.electronAPI?.unregisterGlobalShortcut) return;
      
      // 每次更新前，先注销旧的
      await window.electronAPI.unregisterGlobalShortcut();

      // 如果启用了 ASR 且为全局快捷键模式
      if (this.asrSettings.interactionMethod === 'globalKeyTriggered') {
        const globalKeyCombo = this.getGlobalAccelerator(this.asrSettings.hotkey);
        
        const success = await window.electronAPI.registerGlobalShortcut(globalKeyCombo);
        if (!success) {
          this.$message.error(`全局快捷键 ${globalKeyCombo} 注册失败，可能被系统或其他软件占用`);
        } else {
          console.log(`全局快捷键已更新为: ${globalKeyCombo}`);
        }
      }
    },

    // 【新增】将你的单键转换为 Electron 系统的组合键格式
    getGlobalAccelerator(localKey) {
      if (localKey === 'Alt') return 'Alt+Space';
      if (localKey === 'Control') return 'Control+Space';
      if (localKey === 'Shift') return 'Shift+Space';
      return 'Alt+Space'; // 默认 fallback
    },

    // 【修改】键盘按下事件 (只处理局部 keyTriggered)
    async handleKeyDown(event) {
      if (event?.repeat) return; 
      if (event.isComposing || event.keyCode === 229) return;

      // ===== 快捷指令弹出菜单导航（优先处理）=====
      if (this.shortcutMenuOpen && this.shortcutMenuItems.length) {
        if (event.key === 'ArrowDown') { event.preventDefault(); this.moveShortcutMenu(1); return; }
        if (event.key === 'ArrowUp') { event.preventDefault(); this.moveShortcutMenu(-1); return; }
        if ((event.key === 'Enter' && !event.shiftKey) || event.key === 'Tab') {
          event.preventDefault();
          const item = this.shortcutMenuItems[this.shortcutMenuIndex] || this.shortcutMenuItems[0];
          if (item) this.selectShortcutMenuItem(item);
          return;
        }
        if (event.key === 'Escape') { event.preventDefault(); this.closeShortcutMenu(); return; }
      }

      // ====== 局部模式 (按住说话) ======
      if (this.asrSettings.interactionMethod === "keyTriggered") {
        // 如果按下的键和设置的键严格匹配 (例如 'Alt' === 'Alt')
        if (event.key === this.asrSettings.hotkey) {
          event.preventDefault(); 
          await this.handlePttPress(event); // 开始录音
          return; 
        }
      }

      // -- 下方是你原有的播放控制及回车发送逻辑，保持不变 --
      if (event.code === 'Space' && event.shiftKey) {
        event.preventDefault();
        if (this.readState.ttsChunks.length > 0 && !this.readState.isPlaying) {
          this.playNextSegmentOnce();
        }
        return;
      }
      
      const isTextArea = event.target.tagName === 'TEXTAREA';
      if (event.key === 'Enter' && (this.activeMenu === 'home' || this.activeMenu ==='ai-browser')) {
        if (isTextArea) {
            if (event.shiftKey) {
              return;
            } else {
              event.preventDefault();
              await this.sendMessage();
            }
        }
      }

      if (event.key === 'Enter' && this.activeMenu ==='dashboard') {
            if (event.shiftKey) {
              return;
            } else {
              event.preventDefault();
              this.handleDashboardSend();
            }
      }
    },

    // 【修改】键盘松开事件 (只处理局部 keyTriggered)
    async handleKeyUp(event) {
      if (event?.repeat) return;

      // ====== 局部模式 (松开结束) ======
      if (this.asrSettings.interactionMethod === "keyTriggered") {
        if (event.key === this.asrSettings.hotkey) {
          event.preventDefault();
          await this.handlePttRelease(event); // 结束录音
          return;
        }
      }  
    },
    escapeHtml(unsafe) {
      return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    },  
    // 新增：发送当前消息列表到所有连接的客户端
    sendMessagesToExtension() {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      if (this.isSending && this._lastExtSendTime && Date.now() - this._lastExtSendTime < 3000) {
        if (!this._extSendPending) {
          this._extSendPending = true;
          this._extSendTimer = setTimeout(() => {
            this._extSendPending = false;
            this._extSendTimer = null;
            this.sendMessagesToExtension();
          }, 3000);
        }
        return;
      }
      this._lastExtSendTime = Date.now();
      try {
        const MAX_WS_MESSAGES = 50;
        const recentMessages = this.messages.length > MAX_WS_MESSAGES
          ? this.messages.slice(-MAX_WS_MESSAGES)
          : this.messages;
        this.ws.send(JSON.stringify({
            type: 'broadcast_messages',
            data: {
              messages: recentMessages,
              conversationId: this.conversationId
            }
          }));
        } catch (e) {
          console.error('Failed to send messages to extension:', e);
        }
    },
    async syncSystemPromptToMessages(newPrompt) {
      // 情况 1: 新提示词为空
      if (!newPrompt) {
        if (this.messages.length > 0 && this.messages[0].role === 'system') {
          this.messages.splice(0, 1); // 删除系统消息
        }
        return;
      }
  
      // 情况 2: 已有系统消息
      if (this.messages[0]?.role === 'system') {
        // 更新系统消息内容
        this.messages[0].content = newPrompt;
        console.log('Updated system message:', this.messages[0]);
        return;
      }
  
      // 情况 3: 没有系统消息
      this.messages.unshift({
        id: Date.now() + Math.random(), // 添加唯一ID
        role: 'system',
        content: newPrompt
      });
      console.log('Added system message:', this.messages[0]);
      await this.autoSaveSettings();
    },


    // 敏感路径检测函数
    isDangerousPath(path) {
        if (!path) return false;

        // 1. 规范化路径：统一斜杠，转小写，去掉末尾斜杠
        let normalized = path.trim().replace(/\\/g, '/').toLowerCase();
        if (normalized.length > 1 && normalized.endsWith('/')) {
            normalized = normalized.slice(0, -1);
        }

        // --- A. 绝对禁止的磁盘/系统根目录 ---
        // 匹配: "c:", "d:", "/"
        const winRootRegex = /^[a-z]:$/;
        if (winRootRegex.test(normalized) || normalized === '/' || normalized === '') {
            return true; 
        }

        // --- B. 仅禁止目录本身，但允许其子目录 (User Containers) ---
        // 比如禁止选择 "C:/Users"，但允许 "C:/Users/YourName/Documents"
        const userContainers = [
            'c:/users',
            '/users',
            '/home'
        ];
        if (userContainers.includes(normalized)) {
            return true;
        }

        // --- C. 禁止该目录及其所有子目录 (System Core) ---
        // 这些地方无论如何都不该让本地引擎去跑
        const strictSystemPaths = [
            'c:/windows',
            'c:/program files',
            'c:/program files (x86)',
            'c:/boot',
            'c:/recovery',
            'c:/system volume information',
            '/bin', '/boot', '/dev', '/etc', '/lib', '/lib64', '/proc', 
            '/root', '/run', '/sbin', '/sys', '/usr', '/var', '/opt',
            '/system', '/library', '/volumes'
        ];

        return strictSystemPaths.some(prefix => {
            // 只有在匹配系统核心目录或其子路径时才拦截
            return normalized === prefix || normalized.startsWith(prefix + '/');
        });
    },

    // ==========================================
    // 1. 用户动作入口与调度函数（可直接替换）
    // ==========================================
    // 统一快捷指令分发：命中控制类指令则就地处理并返回 true，否则返回 false 继续正常发送
    // 快捷指令弹出菜单：输入变化时刷新可见性
    refreshShortcutMenu() {
      const items = this.shortcutMenuItems;
      this.shortcutMenuOpen = (this.shortcutMenuToken !== null) && items.length > 0;
      if (this.shortcutMenuIndex >= items.length) this.shortcutMenuIndex = 0;
    },
    moveShortcutMenu(delta) {
      const n = this.shortcutMenuItems.length;
      if (!n) return;
      this.shortcutMenuIndex = (this.shortcutMenuIndex + delta + n) % n;
    },
    closeShortcutMenu() {
      this.shortcutMenuOpen = false;
      this.shortcutMenuIndex = 0;
    },
    selectShortcutMenuItem(item) {
      if (!item) return;
      if (item.mode === 'fill') {
        // 需要参数的指令 / 技能：填入并保留焦点，等待用户输入内容后回车
        this.userInput = item.insert + ' ';
        this.shortcutMenuOpen = false;
        this.shortcutMenuIndex = 0;
      } else {
        // 无参数指令：直接执行
        this.closeShortcutMenu();
        this.handleShortcutCommand(item.insert);
        this.userInput = '';
      }
    },
    handleShortcutCommand(raw) {
        if (!raw || raw[0] !== '/') return false;
        const parts = raw.slice(1).split(/\s+/);
        if (!parts[0]) return false;
        const cmd = ('/' + parts[0]).toLowerCase();
        const arg = raw.slice(1 + parts[0].length).trim();
        const inAny = (list) => list.includes(cmd);
        try {
            if (inAny(['/help', '/帮助', '/?'])) { this.showShortcutHelp = true; return true; }
            if (inAny(['/stop', '/停止'])) { this.stopGenerate(); return true; }
            if (inAny(['/new', '/reset', '/restart', '/重启', '/新建'])) { this.clearMessages(); return true; }
            if (inAny(['/retry', '/重试'])) { this.shortcutRetry(); return true; }
            if (inAny(['/model', '/模型'])) { this.shortcutSwitchModel(arg); return true; }
            if (inAny(['/personality', '/persona', '/角色'])) { this.shortcutSwitchPersonality(arg); return true; }
            if (inAny(['/skills', '/技能'])) { this.shortcutShowSkills(); return true; }
            const modeMap = {'/plan':'plan','/计划':'plan','/read':'default','/只读':'default','/edit':'auto-approve','/编辑':'auto-approve','/yolo':'yolo','/cowork':'cowork','/协作':'cowork','/goal':'goal','/目标':'goal'};
            if (modeMap[cmd]) { this.shortcutSwitchMode(modeMap[cmd]); return true; }
        } catch (e) {
            console.error('快捷指令处理异常:', e);
            return true;
        }
        // 其它 /<技能名> 注入及 # / @ 指令交由后端 / 正常流程处理
        return false;
    },
    // /retry：重新生成最后一条助手回复
    shortcutRetry() {
        let idx = -1;
        for (let i = this.messages.length - 1; i >= 0; i--) {
            if (this.messages[i].role === 'assistant') { idx = i; break; }
        }
        if (idx > 0) { this.rewrite(idx); }
        else { showNotification(this.t('cmd_nothing_to_retry'), 'warning'); }
    },
    // /model：无参打开模型选择，有参尝试匹配并切换
    shortcutSwitchModel(arg) {
        if (!arg) { this.showModelDialog = true; return; }
        const q = arg.toLowerCase().trim();
        let target = null;
        for (const p of (this.modelProviders || [])) {
            const vendor = (p.vendor || p.name || '').toLowerCase();
            const model = (p.modelId || '').toLowerCase();
            if (model === q || vendor === q || (vendor + ':' + model) === q ||
                (model && model.includes(q)) || (vendor && vendor.includes(q))) {
                target = p; break;
            }
        }
        if (target) {
            this.selectMainProvider(target.id);
            showNotification(this.t('cmd_model_switched') + ': ' + (target.modelId || target.vendor || ''), 'success');
        } else {
            this.showModelDialog = true;
            showNotification(this.t('cmd_model_notfound'), 'warning');
        }
    },
    // /personality：无参提示，有参匹配角色卡 / 系统提示词
    shortcutSwitchPersonality(arg) {
        if (!arg) {
            this.activeMenu = 'role';
            this.subMenu = 'memory';
            showNotification(this.t('cmd_personality_hint'), 'info');
            return;
        }
        const q = arg.toLowerCase().trim();
        const mem = (this.memories || []).find(m => (m.name || '').toLowerCase() === q);
        if (mem) {
            this.memorySettings.is_memory = true;
            this.memorySettings.selectedMemory = mem.id;
            this.changeMemory();
            showNotification(this.t('cmd_personality_switched') + ': ' + mem.name, 'success');
            return;
        }
        const prompt = (this.SystemPromptsList || []).find(p => (p.name || '').toLowerCase() === q);
        if (prompt) {
            this.usePrompt(prompt);
            showNotification(this.t('cmd_personality_switched') + ': ' + prompt.name, 'success');
            return;
        }
        showNotification(this.t('cmd_personality_notfound'), 'warning');
    },
    // /skills：跳转到技能管理
    shortcutShowSkills() {
        this.activeMenu = 'toolkit';
        this.subMenu = 'CLI';
        this.activeCLITab = 'skills';
    },
    // /plan /read /edit /yolo /cowork /goal：切换当前引擎的权限模式（需开启电脑命令行控制）
    shortcutSwitchMode(modeValue) {
        if (!this.CLISettings || !this.CLISettings.enabled) {
            showNotification(this.t('cmd_mode_need_cli'), 'warning');
            return;
        }
        const engine = this.CLISettings.engine;
        const key = engine === 'ds' ? 'dsSettings' : engine === 'acp' ? 'acpSettings' : 'localEnvSettings';
        if (!this[key]) this[key] = {};
        this[key].permissionMode = modeValue;
        this.autoSaveSettings();
        showNotification(this.t('cmd_mode_switched') + ': ' + modeValue, 'success');
    },
    async sendMessage(role = 'user') { 
        // 基础校验
        if (!this.userInput.trim() && (!this.files || this.files.length === 0) && (!this.images || this.images.length === 0)) return;
        if (this.isTyping) return;
        this.closeShortcutMenu();
        // 统一快捷指令拦截（仅处理聊天界面的控制类指令；技能注入 / #记忆 / @文件 仍走正常流程）
        if (this.systemSettings.enableShortcuts && role === 'user'
            && (!this.files || this.files.length === 0) && (!this.images || this.images.length === 0)
            && this.handleShortcutCommand(this.userInput.trim())) {
            this.userInput = '';
            return;
        }
        if (this.CLISettings.enabled) {
            const pathToCheck = this.CLISettings.cc_path;

            if (this.isDangerousPath(pathToCheck)) {
                showNotification(
                    this.t('dangerous_path_detected'),
                    'error',
                );
                return; // 直接返回，不执行后续逻辑
            }

            // 如果校验通过，继续执行...
        }
        // [V2新增]：切换菜单
        if (this.activeMenu === 'dashboard'){
          this.activeMenu = 'home'
        }

        // 处理 TTS/Read 中断
        if (this.readState.isPlaying && this.ttsSettings.enabled) { 
            if (this.isReadRunning){
                this.pauseRead();
            } else {
                this.stopSegmentTTS(isEnd=false);
            }
            this.isReadInterruption = true;
        }

        if (this.messages.length > 0) {
            const lastMsg = this.messages[this.messages.length - 1];
            if (lastMsg._currentAudio){
                if (typeof lastMsg._currentAudio.pause === 'function') {
                    lastMsg._currentAudio.pause();
                }
                lastMsg._currentAudio = null;
            }
        }
        this.stopAllAudioPlayback();
        this.TTSrunning = false;

        if ((this.vrmOnline || this.vtsOnline) && this.ttsWebSocket) {
            this.ttsWebSocket.send(JSON.stringify({ type: 'ttsStarted', data: {} }));
        }

        this.isTyping = true;
        this.startTimer();

        if (typeof this.sendTTSStatusToVRM === 'function') {
            this.sendTTSStatusToVRM('ttsStarted', {});
        }

      let captureFlag = false;
      if (this.isElectron && this.visionSettings?.desktopVision) {
          if (this.visionSettings.enableWakeWord && this.visionSettings.wakeWord) {
              const wakeWords = this.visionSettings.wakeWord.split('\n');
              if (wakeWords.some(word => this.userInput.includes(word.trim()))) {
                  captureFlag = true;
              }
          } else {
              captureFlag = true;
          }
      }

        // --- 文件上传处理 ---
        const userInput = this.userInput.trim();
        let fileLinks = this.files || [];
        
        if (fileLinks.length > 0){
            const formData = new FormData();
            for (const file of fileLinks) {
                if (file.file instanceof Blob) { 
                    formData.append('files', file.file, file.name);
                }
            }
            try {
                const response = await fetch(`/load_file`, { method: 'POST', body: formData });
                const data = await response.json();
                if (data.success) {
                    fileLinks = data.fileLinks;
                    this.textFiles = [...this.textFiles, ...data.textFiles];
                }
            } catch (error) { console.error(error); }
        }

        let imageLinks = this.images || [];
        if (imageLinks.length > 0){
            const formData = new FormData();
              for (const file of imageLinks) {
                  if (file.file instanceof Blob) { 
                      formData.append('files', file.file, file.name , file.detectedType); // [V2新增]：detectedType
                  } 
              }
              try {
                  const response = await fetch(`/load_file`, { method: 'POST', body: formData });
                  const data = await response.json();
                  if (data.success) {
                    imageLinks = data.fileLinks;
                    this.imageFiles = [...this.imageFiles, ...data.imageFiles];
                    if(data.vedioFiles) { // [V2新增]：视频支持
                        this.vedioFiles = [...(this.vedioFiles || []), ...data.vedioFiles];
                    }
                  }
              } catch (error) { console.error(error); }
        }

        // --- 核心修复点：确保 this.fileLinks 是数组 ---
        if (!Array.isArray(this.fileLinks)) {
            this.fileLinks = []; 
        }

        // 构造文件链接字符串
        const fileLinks_content = fileLinks.map(fileLink => `\n[文件名：${fileLink.name}\n文件链接: ${fileLink.path}]`).join('\n') || '';
        const fileLinks_list = Array.isArray(fileLinks) ? fileLinks.map(fileLink => fileLink.path).flat() : []
        this.fileLinks = this.fileLinks.concat(fileLinks_list)

        // --- 推送用户消息到界面 ---
        this.messages.push({
            id: Date.now() + Math.random(),
            role: role,
            content: userInput,
            fileLinks: fileLinks,
            fileLinks_content: fileLinks_content,
            imageLinks: imageLinks || [],
            hasDesktopVision: captureFlag, // ✨ 新增标记：告诉 UI 这条消息触发了后端截图
            agentName: this.memorySettings.userName || 'User',
            timestamp: Date.now() // ✨ 记录发送时间 
        });

        this.sendMessagesToExtension();
        this.files = [];
        this.images = [];
        this.userInput = '';
        
        this.$nextTick(() => { this.requestScrollToBottom(); });

        // --- 调度逻辑：群聊 vs 单聊 ---
        this.isSending = true; 
        this.abortController = new AbortController(); 

        try {
                if (this.isGroupMode && this.selectedGroupAgents && this.selectedGroupAgents.length > 0) {
                    // == 群聊模式：随机串行调用 ==
                    
                    // 创建副本并随机打乱 (Fisher-Yates Shuffle)
                    let executionList = [...this.selectedGroupAgents];
                    for (let i = executionList.length - 1; i > 0; i--) {
                        const j = Math.floor(Math.random() * (i + 1));
                        [executionList[i], executionList[j]] = [executionList[j], executionList[i]];
                    }

                    // 遍历打乱后的列表
                    for (const targetId of executionList) {
                        if (this.abortController.signal.aborted) break;

                        let agentDisplayName = "Unknown";
                        
                        // 解析显示名称
                        if (targetId.startsWith('memory/')) {
                            const memId = targetId.split('/')[1];
                            // 🔴 核心修复：加上 this.memories && 确保其存在时再调用 .find
                            const memRecord = this.memories && this.memories.find(m => String(m.id) === String(memId));
                            agentDisplayName = memRecord ? memRecord.name : "Role";
                        } else if (targetId === 'super-model') {
                            agentDisplayName = this.t('defaultAgent');
                        } else if (this.agents[targetId]) {
                            agentDisplayName = this.agents[targetId].name;
                        }

                        // 调用生成函数
                        await this.generateAIResponse(targetId, agentDisplayName);
                    }
                } else {
                    // == 单聊模式 ==
                    let currentName = 'Assistant';

                    // 1. 判断角色卡主开关开启，且选中了具体的角色卡 ID
                    if (this.memorySettings && this.memorySettings.is_memory && this.memorySettings.selectedMemory) {
                        const selectedId = this.memorySettings.selectedMemory;
                        
                        // 确保 memories 列表存在，并采用 String 强转匹配，防止因数据类型不一致（数字 vs 字符串）导致查找失败
                        const memRecord = this.memories && this.memories.find(m => String(m.id) === String(selectedId));
                        if (memRecord) {
                            currentName = memRecord.name;
                        } else {
                            // 降级兜底
                            currentName = "Role";
                        }
                    } 
                    // 2. 否则，展示系统当前默认选择的智能体名称
                    else if (this.mainAgent === 'super-model') {
                        currentName = this.t('defaultAgent');
                    } else if (this.agents && this.agents[this.mainAgent]) {
                        currentName = this.agents[this.mainAgent].name;
                    }

                    await this.generateAIResponse(this.mainAgent, currentName);
                }
        } catch (e) {
            console.error("Chat dispatch error:", e);
        } finally {
          this.isTyping = false;
          this.isSending = false;
          this.abortController = null;
          await this.autoSaveSettings();
          await this.saveConversations();
        }
    },


    // ==========================================
    // 2. AI 生成与流式处理函数（支持 Human-in-the-loop 审批）
    // ==========================================
    async generateAIResponse(targetAgentId, agentDisplayName = null, isResume = false) {

        const currentController = this.abortController;
        let _saveInterval = null;

        if (!isResume && !this.ttsSettings.enabled && (this.vrmOnline || this.vtsOnline) && this.ttsWebSocket) {
            this.sendTTSStatusToVRM('ttsStarted', {});
        }

        this.voiceStack = ['default'];
        let tts_buffer = '';
        let isCodeBlock = false;
        this.cur_voice = 'default';

        const toolCallStack = [];
        this.toolArgsAccumulator = this.toolArgsAccumulator || {};

        // 内部函数：准备发送给 API 的消息历史（保持不变）
        const prepareMessages = (msgs) => {
            const rawMessages = msgs.flatMap(msg => {
                const userName = this.memorySettings?.userName || 'User';

                // --- 1. 处理人类用户 / 群聊消息 ---
                if (this.isGroupMode && (msg.role === 'user' || (msg.role === 'assistant' && msg.agentName !== agentDisplayName))) {
                    let textContent = (msg.pure_content ?? msg.content) + (msg.fileLinks_content ?? '');
                    const prefix = msg.role === 'user' ? userName : msg.agentName;
                    const finalContent = `${prefix}: ${textContent}`;

                    if (msg.imageLinks && msg.imageLinks.length > 0) {
                        const contentArray = [{ type: "text", text: finalContent }];
                        msg.imageLinks.forEach(imageLink => {
                            const ext = imageLink.path.split('.').pop().toLowerCase();
                            const videoExts = ['mp4', 'webm', 'ogg', 'mov', 'avi'];
                            if (videoExts.includes(ext)) {
                                contentArray.push({ type: "video_url", video_url: { url: imageLink.path } });
                            } else {
                                contentArray.push({ type: "image_url", image_url: { url: imageLink.path } });
                            }
                        });
                        return [{ role: 'user', content: contentArray }];
                    } else {
                        return [{ role: 'user', content: finalContent }];
                    }
                }

                if (msg.role === 'assistant' && msg.backend_content && msg.backend_content.length > 0) {
                    return msg.backend_content.filter(m => 
                        (m.content && String(m.content).trim() !== '') || 
                        (m.tool_calls && m.tool_calls.length > 0) || 
                        m.role === 'tool'
                    );
                }
                
                let apiRole = msg.role === 'system' ? 'system' : (msg.role === 'assistant' ? 'assistant' : 'user');
                let textContent = (msg.pure_content ?? msg.content) + (msg.fileLinks_content ?? '');
                
                // --- 2. 处理单聊 / 常规消息 ---
                if (msg.imageLinks && msg.imageLinks.length > 0) {
                    const contentArray = [{ type: "text", text: textContent }];
                    msg.imageLinks.forEach(imageLink => {
                        const ext = imageLink.path.split('.').pop().toLowerCase();
                        const videoExts = ['mp4', 'webm', 'ogg', 'mov', 'avi'];
                        if (videoExts.includes(ext)) {
                            contentArray.push({ type: "video_url", video_url: { url: imageLink.path } });
                        } else {
                            contentArray.push({ type: "image_url", image_url: { url: imageLink.path } });
                        }
                    });
                    return [{ role: apiRole, content: contentArray }];
                } else {
                    return [{ role: apiRole, content: textContent }];
                }
            });

            const sanitized =[];
            for (let i = 0; i < rawMessages.length; i++) {
                const current = rawMessages[i];
                if (current.role === 'tool') {
                    let prev = sanitized.length > 0 ? sanitized[sanitized.length - 1] : null;
                    if (!prev || prev.role !== 'assistant') {
                        prev = { role: 'assistant', content: null, tool_calls:[] };
                        sanitized.push(prev);
                    }
                    if (!prev.tool_calls) prev.tool_calls =[];
                    
                    const safeToolCallId = current.tool_call_id || `call_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
                    current.tool_call_id = safeToolCallId;

                    const hasMatchingId = prev.tool_calls.some(tc => tc.id === safeToolCallId);
                    if (!hasMatchingId) {
                        prev.tool_calls.push({
                            id: safeToolCallId,
                            type: 'function',
                            function: { name: current.name || 'unknown_tool', arguments: "{}" }
                        });
                    }
                }
                sanitized.push(current);
            }
            return sanitized;
        };

        // 第一步：打包 Payload
        let messagesPayload = prepareMessages(this.messages);
        if (this.extensionsSystemPromptsDict) {
            const combinedPrompt = Object.values(this.extensionsSystemPromptsDict).filter(Boolean).join('\n\n');
            if (messagesPayload[0]?.role === 'system') messagesPayload[0].content += '\n\n' + combinedPrompt;
            else messagesPayload.unshift({ role: 'system', content: combinedPrompt });
        }

        let currentMsg;
        let shouldSyncGroupMemory = false;
        if (isResume && this.messages.length > 0) {
            currentMsg = this.messages[this.messages.length - 1];
            currentMsg.generationFinished = false;
        } else {
            const newMsgData = {
                id: Date.now() + Math.random(),
                role: 'assistant',
                agentName: agentDisplayName,
                content: '',         // 不再使用 HTML，最后会被清空
                pure_content: '',
                backend_content: [{ role: 'assistant', content: '' }],
                toolBlocks: {},
                displayBlocks: [],
                isOmni: this.settings.enableOmniTTS || this.fastSettings.enableOmniTTS,
                omniAudioChunks: [], ttsChunks: [], chunks_voice: [], audioChunks: [],
                isPlaying: false, total_tokens: 0, first_token_latency: 0, elapsedTime: 0,
                generationFinished: false,
                timestamp: Date.now() // ✨ 记录生成时间
            };
            this.messages.push(newMsgData);
            currentMsg = this.messages[this.messages.length - 1];
        }
        const latestUserMessage = [...this.messages].reverse().find(msg => msg.role === 'user');

        // 获取块的辅助函数（带冻结，支持流式复用）
        const getBlock = (type, id = null, name = null) => {
            if (!currentMsg.displayBlocks) currentMsg.displayBlocks = [];
            const blocks = currentMsg.displayBlocks;
           
            while (blocks.length > 0 && Object.isFrozen(blocks[0]) && blocks.length >= MAX_RENDERED_BLOCKS) {
                blocks.shift();
            }
            if (blocks.length > MAX_RENDERED_BLOCKS + 5) {
                const removeCount = blocks.length - MAX_RENDERED_BLOCKS;
                blocks.splice(0, removeCount);
            }

            // 如果有 id，先查找已存在的块（如 tool_call / tool_result 复用）
            if (id) {
                const existing = blocks.find(b => b.type === type && b.id === id);
                if (existing) {
                    if (name && !existing.name) existing.name = name;
                    return existing;
                }
            }
            
            // 检查最后一个块是否可复用（类型相同且未被冻结）
            const last = blocks[blocks.length - 1];
            const canReuse = last && last.type === type && !Object.isFrozen(last) && (!id || last.id === id);
            if (canReuse) {
                if (name && !last.name) last.name = name;
                return last;
            }
            
            // 不复用，先冻结上一个不同类型的块（使其脱离响应式）
            if (last && !Object.isFrozen(last)) {
                // 🔴 核心修复：含有复杂对象（如 data 属性）或类型为 approval 的块绝不能冻结，防止违反 Vue 3 Proxy 约束
                if (last.type !== 'approval' && !last.data) {
                    Object.freeze(last);
                    if (typeof last.content === 'string') Object.freeze(last.content);
                    if (typeof last.args === 'string') Object.freeze(last.args);
                }
            }
            
            // 创建新块并推入数组
            const newBlock = { type, id, name, content: '', args: '', data: null };
            blocks.push(newBlock);
            return newBlock;
        };

        this.$nextTick(() => { this.requestScrollToBottom(); });

        let audioResolve = null;
        let audioProcess = null;
        const audioPromise = new Promise((resolve) => { audioResolve = resolve; });
        if (this.ttsSettings.enabled) {
            this.startTTSProcess(currentMsg);
            this.startAudioPlayProcess(currentMsg, audioResolve);
            audioProcess = audioPromise;
        }

        const escapeHtml = (text) => {
            if (!text) return '';
            return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        };

        try {
            _saveInterval = setInterval(() => this.saveCurrentConversation(), 30000);
            const MAX_FETCH_RETRIES = 3;
            const RETRY_BASE_DELAY = 1000;
            let lastFetchError = null;
            let response = null;

            for (let retryAttempt = 0; retryAttempt <= MAX_FETCH_RETRIES; retryAttempt++) {
                try {
                    if (retryAttempt > 0) {
                        if (this.abortController?.signal.aborted) throw new DOMException('User aborted', 'AbortError');
                        const delay = RETRY_BASE_DELAY * Math.pow(2, retryAttempt - 1);
                        console.log(`[Retry] fetch /v1/chat/completions 第 ${retryAttempt}/${MAX_FETCH_RETRIES} 次重试, 等待 ${delay}ms...`);
                        await new Promise(r => setTimeout(r, delay));
                    }

                    const fetchTimeoutMs = 300000;
                    const abortSignal = this.abortController.signal;
                    const timeoutSignal = AbortSignal.timeout(fetchTimeoutMs);
                    const combinedSignal = AbortSignal.any([abortSignal, timeoutSignal]);

                    response = await fetch(`/v1/chat/completions`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            model: targetAgentId,
                            messages: messagesPayload,
                            stream: true,
                            fileLinks: this.fileLinks,
                            asyncToolsID: this.asyncToolsID || [],
                            reasoning_effort: this.reasoning_effort,
                            conversation_id: this.stringifyEntityId(this.conversationId),
                            group_id: this.stringifyEntityId(this.activeConversationGroupId || this.draftConversationGroupId || 'default'),
                            user_message_id: this.stringifyEntityId(latestUserMessage?.id || null),
                        }),
                        signal: combinedSignal
                    });

                    if (response.ok) break;
                    if (response.status >= 400 && response.status < 500) break;
                    if (retryAttempt < MAX_FETCH_RETRIES) {
                        lastFetchError = new Error(`Server error: ${response.status}`);
                        console.log(`[Retry] HTTP ${response.status}, 将重试...`);
                        continue;
                    }
                } catch (e) {
                    lastFetchError = e;
                    if (e.name === 'AbortError') throw e;
                    if (retryAttempt < MAX_FETCH_RETRIES) {
                        console.log(`[Retry] 网络错误: ${e.message}, 将重试...`);
                        continue;
                    }
                    throw e;
                }
            }

            if (!response || !response.ok) {
                let errText = response ? await response.text() : '';
                try { const errObj = JSON.parse(errText); errText = errObj.error?.message || errText; } catch (e) { }
                throw new Error(errText || lastFetchError?.message || 'Request failed after retries');
            }

            const contentType = response.headers.get('content-type') || '';
            if (!contentType.includes('text/event-stream')) {
                let errText = await response.text();
                try { const errObj = JSON.parse(errText); errText = errObj.error?.message || errText; } catch (e) { }
                throw new Error(errText || 'Server returned non-streaming response');
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            // 初始化流式文本批量更新状态
            this._streamTargetMsg = currentMsg;
            this._streamTextBuffer = '';
            this._typewriterSpeed = 30;
            this._startTypewriterTick();
            this.first_token = true;
            const readTimeoutMs = 120000;
            let streamFinished = false;
            while (true) {
                if (this.abortController?.signal.aborted) break;
                let readResult;
                try {
                    readResult = await Promise.race([
                        reader.read(),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('Read timeout')), readTimeoutMs))
                    ]);
                } catch (readErr) {
                    if (readErr.message === 'Read timeout') {
                        console.error('Stream read timeout, aborting');
                        this.abortController?.abort();
                        throw new DOMException('Response stream timed out', 'TimeoutError');
                    }
                    throw readErr;
                }
                const { done, value } = readResult;
                if (done) break;
                buffer += decoder.decode(value, { stream: true });

                while (buffer.includes('\n\n')) {
                    const eventEndIndex = buffer.indexOf('\n\n');
                    const eventData = buffer.slice(0, eventEndIndex);
                    buffer = buffer.slice(eventEndIndex + 2);

                    if (eventData.startsWith('data: ')) {
                        const jsonStr = eventData.slice(6).trim();
                        if (!jsonStr) continue;
                        if (jsonStr === '[DONE]') { streamFinished = true; break; }
                        let parsed;
                        try {
                            parsed = JSON.parse(jsonStr);
                        } catch (parseErr) {
                            console.warn('SSE parse error, skipping chunk:', parseErr.message, jsonStr.slice(0, 200));
                            continue;
                        }
                        const delta = parsed.choices?.[0]?.delta;
                        if (!delta) continue;

                        if (delta._safety_filtered) {
                            currentMsg.pure_content = delta.content;
                            currentMsg.content = delta.content;
                            currentMsg.backend_content = [{ role: 'assistant', content: delta.content }];
                            currentMsg.displayBlocks = [{ type: 'text', content: delta.content }];
                            this._streamTextBuffer = null;
                            this.streamUpdateTimer = true;
                            continue;
                        }

                        if (this.first_token && !isResume) {
                            this.first_token = false;
                            this.stopTimer();
                            currentMsg.first_token_latency = this.elapsedTime;
                        }

                        // A. 处理思考 (Reasoning) —— 仅更新 displayBlocks，不拼 HTML
                        if (delta.reasoning_content) {
                            const block = getBlock('reasoning');
                            block.content += delta.reasoning_content;

                            let lastBackend = currentMsg.backend_content[currentMsg.backend_content.length - 1];
                            // 如果最后一个条目不是 assistant，或者它已经有了内容（说明上一个 assistant 已完成）
                            if (!lastBackend || lastBackend.role !== 'assistant' || (lastBackend.content && lastBackend.content.trim() !== '')) {
                                lastBackend = { role: 'assistant', content: '', reasoning_content: '' };
                                currentMsg.backend_content.push(lastBackend);
                            }
                            lastBackend.reasoning_content = (lastBackend.reasoning_content || '') + delta.reasoning_content;
                        }

                        // B. 处理文本 (Content) —— 流式防抖更新
                        if (delta.content) {

                            if (!this._streamTextBuffer) {
                                const blocks = currentMsg.displayBlocks;
                                const lastBlock = blocks && blocks.length > 0 ? blocks[blocks.length - 1] : null;
                                if (lastBlock && lastBlock.type !== 'text') {
                                    this._streamTextBuffer += '\n\n';
                                }
                            }

                            // 缓冲文本，不再直接操作 DOM
                            this._streamTextBuffer += delta.content;

                            // 将文本同步存入 backend_content，防止多轮对话历史被过滤抛弃
                            const lastBackend = currentMsg.backend_content[currentMsg.backend_content.length - 1];
                            if (lastBackend && lastBackend.role === 'assistant') {
                                lastBackend.content = (lastBackend.content || '') + delta.content;
                            } else {
                                currentMsg.backend_content.push({ role: 'assistant', content: delta.content });
                            }

                            const accumulatedText = lastBackend ? (lastBackend.content || '') : '';

                            // === 核心分支处理 ===
                            if (this.ttsSettings.enabled) {
                                // 1. 利用流式状态机，将当前的 delta.content 转换为干净、安全的朗读文本
                                const readableText = this.processMarkdownStreamForTTS(currentMsg, delta.content, false);
                                tts_buffer += readableText;

                                // 2. 切分已累积的可用文本语句送入 TTS
                                const { chunks, chunks_voice, remaining, remaining_voice } = this.splitTTSBuffer(tts_buffer);
                                if (chunks.length > 0) {
                                    currentMsg.chunks_voice.push(...chunks_voice);
                                    currentMsg.ttsChunks.push(...chunks);
                                }
                                tts_buffer = remaining;
                                this.cur_voice = remaining_voice;
                            } else {
                                // === 【新增】TTS 禁用状态下的文本与表情同步逻辑 ===
                                if ((this.vrmOnline || this.vtsOnline) && this.ttsWebSocket) {
                                    // 自动检测并提取累积文本中的表情/动作指令 tags (例如 [happy] 或 *wave*)
                                    const detectedExpressions = [];
                                    const tagRegex = /[\[\(\*]([a-zA-Z_0-9\u4e00-\u9fa5]+)[\]\)\*]/g;
                                    let match;
                                    
                                    while ((match = tagRegex.exec(accumulatedText)) !== null) {
                                        const tag = match[1].toLowerCase().trim();
                                        detectedExpressions.push(tag);
                                    }

                                    // 将累计文本和动作标记推送给 VRM 渲染
                                    this.sendTTSStatusToVRM('omniStreaming', {
                                        text: accumulatedText,
                                        expressions: detectedExpressions
                                    });
                                }
                            }

                        }

                        // C. 工具 Loading 状态 (tool_progress) —— 只更新 displayBlocks
                        if (delta.tool_progress) {
                            const progress = delta.tool_progress;
                            let toolCallId = progress.tool_call_id || progress.id;

                            if (!toolCallId) {
                                const existingCall = toolCallStack.find(c => c.name === progress.name && !c.resolved);
                                if (existingCall) { toolCallId = existingCall.id; }
                                else {
                                    toolCallId = `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                                    toolCallStack.push({ id: toolCallId, name: progress.name, resolved: false });
                                }
                            } else if (!toolCallStack.find(c => c.id === toolCallId)) {
                                toolCallStack.push({ id: toolCallId, name: progress.name, resolved: false });
                            }

                            let accArgs = this.toolArgsAccumulator[toolCallId] || "";
                            if (progress.arguments !== undefined) {
                                if (progress.arguments.startsWith(accArgs) && accArgs !== "") {
                                    accArgs = progress.arguments;
                                } else {
                                    accArgs += progress.arguments;
                                }
                                this.toolArgsAccumulator[toolCallId] = accArgs;
                            }

                            const b = getBlock('tool_call', toolCallId, progress.name);
                            b.args = accArgs;
                            this.requestScrollToBottom();
                            continue;
                        }

                        // D. 工具结果 / 错误 / 审批 —— 仅更新 displayBlocks + backend_content
                        if (delta.tool_content) {
                            const tool = delta.tool_content;
                            const toolName = tool.title || 'unknown';
                            let toolCallId = delta.tool_call_id || delta.async_tool_id;

                            if (tool.type === 'call') {
                                if (!toolCallId) toolCallId = `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                                toolCallStack.push({ id: toolCallId, name: toolName, resolved: false });
                            } else {
                                if (!toolCallId) {
                                    const pendingCall = toolCallStack.find(c => c.name === toolName && !c.resolved);
                                    if (pendingCall) {
                                        toolCallId = pendingCall.id; pendingCall.resolved = true;
                                    } else { toolCallId = `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`; }
                                }
                                const callItem = toolCallStack.find(c => c.id === toolCallId);
                                if (callItem) callItem.resolved = true;
                            }

                            if (delta.async_tool_id && (tool.type === 'tool_result' || tool.type === 'error')) {
                                if (this.asyncToolsID) {
                                    const index = this.asyncToolsID.indexOf(delta.async_tool_id);
                                    if (index > -1) {
                                        this.asyncToolsID.splice(index, 1);
                                        const stackIndex = toolCallStack.findIndex(c => c.id === delta.async_tool_id);
                                        if (stackIndex > -1) toolCallStack.splice(stackIndex, 1);
                                    }
                                }
                            }

                            let isApproval = false;
                            let approvalData = null;

                            if (tool.type === 'tool_approval') {
                                isApproval = true;
                                try { approvalData = JSON.parse(tool.content); } catch (e) { }
                            } else if (tool.type === 'tool_result' && typeof tool.content === 'string' && tool.content.includes('"approval_required"')) {
                                try {
                                    const temp = JSON.parse(tool.content);
                                    if (temp.type === 'approval_required') { isApproval = true; approvalData = temp; }
                                } catch (e) { }
                            }

                            // 审批逻辑
                            if (isApproval && approvalData) {
                                const b = getBlock('approval', toolCallId, toolName);
                                b.data = approvalData;
                                this.approvalMap[toolCallId] = approvalData;

                                // 不再生成 HTML，直接更新 backend_content
                                currentMsg.backend_content.push({ role: 'tool', tool_call_id: toolCallId, name: toolName, content: "{}" });
                                currentMsg.backend_content.push({ role: 'assistant', content: '' });
                                this.requestScrollToBottom();

                                // 🚀 核心修复：一旦检测到审批块，立即阻断后续流式接收，等候用户操作
                                if (this.abortController) {
                                    this.abortController.abort();
                                }
                                break; // 强行跳出流式读取循环
                            }
                            else if (tool.type === 'tool_result_stream' && tool.title === "tool_result_stream") {
                                const targetBlock = getBlock('tool_result', toolCallId, toolName);
                                
                                // 限制 UI 层渲染最大字符，防止 DOM 卡死崩溃
                                if (targetBlock.content.length < 50000) {
                                    targetBlock.content = this.smartMergeTerminal(targetBlock.content, tool.content);
                                } else if (!targetBlock.content.endsWith('\n... (Display Truncated)')) {
                                    targetBlock.content += '\n... (Display Truncated)';
                                }

                                // 更新 backend_content (动态限制后端历史记录体积)
                                const lastToolIndex = currentMsg.backend_content.length - 1;
                                for (let i = lastToolIndex; i >= 0; i--) {
                                    if (currentMsg.backend_content[i].role === 'tool' && currentMsg.backend_content[i].tool_call_id === toolCallId) {
                                        if (currentMsg.backend_content[i].content.length < 15000) {
                                            currentMsg.backend_content[i].content = this.smartMergeTerminal(currentMsg.backend_content[i].content, tool.content);
                                        } else if (!currentMsg.backend_content[i].content.endsWith('\n... (Truncated)')) {
                                            currentMsg.backend_content[i].content += '\n... (Truncated)';
                                        }
                                        break;
                                    }
                                }
                            } else {
                                let bType = 'tool_result';
                                if (tool.type === 'error') bType = 'error';
                                else if (tool.type === 'call') bType = 'tool_call';

                                const targetBlock = getBlock(bType, toolCallId, toolName);
                                
                                // 截断显示内容（只影响 UI 显示）
                                if (tool.type === 'call') {
                                    targetBlock.args = tool.content;
                                } else {
                                    targetBlock.content = this.truncateDisplayContent(tool.content);
                                }

                                // 后端消息存储使用原始内容（可能截断，保护 AI 上下文）
                                let rawContent = tool.content || '';
                                
                                // 🚀 新增：预截断，防止大文件或海量输出瞬间打爆 WebSocket
                                if (tool.type !== 'call' && rawContent.length > 15000) {
                                    rawContent = rawContent.slice(0, 15000) + '\n... (Truncated)';
                                }

                                if (tool.type === 'call') {
                                    let lastIdx = currentMsg.backend_content.length - 1;
                                    let last = currentMsg.backend_content[lastIdx];
                                    
                                    // 🚀 核心自愈：如果检测到当前最新节点已被冻结，说明是旧 bug 留下的历史包袱，当场深/浅拷贝一份解冻
                                    if (last && Object.isFrozen(last)) {
                                        last = { ...last };
                                        currentMsg.backend_content[lastIdx] = last;
                                    }

                                    const actualArgs = rawContent || "{}"; // 提取真实的参数
                                    
                                    if (last && last.role === 'assistant') {
                                        // 🚀 克隆可能被冻结的内部 tool_calls 属性，保证可写
                                        if (!last.tool_calls) {
                                            last.tool_calls = [];
                                        } else if (Object.isFrozen(last.tool_calls)) {
                                            last.tool_calls = [...last.tool_calls];
                                        }

                                        let existingCall = last.tool_calls.find(tc => tc.id === toolCallId);
                                        if (!existingCall) {
                                            last.tool_calls.push({ id: toolCallId, type: 'function', function: { name: tool.title, arguments: actualArgs } });
                                        } else {
                                            // 🚀 如果查找到的 existingCall 本身也是被冻结的，同样做深拷贝解冻
                                            let callIdx = last.tool_calls.indexOf(existingCall);
                                            if (callIdx !== -1 && Object.isFrozen(existingCall)) {
                                                existingCall = JSON.parse(JSON.stringify(existingCall));
                                                last.tool_calls[callIdx] = existingCall;
                                            }
                                            existingCall.function.arguments = actualArgs; // 覆盖占位符，更新为真实参数
                                        }
                                    } else {
                                        currentMsg.backend_content.push({ role: 'assistant', content: null, tool_calls:[{ id: toolCallId, type: 'function', function: { name: tool.title, arguments: actualArgs } }] });
                                    }
                                } else if (tool.type === 'tool_result' || tool.type === 'tool_result_stream' || tool.type === 'error') {
                                    const hide = this.toolsSettings?.hideToolResults?.enabled && tool.type === 'tool_result';
                                    rawContent = hide ? '<hide to save token>' : rawContent;
                                    let updated = false;
                                    for (let i = currentMsg.backend_content.length - 1; i >= 0; i--) {
                                        if (currentMsg.backend_content[i].role === 'tool' && currentMsg.backend_content[i].tool_call_id === toolCallId) {
                                            currentMsg.backend_content[i].content = rawContent;
                                            updated = true;
                                            break;
                                        }
                                    }
                                    if (!updated) {
                                        currentMsg.backend_content.push({ role: 'tool', tool_call_id: toolCallId, name: toolName, content: rawContent });
                                    }
                                    if (currentMsg.backend_content[currentMsg.backend_content.length - 1].role !== 'assistant') {
                                        currentMsg.backend_content.push({ role: 'assistant', content: '' });
                                    }
                                }
                            }
                            this.requestScrollToBottom();
                        }

                        if (delta.audio?.data) {
                            this.playPCMChunk(delta.audio.data, currentMsg.pure_content, currentMsg);
                        }
                        if (parsed.usage?.total_tokens) {
                            currentMsg.total_tokens += parsed.usage.total_tokens;
                        }
                        if (delta.async_tool_id) {
                            if (!this.asyncToolsID) this.asyncToolsID = [];
                            if (!this.asyncToolsID.includes(delta.async_tool_id)) {
                                this.asyncToolsID.push(delta.async_tool_id);
                            }
                        }

                        this.sendMessagesToExtension();
                    }
                }
                if (streamFinished) break;
            }

            // 循环结束后，停止打字机动画并强制刷新剩余文字
            this._typewriterRunning = false;
            this._typewriterTickCount = 0;
            if (this._typewriterRafId) cancelAnimationFrame(this._typewriterRafId);
            this.flushStreamTextBuffer();

            // === 核心修改：强制刷新流式状态机中的所有残留文本 ===
            if (this.ttsSettings.enabled) {
                const finalReadable = this.processMarkdownStreamForTTS(currentMsg, '', true);
                tts_buffer += finalReadable;
            }

            if (tts_buffer.trim() && this.ttsSettings.enabled) {
                currentMsg.chunks_voice.push(this.cur_voice);
                currentMsg.ttsChunks.push(tts_buffer);
            }

            currentMsg.generationFinished = true;

            if (this.ttsSettings.enabled) {
                if (this.audioStartTime > this.audioCtx.currentTime) {
                    const remainingTime = (this.audioStartTime - this.audioCtx.currentTime) * 1000;
                    setTimeout(() => { this.sendTTSStatusToVRM('allChunksCompleted', {}); }, remainingTime);
                } else {
                    this.sendTTSStatusToVRM('allChunksCompleted', {});
                }
            }

        } catch (error) {
            console.error(error);
            if (error.name !== 'AbortError' && error.name !== 'TimeoutError') {
                showNotification(error.message, 'error');
                const b = getBlock('error', 'err', 'System Error');
                b.content = this.truncateDisplayContent(error.message);
                if (currentMsg) {
                    const fallbackText = 'response error';
                    if (!currentMsg.pure_content && currentMsg.backend_content.length <= 1) {
                        currentMsg.pure_content = fallbackText;
                        currentMsg.backend_content = [{ role: 'assistant', content: fallbackText }];
                    } else {
                        const lastBackend = currentMsg.backend_content[currentMsg.backend_content.length - 1];
                        if (lastBackend && lastBackend.role === 'assistant' && lastBackend.tool_calls) {
                            delete lastBackend.tool_calls;
                        }
                        currentMsg.backend_content.push({ role: 'assistant', content: fallbackText });
                    }
                }
            }
            if (audioResolve) audioResolve();
        } finally {
            clearInterval(_saveInterval);
            this.isSending = false;
            this.isTyping = false;
            this.voiceStack = ['default'];
            if (this.allBriefly) currentMsg.briefly = true;

            // 清空 content 字段（不再需要 HTML）
            if (currentMsg) {
                currentMsg.generationFinished = true; 
                currentMsg.content = ''; // 清空 content 字段
            }

            // 消息去重和保存
            if (this.conversationId === null) {
                this.conversationId = uuid.v4();
                const newConv = {
                    id: this.conversationId,
                    title: this.generateConversationTitle(messagesPayload),
                    mainAgent: this.mainAgent,
                    groupId: this.activeConversationGroupId || this.draftConversationGroupId || 'default',
                    timestamp: Date.now(),
                    messages: this.messages,
                    fileLinks: this.fileLinks,
                    system_prompt: this.system_prompt,
                };
                this.conversations.unshift(newConv);
                const MAX_CONVERSATIONS = 50;
                if (this.conversations.length > MAX_CONVERSATIONS) {
                    this.conversations = this.conversations.slice(0, MAX_CONVERSATIONS);
                }
            } else {
                // 🔴 核心修复：添加安全链判断，防止潜在的读取错误
                const conv = this.conversations.find(conv => conv.id === this.conversationId);
                if (conv) {
                    conv.messages = this.messages;
                    conv.timestamp = Date.now();
                    conv.fileLinks = this.fileLinks;
                    conv.groupId = conv.groupId || this.activeConversationGroupId || this.draftConversationGroupId || 'default';
                }
            }

            // 截断后端消息中过长的 tool content，保护 AI 上下文
            if (currentMsg && currentMsg.backend_content) {
                const AI_MAX_TOOL_LENGTH = 15000;
                currentMsg.backend_content.forEach(item => {
                    if (item.role === 'tool' && item.content && typeof item.content === 'string') {
                        if (item.content.length > AI_MAX_TOOL_LENGTH) {
                            item.content = item.content.slice(0, AI_MAX_TOOL_LENGTH) + '\n... (Truncated)';
                        }
                    }
                });
                const MAX_BACKEND_ENTRIES = 60;
                if (currentMsg.backend_content.length > MAX_BACKEND_ENTRIES) {
                    currentMsg.backend_content = currentMsg.backend_content.slice(
                        currentMsg.backend_content.length - MAX_BACKEND_ENTRIES
                    );
                }
            }

            const MAX_MESSAGES = 500;
            if (this.messages.length > MAX_MESSAGES) {
                this.messages.splice(0, this.messages.length - MAX_MESSAGES);
            }

            // 冻结已完成消息的所有 displayBlocks 及内部字符串，减少响应式开销
            if (currentMsg && Array.isArray(currentMsg.displayBlocks)) {
                currentMsg.displayBlocks.forEach(block => {
                    if (!Object.isFrozen(block)) {
                        if (block.type !== 'approval' && !block.data) {
                            Object.freeze(block);
                            if (typeof block.content === 'string') Object.freeze(block.content);
                            if (typeof block.args === 'string') Object.freeze(block.args);
                        }
                    }
                });
            }

            if (this.ttsSettings.enabled && audioProcess) {
                await audioProcess;
            } else {
                // === 【新增】TTS 禁用状态下生成完毕通知 ===
                if ((this.vrmOnline || this.vtsOnline) && this.ttsWebSocket) {
                    this.sendTTSStatusToVRM('allChunksCompleted', {});
                }
            }


            this.isThinkOpen = false;
            shouldSyncGroupMemory = !!currentMsg?.pure_content?.trim();

            setTimeout(() => {
                if (!this.isSending && this.audioStartTime <= this.audioCtx.currentTime) {
                    this.sendTTSStatusToVRM('allChunksCompleted', {});
                }
            }, 1000);

            if (shouldSyncGroupMemory && latestUserMessage?.id && currentMsg?.id) {
                await this.syncGroupMemoryAfterReply(latestUserMessage, currentMsg);
            }

            this.toolArgsAccumulator = {};
            if (currentMsg?._ttsState) {
                delete currentMsg._ttsState;
            }

            // 清理流式缓冲区状态及打字机动画
            this._typewriterRunning = false;
            this._typewriterTickCount = 0;
            if (this._typewriterRafId) { cancelAnimationFrame(this._typewriterRafId); this._typewriterRafId = null; }
            this._streamTargetMsg = null;
            this._streamTextBuffer = '';
        }
    },

    // 1. 动态安全获取消息的发送者名称
    getMessageAgentName(message) {
        // 如果消息体中已有记录，直接使用
        if (message.agentName) return message.agentName;
        
        // 如果是助手消息但没有记录名称（常见于开场白）
        if (message.role === 'assistant') {
            // A. 优先尝试读取当前激活的角色卡/Memory的名称
            if (this.memorySettings && this.memorySettings.is_memory && this.memorySettings.selectedMemory) {
                const selectedId = this.memorySettings.selectedMemory;
                const memRecord = this.memories && this.memories.find(m => String(m.id) === String(selectedId));
                if (memRecord) return memRecord.name;
            }
            // B. 其次尝试读取默认智能体名称
            if (this.mainAgent === 'super-model') {
                return this.t('defaultAgent');
            } else if (this.agents && this.agents[this.mainAgent]) {
                return this.agents[this.mainAgent].name;
            }
            return 'Assistant';
        }
        
        // 如果是用户消息
        return this.memorySettings?.userName || 'User';
    },

    // 2. 动态安全解析并格式化时间戳
    formatMessageTime(timestamp, messageId = null) {
        let timeVal = timestamp;
        
        // 尝试解析唯一 message.id 作为降级时间戳
        if (!timeVal && messageId) {
            const idNum = parseFloat(messageId);
            if (!isNaN(idNum) && idNum > 1000000000000) { // 验证是否为合理的毫秒级时间戳
                timeVal = idNum;
            }
        }
        
        if (!timeVal) return ''; 
        
        const msgDate = new Date(timeVal);
        const now = new Date();
        
        // 获取今日、昨日、前天零点的时间戳，进行精确天级对比
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const oneDayMs = 24 * 60 * 60 * 1000;
        const yesterdayStart = todayStart - oneDayMs;
        const theDayBeforeStart = todayStart - 2 * oneDayMs;
        
        // 计算本周一零点的时间戳（以周一为一周的起点）
        const currentDayOfWeek = now.getDay(); // 0(周日) - 6(周六)
        const daysSinceMonday = currentDayOfWeek === 0 ? 6 : currentDayOfWeek - 1; // 转换为以周一为 0 点的偏移量
        const thisMondayStart = todayStart - daysSinceMonday * oneDayMs;
        
        const msgTime = msgDate.getTime();
        
        // 格式化具体的时分（HH:mm）
        const hours = String(msgDate.getHours()).padStart(2, '0');
        const minutes = String(msgDate.getMinutes()).padStart(2, '0');
        const timeStr = `${hours}:${minutes}`;
        
        // 1. 如果是今天：只显示时间，如 "17:26"
        if (msgTime >= todayStart) {
            return timeStr;
        }
        
        // 2. 如果是昨天：读取 'yesterday' 键，显示 "昨天 17:26" / "Yesterday 17:26"
        if (msgTime >= yesterdayStart && msgTime < todayStart) {
            return `${this.t('yesterday')} ${timeStr}`;
        }
        
        // 3. 如果是前天：读取 'theDayBefore' 键，显示 "前天 17:26" / "Day before yesterday 17:26"
        if (msgTime >= theDayBeforeStart && msgTime < yesterdayStart) {
            return `${this.t('theDayBefore')} ${timeStr}`;
        }
        
        // 4. 如果是本周的其他时间（周一 0 点之后，但在前天 0 点之前）：读取对应的周几键，显示 "周一 17:26" / "Monday 17:26"
        if (msgTime >= thisMondayStart && msgTime < theDayBeforeStart) {
            const weekKeys = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
            const dayKey = weekKeys[msgDate.getDay()];
            const dayName = this.t(dayKey);
            return `${dayName} ${timeStr}`;
        }
        
        // 5. 跨周或更久的时间：显示具体日期和时间
        const year = msgDate.getFullYear();
        const month = String(msgDate.getMonth() + 1).padStart(2, '0');
        const day = String(msgDate.getDate()).padStart(2, '0');
        
        // 如果是本年度内的消息，隐藏年份显示，如 "06-08 17:26"
        if (year === now.getFullYear()) {
            return `${month}-${day} ${timeStr}`;
        } else {
            // 跨年消息，显示完整年份，如 "2025-06-08 17:26"
            return `${year}-${month}-${day} ${timeStr}`;
        }
    },

    // === Human-in-the-loop 处理函数 ===
    async processToolApproval(toolCallId, action) {
        const currentMsg = this.messages[this.messages.length - 1];
        if (!currentMsg) return;
        currentMsg.generationFinished = false; 
        const data = this.approvalMap[toolCallId];
        const toolName = data?.tool_name || data?.name || 'Tool';
        const blockId = `approval-${toolCallId}`;

        // 定位并准备将“审批块”转变为“执行结果块”
        let targetIdx = -1;
        if (currentMsg.displayBlocks) {
            targetIdx = currentMsg.displayBlocks.findIndex(b => b.id === toolCallId && b.type === 'approval');
            if (targetIdx !== -1) {
                const originalBlock = currentMsg.displayBlocks[targetIdx];
                const updatedBlock = {
                    ...originalBlock,
                    type: 'tool_result',
                    name: action === 'deny' ? this.t('denying') : `${this.t('executing')} ${toolName}...`,
                    content: '',
                    segments: [] 
                };
                
                if (typeof this.$set === 'function') {
                    this.$set(currentMsg.displayBlocks, targetIdx, updatedBlock);
                } else {
                    currentMsg.displayBlocks[targetIdx] = updatedBlock;
                }
            }
        }

        const escapeHtml = (text) => {
            if (!text) return '';
            return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        };

        const feedbackTitle = action === 'deny' ? (this.t('denying') || 'Denying...') : `${this.t('executing') || 'Executing'} ${toolName}...`;
        this.updateUIBlock(currentMsg, blockId, `\n`);

        this.isSending = true; 
        this.isTyping = true;
        const currentController = new AbortController(); 
        this.abortController = currentController; 

        try {
            let resultText = "";
            
            if (action === 'deny') {
                resultText = `User denied the execution of tool '${toolName}'.`;
                
                // 更新结果内容
                if (targetIdx !== -1) {
                    currentMsg.displayBlocks[targetIdx].content = resultText;
                    currentMsg.displayBlocks[targetIdx].type = 'error';
                    currentMsg.displayBlocks[targetIdx].name = this.t('tool_deny');
                }
            } else {
                // 1. 安全提取并标准化参数
                let toolParams = data?.tool_params || data?.arguments || data?.params || data?.tool_args || {};
                if (typeof toolParams === 'string') {
                    try { toolParams = JSON.parse(toolParams); } catch (e) {}
                }

                // 2. 发起 HTTP 请求
                const response = await fetch('/execute_tool_manually', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        tool_name: toolName, 
                        tool_params: toolParams,
                        approval_type: action 
                    }),
                    signal: this.abortController.signal
                });

                if (!response.ok) {
                    const errText = await response.text();
                    throw new Error(`Server Error (${response.status}): ${errText}`);
                }

                const contentType = response.headers.get('content-type');

                // 🚀 3. 如果后端返回的是流（media_type="text/event-stream"），执行流式渲染
                if (contentType && contentType.includes('event-stream')) {
                    const reader = response.body.getReader();
                    const decoder = new TextDecoder();
                    let buffer = '';

                    // 动画加载文字改为正式标题
                    if (targetIdx !== -1) {
                        currentMsg.displayBlocks[targetIdx].name = `${toolName} ${this.t('tool_result')}`;
                    }

                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        buffer += decoder.decode(value, { stream: true });

                        while (buffer.includes('\n\n')) {
                            const eventEndIndex = buffer.indexOf('\n\n');
                            const eventData = buffer.slice(0, eventEndIndex);
                            buffer = buffer.slice(eventEndIndex + 2);

                            if (eventData.startsWith('data: ')) {
                                const jsonStr = eventData.slice(6).trim();
                                try {
                                    const parsed = JSON.parse(jsonStr);
                                    if (parsed.chunk) {
                                        resultText += parsed.chunk;
                                        // 🌟 实时响应式流式渲染更新到前端组件
                                        if (targetIdx !== -1) {
                                            currentMsg.displayBlocks[targetIdx].content = resultText;
                                        }
                                        this.requestScrollToBottom();
                                    } else if (parsed.error) {
                                        throw new Error(parsed.error);
                                    }
                                } catch (e) {
                                    console.error("Parse event error:", e);
                                }
                            }
                        }
                    }
                } else {
                    // 4. 常规单次完整 JSON 返回适配
                    const jsonRes = await response.json();
                    resultText = jsonRes.result || JSON.stringify(jsonRes);
                    
                    if (targetIdx !== -1) {
                        currentMsg.displayBlocks[targetIdx].content = resultText;
                        currentMsg.displayBlocks[targetIdx].name = `${toolName} ${this.t('tool_result')}`;
                    }
                }

                // 5. 将结果同步写入 AI 的 backend_content 节点
                const cleanedForAI = this.truncateForAI(resultText);
                if (currentMsg.backend_content) {
                    for (let i = currentMsg.backend_content.length - 1; i >= 0; i--) {
                        const item = currentMsg.backend_content[i];
                        if (item.role === 'tool' && item.tool_call_id === toolCallId) {
                            item.content = cleanedForAI;
                            break;
                        }
                    }
                } 
            }

            // 更新 HTML 兼容性备份块
            const blockClass = action === 'deny' ? 'type-error' : 'type-result';
            const iconClass = action === 'deny' ? 'fa-xmark' : 'fa-check';
            const finalTitle = action === 'deny' ? this.t('tool_deny') : `${toolName} ${this.t('tool_result')}`;

            const resultHtml = `\n<div class="sap-process-block ${blockClass}" id="${blockId}">
                <div class="sp-header"><i class="fa-solid ${iconClass}"></i> ${escapeHtml(finalTitle)}</div>
                <pre class="sp-content sp-code">${escapeHtml(resultText)}</pre>
            </div>\n`;
            this.updateUIBlock(currentMsg, blockId, resultHtml);

            // 6. 工具流式写入完毕，触发下一轮 AI 续写生成
            await this.generateAIResponse(this.mainAgent, currentMsg.agentName, true);

        } catch (e) {
            console.error("Approval flow failed:", e);
            if (typeof showNotification === 'function') {
                showNotification(e.message || "Tool execution failed", 'error');
            }
            if (targetIdx !== -1) {
                currentMsg.displayBlocks[targetIdx].content = `Error: ${e.message}`;
                currentMsg.displayBlocks[targetIdx].type = 'error';
                currentMsg.displayBlocks[targetIdx].name = 'System Error';
            }
            this.isSending = false;
            this.isTyping = false;
        }
    },

    updateUIBlock(msg, blockId, newHtml) {
        const content = msg.content;
        const startTag = `id="${blockId}"`;
        const startSearchIndex = content.indexOf(startTag);
        
        if (startSearchIndex === -1) {
            msg.content += newHtml;
            return;
        }

        const startIndex = content.lastIndexOf('<div', startSearchIndex);
        let endIndex = -1;
        const searchPart = content.substring(startIndex);
        
        if (searchPart.includes('</div></div>')) {
            endIndex = startIndex + searchPart.indexOf('</div></div>') + 12;
        } else if (searchPart.includes('</div>\n')) {
            endIndex = startIndex + searchPart.indexOf('</div>\n') + 7;
        }

        if (startIndex !== -1 && endIndex !== -1) {
            msg.content = content.substring(0, startIndex) + newHtml + content.substring(endIndex);
        } else {
            msg.content += newHtml;
        }
    },


    getVisibleBlocks(msg) {
        if (!msg.displayBlocks || !msg.displayBlocks.length) return [];
        const blocks = msg.displayBlocks;
        return blocks;
    },

    // === 辅助函数 ===

    // 辅助：调用后端手动执行接口
    async executeToolBackend(name, params, type) {
        try {
            const res = await fetch('/execute_tool_manually', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    tool_name: name, 
                    tool_params: params,
                    approval_type: type 
                })
            });
            
            // 🚀 核心安全防护：先读取为原始文本
            const rawText = await res.text();
            
            // 如果 HTTP 状态码不正确，直接返回后端输出的错误文本，不进行 JSON 解析
            if (!res.ok) {
                return `Server Error (${res.status}): ${rawText}`;
            }
            
            // 尝试以 JSON 解析
            try {
                const json = JSON.parse(rawText);
                return json.result || JSON.stringify(json);
            } catch (jsonErr) {
                // 如果解析失败（说明返回了非 JSON 的纯文本），则直接展示原始文本
                return rawText || `No response from tool execution.`;
            }
        } catch (e) {
            return `System Error: ${e.message}`;
        }
    },
    

    // 1. 带截断的工具结果显示
    truncateDisplayContent(content) {
        if (typeof content !== 'string') return content;
        if (content.length > MAX_DISPLAY_LENGTH) {
            return content.slice(0, MAX_DISPLAY_LENGTH) + '\n... (The result is too long and has been truncated.)';
        }
        return content;
    },

    // 2. 节流版滚动（requestAnimationFrame）
    requestScrollToBottom() {
        if (!this.scrollPending) {
            this.scrollPending = true;
            requestAnimationFrame(() => {
                // ✅ 改为调用原始的 scrollToBottom
                if (typeof this.scrollToBottom === 'function') {
                    this.scrollToBottom();
                }
                this.scrollPending = false;
            });
        }
    },

    // 3. 打字机逐字渲染（requestAnimationFrame 驱动，丝滑流畅）
    _startTypewriterTick() {
        if (this._typewriterRunning) return;
        this._typewriterRunning = true;
        this._tickTypewriter();
    },

    _tickTypewriter() {
        if (!this._typewriterRunning) return;

        const msg = this._streamTargetMsg;
        if (!msg) { this._typewriterRunning = false; return; }

        const buffer = this._streamTextBuffer || '';

        if (buffer.length > 0) {
            const chunk = buffer.slice(0, this._typewriterSpeed);
            this._streamTextBuffer = buffer.slice(this._typewriterSpeed);

            const block = this.getBlockForMsg(msg, 'text');
            if (block) {
                const MAX_TEXT_CONTENT = 150000;
                if (block.content.length < MAX_TEXT_CONTENT) {
                    block.content += chunk;
                } else if (!block.content.endsWith('\n... (Truncated)')) {
                    block.content += '\n... (Truncated)';
                }
                if (msg.pure_content.length < MAX_TEXT_CONTENT) {
                    msg.pure_content += chunk;
                }
                msg.content += chunk;

                this._typewriterTickCount = (this._typewriterTickCount || 0) + 1;
                if (this._typewriterTickCount % 8 === 0 || buffer.length === 0) {
                    block.segments = this.splitMessageContent(block.content);
                    msg.segments = this.splitMessageContent(msg.content);
                }
            }
            this.requestScrollToBottom();
        }

        if (buffer.length > 0 || (this.isTyping && this.isSending)) {
            this._typewriterRafId = requestAnimationFrame(() => this._tickTypewriter());
        } else {
            this._typewriterRunning = false;
        }
    },

    flushStreamTextBuffer() {
        if (this._streamTargetMsg && this._streamTextBuffer) {
            const block = this.getBlockForMsg(this._streamTargetMsg, 'text');
            if (block) {
                const MAX_TEXT_CONTENT = 150000;
                if (block.content.length < MAX_TEXT_CONTENT) {
                    block.content += this._streamTextBuffer;
                } else if (!block.content.endsWith('\n... (Truncated)')) {
                    block.content += '\n... (Truncated)';
                }
                block.segments = this.splitMessageContent(block.content);
                if (this._streamTargetMsg.pure_content.length < MAX_TEXT_CONTENT) {
                    this._streamTargetMsg.pure_content += this._streamTextBuffer;
                }
                this._streamTargetMsg.content += this._streamTextBuffer;
                this._streamTargetMsg.segments = this.splitMessageContent(this._streamTargetMsg.content);
            }
            this._streamTextBuffer = '';
            this.requestScrollToBottom();
        }
    },


    // 1. 判断显示块是否处于活跃状态（正在输出、正在执行或处于等待中）
    isBlockActive(msg, block, blockIndex) {
        // 如果整条消息已经生成并结束，则没有任何块处于活跃状态
        if (msg.generationFinished) return false;

        // 【维度一：显式状态判定】（推荐在流式解析更新 block 时使用）
        // 如果你在更新 displayBlocks 的方法中，给当前正在写入的 block 赋予了活跃标记：
        if (block.active || block.isStreaming || block.status === 'running') {
            return true;
        }

        // 【维度二：位置退级判定】（默认兜底）
        // 在标准的单路流式输出中，最新、且正在接收流式数据的块，必然是 displayBlocks 中的最后一个元素
        const blocks = msg.displayBlocks;
        if (!blocks) return false;
        if (blockIndex === blocks.length - 1) return true;

        // 【维度三：工具块滞后保护】
        // 流式输出中，文本块可能先于工具块完成，导致仍在执行中的工具块
        // 被后续已完成的文本块"挤"到倒数第二个位置而被错误折叠。
        // 对于工具类块（tool_call/tool_result/reasoning），如果它是整个数组中
        // 最后一个工具类块，则仍应视为活跃状态。
        if (this.isToolBlock(block)) {
            for (let i = blocks.length - 1; i > blockIndex; i--) {
                if (this.isToolBlock(blocks[i])) return false;
            }
            return true;
        }

        return false;
    },

    // 2. 统一控制哪些块应该展开，哪些块应该折叠
    shouldExpandBlock(msg, block, blockIndex) {
        // 1. 文本块、审批块、错误块：为保证阅读连贯性，默认始终保持展开
        if (block.type === 'text' || block.type === 'approval' || block.type === 'error') {
            return true;
        }

        // 2. 工具类、思考类块：仅在当前处于活跃状态时展开，完成后自动折叠
        if (this.isToolBlock(block)) {
            return this.isBlockActive(msg, block, blockIndex);
        }

        return true;
    },

    // 3. 判断是否为工具类块
    isToolBlock(block) {
        return block.type === 'tool_call' || block.type === 'tool_result' || block.type === 'reasoning';
    },

    // 打开工具块详情（点击折叠块时）
    openToolBlockDetail(message, block) {
        if (!block || !this.isToolBlock(block)) return;
        
        // 直接保存块对象和消息引用
        this.activeToolBlock = {
            messageIndex: this.messages.indexOf(message),
            blockIndex: message.displayBlocks.indexOf(block), // 保留原始索引，用于可能的后续操作
            block: block
        };
        
        this.activeSideView = 'toolDetail';
        if (!this.sidePanelOpen) {
            this.expandSidePanel();
        }
        this.updatePanelWidths();
    },

    // 关闭工具详情
    closeToolBlockDetail() {
        this.activeToolBlock = null;
        this.activeSideView = 'list';  // 回到扩展列表视图
    },

    // 根据块类型返回对应的图标类名
    getToolBlockIcon(type) {
        const icons = {
            'tool_call': 'fa-solid fa-wrench',
            'tool_result': 'fa-solid fa-check',
            'error': 'fa-solid fa-xmark',
            'approval': 'fa-solid fa-lock'
        };
        return icons[type] || 'fa-solid fa-file-lines';
    },

    // 格式化工具块内容（处理 \n 和 \" 显示）
    formatToolBlockContent(block) {
        if (!block) return '';
        if (block.type === 'approval') {
            return JSON.stringify(block.data?.tool_params, null, 2);
        }
        let content = block.type === 'tool_call' ? (block.args || '') : (block.content || '');
        if (typeof content !== 'string') content = JSON.stringify(content, null, 2);
        return content.replace(/\\n/g, '\n').replace(/\\"/g, '"');
    },

    // 获取消息的指定类型 block（复用原逻辑，但独立出来）
    getBlockForMsg(msg, type, id = null, name = null) {
        if (!msg.displayBlocks) msg.displayBlocks = [];
        if (id) {
            const existing = msg.displayBlocks.find(b => b.type === type && b.id === id);
            if (existing) {
                if (name && !existing.name) existing.name = name;
                return existing;
            }
        }
        let last = msg.displayBlocks[msg.displayBlocks.length - 1];
        const canReuse = last && last.type === type && (!id || last.id === id);
        if (canReuse) {
            if (name && !last.name) last.name = name;
            return last;
        }
        const newBlock = { type, id, name, content: '', args: '', data: null };
        msg.displayBlocks.push(newBlock);

        // 🔥 关键：添加新块后立即裁剪，只保留最后 MAX_RENDERED_BLOCKS 个块
        if (msg.displayBlocks.length > MAX_RENDERED_BLOCKS) {
            msg.displayBlocks.splice(0, msg.displayBlocks.length - MAX_RENDERED_BLOCKS);
        }

        return newBlock;
    },

    // methods 增加此函数
    smartMergeTerminal(existing, chunk) {
        if (!chunk) return existing;
        
        // 🚀 核心优化：避免 split('\n') 全局遍历导致的 O(N^2) 内存灾难与 OOM 崩溃
        if (chunk.includes('\r')) {
            let combined = existing + chunk;
            const lastNewlineIndex = combined.lastIndexOf('\n');
            const previousLines = lastNewlineIndex !== -1 ? combined.substring(0, lastNewlineIndex + 1) : '';
            const lastLine = lastNewlineIndex !== -1 ? combined.substring(lastNewlineIndex + 1) : combined;
            
            const subParts = lastLine.split('\r');
            return previousLines + subParts[subParts.length - 1];
        }
        
        return existing + chunk;
    },

    // 辅助：为 AI 准备的精简函数
    truncateForAI(text) {
        if (!text) return '';
        const MAX_LIMIT = 8000; // 传回 AI 的上限，根据需求调整
        
        // 1. 剔除进度条行（包含 █ 或大量进度字符的行对 AI 没用，浪费 Token）
        let lines = text.split('\n');
        let cleanedLines = lines.filter(line => {
            // 过滤掉包含进度条特征的行
            const isProgressBar = (line.includes('█') || line.includes('░') || (line.includes('%') && line.includes('|')));
            return !isProgressBar;
        });
        
        let cleanedText = cleanedLines.join('\n').trim();
        
        // 2. 如果依然超长，进行头尾截断
        if (cleanedText.length > MAX_LIMIT) {
            return cleanedText.substring(0, 2000) + 
                  `\n\n... [Total ${text.length} chars. Output truncated for context. User sees full output above.] ...\n\n` + 
                  cleanedText.slice(-4000);
        }
        return cleanedText;
    },

    // 辅助：转义 HTML (如果已有可忽略)
    escapeHtml(text) {
        if (!text) return '';
        return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    },
    async handleInputPaste(event) {
      const items = (event.clipboardData || window.clipboardData).items;
      
      // 🆕 配置: 超过多少字符转为文件
      const TEXT_TO_FILE_THRESHOLD = 2000; 

      const imageFiles = []; // 待上传的图片列表
      const videoFiles = []; // 🆕 待上传的视频列表
      const docFiles = [];   // 待上传的普通文件列表
      let hasValidContent = false;

      // 1. 遍历剪贴板中的项目
      for (const item of items) {
        if (item.kind === 'file') {
          const file = item.getAsFile();
          if (!file) continue;

          const ext = (file.name.split('.').pop() || '').toLowerCase();
          const isImageMime = item.type.startsWith('image/');
          const isVideoMime = item.type.startsWith('video/'); // 🆕 识别视频MIME

          // --- 视频处理逻辑 ---
          if (isVideoMime || ALLOWED_VIDEO_EXTENSIONS.includes(ext)) {
            videoFiles.push(file);
            hasValidContent = true;
          } 
          // --- 图片处理逻辑 ---
          else if (isImageMime || ALLOWED_IMAGE_EXTENSIONS.includes(ext)) {
            if (file.name === 'image.png' || !file.name.includes('.')) {
              const fileExtension = file.type.split('/')[1] || 'png';
              const namedFile = new File([file], `pasted_image_${Date.now()}.${fileExtension}`, { type: file.type });
              imageFiles.push(namedFile);
            } else {
              imageFiles.push(file);
            }
            hasValidContent = true;
          } 
          // --- 普通文档处理逻辑 ---
          else if (ALLOWED_EXTENSIONS.includes(ext)) {
            docFiles.push(file);
            hasValidContent = true;
          }
        }
      }

      // 2. 如果没有检测到实体文件，检查纯文本是否过长
      if (!hasValidContent) {
          const pastedText = event.clipboardData.getData('text');
          if (pastedText && pastedText.length > TEXT_TO_FILE_THRESHOLD) {
              const fileName = `paste_text_${Date.now()}.txt`;
              const textFile = new File([pastedText], fileName, { type: 'text/plain' });
              docFiles.push(textFile);
              hasValidContent = true;
          }
      }

      // 3. 如果找到了有效内容
      if (hasValidContent) {
        event.preventDefault();

        // 🆕 处理视频
        if (videoFiles.length > 0) {
          this.addFiles(videoFiles, 'video');
        }

        if (imageFiles.length > 0) {
          this.addFiles(imageFiles, 'image');
        }

        if (docFiles.length > 0) {
          this.addFiles(docFiles, 'file');
        }
      }
    },
    getRoleAvatar(name) {
        // 尝试从记忆列表查找
        const mem = this.memories.find(m => m.name === name);
        if (mem && mem.avatar) return mem.avatar;
        // 如果需要，也可以尝试从 agents 列表查找 (如果 agent 对象里存了 avatar)
        // const agentKey = Object.keys(this.agents).find(key => this.agents[key].name === name);
        // if (agentKey && this.agents[agentKey].avatar) return this.agents[agentKey].avatar;
        
        return 'source/Avatar.png';
    },

    async playPCMChunk(b64, currentText = '', message = null) {
        this.isOmniPlaying = true;
        if (message) {
            message.isPlaying = true;
            if (message.omniDuration === undefined) message.omniDuration = 0;
            if (message.omniCurrentTime === undefined) message.omniCurrentTime = 0;
            if (!message.generationFinished) message.omniAudioChunks.push(b64);
        }

        try {
            if (!this.audioCtx) this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            if (this.audioCtx.state === 'suspended') await this.audioCtx.resume();

            // 解码数据
            const raw = atob(b64);
            const pcm16 = new Int16Array(raw.length / 2);
            for (let i = 0; i < raw.length; i += 2) {
                pcm16[i >> 1] = raw.charCodeAt(i) | (raw.charCodeAt(i + 1) << 8);
            }

            const sampleRate = 24000;
            const buf = this.audioCtx.createBuffer(1, pcm16.length, sampleRate);
            const floatData = buf.getChannelData(0);
            for (let i = 0; i < pcm16.length; i++) floatData[i] = pcm16[i] / 32768;

            const chunkDuration = buf.duration;
            if (message && message.isOmni && !message.generationFinished) {
                message.omniDuration += chunkDuration;
            }

            // ======= 【核心修改：利用二进制同步到 VRM】 =======
            if ((this.vrmOnline || this.vtsOnline) && this.ttsWebSocket) {
                const pcmUint8 = new Uint8Array(raw.length);
                for(let i=0; i<raw.length; i++) pcmUint8[i] = raw.charCodeAt(i);
                
                this.sendBinaryToVRM({
                    type: 'omni_chunk',
                    text: currentText, // 传入当前文本
                    sampleRate: sampleRate
                }, pcmUint8.buffer);
            }
            // ===============================================

            const now = this.audioCtx.currentTime;
            if (this.audioStartTime < now) this.audioStartTime = now;

            const src = this.audioCtx.createBufferSource();
            src.buffer = buf;
            if (!this.activeSources) this.activeSources = [];
            this.activeSources.push(src);

            const gainNode = this.audioCtx.createGain();
            gainNode.gain.value = this.vrmOnline ? 0.000001 : 1.0;

            src.connect(gainNode);
            gainNode.connect(this.audioCtx.destination);

            src.onended = () => {
                if (this.activeSources) this.activeSources = this.activeSources.filter(s => s !== src);
                if (message && message.isOmni && !src.isForceStopped) {
                    message.omniCurrentTime += chunkDuration;
                    if (message.omniCurrentTime > message.omniDuration) message.omniCurrentTime = message.omniDuration;

                    if (message.generationFinished && this.activeSources.length === 0) {
                        message.isPlaying = false;
                        message.omniCurrentTime = message.omniDuration;
                        if (this.vrmOnline || this.vtsOnline) this.sendTTSStatusToVRM('allChunksCompleted', {});
                        this.isOmniPlaying = false;
                    }
                }
                try { src.disconnect(); gainNode.disconnect(); } catch (e) {}
            };

            src.start(this.audioStartTime);
            this.audioStartTime += buf.duration;
        } catch (error) {
            console.error('Error in playPCMChunk:', error);
            if (message) message.isPlaying = false;
        }
    },
    // --- [4] 辅助函数：二进制打包打包器 ---
    sendBinaryToVRM(metadata, audioArrayBuffer) {
        if (!this.ttsWebSocket || this.ttsWebSocket.readyState !== WebSocket.OPEN) return;
        const metadataBytes = new TextEncoder().encode(JSON.stringify(metadata));
        const totalBuffer = new Uint8Array(4 + metadataBytes.byteLength + audioArrayBuffer.byteLength);
        const view = new DataView(totalBuffer.buffer);
        view.setUint32(0, metadataBytes.byteLength, true); // JSON长度
        totalBuffer.set(metadataBytes, 4);
        totalBuffer.set(new Uint8Array(audioArrayBuffer), 4 + metadataBytes.byteLength);
        this.ttsWebSocket.send(totalBuffer);
    },

    async translateMessage(index) {
      const msg = this.messages[index];
      const originalContent = msg.content;
      if (msg.isTranslating) return;
      if (originalContent.trim() === '') return;

      // 1. 先占坑
      this.messages[index] = {
        ...msg,
        content: this.t('translating') + '...',
        isTranslating: true,
        originalContent
      };

      try {
        const abortController = new AbortController();
        this.abortController = abortController;

        // 2. 组装 TTS 提示
        let newttsList = [];
        if (this.ttsSettings?.newtts) {
          for (const key in this.ttsSettings.newtts) {
            if (this.ttsSettings.newtts[key].enabled) newttsList.push(key);
          }
        }
        const ttsMsg = (newttsList.length === 0 || !this.ttsSettings?.enabled)
          ? '如果被翻译的文字与目标语言一致，则返回原文即可'
          : `你还需要在翻译的同时，添加对应的音色标签。如果被翻译的文字与目标语言一致，则只需要添加对应的音色标签。注意！不要使用<!--  -->这会导致部分文字不可见！你可以使用以下音色：\n${newttsList.join(', ')}\n，当你生成回答时，将不同的旁白或角色的文字用<音色名></音色名>括起来，以表示这些话是使用这个音色，以控制不同TTS转换成对应音色。对于没有对应音色的部分，可以不括。即使音色名称不为英文，还是可以照样使用<音色名>使用该音色的文本</音色名>来启用对应音色。注意！如果是你扮演的角色的名字在音色列表里，你必须用这个音色标签将你扮演的角色说话的部分括起来！只要是非人物说话的部分，都视为旁白！角色音色应该标记在人物说话的前后！例如：<Narrator>现在是下午三点，她说道：</Narrator><角色名>”天气真好哇！“</角色名><Narrator>说完她伸了个懒腰。</Narrator>\n\n`;

        // 3. 发起流式请求
        const response = await fetch('/simple_chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: this.mainAgent,
            messages: [
              {
                role: 'system',
                content: `你是一位专业翻译，请将用户提供的任何内容严格翻译为${this.target_lang}，保持原有格式（如Markdown、换行等），不要添加任何额外内容。只需返回翻译结果。${ttsMsg}`
              },
              {
                role: 'user',
                content: `请翻译以下内容到${this.target_lang}：\n\n${originalContent}`
              }
            ],
            stream: true,
            temperature: 0.1
          }),
          signal: abortController.signal
        });

        if (!response.ok) {
          let errMsg = 'Translation failed';
          try {
            const errData = await response.json();
            errMsg = errData?.error?.message || errMsg;
          } catch (e) {}
          throw new Error(errMsg);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';      // 残余半截行
        let translated = '';  // 累积结果

        // 4. 逐块读
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop(); // 最后一行可能不完整，留到下一轮

          for (const line of lines) {
            if (!line) continue;          // 空行跳过
            try {
              const chunk = JSON.parse(line);
              const delta = chunk.choices?.[0]?.delta?.content ?? '';
              if (delta) {
                translated += delta;
                this.messages[index].content = translated; // 实时渲染
              }
            } catch (e) {
              // 忽略解析失败
            }
          }
        }

        // 5. 翻译完成
        this.messages[index].isTranslating = false;
        this.messages[index].translated = true;

      } catch (error) {
        if (error.name === 'AbortError') {
          // 用户中断，恢复原文
          this.messages[index] = { ...msg, content: originalContent, isTranslating: false };
        } else {
          this.messages[index].content = `Translation error: ${error.message}`;
          this.messages[index].isTranslating = false;
        }
      } finally {
        this.abortController = null;
      }
    },
    stopGenerate() {
      this._typewriterRunning = false;
      this._typewriterTickCount = 0;
      if (this._extSendTimer) { clearTimeout(this._extSendTimer); this._extSendTimer = null; this._extSendPending = false; }
      if (this._typewriterRafId) { cancelAnimationFrame(this._typewriterRafId); this._typewriterRafId = null; }
      if (this.abortController) {
        this.abortController.abort();
      }
      this.isThinkOpen = false;
      this.isSending = false;
      this.isTyping = false;
      this.abortController = null;
      if(this.settings.enableOmniTTS){
        if (this.activeSources && this.activeSources.length > 0) {
          this.activeSources.forEach(src => {
            try {
              src.stop(); // 立即停止播放
            } catch (e) {
              // 忽略已经停止或未开始的错误
            }
          });
          // 清空数组
          this.activeSources = [];
        }
        this.audioStartTime = 0; 
        this.stopAllAudioPlayback();
      }
    },
    async autoSaveSettings() {
      if (this.isElectron) {
        await window.electronAPI.saveChromeSettings(JSON.parse(JSON.stringify(this.chromeMCPSettings)));
      }
      return new Promise((resolve, reject) => {
        this.ensureConversationGroups();
        
        // 🚀 剔除文件对象中隐藏的 base64 blob，仅保留关键路径供恢复
        const cleanFiles = (files) => (files || []).map(f => ({ name: f.name, path: f.path, type: f.type, detectedType: f.detectedType }));

        const payload = {
          ...this.settings,
          showHistorySidebar: this.showHistorySidebar,
          system_prompt: this.system_prompt,
          SystemPromptsList: this.SystemPromptsList,
          agents: this.agents,
          mainAgent: this.mainAgent,
          qqBotConfig : this.qqBotConfig,
          feishuBotConfig: this.feishuBotConfig,
          wechatBotConfig: this.wechatBotConfig,
          weComBotConfig: this.weComBotConfig,
          dingtalkBotConfig: this.dingtalkBotConfig,
          discordBotConfig: this.discordBotConfig,
          slackBotConfig: this.slackBotConfig,
          telegramBotConfig: this.telegramBotConfig,
          targetLangSelected: this.targetLangSelected,
          allBriefly: this.allBriefly,
          isForceScrollToBottom: this.isForceScrollToBottom,
          BotConfig: this.BotConfig,
          liveConfig: this.liveConfig,
          WXBotConfig: this.WXBotConfig,
          stickerPacks: this.stickerPacks,
          tools: this.toolsSettings,
          llmTools: this.llmTools,
          conversationId: this.conversationId,
          conversationGroups: this.conversationGroups,
          reasoner: this.reasonerSettings,
          fast: this.fastSettings,
          isBtnCollapse: this.isBtnCollapse,
          vision: this.visionSettings,
          webSearch: this.webSearchSettings, 
          codeSettings: this.codeSettings,
          CLISettings: this.CLISettings,
          acpSettings: this.acpSettings,
          visionControlSettings: this.visionControlSettings,
          loveSettings: this.loveSettings,
          diarySettings: this.diarySettings,
          ccSettings: this.ccSettings,
          qcSettings: this.qcSettings,
          dsSettings: this.dsSettings,
          localEnvSettings: this.localEnvSettings,
          ocSettings: this.ocSettings,
          HASettings: this.HASettings,
          chromeMCPSettings: this.chromeMCPSettings,
          sqlSettings: this.sqlSettings,
          KBSettings: this.KBSettings,
          textFiles: cleanFiles(this.textFiles),
          imageFiles: cleanFiles(this.imageFiles),
          videoFiles: cleanFiles(this.videoFiles),
          knowledgeBases: this.knowledgeBases,
          modelProviders: this.modelProviders,
          systemSettings: this.systemSettings,
          largeMoreButtonDict: this.largeMoreButtonDict,
          smallMoreButtonDict: this.smallMoreButtonDict,
          currentLanguage: this.currentLanguage,
          mcpServers: this.mcpServers,
          a2aServers: this.a2aServers,
          isdocker: this.isdocker,
          memories: this.memories,
          memorySettings: this.memorySettings,
          text2imgSettings: this.text2imgSettings,
          asrSettings: this.asrSettings,
          ttsSettings: this.ttsSettings,
          behaviorSettings: this.behaviorSettings,
          VRMConfig: this.VRMConfig,
          THAConfig: this.THAConfig,
          comfyuiServers: this.comfyuiServers,
          comfyuiAPIkey: this.comfyuiAPIkey,
          workflows: this.workflows,
          custom_http: this.customHttpTools,
          showBrowserChat: this.showBrowserChat,
          searchEngine: this.searchEngine,
          isGroupMode: this.isGroupMode,
          selectedGroupAgents: this.selectedGroupAgents,
        };
        const correlationId = uuid.v4();
        
        try {
            const jsonStr = JSON.stringify({
                type: 'save_settings',
                data: payload,
                correlationId: correlationId
            });
            this.ws.send(jsonStr);
        } catch (e) {
            console.error("Payload 序列化失败，已阻断白屏崩溃:", e);
            reject(e);
            return;
        }

        const handler = (event) => {
          const response = JSON.parse(event.data);
          if (response.type === 'settings_saved' && response.correlationId === correlationId) {
            this.ws.removeEventListener('message', handler);
            resolve();
          }
          if (response.type === 'save_error') {
            this.ws.removeEventListener('message', handler);
            reject(new Error('保存失败'));
          }
        };
        const timeout = setTimeout(() => {
          this.ws.removeEventListener('message', handler);
          reject(new Error('保存超时'));
        }, 10000);
        this.ws.addEventListener('message', handler);
      });
    },

    getSanitizedConversations() {
      // 使用 map 创建新数组，不影响原始的内存数据
      return this.conversations.map(conv => ({
        ...conv,
        // 清洗消息列表
        messages: conv.messages.map(msg => {
          // 使用解构赋值，排除掉不需要保存的大体积/临时属性
          const {
            audioChunks,      // 普通 TTS 的音频 Blob URL (保存了也没用)
            omniAudioChunks,  // PCM 流的巨大 Base64 数组 (核心清洗目标)
            ttsQueue,         // 运行时的 Set 队列
            isPlaying,        // 播放状态
            cur_audioDatas,   // 临时 Base64 数据
            ...rest           // 保留 role, content, pure_content, timestamp, fileLinks 等
          } = msg;

          // 返回一个干净的消息对象
          return {
            ...rest,
            // 明确将这些字段设为空，防止某些旧数据残留
            audioChunks: [],
            omniAudioChunks: [],
            currentChunk: 0,
            omniCurrentTime: 0,
            isPlaying: false
          };
        })
      }));
    },

    async saveConversations() {
      return new Promise((resolve, reject) => {
        const sanitizedConversations = this.getSanitizedConversations();

        const payload = {
          conversations: sanitizedConversations,
          conversationGroups: this.conversationGroups
        };
        const correlationId = uuid.v4();
        
        try {
            const jsonStr = JSON.stringify({
                type: 'save_conversations',
                data: payload,
                correlationId: correlationId
            });
            this.ws.send(jsonStr);
        } catch (e) {
            console.error("对话记录序列化失败，已阻断白屏崩溃:", e);
            reject(e);
            return;
        }

        const handler = (event) => {
          const response = JSON.parse(event.data);
          if (response.type === 'conversations_saved' && response.correlationId === correlationId) {
            this.ws.removeEventListener('message', handler);
            resolve();
          }
          if (response.type === 'save_error') {
            this.ws.removeEventListener('message', handler);
            reject(new Error('保存失败'));
          }
        };
        const timeout = setTimeout(() => {
          this.ws.removeEventListener('message', handler);
          reject(new Error('保存超时'));
        }, 10000);
        this.ws.addEventListener('message', handler);
      });
    },

    getSanitizedConversation(conv) {
      return {
        ...conv,
        messages: conv.messages.map(msg => {
          const {
            audioChunks, omniAudioChunks, ttsQueue, isPlaying, cur_audioDatas, ...rest
          } = msg;
          return { ...rest, audioChunks: [], omniAudioChunks: [], currentChunk: 0, omniCurrentTime: 0, isPlaying: false };
        })
      };
    },

    saveCurrentConversation() {
      if (!this.conversationId || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      try {
        const conv = this.conversations.find(c => c.id === this.conversationId);
        if (!conv) return;
        const sanitized = this.getSanitizedConversation(conv);
        const jsonStr = JSON.stringify({
          type: 'save_current_conversation',
          data: { conversationId: this.conversationId, conversation: sanitized },
          correlationId: uuid.v4()
        });
        this.ws.send(jsonStr);
      } catch (e) {
        console.error("增量保存对话失败:", e);
      }
    },

    // 修改后的fetchModels方法
    async fetchModels() {
      this.modelsLoading = true;
      try {
        const response = await fetch(`/v1/models`);
        const result = await response.json();
        
        // 双重解构获取数据
        const { data } = result;
        
        this.models = data.map(item => ({
          id: item.id,
          created: new Date(item.created * 1000).toLocaleDateString(),
        }));
        
      } catch (error) {
        console.error('获取模型数据失败:', error);
        this.modelsError = error.message;
        this.models = []; // 确保清空数据
      } finally {
        this.modelsLoading = false;
      }
    },

    // 修改copyEndpoint方法
    copyEndpoint() {
      navigator.clipboard.writeText(`${this.partyURL}/v1`)
        .then(() => {
          showNotification(this.t('copy_success'), 'success');
        })
        .catch(() => {
          showNotification(this.t('copy_fail'), 'error');
        });
    },

    copyMCPEndpoint(){
      navigator.clipboard.writeText(`${this.partyURL}/mcp`)
        .then(() => {
          showNotification(this.t('copy_success'), 'success');
        })
        .catch(() => {
          showNotification(this.t('copy_fail'), 'error');
        });
    },
    copyVrmEndpoint(){
      navigator.clipboard.writeText(`${this.partyURL}/vrm.html`)
        .then(() => {
          showNotification(this.t('copy_success'), 'success');
        })
        .catch(() => {
          showNotification(this.t('copy_fail'), 'error');
        });
    },
    copyTHAEndpoint(){
      navigator.clipboard.writeText(`${this.partyURL}/tha.html`)
        .then(() => {
          showNotification(this.t('copy_success'), 'success');
        })
        .catch(() => {
          showNotification(this.t('copy_fail'), 'error');
        });
    },
    copyURL(url) {
      navigator.clipboard.writeText(url)
        .then(() => {
          showNotification(this.t('copy_success'), 'success');
        })
        .catch(() => {
          showNotification(this.t('copy_fail'), 'error');
        });
    },
    copyModel() {
      navigator.clipboard.writeText('super-model')
        .then(() => {
          showNotification(this.t('copy_success'));
        })
        .catch(() => {
          showNotification(this.t('copy_fail'), 'error');
        });
    },

    toggleSection(section) {
      this.expandedSections[section] = !this.expandedSections[section]
      this.autoSaveSettings()
    },
    
    // 新增点击头部的处理
    handleHeaderClick(section) {
      this.toggleSection(section)
    },
    async clearMessages(groupId = null) {
      this.stopGenerate();
      const targetGroupId = groupId || this.activeConversationGroupId || this.draftConversationGroupId || 'default';
      this.activeConversationGroupId = targetGroupId;
      this.draftConversationGroupId = targetGroupId;
      if (this.system_prompt){
        this.messages = [{ role: 'system', content: this.system_prompt }];
      } else {
        this.messages = [{ role: 'system', content: ' ' }];
      }
      this.conversationId = null;
      this.fileLinks = [];
      this.isThinkOpen = false; // 重置思考模式状态
      this.asyncToolsID = [];
      this.inAutoMode = false; // 重置自动模式状态
      this.randomGreetings(); // 重新生成随机问候语
      this.requestScrollToBottom();    // 触发界面更新
      this.autoSaveSettings();
      this.sendMessagesToExtension(); // 发送消息到插件
    },


  async browseAllFiles() {
    if (!this.isElectron) {
      // 浏览器环境
      const input = document.createElement('input')
      input.type = 'file'
      input.multiple = true
      // 合并接受的文件类型
      input.accept = ALL_ALLOWED_EXTENSIONS.map(ext => `.${ext}`).join(',')
      
      input.onchange = (e) => {
        const files = Array.from(e.target.files)
        // 统一验证：只要在合并后的列表中即可
        const validFiles = files.filter(file => {
          const ext = file.name.split('.').pop()?.toLowerCase();
          return ALL_ALLOWED_EXTENSIONS.includes(ext);
        })
        this.handleFiles(validFiles)
      }
      input.click()
    } else {
      // Electron 环境
      // 假设你的 electronAPI.openFileDialog 支持多选并返回路径
      const result = await window.electronAPI.openFileDialog(); 
      if (!result.canceled) {
        const files = await Promise.all(
          result.filePaths
            .filter(path => {
              const ext = path.split('.').pop()?.toLowerCase() || '';
              return ALL_ALLOWED_EXTENSIONS.includes(ext);
            })
            .map(async path => {
              const buffer = await window.electronAPI.readFile(path);
              const blob = new Blob([buffer]);
              return new File([blob], path.split(/[\\/]/).pop());
            })
        );
        this.handleFiles(files);
      }
    }
  },

    async sendFiles() {
      this.showUploadDialog = true;
      // 设置文件上传专用处理
      this.currentUploadType = 'file';
    },
    async sendImages() {
      this.showUploadDialog = true;
      // 设置图片上传专用处理
      this.currentUploadType = 'image';
    },
    browseFiles() {
      if (this.currentUploadType === 'image') {
        this.browseImages();
      } else {
        this.browseDocuments();
      }
    },
    
    // 专门处理图片选择
    async browseImages() {
      if (!this.isElectron) {
        const input = document.createElement('input')
        input.type = 'file'
        input.multiple = true
        input.accept = ALLOWED_IMAGE_EXTENSIONS.map(ext => `.${ext}`).join(',')
        
        input.onchange = (e) => {
          const files = Array.from(e.target.files)
          const validFiles = files.filter(this.isValidImageType)
          this.handleFiles(validFiles)
        }
        input.click()
      } else {
        const result = await window.electronAPI.openImageDialog();
        if (!result.canceled) {
          // 转换Electron文件路径为File对象
          const files = await Promise.all(
            result.filePaths
              .filter(path => {
                const ext = path.split('.').pop()?.toLowerCase() || '';
                return ALLOWED_IMAGE_EXTENSIONS.includes(ext);
              })
              .map(async path => {
                // 读取文件内容并转换为File对象
                const buffer = await window.electronAPI.readFile(path);
                const blob = new Blob([buffer]);
                return new File([blob], path.split(/[\\/]/).pop());
              })
          );
          this.handleFiles(files);
        }
      }
    },

    // 文件选择处理方法
    async browseDocuments() {
      if (!this.isElectron) {
        const input = document.createElement('input')
        input.type = 'file'
        input.multiple = true
        input.accept = ALLOWED_EXTENSIONS.map(ext => `.${ext}`).join(',')
        
        input.onchange = (e) => {
          const files = Array.from(e.target.files)
          const validFiles = files.filter(this.isValidFileType)
          this.handleFiles(validFiles)
        }
        input.click()
      } else {
        const result = await window.electronAPI.openFileDialog();
        if (!result.canceled) {
          // 转换Electron文件路径为File对象
          const files = await Promise.all(
            result.filePaths
              .filter(path => {
                const ext = path.split('.').pop()?.toLowerCase() || '';
                return ALLOWED_EXTENSIONS.includes(ext);
              })
              .map(async path => {
                // 读取文件内容并转换为File对象
                const buffer = await window.electronAPI.readFile(path);
                const blob = new Blob([buffer]);
                return new File([blob], path.split(/[\\/]/).pop());
              })
          );
          this.handleFiles(files);
        }
      }
    },
    // 文件选择处理方法
    async browseReadFiles() {
      if (!this.isElectron) {
        const input = document.createElement('input')
        input.type = 'file'
        input.multiple = true
        input.accept = ALLOWED_EXTENSIONS.map(ext => `.${ext}`).join(',')
        
        input.onchange = (e) => {
          const files = Array.from(e.target.files)
          const validFiles = files.filter(this.isValidFileType)
          this.handleReadFiles(validFiles)
        }
        input.click()
      } else {
        const result = await window.electronAPI.openFileDialog();
        if (!result.canceled) {
          // 转换Electron文件路径为File对象
          const files = await Promise.all(
            result.filePaths
              .filter(path => {
                const ext = path.split('.').pop()?.toLowerCase() || '';
                return ALLOWED_EXTENSIONS.includes(ext);
              })
              .map(async path => {
                // 读取文件内容并转换为File对象
                const buffer = await window.electronAPI.readFile(path);
                const blob = new Blob([buffer]);
                return new File([blob], path.split(/[\\/]/).pop());
              })
          );
          this.handleReadFiles(files);
        }
      }
    },

    // 文件验证方法
    isValidFileType(file) {
      if (this.currentUploadType === 'image') {
        return this.isValidImageType(file);
      }
      const ext = (file.name.split('.').pop() || '').toLowerCase()
      return ALLOWED_EXTENSIONS.includes(ext) || MIME_WHITELIST.some(mime => file.type.includes(mime))
    },
    isValidImageType(file) {
      const ext = (file.name.split('.').pop() || '').toLowerCase()
      return ALLOWED_IMAGE_EXTENSIONS.includes(ext) || IMAGE_MIME_WHITELIST.some(mime => file.type.includes(mime))
    },

  // 拖拽释放处理
  async handleInputDrop(event) {
    this.isDragging = false;
    const files = Array.from(event.dataTransfer.files);
    if (files.length > 0) {
      await this.handleFiles(files);
    }
  },

  // 粘贴处理 (同时也支持截图粘贴)
  handleInputPaste(event) {
    const items = event.clipboardData.items;
    const files = [];
    let hasFiles = false;
    
    for (let i = 0; i < items.length; i++) {
      if (items[i].kind === 'file') {
        files.push(items[i].getAsFile());
        hasFiles = true;
      }
    }
    
    if (hasFiles) {
      // 有文件时阻止默认行为
      event.preventDefault();
      this.handleFiles(files);
    }
    // 没有文件时，让浏览器正常处理文本粘贴
  },


    // 统一处理文件
    async handleFiles(files) {
      // 1. 合并所有允许的后缀，用于初步过滤
      const allAllowed = [...ALLOWED_VIDEO_EXTENSIONS, ...ALLOWED_IMAGE_EXTENSIONS, ...ALLOWED_EXTENSIONS];
      
      // 2. 遍历处理每一个选中的文件
      files.forEach(file => {
        try {
          const filename = file.name || (file.path && file.path.split(/[\\/]/).pop()) || '';
          const ext = filename.split('.').pop()?.toLowerCase() || '';

          // 检查是否在允许名单内
          if (ALLOWED_IMAGE_EXTENSIONS.includes(ext)) {
            // 如果是图片，按图片逻辑添加
            this.addFiles([file], 'image');
          } else if (ALLOWED_VIDEO_EXTENSIONS.includes(ext)) {
            // 如果是文档，按文件逻辑添加
            this.addFiles([file], 'video');
          } else if (ALLOWED_EXTENSIONS.includes(ext)) {
            // 如果是文档，按文件逻辑添加
            this.addFiles([file], 'file');
          } else {
            // 不支持的类型
            console.warn(`不支持的文件类型: ${ext}`);
            // 可以选加：this.showErrorAlert('file'); 
          }
        } catch (e) {
          console.error('文件分拣错误:', e);
        }
      });
    },
    // 统一处理文件
    async handleReadFiles(files) {
      this.showFileDialog = false;
      const allowedExtensions = this.currentUploadType === 'image' ? ALLOWED_IMAGE_EXTENSIONS : ALLOWED_EXTENSIONS;

      const validFiles = files.filter(file => {
        try {
          // 安全获取文件扩展名
          const filename = file.name || (file.path && file.path.split(/[\\/]/).pop()) || '';
          const ext = filename.split('.').pop()?.toLowerCase() || '';
          return allowedExtensions.includes(ext);
        } catch (e) {
          console.error('文件处理错误:', e);
          return false;
        }
      });

      if (validFiles.length > 0) {
        const formData = new FormData();

        for (const file of validFiles) {
          formData.append('files', file, file.name);
        }

        try {
          console.log('Uploading files...');
          const response = await fetch(`/load_file`, {
            method: 'POST',
            body: formData
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.error('Server responded with an error:', errorText);
            showNotification(this.t('file_upload_failed'), 'error');
            return;
          }

          const data = await response.json();
          if (data.success) {      
            // 将新的文件信息添加到 this.textFiles
            this.textFiles = [...data.textFiles,...this.textFiles];
            this.selectedFile = data.textFiles[0].unique_filename;
            this.autoSaveSettings();
            this.parseSelectedFile();
          } else {
            showNotification(this.t('file_upload_failed'), 'error');
          }
        } catch (error) {
          console.error('Error during file upload:', error);
          showNotification(this.t('file_upload_failed'), 'error');
        }
      } else {
        this.showErrorAlert(this.currentUploadType);
      }
    },
    clearLongText() {
      this.selectedFile = null;
      this.readConfig.longTextList = [];
      this.longTextListIndex = 0;
      this.readConfig.longText = '';
    },
    removeItem(index, type) {
      if (type === 'file') {
        this.files.splice(index, 1);
      } else {
        // 如果是图片，则从图片列表中删除，考虑this.files长度
        index = index - this.files.length;
        this.images.splice(index, 1);
      }
    },
    // 错误提示
    showErrorAlert(type = 'file') {
      const fileTypes = {
        file: this.t('file_type_error'),
        image: this.t('image_type_error')
      };
      showNotification(fileTypes[type], 'error');
    },
    // 拖放处理
    handleDrop(event) {
      event.preventDefault()
      const files = Array.from(event.dataTransfer.files)
        .filter(this.isValidFileType)
      this.handleFiles(files)
    },
        // 拖放处理
    handleReadDrop(event) {
      event.preventDefault()
      const files = Array.from(event.dataTransfer.files)
        .filter(this.isValidFileType)
      this.handleReadFiles(files)
    },
    switchToApiBox() {
      // 切换到 API 钥匙箱界面
      this.activeMenu = 'model-config';
      this.subMenu = 'service';
    },

    // 添加文件到列表
    addFiles(files, type = 'file') {
      // 决定存入哪个展示数组 (图片和视频都进入 this.images 用于视觉预览)
      const targetArray = type === 'image' || type === 'video' ? this.images : this.files;

      const newFiles = files.map(file => {
        // ✨ 在这里进行精准类型判定
        let detectedType = type; 

        return {
          path: URL.createObjectURL(file),
          name: file.name,
          file: file,
          detectedType: detectedType // 存入具体的类型：'video', 'image' 或 'file'
        };
      });

      targetArray.push(...newFiles);
      this.showUploadDialog = false;
    },
    highlightCode() {
      this.$nextTick(() => {
        document.querySelectorAll('pre code').forEach(block => {
          hljs.highlightElement(block);
        });
        this.initCopyButtons();
      });
    },
    async addProvider() {
      this.modelProviders.push({
        id: Date.now(),
        vendor: this.newProviderTemp.vendor,
        url: this.newProviderTemp.url,
        apiKey: '',
        modelId: '',
        isNew: true
      });
      this.newProviderTemp = { vendor: '', url: '', apiKey: '', modelId: '' };
      await this.autoSaveSettings();
    },
    async fetchModelsForProvider(provider) {
      try {
        console.log('Fetching models for provider:', provider.vendor);
        const response = await fetch(`/v1/providers/models`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            url: provider.url,
            api_key: provider.apiKey,
            vendor: provider.vendor
          })
        });
        if (!response.ok) {
          throw new Error('Failed to fetch models');
        }
        const data = await response.json();
        provider.models = data.data;
        showNotification(this.t('fetch_models_success'));
      } catch (error) {
        showNotification(this.t('fetch_models_failed'), 'error');
      }
    },
    async testAndFetchModels() {
      if (!this.newProviderTemp.url || !this.newProviderTemp.apiKey) {
        showNotification(this.t('enterUrlAndKey'), 'warning');
        return;
      }
      this.newProviderTemp.connectionStatus = 'testing';
      this.newProviderTemp.modelsLoading = true;
      this.newProviderTemp.models = [];
      try {
        const response = await fetch(`/v1/providers/models`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: this.newProviderTemp.url,
            api_key: this.newProviderTemp.apiKey,
            vendor: this.newProviderTemp.vendor
          })
        });
        if (!response.ok) throw new Error('Connection failed');
        const data = await response.json();
        this.newProviderTemp.models = data.data || [];
        this.newProviderTemp.connectionStatus = 'success';
        this.newProviderTemp.modelsLoading = false;
      } catch (error) {
        this.newProviderTemp.connectionStatus = 'failed';
        this.newProviderTemp.modelsLoading = false;
        this.newProviderTemp.models = [];
      }
    },
    // 找到原有的 removeProvider 方法，替换为以下代码
    async removeProvider(index) {
      // 获取被删除的供应商信息
      const removedProvider = this.modelProviders[index];
      
      // 从供应商列表中移除
      this.modelProviders.splice(index, 1);

      // 清理所有相关配置中的引用
      const providerId = removedProvider.id;
      
      // 主模型配置清理
      if (this.settings.selectedProvider === providerId) {
        this.settings.selectedProvider = null;
        this.settings.model = '';
        this.settings.base_url = '';
        this.settings.api_key = '';
      }

      // 推理模型配置清理
      if (this.reasonerSettings.selectedProvider === providerId) {
        this.reasonerSettings.selectedProvider = null;
        this.reasonerSettings.model = '';
        this.reasonerSettings.base_url = '';
        this.reasonerSettings.api_key = '';
      }

      // 触发自动保存
      await this.autoSaveSettings();
    },
    confirmAddProvider() {
      if (!this.newProviderTemp.vendor) {
        showNotification(this.t('vendor_required'), 'warning')
        return
      }
      
      const newProvider = {
        id: Date.now(),
        vendor: this.newProviderTemp.vendor,
        url: this.newProviderTemp.url,
        apiKey: this.newProviderTemp.apiKey || '',
        modelId: this.newProviderTemp.models.length > 0 ? this.newProviderTemp.models[0] : (this.newProviderTemp.modelId || ''),
        models: this.newProviderTemp.models || []
      }
      
      this.modelProviders.push(newProvider)
      this.showAddDialog = false
      this.newProviderTemp = { vendor: '', url: '', apiKey: '', modelId: '', models: [], modelsLoading: false, connectionStatus: null }
      this.autoSaveSettings()
    },
    handleVendorChange(value) {
      const defaultUrls = {
        'OpenAI': 'https://api.openai.com/v1',
        'Deepseek': 'https://api.deepseek.com/v1',
        'aliyun': 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        'ZhipuAI': 'https://open.bigmodel.cn/api/paas/v4',
        'Volcano': 'https://ark.cn-beijing.volces.com/api/v3',
        'moonshot': 'https://api.moonshot.cn/v1',
        'minimax': 'https://api.minimaxi.com/v1',
        'MiMo': 'https://api.xiaomimimo.com/v1',
        'longcat':'https://api.longcat.chat/openai/v1',
        'Ollama': this.isdocker ? 'http://host.docker.internal:11434/v1' : 'http://127.0.0.1:11434/v1',
        'Vllm': this.isdocker ? 'http://host.docker.internal:8000/v1' :'http://127.0.0.1:8000/v1',
        'LMstudio': this.isdocker ? 'http://host.docker.internal:1234/v1' :'http://127.0.0.1:1234/v1',
        'xinference': this.isdocker ? 'http://host.docker.internal:9997/v1' :'http://127.0.0.1:9997/v1',
        'Dify': this.isdocker ? 'http://host.docker.internal/v1' :'http://127.0.0.1/v1',
        'newapi': this.isdocker ? 'http://host.docker.internal:3000/v1' : 'http://127.0.0.1:3000/v1',
        'LocalAI': this.isdocker ? 'http://host.docker.internal:8080/v1' : 'http://127.0.0.1:8080/v1',
        'ttswebui': this.isdocker ? 'http://host.docker.internal:7778/v1' : 'http://127.0.0.1:7778/v1',
        'SGLang': this.isdocker ? 'http://host.docker.internal:3000/v1' : 'http://127.0.0.1:3000/v1', 
        'llama.cpp': this.isdocker ? 'http://host.docker.internal:8080/v1' : 'http://127.0.0.1:8080/v1',
        'Gemini': 'https://generativelanguage.googleapis.com',
        'Anthropic': 'https://api.anthropic.com/v1',
        'Grok': 'https://api.groq.com/openai/v1',
        'mistral': 'https://api.mistral.ai/v1',
        'lingyi': 'https://api.lingyiwanwu.com/v1',
        'baichuan': 'https://api.baichuan-ai.com/v1',
        'qianfan': 'https://qianfan.baidubce.com/v2',
        'hunyuan': 'https://api.hunyuan.cloud.tencent.com/v1',
        'siliconflow': 'https://api.siliconflow.cn/v1',
        '302.AI': 'https://api.302ai.cn/v1',
        'stepfun': 'https://api.stepfun.com/v1',
        'o3': 'https://api.o3.fan/v1',
        'aihubmix': 'https://aihubmix.com/v1',
        'ocoolai': 'https://api.ocoolai.com/v1',
        'Github': 'https://models.github.ai/inference',
        'dmxapi': 'https://www.dmxapi.cn/v1',
        'openrouter': 'https://openrouter.ai/api/v1',
        'together': 'https://api.together.xyz/v1',
        'fireworks': 'https://api.fireworks.ai/inference/v1',
        '360': 'https://api.360.cn/v1',
        'Nvidia': 'https://integrate.api.nvidia.com/v1',
        'hyperbolic': 'https://api.hyperbolic.xyz/v1',
        'jina': 'https://api.jina.ai/v1',
        'gitee': 'https://ai.gitee.com/v1',
        'ppinfra': 'https://api.ppinfra.com/v3/openai/v1',
        'perplexity': 'https://api.perplexity.ai',
        'infini': 'https://cloud.infini-ai.com/maas/v1',
        'modelscope': 'https://api-inference.modelscope.cn/v1',
        'tencent': 'https://api.lkeap.cloud.tencent.com/v1',
      }
      
      if (value !== 'custom' && value !== 'customAnthropic' ) {
        this.newProviderTemp.url = defaultUrls[value] || ''
      }
      if (value === 'Ollama') {
        this.newProviderTemp.apiKey = 'ollama'
      }
      if (value === 'Vllm') {
        this.newProviderTemp.apiKey = 'Vllm'
      }
      if (value === 'LMstudio') {
        this.newProviderTemp.apiKey = 'LMstudio'
      }
      if (value === 'xinference') {
        this.newProviderTemp.apiKey = 'xinference'
      }
      if (value === 'Dify') {
        this.newProviderTemp.modelId = 'dify'
      }
      if (value === 'SGLang') {
        this.newProviderTemp.apiKey = 'SGLang' // 新增
      }
      if (value === 'llama.cpp') {
        this.newProviderTemp.apiKey = 'llamacpp' // 新增
      }
      this.newProviderTemp.models = [];
      this.newProviderTemp.modelsLoading = false;
      this.newProviderTemp.connectionStatus = null;
    },
    // rerank供应商
    async selectRankProvider(providerId) {
      const provider = this.modelProviders.find(p => p.id === providerId);
      if (provider) {
        this.KBSettings.model = provider.modelId;
        this.KBSettings.base_url = provider.url;
        this.KBSettings.api_key = provider.apiKey;
        await this.autoSaveSettings();
      }
    },

    // 主模型供应商选择
    async selectMainProvider(providerId) {
      const provider = this.modelProviders.find(p => p.id === providerId);
      console.log(provider)
      if (provider) {
        console.log("provider")
        this.settings.model = provider.modelId;
        this.settings.base_url = provider.url;
        this.settings.api_key = provider.apiKey;
        await this.autoSaveSettings();
      }
    },

    async selectFastProvider(providerId) {
      const provider = this.modelProviders.find(p => p.id === providerId);
      console.log(provider)
      if (provider) {
        console.log("provider")
        this.fastSettings.model = provider.modelId;
        this.fastSettings.base_url = provider.url;
        this.fastSettings.api_key = provider.apiKey;
        await this.autoSaveSettings();
      }
    },

    // Claude code 供应商选择
    async selectCCProvider(providerId) {
      const provider = this.modelProviders.find(p => p.id === providerId);
      let vendor_list = {
        "Anthropic": "https://api.anthropic.com/",
        "Deepseek": "https://api.deepseek.com/anthropic/",
        "siliconflow": "https://api.siliconflow.cn/",
        "ZhipuAI":"https://open.bigmodel.cn/api/anthropic/",
        "moonshot":"https://api.moonshot.cn/anthropic/",
        "aliyun": "https://dashscope.aliyuncs.com/apps/anthropic/",
        "modelscope":"https://api-inference.modelscope.cn/",
        "302.AI":"https://api.302.ai/cc/"
      };

      let cc_url = vendor_list[provider.vendor] || provider.url;

      if (provider) {
        this.ccSettings.model = provider.modelId;
        this.ccSettings.base_url = cc_url;
        this.ccSettings.api_key = provider.apiKey;
        await this.autoSaveSettings();
      }
    },
    async selectQCProvider(providerId) {
      const provider = this.modelProviders.find(p => p.id === providerId);
      if (provider) {
        this.qcSettings.model = provider.modelId;
        this.qcSettings.base_url = provider.url;
        this.qcSettings.api_key = provider.apiKey;
        await this.autoSaveSettings();
      }
    },
    async selectOCProvider(providerId) {
      const provider = this.modelProviders.find(p => p.id === providerId);
      if (provider) {
        this.ocSettings.model = provider.modelId;
        this.ocSettings.base_url = provider.url;
        this.ocSettings.api_key = provider.apiKey;
        await this.autoSaveSettings();
      }
    },
    async selectBrainProvider(providerId) {
      // 1. 在供应商列表中查找详细信息
      const provider = this.modelProviders.find(p => p.id === providerId);

      // 2. 校验：确保找到了供应商，且当前有正在编辑的脑区配置
      if (provider && this.currentBrainSettings) {
        // 3. 将供应商的详细信息 (model, url, key) 同步到当前脑区的设置中
        this.currentBrainSettings.model = provider.modelId;
        this.currentBrainSettings.base_url = provider.url;
        this.currentBrainSettings.api_key = provider.apiKey;

        // 4. 打印日志方便调试
        console.log(`[${this.currentEditingKey}] 切换模型为: ${provider.modelId}`);

        // 5. 自动保存
        if (typeof this.autoSaveSettings === 'function') {
          await this.autoSaveSettings();
        }
      }
    },
    // 推理模型供应商选择
    async selectReasonerProvider(providerId) {
      const provider = this.modelProviders.find(p => p.id === providerId);
      if (provider) {
        this.reasonerSettings.model = provider.modelId;
        this.reasonerSettings.base_url = provider.url;
        this.reasonerSettings.api_key = provider.apiKey;
        await this.autoSaveSettings();
      }
    },
    async selectVisionProvider(providerId) {
      const provider = this.modelProviders.find(p => p.id === providerId);
      if (provider) {
        this.visionSettings.model = provider.modelId;
        this.visionSettings.base_url = provider.url;
        this.visionSettings.api_key = provider.apiKey;
        await this.autoSaveSettings();
      }
    },
    async selectText2imgProvider(providerId) {
      const provider = this.modelProviders.find(p => p.id === providerId);
      if (provider) {
        this.text2imgSettings.model = provider.modelId;
        this.text2imgSettings.base_url = provider.url;
        this.text2imgSettings.api_key = provider.apiKey;
        this.text2imgSettings.vendor = provider.vendor;
        if (this.text2imgSettings.vendor === 'siliconflow') {
          this.text2imgSettings.size = '1024x1024';
        }
        else {
          this.text2imgSettings.size = 'auto';
        }
        await this.autoSaveSettings();
      }
    },
    async selectAsrProvider(providerId) {
      const provider = this.modelProviders.find(p => p.id === providerId);
      if (provider) {
        this.asrSettings.model = provider.modelId;
        this.asrSettings.base_url = provider.url;
        this.asrSettings.api_key = provider.apiKey;
        this.asrSettings.vendor = provider.vendor;
        await this.autoSaveSettings();
      }
    },
    async selectTTSProvider(providerId) {
      const provider = this.modelProviders.find(p => p.id === providerId);
      if (provider) {
        this.ttsSettings.model = provider.modelId;
        this.ttsSettings.base_url = provider.url;
        this.ttsSettings.api_key = provider.apiKey;
        this.ttsSettings.vendor = provider.vendor;
        await this.autoSaveSettings();
      }
    },
    handleTTSProviderVisibleChange(visible) {
      if (!visible) {
        this.selectTTSProvider(this.ttsSettings.selectedProvider);
      }
    },
    handleAsrProviderVisibleChange(visible) {
      if (!visible) {
        this.selectAsrProvider(this.asrSettings.selectedProvider);
      }
    },
    handleText2imgProviderVisibleChange(visible) {
      if (!visible) {
        this.selectText2imgProvider(this.text2imgSettings.selectedProvider);
      }
    },

    handleRankProviderVisibleChange(visible) {
      if (!visible) {
        this.selectRankProvider(this.KBSettings.selectedProvider);
      }
    },

    // 在methods中添加
    handleMainProviderVisibleChange(visible) {
      if (!visible) {
        this.selectMainProvider(this.settings.selectedProvider);
      }
    },
    handleFastProviderVisibleChange(visible) {
      if (!visible) {
        this.selectFastProvider(this.fastSettings.selectedProvider);
      }
    },

    handleCCProviderVisibleChange(visible) {
      if (!visible) {
        this.selectCCProvider(this.ccSettings.selectedProvider);
      }
    },
    handleQCProviderVisibleChange(visible) {
      if (!visible) {
        this.selectQCProvider(this.qcSettings.selectedProvider);
      }
    },
    handleOCProviderVisibleChange(visible) {
      if (!visible) {
        this.selectOCProvider(this.ocSettings.selectedProvider);
      }
    },
    handleReasonerProviderVisibleChange(visible) {
      if (!visible) {
        this.selectReasonerProvider(this.reasonerSettings.selectedProvider);
      }
    },
    handleVisionProviderVisibleChange(visible) {
      if (!visible) {
        this.selectVisionProvider(this.visionSettings.selectedProvider);
      }
    },
    handleBrainProviderVisibleChange(visible) {
      // 当下拉框关闭 (!visible) 且当前有选中的供应商 ID 时
      if (!visible && this.currentBrainSettings && this.currentBrainSettings.selectedProvider) {
        this.selectBrainProvider(this.currentBrainSettings.selectedProvider);
      }
    },
    // 创建知识库
    async createKnowledgeBase() {
      try {
        // 上传文件
        let uploadedFiles = [];
        if (this.newKbFiles.length > 0) {
          if (!this.isElectron) {
            // 浏览器环境：通过 FormData 上传
            const formData = new FormData();
            for (const file of this.newKbFiles) {
              if (file.file instanceof Blob) {
                formData.append('files', file.file, file.name);
              } else {
                console.error("Invalid file object:", file);
                showNotification(this.t('invalid_file'), 'error');
                return;
              }
            }
  
            try {
              console.log('Uploading files...');
              const response = await fetch(`/load_file`, {
                method: 'POST',
                body: formData
              });
  
              if (!response.ok) {
                const errorText = await response.text();
                console.error('Server responded with an error:', errorText);
                showNotification(this.t('file_upload_failed'), 'error');
                return;
              }
  
              const data = await response.json();
              if (data.success) {
                uploadedFiles = data.fileLinks; // 获取上传后的文件链接
                // data.textFiles 添加到 this.textFiles
                this.textFiles = [...this.textFiles, ...data.textFiles];
                await this.autoSaveSettings();
              } else {
                showNotification(this.t('file_upload_failed'), 'error');
                return;
              }
            } catch (error) {
              console.error('Error during file upload:', error);
              showNotification(this.t('file_upload_failed'), 'error');
              return;
            }
          } else {
            // Electron 环境：通过 JSON 上传
            try {
              console.log('Uploading Electron files...');
              const response = await fetch(`/load_file`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  files: this.newKbFiles.map(file => ({
                    path: file.path,
                    name: file.name
                  }))
                })
              });
  
              if (!response.ok) {
                const errorText = await response.text();
                console.error('Server error:', errorText);
                showNotification(this.t('file_upload_failed'), 'error');
                return;
              }
  
              const data = await response.json();
              if (data.success) {
                uploadedFiles = data.fileLinks; // 获取上传后的文件链接
                // data.textFiles 添加到 this.textFiles
                this.textFiles = [...this.textFiles, ...data.textFiles];
                await this.autoSaveSettings();
              } else {
                showNotification(this.t('file_upload_failed'), 'error');
                return;
              }
            } catch (error) {
              console.error('上传错误:', error);
              showNotification(this.t('file_upload_failed'), 'error');
              return;
            }
          }
        }
  
        // 生成唯一的 ID
        const kbId = uuid.v4();
  
        // 构建新的知识库对象，使用上传后的文件链接
        const newKb = {
          id: kbId,
          name: this.newKb.name,
          introduction: this.newKb.introduction,
          providerId: this.newKb.providerId,
          model: this.newKb.model,
          base_url: this.newKb.base_url,
          api_key: this.newKb.api_key,
          enabled: true, // 默认启用
          chunk_size: this.newKb.chunk_size,
          chunk_overlap: this.newKb.chunk_overlap,
          chunk_k: this.newKb.chunk_k,
          weight: this.newKb.weight,
          files: uploadedFiles.map(file => ({ // 使用服务器返回的文件链接
            name: file.name,
            path: file.path,
          })),
          processingStatus: 'processing', // 设置处理状态为 processing
        };
  
        // 更新 settings 中的 knowledgeBases
        this.knowledgeBases = [...(this.knowledgeBases || []), newKb];
        //手动触发modelProviders更新，从而能够实时与后端同步
        this.modelProviders = this.modelProviders
        // 保存 settings
        await this.autoSaveSettings();
        // post kbId to 后端的create_kb端口
        try {
          // 1. 触发任务
          const startResponse = await fetch(`/create_kb`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ kbId }),
          });
          
          if (!startResponse.ok) throw new Error('启动失败');
          // 2. 轮询状态
          const checkStatus = async () => {
            try {
              const statusResponse = await fetch(`/kb_status/${kbId}`);
              
              // 处理 HTTP 错误状态
              if (!statusResponse.ok) {
                console.error('状态检查失败:', statusResponse.status);
                return 'failed'; // 返回明确的失败状态
              }
              const data = await statusResponse.json();
              return data.status || 'unknown'; // 防止 undefined
            } catch (error) {
              console.error('状态检查异常:', error);
              return 'failed';
            }
          };
          // 修改轮询逻辑
          const interval = setInterval(async () => {
            try {
              const status = await checkStatus() || ''; // 确保有默认值
              
              const targetKb = this.knowledgeBases.find(k => k.id === kbId);
              if (!targetKb) {
                clearInterval(interval);
                return;
              }
              // 安全的状态判断
              if (status === 'completed') {
                clearInterval(interval);
                targetKb.processingStatus = 'completed';
                showNotification(this.t('kb_created_successfully'), 'success');
                await this.autoSaveSettings();
              } else if (typeof status === 'string' && status.startsWith('failed')) { // 安全判断
                clearInterval(interval);
                this.knowledgeBases = this.knowledgeBases.filter(k => k.id !== kbId);
                showNotification(this.t('kb_creation_failed'), 'error');
                await this.autoSaveSettings();
              }
            } catch (error) {
              console.error('轮询异常:', error);
              clearInterval(interval);
            }
          }, 2000);
        } catch (error) {
          console.error('知识库创建失败:', error);
          showNotification(this.t('kb_creation_failed'), 'error');
        }      
        this.showAddKbDialog = false;
        this.newKb = { 
          name: '', 
          introduction: '',
          providerId: null, 
          model: '', 
          base_url: '', 
          api_key: '',
          chunk_size: 1024,
          chunk_overlap: 256,
          chunk_k: 5,
          weight: 0.5,
        };
        this.newKbFiles = [];
      } catch (error) {
        console.error('知识库创建失败:', error);
        showNotification(this.t('kb_creation_failed'), 'error');
      }
    },

    // 删除知识库
    async removeKnowledgeBase(kb) {
      try {
        // 从 settings 中过滤掉要删除的 knowledgeBase
        this.knowledgeBases = this.knowledgeBases.filter(
          item => item.id !== kb.id
        );
        let kbId = kb.id
        //手动触发modelProviders更新，从而能够实时与后端同步
        this.modelProviders = this.modelProviders
        const Response = await fetch(`/remove_kb`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kbId }),
        });

        if (!Response.ok) throw new Error('删除失败');

        // 保存 settings
        await this.autoSaveSettings();

        showNotification(this.t('kb_deleted_successfully'), 'success');
      } catch (error) {
        console.error('知识库删除失败:', error);
        showNotification(this.t('kb_deletion_failed'), 'error');
      }
    },

    // 切换知识库启用状态
    async toggleKbEnabled(kb) {
      try {
        // 更新 knowledgeBase 的 enabled 状态
        const kbToUpdateIndex = this.knowledgeBases.findIndex(
          item => item.id === kb.id
        );

        if (kbToUpdateIndex !== -1) {
          this.knowledgeBases[kbToUpdateIndex].enabled = kb.enabled;
          //手动触发modelProviders更新，从而能够实时与后端同步
          this.modelProviders = this.modelProviders
          // 保存 settings
          await this.autoSaveSettings();
          showNotification(this.t('kb')+` ${kb.name} ${kb.enabled ? this.t('enabled')  : this.t('disabled')}`, 'success');
        }
      } catch (error) {
        console.error('切换知识库状态失败:', error);
        showNotification(this.t('kb_status_change_failed'), 'error');
      }
    },
    // 选择供应商
    selectKbProvider(providerId) {
      if (providerId == 'paraphrase-multilingual-MiniLM-L12-v2'){
        this.newKb.model = providerId;
        this.newKb.base_url = `${backendURL}/minilm`
        this.newKb.api_key = 'MiniLM';
        return;
      }

      const provider = this.modelProviders.find(p => p.id === providerId);
      if (provider) {
        this.newKb.model = provider.modelId;
        this.newKb.base_url = provider.url;
        this.newKb.api_key = provider.apiKey;
      }
    },

    // 文件上传相关方法
    async browseKbFiles() {
        if (!this.isElectron) {
          const input = document.createElement('input')
          input.type = 'file'
          input.multiple = true
          input.accept = ALLOWED_EXTENSIONS.map(ext => `.${ext}`).join(',')
          
          input.onchange = (e) => {
            const files = Array.from(e.target.files)
            const validFiles = files.filter(this.isValidFileType)
            this.handleKbFiles(validFiles)
          }
          input.click()
        } else {
          const result = await window.electronAPI.openFileDialog();
          if (!result.canceled) {
            const validPaths = result.filePaths
              .filter(path => {
                const ext = path.split('.').pop()?.toLowerCase() || ''
                return ALLOWED_EXTENSIONS.includes(ext)
              })
            this.handleKbFiles(validPaths)
          }
        }
    },

    handleKbFiles(files) {
        if (files.length > 0) {
          this.addKbFiles(files)
        } else {
          this.showErrorAlert()
        }
    },
      // 添加文件到列表
    addKbFiles(files) {
      const newFiles = files.map(file => {
        if (typeof file === 'string') { // Electron路径
          return {
            path: file,
            name: file.split(/[\\/]/).pop()
          }
        }
        return { // 浏览器File对象
          path: URL.createObjectURL(file),// 生成临时URL
          name: file.name,
          file: file
        }
      });
      
      this.newKbFiles = [...this.newKbFiles, ...newFiles];
    },
    async handleKbDrop(event) {
      event.preventDefault();
      const files = Array.from(event.dataTransfer.files)
        .filter(this.isValidFileType);
      this.handleKbFiles(files);
    },
    removeKbFile(index) {
      this.newKbFiles.splice(index, 1);
    },
    switchToKnowledgePage() {
      this.activeMenu = 'toolkit';  // 根据你的菜单项配置的实际值设置
      this.subMenu = 'document';   // 根据你的子菜单项配置的实际值设置
    },
    switchToKnowledgeConfig(){
      this.activeMenu = 'toolkit';  // 根据你的菜单项配置的实际值设置
      this.subMenu = 'document';   // 根据你的子菜单项配置的实际值设置
      this.activeKbTab='settings';
      this.showAddKbDialog=false;
    },
    switchToMemoryConfig(){
      this.activeMenu = 'role';  // 根据你的菜单项配置的实际值设置
      this.subMenu = 'memory';   // 根据你的子菜单项配置的实际值设置
      this.activeMemoryTab='config';
      this.showAddMemoryDialog=false;
    },
    switchToMemory(){
      this.activeMenu = 'role';
      this.subMenu = 'memory'; 
    },
    // 在 methods 中添加
    t(key) {
      return this.translations[this.currentLanguage][key] || this.translations[this.currentLanguage]['en-US'] || key;
    },
    async handleSystemLanguageChange(val) {
      this.systemSettings.language = val;
      if (val === 'auto') {
        // 获取系统设置，默认是'en-US'，如果系统语言是中文，则设置为'zh-CN'
        const systemLanguage = navigator.language || navigator.userLanguage || 'en-US';
        val = systemLanguage.startsWith('zh') ? 'zh-CN' : 'en-US';
      }
      this.currentLanguage = val; // 更新当前语言
      await this.autoSaveSettings();
      this.$forceUpdate();
    },
    // renderer.js 增强方法
    async handleThemeChange(val) {
      // 更新根属性
      document.documentElement.setAttribute('data-theme', val);
      
      this.systemSettings.theme = val;

      await this.autoSaveSettings();
    },
    // 全局字体缩放：基准 14px，范围 0.85 ~ 1.5。
    // Electron 走 webFrame.setZoomFactor 抗锯齿更好；其余环境兜底用 CSS zoom。
    async handleFontScaleChange(val) {
      const safe = Math.max(0.85, Math.min(1.5, Number(val) || 1));
      if (this.isElectron && window.electronAPI?.setZoomFactor) {
        try {
          window.electronAPI.setZoomFactor(safe);
        } catch (e) {
          document.documentElement.style.zoom = safe;
        }
      } else {
        document.documentElement.style.zoom = safe;
      }
      document.documentElement.style.setProperty('--app-zoom', String(safe));
      this.systemSettings.fontScale = safe;
      await this.autoSaveSettings();
    },
    resetFontScale() {
      this.handleFontScaleChange(1);
    },
    // 代码字体独立缩放：基准 12px（来自 github-markdown.css 的 .markdown-body pre），范围 0.83 ~ 1.67。
    // 只写 --code-zoom，由 styles.css 中 pre.code-block 的 calc(--code-zoom / --app-zoom) 抵消全局缩放。
    async handleCodeFontScaleChange(val) {
      const safe = Math.max(0.83, Math.min(1.67, Number(val) || 1));
      document.documentElement.style.setProperty('--code-zoom', String(safe));
      this.systemSettings.codeFontScale = safe;
      await this.autoSaveSettings();
    },
    resetCodeFontScale() {
      this.handleCodeFontScaleChange(1);
    },
    async handleNetworkChange(val) {
      this.systemSettings.network = val;
      await window.electronAPI.setNetworkVisibility(val);
      this.showRestartDialog = true;
      await this.autoSaveSettings();
    },

    restartApp() {
      window.electronAPI.restartApp();
    },

    // 方法替换为：
    launchBrowserMode() {
      this.isBrowserOpening = true;
      
      setTimeout(() => {
        const url = this.partyURL;
        if (isElectron) {
          window.electronAPI.openExternal(url);
        } else {
          window.open(url, '_blank');
        }
        
        // 2秒后恢复状态
        setTimeout(() => {
          this.isBrowserOpening = false;
        }, 2000);
      }, 500);
    },
    launchAPIKeyManager() {
      this.isBrowserOpening = true;
      
      setTimeout(() => {
        const url = this.partyURL + '/token.html';
        if (isElectron) {
          window.electronAPI.openExternal(url);
        } else {
          window.open(url, '_blank');
        }
        
        // 2秒后恢复状态
        setTimeout(() => {
          this.isBrowserOpening = false;
        }, 2000);
      }, 500);
    },

    async getInternalIP() {
        try {
            const response = await fetch('/api/ip'); // 假设接口在同域名下
            const data = await response.json();
            return data.ip;
        } catch (error) {
            console.error("Failed to fetch internal IP:", error);
            return "127.0.0.1";
        }
    },
    async generateQRCode() {
      // 确保 partyURL 存在且 DOM 已渲染
      if (!this.partyURL) return;
      // 获取内网 IP
      const internalIP = await this.getInternalIP();

      // 替换 URL 中的 127.0.0.1 或 localhost，保留端口和路径
      const url = new URL(this.partyURL);
      if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') {
        url.hostname = internalIP;
      }
      let qr_url = url.toString();
      const canvas = document.getElementById('qrcode');

      // 生成二维码
      QRCode.toCanvas(canvas, qr_url, function(error) {
            if (error) {
                console.error(error);
            } else {
                console.log("QR Code successfully generated!");
            }
        });
    },


    /**
     * 辅助方法：根据当前表单/JSON输入构建配置对象
     * 返回 { mcpId, serversObj, inputStr }
     */
    buildCurrentMCPConfig() {
      let mcpId = "mcp";
      let servers = {};
      let inputStr = "";

      if (this.mcpInputType === 'json') {
        const input = this.newMCPJson.trim();
        const parsed = JSON.parse(input.startsWith('{') ? input : `{${input}}`);
        const parsedServers = parsed.mcpServers || parsed;
        mcpId = Object.keys(parsedServers)[0];
        servers = parsedServers[mcpId];
        inputStr = input;
      } else {
        mcpId = this.newMCPFormData.name;
        
        if (this.newMCPType === 'stdio') {
          servers = { "command": this.newMCPFormData.command };
          
          // args
          let args = this.newMCPFormData.args;
          if (args) {
             servers['args'] = args.split('\n').map(arg => arg.trim()).filter(arg => arg);
          }
          
          // env
          let env = this.newMCPFormData.env;
          if (env) {
            servers['env'] = env.split('\n').map(e => e.trim()).filter(e => e).reduce((acc, cur) => {
              const parts = cur.split('=');
              if (parts.length >= 2) {
                  const key = parts[0].trim();
                  const value = parts.slice(1).join('=').trim();
                  acc[key] = value;
              }
              return acc;
            }, {});
          }
        } else {
          servers = { "url": this.newMCPFormData.url };
          let ContentType = 'application/json';
          if (this.newMCPType == 'sse') ContentType = 'text/event-stream';
          else if (this.newMCPType == 'ws') ContentType = 'text/plain';
          
          if (this.newMCPFormData.apiKey && this.newMCPFormData.apiKey.trim() != '') {
            servers['headers'] = {
              "Authorization": `Bearer ${this.newMCPFormData.apiKey.trim()}`,
              "Content-Type": ContentType
            }
          }
        }

        // 构建 input 字符串用于存储
        let inputObj = { "mcpServers": {} };
        inputObj.mcpServers[mcpId] = servers;
        inputStr = JSON.stringify(inputObj, null, 2);
      }

      return { mcpId, servers, inputStr };
    },

    /**
     * 修改后的添加方法：直接调用 buildCurrentMCPConfig
     */
    async addMCPServer() {
      try {
        const { mcpId, servers, inputStr } = this.buildCurrentMCPConfig();

        // 更新本地状态
        this.mcpServers = {
          ...this.mcpServers,
          [mcpId]: {
            ...servers, // 新的配置
            processingStatus: 'initializing',
            disabled: true,
            type: this.newMCPType,
            input: inputStr,
            // 如果是编辑模式调用 addMCPServer (即重启)，保留原有的 tools 以防万一，或者清空看需求
            // 这里为了UI不闪烁，如果ID相同，暂时保留旧tools，等ready了再覆盖
            tools: (this.mcpServers[mcpId] && this.mcpServers[mcpId].tools) || []
          }
        };

        this.isSubmitting = true;
        this.currentEditingMCPId = mcpId;
        
        await this.autoSaveSettings();

        // 触发后台创建
        await fetch(`/create_mcp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mcpId })
        });

        // 轮询状态
        await this.pollMCPStatus(mcpId); // 复用之前写的 poll 方法

        // 成功后切换模式
        this.isEditMode = true;
        this.activeDialogTab = 'tools';
      } catch (error) {
        console.error('MCP Add Error:', error);
        showNotification(error.message, 'error');
        if (this.currentEditingMCPId && this.mcpServers[this.currentEditingMCPId]) {
             this.mcpServers[this.currentEditingMCPId].processingStatus = 'server_error';
        }
      } finally {
        this.isSubmitting = false;
        await this.autoSaveSettings();
      }
    },

    /**
     * 更新配置逻辑：智能判断是否需要重启
     */
    async updateMCPServerConfig() {
      const currentId = this.currentEditingMCPId;
      const oldServer = this.mcpServers[currentId];
      
      if (!oldServer) return;

      // 1. 获取新表单对应的配置
      // 注意：这里我们只构建对象，暂时不写入 this.mcpServers
      let newConfigData;
      try {
        newConfigData = this.buildCurrentMCPConfig();
      } catch (e) {
        showNotification(this.t('invalidConfig'), 'error');
        return;
      }
      
      const { servers: newServersObj } = newConfigData;

      // 2. 比较关键字段是否变更 (Command, Args, Env, Url, Headers)
      // 忽略 tools, processingStatus, disabled 等状态字段
      const isConfigurationChanged = !this.isSameMCPConfig(oldServer, newServersObj);

      if (isConfigurationChanged) {
        // A. 如果配置变了 -> 走完整的重启流程 (即 addMCPServer)
        console.log("Configuration changed, restarting MCP...");
        await this.addMCPServer();
      } else {
        // B. 如果配置没变 (只是动了 Switch 或点了保存) -> 直接关闭
        console.log("Configuration identical, skipping restart.");
        showNotification(this.t('settingsSaved'), 'success');
        this.showAddMCPDialog = false;
      }
    },

    /**
     * 深度比较两个 MCP 配置对象 (仅比较核心连接参数)
     */
    isSameMCPConfig(oldSrv, newSrv) {
      // 比较辅助函数
      const jsonEq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

      // 1. 比较基础类型
      // 注意：oldSrv 可能包含 extra 字段，newSrv 是纯净的配置对象
      // 我们只检查 newSrv 里有的字段
      
      // StdIO 检查
      if (newSrv.command !== oldSrv.command) return false;
      if (!jsonEq(newSrv.args, oldSrv.args)) return false;
      if (!jsonEq(newSrv.env, oldSrv.env)) return false;

      // HTTP/SSE/WS 检查
      if (newSrv.url !== oldSrv.url) return false;
      if (!jsonEq(newSrv.headers, oldSrv.headers)) return false;

      return true;
    },

    // 在methods中添加
    // 打开添加对话框的辅助函数
    openAddDialog() {
      this.showAddMCPDialog = true;
      this.activeDialogTab = 'config';
      this.isEditMode = false;
      this.isSubmitting = false;
      this.currentEditingMCPId = null;
      this.newMCPJson = '';
      this.newMCPFormData = { name: '', command: '', args: '', env: '', url: '', apiKey: '' };
      this.updateMCPExample();
    },

    // 重置弹窗状态
    resetDialogState() {
        this.newMCPJson = '';
        this.isSubmitting = false;
        // 注意：不要在这里设 showAddMCPDialog = false，因为这是 closed 事件
    },

    // 抽离轮询逻辑
    async pollMCPStatus(mcpId) {
       return new Promise((resolve, reject) => {
          let checkCount = 0;
          const maxChecks = 30; // 例如 60秒超时

          const interval = setInterval(async () => {
            checkCount++;
            try {
              const statusRes = await fetch(`/mcp_status/${mcpId}`);
              const data = await statusRes.json();
              const { status, tools } = data;

              if (status === 'ready') {
                clearInterval(interval);
                this.mcpServers[mcpId] = {
                  ...this.mcpServers[mcpId],
                  processingStatus: 'ready',
                  disabled: false,
                  tools: JSON.parse(tools)    
                };
                showNotification(this.t('mcpAdded'), 'success');
                resolve(true); // 成功
              } else if (status.startsWith('failed') || status === 'server_error') {
                clearInterval(interval);
                this.mcpServers[mcpId].processingStatus = 'server_error';
                showNotification(this.t('mcpCreationFailed'), 'error');
                resolve(false); // 虽然失败，但也算结束了轮询
              } else if (checkCount >= maxChecks) {
                clearInterval(interval);
                this.mcpServers[mcpId].processingStatus = 'server_error';
                reject(new Error("Timeout waiting for MCP server"));
              }
            } catch(e) {
               // 网络错误等
               clearInterval(interval);
               reject(e);
            }
          }, 2000);
       });
    },

    // 编辑已有服务器
    editMCPServer(name) {
      this.isEditMode = true;
      this.activeDialogTab = 'config';
      this.currentEditingMCPId = name;
      this.isSubmitting = false;

      const server = this.mcpServers[name];
      this.newMCPType = server.type || 'stdio'; // 默认回退
      this.newMCPJson = server.input;
      
      // 根据类型判断 inputType (如果有 input 且是 json 格式比较多，可能是 json，否则 form)
      // 简单起见，如果 editMCPServer 被调用，我们尝试填充 Form 数据
      this.mcpInputType = 'form'; // 或者根据是否有 input 字符串决定

      this.newMCPFormData = {
        name: name,
        command: server.command || '',
        args: server.args ? server.args.join('\n') : '',
        env: server.env ? Object.entries(server.env).map(([k, v]) => `${k}=${v}`).join('\n') : '',
        url: server.url || '',
        apiKey: server.headers?.Authorization?.split(' ')[1] || '',
      };
      
      this.showAddMCPDialog = true;
    },

    async restartMCPServer(name) {
       // 保持原有逻辑，或者也可以打开弹窗显示 loading
       // 这里简单复用原有逻辑，但加上 try catch
       this.mcpServers[name].processingStatus = 'initializing';
       // ... existing restart logic
       // 如果你想重启时也看弹窗状态，可以调用 editMCPServer(name) 然后 auto trigger logic
       // 但通常重启是卡片上的快捷操作，保持原样即可。
       // 只需要加上轮询更新:
       try {
         await fetch(`/create_mcp`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ mcpId: name })
            });
         this.pollMCPStatus(name); // 不 await，让它后台跑
       } catch(e) {
         console.error(e);
       }
    },
    async removeMCPServer(name) {
      this.deletingMCPName = name
      this.showMCPConfirm = true
    },
    // 新增确认方法
    async confirmDeleteMCP() {
      try {
        const response = await fetch(`/remove_mcp`, {
          method: 'DELETE',
          headers: {
              'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            serverName: this.deletingMCPName
          })
        });
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.detail || '删除失败');
        }
        
        showNotification(this.t('mcpDeleted'), 'success')
      } catch (error) {
        console.error('Error:', error.message)
        showNotification(this.t('mcpDeleteFailed'), 'error')
      } finally {
        const name = this.deletingMCPName
        const newServers = { ...this.mcpServers }
        delete newServers[name]
        this.mcpServers = newServers
        
        this.$nextTick(async () => {
          await this.autoSaveSettings();
        })
        this.showMCPConfirm = false
      }
    },

    /**
     * 监听输入方式切换 (Form <-> JSON)
     */
    handleInputMethodChange(val) {
      if (val === 'json') {
        // 刚才在 Form 模式，切去 JSON -> 把表单转为 JSON
        this.syncFormToJson();
      } else {
        // 刚才在 JSON 模式，切去 Form -> 把 JSON 解析进表单
        this.syncJsonToForm();
      }
    },

    /**
     * 将表单数据同步到 JSON 字符串
     */
    syncFormToJson() {
      // 如果表单名字都没填，可能还没开始编辑，就不覆盖 JSON 了
      if (!this.newMCPFormData.name) return;

      try {
        // 复用之前写过的构建配置对象的逻辑 (如果之前封装了 buildCurrentMCPConfig 可以复用，这里为了独立性单独写)
        const mcpId = this.newMCPFormData.name;
        let servers = {};
        
        if (this.newMCPType === 'stdio') {
          servers = { "command": this.newMCPFormData.command };
          if (this.newMCPFormData.args) {
             servers['args'] = this.newMCPFormData.args.split('\n').map(arg => arg.trim()).filter(arg => arg);
          }
          if (this.newMCPFormData.env) {
            servers['env'] = this.newMCPFormData.env.split('\n').map(e => e.trim()).filter(e => e).reduce((acc, cur) => {
              const parts = cur.split('=');
              if (parts.length >= 2) acc[parts[0].trim()] = parts.slice(1).join('=').trim();
              return acc;
            }, {});
          }
        } else {
          servers = { "url": this.newMCPFormData.url };
          // 构建 Headers
          if (this.newMCPFormData.apiKey) {
            servers['headers'] = { "Authorization": `Bearer ${this.newMCPFormData.apiKey.trim()}` };
          }
        }

        const fullConfig = { mcpServers: { [mcpId]: servers } };
        this.newMCPJson = JSON.stringify(fullConfig, null, 2);
      } catch (e) {
        console.error("Sync Form to JSON failed:", e);
      }
    },

    /**
     * 将 JSON 字符串同步到表单数据
     */
    syncJsonToForm() {
      if (!this.newMCPJson || !this.newMCPJson.trim()) return;

      try {
        const input = this.newMCPJson.trim();
        // 容错处理：支持纯对象内容或完整 mcpServers 结构
        const parsed = JSON.parse(input.startsWith('{') ? input : `{${input}}`);
        const serversMap = parsed.mcpServers || parsed;
        const names = Object.keys(serversMap);
        
        if (names.length === 0) return;

        const name = names[0]; // 取第一个服务器
        const config = serversMap[name];

        // 1. 填充名字
        this.newMCPFormData.name = name;

        // 2. 判断类型并填充字段
        if (config.command) {
          // 是 Stdio 类型
          this.newMCPType = 'stdio';
          this.newMCPFormData.command = config.command;
          this.newMCPFormData.args = Array.isArray(config.args) ? config.args.join('\n') : '';
          this.newMCPFormData.env = config.env ? Object.entries(config.env).map(([k, v]) => `${k}=${v}`).join('\n') : '';
        } else if (config.url) {
          // 是 HTTP/SSE/WS 类型
          // 如果当前 newMCPType 还是 stdio，就切成 sse，否则保留用户选择的 (ws/streamablehttp)
          if (this.newMCPType === 'stdio') {
             this.newMCPType = 'sse'; 
          }
          this.newMCPFormData.url = config.url;
          
          // 尝试提取 API Key
          if (config.headers && config.headers.Authorization) {
            this.newMCPFormData.apiKey = config.headers.Authorization.replace('Bearer ', '');
          } else {
            this.newMCPFormData.apiKey = '';
          }
        }
      } catch (e) {
        console.warn("JSON parse failed during sync:", e);
        // JSON 格式可能有误，暂不强制覆盖表单，以免用户数据丢失
      }
    },

      // 保存智能体
    truncatePrompt(text) {
      return text.length > 100 ? text.substring(0, 100) + '...' : text;
    },
    async saveAgent() {
      const payload = {
        type: 'save_agent',
        data: {
          name: this.newAgent.name,
          system_prompt: this.newAgent.system_prompt
        }
      };
      this.ws.send(JSON.stringify(payload));
      this.showAgentForm = false;
      this.newAgent = {
        id: '',
        name: '',
        system_prompt: ''
      };
    },
    copyAgentId(id) {
      navigator.clipboard.writeText(id)
      showNotification(`Agent ID: ${id} copyed`, 'success');
    },
    copyAgentName(name) {
      navigator.clipboard.writeText(name)
      showNotification(`Agent Name: ${name} copyed`, 'success');
    },
    async removeAgent(id) {
      if (this.agents.hasOwnProperty(id)) {
        delete this.agents[id]
        this.agents = { ...this.agents }
        try {
          // 向/delete_file发送请求
          const response = await fetch(`/remove_agent`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ agentId: id })
          });
          // 处理响应
          if (response.ok) {
            console.log('Agent deleted successfully');
            showNotification(this.t('AgentDeleted'), 'success');
          }
        } catch (error) {
          console.error('Error:', error);
          showNotification(this.t('AgentDeleteFailed'), 'error');
        }
      }
      await this.autoSaveSettings();
    },
    isValidUrl(url) {
      try {
        new URL(url);
        return true;
      } catch {
        return false;
      }
    },
    async addA2AServer() {
      try {
        this.showAddA2ADialog = false;
        const newurl = this.newA2AUrl;
        this.newA2AUrl = '';
        this.a2aServers = {
          ...this.a2aServers,
          [newurl]: {
            status: 'initializing',
          }
        };
        await this.autoSaveSettings();
        const response = await fetch(`/a2a`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: newurl })
        });
        
        const data = await response.json();
        this.a2aServers[newurl] = {
          ...this.a2aServers[newurl],
          ...data
        }

        await this.autoSaveSettings();
      } catch (error) {
        console.error('A2A初始化失败:', error);
        this.a2aServers = Object.fromEntries(Object.entries(this.a2aServers).filter(([k]) => k !== newurl));
        await this.autoSaveSettings();
        showNotification(this.t('a2aInitFailed'), 'error');
      }
    },
    async removeA2AServer(url) {
      this.a2aServers = Object.fromEntries(Object.entries(this.a2aServers).filter(([k]) => k !== url));
      await this.autoSaveSettings();
    },
    formatDate(date) {
      // 时间戳转日期
      return new Date(date).toLocaleString();
    },
    async deleteFile(file) {
      console.log('deleteFile:', file);
      this.textFiles = this.textFiles.filter(f => f !== file);
      await this.autoSaveSettings();
      fileName = file.unique_filename
      try {
        // 向/delete_file发送请求
        const response = await fetch(`/delete_file`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName: fileName })
        });
        // 处理响应
        if (response.ok) {
          console.log('File deleted successfully');
          showNotification(this.t('fileDeleted'), 'success');
        }
      } catch (error) {
        console.error('Error:', error);
        showNotification(this.t('fileDeleteFailed'), 'error');
      }
    },
    // 顶部“全选 / 取消全选”
    toggleAll(checked) {
      this.selectedFiles = checked
        ? this.textFiles.map(f => f.unique_filename)
        : [];
    },
    async batchDeleteFiles() {
      if (this.selectedFiles.length === 0) return;

      try {
        const res = await fetch('/delete_files', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileNames: this.selectedFiles })
        });
        const data = await res.json();

        // 只要后端说“有成功”就提示成功
        if (data.success && data.successFiles?.length) {
          // 把后端返回已成功删除的文件干掉
          this.textFiles = this.textFiles.filter(
            f => !data.successFiles.includes(f.unique_filename)
          );
          this.selectedFiles = [];          // 清空选中
          showNotification(this.t('batchDeleteSuccess'), 'success');
          await this.autoSaveSettings();
        } else {
          console.log('batchDeleteFiles error:', data);
          showNotification(this.t('batchDeleteFailed'), 'error');
        }
      } catch (e) {
        console.log('batchDeleteFiles error:', data);
        showNotification(this.t('batchDeleteFailed'), 'error');
      }
    },

    // 图片全选切换
    toggleAllImages(checked) {
      this.selectedImages = checked
        ? this.imageFiles.map(i => i.unique_filename)
        : []
    },
    
    // 视频全选切换
    toggleAllVideos(checked) {
      this.selectedVideos = checked
        ? this.videoFiles.map(v => v.unique_filename)
        : []
    },
    
    // 图片批量删除
    async batchDeleteImages() {
      if(!this.selectedImages.length) return
      
      try {
        const res = await fetch('/delete_files', {
          method: 'DELETE',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({fileNames: this.selectedImages})
        })
        
        if(res.ok) {
          // 更新前端列表
          this.imageFiles = this.imageFiles.filter(
            img => !this.selectedImages.includes(img.unique_filename)
          )
          this.selectedImages = []
          showNotification(this.t('batchDeleteSuccess'), 'success')
          await this.autoSaveSettings();
        }
      } catch(e) {
        showNotification(this.t('batchDeleteFailed'), 'error')
      }
    },
    
    // 视频批量删除（复用同一API）
    async batchDeleteVideos() {
      if(!this.selectedVideos.length) return
      try {
        const res = await fetch('/delete_files', {
          method: 'DELETE',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({fileNames: this.selectedVideos})
        })
        
        if(res.ok) {
          // 更新前端列表
          this.videoFiles = this.videoFiles.filter(
            img => !this.selectedVideos.includes(img.unique_filename)
          )
          this.selectedVideos = []
          showNotification(this.t('batchDeleteSuccess'), 'success')
          await this.autoSaveSettings();
        }
      } catch(e) {
        showNotification(this.t('batchDeleteFailed'), 'error')
      }
    },
    async deleteImage(img) {
      this.imageFiles = this.imageFiles.filter(i => i !== img);
      await this.autoSaveSettings();
      fileName = img.unique_filename
      try {
        // 向/delete_file发送请求
        const response = await fetch(`/delete_file`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName: fileName })
        });
        // 处理响应
        if (response.ok) {
          console.log('File deleted successfully');
          showNotification(this.t('fileDeleted'), 'success');
        }
      } catch (error) {
        console.error('Error:', error);
        showNotification(this.t('fileDeleteFailed'), 'error');
      }
    },
    getVendorLogo(vendor) {
      return null;
    },
    getMCPVendorLogo(vendor) {
      return null;
    },
    getPromptVendorLogo(vendor) {
      return null;
    },
    getCardVendorLogo(vendor) {
      return null;
    },
    formatVendorName(name) {
      if (!name) return '';
      const first = name.charAt(0);
      if (first >= 'a' && first <= 'z') return first.toUpperCase() + name.slice(1);
      return name;
    },
    getVendorInitials(vendor) {
      if (!vendor) return '?';
      const words = vendor.split(/[\s\-_\.]+/).filter(w => w.length > 0);
      if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
      return vendor.substring(0, 2).toUpperCase();
    },
    getVendorAvatarColor(vendor) {
      const palette = [
        '#007AFF', '#FF9500', '#34C759', '#FF3B30',
        '#AF52DE', '#5856D6', '#FF2D55', '#00C7BE',
        '#8E8E93', '#FFD60A', '#32D74B', '#0A84FF'
      ];
      let hash = 0;
      const str = vendor || '';
      for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
      return palette[Math.abs(hash) % palette.length];
    },
    handleSelectVendor(vendor) {
      this.newProviderTemp.vendor = vendor;
      this.handleVendorChange(vendor);
    },

    selectMemoryProvider(providerId) {
      if (providerId == 'paraphrase-multilingual-MiniLM-L12-v2'){
        this.newMemory.model = providerId;
        this.newMemory.base_url = `${backendURL}/minilm`
        this.newMemory.api_key = 'MiniLM';
        return;
      }

      const provider = this.modelProviders.find(p => p.id === providerId);
      if (provider) {
        this.newMemory.model = provider.modelId;
        this.newMemory.base_url = provider.url;
        this.newMemory.api_key = provider.apiKey;
      }
    },

    // 世界书条目清空
    clearBook(idx) {
      this.newMemory.characterBook[idx].keysRaw = '';
      this.newMemory.characterBook[idx].content = '';
    },
    /* 世界书 */
    addBook() {
      this.newMemory.characterBook.push({ keysRaw: '', content: '' });
    },
    removeBook(idx) {
      this.newMemory.characterBook.splice(idx, 1);
    },
    clearGreeting(idx) {
      this.newMemory.alternateGreetings[idx] = '';
    },
    clearFirstMes() {
      this.newMemory.firstMes = '';
    },
    /* 删除 alternate greeting */
    removeGreeting(idx) {
      this.newMemory.alternateGreetings.splice(idx, 1);
    },
    /* 新增 alternate greeting */
    addGreeting() {
      this.newMemory.alternateGreetings.push('');
    },
    async addMemory() {
      this.selectMemoryProvider(this.newMemory.providerId);

      /* ---- 0. 备份旧数据（更新场景用） ---- */
      const oldMemory = this.newMemory.id
        ? this.memories.find(m => m.id === this.newMemory.id)
        : 1024;

      /* ---- 1. 立即生成内存对象（用户可瞬间看到） ---- */
      const build = (dims = 1024) => ({
        id: this.newMemory.id || uuid.v4(),
        name: this.newMemory.name,
        infer: this.newMemory.infer,
        providerId: this.newMemory.providerId,
        model: this.newMemory.model,
        api_key: this.newMemory.api_key,
        base_url: this.newMemory.base_url,
        embedding_dims: dims,
        vendor: this.newMemory.providerId
          ? this.modelProviders.find(p => p.id === this.newMemory.providerId)?.vendor || ''
          : '',
        description: this.newMemory.description,
        avatar: this.newMemory.avatar,
        personality: this.newMemory.personality,
        mesExample: this.newMemory.mesExample,
        systemPrompt: this.newMemory.systemPrompt,
        firstMes: this.newMemory.firstMes,
        alternateGreetings: this.newMemory.alternateGreetings.filter(Boolean),
        characterBook: this.newMemory.characterBook.filter(e => e.keysRaw.trim() || e.content.trim())
      });

      let memory;
      let insertIdx = -1;          // 用于更新场景
      if (this.newMemory.id === null) {
        memory = build();
        this.memories.push(memory);
        if (this.memorySettings.selectedMemory === null) {
          this.memorySettings.selectedMemory = memory.id;
        }
      } else {
        insertIdx = this.memories.findIndex(m => m.id === this.newMemory.id);
        if (insertIdx === -1) return;
        memory = build(oldMemory?.embedding_dims ?? 1024);
        this.memories.splice(insertIdx, 1, memory);
      }
      this.showAddMemoryDialog = false;
      if (this.newMemory.providerId != null){
        /* ---- 2. 异步探测维度（失败则回滚） ---- */
        try {
          const resp = await fetch('/api/embedding_dims', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              api_key:  this.newMemory.api_key,
              base_url: this.newMemory.base_url,
              model:    this.newMemory.model
            })
          });

          // ******** 关键点 ********
          if (!resp.ok) {                           // 4xx/5xx 都进这里
            const txt = await resp.text();
            throw new Error(`Embedding 接口异常 ${resp.status}: ${txt}`);
          }

          const { dims } = await resp.json();
          memory.embedding_dims = dims;
          await this.autoSaveSettings();          // 真正落盘
        } catch (e) {
          /* ---- 3. 回滚 & 提示 ---- */
          if (this.newMemory.id === null) {
            // 新增：直接 pop
            this.memories.pop();
            if (this.memorySettings.selectedMemory === memory.id) {
              this.memorySettings.selectedMemory = null;
            }
          } else {
            // 更新：把旧记忆写回去
            if (oldMemory) this.memories.splice(insertIdx, 1, oldMemory);
          }
          // 保证能拿到 t 函数
          showNotification(this.t('EmbeddingFailed'), 'error');
          console.error('[addMemory] 探测维度失败', e);
          return;   // 不再继续
        }
      }

      /* ---- 4. 收尾 ---- */
      this.resetNewMemory();
      this.changeMemory();
    },
    
    async removeMemory(id) {
      this.memories = this.memories.filter(m => m.id !== id);
      if (this.memorySettings.selectedMemory === id){
        this.memorySettings.selectedMemory = null;
      }
      try {
        // 向/delete_file发送请求
        const response = await fetch(`/remove_memory`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ memoryId: id })
        });
        // 处理响应
        if (response.ok) {
          console.log('memory deleted successfully');
          showNotification(this.t('memoryDeleted'), 'success');
        }
      } catch (error) {
        console.error('Error:', error);
        showNotification(this.t('memoryDeleteFailed'), 'error');
      }
      await this.autoSaveSettings();
    },
    editMemory(id) {
      const memory = this.memories.find(m => m.id === id);
      if (memory) {
        this.newMemory = { ...memory };
        if (this.newMemory.characterBook.length === 0){
          this.newMemory.characterBook = [{ keysRaw: '', content: '' }];
        }
        this.showAddMemoryDialog = true;
      }
    },

    
    getVendorName(providerId) {
      if (providerId == 'paraphrase-multilingual-MiniLM-L12-v2'){
        return `${this.t("model")}:${providerId}`;
      }
      const provider = this.modelProviders.find(p => p.id === providerId);
      return provider ? `${this.t("model")}:${provider.modelId}` : this.t("NoLongTermMemory");
    },
    async saveCustomHttpTool() {
      const toolData = { ...this.newCustomHttpTool };
      
      if (this.editingCustomHttpTool) {
        // 更新现有工具
        const index = this.customHttpTools.findIndex(tool => tool.id === toolData.id);
        if (index !== -1) {
          this.customHttpTools.splice(index, 1, toolData);
        }
      } else {
        // 添加新工具
        toolData.id = uuid.v4();
        this.customHttpTools.push(toolData);
      }
      
      // 与后端同步数据
      await this.autoSaveSettings();
      
      // 重置表单
      this.newCustomHttpTool = {
        enabled: true,
        name: '',
        description: '',
        url: '',
        method: 'GET',
        headers: '',
        body: ''
      };
      this.showCustomHttpToolForm = false;
      this.editingCustomHttpTool = false;
    },
    editCustomHttpTool(id) {
      const tool = this.customHttpTools.find(tool => tool.id === id);
      if (tool) {
        this.newCustomHttpTool = { ...tool };
        this.showCustomHttpToolForm = true;
        this.editingCustomHttpTool = true;
      }
    },
    async removeCustomHttpTool(id) {
      this.customHttpTools = this.customHttpTools.filter(tool => tool.id !== id);
      await this.autoSaveSettings();
    },
  // 启动QQ机器人
  async startQQBot() {
    this.isStarting = true;
    
    try {
      // 显示连接中的提示
      showNotification('正在连接QQ机器人...', 'info');
      
      const response = await fetch(`/start_qq_bot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.qqBotConfig)
      });

      const result = await response.json();
      
      if (result.success) {
        this.isQQBotRunning = true;
        showNotification('QQ机器人已成功启动并就绪', 'success');
      } else {
        // 显示具体错误信息
        const errorMessage = result.message || '启动失败，请检查配置';
        showNotification(`启动失败: ${errorMessage}`, 'error');
        
        // 如果是超时错误，给出更具体的提示
        if (errorMessage.includes('超时')) {
          showNotification('提示：请检查网络连接和机器人配置是否正确', 'warning');
        }
      }
    } catch (error) {
      console.error('启动QQ机器人时出错:', error);
      showNotification('启动QQ机器人失败: 网络错误或服务器未响应', 'error');
    } finally {
      this.isStarting = false;
    }
  },

  // 停止QQ机器人
  async stopQQBot() {
    this.isStopping = true;
    
    try {
      const response = await fetch(`/stop_qq_bot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      const result = await response.json();
      
      if (result.success) {
        this.isQQBotRunning = false;
        showNotification('QQ机器人已成功停止', 'success');
      } else {
        const errorMessage = result.message || '停止失败';
        showNotification(`停止失败: ${errorMessage}`, 'error');
      }
    } catch (error) {
      console.error('停止QQ机器人时出错:', error);
      showNotification('停止QQ机器人失败: 网络错误或服务器未响应', 'error');
    } finally {
      this.isStopping = false;
    }
  },

  // 重载QQ机器人配置
  async reloadQQBotConfig() {
    this.isReloading = true;
    
    try {
      const response = await fetch(`/reload_qq_bot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.qqBotConfig)
      });

      const result = await response.json();
      
      if (result.success) {
        if (result.config_changed) {
          showNotification('QQ机器人配置已重载并重新启动', 'success');
        } else {
          showNotification('QQ机器人配置已更新', 'success');
        }
      } else {
        const errorMessage = result.message || '重载失败';
        showNotification(`重载失败: ${errorMessage}`, 'error');
      }
    } catch (error) {
      console.error('重载QQ机器人配置时出错:', error);
      showNotification('重载QQ机器人配置失败: 网络错误或服务器未响应', 'error');
    } finally {
      this.isReloading = false;
    }
  },
  
  // 添加状态检查方法
  async checkQQBotStatus() {
    try {
      const response = await fetch(`/qq_bot_status`);
      const status = await response.json();
      
      // 更新机器人运行状态
      this.isQQBotRunning = status.is_running;
      
      // 如果机器人正在运行但前端状态不一致，更新状态
      if (status.is_running && !this.isQQBotRunning) {
        this.isQQBotRunning = true;
      }
    } catch (error) {
      console.error('检查机器人状态失败:', error);
    }
  },

    // 新增的方法：供主进程请求关闭机器人
    async requestStopQQBotIfRunning() {
      try {
        const response = await fetch(`/qq_bot_status`)
        const status = await response.json()

        if (status.is_running) {
          // 调用 stopQQBot 来关闭机器人
          await this.stopQQBot()
          console.log('机器人已关闭')
        }
      } catch (error) {
        console.error('检查或停止机器人失败:', error)
      }
    },

 async requestFeishuBotStopIfRunning(){
      try {
        const response = await fetch(`/feishu_bot_status`)
        const status = await response.json()

        if (status.is_running) {
          // 调用 stopQQBot 来关闭机器人
          await this.stopFeishuBot()
          console.log('机器人已关闭')
        }
      } catch (error) {
        console.error('检查或停止机器人失败:', error)
      }
 },

async startFeishuBot() {
  this.isFeishuStarting = true;
  try {
    showNotification('正在连接飞书机器人...', 'info');
    const res = await fetch('/start_feishu_bot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(this.feishuBotConfig),
    });
    const json = await res.json();
    if (json.success) {
      this.isFeishuBotRunning = true;
      showNotification('飞书机器人启动成功', 'success');
    } else {
      showNotification(`启动失败：${json.message}`, 'error');
    }
  } catch (e) {
    showNotification('网络错误或服务器未响应', 'error');
  } finally {
    this.isFeishuStarting = false;
  }
},
async stopFeishuBot() {
  this.isFeishuStopping = true;
  try {
    const res = await fetch('/stop_feishu_bot', { method: 'POST' });
    const json = await res.json();
    if (json.success) {
      this.isFeishuBotRunning = false;
      showNotification('飞书机器人已停止', 'success');
    } else {
      showNotification(`停止失败：${json.message}`, 'error');
    }
  } catch (e) {
    showNotification('网络错误或服务器未响应', 'error');
  } finally {
    this.isFeishuStopping = false;
  }
},
async reloadfeishuBotConfig() {
  this.isFeishuReloading = true;
  try {
    const res = await fetch('/reload_feishu_bot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(this.feishuBotConfig),
    });
    const json = await res.json();
    if (json.success) {
      showNotification('飞书机器人已重载', 'success');
    } else {
      showNotification(`重载失败：${json.message}`, 'error');
    }
  } catch (e) {
    showNotification('网络错误或服务器未响应', 'error');
  } finally {
    this.isFeishuReloading = false;
  }
},
async checkFeishuBotStatus() {
  try {
    const res = await fetch('/feishu_bot_status');
    const st = await res.json();
    this.isFeishuBotRunning = st.is_running;
  } catch (e) {
    console.error('检查飞书机器人状态失败', e);
  }
},
handleCreateFeishuSeparator(val) {
  this.feishuBotConfig.separators.push(val);
},

async requestWechatBotStopIfRunning() {
  try {
    const res = await fetch(`/wechat_bot_status`)
    const status = await res.json()
    if (status.is_running) {
      await this.stopWechatBot()
    }
  } catch (error) { console.error('检查或停止微信机器人失败:', error) }
},
async startWechatBot() {
  this.isWechatStarting = true;
  this.showWechatQR = false; // 隐藏旧的弹窗
  this.wechatQRCodeBase64 = null; // 清空旧的二维码
  try {
    showNotification('正在启动微信机器人服务...', 'info');
    const res = await fetch('/start_wechat_bot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(this.wechatBotConfig),
    });
    const json = await res.json();
    if (json.success) {
      this.isWechatBotRunning = true;
      // 启动成功后，开启 1.5 秒一次的高频轮询，去抓后台的 Base64 图片
      if (this.wechatStatusTimer) clearInterval(this.wechatStatusTimer);
      this.wechatStatusTimer = setInterval(() => {
        this.checkWechatBotStatus();
      }, 1500);
      
    } else {
      showNotification(`启动失败：${json.message}`, 'error');
    }
  } catch (e) {
    showNotification('网络错误', 'error');
  } finally {
    this.isWechatStarting = false;
  }
},

async stopWechatBot() {
  this.isWechatStopping = true;
  if (this.wechatStatusTimer) clearInterval(this.wechatStatusTimer);
  try {
    const res = await fetch('/stop_wechat_bot', { method: 'POST' });
    const json = await res.json();
    if (json.success) {
      this.isWechatBotRunning = false;
      showNotification('微信机器人已停止', 'success');
    } else {
      showNotification(`停止失败：${json.message}`, 'error');
    }
  } catch (e) {
    showNotification('网络错误或服务器未响应', 'error');
  } finally {
    this.isWechatStopping = false;
  }
},
async reloadWechatBotConfig() {
  this.isWechatReloading = true;
  try {
    const res = await fetch('/reload_wechat_bot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(this.wechatBotConfig),
    });
    const json = await res.json();
    if (json.success) {
      showNotification('微信机器人已重载', 'success');
    } else {
      showNotification(`重载失败：${json.message}`, 'error');
    }
  } catch (e) {
    showNotification('网络错误或服务器未响应', 'error');
  } finally {
    this.isWechatReloading = false;
  }
},
async checkWechatBotStatus() {
  try {
    const res = await fetch('/wechat_bot_status');
    const st = await res.json();
    this.isWechatBotRunning = st.is_running;
    
    // 弹出二维码：如果后端有二维码，并且和当前界面的不一样
    if (st.qr_base64 && this.wechatQRCodeBase64 !== st.qr_base64) {
      this.wechatQRCodeBase64 = st.qr_base64;
      this.showWechatQR = true; 
    }

    // --- 核心修复：触发自动秒关弹窗的逻辑 ---
    // 条件1: 后端识别到登录成功的特征 (st.is_logged_in)
    // 条件2: 原本正在显示二维码，但下一秒发现后端的 qr_base64 变成了 null (被系统清除了)
    if (st.is_logged_in || (this.showWechatQR && !st.qr_base64 && this.wechatQRCodeBase64)) {
        this.showWechatQR = false;         // 瞬间关闭弹窗
        this.wechatQRCodeBase64 = null;    // 清空本地图片缓存
        showNotification('✅ 微信已成功登录，机器人开始工作！', 'success');
        
        // 扫码成功后，取消极速轮询定时器，减轻服务器压力
        if (this.wechatStatusTimer) {
            clearInterval(this.wechatStatusTimer);
            this.wechatStatusTimer = null;
        }
    }

    // 意外停止时的清理逻辑
    if (!st.is_running && this.wechatStatusTimer) {
       clearInterval(this.wechatStatusTimer);
       this.wechatStatusTimer = null;
    }
  } catch (e) {
    console.error('检查微信状态失败', e);
  }
},
handleCreateWechatSeparator(val) {
  this.wechatBotConfig.separators.push(val);
},

async forceReLoginWechatBot() {
  // 1. 如果当前正在运行，先停止它，释放被占用的凭证文件
  if (this.isWechatBotRunning) {
    showNotification('正在关闭当前实例并物理粉碎凭证缓存...', 'info');
    await this.stopWechatBot();
    
    // 关键：强制等待 2.5 秒，给操作系统足够的时间释放文件句柄和销毁底层线程
    await new Promise(resolve => setTimeout(resolve, 2500));
  }
  
  this.isWechatStarting = true;
  this.showWechatQR = false; 
  this.wechatQRCodeBase64 = null; 
  
  try {
    showNotification('强制获取全新二维码中，请稍候...', 'info');
    // 在 payload 中追加强制标识，后端检测到就会先执行物理删除
    const payload = { ...this.wechatBotConfig, force_relogin: true };
    
    const res = await fetch('/start_wechat_bot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    
    if (json.success) {
      this.isWechatBotRunning = true;
      if (this.wechatStatusTimer) clearInterval(this.wechatStatusTimer);
      
      // 开启极速轮询，一旦后端生成了新二维码就会自动弹窗
      this.wechatStatusTimer = setInterval(() => {
        this.checkWechatBotStatus();
      }, 1500);
    } else {
      showNotification(`拉取新二维码失败：${json.message}`, 'error');
    }
  } catch (e) {
    showNotification('网络错误或服务器未响应', 'error');
  } finally {
    this.isWechatStarting = false;
  }
},
  // --- 企微方法 ---

  async requestWeComBotStopIfRunning() {
    try {
      const response = await fetch(`/wecom_bot_status`);
      const status = await response.json();

      if (status.is_running) {
        // 调用 stopWeComBot 来关闭机器人
        await this.stopWeComBot();
        console.log('机器人已关闭');
      }
    } catch (error) {
      console.error('检查或停止机器人失败:', error)
    }
  },
  async startWeComBot() {
    this.isWeComStarting = true;
    try {
      showNotification('正在连接企微机器人...', 'info');
      const res = await fetch('/start_wecom_bot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.weComBotConfig),
      });
      const json = await res.json();
      if (json.success) {
        this.isWeComBotRunning = true;
        showNotification('企微机器人启动成功', 'success');
      } else {
        showNotification(`启动失败：${json.message}`, 'error');
      }
    } catch (e) {
      showNotification('网络错误或服务器未响应', 'error');
    } finally {
      this.isWeComStarting = false;
    }
  },
  async stopWeComBot() {
    this.isWeComStopping = true;
    try {
      const res = await fetch('/stop_wecom_bot', { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        this.isWeComBotRunning = false;
        showNotification('企微机器人已停止', 'success');
      } else {
        showNotification(`停止失败：${json.message}`, 'error');
      }
    } catch (e) {
      showNotification('网络错误', 'error');
    } finally {
      this.isWeComStopping = false;
    }
  },
  async reloadWeComBotConfig() {
    this.isWeComReloading = true;
    try {
      const res = await fetch('/reload_wecom_bot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.weComBotConfig),
      });
      const json = await res.json();
      if (json.success) showNotification('企微机器人已重载', 'success');
      else showNotification(`重载失败：${json.message}`, 'error');
    } catch (e) {
      showNotification('网络错误', 'error');
    } finally {
      this.isWeComReloading = false;
    }
  },
  async checkWeComBotStatus() {
    try {
      const res = await fetch('/wecom_bot_status');
      const st = await res.json();
      this.isWeComBotRunning = st.is_running;
    } catch (e) { }
  },

async requestTelegramBotStopIfRunning() {
  try {
    const res = await fetch('/telegram_bot_status');
    const st = await res.json();
    if (st.is_running) await this.stopTelegramBot();
  } catch (e) {
    console.error('检查或停止 Telegram 机器人失败:', e);
  }
},

  // 1. 启动钉钉机器人
  async startDingtalkBot() {
    this.isDingtalkStarting = true;
    try {
      showNotification('正在建立钉钉 Stream 连接...', 'info');
      const res = await fetch('/start_dingtalk_bot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.dingtalkBotConfig),
      });
      const json = await res.json();
      if (json.success) {
        this.isDingtalkBotRunning = true;
        showNotification('钉钉机器人启动成功 (Stream模式)', 'success');
      } else {
        showNotification(`启动失败：${json.message}`, 'error');
      }
    } catch (e) {
      showNotification('网络错误：钉钉服务未响应', 'error');
    } finally {
      this.isDingtalkStarting = false;
    }
  },

  // 2. 停止钉钉机器人
  async stopDingtalkBot() {
    this.isDingtalkStopping = true;
    try {
      const res = await fetch('/stop_dingtalk_bot', { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        this.isDingtalkBotRunning = false;
        showNotification('钉钉机器人连接已断开', 'success');
      } else {
        showNotification(`停止失败：${json.message}`, 'error');
      }
    } catch (e) {
      showNotification('网络错误', 'error');
    } finally {
      this.isDingtalkStopping = false;
    }
  },

  // 3. 重载钉钉机器人配置
  async reloadDingtalkBot() {
    this.isDingtalkReloading = true;
    try {
      const res = await fetch('/reload_dingtalk_bot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.dingtalkBotConfig),
      });
      const json = await res.json();
      if (json.success) {
        showNotification('钉钉机器人配置已实时重载', 'success');
      } else {
        showNotification(`重载失败：${json.message}`, 'error');
      }
    } catch (e) {
      showNotification('网络错误', 'error');
    } finally {
      this.isDingtalkReloading = false;
    }
  },

  // 4. 检查钉钉机器人状态 (常用于 mounted 钩子)
  async checkDingtalkBotStatus() {
    try {
      const res = await fetch('/dingtalk_bot_status');
      const st = await res.json();
      this.isDingtalkBotRunning = st.is_running;
    } catch (e) {
      console.error('检查钉钉机器人状态失败', e);
    }
  },

  // 其他辅助方法
  handleCreateDingtalkSeparator(val) {
    if (!this.dingtalkBotConfig.separators) this.dingtalkBotConfig.separators = [];
    this.dingtalkBotConfig.separators.push(val);
  },

  // 联动停止：当其他机器人启动时，确保停止当前的钉钉机器人
  async requestDingtalkBotStopIfRunning() {
    try {
      const res = await fetch('/dingtalk_bot_status');
      const st = await res.json();
      if (st.is_running) await this.stopDingtalkBot();
    } catch (e) {
      console.error('停止钉钉机器人失败:', e);
    }
  },

async startTelegramBot() {
  this.isTelegramStarting = true;
  try {
    showNotification('正在连接 Telegram 机器人...', 'info');
    const res = await fetch('/start_telegram_bot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(this.telegramBotConfig)
    });
    const json = await res.json();
    if (json.success) {
      this.isTelegramBotRunning = true;
      showNotification('Telegram 机器人启动成功', 'success');
    } else {
      showNotification(`启动失败：${json.message}`, 'error');
    }
  } catch (e) {
    showNotification('网络错误或服务器未响应', 'error');
  } finally {
    this.isTelegramStarting = false;
  }
},
async stopTelegramBot() {
  this.isTelegramStopping = true;
  try {
    const res = await fetch('/stop_telegram_bot', { method: 'POST' });
    const json = await res.json();
    if (json.success) {
      this.isTelegramBotRunning = false;
      showNotification('Telegram 机器人已停止', 'success');
    } else {
      showNotification(`停止失败：${json.message}`, 'error');
    }
  } catch (e) {
    showNotification('网络错误或服务器未响应', 'error');
  } finally {
    this.isTelegramStopping = false;
  }
},
async reloadTelegramBotConfig() {
  this.isTelegramReloading = true;
  try {
    const res = await fetch('/reload_telegram_bot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(this.telegramBotConfig)
    });
    const json = await res.json();
    if (json.success) {
      showNotification('Telegram 机器人已重载', 'success');
    } else {
      showNotification(`重载失败：${json.message}`, 'error');
    }
  } catch (e) {
    showNotification('网络错误或服务器未响应', 'error');
  } finally {
    this.isTelegramReloading = false;
  }
},
async checkTelegramBotStatus() {
  try {
    const res = await fetch('/telegram_bot_status');
    const st = await res.json();
    this.isTelegramBotRunning = st.is_running;
  } catch (e) {
    console.error('检查 Telegram 机器人状态失败', e);
  }
},
handleCreateTelegramSeparator(val) {
  this.telegramBotConfig.separators.push(val);
},

/* ------- Discord 机器人 ------- */
async startDiscordBot() {
  this.isDiscordStarting = true;
  try {
    showNotification('正在连接 Discord 机器人...', 'info');
    const res = await fetch('/start_discord_bot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(this.discordBotConfig),
    });
    const json = await res.json();
    if (json.success) {
      this.isDiscordBotRunning = true;
      showNotification('Discord 机器人启动成功', 'success');
    } else {
      showNotification(`启动失败：${json.message}`, 'error');
    }
  } catch (e) {
    showNotification('网络错误或服务器未响应', 'error');
  } finally {
    this.isDiscordStarting = false;
  }
},
async stopDiscordBot() {
  this.isDiscordStopping = true;
  try {
    const res = await fetch('/stop_discord_bot', { method: 'POST' });
    const json = await res.json();
    if (json.success) {
      this.isDiscordBotRunning = false;
      showNotification('Discord 机器人已停止', 'success');
    } else {
      showNotification(`停止失败：${json.message}`, 'error');
    }
  } catch (e) {
    showNotification('网络错误或服务器未响应', 'error');
  } finally {
    this.isDiscordStopping = false;
  }
},
async reloadDiscordBot() {
  this.isDiscordReloading = true;
  try {
    const res = await fetch('/reload_discord_bot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(this.discordBotConfig),
    });
    const json = await res.json();
    if (json.success) {
      showNotification('Discord 机器人已重载', 'success');
    } else {
      showNotification(`重载失败：${json.message}`, 'error');
    }
  } catch (e) {
    showNotification('网络错误或服务器未响应', 'error');
  } finally {
    this.isDiscordReloading = false;
  }
},
async checkDiscordBotStatus() {
  try {
    const res = await fetch('/discord_bot_status');
    const st = await res.json();
    this.isDiscordBotRunning = st.is_running;
  } catch (e) {
    console.error('检查 Discord 机器人状态失败', e);
  }
},
handleCreateDiscordSeparator(val) {
  this.discordBotConfig.separators.push(val);
},

async requestSlackBotStopIfRunning() {
    try {
      // 1. 先从后端确认 Slack 机器人的真实运行状态
      const response = await fetch(`/slack_bot_status`);
      const status = await response.json();

      // 2. 如果后端返回正在运行 (is_running 为 true)
      if (status.is_running) {
        // 3. 调用你之前在 methods 里写好的 stopSlackBot 方法
        // 该方法包含了停止逻辑、Loading 状态切换以及 showNotification 通知
        await this.stopSlackBot();
        console.log('Slack 机器人已应系统请求成功关闭');
      }
    } catch (error) {
      // 捕获网络错误或后端未启动的情况
      console.error('检查或停止 Slack 机器人失败:', error);
    }
  },

/* ------- Slack 机器人 ------- */
async startSlackBot() {
  this.isSlackStarting = true;
  try {
    showNotification('正在连接 Slack 机器人...', 'info');
    // 注意：这里发送的是 slackBotConfig，但后端会自动处理共用的 memorySettings 状态
    const res = await fetch('/start_slack_bot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...this.slackBotConfig,
        // 显式传一下 memory 配置，确保后端能拿到最新的
        memory_settings: this.memorySettings 
      }),
    });
    const json = await res.json();
    if (json.success) {
      this.isSlackBotRunning = true;
      showNotification('Slack 机器人启动成功', 'success');
    } else {
      showNotification(`启动失败：${json.message}`, 'error');
    }
  } catch (e) {
    showNotification('网络错误或服务器未响应', 'error');
  } finally {
    this.isSlackStarting = false;
  }
},
async stopSlackBot() {
  this.isSlackStopping = true;
  try {
    const res = await fetch('/stop_slack_bot', { method: 'POST' });
    const json = await res.json();
    if (json.success) {
      this.isSlackBotRunning = false;
      showNotification('Slack 机器人已停止', 'success');
    } else {
      showNotification(`停止失败：${json.message}`, 'error');
    }
  } catch (e) {
    showNotification('网络错误', 'error');
  } finally {
    this.isSlackStopping = false;
  }
},
async reloadSlackBot() {
  this.isSlackReloading = true;
  try {
    const res = await fetch('/reload_slack_bot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...this.slackBotConfig,
        memory_settings: this.memorySettings
      }),
    });
    const json = await res.json();
    if (json.success) {
      showNotification('Slack 机器人已重载', 'success');
    } else {
      showNotification(`重载失败：${json.message}`, 'error');
    }
  } catch (e) {
    showNotification('网络错误', 'error');
  } finally {
    this.isSlackReloading = false;
  }
},
async checkSlackBotStatus() {
  try {
    const res = await fetch('/slack_bot_status');
    const st = await res.json();
    this.isSlackBotRunning = st.is_running;
  } catch (e) {
    console.error('检查 Slack 状态失败', e);
  }
},
handleCreateSlackSeparator(val) {
  this.slackBotConfig.separators.push(val);
},

    // // 启动微信机器人
    // async startWXBot() {
    //   this.isWXStarting = true;

    //   try {
    //     // 显示连接中的提示
    //     showNotification('正在连接微信机器人...', 'info');

    //     const response = await fetch(`/start_wx_bot`, {
    //       method: 'POST',
    //       headers: { 'Content-Type': 'application/json' },
    //       body: JSON.stringify(this.WXBotConfig)
    //     });

    //     const result = await response.json();

    //     if (result.success) {
    //       this.isWXBotRunning = true;
    //       showNotification('微信机器人已成功启动并就绪', 'success');
    //     } else {
    //       // 显示具体错误信息
    //       const errorMessage = result.message || '启动失败，请检查配置';
    //       showNotification(`启动失败: ${errorMessage}`, 'error');

    //       // 如果是超时错误，给出更具体的提示
    //       if (errorMessage.includes('超时')) {
    //         showNotification('提示：请检查网络连接和机器人配置是否正确', 'warning');
    //       }
    //     }
    //   } catch (error) {
    //     console.error('启动微信机器人时出错:', error);
    //     showNotification('启动微信机器人失败: 网络错误或服务器未响应', 'error');
    //   } finally {
    //     this.isWXStarting = false;
    //   }
    // },

    // // 停止微信机器人
    // async stopWXBot() {
    //   this.isWXStopping = true;

    //   try {
    //     const response = await fetch(`/stop_wx_bot`, {
    //       method: 'POST',
    //       headers: { 'Content-Type': 'application/json' }
    //     });

    //     const result = await response.json();

    //     if (result.success) {
    //       this.isWXBotRunning = false;
    //       showNotification('微信机器人已成功停止', 'success');
    //     } else {
    //       const errorMessage = result.message || '停止失败';
    //       showNotification(`停止失败: ${errorMessage}`, 'error');
    //     }
    //   } catch (error) {
    //     console.error('停止微信机器人时出错:', error);
    //     showNotification('停止微信机器人失败: 网络错误或服务器未响应', 'error');
    //   } finally {
    //     this.isWXStopping = false;
    //   }
    // },

    // // 重载微信机器人配置
    // async reloadWXBotConfig() {
    //   this.isWXReloading = true;

    //   try {
    //     const response = await fetch(`/reload_wx_bot`, {
    //       method: 'POST',
    //       headers: { 'Content-Type': 'application/json' },
    //       body: JSON.stringify(this.WXBotConfig)
    //     });

    //     const result = await response.json();

    //     if (result.success) {
    //       if (result.config_changed) {
    //         showNotification('微信机器人配置已重载并重新启动', 'success');
    //       } else {
    //         showNotification('微信机器人配置已更新', 'success');
    //       }
    //     } else {
    //       const errorMessage = result.message || '重载失败';
    //       showNotification(`重载失败: ${errorMessage}`, 'error');
    //     }
    //   } catch (error) {
    //     console.error('重载微信机器人配置时出错:', error);
    //     showNotification('重载微信机器人配置失败: 网络错误或服务器未响应', 'error');
    //   } finally {
    //     this.isWXReloading = false;
    //   }
    // },

    // // 检查微信机器人状态
    // async checkWXBotStatus() {
    //   try {
    //     const response = await fetch(`/wx_bot_status`);
    //     const status = await response.json();

    //     // 更新机器人运行状态
    //     this.isWXBotRunning = status.is_running;

    //     // 如果机器人正在运行但前端状态不一致，更新状态
    //     if (status.is_running && !this.isWXBotRunning) {
    //       this.isWXBotRunning = true;
    //     }
    //   } catch (error) {
    //     console.error('检查机器人状态失败:', error);
    //   }
    // },

    // // 新增的方法：供主进程请求关闭机器人
    // async requestStopWXBotIfRunning() {
    //   try {
    //     const response = await fetch(`/wx_bot_status`)
    //     const status = await response.json()

    //     if (status.is_running) {
    //       // 调用 stopWXBot 来关闭机器人
    //       await this.stopWXBot()
    //       console.log('机器人已关闭')
    //     }
    //   } catch (error) {
    //     console.error('检查或停止机器人失败:', error)
    //   }
    // },

    async handleSeparatorChange(val) {
      this.qqBotConfig.separators = val.map(s => 
        s.replace(/\\n/g, '\n').replace(/\\t/g, '\t')
      );
      await this.autoSaveSettings();
    },
    formatSeparator(s) {
      return s.replace(/\n/g, '\\n')
              .replace(/\t/g, '\\t')
              .replace(/\r/g, '\\r');
    },
    // 新增创建分隔符处理方法
    async handleCreateSeparator(newSeparator) {
      const processed = this.escapeSeparator(newSeparator)
      if (!this.qqBotConfig.separators.includes(processed)) {
        this.qqBotConfig.separators.push(processed)
        await this.autoSaveSettings()
      }
    },

    // 处理回车键冲突
    handleEnter(e) {
      if (e.target.value) {
        e.stopPropagation()
      }
    },

    escapeSeparator(s) {
      return s.replace(/\\n/g, '\n').replace(/\\t/g, '\t')
    },

    // 一键重置
    resetNewMemory() {
      this.newMemory = {
        id: null,
        name: '',
        infer:false,
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
      };
    },
    copyExistingMemoryData(selectedId) {
      const src = this.memories.find(m => m.id === selectedId);
      if (src) {
        /* 把旧字段映射到新字段，没有的就给默认值 */
        this.newMemory = {
          id: null,
          name: src.name || '',
          infer: src.infer || false,
          providerId: src.providerId || null,
          model: src.model || '',
          base_url: src.base_url || '',
          api_key: src.api_key || '',
          vendor: src.vendor || '',

          /* 旧→新 */
          description: src.basic_character || src.description || '',
          avatar: src.avatar || '',
          personality: src.personality || '',
          mesExample: src.mesExample || '',
          systemPrompt: src.systemPrompt || '',
          firstMes: src.firstMes || (Array.isArray(src.random) ? src.random[0]?.value : ''),
          alternateGreetings:
            Array.isArray(src.alternateGreetings)
              ? src.alternateGreetings
              : (src.random || []).slice(1).map(r => r.value),
          characterBook:
            Array.isArray(src.characterBook)
              ? src.characterBook
              : (src.lorebook || []).map(l => ({
                  keysRaw: l.name,
                  content: l.value
                }))  
        };
           if (this.newMemory.characterBook.length == 0 ){
              this.newMemory.characterBook = [{ keysRaw: '', content: '' }]
           }   
      } else {
        /* 新建：直接给空模板 */
        this.resetNewMemory();
      }
    },
    colorBlend(color1, color2, ratio) {
        // 确保ratio在0-1范围内
        ratio = Math.max(0, Math.min(1, ratio));
        
        // 解析十六进制颜色值
        const parseHex = (hex) => {
          hex = hex.replace(/^#/, '');
          // 处理3位简写格式
          if (hex.length === 3) {
            hex = hex.split('').map(char => char + char).join('');
          }
          return {
            r: parseInt(hex.substring(0, 2), 16),
            g: parseInt(hex.substring(2, 4), 16),
            b: parseInt(hex.substring(4, 6), 16)
          };
        };

        // 转换为两位十六进制字符串
        const toHex = (value) => {
          const hex = Math.round(value).toString(16);
          return hex.length === 1 ? '0' + hex : hex;
        };

        const rgb1 = parseHex(color1);
        const rgb2 = parseHex(color2);

        // 计算混合后的RGB值
        const r = rgb1.r * ratio + rgb2.r * (1 - ratio);
        const g = rgb1.g * ratio + rgb2.g * (1 - ratio);
        const b = rgb1.b * ratio + rgb2.b * (1 - ratio);

        // 组合成十六进制颜色
        return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
      },
      toggleInputExpand() {
        this.isInputExpanded = !this.isInputExpanded
    },
    onChatInputFocus() {
      this.isChatInputActive = true;
    },
    // textarea 失焦后延迟一帧再判定，给 pill / dialog 的 click 留出落点时间
    onChatInputBlur() {
      setTimeout(() => {
        const active = document.activeElement;
        const wrappers = document.querySelectorAll('.unified-input-wrapper');
        for (const w of wrappers) {
          if (w.contains(active)) return;
        }
        this.isChatInputActive = false;
      }, 200);
    },
    checkMobile() {
      this.isMobile = window.innerWidth <= 768;
      this.isAssistantMode = window.innerWidth <= 350 && window.innerHeight <= 820;
      this.isCapsuleMode = window.innerWidth <= 220 && window.innerHeight <= 100;
      if (this.isMobile) {
        this.MoreButtonDict = this.smallMoreButtonDict;
      }
      else{
        this.MoreButtonDict = this.largeMoreButtonDict;
      }
      if (this.isAssistantMode){
        if(!this.isFixedWindow){
          this.isFixedWindow = true;
          if (isElectron){
            window.electronAPI.setAlwaysOnTop(this.isFixedWindow);
          }
        }
        
      }else{
        if(this.isFixedWindow){
          this.isFixedWindow = false;
          if (isElectron){
            window.electronAPI.setAlwaysOnTop(this.isFixedWindow);
          }
        }
      }
      if(this.isMobile) this.sidebarVisible = false;
    },
    // 添加ComfyUI服务器
    addComfyUIServer() {
      this.comfyuiServers.push('http://localhost:8188')
      this.autoSaveSettings()
    },

    // 移除服务器
    removeComfyUIServer(index) {
      if (this.comfyuiServers.length > 1) {
        this.comfyuiServers.splice(index, 1)
        this.autoSaveSettings()
      }
    },

    // 连接服务器
    async connectComfyUI(index) {
      this.isConnecting = true
      try {
        const url = this.comfyuiServers[index]
        const response = await fetch(`${url}/history`, {
          method: 'HEAD',
          mode: 'cors'
        })
        if (response.ok) {
          this.activeComfyUIUrl = url
          showNotification('服务器连接成功')
        }
      } catch (e) {
        showNotification('无法连接ComfyUI服务器', 'error')
      }
      this.isConnecting = false
    },
    // 浏览文件
    browseWorkflowFile() {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.onchange = (event) => {
        const files = event.target.files;
        if (files.length > 0) {
          this.workflowFile = files[0];
          this.loadWorkflowFile(this.workflowFile); // 确保在文件已选择后调用
        }
      };
      input.click();
    },
    // 移除文件
    removeWorkflowFile() {
      this.workflowFile = null;
    },
    // 删除工作流
    async deleteWorkflow(filename) {
      try {
        const response = await fetch(`/delete_workflow/${filename}`, {
          method: 'DELETE',
        });
        const data = await response.json();
        if (data.success) {
          this.workflows = this.workflows.filter(file => file.unique_filename !== filename);
          await this.autoSaveSettings();
          showNotification('删除成功');
        } else {
          this.workflows = this.workflows.filter(file => file.unique_filename !== filename);
          await this.autoSaveSettings();
          showNotification('删除失败', 'error');
        }
      } catch (error) {
        console.error('删除失败:', error);
       showNotification('删除失败', 'error');
      }
    },
      // 处理文件拖拽
  handleWorkflowDrop(event) {
    event.preventDefault();
    const files = event.dataTransfer.files;
    if (files.length > 0) {
      this.workflowFile = files[0];
      this.loadWorkflowFile(this.workflowFile); // 加载工作流文件以生成选择项
    }
  },
  
  // 加载工作流文件
  async loadWorkflowFile(file) {
    const reader = new FileReader();
    reader.onload = (event) => {
      const workflowJson = JSON.parse(event.target.result);
      this.populateInputOptions(workflowJson);
    };
    reader.readAsText(file);
  },

  // 填充输入选择项
  populateInputOptions(workflowJson) {
    this.textInputOptions = [];
    this.imageInputOptions = [];
    this.seedInputOptions = [];
    
    for (const nodeId in workflowJson) {
      const node = workflowJson[nodeId];
      if (!node.inputs) continue;
      
      // 查找所有包含text/value/prompt的文本输入字段
      const textInputKeys = Object.keys(node.inputs).filter(key => 
        (key.includes('text') || key.includes('value') || key.includes('prompt')) &&
        typeof node.inputs[key] === 'string' // 确保值是字符串类型
      );
      
      // 为每个符合条件的字段创建选项
      textInputKeys.forEach(key => {
        this.textInputOptions.push({
          label: `${node._meta.title} - ${key} (ID: ${nodeId})`,
          value: { nodeId, inputField: key, id : `${nodeId}-${key}` },
        });
      });
      
      // 查找图片输入字段
      if (node.class_type === 'LoadImage') {
        const imageKeys = Object.keys(node.inputs).filter(key => 
          key.includes('image') && 
          typeof node.inputs[key] === 'string' // 确保值是字符串类型
        );
        
        imageKeys.forEach(key => {
          this.imageInputOptions.push({
            label: `${node._meta.title} - ${key} (ID: ${nodeId})`,
            value: { nodeId, inputField: key, id : `${nodeId}-${key}` },
          });
        });
      }

      // 查找所有包含seed的种子输入字段
      const seedInputKeys = Object.keys(node.inputs).filter(
        key => key.includes('seed') && typeof node.inputs[key] === 'number' // 确保值是数字类型
      )
      seedInputKeys.forEach(key => {
        this.seedInputOptions.push({
          label: `${node._meta.title} - ${key} (ID: ${nodeId})`,
          value: { nodeId, inputField: key, id : `${nodeId}-${key}` },
        });
      })
    }
  },

    // 上传文件
    async uploadWorkflow() {
      if (!this.workflowFile) return;

      const formData = new FormData();
      formData.append('file', this.workflowFile);

      // 记录所选的输入位置
      const workflowData = {
        textInput: this.selectedTextInput,
        textInput2: this.selectedTextInput2,
        imageInput: this.selectedImageInput,
        imageInput2: this.selectedImageInput2,
        seedInput: this.selectedSeedInput,
        seedInput2: this.selectedSeedInput2,
        description: this.workflowDescription,
      };

      // 发送 JSON 字符串作为普通字段
      formData.append('workflow_data', JSON.stringify(workflowData));

      try {
        const response = await fetch(`/add_workflow`, {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) { // 检查响应状态
          const errorText = await response.text(); // 获取错误文本
          console.error("Server error:", errorText); // 输出错误信息
          throw new Error("Server error");
        }

        const data = await response.json();
        if (data.success) {
          this.workflows.push(data.file);
          this.showWorkflowUploadDialog = false;
          this.workflowFile = null;
          this.selectedTextInput = null; // 重置选中
          this.selectedImageInput = null; // 重置选中
          this.selectedTextInput2 = null; // 重置选中
          this.selectedImageInput2 = null; // 重置选中
          this.selectedSeedInput = null; // 重置选中
          this.selectedSeedInput2 = null; // 重置选中
          this.workflowDescription = ''; // 清空描述
          await this.autoSaveSettings();
          showNotification('上传成功');
        } else {
          showNotification('上传失败', 'error');
        }
      } catch (error) {
        console.error('上传失败:', error);
        showNotification('上传失败', 'error');
      }
    },
    cancelWorkflowUpload() {
      this.showWorkflowUploadDialog = false;
      this.workflowFile = null;
      this.selectedTextInput = null; // 重置选中
      this.selectedImageInput = null; // 重置选中
      this.selectedTextInput2 = null; // 重置选中
      this.selectedImageInput2 = null; // 重置选中
      this.selectedSeedInput = null; // 重置选中
      this.selectedSeedInput2 = null; // 重置选中
      this.workflowDescription = ''; // 清空描述
    },
    async deleteVideo(video) {
      this.videoFiles = this.videoFiles.filter(i => i !== video);
      await this.autoSaveSettings();
      fileName = video.unique_filename
      try {
        // 向/delete_file发送请求
        const response = await fetch(`/delete_file`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName: fileName })
        });
        // 处理响应
        if (response.ok) {
          console.log('File deleted successfully');
          showNotification(this.t('fileDeleted'), 'success');
        }
      } catch (error) {
        console.error('Error:', error);
        showNotification(this.t('fileDeleteFailed'), 'error');
      }
    },

    goToURL(provider) {
        if (provider.vendor === 'custom') {
          url = provider.url;
          // 移除url尾部的/v1
          if (url.endsWith('/v1')) {
            url = url.slice(0, -3);
          }
        }
        else if (provider.vendor === 'customAnthropic'){
          url = provider.url;
        }
        else {
          url = this.vendorAPIpage[provider.vendor];
        }
        if (isElectron) {
          window.electronAPI.openExternal(url);
        } else {
          window.open(url, '_blank');
        }
    },
    goToMCPURL(value) {
        url = this.MCPpage[value]
        if (isElectron) {
          window.electronAPI.openExternal(url);
        } else {
          window.open(url, '_blank');
        }
    },
    goToPromptURL(value) {
        url = this.promptPage[value]
        if (isElectron) {
          window.electronAPI.openExternal(url);
        } else {
          window.open(url, '_blank');
        }
    },
    goToCardURL(value) {
        url = this.cardPage[value]
        if (isElectron) {
          window.electronAPI.openExternal(url);
        } else {
          window.open(url, '_blank');
        }
    },
    handleBeforeUpload(file) {
      const reader = new FileReader()
      reader.readAsDataURL(file)
      reader.onload = () => {
        this.uploadedStickers.push({
          uid: file.uid,
          url: reader.result,
          description: "",
          file: file
        })
      }
      return false // 阻止自动上传
    },

    handleStickerRemove(file) {
      this.uploadedStickers = this.uploadedStickers.filter(f => f.uid !== file.uid)
    },

    async createStickerPack() {
      try {
        // 验证输入
        if (!this.newStickerPack.name || this.uploadedStickers.length === 0) {
          showNotification(this.t('fillAllFields'), 'warning');
          return;
        }
        

        // 创建FormData对象
        const formData = new FormData();
        
        // 添加表情包名称
        formData.append('pack_name', this.newStickerPack.name);
        
        // 添加所有表情描述
        this.uploadedStickers.forEach(sticker => {
          formData.append('descriptions', sticker.description);
        });
        
        // 添加所有表情文件
        this.uploadedStickers.forEach(sticker => {
          formData.append('files', sticker.file);
        });

        // 发送请求
        const response = await fetch(`/create_sticker_pack`, {
          method: 'POST',
          body: formData
        });
        
        // 处理响应
        if (!response.ok) {
          const errorData = await response.json();
          console.error("服务器错误详情:", errorData);
          
          let errorMsg = this.t('uploadFailed');
          if (errorData.detail) {
            if (typeof errorData.detail === 'string') {
              errorMsg = errorData.detail;
            } else if (errorData.detail[0]?.msg) {
              errorMsg = errorData.detail[0].msg;
            }
          }
          
          throw new Error(errorMsg);
        }

        const data = await response.json();
        if (data.success) {
          // 更新前端状态
          this.stickerPacks.push({
            id: data.id,
            name: data.name,
            stickers: data.stickers,
            cover: data.cover,
            enabled: true
          });
          
          this.imageFiles = [...this.imageFiles, ...data.imageFiles];
          this.resetStickerForm();
          await this.autoSaveSettings();
          
          showNotification(this.t('stickerPackCreated'));
          this.showStickerDialog = false;
        } else {
          showNotification(data.message || this.t('createFailed'), 'error');
          this.showStickerDialog = false;
        }
      } catch (error) {
        console.error('创建失败:', error);
        showNotification(
          error.message || this.t('createFailed'), 
          'error'
        );
        this.showStickerDialog = false;
      }
    },

    deleteStickerPack(stickerPack) {
      this.stickerPacks = this.stickerPacks.filter(pack => pack.id !== stickerPack.id);
      this.autoSaveSettings();
      showNotification(this.t('stickerPackDeleted'));
    },
    cancelStickerUpload() {
      this.showStickerDialog = false;
      this.resetStickerForm();
    },

    resetStickerForm() {
      this.newStickerPack = {
        name: '',
        stickers: [],
      };
      this.uploadedStickers = [];
    },
    handlePictureCardPreview(file) {
      this.imageUrl = file.url || URL.createObjectURL(file.raw)
      this.dialogVisible = true
    },
    downloadMemory(memory) {
      // 仅导出酒馆 V3 所需字段，敏感信息全部剔除
      const card = {
        spec: 'chara_card_v3',
        spec_version: '3.0',
        name: memory.name,
        description: memory.description || '',
        avatar: memory.avatar || '',
        personality: memory.personality || '',
        mes_example: memory.mesExample || '',
        first_mes: memory.firstMes || '',
        system_prompt: memory.systemPrompt || '',
        alternate_greetings: Array.isArray(memory.alternateGreetings)
          ? memory.alternateGreetings.filter(Boolean)
          : [],
        character_book: {
          name: memory.name,
          entries: Array.isArray(memory.characterBook)
            ? memory.characterBook
                .filter(e => e.keysRaw?.trim() && e.content?.trim())
                .map((e, idx) => ({
                  id: idx,
                  keys: e.keysRaw
                    .split(/\r?\n/)
                    .map(k => k.trim())
                    .filter(Boolean),
                  secondary_keys: [],
                  content: e.content,
                  comment: '',
                  constant: false,
                  selective: true,
                  insertion_order: 100,
                  enabled: true,
                  position: 'before_char',
                  use_regex: true,
                  extensions: {}
                }))
            : []
        }
        // 其余字段如 avatar、tags、scenario…按需补空
      };

      const blob = new Blob([JSON.stringify(card, null, 2)], {
        type: 'application/json'
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${memory.name}_v3.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
    changeMemory() {
      if (this.memorySettings.is_memory){
        // 根据selectedMemory获取当前的memories中的对应的记忆
        let curMemory = this.memories.find(memory => memory.id === this.memorySettings.selectedMemory);
        this.firstMes = curMemory.firstMes;
        this.alternateGreetings= curMemory.alternateGreetings;
      }
      else{
        this.firstMes = '';
        this.alternateGreetings = [];
      }
      this.randomGreetings();
      this.autoSaveSettings(); // 保存设置
    },
    randomGreetings() {
      let greetings = [this.firstMes, ...this.alternateGreetings];
      // 过滤掉空字符串
      greetings = greetings.filter(greeting => greeting.trim() !== '');
      // 替换掉开场白中的所有的{{user}}为this.memorySettings.userName
      greetings = greetings.map(greeting => greeting.replace(/{{user}}/g, this.memorySettings.userName));
      // 根据selectedMemory获取当前的memories中的对应的记忆
      let curMemory = this.memories.find(memory => memory.id === this.memorySettings.selectedMemory);
      // 替换掉开场白中的所有的{{char}}为curMemory.name
      greetings = greetings.map(greeting => greeting.replace(/{{char}}/g, curMemory.name));
      if (greetings.length > 0) {
        let randomIndex = Math.floor(Math.random() * greetings.length);
        // 将随机的开场白立刻加入的this.messages中
        // 如果this.messages中第二个元素是开场白，则替换，否则在第一个元素之后插入
        if (this.messages.length > 1 && this.messages[1].role === 'assistant') {
          this.messages[1].content = greetings[randomIndex];
          this.messages[1].pure_content = greetings[randomIndex];
        } else {
          this.messages.splice(1, 0, {
            role: 'assistant',
            content: greetings[randomIndex],
            pure_content: greetings[randomIndex],
          });
        }
      } 
      else{
        // 如果this.messages中第二个元素是开场白，则移除
        if (this.messages.length > 1 && this.messages[1].role === 'assistant') {
          this.messages.splice(1, 1);
        }
      }
    },
    browseJsonFile() {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,.png';          // 关键：多给一个 png
      input.onchange = (event) => {
        const file = event.target.files[0];
        if (!file) return;
        if (file.name.toLowerCase().endsWith('.png')) {
          this.handlePngAsJson(file);        // 新增分支
        } else {
          this.handleFileUpload(file);       // 原 JSON 分支
        }
      };
      input.click();
    },

    handleJsonDrop(event) {
      const file = event.dataTransfer.files[0];
      if (!file) return;
      const isPng = file.type === 'image/png' ||
                    file.name.toLowerCase().endsWith('.png');
      const isJson = file.type === 'application/json' ||
                    file.name.toLowerCase().endsWith('.json');

      if (isPng) {
        this.handlePngAsJson(file);
      } else if (isJson) {
        this.handleFileUpload(file);
      } else {
        showNotification('Please upload a valid JSON or PNG character card.', 'error');
      }
    },

    async handlePngAsJson(file) {
      // 1. 把 PNG 当成普通图片先上传，拿外链
      const formData = new FormData();
      formData.append('files', file);   // 字段名跟 /load_file 接口保持一致

      let imageUrl;
      try {
        const up = await fetch('/load_file', { method: 'POST', body: formData });
        if (!up.ok) throw new Error('upload failed');
        const res = await up.json();
        if (!res.success || !res.fileLinks || !res.fileLinks[0])
          throw new Error('no url returned');
        imageUrl = res.fileLinks[0].path;          // 后端返回的完整 URL
        // 可选：把这张图片也塞进 imageFiles 列表，保持界面同步
        this.imageFiles = [...this.imageFiles, ...res.imageFiles];
      } catch (e) {
        console.error(e);
        showNotification('PNG upload failed', 'error');
        return;
      }

      // 2. 拆包拿 JSON
      const jsonText = await this.extractJsonFromPng(file);
      if (!jsonText) return;   // 通知已在内部弹过

      // 3. 把 avatar 换成刚上传的 URL
      let jsonData;
      try {
        jsonData = JSON.parse(jsonText);
      } catch {
        showNotification('Invalid JSON inside PNG', 'error');
        return;
      }
      // 兼容 V2/V3
      const target = jsonData.data || jsonData;
      target.avatar = imageUrl;   // 直接覆盖

      // 4. 走现有逻辑回填表单
      this.importMemoryData(jsonData);
      this.jsonFile = file;       // 保留文件对象，方便移除按钮
      showNotification('Character card imported from PNG', 'success');
    },

    async extractJsonFromPng(file) {
      const buffer = await file.arrayBuffer();
      const png = new Uint8Array(buffer);
      const sign = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
      if (!sign.every((b, i) => b === png[i])) {
        showNotification('Not a valid PNG file', 'error');
        return null;
      }

      let pos = 8;
      const view = new DataView(buffer);
      let jsonText = null;

      while (pos < png.length) {
        const len  = view.getUint32(pos);
        const type = String.fromCharCode(...png.slice(pos + 4, pos + 8));
        const start = pos + 8;
        const end   = start + len;

        if (type === 'tEXt') {
          const data = png.slice(start, end);
          const zero = data.indexOf(0);
          if (zero > 0) {
            const key = new TextDecoder().decode(data.slice(0, zero)).toLowerCase();
            if (key === 'chara' || key === 'ccv3') {
              const b64 = new TextDecoder().decode(data.slice(zero + 1));
              try {
                jsonText = new TextDecoder().decode(
                  Uint8Array.from(atob(b64), c => c.charCodeAt(0))
                );
                if (key === 'ccv3') break;
              } catch {}
            }
          }
        }
        if (type === 'IEND') break;
        pos = end + 4; // 跳过 CRC
      }

      if (!jsonText) showNotification('No character data found in PNG', 'error');
      return jsonText;
    },


    // 触发文件选择框
    triggerAvatarUpload() {
      this.$refs.avatarInput.click();
    },

    // 处理文件上传
    async handleAvatarUpload(event) {
      const file = event.target.files[0];
      if (!file) return;

      // 重置 input value，防止选择相同文件时不触发 change 事件
      event.target.value = '';

      const formData = new FormData();
      // 注意：这里的 'files' 字段名必须与后端 @app.post("/load_file") 中定义的一致
      formData.append('files', file, file.name);

      try {
        // 可选：在这里显示加载动画
        // const loading = this.$loading({ lock: true, text: 'Uploading...' });

        const response = await fetch('/load_file', {
          method: 'POST',
          body: formData
        });

        const data = await response.json();
        
        // loading.close(); // 关闭加载动画

        if (data.success && data.fileLinks && data.fileLinks.length > 0) {
          // 获取后端返回的完整 URL
          const uploadedUrl = data.fileLinks[0].path;
          
          // 赋值给 newMemory.avatar
          this.newMemory.avatar = uploadedUrl;
          
          // 如果您有全局通知组件
          showNotification(this.t('uploadSuccess') || 'Upload successful', 'success');
        } else {
          showNotification(this.t('uploadFailed') || 'Upload failed', 'error');
        }
      } catch (error) {
        console.error('Avatar upload error:', error);
        showNotification(error.message || 'Upload error', 'error');
      }
    },


    // 触发背景图文件选择框
    triggerBgUpload() {
      if (this.$refs.bgImageInput) {
        this.$refs.bgImageInput.click();
      }
    },

    // 处理背景图文件上传
    async handleBgUpload(event) {
      const file = event.target.files[0];
      if (!file) return;

      // 重置 input value，防止选择相同文件时不触发 change 事件
      event.target.value = '';

      const formData = new FormData();
      // 'files' 字段需与后端 @app.post("/load_file") 中一致
      formData.append('files', file, file.name);

      try {
        const response = await fetch('/load_file', {
          method: 'POST',
          body: formData
        });

        const data = await response.json();
        
        if (data.success && data.fileLinks && data.fileLinks.length > 0) {
          // 获取后端返回的完整 URL 路径并赋值给 backgroundURL
          const uploadedUrl = data.fileLinks[0].path;
          this.systemSettings.backgroundURL = uploadedUrl;
          
          // 自动保存配置
          this.autoSaveSettings();
          
          showNotification(this.t('uploadSuccess') || 'Upload successful', 'success');
        } else {
          showNotification(this.t('uploadFailed') || 'Upload failed', 'error');
        }
      } catch (error) {
        console.error('Background upload error:', error);
        showNotification(error.message || 'Upload error', 'error');
      }
    },

    clearBgImage() {
      this.systemSettings.backgroundURL = '';
      if (typeof this.autoSaveSettings === 'function') {
        this.autoSaveSettings();
      }
    },

    handleFileUpload(file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const jsonData = JSON.parse(event.target.result); // 解析 JSON 数据
          this.importMemoryData(jsonData); // 调用导入方法
          this.jsonFile = file; // 保存文件信息
        } catch (error) {
          showNotification('Invalid JSON file.', 'error'); // 错误提示
        }
      };

      reader.readAsText(file); // 读取文件内容
    },

    importMemoryData(jsonData) {
      // 兼容 V2/V3：统一抽出 data
      const data = jsonData.data || jsonData;

      this.newMemory = {
        ...this.newMemory,                      // 保持 providerId 等旧字段
        name: data.name || '',
        description: data.description || '',
        avatar: data.avatar || '',
        personality: data.personality || '',
        mesExample: data.mes_example || '',
        systemPrompt: data.system_prompt || '',
        firstMes: data.first_mes || '',
        alternateGreetings: Array.isArray(data.alternate_greetings)
          ? data.alternate_greetings
          : [''],
        characterBook:
          Array.isArray(data.character_book?.entries) &&
          data.character_book.entries.length
            ? data.character_book.entries.map(e => ({
                keysRaw: (e.keys || []).join('\n'),
                content: e.content || ''
              }))
            : [{ keysRaw: '', content: '' }]
      };
    },

    removeJsonFile() {
      this.jsonFile = null; // 清空文件
    },
    // 初始化ASR WebSocket连接（修改版本，支持Web Speech API）
    async initASRWebSocket() {
      if (this.asrSettings.engine === 'webSpeech') return;
      
      // 🌟 关键：如果当前已经有连接或正在连接，先清理
      if (this.asrWs) {
        this.asrWs.onclose = null;
        this.asrWs.close();
        this.asrWs = null;
      }

      const ws_protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws_url = `${ws_protocol}//${window.location.host}/ws/asr`;

      console.log('Initializing ASR WebSocket...');
      this.asrWs = new WebSocket(ws_url);
      
      this.asrWs.onopen = () => {
        if (this.asrWs && this.asrWs.readyState === WebSocket.OPEN) {
          console.log('ASR WebSocket connection established');
          this.asrWs.send(JSON.stringify({ type: 'init' }));
        }
      };

      this.asrWs.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleASRResult(data);
        } catch (e) {
          console.error('Invalid JSON from ASR server:', event.data);
        }
      };

      this.asrWs.onclose = (event) => {
        // 只有当 ASR 处于启用状态，且我们没有手动销毁 asrWs 时才重连
        if (this.asrSettings.enabled && this.asrWs !== null) {
          console.log('ASR WebSocket unexpected closed, reconnecting in 3s...');
          setTimeout(() => {
            if (this.asrSettings.enabled) this.initASRWebSocket();
          }, 3000);
        }
      };

      this.asrWs.onerror = (error) => {
        console.error('ASR WebSocket error observed');
      };
    },

    // 修改：初始化Web Speech API（不自动启动）
    initWebSpeechAPI() {
      if(isElectron){
        showNotification(this.t('webSpeechNotSupportedInElectron'), 'error');
        this.asrSettings.enabled = false;
        this.autoSaveSettings();
        return false;
      }

      // 检查浏览器是否支持Web Speech API
      if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        showNotification(this.t('webSpeechNotSupported'), 'error');
        this.asrSettings.enabled = false;
        return false;
      }

      // 创建语音识别对象
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      this.recognition = new SpeechRecognition();

      // 配置语音识别参数
      this.recognition.continuous = true; // 改为非持续识别，由VAD控制
      this.recognition.interimResults = true;
      if (this.asrSettings.webSpeechLanguage != 'auto'){
        this.recognition.lang = this.asrSettings.webSpeechLanguage;
      }
      // 识别结果处理
      this.recognition.onresult = (event) => {
        let finalTranscript = '';
        let interimTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          } else {
            interimTranscript += transcript;
          }
        }

        // 处理中间结果
        if (interimTranscript) {
          this.handleASRResult({
            type: 'transcription',
            text: interimTranscript,
            is_final: false
          });
        }

        // 处理最终结果
        if (finalTranscript) {
          this.handleASRResult({
            type: 'transcription',
            text: finalTranscript,
            is_final: true
          });
        }
      };

      // 错误处理
      this.recognition.onerror = (event) => {
        console.error('Web Speech API error:', event.error);
        let errorMessage = null;
        
        switch (event.error) {
          case 'no-speech':
            errorMessage = null;
            break;
          case 'audio-capture':
            errorMessage = this.t('microphoneError');
            break;
          case 'not-allowed':
            errorMessage = this.t('micPermissionDenied');
            break;
          case 'network':
            errorMessage = this.t('networkError');
            break;
        }
        if (errorMessage) {
          showNotification(errorMessage, 'error');
        }
        
        // 重置识别状态
        this.isWebSpeechRecognizing = false;
      };

      // 识别结束处理
      this.recognition.onend = () => {
        console.log('Web Speech API recognition ended');
        this.isWebSpeechRecognizing = false;
        // 不再自动重启，由VAD控制
      };

      // 识别开始处理
      this.recognition.onstart = () => {
        console.log('Web Speech API recognition started');
        this.isWebSpeechRecognizing = true;
      };

      return true;
    },
    openWakeWindow() {
      this.withinWakeWindow = true;
      this.wakeWindowTimer = setTimeout(() => {
        this.withinWakeWindow = false;
      }, 30_000);
    },

    /* 刷新 30s 窗口（每次成功交互后调用） */
    resetWakeWindow() {
      clearTimeout(this.wakeWindowTimer);
      this.openWakeWindow();
    },

    /* 清理计时器，可在组件销毁时调用 */
    clearWakeWindow() {
      clearTimeout(this.wakeWindowTimer);
      this.withinWakeWindow = false;
    },

    // 修改：统一的ASR结果处理函数
    handleASRResult(data) {
      if (data.type === 'transcription') {
        const lastMessage = this.messages[this.messages.length - 1];
        if (!this.ttsSettings.enabledInterruption && (this.ttsSettings.enabled||this.settings.enableOmniTTS)) {
          // 如果TTS正在运行，并且不允许中断，则不处理ASR结果
          if(this.TTSrunning){
            if ((!lastMessage || (lastMessage?.currentChunk ?? 0) >= (lastMessage?.ttsChunks?.length ?? 0)) && !this.isTyping) {
              console.log('All audio chunks played');
              lastMessage.currentChunk = 0;
              this.TTSrunning = false;
              this.cur_audioDatas = [];
              // 通知VRM所有音频播放完成
              this.sendTTSStatusToVRM('allChunksCompleted', {});
            }
            else{
              console.log('Audio chunks still playing');
              return;
            }
          }
        }
        else if (this.ttsSettings.enabledInterruption && this.ttsSettings.enabled) {
            console.log('All audio chunks played');
            lastMessage.currentChunk = 0;
            this.TTSrunning = false;
            this.cur_audioDatas = [];
            // 通知VRM所有音频播放完成
            this.sendTTSStatusToVRM('allChunksCompleted', {});
        }
        else if(this.settings.enableOmniTTS && this.ttsSettings.enabledInterruption){
            this.stopAllAudioPlayback();
            this.sendTTSStatusToVRM('allChunksCompleted', {});
        }
        if (data.is_final) {
          // 最终结果
          if (this.userInputBuffer.length > 0) {
            // 用data.text替换this.userInput中最后一个this.userInputBuffer
            this.userInput = this.userInput.slice(0, -this.userInputBuffer.length) + data.text;
            this.userInputBuffer = '';
          } else {
            // 如果没有临时结果，直接添加到userInput
            this.userInput += data.text;
            this.userInputBuffer = '';
          }
          
          if (this.isPttMode || this.waitingForPttResult) {
            console.log("PTT 识别完成，自动发送:", data.text);
            this.sendMessage(); 
            this.userInput = ''; // 发送后清空
            this.waitingForPttResult = false; // 重置标记
            return;
          }

          // 根据交互方式处理
          if (this.asrSettings.interactionMethod == "auto") {
            if (this.ttsSettings.enabledInterruption) {
              this.sendMessage();
            } else if (!this.TTSrunning ||  !this.ttsSettings.enabled) {
              this.sendMessage();
            }
          }
          
          if (this.asrSettings.interactionMethod == "wakeWord") {
            const lowerInput = this.userInput.toLowerCase();
            const hasWakeWord = lowerInput.includes(this.asrSettings.wakeWord.toLowerCase());

            /* 1. 如果在 30s 免唤醒窗口，直接发送 */
            if (this.withinWakeWindow) {
              this.sendMessage();
              this.resetWakeWindow();          // 刷新 30s
              return;
            }

            /* 2. 否则必须检测唤醒词 */
            if (hasWakeWord) {
              this.sendMessage();
              this.openWakeWindow();           // 进入 30s 免唤醒
            } else {
              this.userInput = '';             // 未唤醒，清空输入
            }
          }
          
          if (this.asrSettings.interactionMethod == "wakeWordAndEndWord") {
            const userInputLower = this.userInput.toLowerCase();
            const wakeWordLower = this.asrSettings.wakeWord.toLowerCase();
            const endWordLower = this.asrSettings.endWord.toLowerCase();
            
            // 检查是否包含结束词
            if (userInputLower.includes(endWordLower)) {
              this.inAutoMode = false;
              console.log('End word detected, exiting auto mode');
              showNotification(this.t('endWordDetected'));
              // 可以选择发送包含结束词的消息，或者清空不发送
              this.userInput = '';
            }
            // 检查是否包含唤醒词
            else if (userInputLower.includes(wakeWordLower)) {
              this.inAutoMode = true;
              console.log('ake word detected, entering auto mode');
              // 发送包含唤醒词的消息
              if (this.ttsSettings.enabledInterruption) {
                this.sendMessage();
              } else if (!this.TTSrunning ||  !this.ttsSettings.enabled) {
                this.sendMessage();
              }
            }
            // 如果在自动模式下，所有消息都自动发送
            else if (this.inAutoMode) {
              if (this.ttsSettings.enabledInterruption) {
                this.sendMessage();
              } else if (!this.TTSrunning ||  !this.ttsSettings.enabled) {
                this.sendMessage();
              }
            }
            else{
              this.userInput = '';             // 未唤醒，清空输入
            }
          }
        } else {
          if (this.asrSettings.engine === 'webSpeech'){
            this.userInput = data.text;
            this.userInputBuffer = data.text;
          }else {
            // 临时结果
            this.userInput += data.text;
            this.userInputBuffer += data.text;
          }

        }
      } else if (data.type === 'error') {
        console.error('ASR error:', data.message);
        showNotification(this.t('transcriptionFailed'), 'error');
      } else if (data.type === 'init_response') {
        if (data.status === 'ready') {
          
        }
      }
    },

    // 修改：开关ASR功能
    async toggleASR() {
      this.asrSettings.enabled = !this.asrSettings.enabled;
      this.autoSaveSettings();
      if (this.asrSettings.enabled === true && this.asrSettings.engine === 'sherpa'){
        if (!this.sherpaModelExists){
          showNotification(this.t('autoDownloadModel'), 'info');
          this.asrSettings.enabled = false;
          let source = await this.getAutoSource();
          await this.sherpaDownload(source);
          this.autoSaveSettings();
          return;
        }
      }
      if (this.asrSettings.enabled) {
        await this.startASR();
      } else {
        this.stopASR();
      }
    },

    // 修改：处理ASR设置变化
    async handleASRchange() {
      // 🌟 锁保护：如果正在启动中，直接返回，防止疯狂点击
      if (this.isStartingASR) return;
      
      // 先彻底停止
      await this.stopASR(); 
      if (this.asrSettings.enabled === true && this.asrSettings.engine === 'sherpa'){
        if (!this.sherpaModelExists){
          showNotification(this.t('autoDownloadModel'), 'info');
          this.asrSettings.enabled = false;
          let source = await this.getAutoSource();
          await this.sherpaDownload(source);
          this.autoSaveSettings();
          return;
        }
      }

      if (this.asrSettings.enabled) {
        // 给系统 200ms 时间回收资源
        await new Promise(resolve => setTimeout(resolve, 200));
        await this.startASR();
      }

      this.autoSaveSettings();
    },

    // 修改：启动ASR
    async startASR() {
      if (!this.asrSettings.enabled) return;
      if (this.asrSettings.interactionMethod === 'globalKeyTriggered' || this.asrSettings.interactionMethod === 'keyTriggered') return;
      
      // 🌟 开启启动锁
      if (this.isStartingASR) return;
      this.isStartingASR = true;

      try {
        // 1. 统一获取流
        if (!this.mediaStream) {
          this.mediaStream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
          });
        }

        // 2. 初始化 VAD
        await this.initVAD();

        // 3. 初始化引擎
        if (this.asrSettings.engine === 'webSpeech') {
          this.initWebSpeechAPI();
        } else {
          // 确保在创建新连接前，旧连接已死
          await this.initASRWebSocket();
        }

        if (this.vad) {
          await this.vad.start();
        }
        
        this.isRecording = true;
      } catch (error) {
        console.error('Start ASR Error:', error);
        this.stopASR();
      } finally {
        // 🌟 释放启动锁
        this.isStartingASR = false;
      }
    },

    // 修改：停止ASR
    async stopASR() {
      console.log('Stopping ASR...');
      this.isRecording = false;
      this.isStartingASR = false;

      // 1. 彻底切断 WebSocket (关键：先抹除监听器)
      if (this.asrWs) {
        this.asrWs.onclose = null; // 🌟 抹除监听，防止触发自动重连死循环
        this.asrWs.onerror = null;
        this.asrWs.onmessage = null;
        this.asrWs.onopen = null;
        if (this.asrWs.readyState !== WebSocket.CLOSED) {
          this.asrWs.close();
        }
        this.asrWs = null;
      }

      // 2. 停止 Web Speech
      if (this.recognition) {
        try {
          this.recognition.onend = null;
          this.recognition.onerror = null;
          this.recognition.abort();
        } catch (e) {}
        this.recognition = null;
        this.isWebSpeechRecognizing = false;
      }

      // 3. 停止 VAD
      if (this.vad) {
        try {
          this.vad.pause();
          if (this.vad.destroy) await this.vad.destroy();
        } catch (e) {}
        this.vad = null;
      }

      // 4. 释放麦克风硬件
      if (this.mediaStream) {
        this.mediaStream.getTracks().forEach(track => {
          track.stop();
        });
        this.mediaStream = null;
      }

      // 5. 释放音频上下文
      if (this.audioContext) {
        try {
          await this.audioContext.close();
        } catch (e) {}
        this.audioContext = null;
      }
      
      this.ASRrunning = false;
    },

    // 修改：初始化VAD（Web Speech模式也使用VAD）
    async initVAD() {
      if (!this.mediaStream) return;

      const min_probabilities = this.asrSettings.engine === 'webSpeech' ? 0.7 : 0.2;

      this.vad = await vad.MicVAD.new({
        stream: this.mediaStream,
        preSpeechPadFrames: 10,
        onSpeechStart: () => {
          this.ASRrunning = true;
          this.handleSpeechStart();
        },
        onFrameProcessed: (probabilities, frame) => {
          if (probabilities["isSpeech"] > min_probabilities) {
            // 打断逻辑
            if (this.ttsSettings.enabledInterruption) {
              this.stopAllAudioPlayback();
              this.stopGenerate();
              this.sendTTSStatusToVRM('stopSpeaking', {});
            }

            const anyPlaying = this.messages.some(m => m._currentAudio && !m._currentAudio.paused);
            if (!anyPlaying) {
              if (this.asrSettings.engine === 'webSpeech') {
                this.handleWebSpeechFrameProcessed();
              } else {
                this.handleFrameProcessed(frame);
              }
            }
          }
        },
        onSpeechEnd: (audio) => {
          this.ASRrunning = false;
          if (this.asrSettings.engine === 'webSpeech') {
            this.handleWebSpeechEnd();
          } else {
            this.handleSpeechEnd(audio);
          }
        },
      });
    },

    handleWebSpeechSpeechStart() {
      console.log('VAD detected speech start for Web Speech API');
      if (!this.isWebSpeechRecognizing && this.recognition) {
        try {
          this.recognition.start();
        } catch (error) {
          // 忽略已经启动的报错
        }
      }
    },

    async handleFrameProcessed(frame) {
      if (!frame || !(frame instanceof Float32Array)) return;

      // 🌟 增加极其严格的检查：连接不处于 OPEN 状态绝不发送数据
      if (!this.asrWs || this.asrWs.readyState !== WebSocket.OPEN) {
        return;
      }

      try {
        const int16Pcm = new Int16Array(frame.length);
        for (let i = 0; i < frame.length; i++) {
          int16Pcm[i] = Math.max(-32768, Math.min(32767, frame[i] * 32767));
        }

        const base64Audio = btoa(
          String.fromCharCode(...new Uint8Array(int16Pcm.buffer))
        );

        this.asrWs.send(JSON.stringify({
          type: 'audio_stream',
          id: this.currentTranscriptionId,
          audio: base64Audio,
          format: 'pcm',
          sample_rate: 16000
        }));
      } catch (e) {
        // 如果发送失败，多半是连接刚刚断开
        console.warn('Failed to send audio frame');
      }
    },

    handleWebSpeechEnd() {
      console.log('VAD detected speech end for Web Speech API');
      if (this.isWebSpeechRecognizing && this.recognition) {
        try {
          this.recognition.stop();
        } catch (error) {
          console.error('Failed to stop Web Speech API:', error);
        }
      }
    },


    // 修改：开始录音（两种模式都需要）
    async startRecording() {
      try {
        // 请求麦克风权限
        this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        // 初始化音频上下文
        this.audioContext = new AudioContext();
        const source = this.audioContext.createMediaStreamSource(this.mediaStream);
        
        // 设置VAD参数
        this.vad.start();
        
        this.isRecording = true;
      } catch (error) {
        console.error('Error starting recording:', error);
        this.asrSettings.enabled = false;
        showNotification(this.t('micPermissionDenied'), 'error');
      }
    },

    // 修改：停止录音（两种模式都需要）
    stopRecording() {
      if (this.vad) {
        this.vad.pause();
      }
      
      if (this.mediaStream) {
        this.mediaStream.getTracks().forEach(track => track.stop());
        this.mediaStream = null;
      }
      
      if (this.audioContext) {
        this.audioContext.close();
        this.audioContext = null;
      }
      
      this.isRecording = false;
    },
    // 修改：统一的语音开始处理

    async handleSpeechStart() {
      if (this.asrSettings.engine === 'webSpeech') {
        this.handleWebSpeechSpeechStart();
      } else {
        if (!this.asrWs || this.asrWs.readyState !== WebSocket.OPEN) return;
        
        this.currentTranscriptionId = uuid.v4();
        this.asrWs.send(JSON.stringify({
          type: 'audio_start',
          id: this.currentTranscriptionId,
        }));
      }
    },

    async handleFrameProcessed(frame) {
      if (!frame || !(frame instanceof Float32Array)) return;

      // 🌟 修复点：增加 WebSocket 状态检查，避免发送报错
      if (!this.asrWs || this.asrWs.readyState !== WebSocket.OPEN) {
        return;
      }

      try {
        const int16Pcm = new Int16Array(frame.length);
        for (let i = 0; i < frame.length; i++) {
          int16Pcm[i] = Math.max(-32768, Math.min(32767, frame[i] * 32767));
        }

        const base64Audio = btoa(
          String.fromCharCode(...new Uint8Array(int16Pcm.buffer))
        );

        this.asrWs.send(JSON.stringify({
          type: 'audio_stream',
          id: this.currentTranscriptionId,
          audio: base64Audio,
          format: 'pcm',
          sample_rate: 16000 
        }));
      } catch (e) {
        console.error('Frame processing error:', e);
      }
    },

    async handleSpeechEnd(audio) {
      // 语音结束时的处理
      if (!this.asrWs || this.asrWs.readyState !== WebSocket.OPEN) return;
      
        // 非流式模式，发送完整音频数据
        // 将音频数据转换为WAV格式
        const wavFile = await this.audioToWav(audio);
        
        // 将WAV文件转换为base64编码
        const reader = new FileReader();
        reader.readAsDataURL(wavFile);
        reader.onloadend = () => {
          const base64data = reader.result.split(',')[1]; // 移除前缀
          
          // 发送完整音频数据
          this.asrWs.send(JSON.stringify({
            type: 'audio_complete',
            id: this.currentTranscriptionId,
            audio: base64data,
            format: 'wav'
          }));
        };
    },
  // 1. 按下：开始录音
  async handlePttPress(event) {
    this.stopAllAudioPlayback(); // 停止所有正在播放的音频
    this.TTSrunning = false; // 停止任何正在播放的 TTS
    // 手动阻止默认事件，解决 _withMods 报错
    if (event && event.preventDefault) {
      if (event.type !== 'touchstart') {
        event.preventDefault();
      }
    }

    if (this.isPttRecording || this.isProcessingPtt) return;
    this.isPttRecording = true;

    // ==========================================
    // 分支 A: Web Speech API 模式 (直接复用你现有的 initWebSpeechAPI)
    // ==========================================
    if (this.asrSettings.engine === 'webSpeech') {
      // 如果还没有初始化识别对象，则进行初始化
      if (!this.recognition) {
        const success = this.initWebSpeechAPI();
        if (!success) {
          this.isPttRecording = false;
          return;
        }
      }
      
      try {
        this.recognition.start();
        if (navigator.vibrate) navigator.vibrate(50);
      } catch (e) {
        // 捕获“已经启动”的错误，避免控制台报错
        console.warn("Web Speech already started:", e);
      }
      return; // ⚠️ 关键：直接跳出，不执行下方的 MediaRecorder 逻辑
    }

    // ==========================================
    // 分支 B: 其他 ASR 模式 (二进制流模式：Sherpa/FunASR/OpenAI)
    // ==========================================
    this.audioChunks = []; // 重置数据桶

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.pttStream = stream;

      let options = { mimeType: 'audio/webm' };
      if (!MediaRecorder.isTypeSupported('audio/webm')) {
        options = { mimeType: 'audio/mp4' }; // Safari 兼容
      }
      
      this.pttMediaRecorder = new MediaRecorder(stream, options);

      this.pttMediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          this.audioChunks.push(e.data);
        }
      };

      this.pttMediaRecorder.start();
      
      if (navigator.vibrate) navigator.vibrate(50);

    } catch (error) {
      console.error("PTT Start Error:", error);
      // 如果定义了 showNotification 则调用，否则用 alert 兜底
      if (typeof showNotification === 'function') {
        showNotification(this.t('micPermissionDenied'), 'error');
      }
      this.isPttRecording = false;
    }
  },

  // 2. 松开：停止录音 -> 转码 -> 发送
  async handlePttRelease(event) {
    // 手动阻止默认事件
    if (event && event.preventDefault && event.type !== 'touchend') {
       event.preventDefault();
    }

    if (!this.isPttRecording) return;
    this.isPttRecording = false;

    // ==========================================
    // 分支 A: Web Speech API 模式
    // ==========================================
    if (this.asrSettings.engine === 'webSpeech') {
      if (this.recognition) {
        // 【核心修复】：创建一个一次性的监听器，确保在文字识别彻底完成后发送
        const sendAfterRecognition = () => {
          // 移除监听器，避免下次重复触发
          this.recognition.removeEventListener('end', sendAfterRecognition);
          
          // 给一点点延迟（100ms），确保 handleASRResult 已经把最后的文字更新到 userInput
          setTimeout(() => {
            if (this.userInput && this.userInput.trim() !== '') {
              this.sendMessage(); // 触发发送逻辑
            }
          }, 100);
        };

        // 绑定一次性结束监听
        this.recognition.addEventListener('end', sendAfterRecognition);
        
        this.recognition.stop(); // 停止识别
        if (navigator.vibrate) navigator.vibrate(30);
      }
      return; 
    }

    // ==========================================
    // 分支 B: 其他 ASR 模式 (二进制流停止逻辑)
    // ==========================================
    if (!this.pttMediaRecorder) return;

    this.isProcessingPtt = true;

    // 停止录制
    if(this.pttMediaRecorder.state !== 'inactive') {
        this.pttMediaRecorder.stop();
    }
    
    // 关闭麦克风红点
    if (this.pttStream) {
      this.pttStream.getTracks().forEach(track => track.stop());
      this.pttStream = null;
    }
    
    if (navigator.vibrate) navigator.vibrate(30);

    // 等待录制彻底结束并合并数据
    await new Promise(resolve => {
      this.pttMediaRecorder.onstop = () => resolve();
    });

    // 处理音频逻辑 (原有的 processAndSendPttAudio)
    await this.processAndSendPttAudio();
    
    this.isProcessingPtt = false;
    this.pttMediaRecorder = null;
  },

  // 3. 处理音频逻辑
  async processAndSendPttAudio() {
    if (this.audioChunks.length === 0) return;

    try {
      // 合并录音片段
      const mimeType = this.pttMediaRecorder ? this.pttMediaRecorder.mimeType : 'audio/webm';
      const rawBlob = new Blob(this.audioChunks, { type: mimeType });

      // ★ 核心转换：将 WebM/MP4 转为 16000Hz WAV
      // 这是后端 ASR 通常能识别的最稳妥格式
      const wavBlob = await this.convertBlobToWav(rawBlob, 16000);

      // 发送
      await this.sendPttToBackend(wavBlob);

    } catch (error) {
      console.error("PTT Process Error:", error);
    }
  },

  // 4. 发送给后端 (复用 WebSocket)
  async sendPttToBackend(wavBlob) {
    // 确保连接
    if (!this.asrWs || this.asrWs.readyState !== WebSocket.OPEN) {
      try {
        await this.initASRWebSocket();
        await new Promise(r => setTimeout(r, 500));
      } catch (e) {
        showNotification("无法连接语音服务器", 'error');
        return;
      }
    }

    const reader = new FileReader();
    reader.readAsDataURL(wavBlob);
    reader.onloadend = () => {
      const base64data = reader.result.split(',')[1];
      const reqId = uuid.v4();

      // 发送完整音频包
      this.asrWs.send(JSON.stringify({
        type: 'audio_complete', 
        id: reqId,
        audio: base64data,
        format: 'wav',
        sample_rate: 16000
      }));
      
      // 标记我们在等待 PTT 结果
      this.waitingForPttResult = true;
    };
  },

  // 5. 音频格式转换工具 (必须包含)
  async convertBlobToWav(blob, targetSampleRate = 16000) {
    const arrayBuffer = await blob.arrayBuffer();
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    // 离线重采样
    const offlineCtx = new OfflineAudioContext(1, audioBuffer.duration * targetSampleRate, targetSampleRate);
    const source = offlineCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(offlineCtx.destination);
    source.start();
    
    const renderedBuffer = await offlineCtx.startRendering();
    
    return this.bufferToWav(renderedBuffer);
  },

  // 6. Buffer 转 WAV 封装 (必须包含)
  bufferToWav(abuffer) {
    const numOfChan = abuffer.numberOfChannels;
    const length = abuffer.length * numOfChan * 2 + 44;
    const buffer = new ArrayBuffer(length);
    const view = new DataView(buffer);
    const channels = [];
    let i, sample, offset = 0, pos = 0;

    // 写入 WAV 头
    setUint32(0x46464952); // "RIFF"
    setUint32(length - 8); // file length - 8
    setUint32(0x45564157); // "WAVE"
    setUint32(0x20746d66); // "fmt " chunk
    setUint32(16); // length = 16
    setUint16(1); // PCM (uncompressed)
    setUint16(numOfChan);
    setUint32(abuffer.sampleRate);
    setUint32(abuffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
    setUint16(numOfChan * 2); // block-align
    setUint16(16); // 16-bit

    setUint32(0x61746164); // "data" - chunk
    setUint32(length - pos - 4); // chunk length

    for (i = 0; i < abuffer.numberOfChannels; i++)
      channels.push(abuffer.getChannelData(i));

    while (pos < abuffer.length) {
      for (i = 0; i < numOfChan; i++) {
        sample = Math.max(-1, Math.min(1, channels[i][pos]));
        sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
        view.setInt16(44 + offset, sample, true);
        offset += 2;
      }
      pos++;
    }

    function setUint16(data) { view.setUint16(pos, data, true); pos += 2; }
    function setUint32(data) { view.setUint32(pos, data, true); pos += 4; } // 注意这里修正了 pos+=4

    return new Blob([buffer], { type: 'audio/wav' });
  },


    // WAV转换函数保持不变
    async audioToWav(audioData) {
      try {
        // 音频参数配置
        const sampleRate = 16000; // 采样率 16kHz，适合语音识别
        const numChannels = 1;    // 单声道
        const bitsPerSample = 16; // 16位采样深度
        
        // 将Float32Array转换为Int16Array (16位PCM)
        const int16Array = new Int16Array(audioData.length);
        for (let i = 0; i < audioData.length; i++) {
          // 将[-1.0, 1.0]范围的浮点数转换为[-32768, 32767]范围的整数
          const sample = Math.max(-1, Math.min(1, audioData[i])); // 限制范围
          int16Array[i] = sample < 0 ? sample * 32768 : sample * 32767;
        }
        
        // 计算文件大小
        const byteLength = int16Array.length * 2; // 每个样本2字节
        const buffer = new ArrayBuffer(44 + byteLength); // WAV头部44字节 + 音频数据
        const view = new DataView(buffer);
        
        // 写入WAV文件头
        const writeString = (offset, string) => {
          for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
          }
        };
        
        // RIFF chunk descriptor
        writeString(0, 'RIFF');
        view.setUint32(4, 36 + byteLength, true); // 文件大小-8
        writeString(8, 'WAVE');
        
        // fmt sub-chunk
        writeString(12, 'fmt ');
        view.setUint32(16, 16, true); // fmt chunk大小
        view.setUint16(20, 1, true);  // 音频格式 (PCM)
        view.setUint16(22, numChannels, true); // 声道数
        view.setUint32(24, sampleRate, true);  // 采样率
        view.setUint32(28, sampleRate * numChannels * bitsPerSample / 8, true); // 字节率
        view.setUint16(32, numChannels * bitsPerSample / 8, true); // 块对齐
        view.setUint16(34, bitsPerSample, true); // 位深度
        
        // data sub-chunk
        writeString(36, 'data');
        view.setUint32(40, byteLength, true); // 数据大小
        
        // 写入音频数据
        const offset = 44;
        for (let i = 0; i < int16Array.length; i++) {
          view.setInt16(offset + i * 2, int16Array[i], true);
        }
        
        // 创建Blob并返回File对象
        const blob = new Blob([buffer], { type: 'audio/wav' });
        const file = new File([blob], 'audio.wav', { type: 'audio/wav' });
        
        return file;
        
      } catch (error) {
        console.error('Audio conversion error:', error);
        throw new Error('Failed to convert audio to WAV format');
      }
    },

    // 自动判断下载源的工具函数
    async getAutoSource() {
      try {
        // 1. 检查时区
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const isMainlandChinaTimezone = [
          'Asia/Shanghai', 
          'Asia/Chongqing', 
          'Asia/Harbin', 
          'Asia/Urumqi'
        ].includes(timezone);

        // 2. 检查语言
        const isChineseLanguage = navigator.language.startsWith('zh');

        if (isMainlandChinaTimezone || isChineseLanguage) {
          return 'modelscope';
        }
      } catch (e) {
        console.error('Failed to detect locale', e);
      }
      return 'huggingface'; // 默认源
    },

    async changeTTSstatus() {
      if (!this.ttsSettings.enabled) {
        this.TTSrunning = false;
      }
      if (this.ttsSettings.enabled === true && this.settings.enableOmniTTS === true) {
        this.settings.enableOmniTTS = false;
        showNotification(this.t('autoDisableOmniControlSettings'), 'warning');
      }else if (this.ttsSettings.enabled === true && this.ttsSettings.engine === 'moss'){
        if (!this.mossModelExists){
          showNotification(this.t('autoDownloadModel'), 'info');
          this.ttsSettings.enabled = false;
          let source = await this.getAutoSource();
          await this.mossDownload(source);
        }
      }
      await this.autoSaveSettings();
    },



/**
 * 流式 Markdown 状态机解析器
 * 过滤代码块、行内代码、表格、数学公式，并提取链接文本，拦截未闭合的流片段
 * @param {Object} message 当前消息对象，用于挂载临时状态
 * @param {string} deltaText 这一轮流式接收到的文本增量
 * @param {boolean} isFinal 是否为最后一个数据块（流结束标志）
 * @returns {string} 过滤处理后的、可直接用于 TTS 的文本
 */
processMarkdownStreamForTTS(message, deltaText, isFinal = false) {
    // 初始化状态机上下文（保存在 message 内部，防止多轮对话冲突）
    if (!message._ttsState) {
        message._ttsState = {
            inCodeBlock: false,
            inInlineCode: false,
            inTable: false,
            inMath: false,
            buffer: '' // 积压缓冲区，暂存未闭合的语法片段
        };
    }

    const state = message._ttsState;
    let textToProcess = state.buffer + deltaText;
    let readableText = '';
    let i = 0;

    while (i < textToProcess.length) {
        // 1. 拦截代码块 (```)
        if (textToProcess.substring(i, i + 3) === '```') {
            state.inCodeBlock = !state.inCodeBlock;
            i += 3;
            continue;
        }
        if (state.inCodeBlock) {
            i++;
            continue;
        }

        // 2. 拦截行内代码 (`) — 保留内容，仅移除标记符号
        if (textToProcess[i] === '`') {
            // 不跳过内容：对于 TTS 来说，`code` 里的文字也应该朗读
            i++;
            continue;
        }

        // 3. 拦截 LaTeX 数学公式 ($$ 或 $)
        if (textToProcess.substring(i, i + 2) === '$$') {
            state.inMath = !state.inMath;
            i += 2;
            continue;
        }
        if (state.inMath) {
            i++;
            continue;
        }

        // 4. 拦截 Markdown 表格 (| ... |)
        // 如果一行以 '|' 开头，则判定其为表格行，跳过整行
        if ((i === 0 || textToProcess[i - 1] === '\n') && textToProcess[i] === '|') {
            state.inTable = true;
        }
        if (state.inTable) {
            if (textToProcess[i] === '\n') {
                state.inTable = false;
                readableText += ' '; // 用空格/换行替代，作为朗读时的自然停顿
            }
            i++;
            continue;
        }

        // 5. 阻断未闭合的图片 ![alt](url) 和链接 [text](url) 语法
        if (textToProcess[i] === '[' || (textToProcess[i] === '!' && textToProcess[i + 1] === '[')) {
            const remaining = textToProcess.slice(i);
            // 匹配完整的 [显示文字](链接URL) 结构
            const match = remaining.match(/^(!?\[([^\]]*)\]\(([^)]*)\))/);
            if (match) {
                const completeMatch = match[1];
                const linkText = match[2];
                if (!completeMatch.startsWith('!')) {
                    // 仅提取链接的显示文本（如果是图片 ! 标记，则不转译为可读文本，直接滤掉）
                    readableText += linkText;
                }
                i += completeMatch.length;
                continue;
            } else {
                // 如果检测到 `[` 或 `![` 开头，但这一轮的流尚未收到闭合的 `)`
                // 且流还没结束，则阻断后续字符处理，将其留入 buffer 供下一次增量拼接
                if (!isFinal) {
                    break;
                }
            }
        }

        // 6. 普通字符提取
        readableText += textToProcess[i];
        i++;
    }

    // 将未处理完毕的残留文本留入缓冲区
    state.buffer = textToProcess.slice(i);
    return readableText;
},

/**
     * 按分隔符 + <voice> 标签 拆分 buffer (终极防漏、防换行抖动、完美兼容中文音色版)
     * @returns {
     *   chunks: string[]        // 纯文本块（已去标签、已清理）
     *   chunks_voice: string[]  // 与 chunks 一一对应的声音 key
     *   remaining: string       // 未完结文本
     *   remaining_voice: string // remaining 对应的 voice key
     * }
     */
    splitTTSBuffer(buffer) {
        // ============================================================
        // 🌟 核心优化 1：一进来就以最优先级、最彻底地干掉所有的 Markdown 图片
        // 使用 [\s\S] 替代 . ，防止流式文本中因换行符或特殊格式导致正则匹配失败而残留图片 alt 文本
        // 这一步运行后，无论是在 <silence> 内部还是外部，"开心" 等 alt 文本都将直接被安全抹除
        // ============================================================
        buffer = buffer.replace(/!\[[\s\S]*?\]\([\s\S]*?\)/g, '');

        // 1. 初始化栈和允许的音色列表
        if (!this.voiceStack) this.voiceStack = ['default'];
        const voiceKeys = ['default', 'silence', ...Object.keys(this.ttsSettings.newtts || {})].filter(Boolean);

        // ============================================================
        // 🌟 核心优化 2：意外情况防噪兜底
        // ============================================================
        
        // A. 自动识别未隔离的网页链接/原始 URL，将其无缝包裹在 <silence> 标签中
        buffer = buffer.replace(/(<silence>[\s\S]*?<\/silence>)|(https?:\/\/[^\s]+?(?=[,.:;!?。，：；？！]*?(?:\s|$)))/gi, (match, silence, url) => {
            if (silence) return silence; 
            return `<silence>${url}</silence>`;
        });

        // 2. 基础清理逻辑 (此时图片已被彻底过滤，在此处安全清理常规超链接，支持多行 [文本](url))
        buffer = buffer
            .replace(/#{1,6}\s/gm, '')
            .replace(/[*~`]+/g, '')
            .replace(/^\s*[-*]\s/gm, '')
            .replace(/[\u{2600}-\u{27BF}\u{2700}-\u{27BF}\u{1F300}-\u{1F9FF}]/gu, '')
            .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '')
            .replace(/\[([\s\S]*?)\]\([\s\S]*?\)/g, '$1'); // 仅提取文本链接的展示文字

        if (!buffer) {
            return {
                chunks: [],
                chunks_voice: [],
                remaining: '',
                remaining_voice: this.voiceStack[this.voiceStack.length - 1]
            };
        }

        // 2. 构造正则 (保持原有逻辑不变)
        const separators = (this.ttsSettings.separators || [])
            .map(s => s.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\r/g, '\r'));

        const openTagRe = new RegExp(`<(${voiceKeys.join('|')})>`, 'gi');
        
        // 🔴 核心修复点 2：将原来仅支持英文匹配的 /<\/\w+>/gi 改为支持中文字符的匹配正则
        // 确保中文字符的闭合标签（如 </星莱>、</旁白>）能正常触发出栈，防止音色发生堆叠混乱
        const closeTagRe = /<\/[a-zA-Z0-9_\u4e00-\u9fa5]+>/gi; 
        
        const sepRe = separators.length
            ? new RegExp(separators.map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g')
            : /$^/;

        // 3. 扫描所有标记并排序
        const tokens = [];
        let m;
        openTagRe.lastIndex = 0;
        while ((m = openTagRe.exec(buffer)) !== null) tokens.push({ type: 'open', value: m[1], index: m.index, raw: m[0] });

        closeTagRe.lastIndex = 0;
        while ((m = closeTagRe.exec(buffer)) !== null) tokens.push({ type: 'close', value: m[0], index: m.index, raw: m[0] });

        sepRe.lastIndex = 0;
        while ((m = sepRe.exec(buffer)) !== null) tokens.push({ type: 'sep', value: m[0], index: m.index, raw: m[0] });

        tokens.sort((a, b) => a.index - b.index);

        // 4. 遍历处理
        const chunks = [];
        const chunks_voice = [];
        let segmentStart = 0;

        const emitText = (endIdx) => {
            const text = buffer.slice(segmentStart, endIdx);
            const cleaned = text.replace(/\s+/g, ' ').trim();
            if (cleaned && !/^[\s\p{P}]*$/u.test(cleaned)) {
                chunks.push(cleaned);
                chunks_voice.push(this.voiceStack[this.voiceStack.length - 1]);
            }
        };

        for (const tok of tokens) {
            switch (tok.type) {
                case 'open':
                    emitText(tok.index);
                    this.voiceStack.push(tok.value); // 压入新音色
                    segmentStart = tok.index + tok.raw.length;
                    break;
                case 'close':
                    emitText(tok.index);
                    if (this.voiceStack.length > 1) {
                        this.voiceStack.pop(); // 弹出当前音色，回到上一层
                    }
                    segmentStart = tok.index + tok.raw.length;
                    break;
                case 'sep':
                    emitText(tok.index);
                    segmentStart = tok.index + tok.raw.length;
                    break;
            }
        }

        // 5. 剩余文本
        const remaining = buffer.slice(segmentStart);
        const remaining_voice = this.voiceStack[this.voiceStack.length - 1];

        return { chunks, chunks_voice, remaining, remaining_voice };
    },

    // TTS处理进程 - 使用流式响应
    // 修改 TTS 处理开始时的通知
    async startTTSProcess(message) {
      if (!this.ttsSettings.enabled || message.audioAborted) return;
      message._ttsRunning = true;
      this.TTSrunning = true;
      this.cur_audioDatas = [];
      
      // 使用传入的消息对象
      const lastMessage = message; 

      this.sendTTSStatusToVRM('ttsStarted', {
        totalChunks: lastMessage.ttsChunks.length
      });
      
      lastMessage.audioChunks = lastMessage.audioChunks || [];
      lastMessage.ttsQueue = lastMessage.ttsQueue || new Set();
      
      let max_concurrency = 1;
      let nextIndex = 0;
      while (message._ttsRunning && !message.audioAborted) {
        if (nextIndex == 0){
          let remainingText = lastMessage.ttsChunks?.[0] || '';
          let newttsList = [];
          if (remainingText && this.ttsSettings.newtts){
            for (const key in this.ttsSettings.newtts) {
              if (this.ttsSettings.newtts[key].enabled) {
                newttsList.push(key);
              }
            }
          }
          
          if (remainingText && this.ttsSettings.bufferWordList.length > 0  && newttsList == []){
            for (const exp of this.expressionMap) {
              const regex = new RegExp(exp, 'g');
              if (remainingText.includes(exp)) {
                remainingText = remainingText.replace(regex, '').trim(); 
              }
            }
            remainingText = remainingText.replace(/<[^>]+>/g, '');
            const hasChinese = /[\u4e00-\u9fa5]/.test(remainingText);

            if ((hasChinese && remainingText?.length > 5) || 
                (!hasChinese && remainingText?.length > 10)) {
                if (this.ttsSettings.bufferWordList.length > 0) {
                    const bufferWord = this.ttsSettings.bufferWordList[
                        Math.floor(Math.random() * this.ttsSettings.bufferWordList.length)
                    ];
                    lastMessage.ttsChunks.unshift(bufferWord);
                }
            }
          }
        }

        max_concurrency = this.ttsSettings.maxConcurrency || 1; 
        while (lastMessage.ttsQueue.size < max_concurrency && 
              nextIndex < lastMessage.ttsChunks.length) {
          if (!message._ttsRunning || message.audioAborted) break;
          const index = nextIndex++;
          lastMessage.ttsQueue.add(index);
          
          this.processTTSChunk(lastMessage, index).finally(() => {
            lastMessage.ttsQueue.delete(index);
          });
          if (index == 0){
            this.stopTimer();
            console.log(`TTS chunk 0 start in ${this.elapsedTime}ms`);
            await new Promise(resolve => setTimeout(resolve, 800));
          }
        }
        
        if (lastMessage.generationFinished && 
            nextIndex >= lastMessage.ttsChunks.length && 
            lastMessage.ttsQueue.size === 0) {
            break; // 所有文本已下发，所有音频块已请求完毕，当前消息的 TTS 进程完美完成并安全退出
        }

        await new Promise(resolve => setTimeout(resolve, 10));
      }
      message._ttsRunning = false;
      // this.messages[this.messages.length - 1].currentChunk = 0;
      console.log('TTS queue processing completed');
    },
    startTimer() {
      this.startTime = Date.now();
    },
    stopTimer() {
      this.elapsedTime = Date.now() - this.startTime;
    },
    async processTTSChunk(message, index) {
        if (message.audioAborted) return;
        let voice = message.chunks_voice[index];
        const chunk = message.ttsChunks[index];
        
        // 解析标记
        const isVrmSilent = voice.startsWith('danmaku_vrm_silent:');
        if (isVrmSilent) {
            voice = voice.replace('danmaku_vrm_silent:', ''); // 恢复成真实音色 ID
        }

        let chunk_text = chunk;
        let chunk_expressions = [];

        if (chunk.indexOf('<') !== -1) {
            const tagReg = /<[^>]+>/g;
            chunk_expressions = (chunk.match(tagReg) || []).map(t => t.slice(1, -1));
            chunk_text = chunk.replace(tagReg, '').trim();
        }

        const offset = message.chunks_voice.filter(v => v.startsWith('danmaku_vrm_silent:')).length;
        const vrmIndex = index - offset; // 计算发给 VRM 的虚拟索引

        try {
            if (voice === 'silence') {
                // 静音块走文本通道发指令
                const cmd = JSON.stringify({
                    type: 'startSpeaking',
                    data: { chunkIndex: index, text: chunk_text, voice: 'silence', expressions: chunk_expressions }
                });
                if (this.ttsWebSocket && (this.vrmOnline || this.vtsOnline)) this.ttsWebSocket.send(cmd);
                message.audioChunks[index] = { url: null, expressions: chunk_expressions, text: chunk_text, index };
                this.checkAudioPlayback();
            } else {
                const response = await fetch(`/tts`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ttsSettings: this.ttsSettings, text: chunk_text, index, voice })
                });

                if (response.ok) {
                    await this._streamTTSResponse(response, message, index, chunk_expressions, chunk_text, vrmIndex, isVrmSilent);
                    this.checkAudioPlayback();
                }
            }
        } catch (error) {
            console.error(`TTS Chunk ${index} error:`, error);
        }
    },

    async _streamTTSResponse(response, message, index, chunk_expressions, chunk_text, vrmIndex, isVrmSilent) {
        const mimeType = response.headers.get('content-type') || 'audio/mpeg';

        if (typeof MediaSource === 'undefined' || !MediaSource.isTypeSupported(mimeType)) {
            const audioBlob = await response.blob();
            const audioUrl = URL.createObjectURL(audioBlob);
            const audioBuffer = await audioBlob.arrayBuffer();
            message.audioChunks[index] = { url: audioUrl, buffer: audioBuffer, mimeType, expressions: chunk_expressions, text: chunk_text, index };
            return { url: audioUrl, buffer: audioBuffer, mimeType };
        }

        const ms = new MediaSource();
        const audioUrl = URL.createObjectURL(ms);
        const allChunks = [];
        const pendingChunks = [];
        let sourceBuffer = null;
        let streamDone = false;

        const flushQueue = () => {
            if (!sourceBuffer || sourceBuffer.updating) return;
            if (pendingChunks.length > 0) {
                try { 
                    // 每次只送入一个音频块，剩余的等待底层的 updateend 事件自动触发
                    sourceBuffer.appendBuffer(pendingChunks.shift()); 
                } catch (e) { 
                    console.error('appendBuffer failed:', e); 
                }
            } else if (streamDone) {
                try { ms.endOfStream(); } catch (e) {}
            }
        };

        const reader = response.body.getReader();
        const ctx = this;

        // 创建唯一的播放 Audio 元素 —— 这会触发 MediaSource 的 sourceopen
        const audio = new Audio(audioUrl);
        audio.preload = 'auto';
        const audioReady = new Promise((resolve) => {
            const onReady = () => {
                try {
                    sourceBuffer = ms.addSourceBuffer(mimeType);
                    sourceBuffer.addEventListener('updateend', flushQueue);
                    resolve();
                } catch (e) {
                    sourceBuffer = null;
                    resolve();
                }
            };
            if (ms.readyState === 'open') { onReady(); }
            else { ms.addEventListener('sourceopen', onReady, { once: true }); }
        });

        // 等待 SourceBuffer 就绪
        try {
            await Promise.race([
                audioReady,
                new Promise((_, reject) => setTimeout(() => reject(new Error('sb_timeout')), 30000))
            ]);
        } catch (e) {
            console.warn('MediaSource setup failed, falling back to blob:', e);
            try { await reader.cancel(); } catch (e2) {}
            const audioBlob = await response.blob();
            const audioUrl2 = URL.createObjectURL(audioBlob);
            const audioBuffer = await audioBlob.arrayBuffer();
            message.audioChunks[index] = { url: audioUrl2, buffer: audioBuffer, mimeType, expressions: chunk_expressions, text: chunk_text, index };
            return { url: audioUrl2, buffer: audioBuffer, mimeType };
        }

        // 同步读取首个音频块并填入 SourceBuffer，确保 play() 时有数据可播
        try {
            const first = await Promise.race([
                reader.read(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('read_timeout')), 8000))
            ]);
            if (first && !first.done && first.value && first.value.length > 0) {
                allChunks.push(first.value);
                if (sourceBuffer && !sourceBuffer.updating) {
                    sourceBuffer.appendBuffer(first.value);
                    await new Promise((resolve) => {
                        sourceBuffer.addEventListener('updateend', () => resolve(), { once: true });
                        setTimeout(() => resolve(), 30000);
                    });
                }
            }
        } catch (e) {
            console.warn('First chunk read failed:', e);
        }

        // 存入条目（含预创建的 Audio 元素）
        message.audioChunks[index] = {
            url: audioUrl,
            buffer: null,
            mimeType,
            expressions: chunk_expressions,
            text: chunk_text,
            index,
            _streaming: true,
            _audio: audio
        };

        // 后台读取剩余数据
        (async () => {
            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) { 
                        streamDone = true; 
                        flushQueue(); 
                        break; 
                    }
                    allChunks.push(value);
                    pendingChunks.push(value);
                    flushQueue();
                }
                // 等待队列中的音频全部被底层解码器消化完毕
                while (sourceBuffer && (sourceBuffer.updating || pendingChunks.length > 0)) {
                    await new Promise(r => setTimeout(r, 50));
                }
            } catch (e) {
                console.error("Stream reader error:", e);
            }

            const totalLength = allChunks.reduce((sum, c) => sum + c.length, 0);
            const completeBuffer = new Uint8Array(totalLength);
            let offset = 0;
            for (const chunk of allChunks) {
                completeBuffer.set(chunk, offset);
                offset += chunk.length;
            }

            const audioChunk = message.audioChunks[index];
            if (audioChunk) {
                audioChunk.buffer = completeBuffer.buffer;
                audioChunk._streaming = false;
                if (!isVrmSilent && vrmIndex >= 0 && (ctx.vrmOnline || ctx.vtsOnline) && ctx.ttsWebSocket) {
                    ctx.sendBinaryToVRM({
                        type: 'audio_chunk',
                        chunkIndex: vrmIndex,
                        text: chunk_text,
                        expressions: chunk_expressions,
                        mimeType
                    }, completeBuffer.buffer);
                }
            }
        })();

        return { url: audioUrl, buffer: null, mimeType, _streaming: true };
    },

    // 音频播放进程
    async startAudioPlayProcess(message, resolve) {
      if (!this.ttsSettings.enabled) {
          if(resolve) resolve();
          return;
      }
      
      const lastMessage = message;
      lastMessage.currentChunk = lastMessage.currentChunk || 0;
      lastMessage.isPlaying = false;
      lastMessage.audioAborted = false; // --- 核心修复 5：新队列启动时重置中断标记 ---
      
      this.audioPlayQueue = [];
      console.log('Audio playback monitor started for:', message.agentName);
      
      // 启动递归检查
      this.checkAudioPlayback(message, resolve);
    },

    async checkAudioPlayback(message, resolve) {
       // --- 核心修复 3：检查是否被打断，如果打断则直接终止递归 ---
        if (!message || message.audioAborted) { 
            if (message) message.isPlaying = false;
            if (resolve) resolve(); 
            return; 
        }
        
        const lastMessage = message;

        if (lastMessage.isPlaying) {
            setTimeout(() => this.checkAudioPlayback(message, resolve), 50);
            return;
        }

        const currentIndex = lastMessage.currentChunk;
        const audioChunk = lastMessage.audioChunks[currentIndex];
        
        // 如果该块还没合成好，继续等待
        if (!audioChunk) {
            // 如果所有已有的 chunk 都播完了
            const allLocalChunksPlayed = currentIndex >= (lastMessage.ttsChunks?.length || 0);
            
            if (allLocalChunksPlayed) {
                // 判断当前正在播放的消息，是不是对话列表里的最后一条最新消息
                const isLatestMessage = this.messages.length > 0 && 
                                      this.messages[this.messages.length - 1] === lastMessage;

                if (lastMessage.generationFinished) {
                    console.log("播放全部完成，正常退出");
                    // --- 核心修复 2：只有自己是最新消息时，才去关闭全局 TTS 开关 ---
                    if (isLatestMessage) {
                        this.TTSrunning = false; 
                    }
                    lastMessage._ttsRunning = false;
                    try { fetch('/api/overlay/danmaku/clear', { method: 'POST' }).catch(()=>{}); } catch(e){}
                    if (resolve) resolve();
                    return;
                } else {
                    if (!this.isSending) { 
                        console.warn("检测到生成已停止但未标记完成，强行释放锁");
                        lastMessage.generationFinished = true; 
                        
                        // --- 同上，加一层保护 ---
                        if (isLatestMessage) {
                            this.TTSrunning = false; 
                        }
                        lastMessage._ttsRunning = false;
                        try { fetch('/api/overlay/danmaku/clear', { method: 'POST' }).catch(()=>{}); } catch(e){}
                        if (resolve) resolve();
                        return;
                    }
                    setTimeout(() => this.checkAudioPlayback(message, resolve), 50);
                    return;
                }
            }
            setTimeout(() => this.checkAudioPlayback(message, resolve), 50);
            return;
        }

        const rawVoice = lastMessage.chunks_voice[currentIndex] || '';
        const isVrmSilent = rawVoice.startsWith('danmaku_vrm_silent:');
        const actualVoice = isVrmSilent ? rawVoice.replace('danmaku_vrm_silent:', '') : rawVoice;
        
        // 计算偏移
        const offset = lastMessage.chunks_voice.filter(v => v.startsWith('danmaku_vrm_silent:')).length;
        const vrmIndex = currentIndex - offset;

        if (!lastMessage.isPlaying) {
            lastMessage.isPlaying = true;
            if (currentIndex == 0){
              this.stopTimer();
              lastMessage.first_sentence_latency = this.elapsedTime;
            }

            try {

                if (!audioChunk.buffer && audioChunk.url && !audioChunk._streaming) {
                    try {
                        const res = await fetch(audioChunk.url);
                        audioChunk.buffer = await res.arrayBuffer();
                        if (!audioChunk.mimeType) {
                            audioChunk.mimeType = res.headers.get('content-type') || 'audio/wav';
                        }
                    } catch (err) {
                        console.warn("Failed to fetch buffer for history audio", err);
                    }
                }

                // --- 核心同步修改点：只有非弹幕块且 VRM 在线时，才在此刻发送二进制数据 ---
                if (!isVrmSilent && vrmIndex >= 0 && (this.vrmOnline || this.vtsOnline) && audioChunk.buffer) {
                    const metadata = {
                        type: 'audio_chunk',
                        chunkIndex: vrmIndex,
                        text: audioChunk.text,
                        expressions: audioChunk.expressions,
                        mimeType: audioChunk.mimeType
                    };

                    console.log(`Sending audio chunk ${currentIndex} to VRM with metadata:`, metadata);
                    // 此时发送，VRM 插件会立刻开始播放，与浏览器端的“静音播放”逻辑完美同步
                    this.sendBinaryToVRM(metadata, audioChunk.buffer);
                }

                lastMessage._currentAudio = audioChunk._audio || new Audio(audioChunk.url);
                
                if (isVrmSilent) {
                    lastMessage._currentAudio.volume = 1.0; // 弹幕声音从浏览器出
                    console.log("正在播放弹幕:", audioChunk.text);
                } else {
                    lastMessage._currentAudio.volume = this.vrmOnline ? 0.0000001 : 1.0; // AI声音从VRM出
                }
                
                // 发送指令通知 VRM 更新状态（UI显示、表情等）
                if (!isVrmSilent && vrmIndex >= 0) {
                    this.sendTTSStatusToVRM('startSpeaking', {
                        chunkIndex: vrmIndex,
                        totalChunks: lastMessage.ttsChunks.length - offset,
                        text: audioChunk.text,
                        expressions: audioChunk.expressions,
                        voice: actualVoice
                    });
                }
                
                // 等待当前这段音频播完
                await new Promise((r) => {
                    lastMessage._currentAudio.onended = r;
                    lastMessage._currentAudio.onerror = r; 
                    lastMessage._currentAudio.play().catch(e => {
                        console.error("播放失败", e);
                        r(); 
                    });
                    setTimeout(r, 20000); 
                });
                
            } catch (error) {
                console.error(`Playback error: ${error}`);
            } finally {
                lastMessage.isPlaying = false;
                
                // --- 核心修复 4：音频结束后再次检查是否被手动打断/切歌 ---
                if (lastMessage.audioAborted) {
                    if (resolve) resolve();
                    return; // 彻底终止该消息的播放队列，不要再 setTimeout 了！
                }
                
                lastMessage.currentChunk++;
                // 只有当前音频彻底 onended 之后，才会递归触发下一条
                setTimeout(() => this.checkAudioPlayback(message, resolve), 0);
            }
        }
    },
    // 修改轮询函数
    pollVRMStatus() {
      this.vrmPollTimer = setInterval(async () => {
        try {
          const r = await fetch('/tts/status').then(r => r.json())
          this.vrmOnline = r.vrm_connections > 0;
          this.vtsOnline = r.vts_active; // 获取 VTS 是否激活
        } catch (e) {
          this.vrmOnline = false;
          this.vtsOnline = false;
        }
      }, 3000)
    },
    // 停止音频播放（用于停止生成时）
    stopAudioPlayback() {
      // 这里可以添加停止当前播放音频的逻辑
      const lastMessage = this.messages[this.messages.length - 1];
      if (lastMessage) {
        lastMessage.isPlaying = false;
      }
    },
    toggleTTS(message) {
      if (message.isPlaying) {
        // 如果正在播放，点击则停止
        message.isPlaying = false;
        this.stopAllAudioPlayback();
        this.sendTTSStatusToVRM('stopSpeaking', {});
      } else {
        // 如果未在播放
        this.stopAllAudioPlayback();
        
        if (message.isOmni) {
          // --- Omni 逻辑保持不变 ---
          if ((message.omniCurrentTime || 0) >= (message.omniDuration || 0) - 0.1) {
            message.omniCurrentTime = 0; 
          }
          message.isPlaying = true;
          this.playOmniFromTime(message, message.omniCurrentTime);
        } else {
          // --- 普通 TTS 逻辑：统一复用流式播放函数 ---
          message.isPlaying = false; 
          message.audioAborted = false; // --- 核心修复 6：用户手动恢复播放时，重置中断标记 ---
          
          // 如果想让用户暂停后从头播，保留这行：
          message.currentChunk = 0;  
          
          message.generationFinished = true; 
          this.checkAudioPlayback(message);
        }
      }
    },
    // 进度条跳转
    seekOmniTTS(message, time) {
      this.stopAllAudioPlayback();
      message.omniCurrentTime = time;
      if (message.isPlaying || true) { // 跳转后通常直接播放
        message.isPlaying = true;
        this.playOmniFromTime(message, time);
      }
    },

    // 核心回放逻辑
    async playOmniFromTime(message, startTime = 0) {
      if (!message.omniAudioChunks || message.omniAudioChunks.length === 0) return;
      
      if (this.audioCtx.state === 'suspended') await this.audioCtx.resume();
      
      // 每次开始新播放时，将排程起点设为当前时间
      this.audioStartTime = this.audioCtx.currentTime;

      let accumulated = 0;
      for (const b64 of message.omniAudioChunks) {
        // 如果中途用户点了暂停，跳出循环不再排程
        if (!message.isPlaying) break;

        const chunkDuration = (atob(b64).length / 2) / 24000;
        
        // 只播放从 startTime 开始之后的块
        if (accumulated + chunkDuration > startTime) {
          this.playPCMChunk(b64, message.pure_content, message);
        }
        accumulated += chunkDuration;
      }
    },

    // 停止所有正在播放的音频
    stopAllAudioPlayback() {
      // --- 核心修复 1：给所有消息打上"终止循环"的标记 ---
      this.messages.forEach(message => {
        message.audioAborted = true; 
        message.isPlaying = false;
        // 快速淡出并停止每一条消息正在播放的音频
        if (message._currentAudio && typeof message._currentAudio.pause === 'function' && !message._currentAudio.paused) {
          const audio = message._currentAudio;
          const fadeSteps = 5;
          const fadeInterval = 30;
          let step = 0;
          const origVolume = audio.volume;
          const fadeOut = setInterval(() => {
            step++;
            audio.volume = Math.max(0, origVolume * (1 - step / fadeSteps));
            if (step >= fadeSteps) {
              clearInterval(fadeOut);
              audio.pause();
              audio.volume = origVolume;
              if (typeof audio.onended === 'function') {
                audio.onended(); 
              }
            }
          }, fadeInterval);
        }
        message._currentAudio = null;
      });

      // 2. 停止阅读音频
      if (this.currentReadAudio) {
        this.currentReadAudio.pause();
        if (typeof this.currentReadAudio.onended === 'function') {
          this.currentReadAudio.onended();
        }
        this.currentReadAudio = null;
      }
      
      // 3. 【核心修复】停止所有 Web Audio API 的 Omni 节点
      if (this.activeSources && this.activeSources.length > 0) {
        this.activeSources.forEach(src => {
          src.isForceStopped = true; 
          try {
            src.stop(); // 立即停止播放
          } catch (e) {}
        });
        this.activeSources = [];
      }
      
      this.isOmniPlaying = false; 
      this.audioStartTime = 0; 

      // 6. 发送停止信号到VRM
      this.sendTTSStatusToVRM('stopSpeaking', {});
    },

    async playAudioChunk(message) {
      if (!this.ttsSettings.enabled){
        message.isPlaying = false; // 如果没有音频块，停止播放
        message.currentChunk = 0; // 重置索引
        return;
      }

      // 初始化 cur_audioDatas 对象（如果不存在）
      if (!this.cur_audioDatas) {
        this.cur_audioDatas = {};
      }

      // 为每个消息创建唯一的键，使用消息ID
      const base64Key = `msg_${message.id}_chunk_${message.currentChunk}`;

      const audioChunk = message.audioChunks[message.currentChunk];
      if (audioChunk) {
        // 检查是否有音频URL可以播放
        if (!audioChunk.url) {
          console.log(`Audio chunk ${message.currentChunk} has no URL, skipping`);
          message.currentChunk++;
          this.playAudioChunk(message);
          return;
        }

        const audio = new Audio(audioChunk.url);
        message._currentAudio = audio;

        // 设置音量：VRM在线时静音，让VRM播放；不在线时正常播放
        audio.volume = this.vrmOnline ? 0.0000001 : 1;

        // 如果没有base64数据，尝试从blob URL生成
        if (!this.cur_audioDatas[base64Key] && audioChunk.url) {
          try {
            const response = await fetch(audioChunk.url);
            const blob = await response.blob();
            const base64 = await new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result.split(',')[1]);
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            });
            this.cur_audioDatas[base64Key] = `data:${blob.type};base64,${base64}`;
            console.log(`Generated base64 for ${base64Key}, length: ${this.cur_audioDatas[base64Key].length}`);
          } catch (error) {
            console.warn(`Failed to generate base64 for ${base64Key}:`, error);
            this.cur_audioDatas[base64Key] = '';
          }
        }

        // 发送 startSpeaking 状态到 VRM（每个块都需要发送）
        // 确保有base64数据才发送startSpeaking
        const audioDataUrl = this.cur_audioDatas[base64Key];
        if (audioDataUrl && audioDataUrl.length > 0) {
          console.log(`Sending startSpeaking with base64 data for ${base64Key}`);
          this.sendTTSStatusToVRM('startSpeaking', {
            audioDataUrl: audioDataUrl,
            chunkIndex: message.currentChunk,
            totalChunks: message.audioChunks.length,
            text: audioChunk.text || '',
            expressions: audioChunk.expressions || [],
            voice: message.chunks_voice ? message.chunks_voice[message.currentChunk] || 'default' : 'default',
          });
        } else {
          console.warn(`No base64 data available for ${base64Key}, skipping startSpeaking`);
        }

        try {
          await audio.play();
          audio.onended = () => {
            // 发送 chunkEnded 状态到 VRM
            this.sendTTSStatusToVRM('chunkEnded', {
              chunkIndex: message.currentChunk
            });

            message.currentChunk++; // 播放结束后，索引加一
            this.playAudioChunk(message); // 递归调用播放下一个音频块
          };
          audio.onerror = (error) => {
            console.error(`Error playing audio chunk ${message.currentChunk}:`, error);
            message.isPlaying = false; // 出错时停止播放
          };
        } catch (error) {
          console.error(`Error playing audio chunk ${message.currentChunk}:`, error);
          message.currentChunk++; // 播放结束后，索引加一
          this.playAudioChunk(message); // 递归调用播放下一个音频块
        }
      } else {
        message.isPlaying = false; // 如果没有音频块，停止播放
        message.currentChunk = 0; // 重置索引
        // 发送所有块播放完成状态到 VRM
        this.sendTTSStatusToVRM('allChunksCompleted', {});
      }
    },
    backwardTTS(message) {
      if (message.currentChunk > 0) {
        message.currentChunk--; // 当前索引减一
      }
    },

    forwardTTS(message) {
      if (message.currentChunk < message.audioChunks.length - 1) {
        message.currentChunk++; // 当前索引加一
      }
    },

    updateLanguages() {
      // 更新 ttsSettings 中的语言
      this.ttsSettings.edgettsLanguage = this.edgettsLanguage;
      
      // 更新性别和语音
      this.updateGenders(); 
      this.autoSaveSettings();
    },
    // 当语言改变时更新性别和语音
    updateGenders() {
      // 更新 ttsSettings 中的性别
      this.ttsSettings.edgettsGender = this.edgettsGender;
      // 更新到第一个语音
      this.ttsSettings.edgettsVoice = this.filteredVoices[0].name;

      // 更新语音
      this.updateVoices();
      this.autoSaveSettings();
    },


    // 当性别改变时更新语音
    updateVoices() {
      this.autoSaveSettings();
    },

    updateNewLanguages() {
      // 更新 ttsSettings 中的语言
      this.newTTSConfig.edgettsVoice = this.filteredNewVoices[0].name;
    },
    // 当语言改变时更新性别和语音
    updateNewGenders() {
      // 更新 ttsSettings 中的性别
      this.newTTSConfig.edgettsVoice = this.filteredNewVoices[0].name;
    },
      // 浏览参考音频文件
  browseGsvRefAudioFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*';
    input.onchange = (event) => {
      const files = event.target.files;
      if (files.length > 0) {
        this.newGsvAudio.name = files[0].name;
        this.newGsvAudio.file = files[0]; // 存储文件对象
      }
    };
    input.click();
  },
  
  // 处理参考音频拖拽
  handleGsvRefAudioDrop(event) {
    event.preventDefault();
    const files = event.dataTransfer.files;
    if (files.length > 0) {
      this.newGsvAudio.name = files[0].name;
      this.newGsvAudio.file = files[0]; // 存储文件对象
    }
  },
  
  // 移除已选择的参考音频
  removeNewGsvAudio() {
    this.newGsvAudio.name = '';
    this.newGsvAudio.file = null;
  },
  
  // 取消上传
  cancelGsvAudioUpload() {
    this.showGsvRefAudioPathDialog = false;
    this.newGsvAudio.name = '';
    this.newGsvAudio.text = '';
    this.newGsvAudio.file = null;
  },
  
  // 上传参考音频
  async uploadGsvAudio() {
    if (!this.newGsvAudio.file && !this.newGsvAudio.path) {
      showNotification('请先选择音频文件', 'error');
      return;
    }
    if (!this.newGsvAudio.file) {
        // 添加新音频到选项列表
        const newAudioOption = {
          path: this.newGsvAudio.path,
          name: this.newGsvAudio.name,
          text: this.newGsvAudio.text
        };
        
        this.ttsSettings.gsvAudioOptions.push(newAudioOption);
        
        // 关闭对话框并重置状态
        this.cancelGsvAudioUpload();
        
        // 自动保存设置
        await this.autoSaveSettings();
        
        showNotification('参考音频上传成功');
        return;
    }
    
    const formData = new FormData();
    formData.append('file', this.newGsvAudio.file);
    formData.append('prompt_text', this.newGsvAudio.text);
    
    try {
      const response = await fetch(`/upload_gsv_ref_audio`, {
        method: 'POST',
        body: formData
      });
      
      const result = await response.json();
      
      if (result.success) {
        // 添加新音频到选项列表
        const newAudioOption = {
          path: result.file.unique_filename,
          name: result.file.name,
          text: this.newGsvAudio.text
        };
        
        this.ttsSettings.gsvAudioOptions.push(newAudioOption);
        
        // 关闭对话框并重置状态
        this.cancelGsvAudioUpload();
        
        // 自动保存设置
        await this.autoSaveSettings();
        
        showNotification('参考音频上传成功');
      } else {
        showNotification(`上传失败: ${result.message}`, 'error');
      }
    } catch (error) {
      console.error('上传参考音频失败:', error);
      showNotification('上传失败，请检查网络连接', 'error');
    }
  },
  
  // 处理参考音频路径改变
  handleRefAudioPathChange(value, option) {
    // 当选择新的参考音频时，更新对应的提示文本
    const selectedAudio = this.ttsSettings.gsvAudioOptions.find(
      audio => audio.path === value
    );
    
    if (selectedAudio && selectedAudio.text) {
      if (option == 'role') {
        this.newTTSConfig.gsvPromptText = selectedAudio.text;
      }
      else if (option == 'model') {
        this.ttsSettings.gsvPromptText = selectedAudio.text;
      }
      
    }
    
    // 自动保存设置
    this.autoSaveSettings();
  },


    // 删除音频选项
  async deleteAudioOption(path) {
    try {
      // 查找要删除的音频选项
      const audioIndex = this.ttsSettings.gsvAudioOptions.findIndex(
        audio => audio.path === path
      );
      
      if (audioIndex === -1) return;
      if (this.ttsSettings.gsvAudioOptions[audioIndex].path == this.ttsSettings.gsvAudioOptions[audioIndex].name){
        // 为路径上传的音频，直接从选项中移除
        this.ttsSettings.gsvAudioOptions.splice(audioIndex, 1);
        showNotification('音频已删除');
        return;
      }
      // 获取文件名用于后端删除
      const uniqueFilename = this.ttsSettings.gsvAudioOptions[audioIndex].path
        .split('/')
        .pop();
      
      // 调用后端API删除文件
      const response = await fetch(`/delete_audio/${uniqueFilename}`, {
        method: 'DELETE'
      });
      
      const result = await response.json();
      
      if (result.success) {
        // 从选项中移除
        this.ttsSettings.gsvAudioOptions.splice(audioIndex, 1);
        
        // 如果当前选中的音频被删除，则重置选择
        if (this.ttsSettings.gsvRefAudioPath === path) {
          this.ttsSettings.gsvRefAudioPath = '';
          this.ttsSettings.gsvPromptText = '';
        }
        
        // 自动保存设置
        await this.autoSaveSettings();
        
        showNotification('音频已删除');
      } else {
        showNotification(`删除失败: ${result.message}`, 'error');
      }
    } catch (error) {
      console.error('删除音频失败:', error);
      showNotification('删除失败，请稍后再试', 'error');
    }
  },
    goToMainApp() {
    if (this.isElectron) {
      window.location.href = `${this.partyURL}/index.html`;
    } else {
      window.location.href = '/';
    }
  },
    async startVRM() {
    if (this.isElectron) {
      this.VRMConfig.name = 'default';
      await this.autoSaveSettings();
      // Electron 环境
      try {
        this.isVRMStarting = true;
        const windowConfig = {
          width: this.VRMConfig.windowWidth,
          height: this.VRMConfig.windowHeight,
        };
        await window.electronAPI.startVRMWindow(windowConfig);
      } catch (error) {
        console.error('启动失败:', error);
      } finally {
        this.isVRMStarting = false;
      }
    } else {
      // 浏览器环境
      window.open(`${this.partyURL}/vrm.html`, '_blank');
    }
  },
    async startNewVRM(name) {
    try {
      this.isVRMStarting = true;
      this.VRMConfig.name = name;
      this.VRMConfig.selectedNewModelId = this.VRMConfig.newVRM[name].selectedModelId;
      this.VRMConfig.selectedNewMotionIds = this.VRMConfig.newVRM[name].selectedMotionIds;
      await this.autoSaveSettings();
    if (this.isElectron) {
      // Electron 环境
        const windowConfig = {
          width: this.VRMConfig.newVRM[name].windowWidth,
          height: this.VRMConfig.newVRM[name].windowHeight,
        };
        await window.electronAPI.startVRMWindow(windowConfig);
    } else {
      // 浏览器环境
      window.open(`${this.partyURL}/vrm.html`, '_blank');
    }      
  } catch (error) {
    console.error('启动失败:', error);
  } finally {
    this.isVRMStarting = false;
  }
  },
  async startVRMweb() {
    if (this.isElectron) {
      window.electronAPI.openExternal(`${this.partyURL}/vrm.html`);
    }else {
      // 浏览器环境
      window.open(`${this.partyURL}/vrm.html`, '_blank');
    }
  },

  async stopVRM() {
    if (this.isElectron) {
      try {
        await window.electronAPI.stopVRMWindow();
      } catch (error) {
        console.error('关闭VRM失败:', error);
      }
    }
  },
    async checkServerPort() {
      try {
        // 方式1：使用专门的方法
        const serverInfo = await window.electronAPI.getServerInfo()
        
        
        if (!serverInfo.isDefaultPort) {
          const message = `默认端口 ${serverInfo.defaultPort} 被占用，已自动切换到端口 ${serverInfo.port}`
          showNotification(message, 'warning')
        }
      } catch (error) {
        console.error('获取服务器信息失败:', error)
      }
    },
    // 初始化 WebSocket 连接
    initTTSWebSocket() {
      const http_protocol = window.location.protocol;
      const ws_protocol = http_protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${ws_protocol}//${window.location.host}/ws/tts`;
      this.ttsWebSocket = new WebSocket(wsUrl);
      
      this.ttsWebSocket.onopen = () => {
        console.log('TTS WebSocket connected');
        this.wsConnected = true;
      };
      
      // 核心反馈处理：监听后端发来的 JSON 消息
      this.ttsWebSocket.onmessage = async (event) => {
        try {
          // 判断消息类型：处理文本（JSON）
          if (typeof event.data === 'string') {
            const msg = JSON.parse(event.data);
            
            // 匹配 VTS 状态反馈
            if (msg.type === 'vts_connection_status') {
              this.isVTSStarting = false; // 收到消息，停止 Loading
              
              if (msg.data.success) {
                // 真的连接成功了
                this.VTSConfig.enabled = true;
                showNotification(msg.data.message || 'VTube Studio 已连接', 'success', 'VTS');
              } else {
                // 连接失败：回退开关状态
                this.VTSConfig.enabled = false;
                // 弹出错误提示，引导用户开启 VTS
                showNotification(
                  msg.data.message || '请确保 VTube Studio 已开启 API 访问权限', 
                  'error', 
                  'VTS connection failed'
                );
              }
              this.autoSaveSettings(); // 同步保存到本地配置
            }
          } 
          // 处理二进制（音频流）：如果是音频，则转发或播放
          else if (event.data instanceof Blob) {
            // 这里可以保留你原来的逻辑，比如交给 VRM 播放器
            // this.handleAudioBlob(event.data); 
          }
        } catch (e) {
          console.error('解析 WebSocket 消息出错:', e);
        }
      };
      
      this.ttsWebSocket.onclose = () => {
        console.log('TTS WebSocket disconnected');
        this.wsConnected = false;
        this.isVTSStarting = false; // 断开时停止加载
        
        // 自动重连
        setTimeout(() => {
          if (!this.wsConnected) {
            this.initTTSWebSocket();
          }
        }, 3000);
      };
      
      this.ttsWebSocket.onerror = (error) => {
        console.error('TTS WebSocket error:', error);
        this.isVTSStarting = false;
      };
    },
    
    // 发送 TTS 状态到 VRM
    async sendTTSStatusToVRM(type, data) {
      if (this.ttsWebSocket && this.wsConnected) {
        this.ttsWebSocket.send(JSON.stringify({
          type,
          data,
          timestamp: Date.now()
        }));
      }
    },
  // 浏览VRM模型文件
  browseVrmModelFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.vrm';
    input.onchange = (event) => {
      const files = event.target.files;
      if (files.length > 0) {
        const file = files[0];
        // 检查文件扩展名
        if (!file.name.toLowerCase().endsWith('.vrm')) {
          showNotification('只支持.vrm格式的文件', 'error');
          return;
        }
        this.newVrmModel.name = file.name;
        this.newVrmModel.file = file;
        // 自动设置显示名称（去掉扩展名）
        this.newVrmModel.displayName = file.name.replace(/\.vrm$/i, '');
      }
    };
    input.click();
  },
  
  // 处理VRM模型拖拽
  handleVrmModelDrop(event) {
    event.preventDefault();
    const files = event.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      // 检查文件扩展名
      if (!file.name.toLowerCase().endsWith('.vrm')) {
        showNotification('只支持.vrm格式的文件', 'error');
        return;
      }
      this.newVrmModel.name = file.name;
      this.newVrmModel.file = file;
      // 自动设置显示名称（去掉扩展名）
      this.newVrmModel.displayName = file.name.replace(/\.vrm$/i, '');
    }
  },
  
  // 移除已选择的VRM模型
  removeNewVrmModel() {
    this.newVrmModel.name = '';
    this.newVrmModel.displayName = '';
    this.newVrmModel.file = null;
  },
  
  // 取消上传
  cancelVrmModelUpload() {
    this.showVrmModelDialog = false;
    this.newVrmModel.name = '';
    this.newVrmModel.displayName = '';
    this.newVrmModel.file = null;
  },
  
  
  // 处理模型选择改变
  handleModelChange(value) {
    // 自动保存设置
    this.autoSaveSettings();
  },

  // 判断当前引擎是否处于 Goal 模式
  isGoalModeActive() {
    const engine = this.CLISettings.engine;
    if (engine === 'local') {
      return this.localEnvSettings.permissionMode === 'goal';
    } else if (engine === 'ds') {
      return this.dsSettings.permissionMode === 'goal';
    } else {
      return this.acpSettings.permissionMode === 'goal';
    }
  },
  
 
    // 加载默认模型列表
  async loadDefaultModels() {
    try {
      const response = await fetch(`/get_default_vrm_models`);
      const result = await response.json();
      
      if (result.success) {
        this.VRMConfig.defaultModels = result.models;
        console.log(this.VRMConfig.defaultModels);
        // 如果没有选中任何模型，默认选择第一个默认模型
        if (!this.VRMConfig.selectedModelId && result.models.length > 0) {
          this.VRMConfig.selectedModelId = result.models[0].id;
        }
        await this.autoSaveSettings();
      }
    } catch (error) {
      console.error('加载默认模型失败:', error);
    }
  },

  // 修改上传VRM模型方法
  async uploadVrmModel() {
    if (!this.newVrmModel.file) {
      showNotification('请先选择VRM模型文件', 'error');
      return;
    }
    
    if (!this.newVrmModel.displayName.trim()) {
      showNotification('请输入模型显示名称', 'error');
      return;
    }
    
    const formData = new FormData();
    formData.append('file', this.newVrmModel.file);
    formData.append('display_name', this.newVrmModel.displayName.trim());
    
    try {
      const response = await fetch(`/upload_vrm_model`, {
        method: 'POST',
        body: formData
      });
      
      const result = await response.json();
      
      if (result.success) {
        // 添加新模型到用户模型列表
        const newModelOption = {
          id: result.file.unique_filename,
          name: result.file.display_name,
          path: result.file.path,
          type: 'user' // 标记为用户上传的模型
        };
        
        this.VRMConfig.userModels.push(newModelOption);
        
        // 关闭对话框并重置状态
        this.cancelVrmModelUpload();
        
        // 自动保存设置
        await this.autoSaveSettings();
        
        showNotification('VRM模型上传成功');
      } else {
        showNotification(`上传失败: ${result.message}`, 'error');
      }
    } catch (error) {
      console.error('上传VRM模型失败:', error);
      showNotification('上传失败，请检查网络连接', 'error');
    }
  },
  
  // 修改删除模型选项方法（只能删除用户上传的模型）
  async deleteModelOption(modelId) {
    try {
      // 查找要删除的模型选项（只在用户模型中查找）
      const modelIndex = this.VRMConfig.userModels.findIndex(
        model => model.id === modelId
      );
      
      if (modelIndex === -1) {
        showNotification('无法删除默认模型', 'error');
        return;
      }
      
      // 调用后端API删除文件
      const response = await fetch(`/delete_vrm_model/${modelId}`, {
        method: 'DELETE'
      });
      
      const result = await response.json();
      
      if (result.success) {
        // 从用户模型列表中移除
        this.VRMConfig.userModels.splice(modelIndex, 1);
        
        // 如果当前选中的模型被删除，则重置为默认模型
        if (this.VRMConfig.selectedModelId === modelId) {
          if (this.VRMConfig.defaultModels.length > 0) {
            this.VRMConfig.selectedModelId = this.VRMConfig.defaultModels[0].id;
          } else {
            this.VRMConfig.selectedModelId = '';
          }
        }
        
        // 自动保存设置
        await this.autoSaveSettings();
        
        showNotification('VRM模型已删除');
      } else {
        showNotification(`删除失败: ${result.message}`, 'error');
      }
    } catch (error) {
      console.error('删除VRM模型失败:', error);
      showNotification('删除失败，请稍后再试', 'error');
    }
  },

  // ========== THA Desktop Pet Methods ==========
  async startTHA() {
    if (this.isTHAStarting) return;
    if (this.isElectron) {
      this.THAConfig.name = 'default';
      await this.autoSaveSettings();
      try {
        this.isTHAStarting = true;
        const windowConfig = {
          width: this.THAConfig.windowWidth,
          height: this.THAConfig.windowHeight,
        };
        await window.electronAPI.startTHAWindow(windowConfig);
      } catch (error) {
        console.error('启动THA失败:', error);
      } finally {
        this.isTHAStarting = false;
      }
    } else {
      window.open(`${this.partyURL}/tha.html`, '_blank');
    }
  },

  async startTHAweb() {
    if (this.isElectron) {
      window.electronAPI.openExternal(`${this.partyURL}/tha.html`);
    } else {
      window.open(`${this.partyURL}/tha.html`, '_blank');
    }
  },

  async stopTHA() {
    if (this.isElectron) {
      try {
        await window.electronAPI.stopTHAWindow();
      } catch (error) {
        console.error('停止THA失败:', error);
      }
    }
  },

  async uploadTHAModel() {
    if (!this.newThaModel.file) {
      showNotification('请先选择ONNX模型文件', 'error');
      return;
    }
    if (!this.newThaModel.displayName.trim()) {
      showNotification('请输入模型显示名称', 'error');
      return;
    }

    const formData = new FormData();
    formData.append('file', this.newThaModel.file);
    formData.append('display_name', this.newThaModel.displayName.trim());

    try {
      const response = await fetch('/upload_tha_model', {
        method: 'POST',
        body: formData
      });
      const result = await response.json();

      if (result.success) {
        const newModelOption = {
          id: result.model.id,
          name: result.model.name,
          type: 'user'
        };
        this.THAConfig.userModels.push(newModelOption);
        this.cancelTHAModelUpload();
        await this.autoSaveSettings();
        showNotification('THA模型上传成功');
        await this.loadTHAModels();
      } else {
        showNotification(`上传失败: ${result.message}`, 'error');
      }
    } catch (error) {
      console.error('上传THA模型失败:', error);
      showNotification('上传失败，请检查网络连接', 'error');
    }
  },

  async deleteTHAModel(modelId) {
    try {
      const modelIndex = this.THAConfig.userModels.findIndex(
        model => model.id === modelId
      );
      if (modelIndex === -1) {
        showNotification('无法删除默认模型', 'error');
        return;
      }

      const response = await fetch(`/delete_tha_model/${modelId}`, {
        method: 'DELETE'
      });
      const result = await response.json();

      if (result.success) {
        this.THAConfig.userModels.splice(modelIndex, 1);
        if (this.THAConfig.selectedModelId === modelId) {
          if (this.THAConfig.defaultModels.length > 0) {
            this.THAConfig.selectedModelId = this.THAConfig.defaultModels[0].id;
          } else {
            this.THAConfig.selectedModelId = '';
          }
        }
        await this.autoSaveSettings();
        showNotification('THA模型已删除');
      } else {
        showNotification(`删除失败: ${result.message}`, 'error');
      }
    } catch (error) {
      console.error('删除THA模型失败:', error);
      showNotification('删除失败，请稍后再试', 'error');
    }
  },

  async loadTHAModels() {
    try {
      const [defaultRes, userRes] = await Promise.all([
        fetch('/get_default_tha_models'),
        fetch('/get_user_tha_models')
      ]);
      const defaultData = await defaultRes.json();
      const userData = await userRes.json();

      if (defaultData.success) {
        this.THAConfig.defaultModels = defaultData.models;
      }
      if (userData.success) {
        this.THAConfig.userModels = userData.models;
      }
    } catch (error) {
      console.error('加载THA模型列表失败:', error);
    }
  },

  handleTHAModelFileDrop(event) {
    const files = event.dataTransfer.files;
    if (files.length > 0) {
      this.newThaModel.file = files[0];
      this.newThaModel.name = files[0].name;
    }
  },

  browseTHAModelFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.onnx,.zip';
    input.onchange = (e) => {
      if (e.target.files.length > 0) {
        this.newThaModel.file = e.target.files[0];
        this.newThaModel.name = e.target.files[0].name;
      }
    };
    input.click();
  },

  cancelTHAModelUpload() {
    this.newThaModel = { file: null, displayName: '' };
    this.showThaModelDialog = false;
  },

  removeNewTHAModel() {
    this.newThaModel.file = null;
    this.newThaModel.name = '';
  },

  // 获取当前选中的模型信息
  getCurrentSelectedModel() {
    // 先在默认模型中查找
    let selectedModel = this.VRMConfig.defaultModels.find(
      model => model.id === this.VRMConfig.selectedModelId
    );
    
    // 如果没找到，再在用户模型中查找
    if (!selectedModel) {
      selectedModel = this.VRMConfig.userModels.find(
        model => model.id === this.VRMConfig.selectedModelId
      );
    }
    
    return selectedModel;
  },
  // 启动直播监听
  async startLive() {
    if (!this.isLiveConfigValid || this.isLiveRunning || this.isLiveStarting) {
      return;
    }

    this.isLiveStarting = true;
    
    try {
      // 发送启动请求到FastAPI后端
      const response = await fetch('/api/live/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          config: this.liveConfig
        })
      });

      const result = await response.json();
      
      if (result.success) {
        this.isLiveRunning = true;
        this.shouldReconnectWs = true; // 启动时允许重连
        this.connectLiveWebSocket();
        this.startDanmuProcessor(); // 启动弹幕处理器
        showNotification(result.message || this.t('live_started_successfully'));
      } else {
        showNotification(result.message || this.t('failed_to_start_live'), 'error');
      }
    } catch (error) {
      console.error('启动直播监听失败:', error);
      showNotification(this.t('failed_to_start_live'), 'error');
    } finally {
      this.isLiveStarting = false;
    }
  },

  // 停止直播监听
  async stopLive() {
    if (!this.isLiveRunning || this.isLiveStopping) {
      return;
    }

    this.isLiveStopping = true;
    
    try {
      // 先设置状态，阻止WebSocket重连
      this.shouldReconnectWs = false;
      this.isLiveRunning = false;
      
      // 停止弹幕处理器
      this.stopDanmuProcessor();
      
      // 关闭WebSocket连接
      this.disconnectLiveWebSocket();
      
      // 发送停止请求到FastAPI后端
      const response = await fetch('/api/live/stop', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      const result = await response.json();
      
      if (result.success) {
        this.danmu = []; // 清空弹幕数据
        showNotification(result.message || this.t('live_stopped_successfully'));
      } else {
        showNotification(result.message || this.t('failed_to_stop_live'), 'error');
        // 如果后端停止失败，恢复状态
        this.isLiveRunning = true;
        this.shouldReconnectWs = true;
        this.startDanmuProcessor(); // 重新启动弹幕处理器
      }
    } catch (error) {
      console.error('停止直播监听失败:', error);
      showNotification(this.t('failed_to_stop_live'), 'error');
      // 如果出错，恢复状态
      this.isLiveRunning = true;
      this.shouldReconnectWs = true;
      this.startDanmuProcessor(); // 重新启动弹幕处理器
    } finally {
      this.isLiveStopping = false;
    }
  },

  // 重载直播配置
  async reloadLiveConfig() {
    if (!this.isLiveRunning || this.isLiveReloading) {
      return;
    }

    this.isLiveReloading = true;
    
    try {
      const response = await fetch('/api/live/reload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          config: this.liveConfig
        })
      });

      const result = await response.json();
      
      if (result.success) {
        // 重新连接WebSocket
        this.shouldReconnectWs = false; // 先阻止重连
        this.disconnectLiveWebSocket();
        
        setTimeout(() => {
          this.shouldReconnectWs = true; // 重新允许重连
          this.connectLiveWebSocket();
        }, 1000);
        
        showNotification(result.message || this.t('live_config_reloaded_successfully'));
      } else {
        showNotification(result.message || this.t('failed_to_reload_live_config'), 'error');
      }
    } catch (error) {
      console.error('重载直播配置失败:', error);
      showNotification(this.t('failed_to_reload_live_config'), 'error');
    } finally {
      this.isLiveReloading = false;
    }
  },

  // 启动弹幕处理器
  startDanmuProcessor() {
    console.log('启动弹幕处理器');
    
    // 如果已经有定时器在运行，先清除
    if (this.danmuProcessTimer) {
      clearInterval(this.danmuProcessTimer);
    }
    
    // 每秒检查一次弹幕队列
    this.danmuProcessTimer = setInterval(async () => {
      await this.processDanmuQueue();
    }, 1000);
  },

  // 停止弹幕处理器
  stopDanmuProcessor() {
    console.log('停止弹幕处理器');
    
    if (this.danmuProcessTimer) {
      clearInterval(this.danmuProcessTimer);
      this.danmuProcessTimer = null;
    }
    
    this.isProcessingDanmu = false;
  },

// 1. 拷贝 URL 方法
  copyDanmakuOverlayEndpoint() {
    const url = this.partyURL + '/danmaku_overlay';
    navigator.clipboard.writeText(url).then(() => {
      if(typeof showNotification === 'function') showNotification(this.t('copySuccess') || 'Copied!', 'success');
    }).catch(() => {
      if(typeof showNotification === 'function') showNotification('Copy failed', 'error');
    });
  },

copySubtitleOverlayEndpoint(){
  const url =  this.partyURL + '/subtitle_overlay';
  navigator.clipboard.writeText(url).then(() => {
    if(typeof showNotification === 'function') showNotification(this.t('copySuccess') || 'Copied!', 'success');
  }).catch(() => {
    if(typeof showNotification === 'function') showNotification('Copy failed', 'error');
  });
},

// 处理弹幕队列 - 新版
  async processDanmuQueue() {
    try {
      // 基础检查 (保持不变)
      if (!this.isLiveRunning || this.danmu.length === 0 || this.isTyping || 
          (this.TTSrunning && this.ttsSettings.enabled) || this.isProcessingDanmu) {
        return;
      }

      this.isProcessingDanmu = true;
      const oldestDanmu = this.danmu[this.danmu.length - 1];
      
      if (oldestDanmu && oldestDanmu.content) {
        if (this.lastProcessedContent === oldestDanmu.content) {
            this.danmu.pop();
            this.isProcessingDanmu = false;
            return;
        }

        console.log('开始处理弹幕:', oldestDanmu.content);
        this.lastProcessedContent = oldestDanmu.content;
        
        // 【关键修复点 1】：将弹幕存入临时变量，准备注入 TTS 队列
        this.pendingDanmakuToRead = oldestDanmu.content;

        // 设置 LLM 的输入
        this.userInput = oldestDanmu.content;
        
        // 触发 OBS 弹窗显示 (调用后端 API)
        try {
            fetch('/api/overlay/danmaku', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(oldestDanmu)
            }).catch(()=>{});
        } catch(e) {}

        // 发送消息，启动 AI 生成流程
        await this.sendMessage();
        
        this.danmu.pop(); 
      }
    } catch (error) {
      console.error('处理弹幕出错:', error);
      this.danmu.pop(); 
    } finally {
      this.isProcessingDanmu = false;
    }
  },
  // 连接WebSocket
  connectLiveWebSocket() {
    try {
      // 根据当前协议选择ws或wss
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws/live/danmu`;
      
      this.bilibiliWs = new WebSocket(wsUrl);
      
      this.bilibiliWs.onopen = (event) => {
        console.log('WebSocket连接已建立');
      };
      
      this.bilibiliWs.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleDanmuMessage(data);
        } catch (error) {
          console.error('解析WebSocket消息失败:', error);
        }
      };
      
      this.bilibiliWs.onclose = (event) => {
        console.log('WebSocket连接已关闭');
        
        // 只有在允许重连且直播还在运行时才重连
        if (this.shouldReconnectWs && this.isLiveRunning) {
          console.log('准备重连WebSocket...');
          setTimeout(() => {
            // 再次检查状态，确保仍然需要重连
            if (this.shouldReconnectWs && this.isLiveRunning) {
              console.log('开始重连WebSocket');
              this.connectLiveWebSocket();
            } else {
              console.log('取消重连WebSocket');
            }
          }, 3000);
        } else {
          console.log('不需要重连WebSocket');
        }
      };
      
      this.bilibiliWs.onerror = (error) => {
        console.error('WebSocket连接错误:', error);
      };
    } catch (error) {
      console.error('创建WebSocket连接失败:', error);
    }
  },

  // 断开WebSocket连接
  disconnectLiveWebSocket() {
    console.log('断开WebSocket连接');
    
    if (this.bilibiliWs) {
      // 先设置为null，避免onclose事件中的重连逻辑
      const ws = this.bilibiliWs;
      this.bilibiliWs = null;
      
      // 然后关闭连接
      ws.close();
    }
  },

  async checkLiveStatus() {
    try {
      const response = await fetch('/api/live/status');
      const result = await response.json();
      
      // 更新状态
      this.isLiveRunning = result.is_running;

      // 关键点：如果后台正在运行，前端刷新后需要重新挂载 WebSocket 和处理器
      if (this.isLiveRunning) {
        console.log('检测到后台直播监听正在运行，正在恢复连接...');
        this.shouldReconnectWs = true;
        
        // 重新连接 WebSocket 接收弹幕
        this.connectLiveWebSocket();
        
        // 重新启动弹幕队列处理定时器
        this.startDanmuProcessor();
      }
    } catch (error) {
      console.error('检查直播状态失败:', error);
    }
  },

  // 处理弹幕消息
  handleDanmuMessage(data) {
    if (data.type !== 'message') {
      if (data.type === 'error') showNotification(data.message, 'error');
      return;
    }

    // --- 1. ID 级去重 ---
    if (data.id) {
      if (this.receivedMsgIds.has(data.id)) return;
      this.receivedMsgIds.add(data.id);
      if (this.receivedMsgIds.size > 500) {
        const firstVal = this.receivedMsgIds.values().next().value;
        this.receivedMsgIds.delete(firstVal);
      }
    }

    // --- 2. 统一定义消息属性 ---
    const danmuType = data.danmu_type; // danmaku, super_chat, gift, buy_guard, enter_room, follow, like
    const isDanmaku = (danmuType === "danmaku" || danmuType === "super_chat");
    const isPaid = (danmuType === "gift" || danmuType === "buy_guard" || danmuType === "super_chat");
    const isInteraction = (danmuType === "enter_room" || danmuType === "follow" || danmuType === "like");

    // --- 3. 模式过滤判断 ---
    let modePass = false;
    const mode = this.liveConfig.filterMode || 'all';

    if (mode === 'all') {
      modePass = true;
    } else if (mode === 'danmaku_paid') {
      modePass = (isDanmaku || isPaid);
    } else if (mode === 'danmaku_only') {
      modePass = isDanmaku;
    }

    if (!modePass) return;

    // --- 4. 唤醒词校验 (仅针对文本类消息) ---
    const wakeStr = this.liveConfig.wakeWord || "";
    const wakeKeywords = wakeStr.split(/[\r\n]+/).map(k => k.trim()).filter(k => k.length > 0);
    
    const isMatchWakeWord = (text) => {
      if (wakeKeywords.length === 0) return true;
      return wakeKeywords.some(keyword => text.includes(keyword));
    };

    let shouldAdd = false;
    if (isDanmaku) {
      // 弹幕和 SC 必须匹配唤醒词
      if (isMatchWakeWord(data.content)) shouldAdd = true;
    } else {
      // 礼物、舰长、关注等互动，直接放行 (不被唤醒词拦截)
      shouldAdd = true;
    }

    // --- 5. 入队 ---
    if (shouldAdd) {
      const danmuItem = {
        id: data.id,
        content: data.content,
        type: danmuType,
        platform: data.platform || 'bilibili',
        timestamp: new Date().toLocaleTimeString('zh-CN', { hour12: false })
      };

      // 连续重复内容防刷屏
      if (this.danmu.length > 0 && this.danmu[0].content === danmuItem.content) return;

      this.danmu.unshift(danmuItem);
      if (this.danmu.length > this.liveConfig.danmakuQueueLimit) {
        this.danmu = this.danmu.slice(0, this.liveConfig.danmakuQueueLimit);
      }
    }
  },
  toggleBriefly(index){
    if (this.messages[index].briefly){
      this.messages[index].briefly = !this.messages[index].briefly;
    }else{
      this.messages[index].briefly = true;
    }
  },
  async rewrite(index){
      if (index != 1){
        // 1. 备份要被重写的用户消息（this.messages[index-1]）
        const targetMsg = this.messages[index - 1];

        // 2. 删除 index 及其之后的所有消息
        this.messages.splice(index);

        // 3. 恢复文本内容
        this.userInput = this.messages[index-1]?.pure_content ?? this.messages[index-1]?.content ?? '';

        // 4. 恢复文件/图片信息（从备份中提取，构造不含 Blob 的对象，避免重复上传）
        this.files = targetMsg.fileLinks
          ? targetMsg.fileLinks.map(link => ({ name: link.name, path: link.path }))
          : [];
        this.images = targetMsg.imageLinks
          ? targetMsg.imageLinks.map(link => ({
              name: link.name,
              path: link.path,
              detectedType: link.detectedType   // 保留类型信息
            }))
          : [];

        // 5. 删除原用户消息（此时已是数组最后一个元素）
        this.messages.pop();
      } else {
        // 替换开场白
        this.randomGreetings();
      }

      await this.sendMessage();
  },
  async updateProxy(){
    await this.autoSaveSettings();
    const response = await fetch('/api/update_proxy',{
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    if (response.ok) {
      const data = await response.json();
      console.log(data);
    }else {
      console.error('更新代理失败');
    }
  },
  async openUserfile(){
    const response = await fetch('/api/get_userfile',{
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    if (response.ok) {
      // 拿到userfile
      const data = await response.json();
      let userfile = data.userfile;    // 打开文件夹
      if (this.isElectron){
        window.electronAPI.openPath(userfile);
      }
    }
  },
  async openLogfile(){
    const response = await fetch('/api/get_userfile',{
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    if (response.ok) {
      // 拿到userfile
      const data = await response.json();
      let userfile = data.userfile;    // 打开文件夹
      if (this.isElectron){
        window.electronAPI.openPath(userfile+'/logs');
      }
    }
  },
  async openExtfile(){
    const response = await fetch('/api/get_extfile',{
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    if (response.ok) {
      // 拿到Extfile
      const data = await response.json();
      let extfile = data.extfile;    // 打开文件夹
      if (this.isElectron){
        window.electronAPI.openPath(extfile);
      }
    }
  },
  async changeHAEnabled(){
    if (this.HASettings.enabled){
      const response = await fetch('/start_HA',{
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          data: this.HASettings
        })
      });
      if (response.ok) {
        const data = await response.json();
        console.log(data);
        showNotification(this.t('success_start_HA'));
      }else {
        this.HASettings.enabled = false;
        console.error('启动HA失败');
        showNotification(this.t('error_start_HA'), 'error');
      }
    }else{
      const response = await fetch('/stop_HA',{
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      if (response.ok) {
        const data = await response.json();
        console.log(data);
        showNotification(this.t('success_stop_HA'));
      }else {
        this.HASettings.enabled = true;
        console.error('停止HA失败');
        showNotification(this.t('error_stop_HA'), 'error');
      }
    }
    this.autoSaveSettings();
  },
  async changeChromeMCPEnabled(){

    if (this.chromeMCPSettings.enabled && this.chromeMCPSettings.type === 'internal' && this.isElectron) {
        if (!window.electronAPI) return;
        await this.autoSaveSettings();
        // CDP 端口始终开启，直接同步端口号即可
        const cdpInfo = await window.electronAPI.getInternalCDPInfo();
        if (cdpInfo.active) {
            this.chromeMCPSettings.CDPport = cdpInfo.port;
            console.log(`[CDP] 准备启动 MCP，使用实际端口: ${cdpInfo.port}`);
        }
        await this.autoSaveSettings();
        showNotification(this.t('success_start_browserControl'));
    }
    if (this.chromeMCPSettings.enabled && this.chromeMCPSettings.type === 'external'){
      const response = await fetch('/start_ChromeMCP',{
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          data: this.chromeMCPSettings
        })
      });
      if (response.ok){
        const data = await response.json();
        console.log(data);
        showNotification(this.t('success_start_browserControl'));
      }else {
        this.chromeMCPSettings.enabled = false;
        console.error('启动ChromeMCP失败');
        showNotification(this.t('error_start_browserControl'), 'error');
      }
    }else{
      const response = await fetch('/stop_ChromeMCP',{
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        },
      });
      if (response.ok){
        const data = await response.json();
        console.log(data);
        if (this.chromeMCPSettings.type === 'external'||!this.chromeMCPSettings.enabled){
          showNotification(this.t('success_stop_browserControl'));
        }
      }else {
        this.chromeMCPSettings.enabled = true;
        console.error('停止ChromeMCP失败');
        if (this.chromeMCPSettings.type === 'external'||!this.chromeMCPSettings.enabled){
          showNotification(this.t('error_stop_browserControl'), 'error');
        }
      }
    }
    this.autoSaveSettings();
  },

  async changeSqlEnabled() {
    if (this.sqlSettings.enabled) {
      
      // ==========================================
      // 1. 启动前置校验 (新增逻辑)
      // ==========================================
      const settings = this.sqlSettings;
      let errorMsg = '';

      if (settings.engine === 'sqlite') {
        // SQLite 只需要校验 dbpath
        if (!settings.dbpath?.trim()) {
          errorMsg = this.t('pleaseConfigSqliteDbpath');
        }
      } else {
        // 其他数据库校验 host, port, user, password, dbname
        if (!settings.host?.trim()) {
          errorMsg = this.t('pleaseConfigSqlHost');
        } else if (settings.port === undefined || settings.port === null || settings.port === '') {
          errorMsg = this.t('pleaseConfigSqlPort');
        } else if (!settings.user?.trim()) {
          errorMsg = this.t('pleaseConfigSqlUser');
        } else if (!settings.password?.trim()) {
          errorMsg = this.t('pleaseConfigSqlPassword');
        } else if (!settings.dbname?.trim()) {
          errorMsg = this.t('pleaseConfigSqlDbname');
        }
      }

      // 校验失败：弹窗报错，重置开关并阻断执行
      if (errorMsg) {
        const errorTitle = this.t ? this.t('configIncomplete') : 'Configuration Incomplete';
        showNotification(errorMsg, 'error', errorTitle);

        this.$nextTick(() => {
          this.sqlSettings.enabled = false;
        });
        
        return; // ⚠️ 必须 return，防止继续执行下方的 fetch 请求
      }

      // ==========================================
      // 2. 原有的启动逻辑 (校验通过后执行)
      // ==========================================
      const response = await fetch('/start_sql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          data: this.sqlSettings
        })
      });
      if (response.ok) {
        const data = await response.json();
        console.log(data);
        showNotification(this.t('success_start_sqlControl'));
      } else {
        this.sqlSettings.enabled = false;
        console.error('启动sql失败');
        showNotification(this.t('error_start_sqlControl'), 'error');
      }

    } else {
      
      // ==========================================
      // 3. 原有的停止逻辑 (用户关闭开关时执行)
      // ==========================================
      const response = await fetch('/stop_sql', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        },
      });
      if (response.ok) {
        const data = await response.json();
        console.log(data);
        showNotification(this.t('success_stop_sqlControl'));
      } else {
        this.sqlSettings.enabled = true;
        console.error('停止sql失败');
        showNotification(this.t('error_stop_sqlControl'), 'error');
      }
    }
    
    // ==========================================
    // 4. 操作成功后保存配置
    // ==========================================
    this.autoSaveSettings();
  },
  
    // 加载默认动作列表
  async loadDefaultMotions() {
    try {
      const response = await fetch(`/get_default_vrma_motions`);
      const result = await response.json();
      
      if (result.success) {
        this.VRMConfig.defaultMotions = result.motions;
        console.log('默认动作列表:', this.VRMConfig.defaultMotions);
        await this.autoSaveSettings();
      }
    } catch (error) {
      console.error('加载默认动作失败:', error);
    }
  },

  // 处理动作选择改变
  handleMotionChange(value) {
    console.log('选中的动作:', value);
    // 自动保存设置
    this.autoSaveSettings();
  },

  // 浏览VRMA动作文件
  browseVrmaMotionFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.vrma';
    input.multiple = true; // 允许多选
    input.onchange = (event) => {
      const files = event.target.files;
      if (files.length > 0) {
        // 如果选择了多个文件，只处理第一个（或者你可以修改为支持批量上传）
        const file = files[0];
        // 检查文件扩展名
        if (!file.name.toLowerCase().endsWith('.vrma')) {
          showNotification('只支持.vrma格式的文件', 'error');
          return;
        }
        this.newVrmaMotion.name = file.name;
        this.newVrmaMotion.file = file;
        // 自动设置显示名称（去掉扩展名）
        this.newVrmaMotion.displayName = file.name.replace(/\.vrma$/i, '');
      }
    };
    input.click();
  },

  // 处理VRMA动作拖拽
  handleVrmaMotionDrop(event) {
    event.preventDefault();
    const files = event.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      // 检查文件扩展名
      if (!file.name.toLowerCase().endsWith('.vrma')) {
        showNotification('只支持.vrma格式的文件', 'error');
        return;
      }
      this.newVrmaMotion.name = file.name;
      this.newVrmaMotion.file = file;
      // 自动设置显示名称（去掉扩展名）
      this.newVrmaMotion.displayName = file.name.replace(/\.vrma$/i, '');
    }
  },

  // 移除已选择的VRMA动作
  removeNewVrmaMotion() {
    this.newVrmaMotion.name = '';
    this.newVrmaMotion.displayName = '';
    this.newVrmaMotion.file = null;
  },

  // 取消VRMA动作上传
  cancelVrmaMotionUpload() {
    this.showVrmaMotionDialog = false;
    this.newVrmaMotion.name = '';
    this.newVrmaMotion.displayName = '';
    this.newVrmaMotion.file = null;
  },

  // 上传VRMA动作
  async uploadVrmaMotion() {
    if (!this.newVrmaMotion.file) {
      showNotification('请先选择VRMA动作文件', 'error');
      return;
    }
    
    if (!this.newVrmaMotion.displayName.trim()) {
      showNotification('请输入动作显示名称', 'error');
      return;
    }
    
    const formData = new FormData();
    formData.append('file', this.newVrmaMotion.file);
    formData.append('display_name', this.newVrmaMotion.displayName.trim());
    
    try {
      const response = await fetch(`/upload_vrma_motion`, {
        method: 'POST',
        body: formData
      });
      
      const result = await response.json();
      
      if (result.success) {
        // 添加新动作到用户动作列表
        const newMotionOption = {
          id: result.file.unique_filename,
          name: result.file.display_name,
          path: result.file.path,
          type: 'user' // 标记为用户上传的动作
        };
        
        this.VRMConfig.userMotions.push(newMotionOption);
        
        // 自动选中新上传的动作
        if (!this.VRMConfig.selectedMotionIds.includes(newMotionOption.id)) {
          this.VRMConfig.selectedMotionIds.push(newMotionOption.id);
        }
        
        // 关闭对话框并重置状态
        this.cancelVrmaMotionUpload();
        
        // 自动保存设置
        await this.autoSaveSettings();
        
        showNotification('VRMA动作上传成功');
      } else {
        showNotification(`上传失败: ${result.message}`, 'error');
      }
    } catch (error) {
      console.error('上传VRMA动作失败:', error);
      showNotification('上传失败，请检查网络连接', 'error');
    }
  },

  // 删除动作选项（只能删除用户上传的动作）
  async deleteMotionOption(motionId) {
    try {
      // 查找要删除的动作选项（只在用户动作中查找）
      const motionIndex = this.VRMConfig.userMotions.findIndex(
        motion => motion.id === motionId
      );
      
      // 调用后端API删除文件
      const response = await fetch(`/delete_vrma_motion/${motionId}`, {
        method: 'DELETE'
      });
      
      const result = await response.json();
      
      if (result.success) {
        // 从用户动作列表中移除
        this.VRMConfig.userMotions.splice(motionIndex, 1);
        
        // 如果当前选中的动作中包含被删除的动作，则从选中列表中移除
        const selectedIndex = this.VRMConfig.selectedMotionIds.indexOf(motionId);
        if (selectedIndex > -1) {
          this.VRMConfig.selectedMotionIds.splice(selectedIndex, 1);
        }
        
        // 自动保存设置
        await this.autoSaveSettings();
        
        showNotification(this.t("VRMAactionDeleted"));
      } else {
        showNotification(`error: ${result.message}`, 'error');
      }
    } catch (error) {
      console.error('删除VRMA动作失败:', error);
      showNotification(error, 'error');
    }
  },

  // 获取当前选中的动作信息
  getCurrentSelectedMotions() {
    const selectedMotions = [];
    
    // 从默认动作中查找
    this.VRMConfig.defaultMotions.forEach(motion => {
      if (this.VRMConfig.selectedMotionIds.includes(motion.id)) {
        selectedMotions.push(motion);
      }
    });
    
    // 从用户动作中查找
    this.VRMConfig.userMotions.forEach(motion => {
      if (this.VRMConfig.selectedMotionIds.includes(motion.id)) {
        selectedMotions.push(motion);
      }
    });
    
    return selectedMotions;
  },

  // 获取所有可用的动作（默认 + 用户上传）
  getAllAvailableMotions() {
    return [...this.VRMConfig.defaultMotions, ...this.VRMConfig.userMotions];
  },

  // 根据ID获取动作信息
  getMotionById(motionId) {
    // 先在默认动作中查找
    let motion = this.VRMConfig.defaultMotions.find(m => m.id === motionId);
    
    // 如果没找到，再在用户动作中查找
    if (!motion) {
      motion = this.VRMConfig.userMotions.find(m => m.id === motionId);
    }
    
    return motion;
  },

/* 生命周期：读取场景列表 */
async loadGaussScenes() {
  const [def, user] = await Promise.all([
    fetch('/get_default_gauss_scenes').then(r => r.json()),
    fetch('/get_user_gauss_scenes').then(r => r.json())
  ]);
  this.VRMConfig.gaussDefaultScenes = def.scenes || [];
  this.VRMConfig.gaussUserScenes   = user.scenes || [];
  console.log("默认场景：",this.VRMConfig.gaussDefaultScenes);
  if (!this.VRMConfig.selectedGaussSceneId) {
    this.VRMConfig.selectedGaussSceneId = 'transparent';
  }
  this.autoSaveSettings();
},
/* 选择场景后实时切换背景 */
async handleGaussSceneChange(sceneId) {
  // 与 VRM 模型切换类似：把场景 id 写进 VRMConfig
  this.VRMConfig.selectedGaussSceneId = sceneId;

  this.autoSaveSettings();
},

/* 上传区域点击 */
browseGaussSceneFile() {
  const ipt = document.createElement('input');
  ipt.type = 'file';
  ipt.accept = '.ply,.spz,.splat,.ksplat,.sog';
  ipt.onchange = e => {
    const file = e.target.files[0];
    if (file) {
      this.newGaussScene.name = file.name;
      this.newGaussScene.file = file;   // 保存原始 File 对象
      this.newGaussScene.displayName = this.newGaussScene.displayName || this.newGaussScene.name;
    }
  };
  ipt.click();
},

/* 拖拽上传 */
handleGaussSceneDrop(e) {
  const file = e.dataTransfer.files[0];
  if (!file) return;
  const ext = file.name.split('.').pop().toLowerCase();
  if (!['ply','spz','splat','ksplat','sog'].includes(ext)) {
    return showNotification('不支持的文件类型', 'error');
  }
  this.newGaussScene.name = file.name;
  this.newGaussScene.file = file;
  this.newGaussScene.displayName = this.newGaussScene.displayName || this.newGaussScene.name;
},

/* 移除待上传文件 */
removeNewGaussScene() {
  this.newGaussScene = { name: '', displayName: '' };
},

/* 真正上传 */
async uploadGaussScene() {
  const fd = new FormData();
  fd.append('file', this.newGaussScene.file);
  fd.append('display_name', this.newGaussScene.displayName || this.newGaussScene.name);
  console.log("上传场景：",fd);
  const res = await fetch('/upload_gauss_scene', {
    method: 'POST',
    body: fd
  }).then(r => r.json());

  if (res.success) {
    showNotification('场景上传成功');
    this.showGaussSceneDialog = false;
    // 添加新动作到用户动作列表
    const newgaussScenes = {
      id: res.file.unique_filename,
      name: res.file.display_name,
      path: res.file.path,
      type: 'user' // 标记为用户上传的动作
    };
        
    this.VRMConfig.gaussUserScenes.push(newgaussScenes);
    // 自动选中新上传的场景
    if (newgaussScenes) this.handleGaussSceneChange(newgaussScenes.id);
  } else {
    showNotification(res.message || '上传失败', 'error');
  }
},

/* 取消上传 */
cancelGaussSceneUpload() {
  this.showGaussSceneDialog = false;
  this.removeNewGaussScene();
},

/* 删除用户场景 */
async deleteGaussSceneOption(sceneId) {
  const scene = this.VRMConfig.gaussUserScenes.find(s => s.id === sceneId);
  if (!scene) return;

  // 提取 uuid 文件名
  const filename = scene.path.split('/').pop();
  const res = await fetch(`/delete_gauss_scene/${filename}`, {
    method: 'DELETE'
  }).then(r => r.json());

  if (res.success) {
    showNotification('场景已删除');
    // 如果当前正在使用被删场景，切回第一个默认场景
    if (this.VRMConfig.selectedGaussSceneId === sceneId) {
      const firstDef = this.VRMConfig.gaussDefaultScenes[0];
      if (firstDef) this.handleGaussSceneChange(firstDef.id);
    }
    await this.loadGaussScenes();
  } else {
    showNotification(res.message || '删除失败', 'error');
  }
},


  async confirmClearAll() {
    await this.clearAllHistoryRecords();
  },

  async keepLastWeek() {
    try {
      await this.$confirm(this.t('confirmKeepLastWeek'), this.t('warning'), {
        confirmButtonText: this.t('confirm'),
        cancelButtonText: this.t('cancel'),
        type: 'warning'
      });

      const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
      this.conversations = this.conversations.filter(conv => 
        conv.timestamp && conv.timestamp >= oneWeekAgo
      );
      if (this.conversations == []){
        this.conversationId = null; // 清空当前对话ID
      }
      
      await this.saveConversations();
    } catch (error) {
      // 用户取消操作
    }
  },
  changeGsvAudioPath() {
    if (this.newGsvAudio.path) {
      this.newGsvAudio.name = this.newGsvAudio.path;
    }
  },
    /* ===============  朗读主流程  =============== */
toggleRead() {
  if (this.isReadRunning) {
    if (this.isReadPaused) {
      this.resumeRead();
    } else {
      this.pauseRead();
    }
  } else {
    this.startRead();
  }
},

// 修改后的startRead方法
async startRead() {
  if (!this.readConfig.longText.trim()) return;
  
  this.stopSegmentTTS();
  this.readState.currentChunk = 0;
  this.isReadStarting = true;
  this.isReadRunning  = true;
  this.isReadPaused   = false;  // 重置暂停状态
  this.isReadStopping = false;

  /* 清空上一次的残留 */
  this.readState.ttsChunks  = [];
  this.readState.audioChunks = [];
  this.readState.currentChunk = 0;
  this.readState.isPlaying = false;
  this.readState.chunks_voice = [];
  this.cur_voice = 'default';
  
  /* 重置音频计数状态 */
  this.audioChunksCount = 0;
  this.totalChunksCount = 0;

  /* 分段处理逻辑（保持原有） */
  const {
    chunks,
    chunks_voice,
    remaining,
    remaining_voice
  } = this.splitTTSBuffer(this.readConfig.longText);

  if (remaining) {
    chunks.push(remaining);
    chunks_voice.push(remaining_voice);
  }

  /* 去标签 + 去空白并同步删除 */
  const cleanedChunks = chunks.map(txt => txt.replace(/<\/?[^>]+>/g, '').trim());
  const finalChunks = [];
  const finalChunksVoice = [];

  cleanedChunks.forEach((txt, idx) => {
    if (txt) {
      finalChunks.push(txt);
      finalChunksVoice.push(chunks_voice[idx]);
    }
  });

  if (!finalChunks.length) {
    this.isReadRunning  = false;
    this.isReadStarting = false;
    return;
  }

  this.readState.ttsChunks   = finalChunks;
  this.readState.chunks_voice = finalChunksVoice;
  this.totalChunksCount = finalChunks.length;

  /* 通知 VRM 开始朗读 */
  this.sendTTSStatusToVRM('ttsStarted', {
    totalChunks: this.readState.ttsChunks.length
  });

  this.isReadStarting = false;

  /* 并发 TTS */
  this.isAudioSynthesizing = true;
  await this.startReadTTSProcess();
},

// 新增：暂停朗读
pauseRead() {
  if (!this.isReadRunning || this.isReadPaused) return;
  
  this.isReadPaused = true;
  
  // 暂停当前音频
  if (this.currentReadAudio) {
    this.currentReadAudio.pause();
  }
  
  // 通知 VRM 暂停
  this.sendTTSStatusToVRM('pauseSpeaking', {});
},

// 新增：恢复朗读
resumeRead() {
  if (!this.isReadRunning || !this.isReadPaused) return;
  
  this.isReadPaused = false;
  
  // 恢复当前音频播放
  if (this.currentReadAudio) {
    this.currentReadAudio.play().catch(console.error);
  }
  
  // 通知 VRM 恢复
  this.sendTTSStatusToVRM('resumeSpeaking', {});
  
  // 尝试继续播放后续音频
  this.checkReadAudioPlayback();
},

    // 修改 processReadTTSChunk 方法
    async processReadTTSChunk(index) {
      try {
        const chunk = this.readState.ttsChunks[index];
        const voice = this.readState.chunks_voice[index];
        const cachedAudio = this.readState.audioChunks[index];

        // --- 修改点 1：将缓存检查中的 base64 改为 buffer ---
        if (cachedAudio?.url && cachedAudio?.buffer && cachedAudio?.text === chunk && cachedAudio?.voice === voice){
          // this.cur_audioDatas[index] = cachedAudio.buffer; // 可省略，直接用 readState
        }
        else{
          let chunk_text = chunk;
          let  chunk_expressions = [];
          if (chunk.indexOf('<') !== -1) {
              const tagReg = /<[^>]+>/g;
              chunk_expressions = (chunk.match(tagReg) || []).map(t => t.slice(1, -1));
              chunk_text = chunk.replace(tagReg, '').trim();
          }

          const res = await fetch('/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ttsSettings: this.ttsSettings, text: chunk_text, index, voice })
          });

          if (!res.ok) throw new Error('TTS failed');

          const blob = await res.blob();
          const url  = URL.createObjectURL(blob);

          // --- 修改点 2：抛弃 Base64，改用 ArrayBuffer ---
          const audioBuffer = await blob.arrayBuffer();

          this.readState.audioChunks[index] = {
            url,                       
            expressions: chunk_expressions,
            buffer: audioBuffer, // <--- 缓存二进制
            mimeType: blob.type, // <--- 保存真实的类型
            text: chunk_text,
            index,
            voice
          };
        }

        this.audioChunksCount++;
        if (this.audioChunksCount >= this.totalChunksCount) {
          this.isAudioSynthesizing = false;
          this.audioChunksCount = this.totalChunksCount; 
        }

        this.checkReadAudioPlayback();
      } catch (e) {
        console.error(`Read TTS chunk ${index} error`, e);
        this.readState.audioChunks[index] = { url: null, expressions: [], text: "", index };
        this.audioChunksCount++;
        if (this.audioChunksCount >= this.totalChunksCount) {
          this.isAudioSynthesizing = false;
          this.audioChunksCount = this.totalChunksCount; 
        }
        this.checkReadAudioPlayback();
      }
    },

    async ClickToListen(SampleText,voice='default') {
      if (!SampleText) {
        SampleText ='super agent party链接一切！'
      }

    try {
      // 创建副本，避免直接修改 this.ttsSettings
      let Settings = { ...this.ttsSettings };

      if (this.showAddTTSDialog) {
        Settings = { ...Settings, ...this.newTTSConfig };
      } else if (voice !== 'default' && this.ttsSettings.newtts && this.ttsSettings.newtts[voice]) {
        // 从角色语音卡片调用：合并角色配置
        Settings = { ...Settings, ...this.ttsSettings.newtts[voice] };
      }

      // ★ 关键修复：附带 modelProviders，供后端查找 API Key
      // 后端逻辑：如果角色配置缺少api_key但有selectedProvider，会从这里查找
      if (this.modelProviders && Array.isArray(this.modelProviders)) {
        Settings.modelProviders = this.modelProviders;
      }

        const res = await fetch('/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ttsSettings: Settings,
            text: SampleText,
            index: 0,          // 随便给个 index，后端不关心
            voice: voice || 'default'
          })
        });
        if (!res.ok) throw new Error('TTS failed');

        const blob = await res.blob();
        const url = URL.createObjectURL(blob);

        /* 直接播放 */
        const audio = new Audio(url);
        audio.play().catch(console.error);

        /* 播放完清掉内存 */
        audio.onended = () => URL.revokeObjectURL(url);
      } catch (e) {
        console.error('ClickToListen error', e);
      }
    },

    // 添加下载方法
    downloadAudio() {
      // 确保有音频片段可以下载
      if (this.audioChunksCount === 0) {
        showNotification(this.t('noAudioToDownload'));
        return;
      }

      // 检查是否有有效的音频片段
      const validChunks = this.readState.audioChunks.filter(chunk => chunk && chunk.url);
      if (validChunks.length === 0) {
        showNotification(this.t('noValidAudioChunks'));
        return;
      }

      try {
        // 创建合并的音频文件，只包含有效的片段
        this.createCombinedAudio(validChunks, this.getAudioMimeType());
      } catch (error) {
        console.error('Audio download failed:', error);
        showNotification(this.t('audioDownloadFailed'));
      }
    },



    // 1. 修改 downloadAudio：不再需要传入 MIME 类型，交给内部探测
    downloadAudio() {
      if (this.audioChunksCount === 0) {
        showNotification(this.t('noAudioToDownload'));
        return;
      }

      // 过滤无效片段
      const validChunks = this.readState.audioChunks.filter(chunk => chunk && chunk.url);
      if (validChunks.length === 0) {
        showNotification(this.t('noValidAudioChunks'));
        return;
      }

      try {
        // 直接调用，不需要传参，函数内部会自己识别格式
        this.createCombinedAudio(validChunks);
      } catch (error) {
        console.error('Audio download failed:', error);
        showNotification(this.t('audioDownloadFailed'));
      }
    },

    // 2. 重写 createCombinedAudio：核心修改是“自动识别真实格式”
    async createCombinedAudio(chunks) {
      if (!chunks || chunks.length === 0) return;

      showNotification(this.t('audioProcessingStarted') || '正在处理音频...');

      try {
        // ================= 关键步骤：探测真实格式 =================
        // 先 Fetch 第一个片段，查看 HTTP 头或 Blob 类型，以此为准
        const firstResponse = await fetch(chunks[0].url);
        const firstBlob = await firstResponse.blob();
        
        // 获取真实的 MIME (例如: "audio/ogg; codecs=opus" -> "audio/ogg")
        const realMimeType = firstBlob.type.split(';')[0]; 
        
        console.log('Detected Real Audio Format:', realMimeType);

        // 根据真实 MIME 推导后缀名和处理逻辑
        let extension = 'mp3'; // 默认
        let isWav = false;

        if (realMimeType.includes('wav')) {
          extension = 'wav';
          isWav = true;
        } else if (realMimeType.includes('ogg')) {
          extension = 'ogg';
        } else if (realMimeType.includes('aac')) {
          extension = 'aac';
        } else if (realMimeType.includes('flac')) {
          extension = 'flac';
        } else if (realMimeType.includes('webm')) {
          extension = 'webm';
        } else if (realMimeType.includes('mp4') || realMimeType.includes('m4a')) {
          extension = 'm4a';
        }

        // ================= 开始获取所有数据 =================
        // 重用第一个 Blob，减少一次请求
        const firstBuffer = await firstBlob.arrayBuffer();
        
        // 并发获取剩余片段
        const restPromises = chunks.slice(1).map(async (chunk) => {
          const response = await fetch(chunk.url);
          return response.arrayBuffer();
        });
        
        const restBuffers = await Promise.all(restPromises);
        const allBuffers = [firstBuffer, ...restBuffers];

        // ================= 根据真实格式合并 =================
        let combinedBuffer;

        if (isWav) {
          // WAV 专用处理：去头
          combinedBuffer = this.mergeWavBuffers(allBuffers);
        } else {
          // 其他格式（MP3, OGG等）：直接拼接
          // 注意：OGG 直接拼接在浏览器中播放可能只能听第一句（Chained Ogg），
          // 但下载后用本地播放器（VLC/PotPlayer）是完整的。这是无损拼接的特性。
          combinedBuffer = this.mergeGeneralBuffers(allBuffers);
        }

        // ================= 下载文件 =================
        const blob = new Blob([combinedBuffer], { type: realMimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        
        const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
        
        a.href = url;
        // 使用探测到的真实后缀名
        a.download = `tts-merged-${timestamp}.${extension}`; 
        
        document.body.appendChild(a);
        a.click();
        
        // 清理
        setTimeout(() => {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }, 100);
        
        showNotification(this.t('audioDownloadStarted'));

      } catch (error) {
        console.error('Audio merging failed:', error);
        showNotification(this.t('audioMergeFailed'));
      }
    },

    // --- 辅助函数保持不变 ---
    
    // 通用拼接 (MP3/OGG/AAC)
    mergeGeneralBuffers(buffers) {
      const totalLength = buffers.reduce((acc, buffer) => acc + buffer.byteLength, 0);
      const result = new Uint8Array(totalLength);
      
      let offset = 0;
      buffers.forEach(buffer => {
        result.set(new Uint8Array(buffer), offset);
        offset += buffer.byteLength;
      });
      
      return result;
    },

    // WAV 专用拼接
    mergeWavBuffers(buffers) {
      if (buffers.length === 0) return new Uint8Array(0);
      if (buffers.length === 1) return new Uint8Array(buffers[0]);

      const HEADER_SIZE = 44; 
      let totalDataLength = 0;
      
      buffers.forEach((buffer, index) => {
        if (index === 0) totalDataLength += buffer.byteLength;
        else totalDataLength += Math.max(0, buffer.byteLength - HEADER_SIZE);
      });

      const result = new Uint8Array(totalDataLength);
      
      // 写入第一个文件（含头）
      result.set(new Uint8Array(buffers[0]), 0);
      let offset = buffers[0].byteLength;

      // 写入后续文件（去头）
      for (let i = 1; i < buffers.length; i++) {
        const buffer = new Uint8Array(buffers[i]);
        if (buffer.byteLength > HEADER_SIZE) {
            const dataChunk = buffer.subarray(HEADER_SIZE);
            result.set(dataChunk, offset);
            offset += dataChunk.byteLength;
        }
      }

      // 修正 WAV 头
      const view = new DataView(result.buffer);
      view.setUint32(4, result.byteLength - 8, true); 
      view.setUint32(40, result.byteLength - HEADER_SIZE, true);

      return result;
    },


// 修改 stopRead 方法
stopRead() {
  if (!this.isReadRunning) return;
  
  this.isReadStopping = true;
  this.isReadRunning  = false;
  this.isReadPaused   = false;  // 重置暂停状态
  this.readState.isPlaying = false;

  /* 停掉当前音频 */
  if (this.currentReadAudio) {
    this.currentReadAudio.pause();
    this.currentReadAudio = null;
  }
  
  this.sendTTSStatusToVRM('stopSpeaking', {});
  
  /* 重置音频计数状态 */
  this.isAudioSynthesizing = false;
  this.audioChunksCount = 0;
  this.totalChunksCount = 0;
  
  this.isReadStopping = false;
},

// 修改 stopTTSActivities 方法
stopTTSActivities() {
  // 停止朗读流程
  if (this.isReadRunning) {
    this.isReadStopping = true;
    this.isReadRunning = false;
    this.isReadPaused = false;  // 重置暂停状态
    this.readState.isPlaying = false;
    
    /* 停掉当前音频 */
    if (this.currentReadAudio) {
      this.currentReadAudio.pause();
      this.currentReadAudio = null;
    }
    this.sendTTSStatusToVRM('stopSpeaking', {});
    
    /* 重置音频计数状态 */
    this.isAudioSynthesizing = false;
    
    this.isReadStopping = false;
  }
  
  // 停止音频转换流程（保持原有）
  if (this.isConvertingAudio) {
    this.isConvertStopping = true;
    this.isConvertingAudio = false;
    this.isAudioSynthesizing = false;
    showNotification(this.t('audioConversionStopped'));
    this.isConvertStopping = false;
  }
},
  /* ===============  复用 / 微调 TTS 流程  =============== */
  async startReadTTSProcess() {
    let max_concurrency = this.ttsSettings.maxConcurrency || 1;
    let nextIndex = 0;

    /* 与对话版唯一区别：readState 代替 messages[last] */
    while (this.isReadRunning) {
      while (
        this.readState.ttsQueue.size < max_concurrency &&
        nextIndex < this.readState.ttsChunks.length
      ) {
        if (!this.isReadRunning) break;

        const index = nextIndex++;
        this.readState.ttsQueue.add(index);

        this.processReadTTSChunk(index).finally(() => {
          this.readState.ttsQueue.delete(index);
        });

        /* 首包加速 */
        if (index === 0) await new Promise(r => setTimeout(r, 800));
      }
      await new Promise(r => setTimeout(r, 10));
    }
    console.log('Read TTS queue processing completed');
  },

  // 修改后的 convertAudioOnly 方法
  async convertAudioOnly() {
    if (!this.readConfig.longText.trim()) {
      showNotification(this.t('noTextToConvert'));
      return;
    }

    this.isConvertingAudio = true;
    
    try {
      // 1. 清空上一次的残留
      this.readState.ttsChunks = [];
      this.readState.audioChunks = [];
      this.readState.chunks_voice = [];
      this.audioChunksCount = 0;
      this.totalChunksCount = 0;

  /* 2. 分段 */
      const {
        chunks,
        chunks_voice,
        remaining,
        remaining_voice
      } = this.splitTTSBuffer(this.readConfig.longText);

      // 追加 remaining
      if (remaining) {
        chunks.push(remaining);
        chunks_voice.push(remaining_voice);
      }

      /* ================= 新增：去标签 + 去空白并同步删除 ================= */
      // 1. 去 HTML 标签
      const cleanedChunks = chunks.map(txt => txt.replace(/<\/?[^>]+>/g, '').trim());

      // 2. 过滤空白并同步删除 chunks_voice 对应项
      const finalChunks       = [];
      const finalChunksVoice  = [];

      cleanedChunks.forEach((txt, idx) => {
        if (txt) {                      // 非空才保留
          finalChunks.push(txt);
          finalChunksVoice.push(chunks_voice[idx]);
        }
      });

      // 3. 覆盖原来的数组
      chunks.length       = 0;
      chunks_voice.length = 0;
      chunks.push(...finalChunks);
      chunks_voice.push(...finalChunksVoice);
      /* ================================================================ */
      
      if (!chunks.length) {
        this.isConvertingAudio = false;
        return;
      }
      
      this.readState.ttsChunks = chunks;
      this.readState.chunks_voice = chunks_voice;
      this.totalChunksCount = chunks.length;

      // 3. 开始转换（复用 processReadTTSChunk 但禁用播放）
      this.isAudioSynthesizing = true;
      
      // 使用并发控制处理所有片段
      const maxConcurrency = this.ttsSettings.maxConcurrency || 1;
      let nextIndex = 0;
      const activeTasks = new Set();
      
      // 使用 Promise 来等待所有任务完成
      await new Promise((resolve) => {
        const processNext = async () => {
          // 检查是否被用户停止
          if (!this.isConvertingAudio) {
            resolve();
            return;
          }
          
          // 所有任务完成
          if (nextIndex >= chunks.length && activeTasks.size === 0) {
            resolve();
            return;
          }
          
          // 添加新任务（如果有空位且还有任务）
          while (activeTasks.size < maxConcurrency && nextIndex < chunks.length) {
            const index = nextIndex++;
            activeTasks.add(index);
            
            this.processTTSChunkWithoutPlayback(index)
              .finally(() => {
                activeTasks.delete(index);
                processNext(); // 检查是否可添加新任务
              });
          }
        };
        
        processNext();
      });
      
      // 只有在没有被停止的情况下才显示完成通知
      if (this.isConvertingAudio) {
        this.isAudioSynthesizing = false;
        showNotification(this.t('audioConversionCompleted', { count: chunks.length }));
      }
      
    } catch (error) {
      console.error('Audio conversion failed:', error);
      showNotification(this.t('audioConversionFailed'));
    } finally {
      this.isConvertingAudio = false;
    }
  },

    // 处理TTS片段但不播放
    async processTTSChunkWithoutPlayback(index) {
      const chunk = this.readState.ttsChunks[index];
      const voice = this.readState.chunks_voice[index];
      console.log(`Processing TTS chunk ${index}`);
      // 文本清洗
      let chunk_text = chunk;
      let chunk_expressions =[];
      if (chunk.indexOf('<') !== -1) {
        const tagReg = /<[^>]+>/g;
        chunk_expressions = (chunk.match(tagReg) || []).map(t => t.slice(1, -1)); // 去掉两端的 <>
        chunk_text = chunk.replace(tagReg, '').trim(); // 把标签从正文里删掉
      }

      try {
        const res = await fetch('/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ttsSettings: this.ttsSettings,
            text: chunk_text,
            index,
            voice
          })
        });

        if (!res.ok) throw new Error('TTS failed');

        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const audioBuffer = await blob.arrayBuffer();
        /* Base64 给 VRM */
        const base64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload  = () => resolve(reader.result.split(',')[1]);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        this.cur_audioDatas[index] = `data:${blob.type};base64,${base64}`;
        /* 缓存两样东西 */
        this.readState.audioChunks[index] = {
          url,                       // 本地播放用
          expressions: chunk_expressions,
          buffer: audioBuffer, 
          mimeType: blob.type, 
          text: chunk_text,
          index,
          voice
        };
        // 增加计数
        this.audioChunksCount++;
        if (this.audioChunksCount >= this.totalChunksCount) {
          this.isAudioSynthesizing = false;
          this.audioChunksCount = this.totalChunksCount; // 重置计数
        }
      } catch (e) {
        console.error(`TTS chunk ${index} error`, e);
        this.readState.audioChunks[index] = { 
          url: null, 
          expressions: chunk_expressions, 
          text: chunk_text, 
          index 
        };
        
        // 错误时也增加计数
        this.audioChunksCount++;
        if (this.audioChunksCount >= this.totalChunksCount) {
          this.isAudioSynthesizing = false;
          this.audioChunksCount = this.totalChunksCount; // 重置计数
        }
      }
    },

  /* ===============  播放监控  =============== */
  async startReadAudioPlayProcess() {
    /* 与对话版的 startAudioPlayProcess 完全一致，只是把 readState 替换掉 */
    this.readState.currentChunk = 0;
    this.readState.isPlaying   = false;
    this.audioPlayQueue = [];
  },

  async checkReadAudioPlayback() {
    if (this.isReadPaused) return;
    if (!this.isReadRunning || this.readState.isPlaying) return;

    const curIdx = this.readState.currentChunk;
    const total  = this.readState.ttsChunks.length;
    if (curIdx >= total) {
      console.log('All read audio chunks played');
      this.readState.currentChunk = 0;
      this.isReadRunning = false;
      this.cur_audioDatas = [];
      this.sendTTSStatusToVRM('allChunksCompleted', {});
      return;
    }

    const audioChunk = this.readState.audioChunks[curIdx];
    if (!audioChunk) return;

    this.readState.isPlaying = true;
    console.log(`Playing read audio chunk ${curIdx}`);
    this.scrollToCurrentChunk(curIdx);
    
    try {
      // --- 修改点 5：发送二进制数据到 VRM (照搬对话播放的核心逻辑) ---
      if ((this.vrmOnline || this.vtsOnline) && audioChunk.buffer) {
          const metadata = {
              type: 'audio_chunk',
              chunkIndex: curIdx,
              text: audioChunk.text,
              expressions: audioChunk.expressions,
              mimeType: audioChunk.mimeType || 'audio/wav'
          };
          this.sendBinaryToVRM(metadata, audioChunk.buffer);
      }

      this.currentReadAudio = new Audio(audioChunk.url);
      this.currentReadAudio.volume = this.vrmOnline ? 0.0000001 : 1; // VRM在线时静音

      // --- 修改点 6：剔除 audioDataUrl，仅发送状态指令 ---
      this.sendTTSStatusToVRM('startSpeaking', {
        chunkIndex: curIdx,
        totalChunks: total,
        text: audioChunk.text,
        expressions: audioChunk.expressions,
        voice: this.readState.chunks_voice[curIdx]
      });

      await new Promise(resolve => {
        this.currentReadAudio.onended = () => {
          this.sendTTSStatusToVRM('chunkEnded', { chunkIndex: curIdx });
          resolve();
        };
        this.currentReadAudio.onerror = resolve;
        this.currentReadAudio.play().catch(console.error);
      });
    } catch (e) {
      console.error('Read playback error', e);
    } finally {
      this.readState.currentChunk++;
      this.readState.isPlaying = false;
      setTimeout(() => this.checkReadAudioPlayback(), 0);
    }
  },
    async parseSelectedFile() {
        this.readConfig.longText = '';
        this.readConfig.longTextList = [];
        this.longTextListIndex = 0;
        // 根据选择的文件unique_filename在textFiles中查找对应的文件信息
        const selectedFile = this.textFiles.find(file => file.unique_filename === this.selectedFile);
        try {
          if (selectedFile) {
            // 构建完整的请求URL
            const url = `/get_file_content?file_url=${selectedFile.unique_filename}`;
            
            // 发送请求获取文件内容
            const response = await fetch(url, {
              method: 'GET',
              headers: { 'Content-Type': 'application/json' }
            });
            const data = await response.json();
            if (selectedFile.unique_filename.toLowerCase().endsWith('.epub')){
              // data.content转成字典
              let data_json = JSON.parse(data.content);
              this.readConfig.longTextList = data_json.chapters || [];
              if (this.readConfig.longTextList.length > 0){
                this.longTextListIndex = 0;
                this.readConfig.longText = this.readConfig.longTextList[0];
              }else{
                this.readConfig.longText = data.content;
              }
            }else{
              this.readConfig.longText = data.content;
            }
            // 如果this.readConfig.longText太长了，就只取前100000个
            // if (this.readConfig.longText.length > 100000) {
            //   this.readConfig.longText = this.readConfig.longText.substring(0, 100000);
            //   showNotification(this.t('contentTooLong'))
            // }
          }
        }
        catch (error) {
          console.error('Error:', error);
        }
    },
  NextPage() {
    if (this.longTextListIndex < this.readConfig.longTextList.length - 1) {
      this.longTextListIndex++;
      this.readConfig.longText = this.readConfig.longTextList[this.longTextListIndex];
    }
  },
  PrevPage() {
    if (this.longTextListIndex > 0) {
      this.longTextListIndex--;
      this.readConfig.longText = this.readConfig.longTextList[this.longTextListIndex];
    }
  },
  openAddTTSDialog() {
    this.newTTSConfig = {
      name: '',
      enabled: true,
      SampleText: 'super agent party链接一切！',
      engine: 'moss',
      edgettsLanguage: 'zh-CN',
      edgettsGender: 'Female',
      edgettsVoice: 'XiaoyiNeural',
      edgettsRate: 1.0,
      gsvServer: "http://127.0.0.1:9880",
      gsvTextLang: 'zh',
      gsvRate: 1.0,
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
      mossVoice: 'Junhao',
      mossSpeed: 1.0,
    };
    this.showAddTTSDialog = true;
  },

  saveNewTTSConfig() {
    const name = this.newTTSConfig.name;
    if (!name) return;

    this.ttsSettings.newtts[name] = { ...this.newTTSConfig };
    this.showAddTTSDialog = false;
    this.autoSaveSettings();
  },

  deleteTTS(name) {
    delete this.ttsSettings.newtts[name];
  },

  editTTS(name) {
    this.newTTSConfig = { ...this.ttsSettings.newtts[name] };
    this.showAddTTSDialog = true;
  },

  openAddAppearanceDialog() {
    this.newAppearanceConfig = {
      name: '',
      windowWidth: 540,
      windowHeight: 960,
      selectedModelId: 'alice', // 默认选择Alice模型
      selectedMotionIds: [],
    };
    this.showAddAppearanceDialog = true;
  },
  editAppearance(name) {
    this.newAppearanceConfig = { ...this.VRMConfig.newVRM[name] };
    this.showAddAppearanceDialog = true;
  },
  deleteAppearance(name) {
    delete this.VRMConfig.newVRM[name];
  },
  saveNewAppearanceConfig() {
    const name = this.newAppearanceConfig.name;
    if (!name) return;

    this.VRMConfig.newVRM[name] = { ...this.newAppearanceConfig };
    this.showAddAppearanceDialog = false;
    this.autoSaveSettings();
  },
  addBehavior() {
    // 深拷贝一份默认模板
    this.behaviorSettings.behaviorList.push(JSON.parse(JSON.stringify(this.newBehavior)));
    this.autoSaveSettings();
  },
  removeBehavior(idx) {
    this.behaviorSettings.behaviorList[idx].enabled = false;
    this.behaviorSettings.behaviorList.splice(idx, 1);
    showNotification(this.t('deleteBehaviorSuccess'))
    this.autoSaveSettings();
  },
  resetBehavior(idx) {
    this.behaviorSettings.behaviorList[idx] = JSON.parse(JSON.stringify(this.newBehavior));
    this.autoSaveSettings();
  },
  removeAllBehavior() {
    this.behaviorSettings.behaviorList.forEach((b) => {
      b.enabled = false;
    });
    this.behaviorSettings.behaviorList = [];
    showNotification(this.t('deleteAllBehaviorSuccess'))
    this.autoSaveSettings();
  },
    /* 真正执行行为 */
    runBehavior(b) {
      if (!b.enabled) return
      if (!this.noInputFlag){
        this.stopGenerate()
      }
      if (b.action.type === 'prompt' && b.action.prompt) {
        console.log('Prompt:', b.action.prompt)
        this.userInput= '[system]:'+ b.action.prompt
        // 这里把 prompt 发给你的模型即可，举例：
        this.sendMessage();
      }
      if (b.action.type === 'random' && b.action.random) {
        if(b.action.random.events.length > 0){
          if (b.action.random.type === 'random'){
            let randomEvent = b.action.random.events[Math.floor(Math.random() * b.action.random.events.length)];
            if(randomEvent){
              this.userInput= '[system]:'+randomEvent;
              // 这里把 prompt 发给你的模型即可，举例：
              this.sendMessage();
            }
          }else if( b.action.random.type === 'order'){
            if(b.action.random.orderIndex >= b.action.random.events.length){
              b.action.random.orderIndex = 0;
            }
            if(b.action.random.events[b.action.random.orderIndex]){
              let randomEvent = b.action.random.events[b.action.random.orderIndex];
              b.action.random.orderIndex += 1;
              if(randomEvent){
                this.userInput= '[system]:'+randomEvent;
                // 这里把 prompt 发给你的模型即可，举例：
                this.sendMessage();
              }
            }
          }
        }
      }
    },

    /* 触发一次后，如果是“不重复”就把 enabled 关掉 */
    disableOnceBehavior(b) {
      if (b.trigger.type === 'time' && !b.trigger.time.days.length && b.platform === 'chat') {
        b.enabled = false
        this.autoSaveSettings()
      }
    },
    handleAllBriefly(){
      this.allBriefly = !this.allBriefly;
      if(this.allBriefly){
        this.messages.forEach((m) => {
          m.briefly = true;
        })
      }else{
        this.messages.forEach((m) => {
          m.briefly = false;
        })
      }
    },
    async handleDownload(file) {
      // 构造文件URL（确保是完整URL）
      const fileUrl = `${this.partyURL}/uploaded_files/${file.unique_filename}`;
      console.log(fileUrl);
      if (isElectron) {
        try {
          await window.electronAPI.downloadFile({
            url: fileUrl,
            filename: file.original_filename || file.unique_filename
          });
        } catch (e) {
          console.error(e);
        }
      } else {
        // 非Electron环境保留原逻辑
        const link = document.createElement('a');
        link.href = fileUrl;
        link.download = file.unique_filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    },
  removeEvent(idx,index) {
    this.behaviorSettings.behaviorList[idx].action.random.events.splice(index, 1);
    this.autoSaveSettings(); // 删除后也触发自动保存
  },
  addNewEvent(idx) {
    this.behaviorSettings.behaviorList[idx].action.random.events.push(''); // 添加一个新的空事件，从而新增一个输入框
    this.autoSaveSettings();
  },

  // 初始化周期定时器
initCycleTimer(behavior, index) {
  if (this.cycleTimers[index]) {
    clearInterval(this.cycleTimers[index]);
  }
  const [hours, minutes, seconds] = behavior.trigger.cycle.cycleValue.split(':').map(Number);
  const cycleMs = (hours * 3600 + minutes * 60 + seconds) * 1000;
  let currentCount = 0;
  
  this.cycleTimers[index] = setInterval(() => {
    // 运行前再次确认启用状态和平台
    if (!behavior || !behavior.enabled || !this.isTargetPlatform(behavior, 'chat')) return;
    
    if (behavior.trigger.cycle.isInfiniteLoop || currentCount < behavior.trigger.cycle.repeatNumber) {
      this.runBehavior(behavior);
      currentCount++;
      if (!behavior.trigger.cycle.isInfiniteLoop && currentCount >= behavior.trigger.cycle.repeatNumber) {
        clearInterval(this.cycleTimers[index]);
        this.cycleTimers[index] = null;
        behavior.enabled = false;
      }
    }
  }, cycleMs);
},

// --- 修改重置逻辑 ---
resetCycleTimers() {
  // 防护：如果设置还没加载好，或者列表不存在，直接跳过
  if (!this.behaviorSettings || !Array.isArray(this.behaviorSettings.behaviorList)) {
    return;
  }

  // 确保 cycleTimers 是个数组
  if (!Array.isArray(this.cycleTimers)) {
    this.cycleTimers = [];
  }

  // 清除旧的计时器
  this.cycleTimers.forEach((timer, index) => {
    if (timer) clearInterval(timer);
    this.cycleTimers[index] = null;
  });

  // 重新初始化
  this.behaviorSettings.behaviorList.forEach((b, index) => {
    // 增加 b && b.trigger 的判断
    if (b && b.enabled && b.trigger && b.trigger.type === 'cycle' && this.isTargetPlatform(b, 'chat')) {
      this.initCycleTimer(b, index);
    }
  });
},


isTargetPlatform(behavior, platformKey) {
  // 1. 如果 behavior 本身不存在
  if (!behavior) return false;

  // 2. 检查新字段 platforms (数组)
  // 必须先判断 Array.isArray 且长度 > 0，才能读取 [0]
  if (behavior.platforms && Array.isArray(behavior.platforms) && behavior.platforms.length > 0) {
    if (behavior.platforms.includes('all')) return true;
    return behavior.platforms.includes(platformKey);
  }

  // 3. 兼容老数据：检查旧字段 platform (字符串)
  if (behavior.platform && typeof behavior.platform === 'string') {
    return behavior.platform === 'all' || behavior.platform === platformKey;
  }

  // 4. 兜底逻辑
  return platformKey === 'chat';
},

    startDriverGuide() {
      const KEY = 'driver_guide_shown';
      if (localStorage.getItem(KEY)) return;
      localStorage.setItem(KEY, '1');

      const driver = window.driver.js.driver;

      const d = driver({
        allowClose: true,
        disableActiveInteraction: false,
        showProgress: true,
        nextBtnText: this.t('next'),
        prevBtnText: this.t('prev'),
        doneBtnText: this.t('done'),
        steps: [
          {
            element: '#driver-guide-btn',
            popover: {
              title: this.t('guide.driver-guide-btn'),
              description: this.t('guide.driver-guide-btn-notice'),
              side: 'right',
              align: 'start',
            },
          },
          {
            element: '#model-config',
            popover: {
              title: this.t('guide.model-config'),
              description: this.t('guide.model-config-notice'),
              side: 'right',
              // 使用 onNextClick 替代 onNext
              onNextClick: async () => {
                await this.handleSelect('model-config');
                // 手动触发下一步导航
                d.moveNext();
              }
            },
          },
          {
            element: '#add-provider-card',
            popover: {
              title: this.t('guide.add-provider-card'),
              description: this.t('guide.add-provider-card-notice'),
              side: 'right',
              // 使用 onNextClick 替代 onNext
              onNextClick: () => {
                this.showAddDialog = true;
                setTimeout(() => d.moveNext(), 100); // 手动触发下一步导航
              }
            }
          },
          {
            element: '#show-Add-Dialog',
            popover: {
              title: this.t('guide.show-Add-Dialog'),
              description: this.t('guide.show-Add-Dialog-notice'),
              side: 'top',
              // 添加 onNextClick 处理逻辑
              onNextClick: async () => {
                // 1. 判断是否已选择供应商 (假设 newProviderTemp.vendor 为空即未选)
                if (!this.newProviderTemp.vendor) {
                  // 2. 确保供应商列表至少有3个，防止报错
                  if (this.vendorOptions && this.vendorOptions.length >= 3) {
                    // 取出第三个供应商的值 (数组索引从0开始，所以是2)
                    const thirdVendorValue = this.vendorOptions[2].value;
                    
                    // 调用你的选择方法，或者直接赋值
                    // this.newProviderTemp.vendor = thirdVendorValue; 
                    this.handleSelectVendor(thirdVendorValue);
                    
                    // 3. 等待 Vue 更新 DOM (这一步很重要，因为下一步要高亮"确认"按钮，
                    // 需要确保按钮的 disable 状态已被移除)
                    await this.$nextTick(); 
                  }
                }
                
                // 4. 手动触发下一步
                d.moveNext();
              }
            }
          },
          {
            element: '#confirm-Add-Provider-Button',
            popover: {
              title: this.t('guide.confirm-Add-Provider-Button'),
              side: 'right',
              // 使用 onNextClick 替代 onNext
              onNextClick: async () => {
                this.confirmAddProvider();
                // 手动触发下一步导航
                d.moveNext();
              }
            }
          },
          {
            element: '#get-API-key',
            popover: {
              title: this.t('guide.get-API-key'),
              description: this.t('guide.get-API-key-notice'),
              side: 'right',
              onPrevClick: () => {
                this.showAddDialog = true;
                setTimeout(() => d.moveNext(), 100); // 手动触发下一步导航
              },
            }
          },
          {
            element: '#input-api-Key',
            popover: {
              title: this.t('guide.input-api-Key'),
              description: this.t('guide.input-api-Key-notice'),
              side: 'right',
            }
          },
          {
            element: '#get-Models-List',
            popover: {
              title: this.t('guide.get-Models-List'),
              description: this.t('guide.get-Models-List-notice'),
              side: 'right',
            }
          },
          {
            element: '#model-Id',
            popover: {
              title: this.t('guide.model-Id'),
              description: this.t('guide.model-Id-notice'),
              side: 'right',
            }
          },
        ]
      });

      // 监听高亮元素点击
      const checkClick = (e) => {
        if (e.target.closest('#model-config')) {
          d.moveNext();
        }
        if (e.target.closest('#add-provider-card')) {
          d.moveNext();
        }
        if (e.target.closest('#confirm-Add-Provider-Button')) {
          d.moveNext();
        }
        if (e.target.closest('#get-API-key')) {
          d.moveNext();
        }
        if (e.target.closest('#get-Models-List')) {
          d.moveNext();
        }
        if (e.target.closest('#vendor-Option')) {
          setTimeout(() => d.moveNext(), 100); // 手动触发下一步导航
        }
      };
      document.addEventListener('click', checkClick);

      // 清理监听
      d.onDestroyed = () => document.removeEventListener('click', checkClick);

      setTimeout(() => d.drive(), 300);
    },


  // 手动重开引导（可绑定到按钮）
  restartDriverGuide() {
    localStorage.removeItem('driver_guide_shown');
    this.startDriverGuide();
  },
  showToolInfo(tool) {
    this.toolForShowInfo = tool;
    this.showToolInfoDialog = true;
  },
  toggleAssistantMode() {
    if (this.activeMenu != 'home' && this.activeMenu != 'dashboard'){
      this.activeMenu = 'home';
    }

    this.isPttMode = false;
    console.log('切换助手模式，当前状态:', this.isAssistantMode);

    if (this.isAssistantMode && !this.isMac) {
      // 退出助手模式，最大化窗口
      console.log('退出助手模式，最大化窗口');
      window.electronAPI.windowAction('maximize'); // 恢复默认大小
    } else {
      // 进入助手模式，设置为300x屏幕高度
      console.log('进入助手模式，设置大小为:', 340, 800);
      window.electronAPI.toggleWindowSize(340, 800);
    }

    this.sidePanelOpen = false;
    this.isAssistantMode = !this.isAssistantMode;
    console.log('切换完成，新状态:', this.isAssistantMode);
  },
    fixedWindow() {
    // 把新状态取反
    const next = !this.isFixedWindow;
    // 告诉主进程设置置顶
    window.electronAPI.setAlwaysOnTop(next);
    // 本地状态同步
    this.isFixedWindow = next;
  },
  handleScreenshotCommand(command) {
    if (command === 'hide') {
      // 点击了"隐藏窗口截图" -> 传入 true
      this.toggleScreenshot(true);
    } else if (command === 'no-hide') {
      // 点击了"当前窗口截图" -> 传入 false
      this.toggleScreenshot(false);
    }
  },

  // 修改：保留原有的截图逻辑，参数 hideMainWindow 决定是否隐藏
  async toggleScreenshot(hideMainWindow = true) {
    try {
      // 1. 调用遮罩
      const rect = await window.electronAPI.showScreenshotOverlay(hideMainWindow)
      
      if (!rect) return // 用户取消

      // 2. 裁剪
      const buf = await window.electronAPI.cropDesktop({ rect })

      // 3. 创建 Blob 和 File
      const blob = new Blob([buf], { type: 'image/png' })
      const file = new File([blob], `desktop_${Date.now()}.png`, { type: 'image/png' })

      // 4. ★ 关键修复：创建本地 URL 用于预览，并推入 images 数组
      const localUrl = URL.createObjectURL(blob)
      
      // 推入 images 数组（假设 allItems 是计算属性包含 images）
      this.images.push({ 
        file, 
        name: file.name, 
        path: localUrl,  // ★ 使用 blob URL 而不是空字符串
        type: 'image'    // ★ 明确标记类型，便于 allItems 处理
      })

      // ★ 如果 allItems 是独立数组，也需要同步推送
      // this.allItems.push({
      //   name: file.name,
      //   path: localUrl,
      //   type: 'image',
      //   file: file
      // })

    } catch (e) {
      console.error('截图失败:', e)
    } finally {
      // 5. 清理并恢复窗口
      await window.electronAPI.cancelScreenshotOverlay();
      window.electronAPI.windowAction('show');
    }
  },
  async toggleCapsuleMode() {
    this.activeMenu = 'home';
    this.isPttMode = false;
    if (this.isCapsuleMode && !this.isMac) {
      window.electronAPI.windowAction('maximize') // 恢复默认大小
    } else{
      window.electronAPI.toggleWindowSize(210, 80);
    }
    this.sidePanelOpen = false;
    this.isCapsuleMode = !this.isCapsuleMode;
  },
  toggleMinimalMode() {
    if (!this.isMinimalMode) {
      // 进入极简模式：打开独立极简窗口
      window.electronAPI.openMinimalWindow();
      this.isMinimalMode = true;

      // 监听极简窗口关闭事件（同步状态）
      if (window.electronAPI.onMinimalWindowClosed) {
        window.electronAPI.onMinimalWindowClosed(() => {
          this.isMinimalMode = false;
        });
      }
    } else {
      // 退出极简模式：关闭极简窗口
      window.electronAPI.closeMinimalWindow();
      this.isMinimalMode = false;
    }
    this.sidePanelOpen = false;
  },
  addPrompt() {
    this.promptForm = { id: null, name: '', content: '' };
    this.showPromptDialog = true;
  },
  editPrompt(row) {
    this.promptForm = { ...row };
    this.showPromptDialog = true;
  },
  savePrompt() {
    if (!this.promptForm.name || !this.promptForm.content) {
      showNotification(this.t('pleaseCompleteForm'), 'warning')
      return
    }
    if (!this.promptForm.id) {
      // 新增
      this.SystemPromptsList.push({
        id: Date.now(),
        name: this.promptForm.name,
        content: this.promptForm.content
      })
    } else {
      // 编辑：找到索引直接替换
      const idx = this.SystemPromptsList.findIndex(p => p.id === this.promptForm.id)
      if (idx > -1) {
        // 直接赋值即可，不需要 $set
        this.SystemPromptsList[idx] = { ...this.promptForm }
      }
    }
    this.showPromptDialog = false
    this.autoSaveSettings()
  },

  removePrompt(id) {
    const idx = this.SystemPromptsList.findIndex(p => p.id === id);
    if (idx > -1) this.SystemPromptsList.splice(idx, 1);
    this.autoSaveSettings();
  },
  /* 点击“使用”按钮 */
  usePrompt(content) {
    this.messages[0].content = content;
    this.activeMenu = 'home';      // 切换到主界面
    this.showEditDialog = false;
  },
  /* 主入口 */
  async handleTranslate() {
    if (!this.sourceText.trim() || this.isTranslating) return;
    this.isTranslating = true;
    this.translatedText = this.t('translating') + '…';

    const controller = new AbortController();
    this.translateAbortController = controller;

    // 构造 TTS 提示（与 translateMessage 保持一致）
    let newttsList = [];
    if (this.ttsSettings?.newtts) {
      for (const key in this.ttsSettings.newtts) {
        if (this.ttsSettings.newtts[key].enabled) newttsList.push(key);
      }
    }
    const ttsPrompt = '如果被翻译的文字与目标语言一致，则返回原文即可'

    try {
      const res = await fetch('/simple_chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.mainAgent,
          messages: [
            {
              role: 'system',
              content: `你是一位专业翻译，请将用户提供的任何内容严格翻译为${this.target_lang}，保持原有格式（如Markdown、换行等），不要添加任何额外内容。只需返回翻译结果。${ttsPrompt}`
            },
            {
              role: 'user',
              content: `请翻译以下内容到${this.target_lang}：\n\n${this.sourceText}`
            }
          ],
          stream: true,
          temperature: 0.1
        }),
        signal: controller.signal
      });

      if (!res.ok) {
        let errMsg = 'Network error';
        try {
          const errData = await res.json();
          errMsg = errData?.error?.message || errMsg;
        } catch (_) {}
        throw new Error(errMsg);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = ''; // 残余半截行
      let result = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // 最后一行可能不完整，留到下一轮

        for (const line of lines) {
          if (!line) continue; // 跳过空行
          try {
            const chunk = JSON.parse(line);
            const delta = chunk.choices?.[0]?.delta?.content ?? '';
            if (delta) {
              result += delta;
              this.translatedText = result; // 实时渲染
            }
          } catch {
            // 忽略解析失败
          }
        }
      }
    } catch (e) {
      if (e.name !== 'AbortError') {
        this.translatedText = `Translation error: ${e.message}`;
      }
    } finally {
      this.isTranslating = false;
      this.translateAbortController = null;
    }
  },

  abortTranslate () {
    this.translateAbortController?.abort()
    this.isTranslating = false
  },

  clearAll () {
    this.sourceText = ''
    this.translatedText = ''
  },
  changeLanguage() {
    this.target_lang = this.targetLangSelected!="system"? this.targetLangSelected: navigator.language || navigator.userLanguage || 'zh-CN';
    this.autoSaveSettings()
  },
  copyTranslated() {
    if (!this.translatedText) return
    navigator.clipboard.writeText(this.translatedText)
    showNotification(this.t('copy_success'))
  },
  handleShowAddMemoryDialog() {
    if (this.isGenerating){
      showNotification(this.t('AIgening'))
       return;
    }
    this.showAddMemoryDialog = true
  },
  async handleQuickGen() {
    if (!this.quickCreatePrompt.trim() || this.isGenerating) return;

    this.isGenerating = true;
    showNotification(this.t('startGen'));

    const controller = new AbortController();
    this.QuickGenAbortController = controller;

    const systemPrompt = `你是一名专业的角色设计师。  
  生成的角色卡内容必须与用户输入的语言保持一致。 比如，用户输入的是中文，那么角色卡内容也必须是中文。如果用户输入的是英文，那么角色卡内容也必须是英文。以此类推！
  用户会提供一个简短的创意，你必须仅回复一段**有效的 JSON**，并放在一个标准的Markdown 代码块中。  
  JSON的值必须用双引号括起来，而值内部的内容如果需要引号，一律改成单引号。
  mesExample包含5-10轮示例，alternateGreetings包含5-10条开场白，characterBook包含10条以上的关键词和内容。
  JSON 结构必须为：

    {
      "name": "角色名称",
      "description": "简要背景/世界观设定，尽可能详细",
      "personality": "性格特征",
      "mesExample": "展示 5-10 轮聊天示例，对话示例中禁止出现非对话表达（不要出现心理描写、动作描写等等，只要纯说话的部分），格式：用户:xxx\n角色:xxx",
      "systemPrompt": "用于驱动角色的系统提示",
      "firstMes": "角色的第一句问候语，问候语禁止出现非对话表达（不要出现心理描写、动作描写等等，只要纯说话的部分）",
      "alternateGreetings": ["可选问候2","可选问候3"],
      "characterBook": [
          {"keysRaw":"关键词1\n关键词2","content":"这里填入当用户提到关键词1或关键词2时，需要返回给AI看的内容……"},
          {"keysRaw":"关键词3","content":"这里填入当用户提到关键词3时，需要返回给AI看的内容……"}
      ]
    }

  所有字段都必须提供；characterBook也请尽可能的丰富，最好可以在10条以上，每条的字数可以不用太多。alternateGreetings最好也有5条以上。
  绝不可包含 avatar 字段。`;

    try {
      const res = await fetch('/simple_chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: this.quickCreatePrompt }
          ],
          stream: true,   // ★ 打开流式
          temperature: 0.8
        }),
        signal: controller.signal
      });

      if (!res.ok) {
        let errMsg = 'Network error';
        try { const errData = await res.json(); errMsg = errData?.error?.message || errMsg; } catch (_) {}
        throw new Error(errMsg);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';      // 残余半截行
      let fullText = '';    // 累积完整回复

      // 1. 实时读流
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // 最后一行可能不完整

        for (const line of lines) {
          if (!line) continue;
          try {
            const chunk = JSON.parse(line);
            const delta = chunk.choices?.[0]?.delta?.content ?? '';
            if (delta) {
              fullText += delta;
              this.quickCreatePrompt = fullText; // 实时显示
            }
          } catch {
            // 忽略解析失败
          }
        }
      }

      // 2. 流结束，再走原来的解析逻辑
      let raw = fullText.trim();

      // 去 code-block
      const codeBlock = raw.match(/^```json\s*([\s\S]*?)```$/);
      if (codeBlock) raw = codeBlock[1];
      const tildeBlock = raw.match(/^```\s*([\s\S]*?)```$/);
      if (tildeBlock) raw = tildeBlock[1];

      // 解析 JSON
      let json;
      try {
        json = JSON.parse(raw);
      } catch (e) {
        throw new Error('AI 返回的不是合法 JSON：' + e.message);
      }

      // 3. 写入 newMemory 并保存
      Object.assign(this.newMemory, {
        name: json.name ?? '',
        infer:false,
        providerId: null,
        model: '',
        base_url: '',
        api_key: '',
        vendor: '',
        description: json.description ?? '',
        personality: json.personality ?? '',
        mesExample: json.mesExample ?? '',
        systemPrompt: json.systemPrompt ?? '',
        firstMes: json.firstMes ?? '',
        alternateGreetings: json.alternateGreetings?.filter(Boolean) ?? [],
        characterBook: (json.characterBook ?? []).map(b => ({
          keysRaw: b.keysRaw ?? '',
          content: b.content ?? ''
        })),
        avatar: ''
      });
      this.newMemory.id = null;
      this.addMemory();
      showNotification(this.t('genSuccess'));

    } catch (e) {
      if (e.name === 'AbortError') {
        console.log('QuickGen aborted');
      } else {
        showNotification(this.t('genFailed') + ': ' + e.message, 'error');
      }
    } finally {
      this.isGenerating = false;
      this.QuickGenAbortController = null;
      this.quickCreatePrompt = '';
    }
  },
  stopQuickGen() {
    this.QuickGenAbortController?.abort()
    this.isGenerating = false
  },
  async handleSystemPromptQuickGen() {
    if (!this.quickCreateSystemPrompt.trim() || this.isSystemPromptGenerating) return;
    
    this.isSystemPromptGenerating = true;
    this.promptForm.name = this.quickCreateSystemPrompt;
    showNotification(this.t('startGen'));
    
    const controller = new AbortController();
    this.QuickGenSystemPromptAbortController = controller;
    
    try {
      const res = await fetch('/simple_chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.mainAgent,
          messages: [
            {
              role: 'system',
              content: `你需要将用户发给你的简短的系统提示词优化成可以驱动大模型更好的工作的详细的系统提示词。
  注意！生成的系统提示词必须与用户输入的语言保持一致。如果用户说英文，你就必须生成英文的系统提示词；如果用户说中文，你就必须生成中文的系统提示词。以此类推！
  你可以从这几个方面来写，但也不要限于这些方面：角色名、角色定位、核心能力、回答风格、约束、输出格式示例等等`,
            },
            {
              role: 'user',
              content: `${this.quickCreateSystemPrompt}`,
            },
          ],
          stream: true,
          temperature: 0.8
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        let errMsg = 'Network error';
        try { const errData = await res.json(); errMsg = errData?.error?.message || errMsg; } catch (_) {}
        throw new Error(errMsg);
      }
      
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let result = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        
        for (let i = 0; i < lines.length - 1; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          
          try {
            const data = JSON.parse(line);
            
            // 适配新的流式响应格式
            if (data.choices && data.choices[0]) {
              const choice = data.choices[0];
              
              // 处理流式响应中的增量内容
              if (choice.delta && choice.delta.content) {
                result += choice.delta.content;
                this.quickCreateSystemPrompt = result;
              }
              // 或者处理 finish_reason 为 stop 的最终响应
              else if (choice.finish_reason === 'stop') {
                // 最终完成，不需要额外处理
              }
            }
          } catch (e) {
            console.warn('Failed to parse SSE line:', line, e);
          }
        }
        
        buffer = lines[lines.length - 1];
      }
      
      // 处理可能剩余的缓冲数据
      if (buffer.trim()) {
        try {
          const data = JSON.parse(buffer);
          if (data.choices && data.choices[0] && data.choices[0].delta && data.choices[0].delta.content) {
            result += data.choices[0].delta.content;
            this.quickCreateSystemPrompt = result;
          }
        } catch (e) {
          console.warn('Failed to parse remaining buffer:', buffer, e);
        }
      }
      
      // 保存生成的提示词
      this.promptForm.content = this.quickCreateSystemPrompt;
      this.promptForm.id = null;
      await this.savePrompt();
      
      showNotification(this.t('genSuccess'));
      this.quickCreateSystemPrompt = '';
      
    } catch (e) {
      if (e.name === 'AbortError') {
        // 用户取消了生成，不需要显示错误
        console.log('System prompt generation was aborted');
      } else {
        console.error('System prompt generation failed:', e);
        showNotification(this.t('genFailed') + ': ' + e.message, 'error');
      }
    } finally {
      this.isSystemPromptGenerating = false;
      this.QuickGenSystemPromptAbortController = null;
    }
  },
  stopSystemPromptQuickGen() {
    this.QuickGenSystemPromptAbortController?.abort()
    this.isSystemPromptGenerating = false
  },
  async toggleQuickGen(index) {
    let systemPrompt = this.messages[index].content;
    if (!systemPrompt.trim()) {
      showNotification(this.t('noSystemPromptToExtend'), 'error');
      return;
    }
    
    showNotification(this.t('startGen'));
    this.isQuickGenerating = true;
    const abortController = new AbortController();
    this.abortController = abortController;
    
    try {
      const res = await fetch('/simple_chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.mainAgent,
          messages: [
            {
              role: 'system',
              content: `你需要将用户发给你的简短的系统提示词优化成可以驱动大模型更好的工作的详细的系统提示词。
  注意！生成的系统提示词必须与用户输入的语言保持一致。如果用户说英文，你就必须生成英文的系统提示词；如果用户说中文，你就必须生成中文的系统提示词。以此类推！
  你可以从这几个方面来写，但也不要限于这些方面：角色名、角色定位、核心能力、回答风格、约束、输出格式示例等等`
            },
            {
              role: 'user',
              content: `${systemPrompt}`,
            },
          ],
          stream: true,
          temperature: 0.8
        }),
        signal: this.abortController.signal,
      });

      if (!res.ok) {
        let errMsg = 'Network error';
        try { const errData = await res.json(); errMsg = errData?.error?.message || errMsg; } catch (_) {}
        throw new Error(errMsg);
      }
      
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let result = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        
        for (let i = 0; i < lines.length - 1; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          
          try {
            const data = JSON.parse(line);
            
            // 适配新的流式响应格式
            if (data.choices && data.choices[0]) {
              const choice = data.choices[0];
              
              // 处理流式响应中的增量内容
              if (choice.delta && choice.delta.content) {
                result += choice.delta.content;
                this.messages[index].content = result;
                this.requestScrollToBottom();
              }
              // 或者处理 finish_reason 为 stop 的最终响应
              else if (choice.finish_reason === 'stop') {
                // 最终完成，不需要额外处理
              }
            }
          } catch (e) {
            console.warn('Failed to parse SSE line:', line, e);
          }
        }
        
        buffer = lines[lines.length - 1];
      }
      
      // 处理可能剩余的缓冲数据
      if (buffer.trim()) {
        try {
          const data = JSON.parse(buffer);
          if (data.choices && data.choices[0] && data.choices[0].delta && data.choices[0].delta.content) {
            result += data.choices[0].delta.content;
            this.messages[index].content = result;
            this.requestScrollToBottom();
          }
        } catch (e) {
          console.warn('Failed to parse remaining buffer:', buffer, e);
        }
      }
      
      showNotification(this.t('genSuccess'));
      
    } catch (e) {
      if (e.name === 'AbortError') {
        // 用户取消了生成，不需要显示错误
        console.log('Quick generation was aborted');
      } else {
        console.error('Quick generation failed:', e);
        showNotification(this.t('genFailed') + ': ' + e.message, 'error');
      }
    } finally {
      this.isQuickGenerating = false;
      this.abortController = null;
    }
  },
  saveSystemPrompt(index) {
    let systemPrompt = this.messages[index].content;
    this.activeMenu = 'role';
    this.subMenu = 'memory';
    this.activeMemoryTab = 'prompts';
    this.promptForm = { id: null, name: '', content: systemPrompt };
    this.showPromptDialog = true;
  },
  async browseDirectory() {
    if (!this.isElectron) {
      // 浏览器环境
      return;
    } else {
      // Electron 环境
      try {
        const result = await window.electronAPI.openDirectoryDialog();
        if (!result.canceled && result.filePaths.length > 0) {
          this.CLISettings.cc_path = result.filePaths[0];
          this.autoSaveSettings();
        }
      } catch (error) {
        console.error('选择目录出错:', error);
        showNotification('选择目录失败', 'error');
      }
    }
  },
  
  _toggleHighlight(e) {
    const blk = e.target.closest('.highlight-block');
    if (!blk) return;
    blk.classList.toggle('expanded');
  },
  changeSystemPrompt() {
    this.editContent = this.SystemPromptsList.find(prompt => prompt.id === this.selectSystemPromptId)?.content;
  },
/* -------------------------------------------------- */
/* 1. 自动分段（复用全文算法）                       */
/* -------------------------------------------------- */
reSegment() {
  this.stopSegmentTTS();          // 停旧音频
    const {
      chunks,
      chunks_voice,
      remaining,
      remaining_voice
    } = this.splitTTSBuffer(this.readConfig.longText);

    if (remaining) {
      chunks.push(remaining);
      chunks_voice.push(remaining_voice);
    }

      /* ================= 新增：去标签 + 去空白并同步删除 ================= */
      // 1. 去 HTML 标签
      const cleanedChunks = chunks.map(txt => txt.replace(/<\/?[^>]+>/g, '').trim());

      // 2. 过滤空白并同步删除 chunks_voice 对应项
      const finalChunks       = [];
      const finalChunksVoice  = [];

      cleanedChunks.forEach((txt, idx) => {
        if (txt) {                      // 非空才保留
          finalChunks.push(txt);
          finalChunksVoice.push(chunks_voice[idx]);
        }
      });

      // 3. 覆盖原来的数组
      chunks.length       = 0;
      chunks_voice.length = 0;
      chunks.push(...finalChunks);
      chunks_voice.push(...finalChunksVoice);
      /* ================================================================ */

  this.readState.ttsChunks = chunks;
  this.readState.chunks_voice = chunks_voice;
  this.readState.audioChunks  = new Array(this.readState.ttsChunks.length);
  this.readState.currentChunk = -1;
},

/* -------------------------------------------------- */
/* 2. 播放单句（含 VRM 同步）                        */
/* -------------------------------------------------- */
async playSingleSegment(idx) {
  try{
    if (!this.readState.ttsChunks[idx]) return;
    this.isReadingOnetext = true;
    this.readState.currentChunk = idx;
    const chunk = this.readState.ttsChunks[idx];
    const voice = this.readState.chunks_voice[idx];
    const cachedAudio = this.readState.audioChunks[idx];

    // ★ 核心修复：独立播放时，也将其视作一次全新的会话
    this.sendTTSStatusToVRM('stopSpeaking', {});
    this.readState.vrmIndex = 0; // 无论点第几行，VRM 那边收到的都是 0 
    this.sendTTSStatusToVRM('ttsStarted', { totalChunks: 1 });

    if (cachedAudio?.url && cachedAudio?.buffer && cachedAudio?.text === chunk && cachedAudio?.voice === voice) {
      this.doPlayAudio(this.readState.audioChunks[idx].url, idx, false);
      return;
    }
    
    // 未命中先合成
    await this.synthSegment(idx);
    this.doPlayAudio(this.readState.audioChunks[idx].url, idx, false);
  } finally {
    this.isReadingOnetext = false;
  }
},

/* -------------------------------------------------- */
/* 3. 连续播放开关                                   */
/* -------------------------------------------------- */
async toggleContinuousPlay() {
  if (this.readState.isPlaying) {          
    this.stopSegmentTTS(false);
    return;
  }
  this.readState.isPlaying = true;
  if (this.readState.currentChunk < 0 || this.readState.currentChunk >= this.readState.ttsChunks.length) { 
    this.readState.currentChunk = 0;         
  }

  // ★ 核心修复：强行中止之前不管有没有播完的状态，并重置 VRM 的期待序号
  this.sendTTSStatusToVRM('stopSpeaking', {});
  this.readState.vrmIndex = 0; // 重置虚拟序号
  this.sendTTSStatusToVRM('ttsStarted', {
    totalChunks: this.readState.ttsChunks.length - this.readState.currentChunk
  });

  await this.playNextInQueue(true);
},

/* -------------------------------------------------- */
/* 4. 新增：仅播放下一句（播完即停）                  */
/* -------------------------------------------------- */
async playNextSegmentOnce() {
  let next = this.readState.currentChunk + 1;
  this.readState.currentChunk = next;
  if (next >= this.readState.ttsChunks.length) {
    next = 0;
    this.readState.currentChunk = next;
  }
  this.readState.isPlaying = false;      // 确保不自动连播
  await this.playSingleSegment(next);    // 播完即停
},

/* -------------------------------------------------- */
/* 5. 停止所有分段音频                               */
/* -------------------------------------------------- */
stopSegmentTTS(isEnd = true) {
  this.stopTTSActivities();
  if (isEnd){
    this.readState.currentChunk = -1;
  }
  if (this._curAudio) {
    this._curAudio.pause();
    this._curAudio = null;
  }
  this.readState.isPlaying   = false;
},
/* -------------------------------------------------- */
/* 6. 编辑段文本                                      */
/* -------------------------------------------------- */
toggleEditSegment(idx) {
  if (this.activeSegmentIdx === idx) {
    // 保存：把临时值写回正式字段
    this.readState.ttsChunks[idx] = this.segmentEditBuffer
    this.readState.chunks_voice[idx] = this.segmentVoiceEditBuffer[idx] ?? this.readState.chunks_voice[idx]
    this.activeSegmentIdx = -1
  } else {
    // 进入编辑：先给“音色临时数组”对应位置塞个初始值
    this.segmentEditBuffer = this.readState.ttsChunks[idx]
    // Vue3 直接赋值即可
    this.segmentVoiceEditBuffer[idx] = this.readState.chunks_voice[idx]
    this.activeSegmentIdx = idx
  }
},

/* 1. 合成时顺便转 base64 */
async synthSegment(idx) {
  try {
    const text  = this.readState.ttsChunks[idx];
    const voice = this.readState.chunks_voice[idx] || 'default';
    /* —— 文本清洗 —— */
    let chunk_text = text;
    let chunk_expressions =[];
    if (text.indexOf('<') !== -1) {
      const tagReg = /<[^>]+>/g;
      chunk_expressions = (text.match(tagReg) || []).map(t => t.slice(1, -1));
      chunk_text = text.replace(tagReg, '').trim(); 
    }
    const res = await fetch('/tts', {
      method : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body   : JSON.stringify({ ttsSettings: this.ttsSettings, text, index: idx, voice }),
    });
    if (!res.ok) throw new Error('TTS failed');

    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);

    /* 关键修改：直接获取二进制 ArrayBuffer，不转 Base64 */
    const audioBuffer = await blob.arrayBuffer();

    /* 缓存数据 */
    this.readState.audioChunks[idx] = {
      url,                       // 本地播放用
      expressions: chunk_expressions,
      buffer: audioBuffer,       // VRM 二进制播放用
      mimeType: blob.type,       // 记录真实格式
      text: chunk_text,
      idx,
      voice
    };
  } catch (e) {
    console.error(`TTS chunk ${idx} error`, e);
    this.readState.audioChunks[idx] = { 
      url: null, 
      buffer: null,
      expressions: [],
      text: "",
      idx 
    };
  }
},
scrollToCurrentChunk(idx) {
  // 使用 nextTick 确保 DOM 更新完成
  this.$nextTick(() => {
    const segmentList = document.querySelector('.segment-list');
    const segmentItem = document.querySelector(`.segment-item:nth-child(${idx + 1})`);
    if (segmentList && segmentItem) {
      segmentItem.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
    }
  });
},

async doPlayAudio(url, idx, continuous = false) {
  // 1. 安全地清理上一段音频
  if (this._curAudio) {
    // 只有在音频被强行打断（还没播完/没暂停）时，才通知 VRM 停止。自然播完不发！
    const isActuallyPlaying = !this._curAudio.paused && !this._curAudio.ended;
    this._curAudio.pause();
    if (isActuallyPlaying) {
      this.sendTTSStatusToVRM('stopSpeaking', {});
    }
    this._curAudio = null;
  }

  try {
    const audio = new Audio(url);
    this._curAudio = audio;

    // 滚动到当前行
    this.scrollToCurrentChunk(idx);

    const chunk = this.readState.audioChunks[idx];

    // 2. 防止二进制被底层消耗导致二次点击没声音
    if (!chunk.buffer || chunk.buffer.byteLength === 0) {
        if (chunk.url) {
            try {
                const res = await fetch(chunk.url);
                chunk.buffer = await res.arrayBuffer();
                if (!chunk.mimeType) chunk.mimeType = res.headers.get('content-type') || 'audio/wav';
            } catch(e) {
                console.warn("Failed to restore buffer", e);
            }
        }
    }

    // 3. ★ 核心修复：获取专属的 VRM 虚拟序号
    if (this.readState.vrmIndex === undefined) {
        this.readState.vrmIndex = 0;
    }
    const currentVrmIndex = this.readState.vrmIndex;

    // 4. 发送纯二进制数据到 VRM (使用虚拟序号)
    if ((this.vrmOnline || this.vtsOnline) && chunk.buffer && chunk.buffer.byteLength > 0) {
        const metadata = {
            type: 'audio_chunk',
            chunkIndex: currentVrmIndex, // <--- 使用虚拟序号
            text: chunk.text,
            expressions: chunk.expressions,
            mimeType: chunk.mimeType || 'audio/wav'
        };
        this.sendBinaryToVRM(metadata, chunk.buffer.slice(0));
    }

    this._curAudio.volume = this.vrmOnline ? 0.0000001 : 1; // VRM在线时静音

    // 5. 仅发送状态指令 (使用虚拟序号)
    this.sendTTSStatusToVRM('startSpeaking', {
      chunkIndex: currentVrmIndex, // <--- 使用虚拟序号
      totalChunks: this.readState.ttsChunks.length,
      text: chunk.text,
      expressions: chunk.expressions || [],
      voice: this.readState.chunks_voice[idx] || 'default',
    });

    // 6. ★ 序号递增，为连播下一句准备完美的 0,1,2 顺位
    this.readState.vrmIndex++;

    // 监听错误事件
    audio.addEventListener('error', (e) => {
      console.error('Audio load error', e);
      this.readState.currentChunk++;
      if (this.readState.currentChunk < this.readState.ttsChunks.length && continuous) {
        this.playNextInQueue(true);
      } else {
        this.stopSegmentTTS(false);
      }
    });

    await new Promise(resolve => {
      this._curAudio.addEventListener('ended', () => {
        // 使用同样的虚拟序号通知结束
        this.sendTTSStatusToVRM('chunkEnded', { chunkIndex: currentVrmIndex });
        
        if (continuous && this.readState.isPlaying) {
          this.readState.currentChunk++;
          if (this.readState.currentChunk < this.readState.ttsChunks.length) {
            this.playNextInQueue(true);
          } else {
            this.stopSegmentTTS(false);
          }
        } else {
          this.stopSegmentTTS(false);
        }
        resolve();
      });
      
      console.log('play audio', `${idx + 1}`);
      audio.play().catch(e => {
        console.error('Audio play error', e);
        this.readState.currentChunk++;
        if (this.readState.currentChunk < this.readState.ttsChunks.length && continuous) {
          this.playNextInQueue(true);
        } else {
          this.stopSegmentTTS(false);
        }
        resolve(); 
      });
    });
  } catch (e) {
    console.error('Read playback error', e);
    this.readState.currentChunk++;
    if (this.readState.currentChunk < this.readState.ttsChunks.length && continuous) {
      this.playNextInQueue(true);
    } else {
      this.stopSegmentTTS(false);
    }
  } finally {
      this.isReadingOnetext = false;
  }
},

// 连续播放专用：自动合成&播放下一帧
async playNextInQueue(continuous) {
  const idx = this.readState.currentChunk;   // 当前要播的索引
  const chunk = this.readState.ttsChunks[idx];
  const voice = this.readState.chunks_voice[idx];
  const cachedAudio = this.readState.audioChunks[idx];

  // --- 核心修复：将 base64 改为 buffer ---
  if (cachedAudio?.url && cachedAudio?.buffer && cachedAudio?.text === chunk && cachedAudio?.voice === voice) {
    // 命中就无事发生
  } else {
    await this.synthSegment(idx);
  }
  this.doPlayAudio(this.readState.audioChunks[idx].url, idx, continuous);
},

// 清空分段
clearSegments() {
  this.stopSegmentTTS();
  this.readState.ttsChunks   = [];
  this.readState.chunks_voice = [];
  this.readState.audioChunks  = [];
  this.readState.currentChunk = -1;
},
  // 扫描扩展但不自动加载
  async scanExtensions() {
    try {
      // 使用API获取扩展列表
      const response = await fetch('/api/extensions/list');
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || '获取扩展列表失败');
      }
      
      const data = await response.json();
      this.extensions = data.extensions || [];
      
      // 不再自动加载第一个扩展
      // 默认显示 sidePanelText 内容
      this.currentExtension = null;
      this.sidePanelURL = '';
    } catch (error) {
      console.error('扫描扩展出错:', error);
    }
  },
  
    // 加载指定扩展
  async loadExtension(extension) {
    if (!extension) {
      this.currentExtension = null;
      this.sidePanelURL = '';
      return;
    }
    
    /* 1. 尝试 Node 模式 */
    try {
      const r = await fetch(`/api/extensions/${extension.id}/start-node`, { method: 'POST' });
      const res = await r.json();

      if (res.mode === 'node') {
        // ✅ Node 成功
        this.currentExtension = extension;
        this.sidePanelURL = `/api/extensions/${extension.id}/node/`;
        showNotification(`${this.t('loadExtension(node)')}: ${extension.name}`, 'success');
        return;
      } else if (res.mode === 'error') {
        // ❌ Node 服务启动失败！必须拦截并展示错误，不能往下走
        showNotification(`插件服务启动失败: ${res.message}`, 'error');
        console.error("【Node Extension 报错】:", res.message);
        return; 
      }
      
      // 只有 res.mode === 'static'，才允许跳出 if，去走下面的静态路由兜底
    } catch (e) {
      // 网络断开或解析异常，也建议拦截
      showNotification(`请求插件服务异常: ${e.message}`, 'error');
      console.error(e);
      return; 
    }

    /* 2. 回退静态路由 */
    this.currentExtension = extension;
    this.sidePanelURL = `/ext/${extension.id}/index.html`;
    showNotification(`${this.t('loadExtension(static)')}: ${extension.name}`, 'success');
    this.extensionsSystemPromptsDict[extension.id] = extension.systemPrompt || ""; // 更新提示词
  },
  
// 切换到默认视图 (主页书签)
  resetToDefaultView() {
    // 1. 切换焦点为 null，利用 v-show 机制隐藏所有 iframe，展示主页内容
    this.currentExtension = null;
    this.sidePanelURL = ''; // 清除旧的全局URL状态，防止污染
    this.activeSideView = 'list'; // 确保侧边栏内部路由切回“列表”

    // 2. 关闭可能开着的弹窗
    this.showExtensionsDialog = false;

    // 3. ✨ 核心修改：移除这下面两行代码！
    // this.expandChatArea();     // ❌ 不要强行扩张聊天区
    // this.collapseSidePanel();  // ❌ 不要强行收起侧边栏，用户只是切回主标签，侧边栏应该开着！

    // 4. 重置当前对话的附加提示词（切回默认对话，清空扩展的系统 Prompt 是合理的）
    this.extensionsSystemPromptsDict = {}; 

    // 5. 如果离开任务中心，清除任务刷新定时器以节省性能（保持原逻辑）
    if (this.taskRefreshTimer) {
      clearInterval(this.taskRefreshTimer);
      this.taskRefreshTimer = null; // 顺手置空是个好习惯
    }

    console.log('已切换到侧边栏主视图 (Home Tab)');
  },
  // 打开扩展选择对话框
  openExtensionsDialog() {
    this.showExtensionsDialog = true;
  },
  
// 切换（或新开）扩展标签页
  async switchExtension(extension) {
    // 1. 关闭扩展弹窗，展开侧边栏
    this.showExtensionsDialog = false; 
    const sidePanel = this.$refs.sidePanelRef;
    if (sidePanel.style.width == 0 ){
        this.expandSidePanel();
    }

    // 2. 检查这个扩展是否已经在多开数组里了
    const existingExt = this.openedExtensions.find(e => e.id === extension.id);

    if (existingExt) {
      // 🌟 【已打开过】：直接切换焦点，不重新加载，保留页面状态！
      this.currentExtension = existingExt;
      this.activeSideView = 'iframe'; // 确保视图模式是 iframe
      
      // 如果你的底层代码仍依赖全局的 sidePanelURL，这里做个同步
      if (existingExt.iframeUrl) {
        this.sidePanelURL = existingExt.iframeUrl;
      }
      
    } else {
      // 🌟 【第一次打开】：需要走加载逻辑
      // 为了让 loading 动画立刻出来，先将当前扩展指向它
      this.currentExtension = extension;
      this.activeSideView = 'iframe';
      this.sidePanelURL = ''; // 清空全局URL防止闪烁旧画面
      
      // 加入顶部标签栏数组
      this.openedExtensions.push(extension);

      // 执行你原本的获取 URL/Token 逻辑
      await this.loadExtension(extension);

      // 💡 极其关键的一步：loadExtension 执行完后，通常会给 this.sidePanelURL 赋值。
      // 我们需要把这个生成的专属 URL，保存到当前这个扩展对象里，这样下次切换回来才不会丢！
      const targetExt = this.openedExtensions.find(e => e.id === extension.id);
      if (targetExt) {
        // 将全局生成的 URL 永久绑定给这个 Tab
        targetExt.iframeUrl = this.sidePanelURL; 
      }
    }
  },

  // ✨ 配套新增：关闭扩展标签页
  closeExtensionTab(extId) {
    // 1. 从已打开数组中移除
    const index = this.openedExtensions.findIndex(e => e.id === extId);
    if (index === -1) return;
    
    this.openedExtensions.splice(index, 1);

    // 2. 如果关闭的刚好是【当前正在看】的标签页，需要处理焦点回退
    if (this.currentExtension && this.currentExtension.id === extId) {
      if (this.openedExtensions.length > 0) {
        // 如果还有其他标签，自动跳到最后一个标签
        const lastExt = this.openedExtensions[this.openedExtensions.length - 1];
        this.switchExtension(lastExt);
      } else {
        // 如果全关光了，退回默认的列表主页
        this.resetToDefaultView();
      }
    }
  },

  // 工具函数：返回扩展真正能访问的地址（Node > 静态）
  async getExtensionURL(ext) {
    console.log('获取扩展URL', ext);
    // 1. 先尝试启动 Node
    try {
      const r = await fetch(`/api/extensions/${ext.id}/start-node`, { method: 'POST' });
      const res = await r.json();
      if (res.mode === 'node') {
        return `/api/extensions/${ext.id}/node/`;   // ✅ Node 代理路径
      }
      console.log('启动 Node 失败，回退静态',res);
    } catch { 
     }
    // 2. 回退静态
    return `/ext/${ext.id}/index.html`;
  }, 

    async openExtension(extension) {
      const url = await this.getExtensionURL(extension);   // ⬅️ 异步拿地址
      console.log('打开扩展', `${this.partyURL}${url}`);
      if (isElectron) {
        window.electronAPI.openExternal(`${this.partyURL}${url}`);
      } else {
        window.open(url, '_blank');
      }
    },
    // 删除扩展
    async removeExtension(ext) {
      // 若是 Node 模式就停进程，忽略错误
      await fetch(`/api/extensions/${ext.id}/stop-node`, { method: 'POST' }).catch(() => {});
      try {
        const res = await fetch(`/api/extensions/${ext.id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('删除失败');
        showNotification(this.t('deleteSuccess'), 'success');
        this.scanExtensions(); // 刷新列表
      } catch (e) {

         showNotification(e.message, 'error');
      }
    },

    // 打开「添加扩展」对话框
    openAddExtensionDialog() {
      this.newExtensionUrl = '';
      this.showExtensionForm = true;
      this.fetchRemotePlugins();
    },

    async pollInstallStatus(extId, onSuccess, onError) {
      const poll = async () => {
        try {
          const res = await fetch(`/api/extensions/task-status/${extId}`);
          const data = await res.json();

          if (data.status === 'success') {
            // 安装成功
            onSuccess(data.detail);
          } else if (data.status === 'error') {
            // 安装失败
            onError(data.detail);
          } else if (data.status === 'installing') {
             // 仍在安装中，继续轮询 (这里可以顺便更新界面提示，如果你有对应UI的话)
             // 例如：console.log(data.detail); 
             setTimeout(poll, 1000); // 1秒后再次检查
          } else {
             // 未知状态，可能是重启了或者ID错了
             onError("任务状态丢失");
          }
        } catch (e) {
          onError("网络请求错误");
        }
      };
      // 开始第一次轮询
      poll();
    },

    // 真正「安装」按钮触发
    async addExtension() {
      const url = this.newExtensionUrl.trim();
      if (!url) return showNotification('请输入 GitHub 地址', 'error');
      
      this.installLoading = true; // 开启 Loading 遮罩
      
      try {
        const res = await fetch('/api/extensions/install-from-github', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            url,
            backupUrl: ""  
          }),
        });
        
        if (res.status === 409) throw new Error(this.t('extensionExists'));
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.detail || this.t('deleteFailed'));
        }

        const resData = await res.json();
        const extId = resData.ext_id;

        // --- 核心修改：开始轮询 ---
        showNotification('正在后台下载，请稍候...', 'info');
        
        this.pollInstallStatus(
          extId,
          (msg) => {
            // 成功回调
            this.installLoading = false;
            showNotification(msg || '安装成功！', 'success');
            this.showExtensionForm = false; // 关闭弹窗
            this.scanExtensions(); // 立即刷新列表
          },
          (errMsg) => {
            // 失败回调
            this.installLoading = false;
            showNotification(`安装失败: ${errMsg}`, 'error');
          }
        );

      } catch (e) {
        this.installLoading = false;
        showNotification(e.message, 'error');
      }
    },
    // 打开文件选择器
    selectLocalZip() {
      this.$refs.zipInput.click();
    },

    // 选中文件后自动上传
    async onZipSelected(e) {
      const file = e.target.files?.[0];
      if (!file) return;
      
      this.installLoading = true;
      const form = new FormData();
      form.append('file', file);
      
      try {
        const res = await fetch('/api/extensions/upload-zip', {
          method: 'POST',
          body: form,
        });
        
        if (res.status === 409) throw new Error(this.t('extensionExists'));
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.detail || '上传失败');
        }
        
        const resData = await res.json();
        const extId = resData.ext_id;
        
        // 开始轮询，与 GitHub 安装一致
        showNotification(this.t('waitExtensionInstall'), 'info');
        this.showExtensionForm = false;
        
        this.pollInstallStatus(
          extId,
          (msg) => {
            this.installLoading = false;
            showNotification(msg || this.t('installSuccess'), 'success');
            this.scanExtensions();
          },
          (errMsg) => {
            this.installLoading = false;
            showNotification(`${this.t('installFailed')}: ${errMsg}`, 'error');
          }
        );
        
      } catch (err) {
        this.installLoading = false;
        showNotification(err.message, 'error');
      } finally {
        e.target.value = '';
      }
    },

    async fetchRemotePlugins() {
      try {
        await this.scanExtensions(); // 刷新
        const res = await fetch('/api/extensions/remote-list');
        const { plugins } = await res.json();   // 取出 plugins 数组
        console.log(plugins);
        const localRes = await fetch('/api/extensions/list');
        const { extensions } = await localRes.json();
        console.log(extensions);
        this.remotePlugins = plugins.map(r => ({
          ...r,
          installed: extensions.some(l => l.repository.trim() === r.repository.trim()),
        }));
      } catch (e) {
        
      }
    },
    async togglePlugin(plugin) {
      if (plugin.installed) {
        // 卸载逻辑保持不变...
        await this.removeExtension(plugin);
        plugin.installed = false;
      } else {
        // --- 安装逻辑 ---
        
        // 1. 设置局部 loading 状态
        plugin.installing = true;
        this.installLoading = true; 

        try {
          // 获取用户设置的 GitHub 仓库代理网址
          const githubProxy = this.systemSettings.githubProxy || "";

          const res = await fetch('/api/extensions/install-from-github', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              url: plugin.repository,
              githubProxy: githubProxy // 使用用户自定义代理，不使用旧 backupRepository 
            }),
          });

          if (res.status === 409) throw new Error('插件已存在');
          if (!res.ok) throw new Error('请求失败');
          
          const resData = await res.json();
          const extId = resData.ext_id;

          showNotification('已开始下载，请耐心等待...', 'info');

          // --- 核心修改：开始轮询 ---
          this.pollInstallStatus(
            extId,
            (msg) => {
              // 成功
              this.installLoading = false;
              if (plugin) plugin.installing = false;
              plugin.installed = true; // 更新前端状态
              showNotification('安装成功！', 'success');
              this.scanExtensions(); // 刷新完整列表以确保数据一致
            },
            (errMsg) => {
              // 失败
              this.installLoading = false;
              if (plugin) plugin.installing = false;
              showNotification(`安装失败: ${errMsg}`, 'error');
            }
          );

        } catch (e) {
          this.installLoading = false;
          if (plugin) plugin.installing = false;
          showNotification(e.message, 'error');
        }
      }
    },
  handleRefreshClick() {
    this.refreshing = true;
    
    // 调用原有的刷新方法
    this.fetchRemotePlugins().then(() => {
      // 请求完成后
      this.refreshing = false;
      this.refreshButtonText = this.t('refreshedSuccess') || '已刷新';
      
      // 2秒后恢复按钮文字
      setTimeout(() => {
        this.refreshButtonText = this.t('refreshList');
      }, 2000);
    }).catch(error => {
      // 处理错误情况
      this.refreshing = false;
      this.refreshButtonText = this.t('refreshFailed') || '刷新失败';
      
      // 2秒后恢复按钮文字
      setTimeout(() => {
        this.refreshButtonText = this.t('refreshList');
      }, 2000);
    });
  },
  openRepository(url) {
    if (isElectron) {
      window.electronAPI.openExternal(url)   // 主进程会新建可关闭的独立窗口
    } else {
      window.open(url, '_blank')
    }
  },
  startChatHistoryResize(e) {
    if (this.isMobile || !this.chatHistoryPanelOpen) return;

    const container = this.$refs.chatWrapperRef;
    const panel = this.$refs.chatHistoryPanelRef;
    if (!container || !panel) return;

    this.isHistoryPanelResizing = true;
    const containerRect = container.getBoundingClientRect();
    const minWidth = 220;
    const maxWidth = Math.max(minWidth, Math.min(520, containerRect.width - 320));

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (event) => {
      if (!this.isHistoryPanelResizing) return;
      const nextWidth = Math.max(minWidth, Math.min(event.clientX - containerRect.left, maxWidth));
      this.chatHistoryPanelWidth = nextWidth;
    };

    const handleMouseUp = () => {
      this.isHistoryPanelResizing = false;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  },
  // 开始拖拽调整大小
  startResize(e) {
    if (!this.chatAreaOpen || !this.sidePanelOpen) return;
    
    const container = this.$refs.chatWrapperRef;
    // 获取当前历史侧边栏是否可见并获取宽度
    const historySidebar = container.querySelector('.chat-history-sidebar');
    const isSidebarVisible = this.showHistorySidebar && !this.isMobile;
    const sidebarWidth = isSidebarVisible ? historySidebar.offsetWidth : 0;

    this.isResizing = true;
    const containerRect = container.getBoundingClientRect();
    const availableWidth = containerRect.width - sidebarWidth; // 减去历史栏宽度
    
    container.classList.add('resizing');

    const handleMouseMove = (e) => {
      if (!this.isResizing) return;
      
      // 这里的 mouseX 必须相对于聊天区的左边缘
      const mouseXInChat = e.clientX - (containerRect.left + sidebarWidth);
      const clampedMouseX = Math.max(0, Math.min(mouseXInChat, availableWidth));
      
      const leftWidth = clampedMouseX;
      const rightWidth = availableWidth - clampedMouseX - 10; // 10 是分割条宽
      
      const leftPercent = (leftWidth / availableWidth) * 100;
      const rightPercent = (rightWidth / availableWidth) * 100;
      
      if (leftPercent < this.minPanelWidth) {
        this.collapseChatArea();
        handleMouseUp();
        return;
      }
      
      if (rightPercent < this.minPanelWidth) {
        this.collapseSidePanel();
        handleMouseUp();
        return;
      }
      
      this.updatePanelWidthsWithPixels(leftWidth, rightWidth);
    };

    const handleMouseUp = () => {
      this.isResizing = false;
      container.classList.remove('resizing');
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      this.recalculatePercentages(availableWidth);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  },

  handleHistoryToggle() {
      this.showHistorySidebar = !this.showHistorySidebar;
      console.log('showHistorySidebar:',this.showHistorySidebar)
      // 强制触发一次 recalculate，让右侧聊天区重新适应剩余宽度
      this.$nextTick(() => {
          this.handleResize(); 
      });
      this.autoSaveSettings();
  },

  // 使用像素宽度更新面板
  updatePanelWidthsWithPixels(leftWidth, rightWidth) {
    this.$nextTick(() => {
      const chatArea = this.$refs.chatAreaRef;
      const sidePanel = this.$refs.sidePanelRef;
      
      if (!chatArea || !sidePanel) {
        return;
      }
      
      if (this.chatAreaOpen && this.sidePanelOpen) {
        chatArea.style.width = `${leftWidth}px`;
        sidePanel.style.width = `${rightWidth}px`;
      }
    });
  },

  // 重新计算百分比（用于保存状态和响应式）
  recalculatePercentages(providedAvailableWidth) {
    const container = this.$refs.chatWrapperRef;
    const historySidebar = container?.querySelector('.chat-history-sidebar');
    const sidebarWidth = (historySidebar && !this.isMobile) ? historySidebar.offsetWidth : 0;
    
    // 如果没有传入宽度，则实时计算
    const availableWidth = providedAvailableWidth || (container.offsetWidth - sidebarWidth);
    
    const chatArea = this.$refs.chatAreaRef;
    const sidePanel = this.$refs.sidePanelRef;
    
    if (chatArea && sidePanel && this.chatAreaOpen && this.sidePanelOpen) {
      const chatAreaWidthPx = chatArea.offsetWidth;
      const sidePanelWidthPx = sidePanel.offsetWidth;
      
      // 基于可用宽度计算比例
      this.chatAreaWidth = (chatAreaWidthPx / availableWidth) * 100;
      this.sidePanelWidth = (sidePanelWidthPx / availableWidth) * 100;
    }
  },  

  // 处理分割条点击
  handleResizerClick(e) {
    if (e.target.closest('.expand-chat-btn') || e.target.closest('.expand-side-btn')) {
      return;
    }
    
    // 双击重置为50:50
    if (e.detail === 2) {
      this.resetPanelSizes();
    }
  },

  toggleSidePanel() {
    if (this.sidePanelOpen) {
      this.collapseSidePanel();
    } else {
      this.expandSidePanel();
    }
  },

  // 移动端专用面板单屏切换
  toggleSidePanelOnMobile() {
    if (this.sidePanelOpen) {
      this.collapseSidePanel(); // 还原为 100% 对话流
    } else {
      this.expandSidePanel(); // 扩展为 100% 面板流
    }
  },

 // 收起对话区域
  collapseChatArea() {
    const sidePanel = this.$refs.sidePanelRef;
    const chatArea = this.$refs.chatAreaRef;

    if (sidePanel) sidePanel.style.width = '';
    if (chatArea) chatArea.style.width = '';

    this.chatAreaOpen = false;
    this.sidePanelOpen = true; 
    this.sidePanelWidth = 100;
    this.chatAreaWidth = 0;

    this.updatePanelWidths();
  },

  // 收起右侧侧边栏
  collapseSidePanel() {
    const chatArea = this.$refs.chatAreaRef;
    const sidePanel = this.$refs.sidePanelRef;

    if (chatArea) chatArea.style.width = '';
    if (sidePanel) sidePanel.style.width = '';

    this.sidePanelOpen = false;
    this.chatAreaOpen = true;
    this.chatAreaWidth = 100;
    this.sidePanelWidth = 0;

    this.updatePanelWidths();
  },

  // 展开对话区域
  expandChatArea() {
    this.chatAreaOpen = true;
    if (this.isMobile) {
      // 移动端排他性全屏
      this.sidePanelOpen = false;
      this.chatAreaWidth = 100;
      this.sidePanelWidth = 0;
    } else {
      this.sidePanelOpen = true;
      this.chatAreaWidth = 50;
      this.sidePanelWidth = 50;
    }
    this.updatePanelWidths();
  },

  // 展开侧边栏
  expandSidePanel() {
    this.sidePanelOpen = true;
    if (this.isMobile) {
      // 移动端排他性全屏
      this.chatAreaOpen = false;
      this.chatAreaWidth = 0;
      this.sidePanelWidth = 100;
    } else {
      this.chatAreaOpen = true;
      this.chatAreaWidth = 50;
      this.sidePanelWidth = 50;
    }
    this.updatePanelWidths();
  },


  // 重置面板大小
  resetPanelSizes() {
    this.chatAreaWidth = 50;
    this.sidePanelWidth = 50;
    this.chatAreaOpen = true;
    this.sidePanelOpen = true;
    this.updatePanelWidths();
  },

  // 更新面板宽度样式
  updatePanelWidths() {
    this.$nextTick(() => {
      const chatArea = this.$refs.chatAreaRef;
      const sidePanel = this.$refs.sidePanelRef;
      
      if (!chatArea || !sidePanel) return;
      
      // ✨ 清除之前可能遗留的 px 宽度
      chatArea.style.width = '';
      sidePanel.style.width = '';
      
      if (this.chatAreaOpen && this.sidePanelOpen) {
        chatArea.style.width = `${this.chatAreaWidth}%`;
        sidePanel.style.width = `${this.sidePanelWidth}%`;
      } else if (this.chatAreaOpen) {
        chatArea.style.width = '100%';
      } else if (this.sidePanelOpen) {
        sidePanel.style.width = '100%';
      }
      
      // 🔧 关键修复：强制浏览器重排（读取布局属性）
      sidePanel.offsetWidth;   // 或者 chatArea.offsetWidth
    });
  },

  // 处理窗口大小变化
  handleResize() {
    if (this.chatAreaOpen && this.sidePanelOpen) {
      this.updatePanelWidths();
    }
  },
  // 修改 openExtensionInWindow 方法
  async openExtensionInWindow(extension) {
    const url = await this.getExtensionURL(extension);   // ⬅️ 同样先启动/拿地址

    // 下面逻辑你原来就有，只把 url 换成异步得到的即可
    this.showExtensionsDialog = false;
    let windowWidth = 800;
    let windowHeight = 600;
    if (window.electronAPI && window.electronAPI.openExtensionWindow) {
      try {
        if (extension.enableVrmWindowSize){
          console.log('VRM window size enabled')
          windowWidth = this.VRMConfig.windowWidth;
          windowHeight = this.VRMConfig.windowHeight
        }
        else{
          windowWidth = extension.width || 800;
          windowHeight = extension.height || 600;
        }
        const windowId = await window.electronAPI.openExtensionWindow(`${this.partyURL}${url}`, {
          id: extension.id,
          name: extension.name,
          transparent: extension.transparent || false,
          width: windowWidth,
          height: windowHeight,
        });
        console.log(`Extension window opened with ID: ${windowId}`);
      } catch (error) {
        console.error('Failed to open extension window:', error);
        window.open(`${this.partyURL}${url}`, '_blank');
      }
    } else {
      window.open(`${this.partyURL}${url}`, '_blank');
    }
  },
  async sherpaModelStatus() {
    const res = await fetch('/sherpa-model/status')
    if (!res.ok) return
    const { exists, model } = await res.json()
    this.sherpaModelExists = exists
    this.sherpaModelName  = model ?? ''   // 后端没返回时留空
  },

  async sherpaDownload(source = 'modelscope') {
      if (this.sherpaEventSource) this.sherpaEventSource.close()
      this.sherpaDownloading = true
      this.sherpaPercent = 0
      
      // 确保在 EventSource 实例化之前设置状态
      this.sherpaEventSource = null

      const es = new EventSource(`/sherpa-model/download/${source}`)
      this.sherpaEventSource = es
      
      // 监听消息流
      es.onmessage = e => {
          let data
          try {
              data = JSON.parse(e.data)
          } catch (error) {
              console.error('Failed to parse download progress data:', e.data, error)
              return
          }

          // --------------------------------------
          // 核心修复逻辑：处理多文件聚合进度
          // --------------------------------------
          
          // 1. 检查下载是否完成或失败
          if (data.status === 'complete') {
              es.close()
              this.sherpaDownloading = false
              this.sherpaPercent = 100
              this.sherpaModelStatus()
              showNotification(this.t('modelDownloadSuccess'))
              return
          }

          if (data.status === 'failed') {
              es.close()
              this.sherpaDownloading = false
              showNotification(this.t('modelDownloadFailed') + (data.error || ''), 'error')
              return
          }

          // 2. 聚合所有文件的进度
          let totalDone = 0
          let grandTotal = 0

          if (data.files && data.files.length > 0) {
              data.files.forEach(file => {
                  totalDone += file.done || 0
                  grandTotal += file.total || 0
                  // 检查是否有任何单个文件失败
                  if (file.failed) {
                      es.close()
                      this.sherpaDownloading = false
                      showNotification(this.t('modelDownloadFailed') + `: ${file.filename} 失败`, 'error')
                  }
              })
          }

          // 3. 计算整体百分比
          this.sherpaPercent = grandTotal > 0 ? Math.round((totalDone / grandTotal) * 100) : 0
      }
      
      // 监听错误
      es.onerror = () => {
          // 如果 EventSource 在没有收到 close 消息的情况下关闭，通常意味着错误
          es.close()
          this.sherpaDownloading = false
          showNotification(this.t('modelDownloadFailed'), 'error')
          this.sherpaModelStatus() // 再次检查状态，以防实际已下载完成
      }
  },

  async sherpaRemove() {
    try {
      const res = await fetch('/sherpa-model/remove', { method: 'DELETE' })
      if (!res.ok) throw new Error()
      showNotification(this.t('deleteSuccess'))
      this.sherpaModelStatus()
    } catch {
      showNotification(this.t('deleteFailed'),'error')
    }
  },

  async loadSherpaStatus() {
    await this.sherpaModelStatus()
  },

// 1. 获取 MOSS 模型状态
  async mossModelStatus() {
    try {
      const res = await fetch('/moss-model/status')
      if (!res.ok) return
      const data = await res.json()
      this.mossModelExists = data.exists
      
      // 同步后台下载状态（比如刷新页面后恢复 UI）
      if (data.downloading) {
        this.mossDownloading = true
        // 自动恢复轮询
        if (!this.mossPollInterval) this.startMossPolling()
      } else {
        this.mossDownloading = false
      }
    } catch (e) {
      console.error('Failed to get MOSS status:', e)
    }
  },

// 触发下载时把进度清零
  async mossDownload(source = 'modelscope') {
    this.mossDownloading = true
    this.mossDownloadSource = source
    this.mossPercent = 0 // 初始化为 0
    
    try {
      const res = await fetch(`/moss-model/download/${source}`, { method: 'POST' })
      if (!res.ok) throw new Error('Network error')
      this.startMossPolling()
    } catch (e) {
      this.mossDownloading = false
      showNotification(this.t('modelDownloadFailed') || '下载失败', 'error')
    }
  },

  startMossPolling() {
    if (this.mossPollInterval) clearInterval(this.mossPollInterval)
    
    this.mossPollInterval = setInterval(async () => {
      try {
        const statusRes = await fetch('/moss-model/status')
        const data = await statusRes.json()
        
        // 更新真实进度 (后台根据文件夹大小计算出的)
        if (data.percent !== undefined) {
          this.mossPercent = data.percent
        }
        
        if (!data.downloading) {
          clearInterval(this.mossPollInterval)
          this.mossPollInterval = null
          this.mossDownloading = false
          this.mossModelExists = data.exists
          
          if (data.exists) {
            this.mossPercent = 100 // 完成强制打满
            showNotification(this.t('modelDownloadSuccess') || 'MOSS 模型下载成功')
          } else if (data.download_error) {
            showNotification((this.t('modelDownloadFailed') || '下载失败: ') + data.download_error, 'error')
          }
        }
      } catch (err) {
        console.error('MOSS Polling error', err)
      }
    }, 1000) // 每 1 秒轮询一次，让进度条更顺滑
  },

  // 4. 删除 MOSS 模型
  async mossRemove() {
    try {
      const res = await fetch('/moss-model/remove', { method: 'DELETE' })
      if (!res.ok) throw new Error()
      showNotification(this.t('deleteSuccess') || '模型删除成功')
      this.mossModelExists = false
    } catch {
      showNotification(this.t('deleteFailed') || '模型删除失败', 'error')
    }
  },

  // 5. 在初始化时调用 (类似于 loadSherpaStatus)
  async loadMossStatus() {
    await this.mossModelStatus()
  },

    /**
     * 检查 MiniLM 模型状态 (是否存在)
     */
    async minilmModelStatus() {
        try {
            const res = await fetch('/minilm-model/status');
            if (!res.ok) throw new Error('Failed to fetch status');
            const data = await res.json();
            this.minilmModelExists = data.exists;
        } catch (error) {
            console.error("Error checking MiniLM model status:", error);
            this.minilmModelExists = false; // 假设网络错误导致无法检查，也视为不存在
        }
    },

    /**
     * 下载 MiniLM 模型
     * @param {string} source - 下载源: 'modelscope' 或 'huggingface'
     */
    async minilmDownload(source = 'modelscope') {
        if (this.minilmEventSource) this.minilmEventSource.close();
        
        this.minilmDownloading = true;
        this.minilmPercent = 0;
        this.minilmEventSource = null;

        const es = new EventSource(`/minilm-model/download/${source}`);
        this.minilmEventSource = es;
        
        // 监听消息流
        es.onmessage = async e => {
            let data;
            try {
                // 后端会发送 JSON 格式的进度数据
                data = JSON.parse(e.data);
            } catch (error) {
                // 后端可能会发送 'close' 这样的非 JSON 消息
                if (e.data === 'close') {
                    es.close();
                }
                console.error('Failed to parse download progress data:', e.data, error);
                return;
            }

            // 1. 检查下载是否完成或失败
            if (data.status === 'complete') {
                es.close();
                this.minilmDownloading = false;
                this.minilmPercent = 100;

                // 1. 通知后端热重载
                await fetch('/minilm/reload', { method: 'POST' });

                // 2. 再刷新一次存在状态（此时一定为 true）
                await this.minilmModelStatus();

                if (typeof showNotification === 'function') {
                    showNotification(this.t('modelDownloadSuccess'));
                }
                return;
            }

            if (data.status === 'failed') {
                es.close();
                this.minilmDownloading = false;
                // 尝试从 files 列表中提取具体的错误信息
                const firstError = data.files.find(f => f.failed)?.error || '';
                if (typeof showNotification === 'function') {
                    showNotification(this.t('modelDownloadFailed') + (firstError ? `: ${firstError}` : ''), 'error');
                }
                return;
            }

            // 2. 聚合所有文件的进度
            let totalDone = 0;
            let grandTotal = 0;

            if (data.files && data.files.length > 0) {
                let hasFailedFile = false;
                data.files.forEach(file => {
                    totalDone += file.done || 0;
                    grandTotal += file.total || 0;
                    
                    // 检查是否有任何单个文件失败 (后端已经在 status='failed' 中处理了，这里做冗余检查)
                    if (file.failed) {
                        hasFailedFile = true;
                    }
                });

                if (hasFailedFile) {
                      // 如果检测到文件失败，但 status 还没有被后端更新为 'failed'，则手动关闭和报错
                      es.close();
                      this.minilmDownloading = false;
                      const failedFile = data.files.find(f => f.failed);
                      if (typeof showNotification === 'function') {
                        showNotification(this.t('modelDownloadFailed') + `: ${failedFile.filename} 失败`, 'error');
                      }
                      return;
                }
            }

            // 3. 计算整体百分比
            this.minilmPercent = grandTotal > 0 ? Math.round((totalDone / grandTotal) * 100) : 0;
        };
        
        // 监听错误
        es.onerror = () => {
            // 如果 EventSource 在没有收到 close 消息的情况下关闭，通常意味着错误
            if (this.minilmEventSource) {
                this.minilmEventSource.close();
            }
            this.minilmDownloading = false;
            if (typeof showNotification === 'function') {
                showNotification(this.t('modelDownloadFailed') + ' (Network/Connection Error)', 'error');
            }
            this.minilmModelStatus(); // 再次检查状态，以防实际已下载完成
        };
    },

    /**
     * 删除本地 MiniLM 模型
     */
    async minilmRemove() {
        try {
            // 使用 Element Plus 确认对话框来增加安全性（如果可用）
            // 示例：await this.$confirm('确定删除 MiniLM 模型吗？', '警告', { type: 'warning' })

            const res = await fetch('/minilm-model/remove', { method: 'DELETE' });
            if (!res.ok) throw new Error();
            
            if (typeof showNotification === 'function') {
                showNotification(this.t('deleteSuccess'));
            }
            this.minilmModelStatus(); // 刷新模型存在状态
        } catch (error) {
            if (typeof showNotification === 'function') {
                showNotification(this.t('deleteFailed') + (error.message || ''), 'error');
            }
        }
    },

  async updatePlugin(plugin) {
    // 临时响应式标记
    plugin._updating = true // 发送更新请求
    try {
      const res = await fetch(`/api/extensions/${plugin.id}/update`, { method: 'PUT' })
      if (!res.ok) throw new Error(await res.text())
      showNotification(this.t('updateSuccess'))
      // 更新完后刷新本地列表，重新标 installed 状态
      this.fetchRemotePlugins();
    } catch (e) {
      showNotification(this.t('updateFailed') + ': ' + e.message, 'error')
    } finally {
      plugin._updating = false
    }
  },

    // 打开向量库交互主弹窗
    async openVectorDialog(mid) {
      this.vectorDialogVisible = true
      this.vectorDialogMemoryId = mid
      // 取 memory 名字只是为了标题展示
      this.vectorDialogMemoryName = this.memories.find(m => m.id === mid)?.name || mid
      await this.loadVectorTable(mid)
    },

    // 读取记忆内容
    async loadVectorTable(mid) {
      this.vectorLoading = true
      try {
        const res = await fetch(`/memory/${mid}`)
        if (!res.ok) throw new Error(await res.text())
        // 后端已平铺，直接赋值
        this.vectorTable = await res.json()
      } catch (e) {
        this.vectorTable = []
        console.error(e)
      } finally {
        this.vectorLoading = false
      }
    },

    // 新增记忆
    async addVectorRow() {
      if (!this.newVectorText.trim()) return
      try {
        const mid = this.vectorDialogMemoryId
        const res = await fetch(`/memory/${mid}`, {
          
        })
      } finally {
        this.vectorLoading = false
      }
    },

  startEditRow(tableIndex) {
    const row = this.vectorTable[tableIndex]
    this.editRowIdx = row.idx
    this.editRowText = row.text
    this.editRowVisible = true
  },
  async submitEditRow() {
    if (!this.editRowText.trim()) return
    try {
      const mid = this.vectorDialogMemoryId
      const res = await fetch(`/memory/${mid}/${this.editRowIdx}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_text: this.editRowText.trim() })
      })
      if (!res.ok) throw new Error(await res.text())
      this.editRowVisible = false
      await this.loadVectorTable(mid)
    } catch (e) {
      showNotification(e.message, 'error')
    }
  },
  async deleteVectorRow(idx) {
    try {
      const mid = this.vectorDialogMemoryId
      const res = await fetch(`/memory/${mid}/${idx}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(await res.text())
      await this.loadVectorTable(mid)
    } catch (e) {
      showNotification(e.message, 'error')
    }
  },
  /* 探针 */
  async probeNode() {
    const res = await fetch('/api/node/probe');
    const { installed } = await res.json();
    this.nodeInstalled = installed;
  },

    /* ===== uv 相关 ===== */
  async probeUv() {
    const res = await fetch('/api/uv/probe');
    const { installed } = await res.json();
    this.uvInstalled = installed;
  },

  async openLogDialog() {
    this.showLogDialog = true;
    await this.fetchLogs();
    // 自动滚动到底部
    this.$nextTick(() => {
      if (this.$refs.logContainer) {
        this.$refs.logContainer.scrollTop = this.$refs.logContainer.scrollHeight;
      }
    });
  },

  async fetchLogs() {
    if (window.electronAPI) {
      try {
        this.logContent = await window.electronAPI.getBackendLogs();
      } catch (e) {
        this.logContent = 'Failed to load logs: ' + e.message;
      }
    }
  },
  async fetchSystemVoices() {
      this.isLoadingSystemVoices = true;
      try {
        // 使用 fetch API 调用后端接口
        const response = await fetch('/system/voices'); // 请根据你的API前缀调整
        
        if (!response.ok) {
            // 处理 HTTP 错误状态（如 404, 500）
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data && data.voices) {
          this.systemVoices = data.voices;
          
          // 如果当前没有选中的音色，或者选中的音色不在列表里，默认选中第一个
          const currentVoiceValid = this.systemVoices.some(v => v.id === this.ttsSettings.systemVoiceName);
          if (!this.ttsSettings.systemVoiceName || !currentVoiceValid) {
             if (this.systemVoices.length > 0) {
               this.ttsSettings.systemVoiceName = this.systemVoices[0].id;
               this.autoSaveSettings(); // 保存默认选择
             }
          }
        }
      } catch (error) {
        console.error("获取系统音色失败:", error);
        if (this.$message) {
           this.$message.error(`获取系统音色列表失败: ${error.message}`);
        }
      } finally {
        this.isLoadingSystemVoices = false;
      }
    },

  addTableEnhancements() {
    this.$nextTick(() => {
      const tables = document.querySelectorAll('.markdown-body table');
      
      tables.forEach((table) => {
        if (table.parentElement.classList.contains('markdown-table-wrapper')) return;

        // 1. 创建容器
        const wrapper = document.createElement('div');
        wrapper.className = 'markdown-table-wrapper';
        table.parentNode.insertBefore(wrapper, table);
        wrapper.appendChild(table);

        // 2. 创建按钮
        const btn = document.createElement('button');
        btn.className = 'table-download-btn';
        // 使用 fa-file-excel 图标，更直观
        btn.innerHTML = '<i class="fa-solid fa-file-excel"></i> XLSX';
        btn.title = '导出为 Excel 文件';
        
        // 3. 绑定点击事件 (调用新的 exceljs 逻辑)
        btn.onclick = async (e) => {
          e.stopPropagation();
          // 添加加载状态反馈（可选）
          const originalText = btn.innerHTML;
          btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 导出中...';
          btn.disabled = true;
          
          try {
            await this.downloadTableAsXLSX(table);
          } catch (error) {
            console.error('Excel 导出失败:', error);
            this.$message?.error('导出失败，请重试');
          } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
          }
        };

        wrapper.appendChild(btn);
      });
    });
  },

  // 全局点击事件代理
  handleGlobalClick(event) {
    // 1. 检查点击的是否是 Excel 导出按钮
    // closest 处理用户可能点到图标 <i> 的情况
    const btn = event.target.closest('.download-xlsx-trigger');
    
    if (btn) {
      event.preventDefault();
      event.stopPropagation();
      
      // 找到同级的前一个兄弟元素 (即 table)
      // 根据上面 markdown-it 的结构: <table>...</table> <button>...</button>
      // 所以 button.previousElementSibling 就是 table
      const table = btn.previousElementSibling;
      
      if (table && table.tagName === 'TABLE') {
        this.exportTable(btn, table);
      }
    }
  },

    handleMessageLinkClick(event) {
        // 1. 如果你原有的 handleGlobalClick 有逻辑（比如点击空白处关闭菜单），在这里调用它
        this.handleGlobalClick(event); 

        if(isElectron){

          const link = event.target.closest('a');

          if (link && link.href) {
              const href = link.href;

              // 2. 过滤逻辑：只拦截 http/https 网络链接
              if (href.startsWith('http') || href.startsWith('https')) {
                  
                  // ★ 关键：同时调用 stopPropagation 和 preventDefault
                  event.preventDefault();  // 阻止链接默认跳转
                  event.stopPropagation(); // 阻止事件继续传播
                  
                  // 3. 打开内部浏览器
                  console.log('拦截到链接，正在内部浏览器打开:', href);
                  this.openUrlInNewTab(href);
              }
          }
        
        }

    },

  // 这里的逻辑跟您原来的 click 类似，只是参数变了
  async exportTable(btn, tableElement) {
    if (btn.disabled) return; // 防止重复点击

    const originalHtml = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 导出中...';
    btn.disabled = true;

    try {
      await this.downloadTableAsXLSX(tableElement);
    } catch (error) {
      console.error('导出失败', error);
      // 如果有 Element Plus
      if (this.$message) this.$message.error('导出失败');
    } finally {
      btn.innerHTML = originalHtml;
      btn.disabled = false;
    }
  },

  /**
   * 使用 ExcelJS 生成真正的 .xlsx 文件
   */
  async downloadTableAsXLSX(tableElement) {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('数据导出');

    // --- 1. 提取 HTML 表格数据 ---
    const rows = tableElement.querySelectorAll('tr');
    
    // 遍历 HTML 行
    rows.forEach((row, rowIndex) => {
      const cells = row.querySelectorAll('td, th');
      const rowData = [];
      
      cells.forEach(cell => {
        // 获取纯文本
        rowData.push(cell.innerText.trim());
      });
      
      // 添加到 Worksheet
      const excelRow = worksheet.addRow(rowData);
    });

    // --- 2. 美化 Excel 样式 (Pro 模式) ---
    
    // 2.1 设置表头样式 (第一行)
    const headerRow = worksheet.getRow(1);
    headerRow.font = { 
      name: '微软雅黑', 
      bold: true, 
      color: { argb: 'FFFFFFFF' } // 白字
    };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E849B' } // 使用你的主题色 (深青色)
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

    // 2.2 自动计算列宽
    worksheet.columns.forEach(column => {
      let maxLength = 0;
      column.eachCell({ includeEmpty: true }, cell => {
        const columnLength = cell.value ? cell.value.toString().length : 10;
        if (columnLength > maxLength) maxLength = columnLength;
      });
      // 限制最大宽度，防止太宽
      column.width = maxLength < 10 ? 10 : (maxLength > 50 ? 50 : maxLength + 2);
    });

    // 2.3 添加边框
    worksheet.eachRow((row, rowNumber) => {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFDCDFE6' } },
          left: { style: 'thin', color: { argb: 'FFDCDFE6' } },
          bottom: { style: 'thin', color: { argb: 'FFDCDFE6' } },
          right: { style: 'thin', color: { argb: 'FFDCDFE6' } }
        };
        // 内容垂直居中
        cell.alignment = { ...cell.alignment, vertical: 'middle', wrapText: true };
      });
    });

    // --- 3. 生成并下载文件 ---
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    
    const link = document.createElement('a');
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[-T:]/g, "");
    link.href = URL.createObjectURL(blob);
    link.download = `table_export_${timestamp}.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  },

    // [A2UI 新增] 处理用户点击操作
    handleA2UIAction(msg) {
      console.log('A2UI Action Triggered:', msg);
      this.userInput = msg;
      this.sendMessage();
    },

    // [A2UI 新增] 拆分消息内容为 文本/UI 段
    splitMessageContent(content) {
      if (!content) return [];
      const segments = [];
      const regex = /```a2ui\s*([\s\S]*?)\s*```/g;
      
      let lastIndex = 0;
      let match;

      while ((match = regex.exec(content)) !== null) {
        if (match.index > lastIndex) {
          const textPart = content.slice(lastIndex, match.index);
          if (textPart) segments.push({ type: 'text', content: textPart });
        }

        try {
          const uiConfig = JSON.parse(match[1]);
          segments.push({ type: 'ui', content: uiConfig });
        } catch (e) {
          segments.push({ type: 'text', content: match[0] });
        }
        lastIndex = regex.lastIndex;
      }

      if (lastIndex < content.length) {
        segments.push({ type: 'text', content: content.slice(lastIndex) });
      }

      return segments;
    },

    async fetchTetosNewVoices(provider) {
        this.newTTSConfig.isFetchingVoices = true;
        this.newTTSConfig.tetosVoices = []; // 清空现有列表
        
        let config = {};
        const s = this.newTTSConfig;

        // 根据 provider 构建 config
        switch(provider) {
            case 'azure':
                config = { speech_key: s.azureSpeechKey, speech_region: s.azureRegion };
                break;
            case 'volcengine':
                config = { access_key: s.volcAccessKey, secret_key: s.volcSecretKey, app_key: s.volcAppKey };
                break;
            case 'baidu':
                config = { api_key: s.baiduApiKey, secret_key: s.baiduSecretKey };
                break;
            case 'minimax':
                config = { api_key: s.minimaxApiKey, group_id: s.minimaxGroupId };
                break;
            case 'xunfei':
                config = { app_id: s.xunfeiAppId, api_key: s.xunfeiApiKey, api_secret: s.xunfeiApiSecret };
                break;
            case 'fish':
                config = { api_key: s.fishApiKey };
                break;
            case 'google':
                // 尝试解析 JSON 字符串
                try {
                    if (s.googleServiceAccount) {
                         config = { service_account: JSON.parse(s.googleServiceAccount) };
                    }
                } catch (e) {
                    this.newTTSConfig.isFetchingVoices = false;
                    return;
                }
                break;
        }

        try {
            const response = await fetch('/tts/tetos/list_voices', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ provider: provider, config: config })
            });
            const result = await response.json();
            
            if (result.status === 'success') {
                this.newTTSConfig.tetosVoices = result.data;
            } else {
                console.error(result);
            }
        } catch (error) {
            console.error('Error fetching voices:', error);
        } finally {
            this.newTTSConfig.isFetchingVoices = false;
        }
    },

    async fetchTetosVoices(provider) {
        this.ttsSettings.isFetchingVoices = true;
        this.ttsSettings.tetosVoices = []; // 清空现有列表
        
        let config = {};
        const s = this.ttsSettings;

        // 根据 provider 构建 config
        switch(provider) {
            case 'azure':
                config = { speech_key: s.azureSpeechKey, speech_region: s.azureRegion };
                break;
            case 'volcengine':
                config = { access_key: s.volcAccessKey, secret_key: s.volcSecretKey, app_key: s.volcAppKey };
                break;
            case 'baidu':
                config = { api_key: s.baiduApiKey, secret_key: s.baiduSecretKey };
                break;
            case 'minimax':
                config = { api_key: s.minimaxApiKey, group_id: s.minimaxGroupId };
                break;
            case 'xunfei':
                config = { app_id: s.xunfeiAppId, api_key: s.xunfeiApiKey, api_secret: s.xunfeiApiSecret };
                break;
            case 'fish':
                config = { api_key: s.fishApiKey };
                break;
            case 'google':
                // 尝试解析 JSON 字符串
                try {
                    if (s.googleServiceAccount) {
                         config = { service_account: JSON.parse(s.googleServiceAccount) };
                    }
                } catch (e) {
                    this.ttsSettings.isFetchingVoices = false;
                    return;
                }
                break;
        }

        try {
            const response = await fetch('/tts/tetos/list_voices', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ provider: provider, config: config })
            });
            const result = await response.json();
            
            if (result.status === 'success') {
                this.ttsSettings.tetosVoices = result.data;
            } else {
                console.error(result);
            }
        } catch (error) {
            console.error('Error fetching voices:', error);
        } finally {
            this.ttsSettings.isFetchingVoices = false;
        }
    },

    // 1. 获取音色显示名称 (Label)
    getVoiceLabel(v) {
        // 情况 A: 数据是纯字符串 (你刚才展示的情况)
        if (typeof v === 'string') return v;
        
        // 情况 B: 数据是对象 (Azure等)
        if (v && typeof v === 'object') {
            // 优先查找显示名称，如果没有则找 id 或 name
            return v.DisplayName || v.local_name || v.name || v.Name || v.id || v.Id || v.ShortName || 'Unknown Voice';
        }
        return 'Unknown';
    },

    // 2. 获取音色实际值 (Value - 传给后端的)
    getVoiceValue(v) {
        // 情况 A: 纯字符串
        if (typeof v === 'string') return v;
        
        // 情况 B: 对象
        if (v && typeof v === 'object') {
            return v.ShortName || v.id || v.Id || v.name || '';
        }
        return '';
    },

    // 3. 获取辅助信息 (显示在右侧的灰色小字，如语言)
    getVoiceDesc(v) {
        // 纯字符串没有额外信息，返回空
        if (typeof v === 'string') return '';
        
        // 对象可能包含语言信息
        if (v && typeof v === 'object') {
            const lang = v.Locale || v.locale || v.Language || v.language || (v.language_codes ? v.language_codes[0] : '');
            return lang ? `[${lang}]` : '';
        }
        return '';
    },


    // AI浏览器相关
    openUrlInNewTab(url) {
        // 如果 url 为空或者无效，可以做个判断，或者直接打开
        if (!url) return;

        const newTab = {
            id: Date.now(),
            title: 'Loading...',
            url: url,
            favicon: '',
            isLoading: true,
            canGoBack: false,
            canGoForward: false
        };
        this.browserTabs.push(newTab);
        this.switchTab(newTab.id);
        this.activeMenu = 'ai-browser';
    },

    // 切换标签
    switchTab(id) {
        this.currentTabId = id;
        const tab = this.browserTabs.find(t => t.id === id);
        if (tab) {
            // --- ✅ 修改此处 ---
            // 优先显示页面实际所在的 currentUrl，否则显示 tab.url
            this.urlInput = tab.currentUrl || tab.url;
            
            // 如果是欢迎页，清空地址栏显示
            if (!tab.url) this.urlInput = '';
        }
    },

    // 添加新标签
    addNewTab() {
        const newTab = {
            id: Date.now(),
            title: 'New Tab',
            url: '',
            favicon: '',
            isLoading: false,
            canGoBack: false,
            canGoForward: false
        };
        this.browserTabs.push(newTab);
        this.switchTab(newTab.id);
    },

    // 关闭标签
    closeTab(id, event) {
        if (event) event.stopPropagation(); // 防止触发点击切换
        
        const index = this.browserTabs.findIndex(t => t.id === id);
        if (index === -1) return;

        // 如果关闭的是当前标签，需要切换到另一个
        if (this.currentTabId === id) {
            if (this.browserTabs.length > 1) {
                // 优先切到右边，没右边切左边
                const nextTab = this.browserTabs[index + 1] || this.browserTabs[index - 1];
                this.currentTabId = nextTab.id;
                this.urlInput = nextTab.url;
            } else {
                // 如果只剩这一个，重置它而不是删除
                this.addNewTab(); // 加个新的
                this.browserTabs.splice(index, 1); // 删掉旧的
                return;
            }
        }
        
        this.browserTabs.splice(index, 1);
    },

    // 地址栏回车
    handleUrlEnter() {
        let val = this.urlInput.trim();
        if (!val) return;

        // 简单的 URL 补全逻辑
        if (!/^https?:\/\//i.test(val)) {
            // 如果看起来像域名
            if (/^([\w-]+\.)+[\w-]+/.test(val) && !val.includes(' ')) {
                val = 'https://' + val;
            } else {
                // 否则当做搜索
                if (this.searchEngine === 'google') {
                    val = `https://www.google.com/search?q=${encodeURIComponent(val)}`;
                } else if (this.searchEngine === 'bing') {
                    val = `https://www.bing.com/search?q=${encodeURIComponent(val)}`;
                } else {
                    if (this.chromeMCPSettings.enabled == false || this.chromeMCPSettings.type != 'internal') {
                        showNotification(this.t('notEnabledInternalBrowserBontrol'), 'error')
                    }
                    this.showBrowserChat = true;
                    this.userInput = val;
                    this.sendMessage();
                    return;
                }
            }
        }

        this.navigateTo(val);
    },

    getTabIdByIndex(index) {
        if (index >= 0 && index < this.browserTabs.length) {
            return this.browserTabs[index].id;
        }
        return null;
    },

    // 欢迎页搜索回车
    handleWelcomeSearch() {
        const query = this.welcomeSearchQuery.trim();
        this.welcomeSearchQuery = ''; // 清空输入框
        if (!query) return;

        // --- 新增逻辑：URL 检测与直接跳转 ---
        if (this.isUrl(query)) {
            let targetUrl = query;
            // 如果没有以 http:// 或 https:// 开头，默认补全 https://
            if (!/^https?:\/\//i.test(targetUrl)) {
                targetUrl = 'https://' + targetUrl;
            }
            this.navigateTo(targetUrl);
            return;
        }
        // ------------------------------------

        let searchUrl = '';
        if (this.searchEngine === 'google') {
            searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
        } else if (this.searchEngine === 'bing') {
            searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}`;
        } else {
            if (this.chromeMCPSettings.enabled == false || this.chromeMCPSettings.type != 'internal') {
                showNotification(this.t('notEnabledInternalBrowserBontrol'), 'error')
            }
            this.showBrowserChat = true;
            this.userInput = query;
            this.sendMessage();
            return;
        }

        this.navigateTo(searchUrl);
    },

    /**
     * 辅助函数：判断字符串是否为 URL
     * 规则：
     * 1. 以 http/https 开头
     * 2. 或者符合 域名.后缀 (如 google.com)
     * 3. 或者 localhost
     * 4. 或者 IP 地址
     * 5. 且不包含空格
     */
    isUrl(str) {
        // 简单判断：如果包含空格，通常是搜索词（除非是编码后的URL，但用户输入通常带空格）
        if (str.includes(' ')) return false;

        // 正则解释：
        // ^(https?:\/\/)?  -> 可选的 http:// 或 https://
        // (
        //   ([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}  -> 标准域名 (如 a.com, b.co.uk)
        //   | localhost                     -> 本地 localhost
        //   | (\d{1,3}\.){3}\d{1,3}         -> IP 地址 (如 192.168.1.1)
        // )
        // (:\d+)?          -> 可选端口号 (如 :8080)
        // (\/.*)?$         -> 可选路径
        const pattern = /^(https?:\/\/)?(([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}|localhost|(\d{1,3}\.){3}\d{1,3})(:\d+)?(\/.*)?$/i;
        
        return pattern.test(str);
    },

    // 核心导航方法
    navigateTo(url) {
        if (!this.currentTab) return;
        
        // 如果是刷新当前页面（URL 没变）
        // 注意：这里比较时最好也比较 currentUrl
        const activeUrl = this.currentTab.currentUrl || this.currentTab.url;
        
        if (activeUrl === url) {
            // ... (保持原有的 reload 逻辑)
            const wv = document.getElementById('webview-' + this.currentTabId);
            if (wv) wv.reload();
            return;
        }

        // 2. 如果是新 URL
        this.currentTab.url = url;      // 这会触发 :src 更新，开始加载
        this.currentTab.currentUrl = url; // 同步更新实际地址状态
        this.urlInput = url;
    },
    
    // 回到主页 (新标签页)
    goHome() {
        if(this.currentTab) {
            this.currentTab.url = '';
            this.currentTab.title = 'New Tab';
            this.currentTab.favicon = '';
            this.urlInput = '';
        }
    },

    // --- Webview 导航控制 ---
    getWebview(id) {
        const wv = document.getElementById('webview-' + (id || this.currentTabId));
        
        // 1. 基础非空检查
        if (!wv) {
            console.warn("getWebview: Element not found for ID", id || this.currentTabId);
            return null;
        }

        // 2. ★ 核心修改：检查元素是否真正连接在 DOM 树上
        // 如果元素存在但 isConnected 为 false，说明 Vue 正在销毁它或还没挂载好
        // 此时返回 null，让 Python 端捕获 "No active webview" 错误并触发重试
        if (!wv.isConnected) {
            console.warn("getWebview: Element found but detached from DOM (Zombie node).");
            return null;
        }

        // 3. (可选) 检查 Electron 内部状态
        // getWebContentsId 是 Electron webview 的原生方法，如果报错说明内部未初始化
        try {
            if (typeof wv.getWebContentsId !== 'function') {
                return null;
            }
        } catch (e) {
            return null;
        }

        return wv;
    },

    browserGoBack() {
        const wv = this.getWebview();
        if (wv && wv.canGoBack()) wv.goBack();
    },

    browserGoForward() {
        const wv = this.getWebview();
        if (wv && wv.canGoForward()) wv.goForward();
    },

    browserReload() {
        const wv = this.getWebview();
        if(!wv) return;
        if (this.currentTab.isLoading) {
            wv.stop();
        } else {
            wv.reload();
        }
    },

    // --- Webview 事件监听 ---
    // 注意：这些事件在 HTML 中通过 @did-start-loading="..." 绑定
    
    onDidStartLoading(id) {
        const tab = this.browserTabs.find(t => t.id === id);
        if (tab) tab.isLoading = true;
    },

    // 修改前
    onDidStopLoading(id) {
        const tab = this.browserTabs.find(t => t.id === id);
        if (tab) {
            tab.isLoading = false;
            const wv = document.getElementById('webview-' + id);
            if (wv) {
                tab.canGoBack = wv.canGoBack();
                tab.canGoForward = wv.canGoForward();
                
                // --- ✅ 修正后的代码 ---
                if (wv.getURL()) {
                    // 1. 将实际 URL 存入一个新字段，不触碰 tab.url (src)
                    tab.currentUrl = wv.getURL(); 
                    
                    // 2. 只更新顶部的地址栏 UI
                    if (this.currentTabId === id) {
                        this.urlInput = tab.currentUrl;
                    }
                }
            }
        }
    },

    onPageTitleUpdated(id, event) {
        const tab = this.browserTabs.find(t => t.id === id);
        if (tab) tab.title = event.title;
    },

    onPageFaviconUpdated(id, event) {
        const tab = this.browserTabs.find(t => t.id === id);
        if (tab && event.favicons && event.favicons.length > 0) {
            tab.favicon = event.favicons[0];
        }
    },

    // 处理网页内部 window.open
    onNewWindow(id, event) {
        // 在应用内新建标签页打开，而不是弹出新窗口
        const { url } = event;
        const newTab = {
            id: Date.now(),
            title: 'Loading...',
            url: url,
            favicon: '',
            isLoading: true,
            canGoBack: false,
            canGoForward: false
        };
        this.browserTabs.push(newTab);
        this.switchTab(newTab.id);
    },
    
    // 在 methods 中添加或修改 onDomReady
    onDomReady(tabId) {
        const webview = document.getElementById('webview-' + tabId);
        if (!webview) return;

        webview.addEventListener('context-menu', (e) => {
            // ★★★ 关键调试点：打印出 Electron 传来的所有参数 ★★★
            console.log('Webview Context Menu Params:', e.params);
            
            const params = e.params;
            let menuType = 'default';
            let data = {};

            // 重新审视和调整判断逻辑的顺序，确保最具体的匹配优先
            if (params.mediaType === 'image' && params.srcURL && params.srcURL.length > 0) {
                menuType = 'image';
                data = { src: params.srcURL };
                console.log('Detected Image Context:', data); // 调试
            } else if (params.linkURL && params.linkURL.length > 0) {
                menuType = 'link';
                data = { 
                    url: params.linkURL, 
                    text: params.linkText || params.selectionText || '' 
                };
                console.log('Detected Link Context:', data); // 调试
            } else if (params.selectionText && params.selectionText.length > 0) {
                menuType = 'text';
                data = { text: params.selectionText };
                console.log('Detected Text Context:', data); // 调试
            } else {
                menuType = 'default';
                console.log('Detected Default Context'); // 调试
            }

            // 再次打印最终决定发送的类型和数据
            console.log(`Sending context menu request: Type = ${menuType}, Data =`, data);

            window.electronAPI.showContextMenu(menuType, data);
        });
        webview.send('set-i18n', {
            translate: this.t('translate') || '翻译',
            askAI: this.t('ask_ai') || '问 AI',
            read: this.t('read') || '朗读',
            copy: this.t('copy') || '复制'
        });
        //webview.openDevTools();
    },

    // 1. 修改 IPC 消息处理函数
    async handleWebviewIpcMessage(event) {
        if (event.channel === 'ai-toolbar-action') {
            const { action, text } = event.args[0];
            if (!text) return;

            // 获取 webview 实例，用于回传数据
            // 注意：event.target 就是 webview 元素
            const webview = event.target; 

            switch (action) {
                case 'translate':
                    // --- 1. 翻译/总结：直接调用后端 + 流式回传 ---
                    // 不打开侧边栏，直接在 webview 原地显示
                    this.streamTranslateInWebview(webview, text);
                    break;

                case 'ask':
                    // --- 2. 问 AI：保留原逻辑，去侧边栏 ---
                    this.showBrowserChat = true;
                    // 如果你想自动添加提示词：
                    this.userInput = `${text}`; 
                    // this.sendMessage(); // 也就是让用户自己点发送，或者你取消注释自动发
                    break;

                case 'read':
                    // --- 3. 朗读：调用 TTS ---
                    this.handleBrowserTTS(text);
                    break;
            }
        }
    },

    // 2. 新增：流式请求后端并发送给 Webview
    async streamTranslateInWebview(webview, text) {
        if (!webview) return;
        
        console.log('开始请求翻译:', text);
        webview.send('ai-stream-start');

        try {
            const host = window.electron?.server?.host || '127.0.0.1';
            const port = window.electron?.server?.port || 3456;
            const apiUrl = `http://${host}:${port}/simple_chat`;
            const targetLang = this.target_lang || 'Simplified Chinese';
            const sysPrompt = `You are a helpful translation assistant. Translate the following text to ${targetLang}. Only output the translated text.`;

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: [
                        { role: "system", content: sysPrompt },
                        { role: "user", content: text }
                    ],
                    stream: true
                })
            });

            if (!response.ok) {
              let errMsg = `API Error: ${response.status}`;
              try { const errData = await response.json(); errMsg = errData?.error?.message || errMsg; } catch (_) {}
              throw new Error(errMsg);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder("utf-8");
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop(); 

                for (const line of lines) {
                    let trimmed = line.trim();
                    if (!trimmed || trimmed === 'data: [DONE]') continue;
                    
                    // --- 修改核心：兼容多种格式 ---
                    
                    // 1. 如果是以 data: 开头（SSE标准格式），去掉前缀
                    if (trimmed.startsWith('data:')) {
                        trimmed = trimmed.replace(/^data:\s?/, '');
                    }
                    
                    // 2. 尝试解析 JSON（现在无论是纯JSON还是去掉data后的JSON，都能解析）
                    try {
                        const data = JSON.parse(trimmed);
                        const content = data.choices?.[0]?.delta?.content;
                        
                        if (content) {
                            // console.log('Chunk:', content); 
                            webview.send('ai-stream-chunk', content);
                        }
                    } catch (e) {
                        // 忽略非 JSON 行（比如心跳包或注释）
                        // console.log('Json parse failed for line:', trimmed);
                    }
                }
            }
            
            webview.send('ai-stream-end');
            console.log('流式传输结束');

        } catch (error) {
            console.error('Translation error:', error);
            webview.send('ai-stream-chunk', `\n[Error: ${error.message}]`);
        }
    },

    // 3. 修改：TTS 处理逻辑
    handleBrowserTTS(text) {
        // 停止之前的播放（如果有）
        this.stopTTSActivities();
        
        // 设置长文本内容
        this.readConfig.longText = text;
        
        // 稍微延迟确保状态更新，然后开始朗读
        setTimeout(() => {
            this.startRead();
            
            // 提示用户 (可选)
            // showNotification(this.t('tts_started'), 'success');
        }, 500);
    },

    // 切换引擎下拉
    toggleEngineDropdown() {
        this.showEngineDropdown = !this.showEngineDropdown;
    },

    // 设置引擎并关闭下拉
    setSearchEngine(engine) {
        this.searchEngine = engine;
        this.showEngineDropdown = false;
        // 如果想要切换后自动聚焦输入框
        this.$nextTick(() => {
            const input = document.querySelector('.ios-search-input');
            if(input) input.focus();
        });
    },

    // 搜索框失焦处理 (延迟关闭下拉，防止点击菜单项时菜单先消失)
    handleSearchBlur() {
        this.isSearchFocused = false;
        setTimeout(() => {
            this.showEngineDropdown = false;
        }, 200);
    },

    // 修改原有的 addNewTab，确保样式正确
    addNewTab() {
        const newTab = {
            id: Date.now(),
            title: 'New Tab',
            url: '',
            favicon: '',
            isLoading: false,
            canGoBack: false,
            canGoForward: false
        };
        this.browserTabs.push(newTab);
        this.switchTab(newTab.id);
        
        // 自动聚焦到欢迎页搜索框
        this.$nextTick(() => {
             const input = document.querySelector('.ios-search-input');
             if(input) input.focus();
        });
    },

    handleSelectorEnter() {
        if (this.dropdownTimer) clearTimeout(this.dropdownTimer);
        this.showEngineDropdown = true;
    },

    // 鼠标离开区域：延迟 200ms 关闭，给用户移动鼠标的时间
    handleSelectorLeave() {
        this.dropdownTimer = setTimeout(() => {
            this.showEngineDropdown = false;
        }, 200); // 200ms 延迟
    },

    // ★★★ 核心：处理边缘滚动 ★★★
    handleTabsMouseMove(e) {
      // 在 Options API 中，通过 this.$refs 访问 DOM
      const container = this.$refs.tabsContainerRef;
      
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left; // 鼠标相对于容器左侧的距离
      const width = rect.width;
      const threshold = 60; // 边缘触发滚动的范围 (px)
      const speed = 8;      // 滚动速度

      // 先清除可能存在的旧定时器
      this.stopEdgeScroll();

      // 定义滚动函数
      const scroll = (direction) => {
        if (direction === 'left') {
          container.scrollLeft -= speed;
        } else {
          container.scrollLeft += speed;
        }
        // 持续循环
        this.scrollInterval = requestAnimationFrame(() => scroll(direction));
      };

      // 判断鼠标位置
      if (x < threshold) {
        // 鼠标在左边缘 -> 向左滑
        scroll('left');
      } else if (x > width - threshold) {
        // 鼠标在右边缘 -> 向右滑
        scroll('right');
      } else {
        // 在中间 -> 停止滚动
        this.stopEdgeScroll();
      }
    },

    // 停止滚动
    stopEdgeScroll() {
      if (this.scrollInterval) {
        cancelAnimationFrame(this.scrollInterval);
        this.scrollInterval = null;
      }
    },


    controlDownload(id, action) {
        window.downloadAPI.controlDownload(id, action);
    },

    handleStopOrRemove(item) {
        if (item.state === 'progressing' || item.state === 'paused') {
            // 如果还在下载，就是取消
            this.controlDownload(item.id, 'cancel');
        } else {
            // 如果已完成或已取消，就是从列表中删除记录
            this.downloads = this.downloads.filter(d => d.id !== item.id);
        }
    },

    openFileFolder(path) {
        if(path) window.downloadAPI.showItemInFolder(path);
    },

    clearFinishedDownloads() {
        // 只保留正在下载的项目
        this.downloads = this.downloads.filter(d => d.state === 'progressing' || d.state === 'paused');
    },

    // 字节格式化工具
    formatBytes(bytes, decimals = 1) {
        if (!bytes) return '0 B';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    },
    handleDropdownEnter() {
        // 1. 如果有关闭的定时器正在倒计时，立刻取消它！
        if (this.dropdownTimer) {
            clearTimeout(this.dropdownTimer);
            this.dropdownTimer = null;
        }
        // 2. 显示面板
        this.showDownloadDropdown = true;
    },

    // ★ 鼠标离开
    handleDropdownLeave() {
        // 给用户 300ms 的反应时间
        this.dropdownTimer = setTimeout(() => {
            this.showDownloadDropdown = false;
            this.dropdownTimer = null;
        }, 300); 
    },

    async initChromeMCPSettings() {
        if (!window.electronAPI) return;

        // 1. 询问主进程：你现在开 CDP 了吗？端口是多少？
        const cdpInfo = await window.electronAPI.getInternalCDPInfo();
        
        // 2. 如果主进程确实开启了内部模式
        if (cdpInfo.active) {
            console.log(`[Frontend] 检测到内部 CDP 已激活，端口: ${cdpInfo.port}`);
            
            // 强制同步前端数据
            this.chromeMCPSettings.type = 'internal'; 
            this.chromeMCPSettings.CDPport = cdpInfo.port;
            
            // 这里不一定强制 enabled = true，因为 enabled 代表“Python服务是否在运行”
            // 但如果 Electron 开了端口，通常意味着配置里 enabled 是 true
            // 我们更新配置文件，确保端口是最新的
            await this.autoSaveSettings();
        }
    },
    // ===============================================
    // Python Agent 专用接口 (Electron API 桥接)
    // ===============================================

    // --- 基础信息与导航 ---

    getPagesInfo() {
        const info = this.browserTabs.map((tab, index) => ({
            index: index,
            id: tab.id,
            title: tab.title || 'Loading...',
            url: tab.url || '',
            active: tab.id === this.currentTabId
        }));
        return JSON.stringify(info);
    },

    closeTabByIndex(index) {
        const tabId = this.getTabIdByIndex(index);
        if (tabId) {
            this.closeTab(tabId);
            return "Closed tab index " + index;
        }
        return "Error: Tab index " + index + " not found";
    },

    switchTabByIndex(index) {
        const tabId = this.getTabIdByIndex(index);
        if (tabId) {
            this.switchTab(tabId);
            this.activeMenu = 'ai-browser';
            return "Selected tab index " + index;
        }
        return "Error: Tab index " + index + " not found";
    },

    browserNavigate(type, url, ignoreCache) {
        const wv = this.getWebview();
        if (!wv) return "Error: No active webview";

        try {
            this.activeMenu = 'ai-browser'; // 切换到 AI Browser 菜单
            switch (type) {
                case 'url':
                    if (!url) return "Error: URL is required";
                    this.navigateTo(url);
                    return "Navigating to " + url;
                case 'back':
                    if (wv.canGoBack()) {
                        wv.goBack();
                        return "Navigated Back";
                    }
                    return "Error: Cannot go back";
                case 'forward':
                    if (wv.canGoForward()) {
                        wv.goForward();
                        return "Navigated Forward";
                    }
                    return "Error: Cannot go forward";
                case 'reload':
                    if (ignoreCache) wv.reloadIgnoringCache();
                    else wv.reload();
                    return "Reloaded";
                default:
                    // 默认为 URL 导航
                    if (url) {
                        this.navigateTo(url);
                        return "Navigated to " + url;
                    }
                    return "Error: Unknown navigation type";
            }
        } catch (e) {
            return "Navigation Exception: " + e.message;
        }
    },

    // ===============================================
    // Python Agent 专用接口 (稳定 JS 注入版)
    // ===============================================

    // --- 0. 拟人化延迟辅助函数 ---
    async _humanDelay() {
        // 随机延迟 100ms 到 1000ms (0.1s - 1s)
        const delay = Math.floor(Math.random() * 900) + 100;
        await new Promise(resolve => setTimeout(resolve, delay));
    },

    // --- 1. 伪装成 A11y 树的快照 (无延迟，读取操作越快越好) ---
    async getWebviewSnapshot(verbose = false) {
        const wv = this.getWebview();
        if (!wv) return "Error: No active webview";
        if (wv.isLoading()) return "Error: Page is loading...";

        const script = `
        (function() {
            try {
                if (!window._ai_uid_counter) window._ai_uid_counter = 1;
                const interactiveSelector = 'a, button, input, textarea, select, details, label, summary, [role="button"], [role="link"], [role="menuitem"], [role="tab"], [onclick]';
                
                function isVisible(el) {
                    const style = window.getComputedStyle(el);
                    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0' && el.offsetWidth > 0;
                }

                function getSafeText(el) {
                    if (el.getAttribute('aria-label')) return el.getAttribute('aria-label');
                    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return el.value || el.getAttribute('placeholder') || '';
                    if (el.tagName === 'SELECT') return el.options[el.selectedIndex]?.text || '';
                    return el.innerText ? el.innerText.slice(0, 50).replace(/[\\r\\n]+/g, ' ').trim() : '';
                }

                function getRole(el) {
                    if (el.getAttribute('role')) return el.getAttribute('role');
                    return el.tagName.toLowerCase();
                }

                const elements = document.querySelectorAll(interactiveSelector);
                const lines = [];

                elements.forEach(el => {
                    if (!isVisible(el)) return;
                    let uid = el.getAttribute('data-ai-id');
                    if (!uid) {
                        uid = 'ai-' + window._ai_uid_counter++;
                        el.setAttribute('data-ai-id', uid);
                    }
                    const role = getRole(el);
                    const name = getSafeText(el);
                    const value = (el.value && el.value !== name) ? el.value : '';
                    
                    let line = \`[\${uid}] \${role}\`;
                    if (name) line += \` "\${name}"\`;
                    if (value) line += \` Value: "\${value}"\`;

                    lines.push(line);
                });

                if (lines.length === 0) return "Page empty or no interactive elements found.";
                return lines.join('\\n');
            } catch (e) {
                return "Snapshot Script Error: " + e.message;
            }
        })()
        `;
        
        try {
            return await wv.executeJavaScript(script);
        } catch (e) {
            return "Vue Snapshot Error: " + e.message;
        }
    },

    // --- 2. 点击 (增加延迟) ---
    async webviewClick(uid, dblClick = false) {
        const wv = this.getWebview();
        if (!wv) return "Error: No active webview";
        wv.focus();
        const script = `
        (async function() {
            const el = document.querySelector('[data-ai-id="${uid}"]');
            if (!el) return "Element not found: ${uid}";
            
            // 1. 滚动到可见 (平滑滚动更像人)
            el.scrollIntoView({behavior: "smooth", block: "center", inline: "center"});
            
            // 等待一小会儿让滚动完成
            await new Promise(r => setTimeout(r, 200));

            // 2. 计算随机坐标 (核心改进)
            const rect = el.getBoundingClientRect();
            // 不点边缘，只在中心 80% 区域内随机
            // Math.random() - 0.5 生成 -0.5 到 0.5 的数
            const randomX = (Math.random() - 0.5) * (rect.width * 0.8); 
            const randomY = (Math.random() - 0.5) * (rect.height * 0.8);
            
            // 加上 rect.left 等于视口绝对坐标，加上 rect.width/2 等于中心点
            // clientX/Y 是相对于视口的
            const clientX = rect.left + (rect.width / 2) + randomX;
            const clientY = rect.top + (rect.height / 2) + randomY;

            // 3. 构造事件对象 (带真实坐标)
            const opts = { 
                bubbles: true, 
                cancelable: true, 
                view: window, 
                buttons: 1,
                clientX: clientX,
                clientY: clientY,
                screenX: clientX + window.screenX, // 模拟屏幕坐标
                screenY: clientY + window.screenY
            };

            // 4. 触发完整的事件链
            el.dispatchEvent(new MouseEvent('mouseover', opts));
            el.dispatchEvent(new MouseEvent('mousedown', opts));
            // 鼠标按下和抬起之间极短的停顿
            await new Promise(r => setTimeout(r, Math.floor(Math.random() * 50) + 10)); 
            el.dispatchEvent(new MouseEvent('mouseup', opts));
            el.dispatchEvent(new MouseEvent('click', opts));
            
            if (${dblClick}) {
                el.dispatchEvent(new MouseEvent('dblclick', opts));
            }
            return "Clicked " + "${uid}";
        })()
        `;
        
        try {
            const result = await wv.executeJavaScript(script);
            // 操作后的大延迟（模拟思考下一步）
            await this._humanDelay();
            return result;
        } catch (e) {
            return "Click Error: " + e.message;
        }
    },

    // --- 3. 输入 (增加延迟) ---
    async webviewFill(uid, value) {
        const wv = this.getWebview();
        if (!wv) return "Error: No active webview";
        wv.focus();
        // 注意：这里需要把 value 传给 JS，使用 JSON.stringify 确保安全
        const script = `
        (async function() {
            const el = document.querySelector('[data-ai-id="${uid}"]');
            if (!el) return "Element not found: ${uid}";
            
            el.focus();
            
            const text = ${JSON.stringify(value)};
            
            // 获取原生 Setter (解决 React/Vue 无法监听 js 赋值的问题)
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
            
            // 清空现有内容 (如果需要追加模式，可以去掉这行)
            if (nativeInputValueSetter) {
                nativeInputValueSetter.call(el, '');
            } else {
                el.value = '';
            }
            el.dispatchEvent(new Event('input', { bubbles: true }));

            // ★ 核心：逐字输入循环
            for (let i = 0; i < text.length; i++) {
                const char = text[i];
                
                // 1. 模拟按键按下 (keydown)
                el.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
                el.dispatchEvent(new KeyboardEvent('keypress', { key: char, bubbles: true }));

                // 2. 更新值 (模拟输入进去的效果)
                const currentVal = el.value + char;
                if (nativeInputValueSetter && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
                    nativeInputValueSetter.call(el, currentVal);
                } else {
                    el.value = currentVal;
                }

                // 3. 触发 input 事件 (让框架知道值变了)
                el.dispatchEvent(new InputEvent('input', { data: char, inputType: 'insertText', bubbles: true }));
                
                // 4. 模拟按键抬起 (keyup)
                el.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));

                // ★ 5. 随机打字延迟 (30ms - 150ms)
                // 模拟人打字忽快忽慢
                const delay = Math.floor(Math.random() * 120) + 30;
                await new Promise(r => setTimeout(r, delay));
            }

            // 完成后的 change 事件
            el.dispatchEvent(new Event('change', { bubbles: true }));
            
            // 稍微停顿后失焦
            await new Promise(r => setTimeout(r, 200));
            el.blur();

            return "Filled " + "${uid}";
        })()
        `;
        
        try {
            const result = await wv.executeJavaScript(script);
            // 操作后的大延迟
            await this._humanDelay();
            return result;
        } catch (e) {
            return "Fill Error: " + e.message;
        }
    },

    // --- 4. 批量填表 (增加延迟) ---
    async webviewFillForm(elements) {
        const wv = this.getWebview();
        if (!wv) return "Error: No active webview";
        wv.focus();
        const dataStr = JSON.stringify(elements); 

        const script = `
        (function() {
            const items = ${dataStr};
            const log = [];
            items.forEach(item => {
                const el = document.querySelector('[data-ai-id="' + item.uid + '"]');
                if (el) {
                    el.focus();
                    el.value = item.value;
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                    log.push(item.uid);
                }
            });
            return "Filled elements: " + log.join(', ');
        })()
        `;
        
        const result = await wv.executeJavaScript(script);
        
        // ★ 批量操作后等待
        await this._humanDelay();
        
        return result;
    },

    // --- 5. 拖拽 (增加延迟) ---
    async webviewDrag(fromUid, toUid) {
        const wv = this.getWebview();
        if (!wv) return "Error: No active webview";
        wv.focus();
        const script = `
        (function() {
            const src = document.querySelector('[data-ai-id="${fromUid}"]');
            const tgt = document.querySelector('[data-ai-id="${toUid}"]');
            if (!src || !tgt) return "Elements not found";

            const srcRect = src.getBoundingClientRect();
            const tgtRect = tgt.getBoundingClientRect();
            const clientX = srcRect.left + srcRect.width / 2;
            const clientY = srcRect.top + srcRect.height / 2;
            const targetX = tgtRect.left + tgtRect.width / 2;
            const targetY = tgtRect.top + tgtRect.height / 2;

            const emit = (type, x, y) => {
                const ev = new MouseEvent(type, { 
                    bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, buttons: 1 
                });
                (type === 'mouseup' ? tgt : src).dispatchEvent(ev);
            };

            emit('mousedown', clientX, clientY);
            emit('mousemove', clientX + 5, clientY + 5); 
            emit('mousemove', targetX, targetY);         
            emit('mouseup', targetX, targetY);           

            return "Dragged " + "${fromUid}" + " to " + "${toUid}";
        })()
        `;
        
        const result = await wv.executeJavaScript(script);
        
        // ★ 拖拽动作幅度大，等待时间可以稍微长一点（这里复用随机等待）
        await this._humanDelay();
        
        return result;
    },

    // --- 6. 悬停 (增加延迟) ---
    async webviewHover(uid) {
        const wv = this.getWebview();
        if (!wv) return "Error: No active webview";
        wv.focus();
        const script = `
        (function() {
            const el = document.querySelector('[data-ai-id="${uid}"]');
            if (!el) return "Element not found";
            el.scrollIntoView({block: "center"});
            el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
            el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
            return "Hovered " + "${uid}";
        })()
        `;
        
        const result = await wv.executeJavaScript(script);
        
        // ★ 悬停通常是为了看东西，稍微等一下合理
        await this._humanDelay();
        
        return result;
    },

    // --- 8. 处理弹窗 (无延迟) ---
    async webviewHandleDialog(action, promptText) {
        // ... (代码保持不变，弹窗处理通常是瞬时的) ...
        const wv = this.getWebview();
        if (!wv) return "Error: No active webview";
        wv.focus();
        const script = `
        (function() {
            window.__ai_dialog_action = "${action}"; 
            window.__ai_dialog_text = ${JSON.stringify(promptText || "")};
            window.alert = function() { return true; };
            window.confirm = function() { return window.__ai_dialog_action === 'accept'; };
            window.prompt = function() { return window.__ai_dialog_action === 'accept' ? window.__ai_dialog_text : null; };
            return "Dialog handlers patched";
        })()
        `;
        return await wv.executeJavaScript(script);
    },

    // --- 9. 按键 (增加延迟) ---
    async webviewPressKey(keyCombo, uid) {
        const wv = this.getWebview();
        if (!wv) return "Error: No active webview";
        wv.focus();

        // 1. 获取元素坐标 (JS 只负责告诉我们它在哪)
        const rectScript = `
        (function() {
            const el = document.querySelector('[data-ai-id="${uid}"]');
            if (!el) return null;
            
            // 滚动到屏幕中间
            el.scrollIntoView({behavior: "auto", block: "center", inline: "center"});
            
            // 获取相对于视口的精确坐标
            const rect = el.getBoundingClientRect();
            return {
                x: rect.left + (rect.width / 2),
                y: rect.top + (rect.height / 2)
            };
        })()
        `;

        try {
            const rect = await wv.executeJavaScript(rectScript);
            if (!rect) return "Element not found: " + uid;

            // ★ 关键修复：使用 sendInputEvent 发送真实的鼠标点击
            // 这会强制操作系统将焦点转移到该坐标下的输入框
            // 注意：x, y 是相对于 Webview 左上角的坐标
            
            // 1. 移动并按下鼠标
            wv.sendInputEvent({ 
                type: 'mouseDown', 
                x: rect.x, 
                y: rect.y, 
                button: 'left', 
                clickCount: 1 
            });
            
            // 2. 抬起鼠标 (完成点击)
            wv.sendInputEvent({ 
                type: 'mouseUp', 
                x: rect.x, 
                y: rect.y, 
                button: 'left', 
                clickCount: 1 
            });

            // 等待点击生效，输入框激活光标
            await new Promise(r => setTimeout(r, 400));

            // 3. 处理按键
            const parts = keyCombo.split('+').map(k => k.trim());
            let key = parts.pop(); 
            const modifiers = parts.map(m => m.toLowerCase());
            
            if (key.toLowerCase() === 'enter') key = 'Enter';

            // 4. 发送原生按键
            // 模拟按下
            wv.sendInputEvent({ type: 'keyDown', keyCode: key, modifiers });
            
            // ★ 补充 char 事件：Enter 键经常需要配套一个 char code 13 (\r)
            // 许多网页(特别是旧一点的或 React 封装的)依赖这个 char 事件来触发表单提交
            if (key === 'Enter') {
                wv.sendInputEvent({ type: 'char', keyCode: '\r', modifiers });
            } else if (key.length === 1) {
                wv.sendInputEvent({ type: 'char', keyCode: key, modifiers });
            }

            // 模拟按住停顿
            await new Promise(r => setTimeout(r, Math.floor(Math.random() * 50) + 30));

            // 模拟抬起
            wv.sendInputEvent({ type: 'keyUp', keyCode: key, modifiers });
            
            await this._humanDelay();
            
            return "Pressed (Native) " + keyCombo + " on " + uid;
        } catch (e) {
            return "PressKey Error: " + e.message;
        }
    },

    // --- 10. 等待文本 (无延迟，这是轮询操作) ---
    async webviewWaitFor(text, timeout) {
        const wv = this.getWebview();
        if (!wv) return "Error: No active webview";
        
        const script = `
        (function() {
            return new Promise((resolve) => {
                const start = Date.now();
                const check = () => {
                    // 1. 优先检查文本是否存在
                    if (document.body.innerText.includes(${JSON.stringify(text)})) {
                        resolve("Found: " + ${JSON.stringify(text)});
                    } 
                    // 2. 检查是否超时
                    else if (Date.now() - start > ${timeout}) {
                        // 3. 关键修改：超时后，检查页面加载状态
                        if (document.readyState === 'complete') {
                            // 页面已加载完毕，但文本未找到
                            resolve("Page loaded");
                        } else {
                            // 页面还在加载中，且超时
                            resolve("Timeout waiting for text");
                        }
                    } 
                    // 4. 继续轮询
                    else {
                        setTimeout(check, 100);
                    }
                };
                check();
            });
        })()
        `;
        return await wv.executeJavaScript(script);
    },

    // --- 11. 截图 (无延迟) ---
    async captureWebviewScreenshot(fullPage = false, uid = null) {
        const wv = this.getWebview();
        if (!wv) return "Error: No active webview";
        wv.focus();
        try {
            // 1. 滚动 (如果指定元素)
            if (uid) {
                await this.webviewClick(uid);
                await this._humanDelay();
            }

            // 2. 捕获页面
            const image = await wv.capturePage();

            // 3. 缩放 (AI 不需要 4K，1280 宽足够，节省 Token)
            const size = image.getSize();
            let resized = image;
            if (size.width > 1280) {
                resized = image.resize({ width: 1280 });
            }

            // 4. 转为 JPEG Buffer (质量 70)
            const buffer = resized.toJPEG(70);

            // 5. 调用主进程保存文件
            // 注意：Buffer 通过 IPC 传输非常快，比 Base64 字符串快得多
            const filename = await window.electronAPI.saveScreenshotDirect(buffer);
            
            // 6. 拼接 URL
            // window.electron.server.port 是在 preload 里暴露的后端端口
            const host = window.electron.server.host || '127.0.0.1';
            const port = window.electron.server.port || 3456;
            
            const fileUrl = `http://${host}:${port}/uploaded_files/${filename}`;
            
            return fileUrl;

        } catch (e) {
            return "Screenshot Error: " + e.message;
        }
    },
    
    // --- 12. 通用 JS 执行 (增加延迟) ---
    async executeInActiveWebview(codeStr, args = []) {
        const wv = this.getWebview();
        if (!wv) return "Error: No active webview";
        wv.focus();
        try {
            const script = `(${codeStr})(...${JSON.stringify(args || [])})`;
            const result = await wv.executeJavaScript(script);
            
            // ★ 自定义脚本执行后也等待，防止 Agent 连续高频调用
            await this._humanDelay();

            if (result === undefined) return "undefined";
            if (result === null) return "null";
            if (typeof result === 'object') return JSON.stringify(result);
            return String(result);

        } catch (e) {
            return "JS Execution Error: " + e.message;
        }
    },
    getFaviconUrl(tab) {
      // 1. 浏览器已经给的就直接用
      if (tab.favicon) return tab.favicon;

      // 2. 用 Chrome 官方提供的“小彩蛋”API，0 成本
      //    注意：这个 API 不需要额外权限，也不会触发网络请求，只是读缓存
      if (chrome && chrome.tabs && typeof chrome.tabs.get === 'function') {
        // 同步读缓存，拿不到也不报错
        try {
          const url = new URL(tab.url);
          return `chrome://favicon/size/16@2x/${url.origin}`;
        } catch (_) {}
      }

      // 3. 兜底：拼一个最可能的地址
      try {
        const u = new URL(tab.url);
        return `${u.origin}/favicon.ico`;
      } catch (_) {}

      // 4. 实在没有就空字符串
      return '';
    },

    // 切换当前标签页的收藏状态
    toggleFavorite(tab) {
        if (!tab || !tab.url) return;

        const index = this.favorites.findIndex(f => f.url === tab.url);
        if (index !== -1) {
            // 已存在 -> 移除
            this.favorites.splice(index, 1);
            showNotification(this.t('favoriteRemoved') || 'Favorite removed', 'info');
        } else {
            // 不存在 -> 添加
            this.favorites.push({
                title: tab.title || 'New Tab',
                url: tab.url,
                favicon: this.getFaviconUrl(tab)
            });
            showNotification(this.t('favoriteAdded') || 'Favorite added', 'success');
        }
        this.saveFavorites();
    },

    // 从网格中移除特定收藏
    removeFavorite(url) {
        const index = this.favorites.findIndex(f => f.url === url);
        if (index !== -1) {
            this.favorites.splice(index, 1);
            this.saveFavorites();
        }
    },

    // 点击收藏图标时，在当前标签页加载 URL
    loadUrlInCurrentTab(url) {
        if (this.currentTab) {
            // 更新当前标签的 URL
            this.currentTab.url = url;
            // 更新地址栏输入框显示
            this.urlInput = url; 
            // 触发加载状态 (如果您的 webview逻辑依赖这个)
            this.currentTab.isLoading = true;
        } else {
            // 如果没有当前标签，创建一个新的
            this.addNewTab(url);
        }
    },

    // 持久化：保存收藏到本地存储
    saveFavorites() {
        try {
            localStorage.setItem('browser_favorites', JSON.stringify(this.favorites));
            // 保存显示状态配置
            localStorage.setItem('browser_show_favorites', JSON.stringify(this.showFavorites));
        } catch (e) {
            console.error('Failed to save favorites:', e);
        }
    },

    // 持久化：从本地存储加载
    loadFavorites() {
        try {
            const storedFavs = localStorage.getItem('browser_favorites');
            if (storedFavs) {
                this.favorites = JSON.parse(storedFavs);
            }
            
            const storedShow = localStorage.getItem('browser_show_favorites');
            if (storedShow !== null) {
                this.showFavorites = JSON.parse(storedShow);
            }
        } catch (e) {
            console.error('Failed to load favorites:', e);
        }
    },

    openBrainEdit(brainKey) {
      this.currentEditingKey = brainKey;
      this.showBrainEditDialog = true;
    },
    handleFirecrawlPresetChange(val) {
      if (val === 'official') {
        this.webSearchSettings.firecrawl_url = 'https://api.firecrawl.dev/v2';
      } else {
        this.webSearchSettings.firecrawl_url = 'http://localhost:3002/v1';
      }
      this.autoSaveSettings();
    },

// Methods

// 1. 获取技能列表
async fetchSkills() {
  try {
    const response = await fetch('/api/skills/list');
    if (!response.ok) {
      throw new Error(response.statusText);
    }
    const data = await response.json();
    this.skillsList = data.skills;
  } catch (error) {
    showNotification(this.t('fetchSkillsFailed'), 'error');
  }
},

// 2. 删除技能
async removeSkill(id) {
  try {
    const response = await fetch(`/api/skills/${id}`, {
      method: 'DELETE'
    });
    
    if (!response.ok) {
      throw new Error('Delete failed');
    }
    
    showNotification(this.t('deleteSuccess'), 'success');
    this.fetchSkills(); // 刷新
  } catch (error) {
    showNotification(this.t('deleteFailed'), 'error');
  }
},

// 3. GitHub 安装
async installSkillFromGithub() {
  if (!this.newSkillUrl) return;
  this.isSkillInstalling = true;
  showNotification(this.t('waitSkillInstall'), 'success');
  try {
    const response = await fetch('/api/skills/install-from-github', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        url: this.newSkillUrl
      })
    });

    if (!response.ok) {
      // 尝试解析后端返回的 JSON 错误信息
      const errorData = await response.json().catch(() => ({})); 
      const errorMessage = errorData.detail || response.statusText || 'Unknown Error';
      throw new Error(errorMessage);
    }

    showNotification(this.t('installSuccess'), 'success');
    this.showAddSkillDialog = false;
    this.newSkillUrl = '';
    // 稍微延迟后刷新一下，虽然是后台任务，但可能很快完成
    setTimeout(() => this.fetchSkills(), 2000);
  } catch (error) {
    showNotification(this.t('installFailed') + ': ' + error.message, 'error');
  } finally {
    this.isSkillInstalling = false;
  }
},

// 4. 点击 DIV 时，模拟点击隐藏的 input
triggerSkillFileSelect() {
  // 注意：如果你使用的是 Vue 3 <script setup>，需要 const skillFileInput = ref(null) 并使用 skillFileInput.value.click()
  // 如果是 Options API (export default):
  this.$refs.skillFileInput.click();
},

// 5. 处理“点击选择”后的文件变化
handleSkillFileChange(e) {
  const files = e.target.files;
  if (files && files.length > 0) {
    this.processSkillUpload(files[0]);
  }
  // 清空 input，防止同一个文件无法再次触发 change
  e.target.value = ''; 
},

// 6. 处理“拖拽释放”后的文件
handleSkillDrop(e) {
  const files = e.dataTransfer.files;
  if (files && files.length > 0) {
    this.processSkillUpload(files[0]);
  }
},

// 7. 统一的上传逻辑 (核心)
async processSkillUpload(file) {
  // 校验文件类型
  if (!file.name.toLowerCase().endsWith('.zip')) {
    // 这里原来的 ElMessage.error 改为了 showNotification
    showNotification(this.t('skillZipNote'), 'error'); 
    return;
  }

  this.isUploading = true; // 开启遮罩

  const formData = new FormData();
  formData.append('file', file);

  try {
    const response = await fetch('/api/skills/upload-zip', {
      method: 'POST',
      body: formData
      // 注意：使用 fetch 发送 FormData 时，千万不要手动设置 Content-Type！
      // 浏览器会自动计算 boundary 并设置为 multipart/form-data
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || this.t('installFailed'));
    }

    showNotification(this.t('installSuccess'), 'success');
    this.showAddSkillDialog = false;
    this.fetchSkills(); // 刷新列表
  } catch (error) {
    showNotification(error.message, 'error');
  } finally {
    this.isUploading = false; // 关闭遮罩
  }
},

isSkillInProject(skillId) {
  return this.skillsInProject && this.skillsInProject.includes(skillId);
},

    // 1. 升级获取项目状态：顺便保存详细信息
    async fetchProjectSkillsStatus() {
      if (!this.CLISettings.cc_path) {
        this.skillsInProject = [];
        this.projectSkillsDetails = [];
        return;
      }
      try {
        const res = await fetch(`/api/skills/project-status?path=${encodeURIComponent(this.CLISettings.cc_path)}`);
        if (res.ok) {
          const data = await res.json();
          this.skillsInProject = data.installed_ids || [];
          this.projectSkillsDetails = data.project_skills || []; // 存入详情
        }
      } catch (e) {
        console.error("获取项目技能状态失败", e);
      }
    },

    // 2. 反向同步：从项目 -> 全局
    async syncToGlobal(skillId) {
      try {
        const response = await fetch('/api/skills/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ skill_id: skillId, project_path: this.CLISettings.cc_path, action: 'sync_to_global' })
        });
        const data = await response.json();
        if (response.ok && data.status === 'success') {
          showNotification('Skill synced to Global', 'success');
          this.fetchSkills(); // 刷新全局状态即可
        } else {
          throw new Error(data.detail || 'Sync failed');
        }
      } catch (e) {
        showNotification(e.message, 'error');
      }
    },

    // 3. 正向同步：从全局 -> 项目 (原逻辑略微简化)
    async syncToProject(skillId) {
      if (!this.CLISettings.cc_path) return;
      try {
        const response = await fetch('/api/skills/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ skill_id: skillId, project_path: this.CLISettings.cc_path, action: 'install' })
        });
        if (response.ok) {
          showNotification('Skill synced to Workspace', 'success');
          this.fetchProjectSkillsStatus(); // 刷新项目状态
        } else {
          throw new Error('Sync failed');
        }
      } catch (e) {
        showNotification(e.message, 'error');
      }
    },

    // 4. 从全局删除（智能提示）
    async removeGlobalSkill(skill) {
      const execDelete = async () => {
        try {
          const response = await fetch(`/api/skills/${encodeURIComponent(skill.id)}`, { method: 'DELETE' });
          if (response.ok) {
            showNotification('Removed globally', 'success');
            await this.fetchSkills(); 
          } else {
            throw new Error('Remove failed');
          }
        } catch (e) {
          showNotification(e.message, 'error');
        }
      };

      // 核心判断：如果项目里也没有了，说明这是彻底删除，必须警告！
      if (!skill.isProject) {
        this.$confirm(this.t('deleteSkillConfirm'), this.t('warning'), { type: 'warning' })
          .then(execDelete).catch(() => {});
      } else {
        // 项目里还有，属于安全操作，静默删除
        execDelete();
      }
    },

    // 5. 从项目删除（智能提示）
    async removeProjectSkill(skill) {
      const execDelete = async () => {
        try {
          const response = await fetch('/api/skills/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ skill_id: skill.id, project_path: this.CLISettings.cc_path, action: 'remove' })
          });
          if (response.ok) {
            showNotification('Removed from Workspace', 'success');
            await this.fetchProjectSkillsStatus(); 
          } else {
            throw new Error('Remove failed');
          }
        } catch (e) {
          showNotification(e.message, 'error');
        }
      };

      // 核心判断：如果全局里也没有了，说明这是彻底删除，必须警告！
      if (!skill.isGlobal) {
        this.$confirm('此操作将彻底删除该技能文件，是否继续？', 'Warning', { type: 'warning' })
          .then(execDelete).catch(() => {});
      } else {
        // 全局里还有，属于安全操作，静默删除
        execDelete();
      }
    },

// 切换技能同步状态
async toggleSkillInProject(skillId, isInstall) {
  if (!this.CLISettings.cc_path) return;

  const action = isInstall ? 'install' : 'remove';
  try {
    const response = await fetch('/api/skills/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        skill_id: skillId,
        project_path: this.CLISettings.cc_path,
        action: action
      })
    });

    if (!response.ok) throw new Error('Sync failed');

    // 更新本地状态列表
    if (isInstall) {
      if (!this.skillsInProject.includes(skillId)) this.skillsInProject.push(skillId);
    } else {
      this.skillsInProject = this.skillsInProject.filter(id => id !== skillId);
    }
    
    showNotification(this.t('operationSuccess'), 'success');
  } catch (error) {
    showNotification(this.t('operationFailed'), 'error');
    // 刷新状态以回滚 UI 开关
    this.fetchProjectSkillsStatus();
  }
},

// --- 增强原有的监听和初始化 ---

// 修改 handleSkillsPolling，在进入技能标签页时同时刷新项目状态
handleSkillsPolling(activeMenu, menu, tab) {
  if (activeMenu === 'toolkit' && menu === 'CLI' && tab === 'skills') {
    this.fetchProjectSkillsStatus(); // 额外执行这一步
    this.startSkillsPolling();
  } else {
    this.stopSkillsPolling();
  }
},

  // 启动轮询
  startSkillsPolling() {
    if (this.skillsPollingTimer) return; // 如果已经在轮询了，就不重复启动
    
    // 立即先执行一次，不要等第一个 5 秒
    this.fetchSkills(); 

    // 设置每 5 秒执行一次
    this.skillsPollingTimer = setInterval(() => {
      console.log('正在轮询获取 Skills...');
      this.fetchSkills();
    }, 5000);
  },

  // 停止轮询
  stopSkillsPolling() {
    if (this.skillsPollingTimer) {
      clearInterval(this.skillsPollingTimer);
      this.skillsPollingTimer = null;
      console.log('已停止轮询 Skills');
    }
  },
// 核心逻辑：判断并控制扩展页面的轮询
  handleExtensionsPolling(menu, sub) {
    if (menu === 'api-group' && sub === 'extension') {
      this.startExtensionsPolling();
    } else {
      this.stopExtensionsPolling();
    }
  },

  // 启动扩展轮询
  startExtensionsPolling() {
    if (this.extensionsPollingTimer) return;
    
    // 立即执行一次刷新
    this.scanExtensions(); 

    this.extensionsPollingTimer = setInterval(() => {
      console.log('正在轮询获取 Extensions...');
      this.scanExtensions();
    }, 5000);
  },

  // 停止扩展轮询
  stopExtensionsPolling() {
    if (this.extensionsPollingTimer) {
      clearInterval(this.extensionsPollingTimer);
      this.extensionsPollingTimer = null;
      console.log('已停止轮询 Extensions');
    }
  },

  // 刷新扩展列表，并在之后对比版本状态
  async scanExtensions() {
    try {
      const response = await fetch('/api/extensions/list');
      if (!response.ok) throw new Error('Fetch failed');
      const data = await response.json();
      this.extensions = data.extensions;
      
      // 同步本地与远程的“已安装”和“可更新”状态
      this.syncExtensionUpdateStatus();
    } catch (e) {
      console.error('刷新扩展列表失败', e);
    }
  },
  
  // 辅助方法：对比本地和远程，同步更新状态
  syncExtensionUpdateStatus() {
    if (!this.extensions || !this.remotePlugins) return;

    // 1. 遍历远程列表，标记 "installed" 和 "hasUpdate" 状态
    this.remotePlugins = this.remotePlugins.map(r => {
      const local = this.extensions.find(l => 
          (l.repository && r.repository && l.repository.trim().toLowerCase() === r.repository.trim().toLowerCase()) || 
          (l.id && r.id && l.id === r.id)
      );
      let installed = !!local;
      let hasUpdate = false;
      
      if (local && local.version && r.version) {
        if (this.compareVersions(local.version, r.version) < 0) {
          hasUpdate = true;
        }
      }
      return { ...r, installed, hasUpdate };
    });

    // 2. 遍历本地列表，标记 "hasUpdate" 状态
    this.extensions = this.extensions.map(l => {
      const remote = this.remotePlugins.find(r => 
          (l.repository && r.repository && l.repository.trim().toLowerCase() === r.repository.trim().toLowerCase()) || 
          (l.id && r.id && l.id === r.id)
      );
      let hasUpdate = false;
      if (remote && l.version && remote.version) {
        if (this.compareVersions(l.version, remote.version) < 0) {
          hasUpdate = true;
        }
      }
      return { ...l, hasUpdate };
    });
  },

  // 辅助方法：语义化版本比较
  compareVersions(v1, v2) {
    if (!v1 || !v2) return 0;
    const parts1 = v1.toString().replace(/[^0-9.]/g, '').split('.').map(Number);
    const parts2 = v2.toString().replace(/[^0-9.]/g, '').split('.').map(Number);
    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const num1 = parts1[i] || 0;
      const num2 = parts2[i] || 0;
      if (num1 < num2) return -1;
      if (num1 > num2) return 1;
    }
    return 0;
  },
// 预览技能
async previewSkill(id) {
  this.showSkillPreviewDialog = true;
  this.skillPreviewLoading = true;
  this.renderedSkillContent = '';

  try {
    const response = await fetch(`/api/skills/${id}/content`);
    if (!response.ok) throw new Error('Fetch failed');
    const data = await response.json();
    let rawContent = data.content || '';

    // 1. 剥离 YAML Frontmatter (--- ... ---)
    // 这样预览时不会显示冗余的元数据
    const yamlRegex = /^---\s*\n([\s\S]*?)\n---\s*\n?/;
    const contentToRender = rawContent.replace(yamlRegex, '');

    // 2. 使用你已有的 md 实例进行渲染
    // 注意：这里直接调用 md.render。
    // 如果你希望保持和聊天框完全一致的逻辑（含 LaTeX、think 标签处理等），
    // 可以调用你写的 this.formatMessage(contentToRender)
    this.renderedSkillContent = this.formatMessage(contentToRender);

  } catch (error) {
    showNotification(this.t('fetchFailed'), 'error');
    this.showSkillPreviewDialog = false;
  } finally {
    this.skillPreviewLoading = false;
  }
},

  handleRemoteMCPInstall(data) {
    console.log('handleRemoteMCPInstall', data);

    // 1. 自动切换路由/菜单到 MCP 管理页面
    this.activeMenu = 'toolkit'; 
    this.subMenu = 'mcp';

    // 2. 初始化对话框状态为“添加模式”
    this.isEditMode = false;
    this.activeDialogTab = 'config'; // 默认显示配置标签
    
    if (data.mcpType) {
        this.newMCPType = data.mcpType;
    } else {
        this.newMCPType = 'stdio'; // 默认值
    }

    // 3. 设置输入模式为 JSON（因为远程传来的通常是完整配置对象）
    this.mcpInputType = 'json';
    this.updateMCPExample(); // 更新示例配置
    // data 现在包含 { type: 'mcp', config: '...', repo: null }
    let configStr = data.config;
    
    // 1. 尝试解码（因为主进程发过来的是原始 URL 参数，可能还带着编码）
    try {
      configStr = decodeURIComponent(configStr);
    } catch(e) {}

    this.newMCPJson = configStr; // 填入文本框
    this.showAddMCPDialog = true; // 弹窗
  },
// 在 methods 中添加
async openSkillsFolder() {
  try {
    const response = await fetch('/api/skills/get_path', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });
    if (response.ok) {
      const data = await response.json();
      if (this.isElectron && data.path) {
        // 调用 Electron 接口打开本地路径
        window.electronAPI.openPath(data.path);
      }
    }
  } catch (error) {
    console.error("Failed to open skills folder:", error);
  }
},

async handleRefreshSkills() {
  this.skillsLoading = true;
  try {
    // 假设你已定义了 fetchSkills 方法来获取列表
    await this.fetchSkills(); 
  } finally {
    this.skillsLoading = false;
  }
},

    // 打开编辑/新增对话框
    openBehaviorDialog(index) {
      this.currentBehaviorIndex = index;
      if (index === -1) {
        // 新增模式：创建默认模板的深拷贝
        this.tempBehavior = this.createDefaultBehavior();
      } else {
        // 编辑模式：创建现有数据的深拷贝（切断引用）
        // 假设您的数据在 behaviorSettings.behaviorList 中
        this.tempBehavior = JSON.parse(JSON.stringify(this.behaviorSettings.behaviorList[index]));
      }
      
      this.showBehaviorDialog = true;
    },

    // 创建默认行为模板
    createDefaultBehavior() {
      return {
        enabled: true,
        trigger: {
          type: 'time',
          time: { timeValue: '08:00:00', days: [1, 2, 3, 4, 5] },
          noInput: { latency: 60 },
          cycle: { cycleValue: '00:30:00', repeatNumber: 1, isInfiniteLoop: true }
        },
        action: {
          type: 'prompt',
          prompt: '',
          random: { type: 'random', events: [''] }
        },
        platforms: ["chat"],  // 新增多选渠道字段（字符串数组）
      };
    },

    // 关闭对话框后的清理
    resetBehaviorDialogState() {
      this.tempBehavior = null;
      this.currentBehaviorIndex = -1;
    },

    // 保存行为设置（新增或更新）
    saveBehavior() {
      if (!this.tempBehavior) return;

      // 1. 核心修复：确保 platforms 字段一定是数组且有值
      if (!Array.isArray(this.tempBehavior.platforms)) {
        // 如果没有数组，根据旧的单选字段转换，或者给默认值
        let oldVal = this.tempBehavior.platform || 'chat';
        this.tempBehavior.platforms = [oldVal];
      }
      
      // 如果用户一个都没选（空数组），强制给个 'chat'
      if (this.tempBehavior.platforms.length === 0) {
        this.tempBehavior.platforms = ['chat'];
      }

      // 2. 同步旧字段 platform，取数组第一个元素
      this.tempBehavior.platform = this.tempBehavior.platforms[0];

      // 3. 保存逻辑
      if (this.isEditingBehavior) {
        // 查找并替换旧项
        const idx = this.behaviorSettings.behaviorList.findIndex(b => b === this.editingItemOrigin);
        if (idx !== -1) {
          this.behaviorSettings.behaviorList[idx] = JSON.parse(JSON.stringify(this.tempBehavior));
        }
      } else {
        // 新增项
        this.behaviorSettings.behaviorList.push(JSON.parse(JSON.stringify(this.tempBehavior)));
      }

      this.showBehaviorDialog = false;
      
      // 4. 保存后刷新计时器
      this.$nextTick(() => {
        this.resetCycleTimers();
      });
    },

    // 确认删除行为
    confirmRemoveBehavior(index) {
      this.$confirm(
        this.t('confirmDeleteBehavior') || 'Are you sure you want to delete this behavior?',
        this.t('warning') || 'Warning',
        {
          confirmButtonText: this.t('confirm'),
          cancelButtonText: this.t('cancel'),
          type: 'warning',
        }
      ).then(() => {
        this.removeBehavior(index);
      }).catch(() => {});
    },

    // 执行删除
    removeBehavior(index) {
      this.behaviorSettings.behaviorList.splice(index, 1);
      this.resetCycleTimers();
      this.autoSaveSettings();
    },

    // 处理全局开关变化
    handleGlobalSwitchChange() {
      this.resetCycleTimers();
      this.autoSaveSettings();
    },

    // 处理单个行为开关变化
    handleBehaviorChange() {
      this.resetCycleTimers();
      this.autoSaveSettings();
    },

    // --- 弹窗内部的辅助方法 (Random Events) ---

    // 添加临时随机事件条目
    addTempEvent() {
      if (this.tempBehavior && this.tempBehavior.action.random) {
        this.tempBehavior.action.random.events.push('');
      }
    },

    // 删除临时随机事件条目
    removeTempEvent(eIdx) {
      if (this.tempBehavior && 
          this.tempBehavior.action.random && 
          this.tempBehavior.action.random.events.length > 1) {
        this.tempBehavior.action.random.events.splice(eIdx, 1);
      }
    },

    // --- UI 显示辅助方法 ---

    // 根据触发类型返回图标类名
    getTriggerIcon(type) {
      const map = {
        'time': 'fa-regular fa-clock',
        'noInput': 'fa-solid fa-hourglass-half',
        'cycle': 'fa-solid fa-arrows-spin'
      };
      return map[type] || 'fa-solid fa-bolt';
    },

    // 生成卡片上的摘要文本
    getBehaviorSummary(b) {
      if (!b || !b.trigger) return '';
      
      if (b.trigger.type === 'time') {
        const time = b.trigger.time.timeValue;
        const days = b.trigger.time.days.length;
        const daysText = this.t('repeatDays') || 'Days'; // 简单处理，实际根据你的 t 函数逻辑
        return `${time} (${daysText}: ${days})`;
      } else if (b.trigger.type === 'noInput') {
        return `${this.t('noInputLatency') || 'Latency'}: ${b.trigger.noInput.latency}s`;
      } else if (b.trigger.type === 'cycle') {
        const loopText = b.trigger.cycle.isInfiniteLoop ? '∞' : b.trigger.cycle.repeatNumber;
        return `${this.t('cycleValue') || 'Cycle'}: ${b.trigger.cycle.cycleValue} (x${loopText})`;
      }
      return '';
    },
  // 添加新事件行
  addTempEvent() {
    if (this.tempBehavior && this.tempBehavior.action.random) {
      this.tempBehavior.action.random.events.push(''); // 增加一个空字符串（即空输入框）
    }
  },

  // 删除指定行
  removeTempEvent(index) {
    if (this.tempBehavior && this.tempBehavior.action.random) {
      // 检查：如果只剩一个了，就不让删了（或者您可以去掉这个判断，允许删光）
      if (this.tempBehavior.action.random.events.length > 1) {
        this.tempBehavior.action.random.events.splice(index, 1);
      } else {
        // 如果只剩一个，清空内容而不是删除行
        this.tempBehavior.action.random.events[0] = '';
      }
    }
  },

    // 辅助工具：生成数字范围数组
    makeRange(start, end) {
      const result = [];
      for (let i = start; i <= end; i++) {
        result.push(i);
      }
      return result;
    },

    // 禁用小时
    disabledHours() {
      // 只有在最小值的小时大于 0 时才需要禁用
      // 如果最小是 00:00:01，则不禁用任何小时
      return this.makeRange(0, 23).filter(h => h < this.minLimit.h);
    },

    // 禁用分钟 (selectedHour 是当前转盘选中的小时)
    disabledMinutes(selectedHour) {
      // 只有当选中的小时等于最小值的小时时，才限制分钟
      if (selectedHour === this.minLimit.h) {
        return this.makeRange(0, 59).filter(m => m < this.minLimit.m);
      }
      return [];
    },

    // 禁用秒钟 (selectedHour 和 selectedMinute 是当前选中的时和分)
    disabledSeconds(selectedHour, selectedMinute) {
      // 只有当时和分都处于最小值临界点时，才限制秒钟
      if (selectedHour === this.minLimit.h && selectedMinute === this.minLimit.m) {
        return this.makeRange(0, 59).filter(s => s < this.minLimit.s);
      }
      return [];
    },

    async probeDocker() {
      try {
        const res = await fetch('/api/docker/probe');
        const data = await res.json();
        this.dockerInstalled = data.installed;
      } catch (error) {
        console.error("Docker 探测失败:", error);
        this.dockerInstalled = false;
      }
    },

    // 打开任务中心
    openTaskCenter() {
        this.activeSideView = 'tasks';
        this.sidePanelURL = ''; // 确保 iframe 关闭
        this.currentExtension = null;
        this.showExtensionsDialog = false; // 关闭对话框
        this.expandSidePanel();
        this.fetchTasks();
        // 开启轮询
        if (this.taskRefreshTimer) clearInterval(this.taskRefreshTimer);
        this.taskRefreshTimer = setInterval(this.fetchTasks, 3000);
    },
    openWorkspace() {
        this.activeSideView = 'workspace'
        this.sidePanelURL = ''; // 确保 iframe 关闭
        this.currentExtension = null;
        this.showExtensionsDialog = false; // 关闭对话框
        this.expandSidePanel();
    },
    // 关闭任务中心（返回列表）
    closeTaskCenter() {
        this.activeSideView = 'list';
        if (this.taskRefreshTimer) clearInterval(this.taskRefreshTimer);
    },

    // 获取任务列表
    async fetchTasks() {
        if (!this.hasWorkspacePath || !this.sidePanelOpen || this.activeSideView !== 'tasks') return;
        
        try {
            const res = await fetch(`/v1/tasks/list`);
            const data = await res.json();
            if (data.tasks) {
                this.taskList = data.tasks;
            }
        } catch (e) {
            console.error("Failed to fetch tasks", e);
        }
    },

    // 创建任务
    async submitCreateTask() {
        if (!this.newTaskForm.title || !this.newTaskForm.description) {
            showNotification(this.t('fillRequired'), 'error');
            return;
        }

        this.isCreatingTask = true;
        try {
            console.log(this.newTaskForm); // 打印表单数据
            const res = await fetch(`/v1/tasks/create`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: this.newTaskForm.title,
                    description: this.newTaskForm.description,
                    agent_type: this.newTaskForm.agent_type,
                    task_type: this.newTaskForm.task_type,
                    platforms: this.newTaskForm.platforms,
                    trigger_config: this.newTaskForm.trigger_config // 发送完整配置
                })
            });
            const data = await res.json();
            
            if (data.success) {
                showNotification(this.t('success'));
                this.showCreateTaskDialog = false;
                // 重置表单
                this.newTaskForm = { 
                    title: '', description: '', task_type: 'once', agent_type: 'default',
                    trigger_config: { timeValue: '09:00:00', days: [1,2,3,4,5], cycleValue: '01:00:00', repeatNumber: 1, isInfiniteLoop: true }
                };
                this.fetchTasks();
            } else {
                showNotification(data.error, 'error');
            }
        } catch (e) {
            showNotification(this.t('networkError'), 'error');
        } finally {
            this.isCreatingTask = false;
        }
    },


    // 取消任务
    async handleCancelTask(taskId) {
        try {
            await fetch(`/v1/tasks/cancel/${taskId}`, { method: 'POST' });
            showNotification(this.t('cancelSuccess') || '取消任务成功');
            this.fetchTasks();
        } catch (e) { console.error(e); }
    },

    // 删除任务
    async handleDeleteTask(taskId) {
        try {
            this.handleCancelTask(taskId);
            const res = await fetch(`/v1/tasks/${taskId}`, { 
                method: 'DELETE' 
            });
            
            if (res.ok) {
                showNotification(this.t('deleteSuccess') || '删除任务成功');
                this.fetchTasks(); // 刷新列表
            } else {
                console.error("Delete failed with status:", res.status);
            }
        } catch (e) { 
            console.error("Network error during delete:", e); 
        }
    },

    // 跳转设置
    jumpToCLIConfig() {
        this.activeMenu = 'toolkit';
        this.subMenu = 'CLI';
    },

    formatTaskTime(isoStr) {
        if (!isoStr) return '-';
        const date = new Date(isoStr);
        return date.toLocaleString();
    },

    getTaskStatusType(status) {
        const map = {
            'pending': 'info',
            'running': 'primary',
            'completed': 'success',
            'failed': 'danger',
            'cancelled': 'warning'
        };
        return map[status] || 'info';
    },
  // 打开任务结果弹窗
// 在 Vue 组件的 methods 中
openTaskResult(task) {
    this.selectedTaskTitle = task.title;
    
    // 1. 获取该任务的所有历史产出记录
    // 如果没有历史记录（比如旧任务），我们造一个包含当前结果的伪记录
    const rawHistory = task.context?.results_history || [];
    
    if (rawHistory.length === 0 && task.result) {
        this.selectedTaskHistory = [{
            time: task.updated_at || task.created_at,
            result: task.result
        }];
    } else {
        // 将历史记录倒序排列（最新的在最上面）
        this.selectedTaskHistory = [...rawHistory].reverse();
    }
    
    // 2. 默认选中第一项（即最新的一项）
    this.currentResultIdx = 0;
    
    // 3. 打开弹窗
    this.showTaskResultDialog = true;
},
    
    getModeIcon(type) {
        const iconMap = {
            'once': 'fa-solid fa-bolt-lightning',
            'time': 'fa-regular fa-clock',
            'cycle': 'fa-solid fa-arrows-rotate'
        };
        // 如果 type 为空或不在 map 中，返回默认图标
        return iconMap[type] || 'fa-solid fa-terminal';
    },


    // 重置表单到初始状态
    resetTaskForm() {
        this.newTaskForm = {
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
        };
        this.isEditing = false;
        this.editingTaskId = null;
    },

    // 打开新建窗口
    openCreateTaskDialog() {
        this.resetTaskForm(); // 确保每次新建前都干净
        this.showCreateTaskDialog = true;
    },

    openEditTaskDialog(task) {
        // 1. 先重置，清除上一次可能残留的状态
        this.resetTaskForm();
        
        // 2. 标记为编辑模式
        this.isEditing = true;
        this.editingTaskId = task.task_id;
        
        // 3. 填充基础数据
        this.newTaskForm.title = task.title;
        this.newTaskForm.description = task.description;
        this.newTaskForm.platforms = task.platforms || [];
        this.newTaskForm.agent_type = task.agent_type || 'default';
        this.newTaskForm.task_type = task.context?.task_type || task.task_type || 'once';
        
        // 4. 填充触发器配置
        const savedConfig = task.context?.trigger_config;
        if (savedConfig) {
            // 使用 assign 或 spread 确保响应式更新
            Object.assign(this.newTaskForm.trigger_config, JSON.parse(JSON.stringify(savedConfig)));
        }
        
        this.showCreateTaskDialog = true;
    },

    // 2. 统一的提交处理函数
    async submitTaskForm() {
        if (!this.newTaskForm.title || !this.newTaskForm.description) {
            showNotification(this.t('fillRequired'), 'error');
            return;
        }

        this.isCreatingTask = true;

        try {
            // 如果是编辑模式，先停止并删除旧任务
            if (this.isEditing && this.editingTaskId) {
                // A. 停止原有任务
                await fetch(`/v1/tasks/cancel/${this.editingTaskId}`, { method: 'POST' });
                // B. 删除原有任务
                await fetch(`/v1/tasks/${this.editingTaskId}`, { method: 'DELETE' });
                console.log(`Old task ${this.editingTaskId} removed for re-creation`);
            }

            // C. 创建新任务 (无论是新建还是编辑后的“重建”，都走这个接口)
            const res = await fetch(`/v1/tasks/create`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(this.newTaskForm)
            });
            const data = await res.json();
            
            if (data.success) {
                showNotification(this.t('success'));
                this.showCreateTaskDialog = false; // 关闭窗口
                this.resetTaskForm();             // ⭐ 提交成功后重置表单
                this.fetchTasks();                // 刷新列表
            } else {
                showNotification(data.error, 'error');
            }
        } catch (e) {
            showNotification(this.t('networkError'), 'error');
        } finally {
            this.isCreatingTask = false;
            // 提交完成后重置编辑状态
            this.isEditing = false;
            this.editingTaskId = null;
        }
    },

    // 3. 这里的 reset 函数在对话框关闭时调用 (el-dialog 的 @closed 事件)
    resetTaskForm() {
        this.isEditing = false;
        this.editingTaskId = null;
        this.newTaskForm = {
            title: '', description: '', task_type: 'once', agent_type: 'default',
            trigger_config: { timeValue: '09:00:00', days: [1,2,3,4,5], cycleValue: '01:00:00', repeatNumber: 1, isInfiniteLoop: true }
        };
    },
// 打开详情页
openTaskDetailView(task) {
    this.viewingTaskDetail = task;
},

// 关闭详情页回到列表
closeTaskDetail() {
    this.viewingTaskDetail = null;
},

// 修改 fetchTasks 方法，增加同步详情逻辑
async fetchTasks() {
    if (!this.hasWorkspacePath || !this.sidePanelOpen || this.activeSideView !== 'tasks') return;
    
    try {
        const res = await fetch(`/v1/tasks/list`);
        const data = await res.json();
        if (data.tasks) {
            this.taskList = data.tasks;
            
            // ⭐ 核心逻辑：如果当前正在看某个任务的详情，实时更新它
            if (this.viewingTaskDetail) {
                const updatedTask = data.tasks.find(t => t.task_id === this.viewingTaskDetail.task_id);
                if (updatedTask) {
                    this.viewingTaskDetail = updatedTask;
                }
            }
        }
    } catch (e) {
        console.error("Failed to fetch tasks", e);
    }
},

// 重置任务中心状态（关闭时调用）
closeTaskCenter() {
    this.activeSideView = 'list';
    this.viewingTaskDetail = null; // 清除详情状态
    if (this.taskRefreshTimer) clearInterval(this.taskRefreshTimer);
},

  // 处理启动开关的点击事件
  handleEnableToggle(newValue) {
    // 只有在用户试图“开启”开关时 (newValue === true) 才进行校验
    if (newValue === true) {
      // 检查 cc_path 是否为空
      if (!this.CLISettings.cc_path || this.CLISettings.cc_path.trim() === '') {
        
        // 1. 调用你提供的报错函数 
        // 这里的提示语使用了你模板里现成的 t('pleaseSelectWorkspaceFirst')
        const errorMsg = this.t ? this.t('pleaseSelectWorkspaceFirst') : '请先配置 Workspace 工作区路径';
        showNotification(errorMsg, 'error', 'Error');

        // 2. 强制把开关重置回关闭状态 (阻止启动)
        // 使用 $nextTick 确保 Vue 能正确更新 DOM
        this.$nextTick(() => {
          this.CLISettings.enabled = false;
        });

        // 3. 跳转到 CLI 配置页面，让用户填入工作区路径
        this.jumpToCLIConfig();

        // 4. 拦截执行，直接 return，不触发后续的保存
        return; 
      }
    }

    // 如果校验通过（或者用户只是在关闭开关），则正常执行原来的保存逻辑
    this.autoSaveSettings();
  },

  handleVisionControlEnableToggle(newValue){
    if (newValue === true && this.visionSettings.enabled === true) {
      this.visionSettings.enabled = false;
      showNotification(this.t('autoDisableVisionSettings'), 'warning');
    }
    this.autoSaveSettings();
  },
  handleVisionEnableToggle(newValue){
    if (newValue === true && this.visionControlSettings.enabled === true) {
      this.visionControlSettings.enabled = false;
      showNotification(this.t('autoDisableVisionControlSettings'), 'warning');
    }
    this.autoSaveSettings();
  },

  handleWebSearchToggle(newValue) {
    if (newValue === true) {
      const settings = this.webSearchSettings;
      let errorMsg = '';

      // --- 1. 校验搜索引擎配置 ---
      switch (settings.engine) {
        case 'searxng':
          if (!settings.searxng_url?.trim()) errorMsg = this.t('pleaseConfigSearxngUrl');
          break;
        case 'tavily':
          if (!settings.tavily_api_key?.trim()) errorMsg = this.t('pleaseConfigTavilyApiKey');
          break;
        case 'google':
          if (!settings.google_api_key?.trim()) errorMsg = this.t('pleaseConfigGoogleApiKey');
          else if (!settings.google_cse_id?.trim()) errorMsg = this.t('pleaseConfigGoogleCseId');
          break;
        case 'brave':
          if (!settings.brave_api_key?.trim()) errorMsg = this.t('pleaseConfigBraveApiKey');
          break;
        case 'exa':
          if (!settings.exa_api_key?.trim()) errorMsg = this.t('pleaseConfigExaApiKey');
          break;
        case 'serper':
          if (!settings.serper_api_key?.trim()) errorMsg = this.t('pleaseConfigSerperApiKey');
          break;
        case 'bochaai':
          if (!settings.bochaai_api_key?.trim()) errorMsg = this.t('pleaseConfigBochaaiApiKey');
          break;
        // duckduckgo 无需强制配置，直接放行
      }

      // --- 2. 校验网页解析器配置 (前提是搜索引擎已经通过校验) ---
      if (!errorMsg) {
        switch (settings.crawler) {
          case 'crawl4ai':
            if (!settings.Crawl4Ai_url?.trim()) errorMsg = this.t('pleaseConfigCrawl4aiUrl');
            break;
          case 'firecrawl':
            if (!settings.firecrawl_url?.trim()) errorMsg = this.t('pleaseConfigFirecrawlUrl');
            // 如果你觉得 Firecrawl 的 API Key 也必须强制填写，可以解除下面这行的注释：
            // else if (!settings.firecrawl_api_key?.trim()) errorMsg = this.t('pleaseConfigFirecrawlApiKey');
            break;
          
          // 注意：jina API Key 是可选的，所以这里不写 case 'jina' 的报错逻辑，直接放行
          // simpleRequest 和 mdnew 也没有必填项，直接放行
        }
      }

      // --- 3. 拦截与报错 ---
      if (errorMsg) {
        // 报错提醒，标题也国际化
        const errorTitle = this.t ? this.t('configIncomplete') : 'Config Incomplete';
        showNotification(errorMsg, 'error', errorTitle);

        // 强制重置开关为关闭状态
        this.$nextTick(() => {
          this.webSearchSettings.enabled = false;
        });

        // 阻断执行，不触发保存
        return;
      }
    }

    // 校验全部通过，或者用户是主动关闭开关，则正常执行保存
    this.autoSaveSettings();
  },

  // 代码解释器启动开关的拦截处理
  handleInterpreterToggle(newValue) {
    if (newValue === true) {
      const settings = this.codeSettings;
      let errorMsg = '';

      // 根据选择的引擎校验必填项
      switch (settings.engine) {
        case 'e2b':
          if (!settings.e2b_api_key?.trim()) {
            errorMsg = this.t('pleaseConfigE2bApiKey');
          }
          break;
        case 'sandbox':
          if (!settings.sandbox_url?.trim()) {
            errorMsg = this.t('pleaseConfigSandboxUrl');
          }
          break;
      }

      // 如果有报错信息，进行拦截
      if (errorMsg) {
        // 报错提醒 (复用刚才加的 configIncomplete)
        const errorTitle = this.t ? this.t('configIncomplete') : 'Config Incomplete';
        showNotification(errorMsg, 'error', errorTitle);

        // 强制重置开关为关闭状态
        this.$nextTick(() => {
          this.codeSettings.enabled = false;
        });

        // 阻断执行，不触发保存
        return;
      }
    }

    // 校验通过或关闭开关，正常执行保存
    this.autoSaveSettings();
  },
// 1. 懒加载读取文件目录
  async loadWorkspaceNode(node, resolve) {
    // 顶层节点：加载工作区根目录
    if (node.level === 0) {
      if (!this.CLISettings || !this.CLISettings.cc_path) {
        return resolve([]); 
      }
      
      // ⚠️ 暴力触发：只要根节点加载，就立刻启动监听器！
      console.log('准备启动文件监听:', this.CLISettings.cc_path);
      this.setupWorkspaceWatcher(this.CLISettings.cc_path);

      try {
        const res = await window.electronAPI.readDirectory(this.CLISettings.cc_path);
        if (res.success) {
          return resolve(res.data);
        } else {
          this.$message?.error(this.t('readDirError') || '读取工作区目录失败: ' + res.error);
          return resolve([]);
        }
      } catch (error) {
        console.error(error);
        return resolve([]);
      }
    }

    // 子节点：加载被点击的子目录
    if (node.level > 0 && node.data.isDirectory) {
      try {
        const res = await window.electronAPI.readDirectory(node.data.path);
        if (res.success) {
          return resolve(res.data);
        } else {
          this.$message?.error(this.t('readDirError') || '读取子目录失败: ' + res.error);
          return resolve([]);
        }
      } catch (error) {
        console.error(error);
        return resolve([]);
      }
    }
    
    resolve([]);
  },

  // 2. 使用系统默认程序打开文件
  openWorkspaceFile(filePath) {
    if (window.electronAPI && window.electronAPI.openPath) {
      window.electronAPI.openPath(filePath);
    }
  },

  // 3. 删除文件/文件夹
  async deleteWorkspaceFile(data, node) {
    try {
      // 弹出确认框 (兼容 Element Plus 的 this.$confirm)
      await this.$confirm(
        (this.t('confirmDelete') || '确认将该文件放入回收站吗？') + `\n${data.name}`,
        this.t('warning') || '警告',
        { 
          confirmButtonText: this.t('confirm') || '确定', 
          cancelButtonText: this.t('cancel') || '取消', 
          type: 'warning' 
        }
      );
      
      const res = await window.electronAPI.deleteWorkspaceFile(data.path);
      if (res.success) {
        showNotification(this.t('deleteSuccess'),'success');
        // 从前端界面中动态移除该节点，避免重新读取整个目录树
        const parent = node.parent;
        const children = parent.data.children || parent.childNodes;
        const index = children.findIndex(d => d.data.path === data.path);
        if (index !== -1) {
          children.splice(index, 1);
        }
        
      } else {
        showNotification(this.t('deleteFailed'),'error');
      }
    } catch (error) {
      // 用户点击了取消，不做任何处理
    }
  },

  // 5. 刷新整个工作区树
  refreshWorkspaceTree() {
    // 改变 key 值会让 Vue 销毁并重建 el-tree，从而重新触发 load()
    this.workspaceTreeKey += 1;
  },

    // 核心上传逻辑
    async executeUpload(targetPath) {
        try {
            // 1. 调用选择文件对话框
            const result = await window.electronAPI.openFileDialog();
            
            if (result.canceled || result.filePaths.length === 0) return;

            // 2. 执行上传
            const uploadRes = await window.electronAPI.uploadToWorkspace(targetPath, result.filePaths);
            
            if (uploadRes.success) {
                showNotification(this.t('uploadSuccess'),'success');
                this.refreshWorkspaceTree(); // 刷新显示新文件
            } else {
                showNotification(this.t('uploadFailed'),'error');
            }
        } catch (err) {
            console.error('Upload Error:', err);
            this.$message.error('操作失败，请检查控制台日志');
        }
    },

    // 顶部按钮：上传到根目录
    handleRootUpload() {
        const rootPath = this.CLISettings.cc_path;
        if (!rootPath) {
            showNotification(this.t('pleaseConfigWorkspace'),'error');
            return;
        }
        this.executeUpload(rootPath);
    },

    // 文件夹按钮：上传到子目录
    handleFolderUpload(folderPath) {
        console.log("正在上传到子目录:", folderPath);
        this.executeUpload(folderPath);
    },

  // 添加好感度维度
  addLoveDimension() {
    if (!this.loveSettings.dimensions) {
      this.loveSettings.dimensions = [];
    }
    this.loveSettings.dimensions.push(""); // 压入一个空字符串
    this.autoSaveSettings();
  },

  // 删除好感度维度
  removeLoveDimension(idx) {
    if (this.loveSettings.dimensions && this.loveSettings.dimensions.length > 1) {
      this.loveSettings.dimensions.splice(idx, 1);
      this.autoSaveSettings();
    }
  },

  // ---------------- 羁绊系统：系统配置相关 ----------------
  addLoveDimension() {
    if (!this.loveSettings.dimensions) this.loveSettings.dimensions = [];
    this.loveSettings.dimensions.push("");
    this.autoSaveSettings();
  },
  removeLoveDimension(idx) {
    if (this.loveSettings.dimensions && this.loveSettings.dimensions.length > 1) {
      this.loveSettings.dimensions.splice(idx, 1);
      this.autoSaveSettings();
    }
  },

  // ---------------- 羁绊系统：数据管理相关 ----------------
  
  handleAffectionTabChange(tabName) {
    if (tabName === 'data') {
      this.fetchAffectionData();
    }
  },

  async fetchAffectionData() {
    try {
      // 请求我们刚才写的 FastAPI 路由
      const response = await fetch('/api/affection/get_data');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      
      this.affectionRawData = data || {};
      
      // 将 Object 转换为 Array，供 el-table 渲染
      this.affectionDataList = Object.keys(this.affectionRawData).map(userName => {
        return {
          userName: userName,
          ...this.affectionRawData[userName]
        };
      });
      
      console.log("✅ 羁绊数据加载成功:", this.affectionDataList); // 调试日志，按 F12 可以在控制台看到
    } catch (error) {
      console.error("❌ 获取羁绊数据失败:", error);
      if (this.$message) this.$message.error("无法加载羁绊数据，请检查后端是否正常运行");
    }
  },

  // 3. 将前端的修改同步保存到后端
  async syncAffectionDataToBackend() {
    try {
      // 将 Array 转回 Object 结构 {"小包": {love: 10}}
      const newData = {};
      this.affectionDataList.forEach(item => {
        const { userName, ...dimensionsData } = item;
        newData[userName] = dimensionsData;
      });

      this.affectionRawData = newData; // 更新本地缓存

      // 使用 fetch 发送 POST 请求
      const response = await fetch('/api/affection/save_data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(newData)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      if (this.$message) this.$message.success("羁绊数据已同步");
    } catch (error) {
      console.error("❌ 保存羁绊数据失败:", error);
      if (this.$message) this.$message.error("羁绊数据保存失败");
    }
  },

  // 3. 打开新增/编辑对话框
  openAffectionDataDialog(row = null) {
    this.isEditingAffection = !!row; // 如果传了 row 说明是编辑
    
    if (row) {
      // 编辑：深拷贝当前行数据
      this.currentAffectionForm = JSON.parse(JSON.stringify(row));
    } else {
      // 新增：初始化表单，把所有维度默认设为 0
      const newForm = { userName: '' };
      if (this.loveSettings.dimensions) {
        this.loveSettings.dimensions.forEach(dim => {
          newForm[dim] = 0;
        });
      }
      this.currentAffectionForm = newForm;
    }
    
    this.showAffectionDataDialog = true;
  },

  // 4. 保存对话框表单
  saveAffectionData() {
    const form = this.currentAffectionForm;
    if (!form.userName) return;

    if (this.isEditingAffection) {
      // 寻找并替换
      const index = this.affectionDataList.findIndex(item => item.userName === form.userName);
      if (index !== -1) {
        this.affectionDataList.splice(index, 1, { ...form });
      }
    } else {
      // 查重：防止用户名重复
      const exists = this.affectionDataList.find(item => item.userName === form.userName);
      if (exists) {
        this.$message.warning("该用户名已存在！");
        return;
      }
      // 追加新用户
      this.affectionDataList.push({ ...form });
    }

    this.showAffectionDataDialog = false;
    this.syncAffectionDataToBackend(); // 触发网络请求同步到后端
  },

  // 5. 删除用户数据
  deleteAffectionData(userName) {
    this.$confirm(this.t('confirmDelete') || '确认删除该用户数据吗？', this.t('warning') || '警告', {
      confirmButtonText: this.t('confirm') || '确定',
      cancelButtonText: this.t('cancel') || '取消', 
      type: 'warning'
    }).then(() => {
      const index = this.affectionDataList.findIndex(item => item.userName === userName);
      if (index !== -1) {
        this.affectionDataList.splice(index, 1);
        this.syncAffectionDataToBackend(); // 触发网络请求同步到后端
      }
    }).catch(() => {});
  },

    // ---------------- 日记系统 ----------------
    handleDiaryTabChange(tabName) {
      if (tabName === 'data') {
        this.refreshDiaryView();
      }
    },

    // 刷新整个日记本视图（先拉本子列表，再拉当前本子内容）
    async refreshDiaryView() {
      await this.fetchDiaryBooks();
      await this.fetchDiaryData();
    },

    async fetchDiaryBooks() {
      try {
        const response = await fetch('/api/diary/books');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        this.diaryBooks = (data && Array.isArray(data.books)) ? data.books : [];
        // 当前选中的本子若已不存在，回落到 default
        if (!this.diaryBooks.some(b => b.bookId === this.diaryCurrentBook)) {
          this.diaryCurrentBook = 'default';
        }
      } catch (error) {
        console.error("获取日记本列表失败:", error);
      }
    },

    async fetchDiaryData() {
      try {
        const bookId = this.diaryCurrentBook || 'default';
        const response = await fetch(`/api/diary/get_data?book_id=${encodeURIComponent(bookId)}`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        this.diaryEntries = (data && Array.isArray(data.entries)) ? data.entries : [];
      } catch (error) {
        console.error("获取日记数据失败:", error);
        if (this.$message) this.$message.error("无法加载日记数据，请检查后端是否正常运行");
      }
    },

    // 切换查看的日记本
    switchDiaryBook(bookId) {
      if (!bookId || bookId === this.diaryCurrentBook) return;
      this.diaryCurrentBook = bookId;
      this.diaryEntries = [];
      this.fetchDiaryData();
    },

    // 日记本的显示名称：优先用角色卡当前名，其次本子里存的名字，default 用兜底文案
    diaryBookLabel(book) {
      if (!book) return '';
      if (book.isDefault || book.bookId === 'default') {
        return this.t('diaryDefaultBook') || '默认日记本';
      }
      const mem = (this.memories || []).find(m => String(m.id) === String(book.characterId || book.bookId));
      if (mem && mem.name) return mem.name;
      if (book.characterName) return book.characterName;
      return this.t('diaryUnknownRole') || '未知角色';
    },

    // 日记本头像：从角色卡解析，没有则用默认头像
    diaryBookAvatar(book) {
      if (!book || book.isDefault || book.bookId === 'default') return '';
      const mem = (this.memories || []).find(m => String(m.id) === String(book.characterId || book.bookId));
      if (mem && mem.avatar) return mem.avatar;
      return '';
    },

    openDiaryDetail(entry) {
      this.diaryDetailEntry = entry;
      this.diaryDetailVisible = true;
    },

    closeDiaryDetail() {
      this.diaryDetailVisible = false;
      this.diaryDetailEntry = null;
    },

    deleteDiaryEntryById(id) {
      this.$confirm(this.t('confirmDelete') || '确认删除这篇日记吗？', this.t('warning') || '警告', {
        confirmButtonText: this.t('confirm') || '确定',
        cancelButtonText: this.t('cancel') || '取消',
        type: 'warning'
      }).then(async () => {
        try {
          const response = await fetch('/api/diary/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, book_id: this.diaryCurrentBook || 'default' })
          });
          if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
          this.diaryEntries = this.diaryEntries.filter(e => e.id !== id);
          if (this.diaryDetailEntry && this.diaryDetailEntry.id === id) this.closeDiaryDetail();
          this.fetchDiaryBooks();
          if (this.$message) this.$message.success(this.t('deleted') || '已删除');
        } catch (error) {
          console.error("删除日记失败:", error);
          if (this.$message) this.$message.error("删除日记失败");
        }
      }).catch(() => {});
    },

    // 用户手动切换日记动作开关时，自动开启对应的底层工具
    async onDiaryActionToggle(key) {
      const enabled = this.diarySettings.actions[key].enabled;
      // 先保存日记配置
      await this.autoSaveSettings();

      if (!enabled) return;

      try {
        switch (key) {
          case 'webSearch':
            this.webSearchSettings.enabled = true;
            await this.autoSaveSettings();
            showNotification(this.t('diaryAutoTool_webSearch') || '联网搜索工具已被自动开启', 'success');
            break;

          case 'knowledge':
            if (!this.knowledgeBases || this.knowledgeBases.length === 0) {
              showNotification(this.t('diaryAutoTool_noKb') || '没有已配置的知识库，请先在知识库设置中添加', 'warning');
              break;
            }
            if (!this.knowledgeBases.some(kb => kb.enabled)) {
              this.knowledgeBases[0].enabled = true;
            }
            await this.autoSaveSettings();
            showNotification(this.t('diaryAutoTool_knowledge') || '知识库工具已被自动开启', 'success');
            break;

          case 'browserControl':
            this.chromeMCPSettings.enabled = true;
            this.chromeMCPSettings.type = 'internal';
            if (this.isElectron && window.electronAPI) {
              const cdpInfo = await window.electronAPI.getInternalCDPInfo();
              if (cdpInfo.active) {
                this.chromeMCPSettings.CDPport = cdpInfo.port;
              }
            }
            await this.autoSaveSettings();
            showNotification(this.t('diaryAutoTool_browser') || '浏览器控制工具（内建 CDP）已被自动开启', 'success');
            break;

          case 'smartHome':
            if (!this.HASettings.api_key) {
              showNotification(this.t('diaryAutoTool_noHaKey') || '未配置 Home Assistant API Key，请先在智能家居设置中填写', 'warning');
              this.diarySettings.actions[key].enabled = false;
              await this.autoSaveSettings();
              break;
            }
            this.HASettings.enabled = true;
            await this.autoSaveSettings();
            const haResp = await fetch('/start_HA', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ data: this.HASettings })
            });
            if (haResp.ok) {
              showNotification(this.t('diaryAutoTool_smartHome') || '智能家居工具已被自动开启', 'success');
            } else {
              this.HASettings.enabled = false;
              this.diarySettings.actions[key].enabled = false;
              await this.autoSaveSettings();
              const errText = await haResp.text().catch(() => '');
              showNotification(this.t('diaryAutoTool_smartHomeFail') || ('智能家居工具开启失败：' + (errText || '请检查 HA 配置')), 'error');
            }
            break;
        }
      } catch (e) {
        console.error('[Diary] 自动开启工具失败:', e);
        showNotification(this.t('diaryAutoTool_error') || ('开启对应工具失败: ' + (e.message || '未知错误')), 'error');
      }
    },

    // 动作类型的图标/标签颜色（供模板使用）
    diaryMeta(type) {
      return (this.diaryActionMeta && this.diaryActionMeta[type]) || { icon: 'fa-solid fa-book', type: 'info' };
    },

    // 将后端推送的日记原样展示到当前对话
    pushDiaryToChat(content, actionType) {
      // 若正在查看日记本，顺手刷新一下列表
      if (this.subMenu === 'diary' && this.activeDiaryTab === 'data') {
        this.refreshDiaryView();
      }
      if (!Array.isArray(this.messages)) return;
      const diaryContent = content || '';
      const entry = {
        id: Date.now() + Math.random(),
        role: 'assistant',
        agentName: (this.t('DiarySystem') || '日记'),
        content: diaryContent,
        pure_content: diaryContent,
        // 使用标准新架构 displayBlocks，与普通助手消息一致
        displayBlocks: [{ type: 'text', content: diaryContent, segments: [{ type: 'text', content: diaryContent }] }],
        segments: [{ type: 'text', content: diaryContent }],
        isDiary: true,
        diaryType: actionType || 'think',
        generationFinished: true,
        timestamp: Date.now()
      };
      this.messages.push(entry);
      // 同步回当前对话，确保持久化与主对话界面正确显示
      const conv = this.conversations.find(c => c.id === this.conversationId);
      if (conv) {
        conv.messages = this.messages;
      }
      if (typeof this.saveConversations === 'function') {
        this.saveConversations();
      }
      this.$nextTick(() => { if (typeof this.scrollToBottom === 'function') this.scrollToBottom(); });
    },

    // 处理单击文件自动添加 @ 快捷方式
    handleFileShortcut(fullPath) {
        if (!fullPath) return;

        // 1. 获取工作区根路径
        const rootPath = this.CLISettings.cc_path;
        let relativePath = fullPath;

        // 2. 将绝对路径转换为相对于工作区的路径
        if (rootPath && fullPath.startsWith(rootPath)) {
            // 截掉根目录部分，并去掉路径开头多余的斜杠
            relativePath = fullPath.substring(rootPath.length).replace(/^[/\\]+/, '');
        }

        // 3. 统一将路径分隔符替换为正斜杠 / (方便 AI 识别并保持跨平台一致性)
        relativePath = relativePath.replace(/\\/g, '/');

        // 4. 构造快捷指令字符串
        const shortcut = `@${relativePath} `;

        // 5. 将指令追加到输入框
        if (!this.userInput) {
            // 如果输入框是空的，直接赋值
            this.userInput = shortcut;
        } else if (this.userInput.endsWith(' ')) {
            // 如果末尾已经有空格，直接加内容
            this.userInput += shortcut;
        } else {
            // 如果末尾没有空格，先加个空格再加内容
            this.userInput += ' ' + shortcut;
        }

        // 6. (可选) 自动聚焦聊天输入框，让用户可以直接接着打字
        // 如果你的输入框组件设置了 ref="chatInput"
        this.$nextTick(() => {
            if (this.$refs.chatInput) {
                // 如果是 el-input 需要访问内部的 input 元素
                const inputEl = this.$refs.chatInput.$el.querySelector('input') || this.$refs.chatInput.$el.querySelector('textarea');
                if (inputEl) inputEl.focus();
                else this.$refs.chatInput.focus();
            }
        });
    },

    handleOmniTTSenabled(newValue){
      if (newValue === true && this.ttsSettings.enabled === true) {
        this.ttsSettings.enabled = false;
        showNotification(this.t('autoDisableTtsSettings'), 'warning');
      }
      this.autoSaveSettings();
    },

    async handleFullScreenChange(val) {
      if (!val) {
        // 如果开关变成 false（关闭全屏），主动调起选区界面
        await this.reselectRegion();
      } else {
        // 如果开关变成 true（开启全屏），直接保存设置
        this.autoSaveSettings();
      }
    },

    /**
     * 呼出边框让用户重新选择屏幕区域
     */
    async reselectRegion() {
      try {
        // 调用 preload 暴露的方法，传入 true 让主窗口暂时隐藏
        const rect = await window.electronAPI.showScreenshotOverlay(true);
        
        // 选区结束后，恢复显示主窗口
        window.electronAPI.windowAction('show');
        
        if (rect) {
          // 用户成功框选，记录选区：[x, y, 宽度, 高度]
          this.visionControlSettings.ScreenSize = [
            Math.floor(rect.x), 
            Math.floor(rect.y), 
            Math.floor(rect.width), 
            Math.floor(rect.height)
          ];
          this.visionControlSettings.isFullScreen = false;
        } else {
          // 如果 rect 为空（比如用户按 Esc 取消了截图），自动恢复为全屏模式
          this.visionControlSettings.isFullScreen = true;
        }
        
        // 触发自动保存
        this.autoSaveSettings();
        
      } catch (error) {
        console.error("选区失败:", error);
        // 如果发生错误，确保主窗口重新出现并恢复状态
        window.electronAPI.windowAction('show');
        this.visionControlSettings.isFullScreen = true;
        this.autoSaveSettings();
      }
    },

    // 开启工作区监控
    setupWorkspaceWatcher(path) {
      if (window.electronAPI && window.electronAPI.startWorkspaceWatch) {
        window.electronAPI.startWorkspaceWatch(path);
        
        window.electronAPI.onWorkspaceChanged((data) => {
          console.log('前端收到文件系统变化:', data.action, data.path);
          
          // ⚠️ 关键修复：使用原生定时器彻底解决 this 指向丢失的问题
          if (this.workspaceRefreshTimer) {
            clearTimeout(this.workspaceRefreshTimer);
          }
          
          this.workspaceRefreshTimer = setTimeout(() => {
            console.log('触发防抖更新 UI ...');
            this.refreshWorkspaceTreeKeepExpanded();
          }, 500);
        });
      }
    },

    // 刷新前保留展开状态
    refreshWorkspaceTreeKeepExpanded() {
      const treeRef = this.$refs.workspaceTreeRef;
      if (treeRef) {
        const store = treeRef.store;
        const expandedKeys = [];
        for (const key in store.nodesMap) {
          if (store.nodesMap[key].expanded) {
            expandedKeys.push(key);
          }
        }
        this.expandedNodeKeys = expandedKeys;
        console.log('当前记录的展开文件夹节点:', this.expandedNodeKeys);
      } else {
        console.warn('未找到 el-tree 的引用 (workspaceTreeRef)');
      }
      
      this.refreshWorkspaceTree();
    },

// 1. 修改后的流式随机话题生成逻辑
async generateRandomTopic() {
  if (this.isTopicGenerating) return;
  this.isTopicGenerating = true;
  
  // 开始前清空输入框，方便看到打字机效果
  this.userInput = ''; 

  try {
    const res = await fetch('/simple_chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.mainAgent,
        messages: [
          {
            role: 'system',
            content: '你是一个有趣的话题发起人。请根据当前热门技术、科幻、哲学或日常生活，生成一个简短、有趣、能引起讨论的对话开头或问题。只需要返回话题文字本身，不要有任何多余的修饰。'
          },
          {
            role: 'user',
            content: `给我一个有趣的话题，请使用${this.currentLanguage}语言。`
          }
        ],
        temperature: 1,
        stream: true // 开启流式
      })
    });

    if (!res.ok) {
      let errMsg = `HTTP error! status: ${res.status}`;
      try { const errData = await res.json(); errMsg = errData?.error?.message || errMsg; } catch (_) {}
      throw new Error(errMsg);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // 解码并合并到缓冲区
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      // 留下最后一行可能不完整的在 buffer 中
      buffer = lines.pop(); 

      for (const line of lines) {
        let trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]') continue;

        // 兼容 SSE 格式 (去掉 data: 前缀)
        if (trimmed.startsWith('data:')) {
          trimmed = trimmed.replace(/^data:\s?/, '');
        }

        try {
          const data = JSON.parse(trimmed);
          const content = data.choices?.[0]?.delta?.content;
          if (content) {
            // 实时追加到 userInput，实现打字机效果
            this.userInput += content;
          }
        } catch (e) {
          // 忽略解析失败的行
        }
      }
    }

  } catch (e) {
    console.error("生成话题失败", e);
    // 降级处理：直接显示一个随机话题
    const fallbackTopics = ["Will future AI have emotions?", "Recommend a book you've read recently", "If you could teleport instantly, where would you want to go?"];
    this.userInput = fallbackTopics[Math.floor(Math.random() * fallbackTopics.length)];
  } finally {
    this.isTopicGenerating = false;
  }
},

// 2. 仪表盘发送逻辑
handleDashboardSend() {
  if (!this.userInput.trim()) return;
  // 跳转到聊天页
  this.activeMenu = 'home';
  this.clearMessages();
  // 调用原本的发送方法
  this.$nextTick(() => {
    this.sendMessage();
  });
},

// 3. 万能智能体确认
confirmOmniAgent() {
  if (!this.CLISettings.cc_path) {
    showNotification(this.t('pleaseSelectWorkspaceFirst'), 'error');
    return;
  }
  // 开启 CLI
  this.CLISettings.enabled = true;
  this.handleEnableToggle(true);
  // 关闭弹窗并跳转
  this.showOmniAgentDialog = false;
  this.activeMenu = 'home';
  showNotification(this.t('omniAgentEnabled'));
},

// 4. 扩展收藏逻辑
toggleFavoriteExtension(ext) {
  const index = this.favoriteExtensionIds.indexOf(ext.id);
  if (index > -1) {
    this.favoriteExtensionIds.splice(index, 1);
  } else {
    this.favoriteExtensionIds.push(ext.id);
  }
  // 持久化存储
  localStorage.setItem('favorite_extensions', JSON.stringify(this.favoriteExtensionIds));
},

createNewTask(){
  this.activeMenu = 'home';
  this.expandSidePanel();
  this.activeSideView = 'tasks';

},
openAiBrowser(){
  this.activeMenu = 'ai-browser';
  this.chromeMCPSettings.type = 'internal';
  this.chromeMCPSettings.enabled = true;
  this.changeChromeMCPEnabled();
},

connectToChatApp(){
  this.activeMenu = 'deploy-bot';
  this.subMenu = 'im_bot';
},

startLiveStream(){
  this.activeMenu = 'deploy-bot';
  this.subMenu = 'live_stream';
},

gotoAddExtension(){
  this.activeMenu = 'api-group';
  this.subMenu = 'extension';
  this.openAddExtensionDialog();
},

  // 2. 添加这两个处理鼠标状态的方法
  handleExtMouseMove() {
    this.extButtonVisible = true;
    
    // 清除上一次的定时器
    if (this.extMouseTimer) {
      clearTimeout(this.extMouseTimer);
    }
    
    // 如果鼠标停止移动 1.5 秒，自动隐藏按钮
    this.extMouseTimer = setTimeout(() => {
      this.extButtonVisible = false;
    }, 1500);
  },
  
  hideExtButton() {
    this.extButtonVisible = false;
    if (this.extMouseTimer) {
      clearTimeout(this.extMouseTimer);
    }
  },

  async toggleVTSConnection() {
    // 如果正在连接中，禁止重复点击
    if (this.isVTSStarting) return;
    
    this.isVTSStarting = true; // 开启 Loading 动画 (按钮转圈)
    
    try {
      if (this.VTSConfig.enabled) {
        // 动作：停止连接
        // 注意：这里不直接设 enabled = false，而是等待后端确认后再改
        this.sendTTSStatusToVRM('stopVTS_Driver', {});
      } else {
        // 动作：发起连接
        this.sendTTSStatusToVRM('startVTS_Driver', this.VTSConfig);
        
        // 设置一个 10 秒的超时逻辑
        // 如果 10 秒内后端没有通过 WS 返回任何 status 消息，则自动回退状态
        setTimeout(() => {
          if (this.isVTSStarting) {
            this.isVTSStarting = false;
            showNotification('VTS 连接超时，请检查后端程序是否运行', 'warning', '连接超时');
          }
        }, 10000);
      }
    } catch (e) {
      console.error("VTS 操作失败:", e);
      this.isVTSStarting = false;
      showNotification('指令发送失败，请检查网络', 'error');
    }
  },
  
  async startVTS() {
    // 模拟或实际发送 WS 指令
    this.sendTTSStatusToVRM('startVTS_Driver', this.VTSConfig);
    this.VTSConfig.enabled = true;
    this.autoSaveSettings();
  },
  
  async stopVTS() {
    this.sendTTSStatusToVRM('stopVTS_Driver', {});
    this.VTSConfig.enabled = false;
    this.autoSaveSettings();
  },


  connectToVTS() {
      this.activeMenu = 'deploy-bot';
      this.subMenu = 'vts_config';
      if(!this.VTSConfig.enabled){
        this.toggleVTSConnection();
      }
  },

  async checkAcpxStatus() {
    this.checkingAcpx = true
    try {
      const host = window.location.hostname || '127.0.0.1'
      const port = window.location.port || '3456'
      const res = await fetch(`http://${host}:${port}/api/acpx/status`)
      const data = await res.json()
      
      if (data.available) {
        this.acpxStatus = 'available'
        showNotification(`ACPM Ready - Environment: ${data.environment}`)
      } else {
        this.acpxStatus = 'unavailable'
        showNotification(`ACPM Not Found: ${data.error}`,'error')
      }
    } catch (err) {
      this.acpxStatus = 'unavailable'
      showNotification('Failed to check ACPX status','error')
    } finally {
      this.checkingAcpx = false
    }
  },

  // 1. 初始化获取当前路径
  async fetchDataPath() {
    try {
      const response = await fetch('/api/system/data-path');
      if (response.ok) {
        const data = await response.json();
        this.customDataPath = data.path;
        this.isDocker = data.is_docker;
      }
    } catch (error) {
      console.error("fetchDataPath Error:", error);
    }
  },

  // 2. 浏览目录 (调用 Electron 对话框)
  async browseDataDirectory() {
    if (!this.isElectron) {
      showNotification('仅支持桌面端操作', 'warning');
      return;
    }
    try {
      // 注意：根据您 main.js 里的定义，这里调用对应的 preload 映射方法
      // 如果您的 preload 映射的是 dialog:openDirectory，则使用如下：
      const result = await window.electronAPI.openDirectoryDialog(); 
      if (!result.canceled && result.filePaths.length > 0) {
        this.customDataPath = result.filePaths[0];
      }
    } catch (error) {
      console.error('选择目录出错:', error);
      showNotification('选择目录失败', 'error');
    }
  },

  // 3. 应用并保存路径
  async saveDataPath() {
    if (!this.customDataPath || !this.customDataPath.trim()) {
      showNotification(this.t('pathCannotBeEmpty'), 'warning');
      return;
    }
    try {
      await this.$confirm(this.t('confirmChangePathText'), this.t('warning'), {
        confirmButtonText: this.t('confirm'),
        cancelButtonText: this.t('cancel'),
        type: 'warning'
      });

      const response = await fetch('/api/system/set-path', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: this.customDataPath.trim() })
      });

      const data = await response.json();
      if (response.ok && data.success) {
        showNotification(this.t('pathUpdateSuccess'), 'success');
        this.showRestartDialog = true; // 触发重启询问弹窗
      } else {
        showNotification(data.detail || '修改失败', 'error');
      }
    } catch (error) {
      if (error !== 'cancel') showNotification(error.message, 'error');
    }
  },

  // 4. 重置路径
  async resetDataPath() {
    try {
      await this.$confirm(this.t('confirmResetPathText'), this.t('warning'), {
        confirmButtonText: this.t('confirm'),
        cancelButtonText: this.t('cancel'),
        type: 'warning'
      });

      const response = await fetch('/api/system/reset-path', { method: 'POST' });
      const data = await response.json();

      if (response.ok && data.success) {
        showNotification(this.t('pathResetSuccess'), 'success');
        this.customDataPath = data.path;
        this.showRestartDialog = true;
      }
    } catch (error) {
      if (error !== 'cancel') showNotification('重置失败', 'error');
    }
  },

  // 5. 在资源管理器中直接进入当前文件夹内部
  async openDataFolder() {
    if (this.customDataPath) {
      if (this.isElectron) {
        // 使用 electronAPI 下的 openPath 
        // 它的底层调用的是 shell.openPath，会直接打开并进入该目录
        window.electronAPI.openPath(this.customDataPath);
      } else {
        showNotification('仅支持桌面端操作', 'warning');
      }
    } else {
      showNotification('路径尚未加载', 'warning');
    }
  },

    // 打开保存背景图的弹窗
    openSaveBgDialog() {
      if (!this.systemSettings.backgroundURL) {
        // 使用 showNotification 和 this.t()
        showNotification(this.t('noBgToSave'), 'warning');
        return;
      }
      this.newBgName = '';
      this.saveBgDialogVisible = true;
    },

    // 确认保存背景图到历史列表
    confirmSaveBg() {
      if (!this.newBgName.trim()) {
        // 使用 showNotification 和 this.t()
        showNotification(this.t('pleaseInputBgName'), 'warning');
        return;
      }

      // 确保列表已初始化(防范旧数据不存在该字段的情况)
      if (!this.systemSettings.bgHistoryList) {
        this.systemSettings.bgHistoryList = [];
      }

      // 检查当前URL是否已经在历史记录中
      const existingIndex = this.systemSettings.bgHistoryList.findIndex(
        bg => bg.url === this.systemSettings.backgroundURL
      );

      if (existingIndex !== -1) {
        // 如果存在，直接覆盖名字
        this.systemSettings.bgHistoryList[existingIndex].name = this.newBgName.trim();
      } else {
        // 如果不存在，新增一条记录
        this.systemSettings.bgHistoryList.push({
          name: this.newBgName.trim(),
          url: this.systemSettings.backgroundURL
        });
      }

      // 自动保存设置 
      this.autoSaveSettings();

      this.saveBgDialogVisible = false;
      
      // 使用 showNotification 提示成功
      showNotification(this.t('bgSavedSuccess'), 'success');
    },

    // 切换历史背景图
    handleBgHistorySelect(url) {
      this.systemSettings.backgroundURL = url;
      if (!url) {
        // 选择"无背景图片"时，触发原有的清除逻辑
        if (typeof this.clearBgImage === 'function') {
          this.clearBgImage();
        } else {
          this.autoSaveSettings();
        }
      } else {
        this.autoSaveSettings();
      }
    },

    // 删除某条历史背景图记录
    deleteBgHistory(url) {
      if (!this.systemSettings.bgHistoryList) return;
      
      this.systemSettings.bgHistoryList = this.systemSettings.bgHistoryList.filter(
        item => item.url !== url
      );
      
      // 删除记录后，调用自动保存
      this.autoSaveSettings();
      
      // 使用 showNotification 提示删除成功
      showNotification(this.t('bgRemovedSuccess'), 'success');
    },

    onShowDisclaimerChange(val) {
      if (val) {
        this.systemSettings.disclaimerAccepted = false;
      }
      this.autoSaveSettings();
    },

    acceptDisclaimer() {
      this.showDisclaimerDialog = false;
      if (isSteamBuild) { return; }
      if (this.disclaimerAccepted) {
        this.systemSettings.disclaimerAccepted = true;
        this.systemSettings.showDisclaimer = false;
        this.autoSaveSettings();
      }
    },
  
}
