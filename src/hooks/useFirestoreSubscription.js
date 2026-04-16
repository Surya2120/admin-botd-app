import { useEffect, useState } from "react";

export function useFirestoreSubscription(subscribe, initialValue) {
  const [data, setData] = useState(initialValue);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const unsubscribe = subscribe(
      (value) => {
        setData(value);
        setLoading(false);
      },
      (err) => {
        setError(err.message || "Failed to load data.");
        setLoading(false);
      }
    );

    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, []);

  return { data, loading, error, setData };
}
