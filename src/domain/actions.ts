import type { Prompt } from './types';

export interface PromptActions {
  open: (prompt: Prompt) => void;
  copy: (prompt: Prompt) => Promise<void>;
  favorite: (prompt: Prompt) => void;
  edit: (prompt: Prompt) => void;
  duplicate: (prompt: Prompt) => void;
  remove: (prompt: Prompt) => void;
  apply: (prompt: Prompt) => void;
}
