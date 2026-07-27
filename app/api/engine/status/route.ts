import { NextResponse } from 'next/server';
import { getAutonomousCoreStatus } from '@/utils/COGNITIVE_ENGINE';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const username = searchParams.get('username') ?? undefined;
  const mode = searchParams.get('mode') ?? undefined;
  const topics = searchParams.get('topics')?.split(',').filter(Boolean) ?? [];
  const notificationCount = Number(searchParams.get('notificationCount') ?? '0');
  const recentErrors = searchParams.get('recentErrors')?.split('|').filter(Boolean) ?? [];
  const knowledgeScore = Number(searchParams.get('knowledgeScore') ?? '0');

  const status = await getAutonomousCoreStatus({
    username,
    mode,
    recentTopics: topics,
    notificationCount: Number.isFinite(notificationCount) ? notificationCount : 0,
    recentErrors,
    knowledgeScore: Number.isFinite(knowledgeScore) ? knowledgeScore : 0,
  });

  return NextResponse.json(status);
}
