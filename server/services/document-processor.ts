import { processWithGPT4 } from './openai';

export interface DocumentSummary {
  title: string;
  summary: string;
  keyPoints: string[];
  wordCount: number;
  readingTime: number; // in minutes
  topics: string[];
}

export interface DocumentAnalysis {
  sentiment: 'positive' | 'negative' | 'neutral';
  confidence: number;
  entities: string[];
  keywords: string[];
  categories: string[];
}

export class DocumentProcessor {
  
  async summarizeText(text: string, maxLength = 200): Promise<DocumentSummary> {
    try {
      if (!text || text.trim().length === 0) {
        throw new Error('No text provided for summarization');
      }

      const prompt = `Please analyze and summarize the following text. Provide your response in JSON format with these fields:
      - title: A descriptive title for the content
      - summary: A concise summary in ${maxLength} words or less
      - keyPoints: An array of 3-5 key points
      - topics: An array of main topics/themes
      
      Text to analyze: "${text.substring(0, 4000)}"`;

      const response = await processWithGPT4(prompt);
      
      let analysis;
      try {
        analysis = JSON.parse(response.message);
      } catch {
        // Fallback if JSON parsing fails
        analysis = {
          title: 'Document Summary',
          summary: response.message.substring(0, maxLength),
          keyPoints: ['Document analysis completed'],
          topics: ['General']
        };
      }

      const wordCount = text.split(/\s+/).length;
      const readingTime = Math.ceil(wordCount / 200); // Average reading speed

      return {
        title: analysis.title || 'Document Summary',
        summary: analysis.summary || response.message.substring(0, maxLength),
        keyPoints: analysis.keyPoints || ['Summary available'],
        wordCount,
        readingTime,
        topics: analysis.topics || ['General']
      };

    } catch (error) {
      throw new Error(`Document summarization failed: ${(error as Error).message}`);
    }
  }

  async analyzeDocument(text: string): Promise<DocumentAnalysis> {
    try {
      const prompt = `Analyze the following text and provide a JSON response with:
      - sentiment: "positive", "negative", or "neutral"
      - confidence: confidence score between 0 and 1
      - entities: array of important entities/names mentioned
      - keywords: array of key terms
      - categories: array of document categories/types
      
      Text: "${text.substring(0, 3000)}"`;

      const response = await processWithGPT4(prompt);
      
      try {
        return JSON.parse(response.message);
      } catch {
        // Fallback analysis
        return {
          sentiment: 'neutral',
          confidence: 0.7,
          entities: [],
          keywords: ['document', 'analysis'],
          categories: ['general']
        };
      }

    } catch (error) {
      throw new Error(`Document analysis failed: ${(error as Error).message}`);
    }
  }

  async extractKeyInformation(text: string, query: string): Promise<string> {
    try {
      const prompt = `Based on the following document, please answer this specific question: "${query}"
      
      Document: "${text.substring(0, 4000)}"
      
      Provide a direct, informative answer based on the document content.`;

      const response = await processWithGPT4(prompt);
      return response.message;

    } catch (error) {
      throw new Error(`Information extraction failed: ${(error as Error).message}`);
    }
  }

  async translateText(text: string, targetLanguage: string): Promise<string> {
    try {
      const prompt = `Please translate the following text to ${targetLanguage}. Provide only the translation:
      
      "${text}"`;

      const response = await processWithGPT4(prompt);
      return response.message;

    } catch (error) {
      throw new Error(`Translation failed: ${(error as Error).message}`);
    }
  }

  async processWebsiteContent(url: string): Promise<DocumentSummary> {
    try {
      // In a real implementation, you would scrape the website
      // For now, we'll return a placeholder response
      return {
        title: `Website Summary: ${url}`,
        summary: `This is a summary of content from ${url}. Website content processing would require a web scraping service.`,
        keyPoints: [
          'Website content extraction',
          'Content analysis and summarization',
          'Key information identification'
        ],
        wordCount: 100,
        readingTime: 1,
        topics: ['web content', 'analysis']
      };

    } catch (error) {
      throw new Error(`Website processing failed: ${(error as Error).message}`);
    }
  }
}

export const documentProcessor = new DocumentProcessor();