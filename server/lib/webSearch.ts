/**
 * Web Search Utility for Strat/Knox
 * ===================================
 * Provides a simple web search capability using DuckDuckGo HTML search.
 * Used as a fallback when the knowledge base doesn't have the answer.
 * 
 * This is NOT a full search engine — it's a lightweight scraper that
 * extracts text snippets from search results to give the LLM context.
 */

const SEARCH_TIMEOUT = 8000; // 8 seconds max

export interface SearchResult {
  title: string;
  snippet: string;
  url: string;
}

/**
 * Perform a web search and return text snippets.
 * Uses DuckDuckGo HTML (lite) version for simplicity.
 */
export async function webSearch(query: string, maxResults: number = 5): Promise<SearchResult[]> {
  try {
    const encodedQuery = encodeURIComponent(query);
    const url = `https://html.duckduckgo.com/html/?q=${encodedQuery}`;
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SEARCH_TIMEOUT);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html',
      },
      signal: controller.signal,
    });
    
    clearTimeout(timeout);
    
    if (!response.ok) {
      console.warn(`[WebSearch] HTTP ${response.status} for query: ${query}`);
      return [];
    }
    
    const html = await response.text();
    return parseSearchResults(html, maxResults);
  } catch (err: any) {
    if (err.name === 'AbortError') {
      console.warn(`[WebSearch] Timeout for query: ${query}`);
    } else {
      console.warn(`[WebSearch] Error: ${err.message}`);
    }
    return [];
  }
}

/**
 * Parse DuckDuckGo HTML search results into structured data.
 */
function parseSearchResults(html: string, maxResults: number): SearchResult[] {
  const results: SearchResult[] = [];
  
  // DuckDuckGo HTML results are in <a class="result__a"> with <a class="result__snippet">
  // Simple regex-based extraction (no DOM parser needed on server)
  const resultBlocks = html.split(/class="result\s/g);
  
  for (let i = 1; i < resultBlocks.length && results.length < maxResults; i++) {
    const block = resultBlocks[i];
    
    // Extract title from result__a
    const titleMatch = block.match(/class="result__a"[^>]*>([^<]+)</);
    const title = titleMatch ? decodeHtmlEntities(titleMatch[1].trim()) : '';
    
    // Extract URL
    const urlMatch = block.match(/href="([^"]*uddg=([^&"]+))/);
    let url = '';
    if (urlMatch && urlMatch[2]) {
      try {
        url = decodeURIComponent(urlMatch[2]);
      } catch {
        url = urlMatch[2];
      }
    }
    
    // Extract snippet
    const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);
    let snippet = '';
    if (snippetMatch) {
      snippet = decodeHtmlEntities(snippetMatch[1].replace(/<[^>]+>/g, '').trim());
    }
    
    if (title && (snippet || url)) {
      results.push({ title, snippet, url });
    }
  }
  
  return results;
}

/**
 * Decode common HTML entities.
 */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

/**
 * Format search results into a string suitable for LLM context injection.
 */
export function formatSearchResults(results: SearchResult[]): string {
  if (results.length === 0) {
    return 'No web search results found.';
  }
  
  return results.map((r, i) => 
    `[${i + 1}] ${r.title}\n${r.snippet}\nSource: ${r.url}`
  ).join('\n\n');
}
