import { Redirect } from 'expo-router';

/** Eski adres: sıralama artık geri hareketi çalışan ayrı bir ekran (/siralama). */
export default function LeaderboardRedirect() {
  return <Redirect href="/siralama" />;
}
