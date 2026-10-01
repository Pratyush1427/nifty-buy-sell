import { useEffect, useState } from 'react';
import AuthLayout from './AuthLayout';

// Legal pages use the simple layout so they read the same signed in or out.
export default function LegalPage({ title, children }) {
  return (
    <AuthLayout title={title} wide>
      <article className="prose">
        <h1>{title}</h1>
        {children}
      </article>
    </AuthLayout>
  );
}

export function LastUpdated({ date }) {
  const [shown, setShown] = useState(date);
  useEffect(() => setShown(new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })), [date]);
  return <p className="muted small">Last updated {shown}</p>;
}
