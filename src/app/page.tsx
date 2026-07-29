import { redirect } from 'next/navigation';

export default function Page() {
  // The feed answers "what has been happening?", which is the question the
  // maker opens the dashboard with.
  redirect('/activity');
}
