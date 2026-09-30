import '../styles/globals.css';
import AppShell from '../components/AppShell';
import { AppProvider } from '../lib/client';

export default function App({ Component, pageProps }) {
  return (
    <AppProvider>
      <AppShell>
        <Component {...pageProps} />
      </AppShell>
    </AppProvider>
  );
}
