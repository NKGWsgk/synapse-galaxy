"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createBrowserClient } from "@/lib/supabase/browser";
import { generateGoogleAuthNonce } from "@/lib/googleAuthNonce";
import {
  fetchGoogleClientIdFromApi,
  resolveGoogleClientId,
  signInWithGoogleIdToken,
} from "@/lib/googleSignIn";

type CredentialResponse = { credential: string };

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: CredentialResponse) => void;
            nonce?: string;
            use_fedcm_for_prompt?: boolean;
            auto_select?: boolean;
            cancel_on_tap_outside?: boolean;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: {
              type?: string;
              theme?: string;
              size?: string;
              text?: string;
              width?: number;
              locale?: string;
            },
          ) => void;
        };
      };
    };
  }
}

type Props = {
  clientId?: string | null;
  className?: string;
  visualClassName?: string;
  disabled?: boolean;
  loadingLabel?: string;
  children?: ReactNode;
  onSuccess?: () => void;
  onError?: (error: unknown) => void;
};

export function GoogleSignInButton({
  clientId: clientIdProp,
  className,
  visualClassName,
  disabled,
  loadingLabel = "処理中…",
  children = "Googleでログイン",
  onSuccess,
  onError,
}: Props) {
  const [clientId, setClientId] = useState<string | null>(() => resolveGoogleClientId(clientIdProp));
  const [configLoading, setConfigLoading] = useState(() => !resolveGoogleClientId(clientIdProp));
  const [scriptReady, setScriptReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const nonceRef = useRef<string | null>(null);

  useEffect(() => {
    const fromProps = resolveGoogleClientId(clientIdProp);
    if (fromProps) {
      setClientId(fromProps);
      setConfigLoading(false);
      return;
    }

    let cancelled = false;
    setConfigLoading(true);
    void fetchGoogleClientIdFromApi().then((id) => {
      if (cancelled) return;
      setClientId(id);
      setConfigLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [clientIdProp]);

  const handleCredential = useCallback(async (response: CredentialResponse) => {
    setLoading(true);
    try {
      const supabase = createBrowserClient();
      await signInWithGoogleIdToken(supabase, response.credential, nonceRef.current ?? undefined);
      onSuccess?.();
    } catch (err) {
      onError?.(err);
    } finally {
      setLoading(false);
    }
  }, [onSuccess, onError]);

  const mountGoogleButton = useCallback(async () => {
    if (!clientId || !window.google?.accounts?.id || !overlayRef.current || !containerRef.current) {
      if (!clientId) setInitError("Google Client ID が未設定です");
      return;
    }

    try {
      const [nonce, hashedNonce] = await generateGoogleAuthNonce();
      nonceRef.current = nonce;

      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (response) => void handleCredential(response),
        nonce: hashedNonce,
        use_fedcm_for_prompt: true,
        auto_select: false,
        cancel_on_tap_outside: true,
      });

      overlayRef.current.innerHTML = "";
      window.google.accounts.id.renderButton(overlayRef.current, {
        type: "standard",
        theme: "outline",
        size: "large",
        text: "signin_with",
        locale: "ja",
        width: containerRef.current.clientWidth,
      });
      setInitError(null);
    } catch (err) {
      setInitError(err instanceof Error ? err.message : String(err));
    }
  }, [clientId, handleCredential]);

  useEffect(() => {
    if (!scriptReady || !clientId) return;
    void mountGoogleButton();

    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => {
      void mountGoogleButton();
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [scriptReady, clientId, mountGoogleButton]);

  if (configLoading) {
    return (
      <button type="button" disabled className={visualClassName ?? className}>
        {loadingLabel}
      </button>
    );
  }

  if (!clientId) {
    return (
      <div className="space-y-1">
        <button type="button" disabled className={visualClassName ?? className}>
          Googleログイン未設定
        </button>
        <p className="text-[10px] leading-snug text-red-500">
          Vercel の Environment Variables に{" "}
          <code className="rounded bg-red-50 px-0.5">NEXT_PUBLIC_GOOGLE_CLIENT_ID</code>{" "}
          を設定し、Redeploy してください。
        </p>
      </div>
    );
  }

  const isDisabled = disabled || loading || !!initError;

  return (
    <>
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onReady={() => setScriptReady(true)}
        onLoad={() => setScriptReady(true)}
      />
      <div ref={containerRef} className={["relative", className].filter(Boolean).join(" ")}>
        <div
          className={[
            visualClassName,
            isDisabled ? "pointer-events-none opacity-60" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          aria-hidden
        >
          {loading ? loadingLabel : children}
        </div>
        {!isDisabled ? (
          <div
            ref={overlayRef}
            className="absolute inset-0 overflow-hidden opacity-0 [&>div]:!h-full [&>div]:!w-full"
            aria-label="Googleでログイン"
          />
        ) : null}
      </div>
      {initError ? <p className="mt-1 text-[10px] text-red-500">{initError}</p> : null}
    </>
  );
}
