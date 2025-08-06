import OpenAI from "openai";
import fs from "fs";

// Lazy initialization - don't create the OpenAI instance until we need it
let openaiInstance: OpenAI | null = null;

// Get API key with multiple fallback options
const getApiKey = () => {
  const key = process.env.OPENAI_API_KEY || 
              process.env.OPENROUTER_API_KEY || 
              process.env.OPENAI_API_KEY_ENV_VAR;
  
  if (!key) {
    console.error("Environment variables available:", Object.keys(process.env).filter(k => k.includes('API')));
    throw new Error("No API key found. Please check your .env file contains OPENAI_API_KEY");
  }
  
  return key;
};

// Get OpenAI instance (lazy initialization)
const getOpenAI = () => {
  if (!openaiInstance) {
    console.log("Initializing OpenAI client...");
    console.log("OPENAI_API_KEY exists:", !!process.env.OPENAI_API_KEY);
    console.log("OPENAI_API_KEY length:", process.env.OPENAI_API_KEY?.length || 0);
    
    const apiKey = getApiKey();
    console.log("Using API key (first 10 chars):", apiKey.substring(0, 10));
    
    // Configure for OpenRouter.ai
    openaiInstance = new OpenAI({
      apiKey: apiKey,
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: {
        "HTTP-Referer": "https://your-site.com", // Replace with your actual site
        "X-Title": "Jarvis Voice Assistant",
      }
    });
  }
  
  return openaiInstance;
};

export async function transcribeAudio(audioFilePath: string): Promise<{ text: string }> {
  try {
    const openai = getOpenAI();
    
    // OpenRouter might not support Whisper transcription directly
    // Let's try first, if it fails, we'll use browser speech recognition as fallback
    try {
      const audioReadStream = fs.createReadStream(audioFilePath);

      const transcription = await openai.audio.transcriptions.create({
        file: audioReadStream,
        model: "whisper-1",
      });

      return {
        text: transcription.text,
      };
    } catch (whisperError) {
      console.log("Whisper transcription not available via OpenRouter, using fallback");
      // For now, return a message indicating client-side transcription should be used
      throw new Error("TRANSCRIPTION_NOT_AVAILABLE_USE_CLIENT_SIDE");
    }
  } catch (error) {
    throw new Error("Failed to transcribe audio: " + (error as Error).message);
  }
}

export async function processWithGPT4(
  message: string, 
  conversationHistory: Array<{role: string, content: string}> = [],
  imageData?: string // Base64 encoded image for multimodal input
): Promise<{ message: string, action?: string, data?: any }> {
  try {
    const openai = getOpenAI();

    const systemPrompt = `You are Jarvis, an advanced AI voice assistant with comprehensive capabilities. You can help with:

CORE FUNCTIONS:
- Weather information (action: "weather", include location if provided)
- News updates (action: "news", specify category if mentioned)
- Setting reminders (action: "reminder", parse natural language time/date)
- Email sending (action: "email", extract recipient and content)
- Document processing (action: "document", for summarization/analysis)
- Music control (action: "music", for playback requests)
- General conversation and knowledge queries
- Image analysis (when images are provided)

ADVANCED CAPABILITIES:
- Natural language understanding for complex requests
- Context awareness across conversation history
- Multimodal processing (text, voice, images)
- Personal assistant tasks (scheduling, reminders, emails)
- Real-time information retrieval
- Document summarization and analysis

CRITICAL: You MUST respond with valid JSON only. No other text outside the JSON structure.

RESPONSE FORMAT (REQUIRED):
{
  "message": "your response here", 
  "action": "none|weather|news|reminder|email|document|music",
  "data": {}
}

Example responses:
- For weather: {"message": "I'll get the weather for you.", "action": "weather", "data": {"location": "New York"}}
- For general chat: {"message": "Hello! How can I help you today?", "action": "none", "data": {}}
- For news: {"message": "Here are the latest headlines.", "action": "news", "data": {"category": "general"}}
- For music: {"message": "I'll play some music for you.", "action": "music", "data": {"query": "ambient music"}}

ALWAYS respond with JSON only. Be helpful and conversational in the message field.`;

    const messages = [
      { role: "system", content: systemPrompt },
      ...conversationHistory.slice(-15), // Keep more context for better conversations
      { 
        role: "user", 
        content: imageData ? [
          { type: "text", text: message },
          { 
            type: "image_url", 
            image_url: { url: `data:image/jpeg;base64,${imageData}` }
          }
        ] : message
      }
    ];

    console.log("Making request to OpenRouter API...");

    // Using free DeepSeek R1 model - completely free with excellent performance
    const response = await openai.chat.completions.create({
      model: "deepseek/deepseek-r1",
      messages: messages as any,
      max_tokens: 800, // Can use more tokens since it's free
      temperature: 0.7,
    });

    console.log("Received response from OpenRouter API");

    const content = response.choices[0].message.content || '';
    
    // Try to parse JSON, but handle cases where the model doesn't return valid JSON
    let result;
    try {
      result = JSON.parse(content);
    } catch (parseError) {
      console.log("JSON parsing failed, raw content:", content);
      
      // Try to extract JSON from the content if it's wrapped
      let cleanContent = content.replace(/```json|```/g, '').trim();
      
      // Try to find JSON in the content
      const jsonMatch = cleanContent.match(/\{.*\}/s);
      if (jsonMatch) {
        try {
          result = JSON.parse(jsonMatch[0]);
        } catch (thirdError) {
          result = {
            message: content.substring(0, 200) || "I encountered an error processing your request.",
            action: "none",
            data: {}
          };
        }
      } else {
        // If no JSON found, use the content as the message
        result = {
          message: content.substring(0, 200) || "I encountered an error processing your request.",
          action: "none",
          data: {}
        };
      }
    }

    return {
      message: result.message || content || "I apologize, but I encountered an error processing your request.",
      action: result.action || "none",
      data: result.data || {},
    };
  } catch (error) {
    console.error("OpenAI API Error:", error);
    
    // Check if it's an authentication error
    if ((error as any)?.status === 401) {
      throw new Error("Authentication failed. Please check your API key in the .env file.");
    }
    
    throw new Error("Failed to process with GPT-4: " + (error as Error).message);
  }
}

export async function analyzeImage(base64Image: string, query?: string): Promise<string> {
  try {
    const openai = getOpenAI();

    const prompt = query || "Analyze this image in detail. Describe what you see, identify key elements, and provide any relevant insights.";
    
    // Using free DeepSeek R1 model for image analysis
    const response = await openai.chat.completions.create({
      model: "deepseek/deepseek-r1",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { 
              type: "image_url", 
              image_url: { url: `data:image/jpeg;base64,${base64Image}` }
            }
          ],
        },
      ],
      max_tokens: 500,
    });

    return response.choices[0].message.content || "Unable to analyze the image.";
  } catch (error) {
    console.error("Image analysis error:", error);
    
    if ((error as any)?.status === 401) {
      throw new Error("Authentication failed. Please check your API key in the .env file.");
    }
    
    throw new Error("Failed to analyze image: " + (error as Error).message);
  }
}