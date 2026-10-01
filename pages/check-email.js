import Link from 'next/link';
import { useRouter } from 'next/router';
import AuthLayout from '../components/AuthLayout';

const COPY = {
  confirm: ['Confirm your email', 'We sent a confirmation link to'],
  magic: ['Check your email', 'We sent a sign-in link to'],
  reset: ['Check your email', 'If there’s an account for that address, we sent a password reset link to'],
};

export default function CheckEmail() {
  const { query } = useRouter();
  const [title, lead] = COPY[query.kind] || COPY.magic;
  return (
    <AuthLayout title={title}>
      <h1>{title}</h1>
      <p style={{ margin: 0 }}>{lead} <strong>{query.email || 'your inbox'}</strong>. Open it on any device to continue.</p>
      <p className="muted small" style={{ margin: 0 }}>Nothing there after a minute? Check spam, or <Link href="/login">try again</Link>.</p>
    </AuthLayout>
  );
}

CheckEmail.layout = 'auth';
