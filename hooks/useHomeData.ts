// hooks/useHomeData.ts
import * as React from 'react';
import { fetchHome, HomeData } from '@/lib/api/home';

export function useHomeData() {
  const [data, setData] = React.useState<HomeData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<unknown>(null);

  const load = React.useCallback(async () => {
    try {
      setLoading(true);
      const d = await fetchHome();
      setData(d);
    } catch (e) {
      setError(e);
      console.error('useHomeData', e);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  return { data, loading, error, reload: load };
}
