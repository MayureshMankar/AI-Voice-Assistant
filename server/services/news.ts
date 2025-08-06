export interface NewsArticle {
  title: string;
  description: string;
  url: string;
  source: string;
  publishedAt: string;
  category?: string;
}

export interface NewsResponse {
  articles: NewsArticle[];
  totalResults: number;
  status: string;
}

export async function getLatestNews(
  category: string = 'general',
  country: string = 'us',
  pageSize: number = 5
): Promise<NewsResponse> {
  try {
    const apiKey = process.env.NEWS_API_KEY || process.env.NEWSAPI_KEY;
    
    if (!apiKey) {
      // Return sample news data for demo
      return {
        articles: [
          {
            title: "Technology Advances in AI Voice Assistants",
            description: "Latest developments in artificial intelligence are revolutionizing how we interact with voice assistants.",
            url: "#",
            source: "Tech News",
            publishedAt: new Date().toISOString(),
            category: "technology"
          },
          {
            title: "Weather Patterns Show Unusual Changes",
            description: "Meteorologists report interesting weather patterns emerging across various regions.",
            url: "#",
            source: "Weather Central",
            publishedAt: new Date().toISOString(),
            category: "weather"
          },
          {
            title: "Global Economy Shows Positive Trends",
            description: "Economic indicators suggest positive growth trends in multiple sectors.",
            url: "#",
            source: "Economic Times",
            publishedAt: new Date().toISOString(),
            category: "business"
          }
        ],
        totalResults: 3,
        status: "ok"
      };
    }

    const url = `https://newsapi.org/v2/top-headlines?country=${country}&category=${category}&pageSize=${pageSize}&apiKey=${apiKey}`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`News API error: ${response.status}`);
    }

    const data = await response.json();
    
    return {
      articles: data.articles.map((article: any) => ({
        title: article.title,
        description: article.description || '',
        url: article.url,
        source: article.source.name,
        publishedAt: article.publishedAt,
        category: category
      })),
      totalResults: data.totalResults,
      status: data.status
    };
    
  } catch (error) {
    console.error('News API error:', error);
    throw new Error('Failed to fetch news: ' + (error as Error).message);
  }
}

export async function searchNews(query: string, pageSize: number = 5): Promise<NewsResponse> {
  try {
    const apiKey = process.env.NEWS_API_KEY || process.env.NEWSAPI_KEY;
    
    if (!apiKey) {
      // Return sample search results for demo
      return {
        articles: [
          {
            title: `Latest updates on ${query}`,
            description: `Recent developments and news related to ${query}.`,
            url: "#",
            source: "News Search",
            publishedAt: new Date().toISOString(),
            category: "search"
          }
        ],
        totalResults: 1,
        status: "ok"
      };
    }

    const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&pageSize=${pageSize}&sortBy=publishedAt&apiKey=${apiKey}`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`News search error: ${response.status}`);
    }

    const data = await response.json();
    
    return {
      articles: data.articles.map((article: any) => ({
        title: article.title,
        description: article.description || '',
        url: article.url,
        source: article.source.name,
        publishedAt: article.publishedAt,
        category: 'search'
      })),
      totalResults: data.totalResults,
      status: data.status
    };
    
  } catch (error) {
    console.error('News search error:', error);
    throw new Error('Failed to search news: ' + (error as Error).message);
  }
}