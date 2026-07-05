window.vendorSuggestedParams = {
  'Deepseek': [{ name: 'thinking', type: 'json', default: '{"type":"disabled"}', desc: 'vendorParamDesc_deepseek_thinking' }],
  'ZhipuAI': [{ name: 'thinking', type: 'json', default: '{"type":"disabled"}', desc: 'vendorParamDesc_zhipuai_thinking' }],
  'Volcano': [{ name: 'thinking', type: 'json', default: '{"type":"disabled"}', desc: 'vendorParamDesc_volcano_thinking' }],
  'lingyi': [{ name: 'thinking', type: 'json', default: '{"type":"disabled"}', desc: 'vendorParamDesc_lingyi_thinking' }],

  'aliyun': [
    { name: 'enable_thinking', type: 'boolean', default: true, desc: 'vendorParamDesc_aliyun_enable_thinking' },
    { name: 'thinking_budget', type: 'integer', default: 4096, desc: 'vendorParamDesc_aliyun_thinking_budget' }
  ],
  'siliconflow': [
    { name: 'enable_thinking', type: 'boolean', default: true, desc: 'vendorParamDesc_siliconflow_enable_thinking' },
    { name: 'thinking_budget', type: 'integer', default: 4096, desc: 'vendorParamDesc_siliconflow_thinking_budget' }
  ],
  'moonshot': [
    { name: 'enable_thinking', type: 'boolean', default: true, desc: 'vendorParamDesc_moonshot_enable_thinking' },
    { name: 'thinking_budget', type: 'integer', default: 4096, desc: 'vendorParamDesc_moonshot_thinking_budget' }
  ],
  'qianfan': [{ name: 'enable_thinking', type: 'boolean', default: true, desc: 'vendorParamDesc_qianfan_enable_thinking' }],
  'hunyuan': [{ name: 'enable_thinking', type: 'boolean', default: true, desc: 'vendorParamDesc_hunyuan_enable_thinking' }],
  'baichuan': [{ name: 'enable_thinking', type: 'boolean', default: true, desc: 'vendorParamDesc_baichuan_enable_thinking' }],
  'stepfun': [{ name: 'enable_thinking', type: 'boolean', default: true, desc: 'vendorParamDesc_stepfun_enable_thinking' }],
  'minimax': [{ name: 'enable_thinking', type: 'boolean', default: true, desc: 'vendorParamDesc_minimax_enable_thinking' }],

  'Ollama': [
    { name: 'repeat_penalty', type: 'float', default: 1.1, desc: 'vendorParamDesc_ollama_repeat_penalty' },
    { name: 'top_k', type: 'integer', default: 40, desc: 'vendorParamDesc_ollama_top_k' },
    { name: 'mirostat', type: 'integer', default: 0, desc: 'vendorParamDesc_ollama_mirostat' },
    { name: 'num_ctx', type: 'integer', default: 2048, desc: 'vendorParamDesc_ollama_num_ctx' }
  ],
  'Vllm': [
    { name: 'top_k', type: 'integer', default: -1, desc: 'vendorParamDesc_vllm_top_k' },
    { name: 'min_p', type: 'float', default: 0.0, desc: 'vendorParamDesc_vllm_min_p' },
    { name: 'repetition_penalty', type: 'float', default: 1.0, desc: 'vendorParamDesc_vllm_repetition_penalty' },
    { name: 'chat_template_kwargs', type: 'json', default: '{"enable_thinking":true}', desc: 'vendorParamDesc_vllm_chat_template_kwargs' }
  ],
  'SGLang': [
    { name: 'top_k', type: 'integer', default: -1, desc: 'vendorParamDesc_sglang_top_k' },
    { name: 'min_p', type: 'float', default: 0.0, desc: 'vendorParamDesc_sglang_min_p' },
    { name: 'repetition_penalty', type: 'float', default: 1.0, desc: 'vendorParamDesc_sglang_repetition_penalty' }
  ],
  'llama.cpp': [
    { name: 'repeat_penalty', type: 'float', default: 1.1, desc: 'vendorParamDesc_llama_cpp_repeat_penalty' },
    { name: 'top_k', type: 'integer', default: 40, desc: 'vendorParamDesc_llama_cpp_top_k' },
    { name: 'mirostat', type: 'integer', default: 0, desc: 'vendorParamDesc_llama_cpp_mirostat' }
  ],
  'LMstudio': [
    { name: 'top_k', type: 'integer', default: -1, desc: 'vendorParamDesc_lmstudio_top_k' },
    { name: 'min_p', type: 'float', default: 0.0, desc: 'vendorParamDesc_lmstudio_min_p' }
  ],
  'xinference': [
    { name: 'top_k', type: 'integer', default: -1, desc: 'vendorParamDesc_xinference_top_k' },
    { name: 'repetition_penalty', type: 'float', default: 1.0, desc: 'vendorParamDesc_xinference_repetition_penalty' }
  ],
  'LocalAI': [
    { name: 'top_k', type: 'integer', default: -1, desc: 'vendorParamDesc_localai_top_k' },
    { name: 'min_p', type: 'float', default: 0.0, desc: 'vendorParamDesc_localai_min_p' }
  ],

  'openrouter': [
    { name: 'reasoning', type: 'json', default: '{"effort":"high"}', desc: 'vendorParamDesc_openrouter_reasoning' },
    { name: 'top_k', type: 'integer', default: 0, desc: 'vendorParamDesc_openrouter_top_k' }
  ],
  'perplexity': [
    { name: 'search_domain_filter', type: 'json', default: '[]', desc: 'vendorParamDesc_perplexity_search_domain_filter' },
    { name: 'search_recency_filter', type: 'string', default: '', desc: 'vendorParamDesc_perplexity_search_recency_filter' }
  ],
  'Gemini': [
    { name: 'google', type: 'json', default: '{"thinking_config":{"thinking_level":"low","include_thoughts":true}}', desc: 'vendorParamDesc_gemini_google' }
  ]
};
