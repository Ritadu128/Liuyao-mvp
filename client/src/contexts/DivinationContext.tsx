import React, { createContext, useContext, useState } from 'react';
import type { HexagramResult, LineValue, ThrowResult } from '@/lib/liuyao';

export interface HexagramInfo {
  key: string;
  name: string;
  bits: string;
  lower: string;
  upper: string;
  number: number;
}

export interface TextData {
  key: string;
  name: string;
  bits: string;
  gua_ci: string;
  xiang_yue: string;
  yao_ci: Record<string, string>;
}

export interface DivinationState {
  question: string;
  throws: ThrowResult[];
  hexagramResult: HexagramResult | null;
  originalHexagram: HexagramInfo | null;
  changedHexagram: HexagramInfo | null;
  originalText: TextData | null;
  changedText: TextData | null;
  integratedReading: string;
  hexagramReading: string;
  isLoadingReading: boolean;
  savedReadingId: number | null;
}

interface DivinationContextType {
  state: DivinationState;
  setQuestion: (q: string) => void;
  addThrow: (t: ThrowResult) => void;
  setThrows: (throws: ThrowResult[]) => void;
  setHexagramResult: (r: HexagramResult) => void;
  setOriginalHexagram: (h: HexagramInfo | null) => void;
  setChangedHexagram: (h: HexagramInfo | null) => void;
  setOriginalText: (t: TextData | null) => void;
  setChangedText: (t: TextData | null) => void;
  setIntegratedReading: (r: string) => void;
  setHexagramReading: (r: string) => void;
  setIsLoadingReading: (v: boolean) => void;
  setSavedReadingId: (id: number | null) => void;
  reset: () => void;
}

const initialState: DivinationState = {
  question: '',
  throws: [],
  hexagramResult: null,
  originalHexagram: null,
  changedHexagram: null,
  originalText: null,
  changedText: null,
  integratedReading: '',
  hexagramReading: '',
  isLoadingReading: false,
  savedReadingId: null,
};

const DivinationContext = createContext<DivinationContextType | null>(null);

export function DivinationProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<DivinationState>(initialState);

  const update = (partial: Partial<DivinationState>) =>
    setState(prev => ({ ...prev, ...partial }));

  return (
    <DivinationContext.Provider value={{
      state,
      setQuestion: (question) => update({ question }),
      addThrow: (t) => setState(prev => ({ ...prev, throws: [...prev.throws, t] })),
      setThrows: (throws) => update({ throws }),
      setHexagramResult: (hexagramResult) => update({ hexagramResult }),
      setOriginalHexagram: (originalHexagram) => update({ originalHexagram }),
      setChangedHexagram: (changedHexagram) => update({ changedHexagram }),
      setOriginalText: (originalText) => update({ originalText }),
      setChangedText: (changedText) => update({ changedText }),
      setIntegratedReading: (integratedReading) => update({ integratedReading }),
      setHexagramReading: (hexagramReading) => update({ hexagramReading }),
      setIsLoadingReading: (isLoadingReading) => update({ isLoadingReading }),
      setSavedReadingId: (savedReadingId) => update({ savedReadingId }),
      reset: () => setState(initialState),
    }}>
      {children}
    </DivinationContext.Provider>
  );
}

export function useDivination() {
  const ctx = useContext(DivinationContext);
  if (!ctx) throw new Error('useDivination must be used within DivinationProvider');
  return ctx;
}
