import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Settings2 } from 'lucide-react';

interface ChatMessage {
  id: string;
  role: 'user' | 'agent';
  content: string;
  timestamp: Date;
}

const MODELS = [
  { id: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
  { id: 'google/gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
  { id: 'meta-llama/llama-3.1-8b-instruct', name: 'Llama 3.1 8B' },
  { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet' },
];

export function ChatInterface() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [selectedModel, setSelectedModel] = useState(MODELS[0].id);
  const [showSettings, setShowSettings] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isTyping) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input,
      timestamp: new Date()
    };
    
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg.content, model: selectedModel })
      });
      
      const data = await response.json();
      
      const agentMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'agent',
        content: data.response || (data.error ? `[ERROR: ${data.error}]` : '[NO RESPONSE]'),
        timestamp: new Date()
      };
      
      setMessages(prev => [...prev, agentMsg]);
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'agent',
        content: `[NETWORK ERROR: ${err.message}]`,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-neutral-950 border-b border-neutral-800">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-red-950 flex items-center justify-center border border-red-900">
            <Bot className="w-4 h-4 text-red-500" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-neutral-200">Red Queen Terminal</h2>
            <p className="text-[10px] text-neutral-500 font-mono tracking-widest">A.I. COGNITION LINK</p>
          </div>
        </div>
        
        <div className="relative">
          <button 
            onClick={() => setShowSettings(!showSettings)}
            className={`p-2 rounded-lg border transition-colors ${showSettings ? 'bg-neutral-800 border-neutral-700 text-neutral-200' : 'bg-transparent border-transparent text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300'}`}
          >
            <Settings2 className="w-4 h-4" />
          </button>
          
          {showSettings && (
            <div className="absolute right-0 mt-2 w-56 bg-neutral-900 border border-neutral-800 rounded-lg shadow-xl p-3 z-50">
              <label className="block text-xs font-semibold text-neutral-400 mb-2 uppercase tracking-wider">Neural Model</label>
              <div className="space-y-1">
                {MODELS.map(model => (
                  <button
                    key={model.id}
                    onClick={() => {
                      setSelectedModel(model.id);
                      setShowSettings(false);
                    }}
                    className={`w-full text-left px-3 py-2 text-xs rounded-md transition-colors ${selectedModel === model.id ? 'bg-red-900/30 text-red-400 border border-red-900/50' : 'text-neutral-400 hover:bg-neutral-800'}`}
                  >
                    {model.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-neutral-600 space-y-4">
            <Bot className="w-12 h-12 opacity-20" />
            <p className="text-sm font-mono text-center">CONNECTION ESTABLISHED.<br/>AWAITING INPUT.</p>
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`flex max-w-[85%] gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                
                <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center border ${msg.role === 'user' ? 'bg-neutral-800 border-neutral-700' : 'bg-red-950 border-red-900'}`}>
                  {msg.role === 'user' ? <User className="w-4 h-4 text-neutral-400" /> : <Bot className="w-4 h-4 text-red-500" />}
                </div>

                <div className={`px-4 py-3 rounded-2xl ${msg.role === 'user' ? 'bg-neutral-800 text-neutral-200 rounded-tr-none' : 'bg-neutral-950 border border-neutral-800 text-neutral-300 rounded-tl-none font-mono text-sm leading-relaxed'}`}>
                  {msg.content}
                </div>
              </div>
            </div>
          ))
        )}
        
        {isTyping && (
          <div className="flex justify-start">
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-red-950 flex items-center justify-center border border-red-900">
                <Bot className="w-4 h-4 text-red-500" />
              </div>
              <div className="px-4 py-3 rounded-2xl bg-neutral-950 border border-neutral-800 rounded-tl-none flex items-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 bg-neutral-950 border-t border-neutral-800">
        <form onSubmit={handleSend} className="relative flex items-center">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Command Red Queen..."
            disabled={isTyping}
            className="w-full bg-neutral-900 border border-neutral-800 rounded-full py-3 pl-5 pr-12 text-sm text-neutral-200 placeholder-neutral-600 focus:outline-none focus:ring-1 focus:ring-red-500/50 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!input.trim() || isTyping}
            className="absolute right-2 p-2 bg-red-900/30 text-red-500 hover:bg-red-900/50 rounded-full transition-colors disabled:opacity-50 disabled:hover:bg-red-900/30"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
