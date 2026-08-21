import { useState, useCallback, useRef } from 'react';
import { A2UIPayload, A2UIStreamDelta } from '../types';
import { parseA2UI, applyStreamDelta } from '../parser';

export interface UseA2UIStreamOptions {
  initialPayload?: A2UIPayload;
  onUpdate?: (payload: A2UIPayload) => void;
  onError?: (error: string) => void;
}

export interface UseA2UIStreamReturn {
  payload: A2UIPayload | null;
  rawBuffer: string;
  isStreaming: boolean;
  errors: string[];
  appendChunk: (chunk: string) => void;
  applyDelta: (delta: A2UIStreamDelta) => void;
  reset: () => void;
  setPayload: (payload: A2UIPayload) => void;
}

export function useA2UIStream(options: UseA2UIStreamOptions = {}): UseA2UIStreamReturn {
  const [payload, setPayloadState] = useState<A2UIPayload | null>(options.initialPayload || null);
  const [rawBuffer, setRawBuffer] = useState<string>('');
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [errors, setErrors] = useState<string[]>([]);
  const bufferRef = useRef<string>('');

  const appendChunk = useCallback((chunk: string) => {
    setIsStreaming(true);
    bufferRef.current += chunk;
    setRawBuffer(bufferRef.current);

    const parseResult = parseA2UI(bufferRef.current);
    if (parseResult.valid && parseResult.payload) {
      setPayloadState(parseResult.payload);
      setErrors([]);
      if (options.onUpdate) {
        options.onUpdate(parseResult.payload);
      }
    } else if (parseResult.errors) {
      // In-flight chunks may be incomplete JSON; only set errors if buffer is substantial
      if (bufferRef.current.endsWith('}') || bufferRef.current.endsWith(']')) {
        setErrors(parseResult.errors);
        if (options.onError) {
          options.onError(parseResult.errors.join(', '));
        }
      }
    }
  }, [options]);

  const applyDelta = useCallback((delta: A2UIStreamDelta) => {
    setPayloadState((prev) => {
      if (!prev) return prev;
      const updated = applyStreamDelta(prev, delta);
      if (options.onUpdate) {
        options.onUpdate(updated);
      }
      return updated;
    });
  }, [options]);

  const reset = useCallback(() => {
    bufferRef.current = '';
    setRawBuffer('');
    setPayloadState(options.initialPayload || null);
    setIsStreaming(false);
    setErrors([]);
  }, [options.initialPayload]);

  const setPayload = useCallback((newPayload: A2UIPayload) => {
    setPayloadState(newPayload);
    if (options.onUpdate) {
      options.onUpdate(newPayload);
    }
  }, [options]);

  return {
    payload,
    rawBuffer,
    isStreaming,
    errors,
    appendChunk,
    applyDelta,
    reset,
    setPayload,
  };
}
