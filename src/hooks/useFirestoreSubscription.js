import { useEffect, useState } from "react";

function getFriendlyLoadError(error) {
  const message = String(error?.message || "").toLowerCase();

  if (message.includes("permission")) {
    return "You do not have permission to view this data. Please sign in again.";
  }

  if (message.includes("network") || message.includes("offline")) {
    return "Network connection lost. Please check your internet and try again.";
  }

  if (message.includes("index")) {
    return "This data needs a Firebase index. Please contact the admin owner.";
  }

  return "Something went wrong while loading this section. Please try again.";
}

export function useFirestoreSubscription(subscribe, initialValue) {
  const [data, setData] = useState(initialValue);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isActive = true;
    let unsubscribe;
    let timeoutId;

    setLoading(true);
    setError("");
    timeoutId = window.setTimeout(() => {
      if (!isActive) return;
      setData((current) => current ?? initialValue);
      setLoading(false);
    }, 8000);

    try {
      unsubscribe = subscribe(
        (value) => {
          if (!isActive) return;
          window.clearTimeout(timeoutId);
          setData(value);
          setLoading(false);
        },
        (err) => {
          if (!isActive) return;
          window.clearTimeout(timeoutId);
          setError(getFriendlyLoadError(err));
          setLoading(false);
        }
      );
    } catch (err) {
      if (isActive) {
        window.clearTimeout(timeoutId);
        setError(getFriendlyLoadError(err));
        setLoading(false);
      }
    }

    return () => {
      isActive = false;
      window.clearTimeout(timeoutId);
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, []);

  return { data, loading, error };
}
