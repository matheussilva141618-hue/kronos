import { NextResponse } from 'next/server';
import { runAutonomousCore } from '@/utils/COGNITIVE_ENGINE';

export async function POST(req: Request) {
  const { searchParams } = new URL(req.url);
  const username = searchParams.get('username') ?? undefined;
  const mode = searchParams.get('mode') ?? undefined;
  const topics = searchParams.get('topics')?.split(',').filter(Boolean) ?? [];
  const notificationCount = Number(searchParams.get('notificationCount') ?? '0');
  const recentErrors = searchParams.get('recentErrors')?.split('|').filter(Boolean) ?? [];
  const knowledgeScore = Number(searchParams.get('knowledgeScore') ?? '0');

  const body = await req.json().catch(() => ({}));
  const status = await runAutonomousCore({
    username,
    mode,
    recentTopics: Array.isArray(body.recentTopics) ? body.recentTopics : topics,
    notificationCount: Number.isFinite(notificationCount) ? notificationCount : 0,
    recentErrors: Array.isArray(body.recentErrors) ? body.recentErrors : recentErrors,
    knowledgeScore: Number.isFinite(knowledgeScore) ? knowledgeScore : 0,
  });

  return NextResponse.json(status);
}
