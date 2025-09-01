import { useEffect, useState } from 'react';
import { fetchHome, type HomeData } from '@/lib/api/home';

export function useHomeData() {
  const [data, setData] = useState<HomeData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetchHome().then((d) => { if (alive) { setData(d); setLoading(false); }});
    return () => { alive = false; };
  }, []);

  return { data, loading };
}
