import { type Conversation, type Message, type InsertConversation, type InsertMessage } from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  // Conversations
  getConversations(): Promise<Conversation[]>;
  getConversation(id: string): Promise<Conversation | undefined>;
  createConversation(conversation: InsertConversation): Promise<Conversation>;
  updateConversation(id: string, updates: Partial<Conversation>): Promise<Conversation | undefined>;
  deleteConversation(id: string): Promise<boolean>;
  // Messages
  getMessagesByConversation(conversationId: string): Promise<Message[]>;
  createMessage(message: InsertMessage): Promise<Message>;
  deleteMessage(id: string): Promise<boolean>;
  deleteMessages(messageIds: string[]): Promise<boolean>;
}

export class MemStorage implements IStorage {
  private conversations: Map<string, Conversation>;
  private messages: Map<string, Message>;
  
  constructor() {
    this.conversations = new Map();
    this.messages = new Map();
  }

  async getConversations(): Promise<Conversation[]> {
    try {
      return Array.from(this.conversations.values()).sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
    } catch (error) {
      console.error("Error getting conversations:", error);
      return [];
    }
  }

  async getConversation(id: string): Promise<Conversation | undefined> {
    try {
      return this.conversations.get(id);
    } catch (error) {
      console.error(`Error getting conversation ${id}:`, error);
      return undefined;
    }
  }

  async createConversation(insertConversation: InsertConversation): Promise<Conversation> {
    try {
      const id = randomUUID();
      const now = new Date();
      const conversation: Conversation = {
        ...insertConversation,
        id,
        createdAt: now,
        updatedAt: now,
      };
      this.conversations.set(id, conversation);
      return conversation;
    } catch (error) {
      console.error("Error creating conversation:", error);
      throw error;
    }
  }

  async updateConversation(id: string, updates: Partial<Conversation>): Promise<Conversation | undefined> {
    try {
      const conversation = this.conversations.get(id);
      if (!conversation) return undefined;
      
      const updated: Conversation = {
        ...conversation,
        ...updates,
        updatedAt: new Date(),
      };
      this.conversations.set(id, updated);
      return updated;
    } catch (error) {
      console.error(`Error updating conversation ${id}:`, error);
      throw error;
    }
  }

  async deleteConversation(id: string): Promise<boolean> {
    try {
      const conversation = this.conversations.get(id);
      if (!conversation) {
        return false;
      }
      
      const deleted = this.conversations.delete(id);
      
      // Also delete associated messages
      const messagesToDelete = Array.from(this.messages.values()).filter(
        msg => msg.conversationId === id
      );
      messagesToDelete.forEach(msg => {
        this.messages.delete(msg.id);
      });
      
      return deleted;
    } catch (error) {
      console.error(`Error deleting conversation ${id}:`, error);
      return false;
    }
  }

  async getMessagesByConversation(conversationId: string): Promise<Message[]> {
    try {
      const messages = Array.from(this.messages.values())
        .filter(msg => msg.conversationId === conversationId)
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      
      return messages;
    } catch (error) {
      console.error(`Error getting messages for conversation ${conversationId}:`, error);
      return [];
    }
  }

  async createMessage(insertMessage: InsertMessage): Promise<Message> {
    try {
      const id = randomUUID();
      const now = new Date();
      
      // Fix the audioUrl type issue: convert undefined to null
      const message: Message = {
        ...insertMessage,
        id,
        timestamp: now,
        audioUrl: insertMessage.audioUrl ?? null, // Convert undefined to null
      };
      
      this.messages.set(id, message);
      
      // Update the conversation's updatedAt timestamp
      const conversation = this.conversations.get(message.conversationId);
      if (conversation) {
        conversation.updatedAt = now;
        this.conversations.set(conversation.id, conversation);
      }
      
      return message;
    } catch (error) {
      console.error("Error creating message:", error);
      throw error;
    }
  }

  async deleteMessage(id: string): Promise<boolean> {
    try {
      const message = this.messages.get(id);
      if (!message) {
        return false;
      }
      
      const deleted = this.messages.delete(id);
      
      if (deleted) {
        // Update the conversation's updatedAt timestamp
        const conversation = this.conversations.get(message.conversationId);
        if (conversation) {
          conversation.updatedAt = new Date();
          this.conversations.set(conversation.id, conversation);
        }
      }
      
      return deleted;
    } catch (error) {
      console.error(`Error deleting message ${id}:`, error);
      return false;
    }
  }
  
  async deleteMessages(messageIds: string[]): Promise<boolean> {
    try {
      if (!messageIds || messageIds.length === 0) {
        return false;
      }
      
      let allDeleted = true;
      const conversationIds = new Set<string>();
      
      for (const messageId of messageIds) {
        const message = this.messages.get(messageId);
        if (message) {
          const deleted = this.messages.delete(messageId);
          if (!deleted) {
            allDeleted = false;
          } else {
            // Track which conversations were affected
            conversationIds.add(message.conversationId);
          }
        } else {
          allDeleted = false;
        }
      }
      
      // Update updatedAt for all affected conversations
      conversationIds.forEach(conversationId => {
        const conversation = this.conversations.get(conversationId);
        if (conversation) {
          conversation.updatedAt = new Date();
          this.conversations.set(conversationId, conversation);
        }
      });
      
      return allDeleted;
    } catch (error) {
      console.error("Error deleting messages:", error);
      return false;
    }
  }
}

export const storage = new MemStorage();