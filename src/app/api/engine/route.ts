import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyTrailChain } from '@/lib/crypto-trail';
import {
  closePositionManually,
  getOrBootEngine,
  loadPersistedState,
  runAutonomousCycle,
  updateEngineRiskConfig,
  updateEngineVoices,
} from '@/lib/engine-store';
import { RawSocialPost } from '@/lib/live-sources';
import { KOLVoice, RiskConfig } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const CustomPostSchema = z.object({
  voiceName: z.string().min(1).max(80),
  handle: z.string().min(1).max(80),
  platform: z.enum(['X', 'Telegram', 'Discord', 'ResearchRSS']).default('X'),
  text: z.string().min(4).max(2000),
  url: z.string().optional(),
  trustWeight: z.number().min(0.2).max(2.5).optional(),
});

const EngineActionSchema = z.object({
  action: z
    .enum([
      'run_cycle',
      'inject_post',
      'update_risk',
      'update_voices',
      'close_position',
      'verify_chain',
    ])
    .default('run_cycle'),
  riskConfig: z.record(z.string(), z.unknown()).optional(),
  voices: z.array(z.record(z.string(), z.unknown())).max(20).optional(),
  positionId: z.string().optional(),
  customPost: CustomPostSchema.optional(),
});

export async function GET() {
  try {
    const { state, trail, verification } = await getOrBootEngine();
    return NextResponse.json({
      ok: true,
      state,
      trailTail: trail.slice(-120).reverse(),
      totalTrailRecords: trail.length,
      verification,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : 'Engine boot failed',
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.json();
    const parsedBody = EngineActionSchema.safeParse(rawBody);
    if (!parsedBody.success) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Invalid request schema',
          issues: parsedBody.error.issues,
        },
        { status: 400 }
      );
    }

    const body = parsedBody.data;
    const action = body.action;

    if (action === 'run_cycle') {
      const { state, trail, verification } = await runAutonomousCycle();
      return NextResponse.json({
        ok: true,
        state,
        trailTail: trail.slice(-120).reverse(),
        totalTrailRecords: trail.length,
        verification,
      });
    }

    if (action === 'inject_post' && body.customPost) {
      const cp = body.customPost;
      const cleanHandle = cp.handle.trim() || 'analyst';
      const rawPost: RawSocialPost = {
        voiceId: `custom-${cleanHandle.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
        voiceName: cp.voiceName.trim() || cleanHandle,
        handle: cleanHandle,
        platform: cp.platform,
        category: 'Alpha & Narrative',
        trustWeight: Number(cp.trustWeight ?? 1.25),
        url:
          cp.url?.trim() || `https://x.com/${cleanHandle.replace(/^@/, '')}`,
        text: cp.text.trim(),
        publishedAt: new Date().toISOString(),
      };
      const { state, trail, verification } = await runAutonomousCycle([
        rawPost,
      ]);
      return NextResponse.json({
        ok: true,
        state,
        trailTail: trail.slice(-120).reverse(),
        totalTrailRecords: trail.length,
        verification,
      });
    }

    if (action === 'update_risk' && body.riskConfig) {
      const { state, trail, verification } = updateEngineRiskConfig(
        body.riskConfig as Partial<RiskConfig>
      );
      return NextResponse.json({
        ok: true,
        state,
        trailTail: trail.slice(-120).reverse(),
        totalTrailRecords: trail.length,
        verification,
      });
    }

    if (action === 'update_voices' && Array.isArray(body.voices)) {
      const { state, verification } = updateEngineVoices(
        body.voices as unknown as KOLVoice[]
      );
      const { trail } = loadPersistedState();
      return NextResponse.json({
        ok: true,
        state,
        trailTail: trail.slice(-120).reverse(),
        totalTrailRecords: trail.length,
        verification,
      });
    }

    if (action === 'close_position' && body.positionId) {
      const { state, trail, verification } = await closePositionManually(
        body.positionId
      );
      return NextResponse.json({
        ok: true,
        state,
        trailTail: trail.slice(-120).reverse(),
        totalTrailRecords: trail.length,
        verification,
      });
    }

    if (action === 'verify_chain') {
      const { state, trail } = loadPersistedState();
      const verification = {
        ...verifyTrailChain(trail),
        sqliteSynced: true,
      };
      return NextResponse.json({
        ok: true,
        state,
        trailTail: trail.slice(-120).reverse(),
        totalTrailRecords: trail.length,
        verification,
      });
    }

    return NextResponse.json(
      { ok: false, error: `Unknown action: ${action}` },
      { status: 400 }
    );
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : 'Engine action failed',
      },
      { status: 500 }
    );
  }
}
