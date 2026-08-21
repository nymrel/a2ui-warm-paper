import { useState, useCallback } from 'react';
import { A2UIActionEvent, A2UIActionHandler } from '../types';

export interface UseA2UIStateReturn {
  actionHistory: A2UIActionEvent[];
  lastAction: A2UIActionEvent | null;
  handleAction: A2UIActionHandler;
  clearHistory: () => void;
}

export function useA2UIState(onActionProp?: A2UIActionHandler): UseA2UIStateReturn {
  const [actionHistory, setActionHistory] = useState<A2UIActionEvent[]>([]);
  const [lastAction, setLastAction] = useState<A2UIActionEvent | null>(null);

  const handleAction = useCallback<A2UIActionHandler>(
    (event: A2UIActionEvent) => {
      setActionHistory((prev) => [event, ...prev]);
      setLastAction(event);

      if (onActionProp) {
        onActionProp(event);
      }
    },
    [onActionProp]
  );

  const clearHistory = useCallback(() => {
    setActionHistory([]);
    setLastAction(null);
  }, []);

  return {
    actionHistory,
    lastAction,
    handleAction,
    clearHistory,
  };
}
