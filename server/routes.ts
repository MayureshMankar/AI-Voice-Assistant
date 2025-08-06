import type { Express } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import path from "path";
import fs from "fs";
import { storage } from "./storage";
import { insertConversationSchema, insertMessageSchema } from "@shared/schema";
import { transcribeAudio, processWithGPT4, analyzeImage } from "./services/openai";
import { getWeatherData } from "./services/weather";
import { getLatestNews, searchNews } from "./services/news";
import { reminderService } from "./services/reminders";
import { emailService } from "./services/email";
import { documentProcessor } from "./services/document-processor";
import { ttsService } from "./services/tts";

// Configure multer for audio file uploads
const upload = multer({ 
  dest: 'uploads/',
  fileFilter: (req, file, cb) => {
    // Accept audio files
    if (file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error('Only audio files are allowed'));
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  }
});

export async function registerRoutes(app: Express): Promise<Server> {
  // Conversations endpoints
  app.get("/api/conversations", async (req, res) => {
    try {
      const conversations = await storage.getConversations();
      res.json(conversations);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch conversations" });
    }
  });

  app.post("/api/conversations", async (req, res) => {
    try {
      const validatedData = insertConversationSchema.parse(req.body);
      const conversation = await storage.createConversation(validatedData);
      res.status(201).json(conversation);
    } catch (error) {
      res.status(400).json({ message: "Invalid conversation data" });
    }
  });

  app.get("/api/conversations/:id", async (req, res) => {
    try {
      const conversation = await storage.getConversation(req.params.id);
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }
      res.json(conversation);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch conversation" });
    }
  });

  app.delete("/api/conversations/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteConversation(req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "Conversation not found" });
      }
      res.json({ message: "Conversation deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete conversation" });
    }
  });

  // Messages endpoints
  app.get("/api/conversations/:id/messages", async (req, res) => {
    try {
      const messages = await storage.getMessagesByConversation(req.params.id);
      res.json(messages);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch messages" });
    }
  });

  app.post("/api/conversations/:id/messages", async (req, res) => {
    try {
      const messageData = insertMessageSchema.parse({
        ...req.body,
        conversationId: req.params.id,
      });
      const message = await storage.createMessage(messageData);
      res.status(201).json(message);
    } catch (error) {
      res.status(400).json({ message: "Invalid message data" });
    }
  });

  // Enhanced voice processing endpoint with multimodal support
  app.post("/api/process-voice", upload.single('audio'), async (req, res) => {
    try {
      const { conversationId, imageData, transcriptionText } = req.body;
      let transcription;

      // Handle transcription - either from server-side or client-side
      if (transcriptionText) {
        // Use client-side transcription if provided
        transcription = { text: transcriptionText };
      } else if (req.file) {
        // Try server-side transcription
        try {
          transcription = await transcribeAudio(req.file.path);
        } catch (error) {
          if ((error as Error).message.includes("TRANSCRIPTION_NOT_AVAILABLE_USE_CLIENT_SIDE")) {
            return res.status(400).json({ 
              message: "Server-side transcription not available. Please use client-side speech recognition.",
              useClientSideTranscription: true
            });
          }
          throw error;
        }
      } else {
        return res.status(400).json({ message: "No audio file or transcription text provided" });
      }
      
      // Get conversation history for context
      const messages = conversationId ? await storage.getMessagesByConversation(conversationId) : [];
      const conversationHistory = messages.map(msg => ({
        role: msg.role,
        content: msg.content
      }));

      // Process with GPT-4 (with optional image data for multimodal processing)
      const gptResponse = await processWithGPT4(transcription.text, conversationHistory, imageData);

      // Handle special actions
      let responseData = gptResponse.data;
      let audioUrl: string | undefined;

      switch (gptResponse.action) {
        case 'weather':
          try {
            const location = gptResponse.data?.location || extractLocationFromText(transcription.text);
            responseData = await getWeatherData(location);
          } catch (weatherError) {
            console.error("Weather API error:", weatherError);
          }
          break;

        case 'news':
          try {
            const category = gptResponse.data?.category || 'general';
            responseData = await getLatestNews(category);
          } catch (newsError) {
            console.error("News API error:", newsError);
          }
          break;

        case 'reminder':
          try {
            const reminderText = gptResponse.data?.reminderText || transcription.text;
            const reminderData = reminderService.parseNaturalLanguageReminder(reminderText);
            if (reminderData) {
              responseData = reminderService.createReminder(reminderData);
            }
          } catch (reminderError) {
            console.error("Reminder creation error:", reminderError);
          }
          break;

        case 'email':
          try {
            const emailData = emailService.parseEmailFromText(transcription.text);
            if (emailData) {
              responseData = await emailService.sendEmail(emailData);
            }
          } catch (emailError) {
            console.error("Email sending error:", emailError);
          }
          break;

        case 'document':
          try {
            const query = gptResponse.data?.documentQuery || transcription.text;
            // This would process document content if provided
            responseData = { message: "Document processing initiated", query };
          } catch (docError) {
            console.error("Document processing error:", docError);
          }
          break;

        case 'music':
          try {
            const musicQuery = gptResponse.data?.query || transcription.text;
            // Get a music track from our API
            const musicResponse = await fetch(`http://localhost:5000/api/music?q=${encodeURIComponent(musicQuery)}`);
            if (musicResponse.ok) {
              responseData = await musicResponse.json();
            } else {
              responseData = { message: "Music service temporarily unavailable" };
            }
          } catch (musicError) {
            console.error("Music processing error:", musicError);
            responseData = { message: "Music service temporarily unavailable" };
          }
          break;
      }

      // Generate TTS audio if requested
      if (req.body.generateTTS) {
        try {
          audioUrl = await ttsService.synthesizeToFile(gptResponse.message, req.body.ttsProvider);
        } catch (ttsError) {
          console.error("TTS generation error:", ttsError);
        }
      }

      // Clean up uploaded file if it exists
      if (req.file) {
        fs.unlink(req.file.path, (err) => {
          if (err) console.error("Failed to delete uploaded file:", err);
        });
      }

      res.json({
        transcription: transcription.text,
        response: gptResponse.message,
        action: gptResponse.action,
        data: responseData,
        audioUrl,
      });
    } catch (error) {
      console.error("Voice processing error:", error);
      res.status(500).json({ message: "Failed to process voice input: " + (error as Error).message });
    }
  });

  // Weather endpoint
  app.get("/api/weather", async (req, res) => {
    try {
      const location = req.query.location as string || "New York";
      const weatherData = await getWeatherData(location);
      res.json(weatherData);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch weather data" });
    }
  });

  // News endpoints
  app.get("/api/news", async (req, res) => {
    try {
      const category = req.query.category as string || 'general';
      const country = req.query.country as string || 'us';
      const newsData = await getLatestNews(category, country);
      res.json(newsData);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch news data" });
    }
  });

  // Music endpoint - provides royalty-free music
  app.get('/api/music', async (req, res) => {
    try {
      const query = req.query.q as string || 'ambient music';
      
      // For demo purposes, provide some royalty-free ambient music URLs
      const musicTracks = [
        {
          title: "Peaceful Ambient",
          url: "https://www.soundjay.com/misc/sounds/bell-ringing-05.wav",
          duration: "0:30"
        },
        {
          title: "Gentle Piano", 
          url: "https://archive.org/download/testmp3testfile/mpthreetest.mp3",
          duration: "0:27"
        },
        {
          title: "Nature Sounds",
          url: "https://www.soundjay.com/misc/sounds/bell-ringing-05.wav", 
          duration: "1:00"
        }
      ];
      
      // Select a random track for variety
      const randomTrack = musicTracks[Math.floor(Math.random() * musicTracks.length)];
      
      res.json(randomTrack);
    } catch (error) {
      console.error('Music API error:', error);
      res.status(500).json({ 
        message: 'Failed to fetch music',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.get("/api/news/search", async (req, res) => {
    try {
      const query = req.query.q as string;
      if (!query) {
        return res.status(400).json({ message: "Search query is required" });
      }
      const newsData = await searchNews(query);
      res.json(newsData);
    } catch (error) {
      res.status(500).json({ message: "Failed to search news" });
    }
  });

  // Reminders endpoints
  app.get("/api/reminders", async (req, res) => {
    try {
      const includeCompleted = req.query.includeCompleted === 'true';
      const reminders = reminderService.getReminders(includeCompleted);
      res.json(reminders);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch reminders" });
    }
  });

  app.get("/api/reminders/upcoming", async (req, res) => {
    try {
      const hours = parseInt(req.query.hours as string) || 24;
      const reminders = reminderService.getUpcomingReminders(hours);
      res.json(reminders);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch upcoming reminders" });
    }
  });

  app.post("/api/reminders", async (req, res) => {
    try {
      const { title, description, dueDate, priority, category } = req.body;
      const reminder = reminderService.createReminder({
        title,
        description,
        dueDate,
        priority,
        category
      });
      res.status(201).json(reminder);
    } catch (error) {
      res.status(400).json({ message: "Failed to create reminder" });
    }
  });

  app.patch("/api/reminders/:id/complete", async (req, res) => {
    try {
      const reminder = reminderService.completeReminder(req.params.id);
      if (!reminder) {
        return res.status(404).json({ message: "Reminder not found" });
      }
      res.json(reminder);
    } catch (error) {
      res.status(500).json({ message: "Failed to complete reminder" });
    }
  });

  // Email endpoint
  app.post("/api/email/send", async (req, res) => {
    try {
      const { to, subject, body, provider = 'demo' } = req.body;
      const result = await emailService.sendEmail({ to, subject, body }, provider);
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Failed to send email" });
    }
  });

  // Document processing endpoints
  app.post("/api/document/summarize", async (req, res) => {
    try {
      const { text, maxLength } = req.body;
      if (!text) {
        return res.status(400).json({ message: "Text content is required" });
      }
      const summary = await documentProcessor.summarizeText(text, maxLength);
      res.json(summary);
    } catch (error) {
      res.status(500).json({ message: "Failed to summarize document" });
    }
  });

  app.post("/api/document/analyze", async (req, res) => {
    try {
      const { text } = req.body;
      if (!text) {
        return res.status(400).json({ message: "Text content is required" });
      }
      const analysis = await documentProcessor.analyzeDocument(text);
      res.json(analysis);
    } catch (error) {
      res.status(500).json({ message: "Failed to analyze document" });
    }
  });

  // Image analysis endpoint
  app.post("/api/image/analyze", async (req, res) => {
    try {
      const { imageData, query } = req.body;
      if (!imageData) {
        return res.status(400).json({ message: "Image data is required" });
      }
      const analysis = await analyzeImage(imageData, query);
      res.json({ analysis });
    } catch (error) {
      res.status(500).json({ message: "Failed to analyze image" });
    }
  });

  // TTS endpoint
  app.post("/api/tts/synthesize", async (req, res) => {
    try {
      const { text, provider = 'openai', options = {} } = req.body;
      if (!text) {
        return res.status(400).json({ message: "Text is required" });
      }
      
      const audioFilePath = await ttsService.synthesizeToFile(text, provider, options);
      
      // Serve the audio file
      res.sendFile(path.resolve(audioFilePath), (err) => {
        if (err) {
          console.error("Error sending TTS file:", err);
        } else {
          // Clean up the file after sending
          fs.unlink(audioFilePath, (unlinkErr) => {
            if (unlinkErr) console.error("Failed to delete TTS file:", unlinkErr);
          });
        }
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to synthesize speech" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}

function extractLocationFromText(text: string): string {
  // Simple location extraction - could be enhanced with NLP
  const locationMatch = text.match(/(?:in|for|at)\s+([A-Za-z\s]+?)(?:\s|$|\?|\.|,)/i);
  return locationMatch ? locationMatch[1].trim() : "New York";
}
