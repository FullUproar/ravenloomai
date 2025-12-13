/**
 * Command Palette (Cmd+K)
 *
 * A Slack/VS Code-style command palette for quick navigation and actions.
 * Inspired by productivity apps like Linear, Notion, and Superhuman.
 */
import { useState, useEffect, useRef, useCallback, createContext, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import './CommandPalette.css';

// Context for command palette
const CommandPaletteContext = createContext(null);

/**
 * Simple fuzzy matching - matches if all query chars appear in order
 */
function fuzzyMatch(query, text) {
  if (!query) return true;
  const queryLower = query.toLowerCase();
  const textLower = text.toLowerCase();

  let qi = 0;
  for (let ti = 0; ti < textLower.length && qi < queryLower.length; ti++) {
    if (textLower[ti] === queryLower[qi]) {
      qi++;
    }
  }
  return qi === queryLower.length;
}

/**
 * Score match quality - higher is better
 */
function scoreMatch(query, text) {
  if (!query) return 1;
  const queryLower = query.toLowerCase();
  const textLower = text.toLowerCase();

  // Exact match at start
  if (textLower.startsWith(queryLower)) return 100;

  // Contains exact match
  if (textLower.includes(queryLower)) return 50;

  // Fuzzy match - count consecutive matches
  let score = 0;
  let qi = 0;
  let consecutive = 0;

  for (let ti = 0; ti < textLower.length && qi < queryLower.length; ti++) {
    if (textLower[ti] === queryLower[qi]) {
      qi++;
      consecutive++;
      score += consecutive;
    } else {
      consecutive = 0;
    }
  }

  return score;
}

/**
 * Command Palette Provider
 */
export function CommandPaletteProvider({ children, teamId, tasks = [], channels = [], goals = [], projects = [] }) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mode, setMode] = useState('default'); // 'default', 'tasks', 'channels', 'goto'
  const inputRef = useRef(null);
  const navigate = useNavigate();

  // Build command list based on context
  const getCommands = useCallback(() => {
    const commands = [];

    // Navigation commands (always available)
    if (!mode || mode === 'default' || mode === 'goto') {
      commands.push(
        { id: 'nav-digest', type: 'navigation', icon: '📊', label: 'Go to Digest', shortcut: 'Home', action: () => navigate(`/team/${teamId}`) },
        { id: 'nav-chat', type: 'navigation', icon: '💬', label: 'Go to Chat', shortcut: 'Alt+1', action: () => navigate(`/team/${teamId}/chat`) },
        { id: 'nav-tasks', type: 'navigation', icon: '✓', label: 'Go to Tasks', shortcut: 'Alt+2', action: () => navigate(`/team/${teamId}/tasks`) },
        { id: 'nav-ask', type: 'navigation', icon: '❓', label: 'Go to Ask', shortcut: 'Alt+3', action: () => navigate(`/team/${teamId}/ask`) },
        { id: 'nav-goals', type: 'navigation', icon: '🎯', label: 'Go to Goals', action: () => navigate(`/team/${teamId}/goals`) },
        { id: 'nav-projects', type: 'navigation', icon: '📁', label: 'Go to Projects', action: () => navigate(`/team/${teamId}/projects`) },
        { id: 'nav-calendar', type: 'navigation', icon: '📅', label: 'Go to Calendar', action: () => navigate(`/team/${teamId}/calendar`) },
        { id: 'nav-knowledge', type: 'navigation', icon: '📚', label: 'Go to Knowledge Base', action: () => navigate(`/team/${teamId}/knowledge`) }
      );
    }

    // Quick actions
    if (!mode || mode === 'default') {
      commands.push(
        { id: 'action-new-task', type: 'action', icon: '➕', label: 'Create new task', keywords: 'add task todo', action: 'create-task' },
        { id: 'action-search', type: 'action', icon: '🔍', label: 'Search everything', keywords: 'find look', action: 'search' },
        { id: 'action-focus', type: 'action', icon: '🧘', label: 'Generate Morning Focus', action: 'morning-focus' }
      );
    }

    // Channels
    if ((!mode || mode === 'default' || mode === 'channels') && channels.length > 0) {
      channels.forEach(channel => {
        commands.push({
          id: `channel-${channel.id}`,
          type: 'channel',
          icon: '#',
          label: channel.name,
          subtitle: channel.description,
          action: () => navigate(`/team/${teamId}/channel/${channel.id}`)
        });
      });
    }

    // Tasks (recent/important)
    if ((!mode || mode === 'default' || mode === 'tasks') && tasks.length > 0) {
      // Show top 10 tasks
      tasks.slice(0, 10).forEach(task => {
        const priorityIcon = task.priority === 'critical' ? '🔴' :
                           task.priority === 'high' ? '🟠' :
                           task.priority === 'medium' ? '🟡' : '⚪';
        commands.push({
          id: `task-${task.id}`,
          type: 'task',
          icon: priorityIcon,
          label: task.title,
          subtitle: task.status,
          action: () => navigate(`/team/${teamId}/tasks/${task.id}`)
        });
      });
    }

    // Goals
    if ((!mode || mode === 'default') && goals.length > 0) {
      goals.slice(0, 5).forEach(goal => {
        commands.push({
          id: `goal-${goal.id}`,
          type: 'goal',
          icon: '🎯',
          label: goal.title,
          subtitle: `${goal.progress || 0}% complete`,
          action: () => navigate(`/team/${teamId}/goals/${goal.id}`)
        });
      });
    }

    // Projects
    if ((!mode || mode === 'default') && projects.length > 0) {
      projects.slice(0, 5).forEach(project => {
        commands.push({
          id: `project-${project.id}`,
          type: 'project',
          icon: '📁',
          label: project.name,
          subtitle: project.status,
          action: () => navigate(`/team/${teamId}/projects/${project.id}`)
        });
      });
    }

    return commands;
  }, [mode, teamId, tasks, channels, goals, projects, navigate]);

  // Filter commands by query
  const filteredCommands = useCallback(() => {
    const commands = getCommands();

    if (!query.trim()) {
      return commands;
    }

    // Filter and score
    const searchText = query.trim();
    return commands
      .filter(cmd => {
        const searchable = `${cmd.label} ${cmd.subtitle || ''} ${cmd.keywords || ''}`;
        return fuzzyMatch(searchText, searchable);
      })
      .sort((a, b) => {
        const searchableA = `${a.label} ${a.subtitle || ''} ${a.keywords || ''}`;
        const searchableB = `${b.label} ${b.subtitle || ''} ${b.keywords || ''}`;
        return scoreMatch(searchText, searchableB) - scoreMatch(searchText, searchableA);
      })
      .slice(0, 15); // Limit results
  }, [query, getCommands]);

  const commands = filteredCommands();

  // Reset selection when commands change
  useEffect(() => {
    setSelectedIndex(0);
  }, [query, mode]);

  // Focus input when opening
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
      setMode('default');
    }
  }, [isOpen]);

  // Global keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Cmd+K or Ctrl+K to open
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(prev => !prev);
        return;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Handle keyboard navigation within palette
  const handleKeyDown = (e) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, commands.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (commands[selectedIndex]) {
          executeCommand(commands[selectedIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        break;
      case 'Tab':
        // Tab cycles through modes
        e.preventDefault();
        setMode(prev => {
          if (prev === 'default') return 'goto';
          if (prev === 'goto') return 'tasks';
          if (prev === 'tasks') return 'channels';
          return 'default';
        });
        break;
    }
  };

  const executeCommand = (command) => {
    if (typeof command.action === 'function') {
      command.action();
    }
    setIsOpen(false);
  };

  const contextValue = {
    isOpen,
    open: () => setIsOpen(true),
    close: () => setIsOpen(false),
    toggle: () => setIsOpen(prev => !prev)
  };

  return (
    <CommandPaletteContext.Provider value={contextValue}>
      {children}

      {isOpen && (
        <div className="command-palette-overlay" onClick={() => setIsOpen(false)}>
          <div className="command-palette" onClick={e => e.stopPropagation()}>
            {/* Search input */}
            <div className="command-palette-input-wrapper">
              <span className="command-palette-search-icon">⌘</span>
              <input
                ref={inputRef}
                type="text"
                className="command-palette-input"
                placeholder={
                  mode === 'goto' ? 'Go to...' :
                  mode === 'tasks' ? 'Search tasks...' :
                  mode === 'channels' ? 'Switch channel...' :
                  'Type a command or search...'
                }
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
              />
              <div className="command-palette-hint">
                <kbd>↑↓</kbd> navigate <kbd>↵</kbd> select <kbd>esc</kbd> close
              </div>
            </div>

            {/* Mode tabs */}
            <div className="command-palette-modes">
              <button
                className={`command-palette-mode ${mode === 'default' ? 'active' : ''}`}
                onClick={() => setMode('default')}
              >
                All
              </button>
              <button
                className={`command-palette-mode ${mode === 'goto' ? 'active' : ''}`}
                onClick={() => setMode('goto')}
              >
                Navigate
              </button>
              <button
                className={`command-palette-mode ${mode === 'tasks' ? 'active' : ''}`}
                onClick={() => setMode('tasks')}
              >
                Tasks
              </button>
              <button
                className={`command-palette-mode ${mode === 'channels' ? 'active' : ''}`}
                onClick={() => setMode('channels')}
              >
                Channels
              </button>
            </div>

            {/* Results */}
            <div className="command-palette-results">
              {commands.length === 0 ? (
                <div className="command-palette-empty">
                  No results found for "{query}"
                </div>
              ) : (
                commands.map((command, index) => (
                  <div
                    key={command.id}
                    className={`command-palette-item ${index === selectedIndex ? 'selected' : ''}`}
                    onClick={() => executeCommand(command)}
                    onMouseEnter={() => setSelectedIndex(index)}
                  >
                    <span className="command-palette-item-icon">{command.icon}</span>
                    <div className="command-palette-item-content">
                      <span className="command-palette-item-label">{command.label}</span>
                      {command.subtitle && (
                        <span className="command-palette-item-subtitle">{command.subtitle}</span>
                      )}
                    </div>
                    {command.shortcut && (
                      <kbd className="command-palette-item-shortcut">{command.shortcut}</kbd>
                    )}
                    <span className="command-palette-item-type">{command.type}</span>
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            <div className="command-palette-footer">
              <span>
                <kbd>Tab</kbd> switch modes
              </span>
              <span>
                <kbd>⌘K</kbd> toggle palette
              </span>
            </div>
          </div>
        </div>
      )}
    </CommandPaletteContext.Provider>
  );
}

/**
 * Hook to use command palette
 */
export function useCommandPalette() {
  const context = useContext(CommandPaletteContext);
  if (!context) {
    // Return dummy functions if not in provider (graceful degradation)
    return { isOpen: false, open: () => {}, close: () => {}, toggle: () => {} };
  }
  return context;
}

export default CommandPaletteProvider;
