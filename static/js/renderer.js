// 在页面加载完成后添加 content-loaded 类
document.addEventListener('DOMContentLoaded', function() {
  // 设置一个短暂的延迟，确保所有资源都已加载
  setTimeout(function() {
    document.body.classList.add('content-loaded');
  }, 100);
});

// ==========================================
// 1. 定义 A2UI 渲染组件 (支持 Markdown 渲染)
// ==========================================
const A2UIRendererComponent = {
  name: 'A2UIRenderer',
  components: {}, 
  template: `
    <div :class="['a2ui-root', isSelfContained ? 'a2ui-root-clean' : 'a2ui-root-boxed']">
      
      <!-- 根标题 -->
      <div v-if="uiConfig.props && uiConfig.props.title && !isSelfContained" class="a2ui-title">
        {{ uiConfig.props.title }}
      </div>
      <!-- 根描述 (也支持 MD) -->
      <div 
        v-if="uiConfig.props && uiConfig.props.description && !isSelfContained" 
        class="a2ui-text-content markdown-body" 
        style="color: var(--el-text-color-secondary); font-size: 13px; margin-bottom: 15px;"
        v-html="renderMarkdown(uiConfig.props.description)"
      ></div>

      <el-form :model="formData" label-position="top" size="default" @submit.prevent>
        
        <div :class="containerClass">
          
          <template v-for="(item, index) in normalizedChildren" :key="index">
            
            <!-- 1. Input -->
            <el-form-item 
              v-if="item.type === 'Input'" 
              :label="item.props.label" 
              style="margin-bottom: 15px; flex: 1; min-width: 200px;"
            >
              <el-input 
                v-model="formData[item.props.key || ('input_'+index)]" 
                :placeholder="item.props.placeholder || '请输入...'"
                size="large"
              >
                <template #append v-if="item.props.action === 'search'">
                  <el-button @click="handleAction(item, formData[item.props.key || ('input_'+index)])">
                    <i class="fa-solid fa-magnifying-glass"></i>
                  </el-button>
                </template>
              </el-input>
            </el-form-item>

            <!-- 2. Select -->
            <el-form-item 
              v-if="item.type === 'Select'" 
              :label="item.props.label"
              style="margin-bottom: 15px; flex: 1;"
            >
              <el-select 
                v-model="formData[item.props.key]" 
                :placeholder="item.props.placeholder || '请选择'" 
                style="width: 100%"
                size="large"
              >
                <el-option 
                  v-for="(opt, oIdx) in item.props.options" 
                  :key="oIdx" 
                  :label="isObj(opt) ? opt.label : opt" 
                  :value="isObj(opt) ? opt.value : opt" 
                />
              </el-select>
            </el-form-item>

            <!-- 3. Text (★ 修复点：使用 v-html + Markdown) -->
            <!-- 添加 markdown-body 类以复用你的全局 MD 样式 -->
            <div 
              v-if="item.type === 'Text'" 
              class="a2ui-text-content markdown-body"
              v-html="renderMarkdown(item.props.content)"
            ></div>

            <!-- 4. Divider -->
            <el-divider 
              v-if="item.type === 'Divider'" 
              style="margin: 18px 0; border-color: var(--el-border-color-lighter);" 
            />

            <!-- 5. Group -->
            <div v-if="item.type === 'Group'" class="a2ui-group-container">
               <div v-if="item.props && item.props.title" style="width: 100%; font-weight: bold; margin-bottom: 8px; font-size: 14px;">
                  {{ item.props.title }}
               </div>
              <!-- ★ 修改点：添加 :shared-form-data="formData" -->
              <a2-u-i-renderer 
                v-for="(child, cIdx) in item.children" 
                :key="cIdx" 
                :config="child"
                :shared-form-data="formData" 
                @action="relayAction"
                style="flex: 1; min-width: auto;" 
              />
            </div>

            <!-- 6. List -->
            <div v-if="item.type === 'List'" class="a2ui-list">
              <div 
                v-for="(listItem, lIdx) in item.props.items" 
                :key="lIdx" 
                class="a2ui-list-item"
                @click="handleManualAction('点击条目', listItem.title)"
              >
                <div class="a2ui-list-title">{{ listItem.title }}</div>
                <div class="a2ui-list-desc">{{ listItem.description }}</div>
                <div class="a2ui-list-meta">
                  <span v-if="listItem.source" class="tag">{{ listItem.source }}</span>
                  <span class="time">{{ listItem.timestamp }}</span>
                </div>
              </div>
            </div>

            <!-- 7. Card -->
            <el-card 
              v-if="item.type === 'Card'" 
              shadow="hover" 
              class="a2ui-inner-card"
            >
              <template #header v-if="item.props.title">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <span style="font-weight: bold; font-size: 16px;">{{ item.props.title }}</span>
                  <span v-if="item.props.subtitle" style="font-size: 12px; color: #909399; font-weight: normal;">{{ item.props.subtitle }}</span>
                </div>
              </template>
              
              <!-- ★ 修复点 1：独立渲染 Card 的 content，不再使用 v-else -->
              <!-- 这样，无论有没有 children，只要 content 存在就会显示 -->
              <div 
                v-if="item.props.content || item.props.description" 
                class="a2ui-card-desc markdown-body"
                style="margin-bottom: 15px;"
              >
                <div v-if="Array.isArray(item.props.content)">
                    <div v-for="(line, lIdx) in item.props.content" :key="lIdx" v-html="renderMarkdown(line)"></div>
                </div>
                <div v-else-if="item.props.content" v-html="renderMarkdown(item.props.content)"></div>
                <div v-else-if="item.props.description" v-html="renderMarkdown(item.props.description)"></div>
              </div>

              <!-- ★ 修复点 2：独立渲染 Card 的 children -->
              <div v-if="item.children && item.children.length > 0">
                 <!-- ★ 修改点：添加 :shared-form-data="formData" -->
                 <a2-u-i-renderer 
                    v-for="(child, ccIdx) in item.children" 
                    :key="ccIdx" 
                    :config="child"
                    :shared-form-data="formData"
                    @action="relayAction"
                 />
              </div>

              <div class="tags" v-if="item.props.tags" style="margin-top: 12px;">
                <el-tag v-for="tag in item.props.tags" :key="tag" size="default" effect="plain" style="margin-right: 6px;">
                  {{ tag }}
                </el-tag>
              </div>

              <div v-if="item.props.actions" class="a2ui-card-actions">
                <el-button 
                    v-for="(btn, bIdx) in item.props.actions"
                    :key="bIdx"
                    :type="bIdx === item.props.actions.length - 1 ? 'primary' : ''"
                    size="default"
                    @click="handleManualAction(btn.label, item.props.title)"
                >
                    {{ btn.label }}
                </el-button>
              </div>
            </el-card>

            <!-- 8. Button (Description 也支持 Markdown) -->
            <div 
              v-if="item.type === 'Button'" 
              :style="buttonStyle"
            >
              <el-button 
                v-if="item.props.description"
                :type="resolveBtnType(item.props)"
                @click="handleAction(item)" 
                :disabled="isSubmitted"
                size="large"
                style="height: auto; padding: 12px 20px; text-align: left; display: inline-flex; flex-direction: column; align-items: flex-start; line-height: 1.4; width: 100%;"
              >
                <span style="font-weight: 600; font-size: 15px;">{{ item.props.label }}</span>
                <span style="font-size: 12px; opacity: 0.8; font-weight: normal; margin-top: 4px;" v-html="renderMarkdown(item.props.description)"></span>
              </el-button>

              <el-button 
                v-else
                :type="resolveBtnType(item.props)" 
                @click="handleAction(item)" 
                :disabled="isSubmitted"
                size="large" 
                style="width: 100%; font-weight: 500;"
              >
                {{ item.props.label }}
              </el-button>
            </div>

            <!-- 9. Slider (滑块) -->
            <el-form-item 
              v-if="item.type === 'Slider'" 
              :label="item.props.label"
              style="margin-bottom: 15px; flex: 1; min-width: 200px;"
            >
              <div style="display: flex; align-items: center; width: 100%;">
                <el-slider 
                  v-model="formData[item.props.key]" 
                  :min="item.props.min || 0" 
                  :max="item.props.max || 100"
                  :step="item.props.step || 1"
                  show-input
                  size="default"
                  style="flex: 1; margin-right: 10px;"
                />
                <span v-if="item.props.unit" style="font-size: 12px; color: #909399;">{{ item.props.unit }}</span>
              </div>
            </el-form-item>

            <!-- 10. Switch (开关) -->
            <el-form-item 
              v-if="item.type === 'Switch'" 
              :label="item.props.label"
              style="margin-bottom: 15px;"
            >
              <el-switch 
                v-model="formData[item.props.key]" 
                :active-text="item.props.activeText || '开'"
                :inactive-text="item.props.inactiveText || '关'"
              />
            </el-form-item>

            <!-- 11. Radio (单选组) -->
            <el-form-item 
              v-if="item.type === 'Radio'" 
              :label="item.props.label"
              style="margin-bottom: 15px;"
            >
              <el-radio-group v-model="formData[item.props.key]">
                <el-radio 
                  v-for="(opt, oIdx) in item.props.options" 
                  :key="oIdx" 
                  :label="isObj(opt) ? opt.value : opt"
                  border
                >
                  {{ isObj(opt) ? opt.label : opt }}
                </el-radio>
              </el-radio-group>
            </el-form-item>

            <!-- 12. Checkbox (多选组) -->
            <el-form-item 
              v-if="item.type === 'Checkbox'" 
              :label="item.props.label"
              style="margin-bottom: 15px;"
            >
              <el-checkbox-group v-model="formData[item.props.key]">
                <el-checkbox 
                  v-for="(opt, oIdx) in item.props.options" 
                  :key="oIdx" 
                  :label="isObj(opt) ? opt.value : opt"
                >
                  {{ isObj(opt) ? opt.label : opt }}
                </el-checkbox>
              </el-checkbox-group>
            </el-form-item>

            <!-- 13. DatePicker (日期选择) -->
            <el-form-item 
              v-if="item.type === 'DatePicker'" 
              :label="item.props.label"
              style="margin-bottom: 15px;"
            >
              <el-date-picker
                v-model="formData[item.props.key]"
                :type="item.props.subtype || 'date'" 
                :placeholder="item.props.placeholder || '选择日期'"
                value-format="YYYY-MM-DD HH:mm:ss"
                style="width: 100%;"
              />
            </el-form-item>
            
            <!-- 14. Rate (评分) -->
            <el-form-item 
              v-if="item.type === 'Rate'" 
              :label="item.props.label"
              style="margin-bottom: 15px;"
            >
              <el-rate 
                v-model="formData[item.props.key]" 
                allow-half 
                show-text
                :texts="['极差', '失望', '一般', '满意', '惊喜']"
              />
            </el-form-item>

             <!-- 15. Alert (提示条) -->
             <div v-if="item.type === 'Alert'" style="margin-bottom: 15px; width: 100%;">
                <el-alert
                    :title="item.props.title"
                    :type="item.props.variant || 'info'"
                    :show-icon="item.props.showIcon !== false"
                    :closable="false"
                >
                    <template #default v-if="item.props.content">
                        <div v-html="renderMarkdown(item.props.content)"></div>
                    </template>
                </el-alert>
             </div>

            <!-- 16. Code (代码块 - 独立渲染，无额外 wrapper) -->
            <div 
              v-if="item.type === 'Code'" 
              class="a2ui-code-block"
            >
              <div class="code-header">
                <span class="lang-tag">{{ item.props.language || 'text' }}</span>
                <div class="copy-btn" @click="copyToClipboard(item.props.content, $event)">
                  <i class="fa-regular fa-copy"></i>
                  <span>copy</span>
                </div>
              </div>
              <div class="code-body">
                <pre><code>{{ item.props.content }}</code></pre>
              </div>
            </div>

            <!-- 17. Table (表格组件) -->
            <div 
              v-if="item.type === 'Table'" 
              class="a2ui-table-wrapper"
            >
              <div class="a2ui-table-scroll">
                <table class="a2ui-table">
                  <thead>
                    <tr>
                      <th v-for="(head, hIdx) in item.props.headers" :key="hIdx">
                        {{ head }}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(row, rIdx) in item.props.rows" :key="rIdx">
                      <!-- 支持简单 HTML 或纯文本 -->
                      <td v-for="(cell, cIdx) in row" :key="cIdx" v-html="renderMarkdown(String(cell))"></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <!-- 18. 朗读文本块 -->
            <div 
              v-if="item.type === 'TTSBlock'" 
              class="a2ui-tts-block"
              @click="handleTTS(item.props.content, item.props.voice)"
              title="点击播放语音"
            >
              <div class="tts-icon">
                <i class="fa-solid fa-volume-high"></i>
              </div>
              <div class="tts-body">
                <div class="tts-label" v-if="item.props.label">{{ item.props.label }}</div>
                <div class="tts-content markdown-body" v-html="renderMarkdown(item.props.content)"></div>
              </div>
              <div class="tts-action-hint">
                <i class="fa-solid fa-play"></i>
              </div>
            </div>

            <div 
              v-if="item.type === 'Audio'" 
              class="a2ui-audio-player"
              style="margin-bottom: 15px; width: 100%;"
            >
              <div v-if="item.props.title" style="font-weight: bold; margin-bottom: 5px; font-size: 14px;">
                {{ item.props.title }}
              </div>
              <audio controls style="width: 100%; height: 40px;" :src="item.props.src">
                您的浏览器不支持音频元素。
              </audio>
              <div v-if="item.props.description" style="font-size: 12px; color: #909399; margin-top: 4px;">
                {{ item.props.description }}
              </div>
            </div>

          </template>
        </div>
      </el-form>
    </div>
  `,
  props: {
    config: { type: Object, required: true, default: () => ({}) },
    sharedFormData: { type: Object, default: null } 
  },
  data() {
    return { internalFormData: {}, isSubmitted: false };
  },
  computed: {
    activeDownloadCount() {
        return this.downloads.filter(d => d.state === 'progressing').length;
    },
    formData() {
      return this.sharedFormData || this.internalFormData;
    },
    uiConfig() {
      if (Array.isArray(this.config)) return { children: this.config };
      return this.config || {};
    },
    isSelfContained() {
      return ['Card', 'Group', 'List', 'Divider'].includes(this.uiConfig.type);
    },
    normalizedChildren() {
        const conf = this.uiConfig;
        if (conf.children && Array.isArray(conf.children)) {
            return conf.children;
        }
        if (conf.type) {
            return [conf];
        }
        return [];
    },
    containerClass() {
      if (this.uiConfig.type === 'Group') {
        return 'a2ui-group-container';
      }
      return 'a2ui-form-container';
    },
    buttonStyle() {
      if (this.uiConfig.type === 'Group') {
        return { margin: '0 5px', flex: '1' };
      }
      return { textAlign: 'right', marginTop: '10px', width: '100%' };
    }
  },
  created() {
    this.normalizedChildren.forEach((child, idx) => {
      // 需要绑定数据的组件列表
      const formComponents = ['Input', 'Select', 'Slider', 'Switch', 'Radio', 'Checkbox', 'DatePicker', 'Rate'];
      
      if (formComponents.includes(child.type)) {
         const key = (child.props && child.props.key) || (child.type.toLowerCase() + '_' + idx);
         
         if (this.formData[key] === undefined) {
            // 根据组件类型初始化默认值
            if (child.type === 'Checkbox') {
                this.formData[key] = []; // 多选必须初始化为数组
            } else if (child.type === 'Slider' || child.type === 'Rate') {
                this.formData[key] = child.props.min || 0; // 数字类型
            } else if (child.type === 'Switch') {
                this.formData[key] = child.props.defaultValue || false; // 布尔类型
            } else {
                this.formData[key] = ''; // 字符串类型
            }
         }
      }
    });
  },
  methods: {
    resetForm() {
      // 定义递归函数：遍历所有层级寻找表单项
      const traverseAndReset = (items) => {
        if (!Array.isArray(items)) return;

        items.forEach(item => {
          // 递归：如果是容器组件 (Group, Card 等)，继续深入查找
          if (item.children && Array.isArray(item.children)) {
            traverseAndReset(item.children);
          }

          // 处理：如果是表单组件，执行重置
          const formComponents = ['Input', 'Select', 'Slider', 'Switch', 'Radio', 'Checkbox', 'DatePicker', 'Rate'];
          
          if (formComponents.includes(item.type)) {
             // 获取绑定的 key
             const key = (item.props && item.props.key);
             if (!key) return; // 忽略无 key 的组件
             
             // 根据组件类型恢复默认值
             if (item.type === 'Checkbox') {
                 this.formData[key] = []; // 多选 -> 空数组
             } else if (item.type === 'Slider' || item.type === 'Rate') {
                 this.formData[key] = item.props.min || 0; // 数字 -> 0
             } else if (item.type === 'Switch') {
                 this.formData[key] = item.props.defaultValue || false; // 开关 -> false
             } else {
                 this.formData[key] = ''; // 其他文本类 -> 空字符串
             }
          }
        });
      };

      // 从当前组件的根子节点开始递归
      traverseAndReset(this.normalizedChildren);

      // 重置提交状态
      this.isSubmitted = false;
      
      // 界面反馈
      if (typeof showNotification === 'function') {
          showNotification('已重置所有选项', 'success');
      }
    },
    handleTTS(text, voice) {
      // 尝试调用根组件的 ClickToListen 方法
      if (this.$root && typeof this.$root.ClickToListen === 'function') {
        this.$root.ClickToListen(text, voice);
      } else {
        console.warn('A2UI: 根实例上未找到 ClickToListen 方法。');
        this.$emit('action', `TTS播放请求: ${text}`); // 降级处理
      }
    },

    async copyToClipboard(text, event) {
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
        
        // 简单的交互反馈：修改按钮文字
        const btn = event.currentTarget;
        const originalHtml = btn.innerHTML;
        const span = btn.querySelector('span');
        if(span) span.innerText = 'Copied!';
        
        setTimeout(() => {
          btn.innerHTML = originalHtml;
        }, 2000);
        
        // 如果你有全局提示组件，也可以用：
        // showNotification('代码已复制', 'success');
      } catch (err) {
        console.error('复制失败:', err);
      }
    },

    // 渲染 Markdown 的核心方法
    renderMarkdown(text) {
        if (!text) return '';
        // 尝试使用全局定义的 md 对象
        if (typeof md !== 'undefined' && md.render) {
            return md.render(text);
        }
        // 兜底：如果没有 md，简单的换行处理
        return text.replace(/\n/g, '<br>');
    },
    isObj(val) {
      return val && typeof val === 'object';
    },
    resolveBtnType(props) {
        if (props.variant === 'primary') return 'primary';
        if (props.variant === 'danger') return 'danger';
        return props.type || 'default';
    },
handleAction(item, extraValue) {
      // ... (保留之前的 Clear/Reset 拦截逻辑) ...
      if (item.props.action === 'clear' || item.props.action === 'reset') {
          if (this.sharedFormData) {
              this.$emit('action', '_A2UI_RESET_ALL_'); 
          } else {
              this.resetForm();
          }
          return; 
      }

      // ---------------------------------------------------------
      // ★ 常规业务逻辑 (Submit / Search)
      // ---------------------------------------------------------
      this.isSubmitted = true;
      let payload = item.props.label;
      
      if (item.props.action === 'search' && extraValue) {
          payload = `搜索：${extraValue}`;
      }
      else if (item.props.action === 'submit') {
        const formDataKeys = Object.keys(this.formData);
        
        // 场景A: 单字段表单，直接发送 "标签：值"
        if (formDataKeys.length === 1 && this.formData[formDataKeys[0]]) {
            const singleValue = this.formData[formDataKeys[0]];
            payload = `${item.props.label}：${singleValue}`;
        } 
        // 场景B: 多字段表单，发送汇总详情
        else {
            let details = [];
            const findFieldLabel = (nodes, targetKey) => {
                for (const node of nodes) {
                    if (node.props && node.props.key === targetKey) return node.props.label;
                    if (node.children) {
                        const found = findFieldLabel(node.children, targetKey);
                        if (found) return found;
                    }
                }
                return targetKey; 
            };

            for (const [key, val] of Object.entries(this.formData)) {
                 if (val === undefined || val === '' || val === null || (Array.isArray(val) && val.length === 0)) continue;
                 
                 const label = findFieldLabel(this.normalizedChildren, key);
                 let displayVal = val;
                 details.push(`${label}：${displayVal}`);
            }
            
            if (details.length > 0) {
                // ============================================================
                // ★ 修复重点在此处 ★
                // 原代码：payload = `表单提交：\n${details.join('\n')}`;
                // 修改为：将按钮名称 (item.props.label) 明确拼接到消息头部
                // ============================================================
                payload = `提交操作：${item.props.label}\n表单数据：\n${details.join('\n')}`;
            } else {
                // 如果表单全是空的，保留按钮名称
                payload = `${item.props.label} (空表单提交)`;
            }
        }
      } 
      else if (item.props.data) {
          payload = `选择操作：${item.props.label} (ID:${item.props.data})`;
      }
      
      // 发送最终 payload 给父级
      this.$emit('action', payload);
    },

    handleManualAction(actionName, title) {
        this.$emit('action', `选择了：${title} - ${actionName}`);
    },
    relayAction(payload) {
        // ★ 拦截特殊信号：_A2UI_RESET_ALL_
        if (payload === '_A2UI_RESET_ALL_') {
            if (this.sharedFormData) {
                // 我还是子组件，继续像接力棒一样往上传
                this.$emit('action', '_A2UI_RESET_ALL_');
            } else {
                // 我是根组件！终于传到我这了，执行清空
                this.resetForm();
            }
            return; // ★ 拦截结束，不触发 sendMessage
        }

        // 普通消息：直接透传给上一层，最终触发 handleA2UIAction
        this.$emit('action', payload);
    }
  }
};

const MAX_DISPLAY_LENGTH = 50000;   // 工具结果/错误信息前端显示截断长度
const MAX_RENDERED_BLOCKS = 10;
// ==========================================
// 2. 创建 Vue 应用
// ==========================================
const app = Vue.createApp({
  data() {
    return vue_data
  },
  // 在组件销毁时清除定时器
  beforeDestroy() {
    this.stopEdgeScroll();
    if (this.behaviorTimeTimer)   clearInterval(this.behaviorTimeTimer)
    if (this.behaviorNoInputTimer) clearInterval(this.behaviorNoInputTimer)
    if (this.vrmPollTimer) clearInterval(this.vrmPollTimer)
    clearInterval(this.behaviorCycleTimer);
    this.cycleTimers.forEach(timer => {
      if (timer) clearInterval(timer);
    });
    if (this.statusInterval) {
      clearInterval(this.statusInterval);
    }
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('resize', this.checkMobile);
    this.shouldReconnectWs = false; // 设置标志位
    this.stopDanmuProcessor(); // 停止弹幕处理器
    this.disconnectWebSocket();
  },
  async mounted() {
    try {
      // 只在 Electron 环境中注册全局快捷键
      if (isElectron && window.electronAPI?.onGlobalShortcutTriggered) {
          window.electronAPI.onGlobalShortcutTriggered(async () => {
            // 只有启用了 ASR 且模式为全局快捷键时才生效
            if (this.asrSettings.interactionMethod !== 'globalKeyTriggered') return;

            if (!this.isGlobalRecording) {
              // 第 1 次按下组合键：开始录音
              this.isGlobalRecording = true;
              await this.handlePttPress(); 
              // 可选：给个提示，让用户知道在后台录音开始了
              showNotification(this.t('globalRecordingStarted'), 'success')
            } else {
              // 第 2 次按下组合键：结束录音
              this.isGlobalRecording = false;
              await this.handlePttRelease(); 
            }
          });
        }

      // 只在 Electron 环境中注册 IPC 监听
      if (isElectron && window.electron && window.electron.ipcRenderer) {
          window.electron.ipcRenderer.on('trigger-search', (text) => {
              // 1. 将选中的文本填入地址栏变量
              this.urlInput = text;
              
              // 2. 直接调用你现有的回车处理逻辑
              // 这样就会完全复用你的正则判断、Google/Bing/Party 引擎选择逻辑
              this.handleUrlEnter();
          });
      }
      this.fetchDataPath();
      this.audioCtx = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 24000
      });
      this.audioStartTime = this.audioCtx.currentTime;
      
      // 只在 Electron 环境中获取 app 路径
      let fileUrl = '';
      if (isElectron && window.electronAPI) {
        const appPath = await window.electronAPI.getAppPath();
        // 拼接路径： App根目录 + static/js/webview-preload.js
        const fullPath = await window.electronAPI.pathJoin(appPath, 'static', 'js', 'webview-preload.js');
        
        // 2. 转换为 file:// 协议 URL
        // 注意：Windows 下路径是反斜杠 \，需要替换为正斜杠 / 才能用于 URL
        fileUrl = 'file://' + (this.isWindows ? '/' : '') + fullPath.replace(/\\/g, '/');
        
        console.log('Webview Preload URL:', fileUrl); // 调试用
      }
      
      this.webviewPreloadPath = fileUrl;
      
    } catch (e) {
      console.error('获取 Preload 路径失败:', e);
    }

    window.handleToolApproval = (toolCallId, action) => {
        console.log('Global approval triggered:', toolCallId, action); // 调试日志
        this.processToolApproval(toolCallId, action);
    };
    
    // ★ 监听主进程发来的“开新标签”指令（仅 Electron）
    if (isElectron && window.electronAPI && window.electronAPI.onNewTab) {
        window.electronAPI.onNewTab((url) => {
            console.log('收到新标签页请求:', url);
            this.openUrlInNewTab(url);
        });
    }
    
    // 监听下载事件（仅 Electron）
    if (isElectron && window.downloadAPI) {
        window.downloadAPI.onDownloadStarted((data) => {
            console.log('🔥前端已收到下载任务:', data);
            // 新增下载项放到最前面
            this.downloads.unshift({
                ...data,
                state: 'progressing',
                receivedBytes: 0,
                progress: 0
            });
            // 自动打开下拉框提示用户 (可选)
            // this.showDownloadDropdown = true; 
        });

        window.downloadAPI.onDownloadUpdated((data) => {
            const item = this.downloads.find(d => d.id === data.id);
            if (item) {
                Object.assign(item, data); // 更新状态和进度
            }
        });

        window.downloadAPI.onDownloadDone((data) => {
            const item = this.downloads.find(d => d.id === data.id);
            if (item) {
                item.state = data.state;

                if (data.path) {
                    item.path = data.path; 
                }
                if (data.state === 'completed') {
                    item.progress = 1;
                    item.receivedBytes = item.totalBytes;
                }
            }
        });
    }
    
    await this.probeNode();
    await this.probeUv(); 
    await this.probeDocker();
    this.checkMobile();
    this.loadSherpaStatus();
    this.loadMossStatus();
    this.minilmModelStatus();
    window.addEventListener('resize', this.handleResize);
    
    if (isElectron) {
      this.checkServerPort();
    }
    
    window.addEventListener('keydown', this.handleKeyDown)
    window.addEventListener('keyup', this.handleKeyUp)
    window.addEventListener('resize', this.checkMobile);
    this.pollVRMStatus()   // 启动轮询
    
    if (isElectron) {
      this.isMac = window.electron.isMac;
      this.isWindows = window.electron.isWindows;
    }
    
    this.initWebSocket();
    this.highlightCode();
    this.initDownloadButtons();
    
    if (isElectron) {
      // 监听极简窗口关闭事件（同步状态）
      if (window.electronAPI.onMinimalWindowClosed) {
        window.electronAPI.onMinimalWindowClosed(() => {
          this.isMinimalMode = false;
        });
      }
      // 检查更新
      this.checkForUpdates();
      // 监听更新事件
      window.electronAPI.onUpdateAvailable((_, info) => {
        this.updateAvailable = true;
        this.updateInfo = info;
        showNotification(this.t('updateAvailable'), 'info');
      });
      window.electronAPI.onUpdateNotAvailable(() => {
        this.updateAvailable = false;
        this.updateInfo = null;
      });
      window.electronAPI.onUpdateError((_, err) => {
        showNotification(err, 'error');
      });
      window.electronAPI.onDownloadProgress((_, progress) => {
        this.downloadProgress = progress.percent;
        this.updateIcon = 'fa-solid fa-spinner fa-spin';
      });
      window.electronAPI.onUpdateDownloaded(() => {
        this.updateDownloaded = true;
        this.updateIcon = 'fa-solid fa-rocket';
      });
    }
    
    this.$nextTick(() => {
      this.initPreviewButtons();
    });
    this.$nextTick(() => {               // 保证 DOM 已渲染
      document.addEventListener('click', this._toggleHighlight, false);
    });
    document.documentElement.setAttribute('data-theme', this.systemSettings.theme);
    // 启动时同步全局缩放与代码块缩放的初始值
    {
      const scale = Number(this.systemSettings.fontScale) || 1;
      if (this.isElectron && window.electronAPI?.setZoomFactor) {
        try { window.electronAPI.setZoomFactor(scale); } catch (e) { document.documentElement.style.zoom = scale; }
      } else {
        document.documentElement.style.zoom = scale;
      }
      document.documentElement.style.setProperty('--app-zoom', String(scale));
      const codeScale = Number(this.systemSettings.codeFontScale) || 1;
      document.documentElement.style.setProperty('--code-zoom', String(codeScale));
    }
    
    if (isElectron) {
      window.stopQQBotHandler = this.requestStopQQBotIfRunning;
      window.stopFeishuBotHandler = this.requestFeishuBotStopIfRunning;
      window.stopWechatBotHandler = this.requestWechatBotStopIfRunning;
      window.stopDingtalkBotHandler = this.requestDingtalkBotStopIfRunning;
      window.stopDiscordBotHandler = this.requestDiscordBotStopIfRunning;
      window.stopTelegramBotHandler = this.requestTelegramBotStopIfRunning;
      window.stopSlackBotHandler = this.requestSlackBotStopIfRunning;
      window.stopWeComBotHandler = this.requestWeComBotStopIfRunning;
      window.electronAPI.onWindowState((_, state) => {
        this.isMaximized = state === 'maximized'
      });
    }
    
    this.initTTSWebSocket();
    if (isElectron) {
      window.aiBrowser = this;
      this.$nextTick(() => {
        this.generateQRCode(); // 生成二维码
      });
    }
    
    // 1. 时间触发器
    this.behaviorTimeTimer = setInterval(() => {
      if (!this.behaviorSettings.enabled) return
      const now = new Date()
      const hm = now.toLocaleTimeString('zh-CN', { hour12: false }) 
      const d  = now.getDay() 
      this.behaviorSettings.behaviorList.forEach(b => {
        // 关键改动：使用 isTargetPlatform 检查是否属于当前网页端(chat)任务
        if (!b.enabled || b.trigger.type !== 'time' || !this.isTargetPlatform(b, 'chat')) return
        const tv = b.trigger.time.timeValue
        const ds = b.trigger.time.days
        if (tv === hm) {
          if (ds.length === 0 || ds.includes(d)) {
            this.runBehavior(b)
            this.disableOnceBehavior(b)
          }
        }
      })
    }, 1000)

    // 2. 无输入触发器
    this.noInputSec = 0 
    this.behaviorNoInputTimer = setInterval(() => {
      if (!this.behaviorSettings.enabled) return
      this.behaviorSettings.behaviorList.forEach(b => {
        // 关键改动：检查平台
        if (!b.enabled || b.trigger.type !== 'noInput' || !this.isTargetPlatform(b, 'chat')) return
        const need = b.trigger.noInput.latency
        if (this.noInputFlag) {
          this.noInputSec++
          if (this.noInputSec >= need) {
            this.runBehavior(b)
            this.noInputSec = 0 
          }
        } else {
          this.noInputSec = 0
        }
      })
    }, 1000)

    // 3. 周期触发器
    this.behaviorCycleTimer = setInterval(() => {
      // 核心防御：层层判断
      if (!this.behaviorSettings) return;
      if (this.behaviorSettings.enabled !== true) return;
      if (!Array.isArray(this.behaviorSettings.behaviorList)) return;

      this.behaviorSettings.behaviorList.forEach((b, index) => {
        // 检查 b 及其 trigger 是否存在，防止读取 b.trigger.type 报错
        if (!b || !b.enabled || !b.trigger) return;
        
        // 只处理周期类型的任务
        if (b.trigger.type !== 'cycle') return;

        // 检查平台 (这里会调用上面的安全函数)
        if (!this.isTargetPlatform(b, 'chat')) return;

        // 确保存储定时器的数组存在
        if (!this.cycleTimers) this.cycleTimers = [];

        if (!this.cycleTimers[index]) {
          this.initCycleTimer(b, index);
        }
      });
    }, 1000);

    this.scanExtensions(); // 扫描扩展
    if (this.ttsSettings && this.ttsSettings.engine === 'systemtts') {
      this.fetchSystemVoices();
    }
    document.addEventListener('click', (e) => {
        const selector = document.querySelector('.engine-selector');
        if (selector && !selector.contains(e.target)) {
            this.showEngineDropdown = false;
        }
    });
    this.loadFavorites();

    const handleRemoteInstall = (data) => {
      // 1. 根据 type 自动切换菜单和子菜单
      if (data.type === 'mcp') {
          this.handleRemoteMCPInstall(data);
          return;
      }
      const { repo, type } = data;
      if (!repo) return;
      if (type === 'skill') {
        this.activeMenu = 'toolkit'; // 假设 Skills 在这个组
        this.subMenu = 'CLI';      // 切换到 Skills 子菜单
        this.activeCLITab = 'skills';
        this.newSkillUrl = repo;      
      } else {
        this.activeMenu = 'api-group';
        this.subMenu = 'extension';
        this.newExtensionUrl = repo;
      }

      // 2. 确认弹窗
      const confirmMsg = type === 'skill' 
        ? `${this.t('confirmInstallSkillFrom')}：\n${repo}`
        : `${this.t('confirmInstallExtensionFrom')}：\n${repo}`;

      this.$confirm(
        confirmMsg, 
        this.t('confirmInstall'), 
        { 
          confirmButtonText: this.t('confirm'), 
          cancelButtonText: this.t('cancel'),
          type: 'info' 
        }
      ).then(() => {
        // 3. 执行对应的安装方法
        if (type === 'skill') {
          this.installSkillFromGithub();
        } else {
          this.addExtension(); // 执行安装 Extension 的方法
        }
      }).catch(() => {
        console.log('用户取消了安装');
      });
    };

    // --- 挂载监听（仅 Electron）---
    if (isElectron && window.electronAPI) {
      // 软件运行中触发
      window.electronAPI.onRemoteInstall((payload) => {
        // 这里的 payload 包含 { repo, type }
        handleRemoteInstall(payload);
      });

      // 软件启动时检查
      setTimeout(async () => {
        const pendingData = await window.electronAPI.checkPendingInstall();
        if (pendingData) {
          handleRemoteInstall(pendingData);
        }
      }, 1000);
    }

    this.$nextTick(() => {
      setTimeout(() => {
        if (isElectron) {
          this.updateGlobalShortcut();
        }
      }, 1000); // 延迟 500ms 确保主进程完全 Ready
    });
  },
  beforeUnmount() {
    this.stopEdgeScroll();
    this.stopSkillsPolling();
    this.stopExtensionsPolling();
    clearInterval(this.nodeTimer);
    clearInterval(this.uvTimer); 
    if (window.electronAPI?.unregisterGlobalShortcut) {
      window.electronAPI.unregisterGlobalShortcut();
    }
    if (isElectron) {
      delete window.stopQQBotHandler;
      delete window.stopFeishuBotHandler;
      delete window.stopWechatBotHandler;
      delete window.stopDingtalkBotHandler;
      delete window.stopDiscordBotHandler;
      delete window.stopTelegramBotHandler;
      delete window.stopSlackBotHandler;
      delete window.stopWeComBotHandler;
    }
    if (this.ttsWebSocket) {
      this.ttsWebSocket.close();
    }
    document.removeEventListener('click', this._toggleHighlight, false);
    window.removeEventListener('resize', this.handleResize);
    if (window.electronAPI && window.electronAPI.stopWorkspaceWatch) {
      window.electronAPI.stopWorkspaceWatch();
    }

  },
  watch: {

    // 监听输入框内容，驱动快捷指令弹出菜单
    userInput() {
      this.refreshShortcutMenu();
    },

    // 监听背景图变化，全局提升至 body 层
    'systemSettings.backgroundURL': {
      handler(newUrl) {
        if (newUrl) {
          document.body.style.backgroundImage = `url(${newUrl})`;
          document.body.style.backgroundSize = 'cover';
          document.body.style.backgroundPosition = 'center center';
          document.body.style.backgroundAttachment = 'fixed'; // 固定背景，滚动时不跟着跑
          document.body.classList.add('has-custom-bg'); // 给 body 打上标签，激活毛玻璃 CSS
        } else {
          document.body.style.backgroundImage = '';
          document.body.classList.remove('has-custom-bg');
        }
      },
      immediate: true // 组件加载时立刻执行一次
    },

    // 监听自定义 CSS 注入
    'systemSettings.customCSS': {
      handler(css) {
        let styleEl = document.getElementById('custom-css-injection');
        if (css) {
          if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = 'custom-css-injection';
            document.head.appendChild(styleEl);
          }
          styleEl.textContent = css;
        } else if (styleEl) {
          styleEl.remove();
        }
      },
      immediate: true
    },

    'CLISettings.cc_path': {
      handler(newPath) {
        if (newPath) {
          console.log('工作区路径更新，准备启动文件监听:', newPath);
          this.setupWorkspaceWatcher(newPath);
        } else if (window.electronAPI && window.electronAPI.stopWorkspaceWatch) {
          window.electronAPI.stopWorkspaceWatch();
        }
      },
      immediate: true
    },

    showHistorySidebar() {
      this.$nextTick(() => {
        // 如果侧边栏消失/出现，聊天区和侧边栏应该保持原有比例填满剩下空间
        this.updatePanelWidths();
      });
    },

    'asrSettings.interactionMethod': {
      handler() { this.updateGlobalShortcut(); }
    },
    'asrSettings.enabled': {
      handler() { this.updateGlobalShortcut(); }
    },

    sidePanelOpen(val) {
        if (!val && this.taskRefreshTimer) {
            clearInterval(this.taskRefreshTimer);
        } else if (val && this.activeSideView === 'tasks') {
            this.fetchTasks();
            this.taskRefreshTimer = setInterval(this.fetchTasks, 3000);
        }
    },
    'tempBehavior.trigger.cycle.cycleValue'(newVal) {
      if (newVal === '00:00:00') {
        this.tempBehavior.trigger.cycle.cycleValue = '00:00:01';
      }
    },
    activeMenu(newVal) {
      this.handleExtensionsPolling(newVal, this.subMenu);
      this.handleSkillsPolling(newVal, this.subMenu, this.activeCLITab);
    },
    // 监听子菜单
    subMenu(newVal) {
      this.handleExtensionsPolling(this.activeMenu, newVal);
      this.handleSkillsPolling(this.activeMenu,newVal, this.activeCLITab);
    },
    // 监听 CLI 内部的 Tab
    activeCLITab(newVal) {
      this.handleSkillsPolling(this.activeMenu,this.subMenu, newVal);
    },
    'CLISettings.cc_path': function(newPath) {
      console.log('工作区路径变化，更新技能状态');
      this.fetchProjectSkillsStatus();
    },
    'searchEngine': function(newVal) {
      if (newVal === 'party') {
        this.searchEngineplaceholder = this.t('searchWithParty')
      }else if (newVal === 'bing') {
        this.searchEngineplaceholder = this.t('searchWithBing')
      }else if (newVal === 'google') {
        this.searchEngineplaceholder = this.t('searchWithGoogle')
      }
    },
    currentTheme: {
      handler(newVal) {
        // 等待 DOM 更新，确保 CSS 变量已变更
        this.$nextTick(() => {
          // 遍历所有标签页，更新样式
          this.browserTabs.forEach(tab => {
            this.updateWebviewTheme(tab.id);
          });
        });
      },
      immediate: false // 初始化时不需要立即执行，因为 dom-ready 会处理
    },
    'ttsSettings.engine': function(newVal) {
      if (newVal === 'systemtts') {
        // 如果列表为空，则去获取
        if (this.systemVoices.length === 0) {
          this.fetchSystemVoices();
        }
      }
    },
    'readConfig.longText': {
      immediate: true,
      async handler(val) {          // ← 加 async
        await this.$nextTick();     // ← 保证组件完成上一轮渲染
        if (!val?.trim()) {
          this.clearSegments();
          return;
        }
        this.reSegment();
      }
    },
    selectedCodeLang() {
      this.highlightCode();
    },
    modelProviders: {
      deep: true,
      handler(newProviders) {
        const existingIds = new Set(newProviders.map(p => p.id));
        // 自动清理无效的 selectedProvider
        [this.settings, this.reasonerSettings,this.visionSettings,
          this.KBSettings,this.text2imgSettings,this.ccSettings,
          this.qcSettings,this.fastSettings
        ].forEach(config => {
          if (config.selectedProvider && !existingIds.has(config.selectedProvider)) {
            config.selectedProvider = null;
            // 可选项：同时重置相关字段
            config.model = '';
            config.base_url = '';
            config.api_key = '';
          }
          if (!config.selectedProvider && newProviders.length > 0) {
            config.selectedProvider = newProviders[0].id;
          }
        });
        [this.settings, this.reasonerSettings,this.visionSettings,
          this.KBSettings,this.text2imgSettings,this.ccSettings,
          this.qcSettings,this.fastSettings
        ].forEach(config => {
          if (config.selectedProvider) this.syncProviderConfig(config);
        });
      }
    },
    'systemSettings.theme': {
      handler(newVal) {
        document.documentElement.setAttribute('data-theme', newVal);
        
        // 更新 mermaid 主题
        if (window.mermaid) {
          mermaid.initialize({
            startOnLoad: false,
            securityLevel: 'loose',
            theme : ['dark','midnight','neon'].includes(newVal) ? 'dark' : 'default'
          });
        }

        // Element Plus 在 element-plus.css 中以 :root 定义了 --el-color-primary: #409eff，
        // 且加载在 styles.css 之后，先前的主题色将因此被覆盖（特异度相同则后载入优先）
        // 所以 JS 必须以 inline style 设置主色和补全变体，色值与 CSS [data-theme] 块一致
        const cssPrimary = {
          light: '#17827a',
          dark: '#c8815a',
          midnight: '#4d94f0',
          desert: '#c4784a',
          neon: '#e04090',
          marshmallow: '#e29aaa',
          ink: '#2a3b4c',
          party: '#e08a20',
          rainbow: '#7a5cc0',
        }[newVal];

        if (cssPrimary) {
          const root = document.documentElement;
          root.style.setProperty('--el-color-primary', cssPrimary);
          root.style.setProperty('--el-color-primary-light-9', this.colorBlend(cssPrimary, '#ffffff', 0.1));
          root.style.setProperty('--el-color-primary-light-8', this.colorBlend(cssPrimary, '#ffffff', 0.2));
          root.style.setProperty('--el-color-primary-light-7', this.colorBlend(cssPrimary, '#ffffff', 0.3));
          root.style.setProperty('--el-color-primary-light-6', this.colorBlend(cssPrimary, '#ffffff', 0.4));
          root.style.setProperty('--el-color-primary-light-5', this.colorBlend(cssPrimary, '#ffffff', 0.5));
          root.style.setProperty('--el-color-primary-light-4', this.colorBlend(cssPrimary, '#ffffff', 0.6));
          root.style.setProperty('--el-color-primary-light-3', this.colorBlend(cssPrimary, '#ffffff', 0.7));
          root.style.setProperty('--el-color-primary-light-2', this.colorBlend(cssPrimary, '#ffffff', 0.8));
          root.style.setProperty('--el-color-primary-light-1', this.colorBlend(cssPrimary, '#ffffff', 0.9));
          root.style.setProperty('--el-color-primary-dark-1', this.colorBlend(cssPrimary, '#000000', 0.3));
          root.style.setProperty('--el-color-primary-dark-2', this.colorBlend(cssPrimary, '#000000', 0.2));
          root.style.setProperty('--el-color-primary-dark-3', this.colorBlend(cssPrimary, '#000000', 0.1));

          // 强制刷新 Element Plus 主题
          if (window.__ELEMENT_PLUS_INSTANCE__) {
            window.__ELEMENT_PLUS_INSTANCE__.config.globalProperties.$ELEMENT.reload();
          }
        }
      },
      immediate: true
    },
    'systemSettings.fontScale': {
      handler(newVal) {
        const safe = Math.max(0.85, Math.min(1.5, Number(newVal) || 1));
        if (this.isElectron && window.electronAPI?.setZoomFactor) {
          try { window.electronAPI.setZoomFactor(safe); } catch (e) { document.documentElement.style.zoom = safe; }
        } else {
          document.documentElement.style.zoom = safe;
        }
        document.documentElement.style.setProperty('--app-zoom', String(safe));
      },
      immediate: true
    },
    'systemSettings.codeFontScale': {
      handler(newVal) {
        const safe = Math.max(0.83, Math.min(1.67, Number(newVal) || 1));
        document.documentElement.style.setProperty('--code-zoom', String(safe));
      },
      immediate: true
    },
    'systemSettings.language': {
      handler(newVal) {
        if (this.isElectron) {
          window.electronAPI.sendLanguage(newVal);
        }
      },
      immediate: true
    },
  },
  computed: {

    getEiditDialogTitle() {
      if (this.editType === 'system'){
        return this.t('editSystemPrompt');
      }else if (this.editType === 'user'){
        return this.t('editMessage');
      }else{
        return this.t('viewOriginalMessage');
      }
    },

    groupedModelProviders() {
      const groups = {};
      const providers = this.modelProviders || [];
      providers.forEach(p => {
        const vendor = p.vendor || 'Unknown';
        if (!groups[vendor]) groups[vendor] = [];
        groups[vendor].push(p);
      });
      return Object.entries(groups).map(([vendor, providers]) => ({
        vendor,
        providers
      }));
    },

    // 当前主模型的供应商名称
    mainVendorName() {
      if (!this.settings.selectedProvider) return null;
      const provider = this.modelProviders.find(p => p.id === this.settings.selectedProvider);
      return provider ? provider.vendor : null;
    },
    // 当前快速应答模型的供应商名称
    fastVendorName() {
      if (!this.fastSettings.selectedProvider) return null;
      const provider = this.modelProviders.find(p => p.id === this.fastSettings.selectedProvider);
      return provider ? provider.vendor : null;
    },
    // 主模型推荐参数
    mainSuggestedParams() {
      const vendor = this.mainVendorName;
      if (!vendor || !this.vendorSuggestedParams[vendor]) return [];
      return this.vendorSuggestedParams[vendor].filter(p => !this.paramExistsInMain(p.name));
    },
    // 快速应答模型推荐参数
    fastSuggestedParams() {
      const vendor = this.fastVendorName;
      if (!vendor || !this.vendorSuggestedParams[vendor]) return [];
      return this.vendorSuggestedParams[vendor].filter(p => !this.paramExistsInFast(p.name));
    },

    // ✨ 新增：主页面扩展列表过滤逻辑 ✨
    filteredManageExtensions() {
      if (!this.searchManageExtensionQuery) {
        return this.extensions;
      }
      const query = this.searchManageExtensionQuery.toLowerCase();
      return this.extensions.filter(ext => {
        const matchName = ext.name && ext.name.toLowerCase().includes(query);
        const matchDesc = ext.description && ext.description.toLowerCase().includes(query);
        const matchAuthor = ext.author && ext.author.toLowerCase().includes(query);
        return matchName || matchDesc || matchAuthor; // 增加作者匹配
      });
    },

    // ✨ 新增：弹窗远程插件列表过滤逻辑 ✨
    filteredRemotePlugins() {
      if (!this.searchRemotePluginQuery) {
        return this.remotePlugins;
      }
      const query = this.searchRemotePluginQuery.toLowerCase();
      return this.remotePlugins.filter(plugin => {
        const matchName = plugin.name && plugin.name.toLowerCase().includes(query);
        const matchDesc = plugin.description && plugin.description.toLowerCase().includes(query);
        return matchName || matchDesc;
      });
    },

    // 动态返回过滤后的扩展列表
    filteredExtensions() {
      // 如果搜索框为空，直接返回原有的扩展列表
      if (!this.searchExtensionQuery) {
        return this.extensions; 
      }
      
      const query = this.searchExtensionQuery.toLowerCase();
      
      // 根据扩展的名称或描述进行模糊匹配
      return this.extensions.filter(ext => {
        const matchName = ext.name && ext.name.toLowerCase().includes(query);
        const matchDesc = ext.description && ext.description.toLowerCase().includes(query);
        return matchName || matchDesc;
      });
    },

  favoriteExtensions() {
    return this.extensions.filter(ext => this.favoriteExtensionIds.includes(ext.id));
  },

  dockerBasicCommand() {
    const img = this.dockerImages[this.dockerRegistry].backend;
    return `docker pull ${img}
docker run -d \\
  -p 3456:3456 \\
  -v ./super-agent-data:/app/data \\
  ${img}`;
  },
  
  dockerComposeCommand() {
    const composeFile = this.dockerImages[this.dockerRegistry].composeFile;
    return `git clone https://github.com/heshengtao/super-agent-party.git
cd super-agent-party
docker-compose -f ${composeFile} up -d`;
  },

    // 动态过滤表格数据
    filteredAffectionData() {
      console.log("计算属性触发，当前数据长度:", this.affectionDataList.length);
      // 检查基础数据是否存在
      if (!this.affectionDataList || this.affectionDataList.length === 0) {
        return [];
      }
      
      // 如果没有搜索词，直接返回全量数组
      if (!this.affectionSearchQuery) {
        return this.affectionDataList;
      }
      
      const query = this.affectionSearchQuery.toLowerCase();
      return this.affectionDataList.filter(item => {
        // 确保 userName 存在再进行过滤
        return item.userName && item.userName.toLowerCase().includes(query);
      });
    },
    // 日记本：按时间倒序 + 搜索过滤
    filteredDiaryEntries() {
      let list = Array.isArray(this.diaryEntries) ? this.diaryEntries.slice() : [];
      list.sort((a, b) => new Date(b.time) - new Date(a.time));
      if (this.diarySearchQuery) {
        const q = this.diarySearchQuery.toLowerCase();
        list = list.filter(e =>
          (e.content && e.content.toLowerCase().includes(q)) ||
          (e.title && e.title.toLowerCase().includes(q)) ||
          (e.type && e.type.toLowerCase().includes(q))
        );
      }
      return list;
    },
    // 日记触发间隔范围（供 el-slider range 双向绑定）
    diaryIntervalRange: {
      get() {
        return [this.diarySettings.minMinutes, this.diarySettings.maxMinutes];
      },
      set(val) {
        if (!Array.isArray(val)) return;
        this.diarySettings.minMinutes = val[0];
        this.diarySettings.maxMinutes = val[1];
        this.autoSaveSettings();
      }
    },
    computedSkillsList() {
      const skillMap = new Map();
      
      // 1. 灌入全局技能
      this.skillsList.forEach(skill => {
        skillMap.set(skill.id, {
          ...skill,
          isGlobal: true,
          isProject: false
        });
      });

      // 2. 灌入项目技能 (补充全局没有的，或者标记项目存在的)
      this.projectSkillsDetails.forEach(skill => {
        if (skillMap.has(skill.id)) {
          skillMap.get(skill.id).isProject = true;
        } else {
          skillMap.set(skill.id, {
            ...skill,
            isGlobal: false,
            isProject: true
          });
        }
      });

      return Array.from(skillMap.values());
    },
    // 快捷指令弹出菜单：当前 / 后输入的指令片段（无匹配返回 null）
    shortcutMenuToken() {
      if (!this.systemSettings || !this.systemSettings.enableShortcuts) return null;
      const m = /^\/(\S*)$/.exec(this.userInput || '');
      return m ? m[1].toLowerCase() : null;
    },
    // 快捷指令弹出菜单：过滤后的候选项列表
    shortcutMenuItems() {
      const token = this.shortcutMenuToken;
      if (token === null) return [];
      const cliEnabled = !!(this.CLISettings && this.CLISettings.enabled);
      const runIds = ['help', 'new', 'stop', 'retry', 'skills'];
      const fillIds = ['model', 'personality'];
      const modeIds = ['mode_plan', 'mode_read', 'mode_edit', 'mode_yolo', 'mode_cowork', 'mode_goal'];
      const items = [];
      (this.shortcutCommands || []).forEach(c => {
        if (!runIds.includes(c.id) && !fillIds.includes(c.id) && !modeIds.includes(c.id)) return;
        if (c.requiresCli && !cliEnabled) return; // 需开启电脑命令行控制
        const word = (c.syntax || '').split(/\s+/)[0];
        const names = [word, ...(c.aliases || [])];
        const match = !token || names.some(n => n.toLowerCase().startsWith('/' + token));
        if (!match) return;
        items.push({
          key: c.id,
          label: word,
          aliases: c.aliases || [],
          desc: this.t(c.descKey),
          mode: fillIds.includes(c.id) ? 'fill' : 'run',
          insert: word,
          isSkill: false
        });
      });
      if (cliEnabled) {
        (this.computedSkillsList || []).forEach(s => {
          const name = s.name || s.id;
          if (!name) return;
          const word = '/' + name;
          if (token && !word.toLowerCase().startsWith('/' + token)) return;
          items.push({
            key: 'skill:' + (s.id || name),
            label: word,
            aliases: [],
            desc: s.description || this.t('cmd_skill_desc'),
            mode: 'fill',
            insert: word,
            isSkill: true
          });
        });
      }
      return items;
    },
    hasWorkspacePath() {
        return this.CLISettings && 
               this.CLISettings.cc_path && 
               this.CLISettings.cc_path.trim() !== '';
    },
    dynamicUserAgent() {
      // 1. 定义一个较新的 Chrome 版本号 (定期更新这个版本号可以保持最佳兼容性)
      // 目前 Chrome 124+ 是比较通用的
      const chromeVersion = '124.0.0.0'; 
      
      // 2. 基础模板
      const baseUA = `Mozilla/5.0 ({os_info}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`;
      
      // 3. 获取当前平台
      // 在 Electron Renderer 中，通常可以通过 global.process 或 navigator 判断
      let platform = '';
      
      // 尝试使用 node 的 process.platform (最准确)
      if (typeof window.process !== 'undefined' && window.process.platform) {
        platform = window.process.platform;
      } else {
        // 降级方案：分析 navigator.userAgent
        const navUA = navigator.userAgent.toLowerCase();
        if (navUA.indexOf('mac') > -1) platform = 'darwin';
        else if (navUA.indexOf('win') > -1) platform = 'win32';
        else platform = 'linux';
      }

      // 4. 根据平台设置对应的 OS 信息
      let osInfo = '';
      switch (platform) {
        case 'darwin': // macOS
          // 模拟 macOS Intel/M1 通用标识
          osInfo = 'Macintosh; Intel Mac OS X 10_15_7';
          break;
        case 'win32': // Windows
          // 模拟 Windows 10/11 64位
          osInfo = 'Windows NT 10.0; Win64; x64';
          break;
        case 'linux': // Linux
          // 模拟标准 Linux x64
          osInfo = 'X11; Linux x86_64';
          break;
        default:
          // 默认回退到 Windows
          osInfo = 'Windows NT 10.0; Win64; x64';
      }

      // 5. 返回替换后的完整字符串
      return baseUA.replace('{os_info}', osInfo);
    },

    isCurrentTabFavorite() {
        // 如果没有当前标签或当前标签没有URL（比如是新标签页），返回 false
        if (!this.currentTab || !this.currentTab.url) return false;
        // 检查当前 URL 是否存在于收藏列表中
        return this.favorites.some(f => f.url === this.currentTab.url);
    },

    sidePanelText() {
      if (this.messages.length === 0) {
        return '';
      }
      
      // 过滤出所有助手消息并按时间倒序排列
      const assistantMessages = this.messages
        .filter(msg => msg.role === 'assistant')
        .reverse();
      
      // 找到第一个非空消息
      for (const msg of assistantMessages) {
        if (msg.pure_content && msg.pure_content.trim() !== '') {
          return msg.pure_content;
        }
      }
      
      // 如果没有找到符合条件的消息
      return '';
    },
    currentViewName() {
      return this.currentExtension ? this.currentExtension.name : this.t('defaultView');
    },
    /* 计算属性：默认模板 */
    defaultSidePanelHTML() {
      // 如果用户已给出自定义模板，就直接用
      if (this.sidePanelHTML) return this.sidePanelHTML;

      return `
        <div class="side-panel-default">
          <div class="side-panel-content markdown-body" v-data-mjx-disabled="true">
            ${this.formatMessage(this.sidePanelText)}
          </div>
        </div>`;
    },
    noInputFlag() {
      return !this.TTSrunning &&
             !this.ASRrunning &&
             !this.isInputting &&
             !this.isTyping &&
             !this.isOmniPlaying
    },
    // 计算处理百分比
    processingPercentage() {
      if (this.totalChunksCount === 0) return 0;
      return Math.round((this.audioChunksCount / this.totalChunksCount) * 100);
    },
    
    // 生成进度文本
    processingProgressText() {
      if (this.totalChunksCount === 0) return this.t('waiting');
      
      return `${this.audioChunksCount} / ${this.totalChunksCount} (${this.processingPercentage}%)`;
    },
    
    // 根据状态设置进度条颜色
    progressStatus() {
      if (this.isReadRunning || this.isConvertingAudio) {
        if (this.processingPercentage >= 90) return 'success';
        if (this.processingPercentage >= 50) return '';
        return 'exception';
      }
      return 'success';
    },

    allChecked: {
      get() {
        return this.textFiles.length > 0 && this.selectedFiles.length === this.textFiles.length;
      },
      set(val) {
        this.selectedFiles = val ? this.textFiles.map(f => f.unique_filename) : [];
      }
    },
    indeterminate() {
      return (
        this.selectedFiles.length > 0 &&
        this.selectedFiles.length < this.textFiles.length
      );
    },
    // 图片全选状态
    allImagesChecked: {
      get() {
        return this.imageFiles.length > 0 && 
              this.selectedImages.length === this.imageFiles.length
      },
      set(val) {
        this.selectedImages = val 
          ? this.imageFiles.map(i => i.unique_filename) 
          : []
      }
    },
    
    // 图片半选状态：选中数量大于0且小于总数
    indeterminateImages() {
      return (
        this.selectedImages.length > 0 &&
        this.selectedImages.length < this.imageFiles.length
      );
    },

    // 视频全选状态
    allVideosChecked: {
      get() {
        return this.videoFiles.length > 0 && 
              this.selectedVideos.length === this.videoFiles.length
      },
      set(val) {
        this.selectedVideos = val 
          ? this.videoFiles.map(v => v.unique_filename) 
          : []
      }
    },
    // 全选框的半选状态
    indeterminateVideos() {
      return (
        this.selectedVideos.length > 0 &&
        this.selectedVideos.length < this.videoFiles.length
      );
    },
    sidebarStyle() {
      return {
        width: this.isMobile ? 
          (this.sidebarVisible ? '200px' : '0') : 
          (this.isCollapse ? '64px' : '200px')
      }
    },
    filteredSeparators() {
      const current = this.qqBotConfig.separators;
      const defaults = this.defaultSeparators;
      const custom = current
        .filter(s => !defaults.some(d => d.value === s))
        .map(s => ({
          label: `(${this.formatSeparator(s)})`,
          value: s
        }));
      return [...this.defaultSeparators, ...custom];
    },
    filteredClaudeModelProviders() {
      let vendors = ["Anthropic", "Deepseek", "siliconflow", "ZhipuAI", "moonshot", "aliyun", "modelscope","302.AI","MiMo","newapi","Ollama"];
      // this.modelProviders中，vendor在vendors中的，添加到filteredClaudeModelProviders
      return this.modelProviders.filter((item) => vendors.includes(item.vendor));
    },

    // 计算属性，判断配置是否有效
    isQQBotConfigValid() {
        return this.qqBotConfig.appid && this.qqBotConfig.secret;
    },
    isfeishuBotConfigValid() {
      return this.feishuBotConfig.appid && this.feishuBotConfig.secret;
    },
    filteredFeishuSeparators() {
      const current = this.feishuBotConfig.separators;
      const defaults = this.defaultSeparators;
      const custom = current
        .filter(s => !defaults.some(d => d.value === s))
        .map(s => ({
          label: `(${this.formatSeparator(s)})`,
          value: s
        }));
      return [...this.defaultSeparators, ...custom];
    },
    isWechatBotConfigValid() {
      // 微信 SDK 原生扫码，无需类似 APP ID/Secret 的强制输入限制
      return true; 
    },
    filteredWechatSeparators() {
      const current = this.wechatBotConfig.separators || [];
      const defaults = this.defaultSeparators ||[];
      const custom = current
        .filter(s => !defaults.some(d => d.value === s))
        .map(s => ({
          label: `(${this.formatSeparator(s)})`,
          value: s
        }));
      return [...defaults, ...custom];
    },

      isWeComBotConfigValid() {
        return this.weComBotConfig.bot_id && this.weComBotConfig.secret;
      },
      filteredWeComSeparators() {
        // 逻辑与飞书完全相同
        return [...this.defaultSeparators, ...custom];
      },

  // 校验配置是否填写完整
  isdingtalkBotConfigValid() {
    return this.dingtalkBotConfig.appKey && this.dingtalkBotConfig.appSecret;
  },
  
  // 处理分隔符列表展示
  filteredDingtalkSeparators() {
    const current = this.dingtalkBotConfig.separators || [];
    const defaults = this.defaultSeparators || []; // 假设你有默认分隔符定义
    const custom = current
      .filter(s => !defaults.some(d => d.value === s))
      .map(s => ({
        label: `(${this.formatSeparator(s)})`,
        value: s
      }));
    return [...defaults, ...custom];
  },
    isTelegramBotConfigValid() {
      return this.telegramBotConfig.bot_token;
    },
    filteredTelegramSeparators() {
      const current = this.telegramBotConfig.separators;
      const defaults = this.defaultSeparators;
      const custom = current
        .filter(s => !defaults.some(d => d.value === s))
        .map(s => ({
          label: `(${this.formatSeparator(s)})`,
          value: s
        }));
      return [...this.defaultSeparators, ...custom];
    },
    isDiscordBotConfigValid() {
      return !!this.discordBotConfig.token;
    },
    filteredDiscordSeparators() {
      const current = this.discordBotConfig.separators;
      const defaults = this.defaultSeparators;
      const custom = current
        .filter(s => !defaults.some(d => d.value === s))
        .map(s => ({
          label: `(${this.formatSeparator(s)})`,
          value: s
        }));
      return [...this.defaultSeparators, ...custom];
    },
    isSlackBotConfigValid() {
      // Slack 需要同时拥有这两个 token 才能运行
      return !!this.slackBotConfig.bot_token && !!this.slackBotConfig.app_token;
    },
    filteredSlackSeparators() {
      const current = this.slackBotConfig.separators;
      const defaults = this.defaultSeparators;
      const custom = current
        .filter(s => !defaults.some(d => d.value === s))
        .map(s => ({
          label: `(${this.formatSeparator(s)})`,
          value: s
        }));
      return [...this.defaultSeparators, ...custom];
    },
    // isWXBotConfigValid() {
    //     return this.WXBotConfig.nickNameList && this.WXBotConfig.nickNameList.length > 0;
    // },
    isLiveConfigValid() {
        if (this.liveConfig.bilibili_enabled) {
            // if(this.liveConfig.bilibili_type === 'web'){
            //     return this.liveConfig.bilibili_room_id && this.liveConfig.bilibili_room_id.trim() !== '';
            // }
            // else if(this.liveConfig.bilibili_type === 'open_live'){
                return this.liveConfig.bilibili_ACCESS_KEY_ID !== '' &&
                this.liveConfig.bilibili_SECRET_ACCESS_KEY !== '' &&
                this.liveConfig.bilibili_APP_ID !== '' &&
                this.liveConfig.bilibili_ROOM_OWNER_AUTH_CODE !== '';
            // }
        }
        else if (this.liveConfig.youtube_enabled) {
          return this.liveConfig.youtube_video_id !== '' &&
          this.liveConfig.youtube_api_key !== '';
        }
        else if (this.liveConfig.twitch_enabled) {
          return this.liveConfig.twitch_channel !== '' &&
          this.liveConfig.twitch_access_token !== '';
        }
        return false;
    },
    updateButtonText() {
      if (this.updateDownloaded) return this.t('installNow');
      if (this.downloadProgress > 0) return this.t('downloading');
      return this.t('updateAvailable');
    },
    allItems() {
      return [
        ...this.files.map(file => ({ ...file, type: 'file' })),
        ...this.images.map(image => ({ ...image, type: 'image' }))
      ];
    },
    sortedConversations() {
      return [...this.conversations].sort((a, b) => b.timestamp - a.timestamp);
    },
    filteredConversations() {
        const keyword = (this.searchKeyword || '').toLowerCase();
        // 1. 确保 conversations 存在且是数组
        if (!Array.isArray(this.conversations)) return [];

        return [...this.conversations]
            .filter(conv => {
                if (!conv) return false;
                // 2. 安全检查 title
                const titleMatch = (conv.title || '').toLowerCase().includes(keyword);
                
                // 3. 【核心修复】安全检查 messages 数组及其内容
                const contentMatch = (conv.messages || []).some(msg => 
                    msg && msg.content && String(msg.content).toLowerCase().includes(keyword)
                );
                
                return titleMatch || contentMatch;
            })
            .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    },
    groupedFilteredConversations() {
      const groups = Array.isArray(this.conversationGroups) ? this.conversationGroups : [];
      const conversations = Array.isArray(this.filteredConversations) ? this.filteredConversations : [];
      const keyword = (this.searchKeyword || '').trim().toLowerCase();

      return groups
        .map(group => ({
          ...group,
          conversations: conversations.filter(conv => (conv.groupId || 'default') === group.id)
        }))
        .filter(group => {
          if (!keyword) return true;
          return group.conversations.length > 0 || (group.name || '').toLowerCase().includes(keyword);
        });
    },
    iconClass() {
      return this.isExpanded ? 'fa-solid fa-compress' : 'fa-solid fa-expand';
    },
    hasEnabledA2AServers() {
      return Object.values(this.a2aServers).some(server => server.enabled);
    },
    hasEnabledLLMTools() {
      return this.llmTools.some(tool => tool.enabled);
    },
    hasEnabledKnowledgeBases() {
      return this.knowledgeBases.some(kb => kb.enabled)
    },
    hasEnabledMCPServers() {
      // 检查this.mcpServers中的sever中是否有disable为false的
      return Object.values(this.mcpServers).some(server => !server.disabled);
    },
    hasEnabledHttpTools() {
      return this.customHttpTools.some(tool => tool.enabled);
    },
    hasEnabledComfyUI() {
      return this.workflows.some(tool => tool.enabled);
    },
    hasEnabledStickerPacks() {
      return this.stickerPacks.some(pack => pack.enabled);
    },
    hasFiles() {
      return this.files.length > 0
    },
    hasImages() {
      return this.images.length > 0
    },
    formValid() {
      return !!this.newLLMTool.name && !!this.newLLMTool.type
    },
    isEditingBehavior() {
      return this.currentBehaviorIndex !== -1;
    },
    defaultBaseURL() {
      switch(this.newLLMTool.type) {
        case 'openai': 
          return 'https://api.openai.com/v1'
        case 'ollama':
          return this.isdocker ? 
            'http://host.docker.internal:11434' : 
            'http://127.0.0.1:11434'
        default:
          return ''
      }
    },
    defaultApikey() {
      switch(this.newLLMTool.type) {
        case 'ollama':
          return 'ollama'
        default:
          return ''
      }
    },
    validProvider() {
      if (!this.newProviderTemp.vendor) return false
      if (this.newProviderTemp.vendor === 'custom' || this.newProviderTemp.vendor === 'customAnthropic') {
        return this.newProviderTemp.url.startsWith('http')
      }
      return true
    },
    vendorOptions() {
      return this.vendorValues.map(value => ({
        label: this.t(`vendor.${value}`), // 使用统一的翻译键
        value
      }));
    },
  // 新增：根据搜索词和分类过滤后的供应商列表
  filteredVendorOptions() {
    return this.vendorOptions.filter(item => {
      // 1. 搜索过滤 (不区分大小写匹配 value 或 翻译后的 label)
      const keyword = this.searchQuery.toLowerCase();
      const matchSearch = 
        item.value.toLowerCase().includes(keyword) || 
        item.label.toLowerCase().includes(keyword);

      // 2. 分类过滤
      const isLocal = this.localVendors.includes(item.value);
      let matchCategory = true;
      
      if (this.activeCategory === 'local') {
        matchCategory = isLocal;
      } else if (this.activeCategory === 'cloud') {
        matchCategory = !isLocal;
      }

      // 同时满足搜索和分类条件
      return matchSearch && matchCategory;
    });
  },

    MCPvendorOptions() {
      return this.MCPvendorValues.map(value => ({
        label: this.t(`MCPvendor.${value}`), // 使用统一的翻译键
        value
      }));
    },
    PromptOptions() {
      return this.promptValues.map(value => ({
        label: this.t(`prompt.${value}`), // 使用统一的翻译键
        value
      }));
    },
    CardOptions() {
      return this.cardValues.map(value => ({
        label: this.t(`card.${value}`), // 使用统一的翻译键
        value
      }));
    },
    themeOptions() {
      return this.themeValues.map(value => ({
        label: this.t(`theme.${value}`),
        value // 保持原始值（推荐）
      }));
    },
    // 全局字体基准 14px
    currentFontPx() {
      return Math.round((Number(this.systemSettings.fontScale) || 1) * 14);
    },
    // 代码块基准 12px（与 github-markdown.css 中 .markdown-body pre 一致）
    currentCodeFontPx() {
      return Math.round((Number(this.systemSettings.codeFontScale) || 1) * 12);
    },
    // 下拉框对外暴露 px、对内存 zoom 比例
    fontPxModel: {
      get() { return this.currentFontPx; },
      set(px) { this.handleFontScaleChange(px / 14); }
    },
    codeFontPxModel: {
      get() { return this.currentCodeFontPx; },
      set(px) { this.handleCodeFontScaleChange(px / 12); }
    },
    fontSizeOptions() {
      return [12, 13, 14, 15, 16, 17, 18, 19, 20, 21];
    },
    codeFontSizeOptions() {
      return [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
    },
    // 外观设置页的代码块预览。DOM 结构必须与 vue_methods.js 中 highlight() 输出一致，
    // 才能继承 .code-block 上的 zoom / 主题 / 高亮样式。
    codeBlockPreviewHtml() {
      const sample =
`function greet(name) {
  const message = \`Hello, \${name}!\`;
  console.log(message);
  return message;
}

greet('Super Agent Party');`;
      const escape = s => s.replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c]);
      try {
        const highlighted = window.hljs
          ? window.hljs.highlight(sample, { language: 'javascript' }).value
          : escape(sample);
        return `<pre class="code-block"><div class="code-header"><span class="code-lang">javascript</span></div><div class="code-content"><code class="hljs language-javascript">${highlighted}</code></div></pre>`;
      } catch (e) {
        return `<pre class="code-block"><div class="code-header"><span class="code-lang">text</span></div><div class="code-content"><code class="hljs">${escape(sample)}</code></div></pre>`;
      }
    },
    hasAgentChanges() {
      return this.mainAgent !== 'super-model' || 
        Object.values(this.agents).some(a => a.enabled)
    },
    // 获取所有唯一的语言
    uniqueLanguages() {
      const languages = [...new Set(this.edgettsvoices.map(voice => voice.language))];
      return languages.sort();
    },
    
    // 根据选择的语言获取可用的性别
    uniqueGenders() {
      const voicesForLanguage = this.edgettsvoices.filter(voice => 
        voice.language === this.edgettsLanguage
      );
      const genders = [...new Set(voicesForLanguage.map(voice => voice.gender))];
      return genders.sort();
    },
    
    // 根据选择的语言和性别过滤语音
    filteredVoices() {
      return this.edgettsvoices.filter(voice => 
        voice.language === this.edgettsLanguage && 
        voice.gender === this.edgettsGender
      );
    },
    uniqueNewLanguages() {
      const languages = [...new Set(this.edgettsvoices.map(voice => voice.language))];
      return languages.sort();
    },
    uniqueNewGenders() {
      const voicesForLanguage = this.edgettsvoices.filter(voice => 
        voice.language === this.newTTSConfig.edgettsLanguage
      );
      const genders = [...new Set(voicesForLanguage.map(voice => voice.gender))];
      return genders.sort();
    },
    filteredNewVoices() {
      return this.edgettsvoices.filter(voice => 
        voice.language === this.newTTSConfig.edgettsLanguage && 
        voice.gender === this.newTTSConfig.edgettsGender
      );
    },
    selectedVendor() {
      return this.modelProviders.find(
        p => p.id === this.settings.selectedProvider
      );
    },
    currentTab() {
        return this.browserTabs.find(t => t.id === this.currentTabId);
    },
    allItems() {
      // 1. 文档类
      const filesWithType = (this.files || []).map(f => ({
        ...f,
        uiCategory: 'file' // 改个名字，避免跟 file.type 冲突
      }));

      // 2. 视觉类（包含图片和视频）
      const visualsWithType = (this.images || []).map(img => ({
        ...img,
        uiCategory: 'image' 
      }));

      return [...filesWithType, ...visualsWithType];
    },
    hasAttachments() {
      return this.allItems && this.allItems.length > 0;
    },
  },
  methods: {
    ...vue_methods,
  },
directives: {
    morph: {
      mounted(el, binding, vnode) {
        const vm = binding.instance; 
        el._update = (content) => {
           // 1. 解析 Markdown
          const html = vm.formatMessage(content, -1);
          const wrapper = document.createElement('div');
          wrapper.innerHTML = html;
           
           // 2. 更新真实 DOM
           morphdom(el, wrapper, { 
               childrenOnly: true,
               onBeforeElUpdated: (fromEl, toEl) => {
                   const tag = fromEl.tagName || '';
                   if (tag.startsWith('MJX-') || fromEl.classList.contains('MathJax')) return false;
                   if (fromEl.tagName === 'PRE' && fromEl.isEqualNode(toEl)) return false;
                   return true;
               }
           });
           
            // 🌟 【核心修复点】直接调用，不加 requestAnimationFrame，让 scrollToBottom 自带的 setTimeout 去处理时序
            if (vm && typeof vm.scrollToBottom === 'function') {
                vm.scrollToBottom();
            }
        };
        el._update(binding.value);
      },
      updated(el, binding) {
        if (binding.value !== binding.oldValue) {
           el._update(binding.value);
        }
      }
    }
},
  created() {
      if (this.browserTabs.length > 0) {
          this.currentTabId = this.browserTabs[0].id;
      }
      this.scrollInterval = null;
  },
});

// FontAwesome 图标映射
const NOTIFICATION_ICONS = {
    success: 'fa-solid fa-circle-check',
    error: 'fa-solid fa-circle-xmark',
    warning: 'fa-solid fa-triangle-exclamation',
    info: 'fa-solid fa-circle-info'
};

let notificationTimeout;

// 在全局作用域声明，用于保存当前活跃的所有通知实例
const activeNotifications = [];

function showNotification(message, type = 'success', title = '') {
    const iconClass = NOTIFICATION_ICONS[type] || NOTIFICATION_ICONS.info;
    const duration = (type === 'error' || type === 'warning') ? 5000 : 3000;

    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    
    notification.innerHTML = `
        <div class="notif-icon-box">
            <i class="${iconClass}"></i>
        </div>
        <div class="notif-content">
            ${title ? `<div class="notif-title">${title}</div>` : ''}
            <div class="notif-desc" style="${!title ? 'color: var(--el-text-color-primary);' : ''}">${message}</div>
        </div>
        <div class="notif-progress" style="transition-duration: ${duration}ms"></div>
    `;

    document.body.appendChild(notification);
    
    // 动态判断基础 Top 距离（适配你的 CSS 移动端 16px，桌面端 24px）
    const isMobile = window.innerWidth <= 768;
    const BASE_TOP = isMobile ? 16 : 24;
    const GAP = 16; // 每个通知之间的间距
    
    // 强制重绘，确保此时能获取到元素真实渲染的高度
    void notification.offsetWidth;
    
    // 1. 计算当前这条通知应该在的位置 (之前所有通知高度累加)
    let currentTop = BASE_TOP;
    activeNotifications.forEach(n => {
        currentTop += n.offsetHeight + GAP;
    });
    
    // 设置 inline style
    notification.style.top = currentTop + 'px';
    // 加入到活跃队列中
    activeNotifications.push(notification);

    requestAnimationFrame(() => {
        notification.classList.add('show');
    });

    let timer = null;

    // 封装关闭逻辑
    const closeNotification = () => {
        const index = activeNotifications.indexOf(notification);
        if (index === -1) return; // 防止重复触发

        // 1. 从队列中移除当前通知
        activeNotifications.splice(index, 1);
        
        // 2. 触发离场动画
        notification.classList.remove('show');
        notification.classList.add('hide');
        
        // 3. 核心：重新计算剩余通知的位置，触发丝滑上移接替
        let newTop = BASE_TOP;
        activeNotifications.forEach(n => {
            n.style.top = newTop + 'px';
            newTop += n.offsetHeight + GAP;
        });

        // 4. 动画结束后移除 DOM
        setTimeout(() => {
            if (notification.parentNode) notification.remove();
        }, 400); 
    };

    // 附加功能：允许用户直接点击弹窗提前关闭它
    notification.addEventListener('click', () => {
        clearTimeout(timer);
        closeNotification();
    });

    // 设定定时器自动关闭
    timer = setTimeout(closeNotification, duration);
}

// 兼容旧代码调用方式 (如果你的代码里只传了 message)
// showNotification("保存成功"); -> 默认为 success
// showNotification("保存失败", "error");
function removeNonAsciiTags(html) {
  // 匹配所有标签（包括开始标签和结束标签）
  // 例如：<旁白> 和 </旁白>
  const regex = /<\/?([^\s>]+)[^>]*>/g;
  
  return html.replace(regex, (match, tagName) => {
    // 检查标签名是否包含非 ASCII 字符
    const hasNonAscii = [...tagName].some(char => char.charCodeAt(0) > 127);
    
    // 如果标签名包含非 ASCII 字符，删除标签（但保留内容）
    if (hasNonAscii) {
      return '';
    }
    
    // 否则，保留标签
    return match;
  });
}

// 修改图标注册方式（完整示例）
app.use(ElementPlus);

// ==========================================
// ★ 修改点：注册 A2UI 组件
// ==========================================
app.component('a2-u-i-renderer', A2UIRendererComponent);

// 正确注册所有图标（一次性循环注册）
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}

// 快捷指令弹出菜单组件（输入框 / 开头时的抽屉式菜单）
app.component('shortcut-menu', {
  props: {
    items: { type: Array, default: () => [] },
    index: { type: Number, default: 0 }
  },
  emits: ['select', 'hover'],
  template: `
    <div class="shortcut-menu">
      <div v-for="(item, i) in items" :key="item.key"
           class="shortcut-menu-item" :class="{ active: i === index }"
           @mousedown.prevent="$emit('select', item)"
           @mouseenter="$emit('hover', i)">
        <span class="shortcut-menu-cmd">{{ item.label }}</span>
        <span v-if="item.aliases && item.aliases.length" class="shortcut-menu-alias">{{ item.aliases.join('  ') }}</span>
        <span class="shortcut-menu-desc">{{ item.desc }}</span>
      </div>
    </div>
  `
});

// 挂载应用
app.mount('#app');
