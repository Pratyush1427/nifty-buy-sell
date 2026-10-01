import '../styles/globals.css';
import AppShell from '../components/AppShell';
import { AppProvider } from '../lib/client';

export default function App({ Component, pageProps }) {
  // Sign-in, onboarding and legal pages render on their own: no app shell,
  // and no app data loading before there's a signed-in user.
  if (Component.layout === 'auth') return <Component {...pageProps} />;
  return (
    <AppProvider>
      <AppShell>
        <Component {...pageProps} />
      </AppShell>
    </AppProvider>
  );
}
