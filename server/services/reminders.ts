export interface Reminder {
  id: string;
  title: string;
  description?: string;
  dueDate: Date;
  isCompleted: boolean;
  priority: 'low' | 'medium' | 'high';
  category?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateReminderData {
  title: string;
  description?: string;
  dueDate: Date | string;
  priority?: 'low' | 'medium' | 'high';
  category?: string;
}

class ReminderService {
  private reminders: Map<string, Reminder> = new Map();

  createReminder(data: CreateReminderData): Reminder {
    const id = `reminder_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date();
    
    const reminder: Reminder = {
      id,
      title: data.title,
      description: data.description,
      dueDate: new Date(data.dueDate),
      isCompleted: false,
      priority: data.priority || 'medium',
      category: data.category,
      createdAt: now,
      updatedAt: now,
    };

    this.reminders.set(id, reminder);
    return reminder;
  }

  getReminders(includeCompleted = false): Reminder[] {
    const reminders = Array.from(this.reminders.values());
    
    if (!includeCompleted) {
      return reminders.filter(r => !r.isCompleted);
    }
    
    return reminders.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
  }

  getUpcomingReminders(hours = 24): Reminder[] {
    const now = new Date();
    const cutoff = new Date(now.getTime() + hours * 60 * 60 * 1000);
    
    return this.getReminders()
      .filter(r => r.dueDate <= cutoff && r.dueDate >= now)
      .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
  }

  getOverdueReminders(): Reminder[] {
    const now = new Date();
    
    return this.getReminders()
      .filter(r => r.dueDate < now)
      .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
  }

  completeReminder(id: string): Reminder | null {
    const reminder = this.reminders.get(id);
    if (!reminder) return null;

    reminder.isCompleted = true;
    reminder.updatedAt = new Date();
    
    this.reminders.set(id, reminder);
    return reminder;
  }

  deleteReminder(id: string): boolean {
    return this.reminders.delete(id);
  }

  parseNaturalLanguageReminder(text: string): CreateReminderData | null {
    try {
      // Simple natural language parsing
      const lowerText = text.toLowerCase();
      
      // Extract time/date patterns
      const timePatterns = [
        { pattern: /in (\d+) hour[s]?/i, multiplier: 60 * 60 * 1000 },
        { pattern: /in (\d+) minute[s]?/i, multiplier: 60 * 1000 },
        { pattern: /in (\d+) day[s]?/i, multiplier: 24 * 60 * 60 * 1000 },
        { pattern: /tomorrow/i, multiplier: 24 * 60 * 60 * 1000, fixed: true },
        { pattern: /next week/i, multiplier: 7 * 24 * 60 * 60 * 1000, fixed: true },
      ];

      let dueDate = new Date();
      let timeFound = false;

      for (const { pattern, multiplier, fixed } of timePatterns) {
        const match = text.match(pattern);
        if (match) {
          if (fixed) {
            dueDate = new Date(Date.now() + multiplier);
          } else {
            const amount = parseInt(match[1]);
            dueDate = new Date(Date.now() + amount * multiplier);
          }
          timeFound = true;
          break;
        }
      }

      // If no time found, default to 1 hour from now
      if (!timeFound) {
        dueDate = new Date(Date.now() + 60 * 60 * 1000);
      }

      // Extract priority
      let priority: 'low' | 'medium' | 'high' = 'medium';
      if (lowerText.includes('urgent') || lowerText.includes('important') || lowerText.includes('asap')) {
        priority = 'high';
      } else if (lowerText.includes('low priority') || lowerText.includes('when possible')) {
        priority = 'low';
      }

      // Extract title (remove time and priority keywords)
      let title = text
        .replace(/remind me to /i, '')
        .replace(/in \d+ (hour[s]?|minute[s]?|day[s]?)/i, '')
        .replace(/(tomorrow|next week)/i, '')
        .replace(/(urgent|important|asap|low priority|when possible)/i, '')
        .trim();

      if (!title) {
        title = 'Reminder';
      }

      return {
        title,
        dueDate,
        priority,
        category: 'voice_assistant'
      };

    } catch (error) {
      console.error('Error parsing reminder:', error);
      return null;
    }
  }
}

export const reminderService = new ReminderService();