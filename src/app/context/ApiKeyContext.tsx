import { createContext, useContext, useState } from 'react';

const LS_KEY = 'mp_api_ticket';

const readStoredApiKey = () => {
  try {
    return localStorage.getItem(LS_KEY) ?? '';
  } catch {
    return '';
  }
};

const persistApiKey = (value: string) => {
  try {
    if (value) {
      localStorage.setItem(LS_KEY, value);
    } else {
      localStorage.removeItem(LS_KEY);
    }
  } catch {
    // Ignore storage failures so the app still works in restrictive browsers.
  }
};

interface ApiKeyContextType {
  apiKey: string;
  setApiKey: (key: string) => void;
}

const ApiKeyContext = createContext<ApiKeyContextType>({ apiKey: '', setApiKey: () => {} });

export function ApiKeyProvider({ children }: { children: React.ReactNode }) {
  const [apiKey, setApiKeyState] = useState<string>(() => readStoredApiKey());

  const setApiKey = (key: string) => {
    const trimmed = key.trim();
    setApiKeyState(trimmed);
    persistApiKey(trimmed);
  };

  return (
    <ApiKeyContext.Provider value={{ apiKey, setApiKey }}>
      {children}
    </ApiKeyContext.Provider>
  );
}

export const useApiKey = () => useContext(ApiKeyContext);
