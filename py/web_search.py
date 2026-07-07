import asyncio
import json
import os
import time
from bs4 import BeautifulSoup
import requests
from py.get_setting import load_settings
from py.load_files import check_robots_txt

async def DDGsearch(query):
    from langchain_community.tools import DuckDuckGoSearchResults
    settings = await load_settings()
    def sync_search():
        max_results = settings['webSearch']['duckduckgo_max_results'] or 10
        try:
            dds = DuckDuckGoSearchResults(num_results=max_results,output_format="json")
            results = dds.invoke(query)
            return results
        except Exception as e:
            print(f"An error occurred: {e}")
            return ""

    try:
        # 使用默认executor在单独线程中执行同步操作
        return await asyncio.get_event_loop().run_in_executor(None, sync_search)
    except Exception as e:
        print(f"Event loop error: {e}")
        return ""
    
duckduckgo_tool = {
    "type": "function",
    "function": {
        "name": "DDGsearch",
        "description": f"通过关键词获得DuckDuckGo搜索上的信息。",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "需要搜索的关键词，可以是多个词语，多个词语之间用空格隔开。",
                },
            },
            "required": ["query"],
        },
    },
}

async def searxng(query,categories="general"):
    settings = await load_settings()
    def sync_search(query):
        max_results = settings['webSearch']['searxng_max_results'] or 10
        api_url = settings['webSearch']['searxng_url'] or "http://127.0.0.1:8080"
        engines = settings['webSearch']['searxng_engines'] or None
        is_select = settings['webSearch']['searxng_is_select'] or False
        headers = {"User-Agent": "Mozilla/5.0"}
        params = {
            "q": query, 
            "categories": categories,
            "count": max_results
        }
        if engines and is_select:
            params["engines"] = engines

        try:
            response = requests.get(api_url + "/search", headers=headers, params=params)
            html_content = response.text

            soup = BeautifulSoup(html_content, 'html.parser')
            results = []

            for result in soup.find_all('article', class_='result'):
                title = result.find('h3').get_text() if result.find('h3') else 'No title'
                
                # 修复：使用正确的选择器
                link_elem = result.find('a', class_='url_header')
                if not link_elem:
                    # 备用方案：从h3内的链接获取
                    h3 = result.find('h3')
                    link_elem = h3.find('a') if h3 else None
                
                link = link_elem['href'] if link_elem and link_elem.get('href') else 'No link'
                
                snippet = result.find('p', class_='content').get_text() if result.find('p', class_='content') else 'No snippet'
                
                results.append({
                    'title': title,
                    'link': link,
                    'snippet': snippet
                })

            return json.dumps(results, indent=2, ensure_ascii=False)
            
        except Exception as e:
            print(f"Search error: {e}")
            return f"Search error: {e}"

    try:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, sync_search, query)
    except Exception as e:
        print(f"Async error: {e}")
        return f"Async error: {e}"

searxng_tool = {
    "type": "function",
    "function": {
        "name": "searxng",
        "description": "通过SearXNG开源元搜索引擎获取网络信息。",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "搜索关键词，支持自然语言和多关键词组合查询",
                },
                "categories": {
                    "type": "string",
                    "description": "搜索类别，请根据用户意图选择最合适的分类。可选值：'general'(综合/默认，适合大部分百科与常识查询), 'news'(新闻，适合搜近期发生的事件), 'images'(图片，适合找图), 'videos'(视频，适合找视频资源), 'it'(IT技术，适合搜代码报错、编程开发相关), 'science'(科学，适合搜学术论文与科学资料)。",
                    "enum": ["general", "news", "images", "videos", "it", "science"],
                    "default": "general"
                },
            },
            "required": ["query"],
        },
    },
}

async def bochaai_search(query):
    settings = await load_settings()
    def sync_search():
        max_results = settings['webSearch']['bochaai_max_results'] or 10
        api_key = settings['webSearch'].get('bochaai_api_key', "")
        
        if not api_key:
            return "API key未配置"

        url = "https://api.bochaai.com/v1/web-search"
        headers = {
            'Authorization': f'Bearer {api_key}',
            'Content-Type': 'application/json'
        }
        payload = json.dumps({
            "query": query,
            "summary": True,
            "count": max_results
        })

        try:
            response = requests.post(url, headers=headers, data=payload, timeout=30)
            if response.status_code == 200:
                result_data = response.json()
                
                # 解析新版API返回格式
                formatted_results = []
                search_results = result_data.get('data', {}).get('webPages', {}).get('value', [])
                
                for item in search_results:
                    # 构建更丰富的结果信息
                    formatted_item = {
                        'title': item.get('name', '无标题'),
                        'link': item.get('url', ''),
                        'displayUrl': item.get('displayUrl', ''),
                        'snippet': item.get('snippet', '无内容摘要'),
                        'siteName': item.get('siteName', '未知来源'),
                    }
                    # 自动生成简洁的来源名称
                    if not formatted_item['siteName']:
                        formatted_item['siteName'] = formatted_item['displayUrl'].split('//')[-1].split('/')[0]
                    formatted_results.append(formatted_item)
                
                return json.dumps(formatted_results, indent=2, ensure_ascii=False)
            else:
                return f"请求失败，状态码：{response.status_code}，响应内容：{response.text}"
        except Exception as e:
            print(f"博查得搜索错误: {str(e)}")
            return ""

    try:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, sync_search)
    except Exception as e:
        print(f"异步执行错误: {e}")
        return ""

bochaai_tool = {
    "type": "function",
    "function": {
        "name": "bochaai_search",
        "description": "通过博查得智能搜索API获取网络信息，支持深度语义理解。",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "需要搜索的自然语言查询语句，支持复杂语义和长句（示例：阿里巴巴最新财报要点）",
                }
            },
            "required": ["query"],
        },
    }
}

async def Tavily_search(query):
    from tavily import TavilyClient
    settings = await load_settings()
    def sync_search():
        max_results = settings['webSearch']['tavily_max_results'] or 10
        try:
            api_key = settings['webSearch'].get('tavily_api_key', "")
            client = TavilyClient(api_key)
            response = client.search(
                query=query,
                max_results=max_results
            )
            return json.dumps(response, indent=2, ensure_ascii=False)
        except Exception as e:
            print(f"Tavily search error: {e}")
            return ""

    try:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, sync_search)
    except Exception as e:
        print(f"Async execution error: {e}")
        return ""

tavily_tool = {
    "type": "function",
    "function": {
        "name": "Tavily_search",
        "description": "通过Tavily专业搜索API获取高质量的网络信息，特别适合获取实时数据和专业分析。",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "需要搜索的关键词或自然语言查询语句",
                }
            },
            "required": ["query"],
        },
    },
}
from langchain_google_community import GoogleSearchAPIWrapper

async def Google_search(query):
    settings = await load_settings()
    def sync_search():
        max_results = settings['webSearch']['google_max_results'] or 10
        try:
            api_key = settings['webSearch'].get('google_api_key', "")
            google_cse_id = settings['webSearch'].get('google_cse_id', "")
            client = GoogleSearchAPIWrapper(google_api_key=api_key,google_cse_id=google_cse_id)
            response = client.results(query=query,num_results=max_results)
            return json.dumps(response, indent=2, ensure_ascii=False)
        except Exception as e:
            print(f"Google search error: {e}")
            return ""

    try:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, sync_search)
    except Exception as e:
        print(f"Async execution error: {e}")
        return ""


google_tool = {
    "type": "function",
    "function": {
        "name": "Google_search",
        "description": "通过Google搜索API获取网络信息。",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "需要搜索的关键词或自然语言查询语句",
                }
            },
            "required": ["query"],
        }
    }
}

from langchain_community.tools import BraveSearch

async def Brave_search(query):
    settings = await load_settings()
    def sync_search():
        max_results = settings['webSearch']['brave_max_results'] or 10
        try:
            api_key = settings['webSearch'].get('brave_api_key', "")
            client = BraveSearch.from_api_key(api_key=api_key, search_kwargs={"count": max_results})
            response = client.run(query)
            return response
        except Exception as e:
            print(f"Brave search error: {e}")
            return ""

    try:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, sync_search)
    except Exception as e:
        print(f"Async execution error: {e}")
        return ""
    
brave_tool = {
    "type": "function",
    "function": {
        "name": "Brave_search",
        "description": "通过Brave搜索API获取网络信息。",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "需要搜索的关键词或自然语言查询语句",
                }
            },
            "required": ["query"],
        },
    }
}

from langchain_exa import ExaSearchResults
async def Exa_search(query):
    settings = await load_settings()
    def sync_search():
        max_results = settings['webSearch']['exa_max_results'] or 10
        try:
            api_key = settings['webSearch'].get('exa_api_key', "")
            client = ExaSearchResults(exa_api_key=api_key)
            response = client._run(
                query=query,
                num_results=max_results,
            )
            # 判断repose的类型
            if type(response) == list or type(response) == dict:
                return json.dumps(response, indent=2, ensure_ascii=False)
            elif type(response) == str:
                return response
        except Exception as e:
            print(f"Exa search error: {e}")
            return ""

    try:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, sync_search)
    except Exception as e:
        print(f"Async execution error: {e}")
        return ""

exa_tool = {
    "type": "function", 
    "function": {
        "name": "Exa_search",
        "description": "通过Exa搜索API获取网络信息。",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "需要搜索的关键词或自然语言查询语句",
                }
            },
            "required": ["query"],
            }
    }
}

from langchain_community.utilities import GoogleSerperAPIWrapper

async def Serper_search(query):
    settings = await load_settings()
    def sync_search():
        max_results = settings['webSearch']['serper_max_results'] or 10
        try:
            api_key = settings['webSearch'].get('serper_api_key', "")
            client = GoogleSerperAPIWrapper(serper_api_key=api_key,k=max_results)
            response = client.results(query)
            return json.dumps(response, indent=2, ensure_ascii=False)
        except Exception as e:
            print(f"Serper search error: {e}")
            return ""

    try:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, sync_search)
    except Exception as e:
        print(f"Async execution error: {e}")
        return ""
    
serper_tool = {
    "type": "function",
    "function": {
        "name": "Serper_search",
        "description": "通过Serper搜索API获取网络信息。",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "需要搜索的关键词或自然语言查询语句",
                }
            },
            "required": ["query"],
        },
    }
}

async def jina_crawler(original_url):
    settings = await load_settings()
    jina_api_key = settings['webSearch'].get('jina_api_key', "")
    if os.environ.get("IS_STEAM_BUILD", "0") == "1" and not jina_api_key.strip():
        return "Jina API Key 未配置。请在设置中填入你的 Jina API Key。Jina API Key is required in this build."
    def sync_crawler():
        detail_url = "https://r.jina.ai/"
        url = f"{detail_url}{original_url}"
        try:
            jina_api_key = settings['webSearch'].get('jina_api_key', "")
            if jina_api_key:
                headers = {
                    'Authorization': f'Bearer {jina_api_key}',
                }
                response = requests.get(url, headers=headers)
            else:
                response = requests.get(url)
            if response.status_code == 200:
                return response.text
            else:
                return f"获取{original_url}网页信息失败，状态码：{response.status_code}"
        except requests.RequestException as e:
            return f"获取{original_url}网页信息失败，错误信息：{str(e)}"

    try:
        if not await check_robots_txt(original_url):
            raise PermissionError(f"合规拒绝: 目标网站禁止抓取")
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, sync_crawler)
    except Exception as e:
        print(f"Async execution error: {e}")
        return str(e)

jina_crawler_tool = {
    "type": "function",
    "function": {
        "name": "jina_crawler",
        "description": "通过Jina AI的网页爬取API获取指定URL的网页内容。指定URL可以为其他搜索引擎搜索出来的网页链接，也可以是用户给出的网站链接。但不要将本机地址或内网地址开头的URL作为参数传入，因为jina将无法访问到这些URL。",
        "parameters": {
            "type": "object",
            "properties": {
                "original_url": {
                    "type": "string",
                    "description": "需要爬取的原始URL地址。",
                },
            },
            "required": ["original_url"],
        },
    },
}

class Crawl4AiTester:
    def __init__(self, base_url: str = "http://localhost:11235"):
        self.base_url = base_url

    def submit_and_wait(self, request_data: dict,headers: dict = None, timeout: int = 300) -> dict:
        # Submit crawl job
        response = requests.post(f"{self.base_url}/crawl", json=request_data,headers=headers)
        task_id = response.json()["task_id"]
        print(f"Task ID: {task_id}")

        # Poll for result
        start_time = time.time()
        while True:
            if time.time() - start_time > timeout:
                raise TimeoutError(f"Task {task_id} timeout")

            result = requests.get(f"{self.base_url}/task/{task_id}",headers=headers)
            status = result.json()

            if status["status"] == "completed":
                return status

            time.sleep(2)

async def Crawl4Ai_search(original_url):
    settings = await load_settings()
    def sync_search():
        try:
            tester = Crawl4AiTester()
            api_key = settings['webSearch'].get('Crawl4Ai_api_key', "test_api_code")
            headers = {"Authorization": f"Bearer {api_key}"} if api_key else None
            request = {
                "urls": original_url,
                "priority": 10
            }
            result = tester.submit_and_wait(request, headers=headers)
            return result['result']['markdown']
        except Exception as e:
            return f"获取{original_url}网页信息失败，错误信息：{str(e)}"

    try:
        if not await check_robots_txt(original_url):
            raise PermissionError(f"合规拒绝: 目标网站禁止抓取")
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, sync_search)
    except Exception as e:
        print(f"Async execution error: {e}")
        return str(e)

Crawl4Ai_tool = {
    "type": "function",
    "function": {
        "name": "Crawl4Ai_search",
        "description": "通过Crawl4Ai服务爬取指定URL的网页内容，返回Markdown格式的文本。",
        "parameters": {
            "type": "object",
            "properties": {
                "original_url": {
                    "type": "string",
                    "description": "需要爬取的目标URL地址。",
                }
            },
            "required": ["original_url"],
        },
    },
}

from typing import Optional, Dict, Any

# ============== 2. Firecrawl ==============

class FirecrawlClient:
    """
    Firecrawl API 客户端
    支持官方API和自部署实例
    """
    
    def __init__(self, base_url: str, api_key: Optional[str] = None):
        self.base_url = base_url.rstrip('/')
        self.api_key = api_key
        self.headers = {
            'Content-Type': 'application/json',
        }
        if api_key:
            self.headers['Authorization'] = f'Bearer {api_key}'
    
    def _get_api_path(self, endpoint: str) -> str:
        """根据基础URL自动判断API版本路径"""
        if '/v2/' in self.base_url:
            # 官方API v2
            return f"{self.base_url}/{endpoint}"
        elif '/v1/' in self.base_url:
            # 自部署通常是v1
            return f"{self.base_url}/{endpoint}"
        else:
            # 默认追加路径
            return f"{self.base_url}/{endpoint}"
    
    def scrape(self, url: str, formats: list = None, **kwargs) -> Dict[str, Any]:
        """
        单页面抓取 (Scrape)
        """
        formats = formats or ["markdown"]
        endpoint = self._get_api_path("scrape")
        
        payload = {
            "url": url,
            "formats": formats,
            **kwargs
        }
        
        response = requests.post(
            endpoint,
            headers=self.headers,
            json=payload,
            timeout=60
        )
        response.raise_for_status()
        return response.json()
    
    def crawl(self, url: str, limit: int = 10, **kwargs) -> str:
        """
        整站爬取 (Crawl) - 异步作业，需要轮询
        """
        # 提交爬取任务
        submit_endpoint = self._get_api_path("crawl")
        payload = {
            "url": url,
            "limit": limit,
            **kwargs
        }
        
        submit_resp = requests.post(
            submit_endpoint,
            headers=self.headers,
            json=payload,
            timeout=30
        )
        submit_resp.raise_for_status()
        job_data = submit_resp.json()
        
        if not job_data.get("success"):
            raise Exception(f"Failed to submit crawl job: {job_data}")
        
        job_id = job_data.get("id")
        check_url = job_data.get("url") or f"{self.base_url}/crawl/{job_id}"
        
        # 轮询等待完成
        max_wait = 300  # 5分钟超时
        interval = 2
        start_time = time.time()
        
        while time.time() - start_time < max_wait:
            status_resp = requests.get(
                check_url,
                headers=self.headers,
                timeout=30
            )
            status_resp.raise_for_status()
            status_data = status_resp.json()
            
            if status_data.get("status") == "completed":
                return status_data
            elif status_data.get("status") == "failed":
                raise Exception(f"Crawl job failed: {status_data.get('error', 'Unknown error')}")
            
            time.sleep(interval)
        
        raise TimeoutError(f"Crawl job {job_id} timeout after {max_wait}s")
    
    def search(self, query: str, limit: int = 5, scrape_options: dict = None) -> Dict[str, Any]:
        """
        搜索 (Search)
        """
        endpoint = self._get_api_path("search")
        
        payload = {
            "query": query,
            "limit": limit
        }
        if scrape_options:
            payload["scrapeOptions"] = scrape_options
        
        response = requests.post(
            endpoint,
            headers=self.headers,
            json=payload,
            timeout=60
        )
        response.raise_for_status()
        return response.json()
    
    def map(self, url: str, search: str = None) -> Dict[str, Any]:
        """
        网站地图 (Map)
        """
        endpoint = self._get_api_path("map")
        
        payload = {"url": url}
        if search:
            payload["search"] = search
        
        response = requests.post(
            endpoint,
            headers=self.headers,
            json=payload,
            timeout=60
        )
        response.raise_for_status()
        return response.json()


async def firecrawl_search(original_url: str, query: str = None) -> str:
    """
    Firecrawl 主函数
    支持多种模式：scrape(单页), crawl(整站), search(搜索), map(地图)
    """
    settings = await load_settings()
    
    def sync_crawler():
        try:
            # 获取配置
            base_url = settings['webSearch'].get('firecrawl_url', 'https://api.firecrawl.dev/v2')
            api_key = settings['webSearch'].get('firecrawl_api_key', '')
            mode = settings['webSearch'].get('firecrawl_mode', 'scrape')
            
            # 初始化客户端
            client = FirecrawlClient(base_url, api_key)
            
            # 根据模式执行不同操作
            if mode == 'scrape':
                # 单页抓取
                result = client.scrape(
                    original_url,
                    formats=["markdown", "html"],
                    onlyMainContent=True  # 只获取主要内容
                )
                
                if result.get("success") and result.get("data"):
                    data = result["data"]
                    markdown = data.get("markdown", "")
                    metadata = data.get("metadata", {})
                    title = metadata.get("title", "未命名页面")
                    
                    return f"# {title}\n\n{markdown}"
                else:
                    return f"Firecrawl抓取失败：{result.get('error', '未知错误')}"
            
            elif mode == 'crawl':
                # 整站爬取
                result = client.crawl(
                    original_url,
                    limit=10,  # 限制页面数避免过长
                    scrapeOptions={
                        "formats": ["markdown"],
                        "onlyMainContent": True
                    }
                )
                
                if result.get("status") == "completed":
                    pages = result.get("data", [])
                    total = result.get("total", 0)
                    
                    content_parts = [f"# 站点爬取结果\n\n共获取 {total} 个页面：\n"]
                    
                    for i, page in enumerate(pages[:5], 1):  # 最多显示5页
                        md = page.get("markdown", "")
                        meta = page.get("metadata", {})
                        title = meta.get("title", f"页面{i}")
                        url = meta.get("sourceURL", original_url)
                        
                        content_parts.append(f"\n## {title}\n{md[:2000]}...\n[来源]({url})")
                    
                    return "\n".join(content_parts)
                else:
                    return f"Firecrawl爬取失败：{result.get('error', '未知错误')}"
            
            elif mode == 'search':
                # 搜索模式 - 当传入的是查询词而非URL时
                search_query = query or original_url  # 如果没有单独提供query，将URL作为查询词
                result = client.search(
                    search_query,
                    limit=5,
                    scrape_options={"formats": ["markdown"]}
                )
                
                if result.get("success") and result.get("data"):
                    items = result["data"]
                    content_parts = [f"# 搜索结果: {search_query}\n"]
                    
                    for i, item in enumerate(items, 1):
                        title = item.get("title", "无标题")
                        url = item.get("url", "")
                        desc = item.get("description", "")
                        markdown = item.get("markdown", "")
                        
                        content_parts.append(f"\n## {i}. {title}\n{desc}\n")
                        if markdown:
                            content_parts.append(f"{markdown[:1500]}...")
                        content_parts.append(f"[来源]({url})")
                    
                    return "\n".join(content_parts)
                else:
                    return f"Firecrawl搜索失败：{result.get('error', '未知错误')}"
            
            elif mode == 'map':
                # 网站地图模式
                result = client.map(original_url)
                
                if result.get("success") and result.get("links"):
                    links = result["links"]
                    content_parts = [f"# 网站地图: {original_url}\n\n发现 {len(links)} 个链接：\n"]
                    
                    for link in links[:20]:  # 限制显示数量
                        title = link.get("title", "无标题")
                        url = link.get("url", "")
                        desc = link.get("description", "")
                        content_parts.append(f"- [{title}]({url}) - {desc}")
                    
                    return "\n".join(content_parts)
                else:
                    return f"Firecrawl地图生成失败：{result.get('error', '未知错误')}"
            
            else:
                return f"未知的Firecrawl模式: {mode}"
                
        except requests.RequestException as e:
            return f"Firecrawl请求失败：{str(e)}"
        except Exception as e:
            return f"Firecrawl处理失败：{str(e)}"

    try:
        # Firecrawl自部署版本通常不需要检查robots.txt（由服务内部处理）
        # 但官方API版本建议保留检查
        settings = await load_settings()
        base_url = settings['webSearch'].get('firecrawl_url', '')
        
        # 如果是官方API，检查robots.txt
        if 'api.firecrawl.dev' in base_url:
            if not await check_robots_txt(original_url):
                raise PermissionError(f"合规拒绝: 目标网站禁止抓取")
        
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, sync_crawler)
    except Exception as e:
        print(f"Async execution error: {e}")
        return str(e)


firecrawl_tool = {
    "type": "function",
    "function": {
        "name": "firecrawl_search",
        "description": "通过Firecrawl服务获取网页内容。支持单页抓取、整站爬取、搜索和网站地图模式。可以处理JavaScript渲染的页面，返回结构化的Markdown内容。",
        "parameters": {
            "type": "object",
            "properties": {
                "original_url": {
                    "type": "string",
                    "description": "需要处理的URL地址或搜索查询词（当模式为search时）。",
                },
                "query": {
                    "type": "string",
                    "description": "可选，当使用search模式时的具体搜索词。如果不提供，将使用original_url作为查询词。",
                }
            },
            "required": ["original_url"],
        },
    },
}

from bs4 import BeautifulSoup
import re

async def simple_fetch(url):
    """
    改进的网页抓取工具，返回结构化的清洗后内容
    支持抓取内网和外网页面
    """
    def sync_fetch():
        try:
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
            response = requests.get(url, headers=headers, timeout=30)
            if response.status_code == 200:
                return response.text
            else:
                return None, f"获取{url}网页信息失败，状态码：{response.status_code}"
        except requests.RequestException as e:
            return None, f"获取{url}网页信息失败，错误信息：{str(e)}"
    
    def clean_and_extract(html_content):
        """提取并清洗HTML内容，返回结构化数据"""
        if not html_content:
            return None
        
        soup = BeautifulSoup(html_content, 'html.parser')
        
        # 移除不需要的标签
        for tag in soup(['script', 'style', 'nav', 'footer', 'header', 'aside', 'iframe', 'noscript']):
            tag.decompose()
        
        structured_content = {
            'title': '',
            'sections': []
        }
        
        # 提取页面标题
        title_tag = soup.find('title')
        if title_tag:
            structured_content['title'] = title_tag.get_text().strip()
        
        # 提取主要内容区域（优先查找main, article, 或id/class包含content的div）
        main_content = soup.find('main') or soup.find('article') or \
                      soup.find('div', {'id': re.compile(r'content|main', re.I)}) or \
                      soup.find('div', {'class': re.compile(r'content|main|article', re.I)}) or \
                      soup.body or soup
        
        # 提取所有标题和段落
        for element in main_content.find_all(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p']):
            text = element.get_text(separator=' ', strip=True)
            
            # 清洗文本：移除多余空白
            text = re.sub(r'\s+', ' ', text).strip()
            
            # 过滤掉过短的内容（可能是噪音）
            if len(text) < 3:
                continue
            
            if element.name.startswith('h'):
                # 标题
                level = int(element.name[1])
                structured_content['sections'].append({
                    'type': 'heading',
                    'level': level,
                    'content': text
                })
            else:
                # 段落
                structured_content['sections'].append({
                    'type': 'paragraph',
                    'content': text
                })
        
        return structured_content
    
    try:
        # 检查 robots.txt 合规性
        if not await check_robots_txt(url):
            return {
                'error': 'PermissionError',
                'message': '合规拒绝: 目标网站禁止抓取'
            }
        
        loop = asyncio.get_event_loop()
        html_content = await loop.run_in_executor(None, sync_fetch)
        
        if isinstance(html_content, tuple):
            # 返回的是错误信息
            return {
                'error': 'FetchError',
                'message': html_content[1]
            }
        
        # 清洗并提取结构化内容
        structured_data = clean_and_extract(html_content)
        
        if not structured_data or not structured_data['sections']:
            return {
                'error': 'ParseError',
                'message': '无法从页面中提取有效内容'
            }
        
        return structured_data
        
    except Exception as e:
        return {
            'error': 'UnexpectedError',
            'message': str(e)
        }


# OpenAI function 定义
simple_fetch_tool = {
    "type": "function",
    "function": {
        "name": "simple_fetch",
        "description": "抓取指定URL的网页内容。支持内网和外网地址。",
        "parameters": {
            "type": "object",
            "properties": {
                "url": {
                    "type": "string",
                    "description": "需要抓取的URL地址。",
                },
            },
            "required": ["url"],
        },
    },
}

async def markdown_new(original_url):
    """
    通过 markdown.new 服务将网页转换为 Markdown 格式
    """
    
    def sync_crawler():
        # 拼接 markdown.new 的服务地址
        detail_url = "https://markdown.new/"
        url = f"{detail_url}{original_url}"
        
        try:
            # 添加一个基础的 User-Agent 防屏蔽
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
            
            # 发起请求
            response = requests.get(url, headers=headers, timeout=60)
            
            if response.status_code == 200:
                # markdown.new 默认直接返回纯文本的 markdown 内容
                return response.text
            else:
                return f"获取{original_url}网页信息失败，状态码：{response.status_code}"
                
        except requests.RequestException as e:
            return f"获取{original_url}网页信息失败，错误信息：{str(e)}"

    try:
        # 检查 robots.txt 合规性（保持与你原有逻辑一致）
        if not await check_robots_txt(original_url):
            raise PermissionError(f"合规拒绝: 目标网站禁止抓取")
            
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, sync_crawler)
    except Exception as e:
        print(f"Async execution error in markdown_new: {e}")
        return str(e)
    
markdown_new_tool = {
    "type": "function",
    "function": {
        "name": "markdown_new",
        "description": "通过 markdown.new 服务获取指定URL的网页内容，并自动转换为结构化的 Markdown 文本。此工具非常轻量高效，适用于外网链接。请勿传入本机地址或内网地址（会无法访问）。",
        "parameters": {
            "type": "object",
            "properties": {
                "original_url": {
                    "type": "string",
                    "description": "需要爬取的原始URL地址。必须是完整的 http 或 https 开头的网址。",
                },
            },
            "required": ["original_url"],
        },
    },
}

# ========== You.com Search ==========

async def youcom_search(query):
    """
    通过 You.com Search API 获取网络搜索结果。
    API文档: https://you.com/specs/openapi_search_v1.yaml
    """
    settings = await load_settings()
    def sync_search():
        max_results = settings['webSearch'].get('youcom_max_results', 10)
        api_key = settings['webSearch'].get('youcom_api_key', "")

        if not api_key:
            return "API key未配置，请检查设置中的 YDC_API_KEY"

        url = "https://ydc-index.io/v1/search"
        headers = {
            'X-API-Key': api_key,
            'Content-Type': 'application/json'
        }
        payload = json.dumps({
            "query": query,
            "count": max_results
        })

        try:
            response = requests.post(url, headers=headers, data=payload, timeout=30)
            if response.status_code == 200:
                result_data = response.json()

                formatted_results = []
                web_results = result_data.get('results', {}).get('web', [])

                for item in web_results:
                    formatted_item = {
                        'title': item.get('title', '无标题'),
                        'link': item.get('url', ''),
                        'displayUrl': item.get('url', ''),
                        'snippet': item.get('description') or (item.get('snippets', [''])[0] if item.get('snippets') else '无内容摘要'),
                        'siteName': item.get('title', '未知来源'),
                    }
                    formatted_results.append(formatted_item)

                return json.dumps(formatted_results, indent=2, ensure_ascii=False)
            elif response.status_code == 401:
                return f"You.com API key无效或已过期，状态码：{response.status_code}"
            elif response.status_code == 403:
                return f"You.com API key缺少所需权限，状态码：{response.status_code}"
            else:
                return f"请求失败，状态码：{response.status_code}，响应内容：{response.text}"
        except Exception as e:
            print(f"You.com搜索错误: {str(e)}")
            return ""

    try:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, sync_search)
    except Exception as e:
        print(f"异步执行错误: {e}")
        return ""

youcom_tool = {
    "type": "function",
    "function": {
        "name": "youcom_search",
        "description": "通过You.com Search API获取网络信息，返回带有摘要和来源的搜索结果。",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "需要搜索的关键词或自然语言查询语句。",
                },
            },
            "required": ["query"],
        },
    },
}