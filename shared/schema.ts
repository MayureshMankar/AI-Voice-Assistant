import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, json } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Database Tables
export const conversations = pgTable("conversations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const messages = pgTable("messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").references(() => conversations.id).notNull(),
  role: text("role").notNull(), // 'user' or 'assistant'
  content: text("content").notNull(),
  audioUrl: text("audio_url"), // For user voice messages (optional)
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

// Insert Schemas (for validation)
export const insertConversationSchema = createInsertSchema(conversations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  timestamp: true,
});

// Type Inference
export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type Conversation = typeof conversations.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messages.$inferSelect;

// API Response Schemas
export const weatherResponseSchema = z.object({
  temperature: z.number(),
  description: z.string(),
  humidity: z.number(),
  windSpeed: z.number(),
  location: z.string(),
  coordinates: z.object({
    lat: z.number(),
    lon: z.number(),
  }).optional(),
});

export const newsResponseSchema = z.object({
  articles: z.array(z.object({
    title: z.string(),
    description: z.string(),
    url: z.string(),
    publishedAt: z.string(),
    source: z.object({
      name: z.string(),
    }),
  })),
});

export const reminderResponseSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  dueDate: z.string(),
  completed: z.boolean(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  category: z.string().optional(),
});

export const emailResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  emailId: z.string().optional(),
});

export const musicResponseSchema = z.object({
  title: z.string(),
  url: z.string(),
  duration: z.string(),
});

export const assistantResponseSchema = z.object({
  message: z.string(),
  action: z.enum(['weather', 'general', 'reminder', 'news', 'music', 'email', 'document']).optional(),
  data: z.any().optional(),
});

export type WeatherResponse = z.infer<typeof weatherResponseSchema>;
export type NewsResponse = z.infer<typeof newsResponseSchema>;
export type ReminderResponse = z.infer<typeof reminderResponseSchema>;
export type EmailResponse = z.infer<typeof emailResponseSchema>;
export type MusicResponse = z.infer<typeof musicResponseSchema>;
export type AssistantResponse = z.infer<typeof assistantResponseSchema>;

// Voice Processing Request Schema
export const voiceProcessingRequestSchema = z.object({
  audio: z.instanceof(File).optional(),
  transcriptionText: z.string().optional(),
  conversationId: z.string().optional(),
  imageData: z.string().optional(),
  generateTTS: z.boolean().optional(),
  ttsProvider: z.string().optional(),
});

export type VoiceProcessingRequest = z.infer<typeof voiceProcessingRequestSchema>;

// Voice Processing Response Schema
export const voiceProcessingResponseSchema = z.object({
  transcription: z.string(),
  response: z.string(),
  action: z.enum(['weather', 'general', 'reminder', 'news', 'music', 'email', 'document']).optional(),
  data: z.any().optional(),
  audioUrl: z.string().optional(),
});

export type VoiceProcessingResponse = z.infer<typeof voiceProcessingResponseSchema>;

// Settings Schema
export const settingsSchema = z.object({
  voiceSpeed: z.enum(['slow', 'normal', 'fast']).default('normal'),
  sttProvider: z.enum(['openai', 'google']).default('openai'),
  ttsProvider: z.enum(['browser', 'elevenlabs', 'google']).default('browser'),
  saveConversations: z.boolean().default(true),
  voiceAnalytics: z.boolean().default(false),
  selectedVoice: z.string().optional(),
  language: z.string().default('en-US'),
});

export type Settings = z.infer<typeof settingsSchema>;

// Error Response Schema
export const errorResponseSchema = z.object({
  message: z.string(),
  code: z.string().optional(),
  details: z.any().optional(),
});

export type ErrorResponse = z.infer<typeof errorResponseSchema>;

// Utility Types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: ErrorResponse;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

// WebSocket Message Types
export const wsMessageSchema = z.object({
  type: z.enum(['message', 'typing', 'error', 'status']),
  conversationId: z.string().optional(),
  messageId: z.string().optional(),
  content: z.string().optional(),
  error: z.string().optional(),
  status: z.string().optional(),
});

export type WsMessage = z.infer<typeof wsMessageSchema>;

// Export all schemas for easy importing
export const schemas = {
  conversations,
  messages,
  insertConversationSchema,
  insertMessageSchema,
  weatherResponseSchema,
  newsResponseSchema,
  reminderResponseSchema,
  emailResponseSchema,
  musicResponseSchema,
  assistantResponseSchema,
  voiceProcessingRequestSchema,
  voiceProcessingResponseSchema,
  settingsSchema,
  errorResponseSchema,
  wsMessageSchema,
};