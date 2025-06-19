// src/app/api/dmi/full-grid/route.ts
import { NextResponse } from 'next/server';
import { fetchFullGrid } from '@/lib/fetchFullGrid';
import { getGridFromCache, saveGridToCache } from '@/lib/memoryCache';

export async function GET() {
  let data = getGridFromCache();

  if (!data) {
    data = await fetchFullGrid();
    saveGridToCache(data);
  }

  return NextResponse.json(data);
}
