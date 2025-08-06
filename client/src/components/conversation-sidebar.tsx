import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, ChevronRight, User, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { apiRequest } from '@/lib/queryClient';
import type { Conversation } from '@shared/schema';

interface ConversationSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  currentConversationId?: string;
  onConversationSelect: (id: string) => void;
  onNewConversation: () => void;
  onOpenSettings: () => void;
}

export function ConversationSidebar({
  isOpen,
  onToggle,
  currentConversationId,
  onConversationSelect,
  onNewConversation,
  onOpenSettings
}: ConversationSidebarProps) {
  const queryClient = useQueryClient();

  const { data: conversations = [], isLoading } = useQuery<Conversation[]>({
    queryKey: ['/api/conversations'],
    enabled: isOpen,
  });

  const createConversationMutation = useMutation({
    mutationFn: async (title: string) => {
      const response = await apiRequest('POST', '/api/conversations', { title });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/conversations'] });
    },
  });

  const handleNewConversation = () => {
    const title = `Conversation ${new Date().toLocaleDateString()}`;
    createConversationMutation.mutate(title);
    onNewConversation();
  };

  const formatRelativeTime = (date: Date | string) => {
    const now = new Date();
    const target = new Date(date);
    const diffInMinutes = Math.floor((now.getTime() - target.getTime()) / (1000 * 60));

    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes} minutes ago`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)} hours ago`;
    return target.toLocaleDateString();
  };

  return (
    <div className={cn(
      "w-80 bg-slate-900 border-r border-slate-700 flex flex-col transition-all duration-300 ease-in-out",
      !isOpen && "hidden lg:flex"
    )} data-testid="conversation-sidebar">
      {/* Sidebar Header */}
      <div className="p-6 border-b border-slate-700">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-slate-100">Conversations</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleNewConversation}
            disabled={createConversationMutation.isPending}
            data-testid="button-new-conversation"
          >
            <Plus className="h-4 w-4 text-slate-400" />
          </Button>
        </div>
      </div>
      
      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="p-3 bg-slate-800/50 rounded-lg animate-pulse">
                <div className="h-4 bg-slate-700 rounded mb-2"></div>
                <div className="h-3 bg-slate-700 rounded w-20"></div>
              </div>
            ))}
          </div>
        ) : conversations.length === 0 ? (
          <div className="text-center py-8 text-slate-400">
            <p className="text-sm">No conversations yet</p>
            <p className="text-xs mt-1">Start by clicking the microphone</p>
          </div>
        ) : (
          conversations.map((conversation) => (
            <button
              key={conversation.id}
              className={cn(
                "w-full p-3 rounded-lg hover:bg-slate-700/50 cursor-pointer transition-colors text-left",
                currentConversationId === conversation.id ? "bg-slate-700" : "bg-slate-800/50"
              )}
              onClick={() => onConversationSelect(conversation.id)}
              data-testid={`conversation-item-${conversation.id}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-sm text-slate-200 truncate">
                    {conversation.title}
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    {formatRelativeTime(conversation.updatedAt)}
                  </p>
                </div>
                <ChevronRight className="h-3 w-3 text-slate-500 flex-shrink-0" />
              </div>
            </button>
          ))
        )}
      </div>
      
      {/* User Profile */}
      <div className="p-4 border-t border-slate-700">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full flex items-center justify-center">
            <User className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1">
            <p className="font-medium text-sm text-slate-200">Voice User</p>
            <p className="text-xs text-slate-400">Active Session</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onOpenSettings}
            data-testid="button-open-settings"
          >
            <Settings className="h-4 w-4 text-slate-400" />
          </Button>
        </div>
      </div>
    </div>
  );
}
