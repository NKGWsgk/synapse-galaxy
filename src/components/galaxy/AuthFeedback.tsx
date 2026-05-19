"use client";

import { AnimatePresence, motion } from "framer-motion";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

type AuthFeedbackContextValue = {
  showToast: (message: string) => void;
  notifySessionExpired: () => void;
};

const AuthFeedbackContext = createContext<AuthFeedbackContextValue | null>(null);

const SESSION_EXPIRED_MSG = "セッションが切れました。再度ログインしてください。";

export function AuthFeedbackProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 4500);
  }, []);

  const notifySessionExpired = useCallback(() => {
    showToast(SESSION_EXPIRED_MSG);
  }, [showToast]);

  return (
    <AuthFeedbackContext.Provider value={{ showToast, notifySessionExpired }}>
      {children}
      <AnimatePresence>
        {toast ? (
          <motion.div
            key="auth-toast"
            role="status"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.2 }}
            className="pointer-events-none fixed bottom-6 left-1/2 z-[300] w-[min(92vw,24rem)] -translate-x-1/2 rounded-xl border border-zinc-200/90 bg-zinc-900/95 px-4 py-3 text-center text-sm font-medium text-white shadow-lg backdrop-blur-sm"
          >
            {toast}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </AuthFeedbackContext.Provider>
  );
}

export function useAuthFeedback(): AuthFeedbackContextValue {
  const ctx = useContext(AuthFeedbackContext);
  return ctx ?? { showToast: () => {}, notifySessionExpired: () => {} };
}
